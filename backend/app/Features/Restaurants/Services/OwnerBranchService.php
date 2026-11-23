<?php

namespace App\Features\Restaurants\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Models\User;
use App\Support\AddressService;
use App\Support\AuditLogService;
use App\Support\RestaurantBranchService;
use App\Support\WorkspaceAccessResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class OwnerBranchService
{
    public function __construct(
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
        private readonly RestaurantBranchService $branchService,
        private readonly AddressService $addressService,
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
        private readonly BranchPermitService $branchPermitService,
    ) {}

    /**
     * List all branches the authenticated owner or active staff member can access.
     *
     * @return list<array<string, mixed>>
     */
    public function listAccessibleBranches(User $user): array
    {
        $ownedIds = DB::table('restaurant_owners')
            ->where('user_id', $user->user_id)
            ->pluck('restaurant_id')
            ->map(static fn ($id): int => (int) $id)
            ->all();

        $staffIds = DB::table('restaurant_staff')
            ->where('user_id', $user->user_id)
            ->where('staff_status', 'active')
            ->pluck('restaurant_id')
            ->map(static fn ($id): int => (int) $id)
            ->all();

        $accessibleIds = array_values(array_unique(array_merge($ownedIds, $staffIds)));
        if ($accessibleIds === []) {
            return [];
        }

        $pendingCounts = DB::table('orders')
            ->whereIn('restaurant_id', $accessibleIds)
            ->where('order_status', 'pending')
            ->groupBy('restaurant_id')
            ->selectRaw('restaurant_id, COUNT(*) as pending_count')
            ->pluck('pending_count', 'restaurant_id');

        $rows = DB::table('restaurants as r')
            ->leftJoin('addresses as a', 'a.address_id', '=', 'r.address_id')
            ->leftJoin('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->leftJoin('cities as c', 'c.city_id', '=', 'b.city_id')
            ->leftJoin('branch_permits as bp', 'bp.restaurant_id', '=', 'r.restaurant_id')
            ->whereIn('r.restaurant_id', $accessibleIds)
            ->select([
                'r.restaurant_id',
                'r.parent_restaurant_id',
                'r.brand_restaurant_id',
                'r.restaurant_name',
                'r.branch_name',
                'r.restaurant_status',
                'r.is_published',
                'r.accepting_orders',
                'b.barangay_name',
                'c.city_name',
                'bp.permit_status',
                'bp.is_required_locally',
                'bp.review_note as permit_review_note',
                'bp.uploaded_at as permit_uploaded_at',
            ])
            ->orderByRaw('CASE WHEN r.parent_restaurant_id IS NULL THEN 0 ELSE 1 END ASC')
            ->orderBy('r.restaurant_id')
            ->get();

        return $rows->map(function (object $row) use ($pendingCounts, $ownedIds): array {
            $id = (int) $row->restaurant_id;
            $parentId = $row->parent_restaurant_id !== null ? (int) $row->parent_restaurant_id : null;
            $brandId = $row->brand_restaurant_id !== null ? (int) $row->brand_restaurant_id : ($parentId ?? $id);
            $shortAddress = implode(', ', array_filter([
                $row->barangay_name ? trim((string) $row->barangay_name) : null,
                $row->city_name ? trim((string) $row->city_name) : null,
            ]));

            $item = [
                'restaurant_id' => $id,
                'parent_restaurant_id' => $parentId,
                'brand_restaurant_id' => $brandId,
                'branch_name' => $row->branch_name,
                'display_name' => RestaurantBranchService::formatDisplayName((string) $row->restaurant_name, $row->branch_name),
                'is_main_branch' => $parentId === null,
                'restaurant_status' => $row->restaurant_status,
                'is_published' => (bool) $row->is_published,
                'short_address' => $shortAddress !== '' ? $shortAddress : null,
                'accepting_orders' => (bool) $row->accepting_orders,
                'pending_order_count' => (int) ($pendingCounts[$id] ?? 0),
            ];

            if ($parentId !== null && in_array($id, $ownedIds, true)) {
                $item['permit_status'] = $row->permit_status ?? BranchPermitService::STATUS_PENDING_SUBMISSION;
                $item['is_required_locally'] = $row->is_required_locally !== null ? (bool) $row->is_required_locally : true;
                $item['review_note'] = $row->permit_review_note;
                $item['uploaded_at'] = OrderTimestampFormatter::toManilaIso($row->permit_uploaded_at);
            }

            return $item;
        })->values()->all();
    }

    /**
     * Create a new branch under the owner's active root restaurant (owner-only).
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function createBranch(User $owner, array $validated, Request $request): array
    {
        $selectedRestaurant = $this->workspaceAccessResolver->requireActiveOwnedRestaurant($owner, null);
        $rootId = $selectedRestaurant->parent_restaurant_id !== null
            ? (int) $selectedRestaurant->parent_restaurant_id
            : (int) $selectedRestaurant->restaurant_id;

        $root = DB::table('restaurants')->where('restaurant_id', $rootId)->first();
        if (! $root || $root->restaurant_status !== 'active') {
            abort(403, 'Forbidden: the main (root) restaurant must be active to add a branch.');
        }

        $isOwnerOfRoot = DB::table('restaurant_owners')
            ->where('restaurant_id', $rootId)
            ->where('user_id', $owner->user_id)
            ->exists();
        if (! $isOwnerOfRoot) {
            abort(403, 'Forbidden: you do not own the main restaurant.');
        }

        $branchName = trim((string) $validated['branch_name']);
        $mainBranchName = isset($validated['main_branch_name']) ? trim((string) $validated['main_branch_name']) : '';
        $rootNeedsBranchName = $root->branch_name === null || trim((string) $root->branch_name) === '';

        if ($rootNeedsBranchName) {
            if ($mainBranchName === '') {
                throw ValidationException::withMessages([
                    'main_branch_name' => ['Main branch name is required when adding your first additional branch.'],
                ]);
            }
            if (mb_strtolower($mainBranchName) === mb_strtolower($branchName)) {
                throw ValidationException::withMessages([
                    'branch_name' => ['New branch name must be different from the main branch name.'],
                ]);
            }
        }

        $offersDelivery = array_key_exists('offers_delivery', $validated) ? (bool) $validated['offers_delivery'] : (bool) $root->offers_delivery;
        $offersPickup = array_key_exists('offers_pickup', $validated) ? (bool) $validated['offers_pickup'] : (bool) $root->offers_pickup;
        $offersDineIn = array_key_exists('offers_dine_in', $validated) ? (bool) $validated['offers_dine_in'] : (bool) $root->offers_dine_in;
        $acceptsReservations = array_key_exists('accepts_reservations', $validated) ? (bool) $validated['accepts_reservations'] : (bool) $root->accepts_reservations;

        if (! $offersDelivery && ! $offersPickup && ! $offersDineIn) {
            throw ValidationException::withMessages([
                'offers_delivery' => ['At least one service option (delivery, pickup, or dine-in) must be enabled.'],
            ]);
        }

        $copyHours = array_key_exists('copy_operating_hours', $validated) ? (bool) $validated['copy_operating_hours'] : true;
        $copyMenu = array_key_exists('copy_menu', $validated) ? (bool) $validated['copy_menu'] : true;
        $copyFromId = isset($validated['copy_from_restaurant_id']) ? (int) $validated['copy_from_restaurant_id'] : $rootId;
        $brandId = (int) ($root->brand_restaurant_id ?: $root->restaurant_id);

        if ($copyFromId !== $rootId) {
            $sourceRow = DB::table('restaurants')
                ->where('restaurant_id', $copyFromId)
                ->first(['restaurant_id', 'brand_restaurant_id']);
            if (! $sourceRow || (int) $sourceRow->brand_restaurant_id !== $brandId) {
                throw ValidationException::withMessages([
                    'copy_from_restaurant_id' => ['Selected source branch does not belong to this business.'],
                ]);
            }
        }

        $permitFile = $request->file('mayors_permit');
        $permitInput = $this->branchPermitService->validateInitialPermitInput($permitFile, $validated);
        $storedPermit = null;
        $newlyStoredPath = null;

        try {
            if ($permitInput['mode'] === 'file' && $permitFile !== null) {
                $storedPermit = $this->branchPermitService->storePermitFile($permitFile, $brandId, 'mayors_permit', [
                    'application_id' => (int) (DB::table('restaurant_applications')->where('restaurant_id', $brandId)->value('restaurant_application_id') ?? $brandId),
                    'owner_name' => trim(((string) ($owner->first_name ?? '')).' '.((string) ($owner->last_name ?? ''))) ?: 'Owner',
                    'restaurant_name' => (string) $root->restaurant_name,
                    'branch_name' => $branchName,
                    'application_branch_id' => $brandId,
                ]);
                $newlyStoredPath = $storedPermit['path'] ?? null;
            }

            $newBranchId = (int) DB::transaction(function () use (
                $owner,
                $root,
                $rootId,
                $brandId,
                $rootNeedsBranchName,
                $mainBranchName,
                $branchName,
                $validated,
                $offersDelivery,
                $offersPickup,
                $offersDineIn,
                $acceptsReservations,
                $copyHours,
                $copyMenu,
                $copyFromId,
                $permitInput,
                $storedPermit,
                $request,
            ): int {
            $now = now();

            if ($rootNeedsBranchName) {
                DB::table('restaurants')
                    ->where('restaurant_id', $rootId)
                    ->update([
                        'branch_name' => $mainBranchName,
                        'updated_at' => $now,
                    ]);
            }

            $addressId = $this->addressService->createAddress([
                'province' => $validated['province'],
                'city' => $validated['city'],
                'barangay' => $validated['barangay'],
                'street' => $validated['street'] ?? null,
                'house_number' => $validated['house_number'] ?? null,
                'building_name' => $validated['building_name'] ?? null,
                'landmark' => $validated['landmark'] ?? null,
                'postal_code' => $validated['postal_code'] ?? null,
                'latitude' => $validated['latitude'] ?? null,
                'longitude' => $validated['longitude'] ?? null,
            ]);

            $contactPhone = isset($validated['contact_phone']) && trim((string) $validated['contact_phone']) !== ''
                ? trim((string) $validated['contact_phone'])
                : $root->contact_phone;

            $childId = $this->branchService->createChildBranch($rootId, [
                'restaurant_name' => $root->restaurant_name,
                'registered_name' => $root->registered_name,
                'branch_name' => $branchName,
                'business_type' => $root->business_type,
                'ownership_structure' => $root->ownership_structure,
                'description' => $root->description,
                'contact_phone' => $contactPhone,
                'business_email' => $root->business_email,
                'address_id' => $addressId,
                'logo_image' => $root->logo_image,
                'cover_image' => $root->cover_image,
                'delivery_radius' => $root->delivery_radius,
                'offers_delivery' => $offersDelivery ? 1 : 0,
                'offers_pickup' => $offersPickup ? 1 : 0,
                'offers_dine_in' => $offersDineIn ? 1 : 0,
                'accepts_reservations' => $acceptsReservations ? 1 : 0,
                'accepting_orders' => 1,
                'accepting_reservations' => $acceptsReservations ? 1 : 0,
                'inventory_deduction_mode' => $root->inventory_deduction_mode,
                'reservation_min_notice_hours' => $root->reservation_min_notice_hours,
                'reservation_max_party_size' => $root->reservation_max_party_size,
                'reservation_notes' => $root->reservation_notes,
                'restaurant_status' => 'active',
                'is_published' => 0,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            // Copy restaurant_category_map from root
            $categoryIds = DB::table('restaurant_category_map')
                ->where('restaurant_id', $rootId)
                ->pluck('category_id');
            foreach ($categoryIds as $categoryId) {
                DB::table('restaurant_category_map')->insertOrIgnore([
                    'restaurant_id' => $childId,
                    'category_id' => (int) $categoryId,
                ]);
            }

            if ($copyHours) {
                $hours = DB::table('operating_hours')
                    ->where('restaurant_id', $copyFromId)
                    ->orderBy('day_of_week')
                    ->get();
                foreach ($hours as $hour) {
                    DB::table('operating_hours')->insert([
                        'restaurant_id' => $childId,
                        'day_of_week' => (int) $hour->day_of_week,
                        'opening_time' => $hour->opening_time,
                        'closing_time' => $hour->closing_time,
                        'closes_next_day' => (int) ($hour->closes_next_day ?? 0),
                        'is_closed' => (int) $hour->is_closed,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }

            if ($copyMenu) {
                $this->branchService->cloneMenuAsUnpublishedApproved($copyFromId, $childId, $now);
            }

            if ($permitInput['mode'] !== 'none') {
                $permitId = (int) DB::table('branch_permits')
                    ->where('restaurant_id', $childId)
                    ->value('permit_id');

                $permitUpdate = [
                    'is_required_locally' => $permitInput['mode'] === 'file' ? 1 : 0,
                    'exemption_reason' => $permitInput['exemption_reason'],
                    'permit_status' => BranchPermitService::STATUS_PENDING_REVIEW,
                    'uploaded_by' => $owner->user_id,
                    'uploaded_at' => $now,
                    'updated_at' => $now,
                ];
                if ($storedPermit !== null) {
                    $permitUpdate['file_path'] = $storedPermit['path'];
                    $permitUpdate['original_filename'] = $storedPermit['original_filename'];
                    $permitUpdate['mime_type'] = $storedPermit['mime_type'];
                    $permitUpdate['file_size_bytes'] = $storedPermit['size_bytes'];
                }

                DB::table('branch_permits')->where('permit_id', $permitId)->update($permitUpdate);

                $this->auditLogService->record(
                    actorUserId: (int) $owner->user_id,
                    action: 'branch_permit_submitted',
                    entityType: 'branch_permits',
                    entityId: $permitId,
                    newValues: [
                        'restaurant_id' => $childId,
                        'permit_status' => BranchPermitService::STATUS_PENDING_REVIEW,
                        'is_required_locally' => $permitInput['mode'] === 'file',
                        'exemption_reason' => $permitInput['exemption_reason'],
                        'file_path' => $storedPermit['path'] ?? null,
                    ],
                    request: $request,
                );
            }

            $this->auditLogService->record(
                actorUserId: (int) $owner->user_id,
                action: 'restaurant_branch_created',
                entityType: 'restaurants',
                entityId: $childId,
                newValues: [
                    'restaurant_id' => $childId,
                    'parent_restaurant_id' => $rootId,
                    'brand_restaurant_id' => $brandId,
                    'branch_name' => $branchName,
                    'restaurant_status' => 'active',
                    'is_published' => false,
                ],
                reason: "Owner added branch \"{$branchName}\"",
                request: $request,
            );

            $adminIds = $this->notificationService->resolveActiveAdminUserIds((int) $owner->user_id);
            if ($adminIds !== []) {
                $this->notificationService->notifyUsers(
                    userIds: $adminIds,
                    workspace: 'admin',
                    type: 'restaurant_branch_created',
                    title: 'New restaurant branch added',
                    body: "{$root->restaurant_name} added a new branch: {$branchName}.",
                    relatedEntityType: 'restaurants',
                    relatedEntityId: $childId,
                );

                if ($permitInput['mode'] !== 'none') {
                    $permitId = (int) DB::table('branch_permits')
                        ->where('restaurant_id', $childId)
                        ->value('permit_id');
                    $this->notificationService->notifyUsers(
                        userIds: $adminIds,
                        workspace: 'admin',
                        type: 'branch_permit_submitted',
                        title: 'Branch permit submitted for review',
                        body: "{$root->restaurant_name} — {$branchName} submitted a Mayor's / Business Permit for review.",
                        relatedEntityType: 'branch_permits',
                        relatedEntityId: $permitId,
                    );
                }
            }

            return $childId;
        });
        } catch (\Throwable $e) {
            if ($newlyStoredPath !== null && $newlyStoredPath !== '') {
                Storage::disk('local')->delete($newlyStoredPath);
            }
            throw $e;
        }

        $branches = $this->listAccessibleBranches($owner);
        foreach ($branches as $branch) {
            if ((int) $branch['restaurant_id'] === $newBranchId) {
                return $branch;
            }
        }

        return [
            'restaurant_id' => $newBranchId,
            'parent_restaurant_id' => $rootId,
            'brand_restaurant_id' => $brandId,
            'branch_name' => $branchName,
            'display_name' => RestaurantBranchService::formatDisplayName((string) $root->restaurant_name, $branchName),
            'is_main_branch' => false,
            'restaurant_status' => 'active',
            'is_published' => false,
            'accepting_orders' => true,
            'pending_order_count' => 0,
        ];
    }
}
