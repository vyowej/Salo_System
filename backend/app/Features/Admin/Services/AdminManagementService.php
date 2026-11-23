<?php

namespace App\Features\Admin\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Riders\Services\RiderService;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\FileStorageService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AdminManagementService
{
    public function __construct(
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
        private readonly FileStorageService $fileStorageService,
        private readonly RiderService $riderService,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listUsers(array $filters): array
    {
        $perPage = $this->resolvePerPage($filters);
        $search = trim((string) ($filters['search'] ?? ''));
        $role = trim((string) ($filters['role'] ?? ''));
        $status = trim((string) ($filters['status'] ?? ''));
        $sortDir = $this->resolveSortDirection($filters);

        $query = DB::table('users')
            ->select([
                'user_id', 'username', 'first_name', 'middle_initial', 'last_name',
                'email', 'phone_number', 'user_role', 'account_status',
                'email_verified_at', 'created_at', 'updated_at',
            ]);

        $this->applyLikeSearch($query, $search, ['username', 'first_name', 'last_name', 'email']);

        if ($role !== '' && $role !== 'all') {
            $query->where('user_role', $role);
        }

        if ($status !== '' && $status !== 'all') {
            $query->where('account_status', $status);
        }

        $paginator = $query->orderBy('created_at', $sortDir)->paginate($perPage);
        $items = $paginator->items();
        $userIds = array_map(static fn (object $row): int => (int) $row->user_id, $items);

        $orderCounts = $userIds === []
            ? collect()
            : DB::table('orders')->whereIn('customer_id', $userIds)->selectRaw('customer_id, COUNT(*) as cnt')->groupBy('customer_id')->pluck('cnt', 'customer_id');
        $resCounts = $userIds === []
            ? collect()
            : DB::table('reservations')->whereIn('customer_id', $userIds)->selectRaw('customer_id, COUNT(*) as cnt')->groupBy('customer_id')->pluck('cnt', 'customer_id');
        $ownerIds = $userIds === []
            ? collect()
            : DB::table('restaurant_owners')->whereIn('user_id', $userIds)->distinct()->pluck('user_id')->flip();
        $staffIds = $userIds === []
            ? collect()
            : DB::table('restaurant_staff')->whereIn('user_id', $userIds)->where('staff_status', 'active')->distinct()->pluck('user_id')->flip();
        $riderIds = $userIds === []
            ? collect()
            : DB::table('riders')->whereIn('user_id', $userIds)->whereIn('rider_status', ['active', 'approved'])->distinct()->pluck('user_id')->flip();

        foreach ($items as $item) {
            $uid = (int) $item->user_id;
            $item->orders_count = (int) ($orderCounts->get($uid) ?? 0);
            $item->reservations_count = (int) ($resCounts->get($uid) ?? 0);
            $caps = [$item->user_role === 'admin' ? 'Admin' : 'Customer'];
            if ($ownerIds->has($uid)) {
                $caps[] = 'Restaurant Owner';
            }
            if ($staffIds->has($uid)) {
                $caps[] = 'Restaurant Staff';
            }
            if ($riderIds->has($uid)) {
                $caps[] = 'Rider';
            }
            $item->capabilities = $caps;
        }

        return $this->formatPaginatedResult($paginator, $items);
    }

    /**
     * Return live platform-wide KPIs and pending operational queues for AdminDashboard.
     *
     * @return array<string, mixed>
     */
    public function getDashboardMetrics(): array
    {
        $today = now()->toDateString();

        $userStats = DB::table('users')
            ->selectRaw("COUNT(*) as total, SUM(CASE WHEN account_status = 'active' THEN 1 ELSE 0 END) as active")
            ->first();

        $restaurantStats = DB::table('restaurants')
            ->selectRaw("COUNT(*) as total, SUM(CASE WHEN restaurant_status = 'active' THEN 1 ELSE 0 END) as active")
            ->first();

        $riderStats = DB::table('riders')
            ->selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN rider_status = 'active' THEN 1 ELSE 0 END) as active
            ")
            ->first();

        $activeRiderIds = DB::table('riders')->where('rider_status', 'active')->pluck('rider_id');
        $onlineRidersCount = 0;
        foreach ($activeRiderIds as $rid) {
            if ($this->riderService->isOnline((int) $rid)) {
                $onlineRidersCount++;
            }
        }

        $orderStats = DB::table('orders')
            ->selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN DATE(placed_at) = ? THEN 1 ELSE 0 END) as today,
                SUM(CASE WHEN order_status IN ('pending','accepted','preparing','ready','out_for_delivery') THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN order_status IN ('delivered','completed') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN order_status = 'failed' THEN 1 ELSE 0 END) as failed,
                COALESCE(SUM(CASE WHEN order_status NOT IN ('cancelled','rejected','failed') THEN total_amount ELSE 0 END), 0) as gmv_total
            ", [$today])
            ->first();

        $resStats = DB::table('reservations')
            ->selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN reservation_status IN ('pending','confirmed','arrived','seated') THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN reservation_status = 'completed' THEN 1 ELSE 0 END) as completed
            ")
            ->first();

        $pendingAppsRestaurant = (int) DB::table('restaurant_applications')
            ->whereIn('application_status', ['submitted', 'pending_review', 'under_review', 'resubmitted'])
            ->count();
        $pendingAppsRider = (int) DB::table('rider_applications')
            ->whereIn('application_status', ['submitted', 'pending_review', 'under_review', 'resubmitted'])
            ->count();
        $pendingPermits = (int) DB::table('branch_permits')
            ->whereIn('permit_status', ['submitted', 'under_review'])
            ->count();
        $codSubmitted = (int) DB::table('deliveries')
            ->where('delivery_status', 'delivered')
            ->where('cod_remittance_status', 'submitted')
            ->count();

        return [
            'users' => [
                'total' => (int) ($userStats->total ?? 0),
                'active' => (int) ($userStats->active ?? 0),
            ],
            'restaurants' => [
                'total' => (int) ($restaurantStats->total ?? 0),
                'active' => (int) ($restaurantStats->active ?? 0),
            ],
            'riders' => [
                'total' => (int) ($riderStats->total ?? 0),
                'active' => (int) ($riderStats->active ?? 0),
                'online' => $onlineRidersCount,
            ],
            'orders' => [
                'total' => (int) ($orderStats->total ?? 0),
                'today' => (int) ($orderStats->today ?? 0),
                'active' => (int) ($orderStats->active ?? 0),
                'completed' => (int) ($orderStats->completed ?? 0),
                'failed' => (int) ($orderStats->failed ?? 0),
                'gmv_total' => round((float) ($orderStats->gmv_total ?? 0), 2),
            ],
            'reservations' => [
                'total' => (int) ($resStats->total ?? 0),
                'active' => (int) ($resStats->active ?? 0),
                'completed' => (int) ($resStats->completed ?? 0),
            ],
            'pending_queues' => [
                'restaurant_applications' => $pendingAppsRestaurant,
                'rider_applications' => $pendingAppsRider,
                'branch_permits' => $pendingPermits,
                'failed_deliveries' => (int) ($orderStats->failed ?? 0),
                'cod_submitted' => $codSubmitted,
            ],
        ];
    }

    /**
     * Return recent orders and reservations for a specific user account.
     *
     * @return array<string, mixed>
     */
    public function getUserActivity(int $userId): array
    {
        User::query()->findOrFail($userId);

        $orders = DB::table('orders')
            ->where('customer_id', $userId)
            ->select(['order_id', 'order_reference', 'restaurant_name', 'total_amount', 'order_status', 'placed_at'])
            ->orderByDesc('placed_at')
            ->limit(25)
            ->get()
            ->map(static fn (object $o): array => [
                'order_id' => (int) $o->order_id,
                'order_reference' => $o->order_reference,
                'restaurant_name' => $o->restaurant_name,
                'total_amount' => (float) $o->total_amount,
                'order_status' => $o->order_status,
                'placed_at' => $o->placed_at,
            ])
            ->all();

        $reservations = DB::table('reservations as res')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'res.restaurant_id')
            ->where('res.customer_id', $userId)
            ->select([
                'res.reservation_id', 'res.reservation_reference', 'r.restaurant_name',
                'res.number_of_guests', 'res.reservation_start', 'res.deposit_amount', 'res.reservation_status',
            ])
            ->orderByDesc('res.reservation_start')
            ->limit(25)
            ->get()
            ->map(static fn (object $row): array => [
                'reservation_id' => (int) $row->reservation_id,
                'reservation_reference' => $row->reservation_reference,
                'restaurant_name' => $row->restaurant_name,
                'party_size' => (int) $row->number_of_guests,
                'reservation_start' => $row->reservation_start,
                'deposit_amount' => (float) $row->deposit_amount,
                'reservation_status' => $row->reservation_status,
            ])
            ->all();

        return [
            'orders' => $orders,
            'reservations' => $reservations,
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function createUser(array $data, User $admin, Request $request): array
    {
        $user = DB::transaction(function () use ($data, $admin, $request): User {
            $created = User::forceCreate([
                'username' => trim((string) $data['username']),
                'first_name' => trim((string) $data['first_name']),
                'middle_initial' => ! empty($data['middle_initial']) ? strtoupper(trim((string) $data['middle_initial'])) : null,
                'last_name' => trim((string) $data['last_name']),
                'email' => strtolower(trim((string) $data['email'])),
                'phone_number' => ! empty($data['phone_number']) ? trim((string) $data['phone_number']) : null,
                'password_hash' => Hash::make((string) $data['password']),
                'user_role' => $data['user_role'] ?? 'customer',
                'account_status' => $data['account_status'] ?? 'active',
            ]);

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: 'admin_user_created',
                entityType: 'users',
                entityId: $created->user_id,
                newValues: [
                    'email' => $created->email,
                    'user_role' => $created->user_role,
                    'account_status' => $created->account_status,
                ],
                request: $request,
            );

            return $created;
        });

        return $user->only([
            'user_id',
            'username',
            'first_name',
            'middle_initial',
            'last_name',
            'email',
            'phone_number',
            'user_role',
            'account_status',
            'created_at',
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function updateUser(int $userId, array $data, User $admin, Request $request): array
    {
        $user = User::query()->findOrFail($userId);
        $oldValues = $user->only(['first_name', 'last_name', 'phone_number', 'user_role', 'account_status']);

        $updates = [];
        foreach (['first_name', 'last_name', 'phone_number', 'user_role', 'account_status'] as $field) {
            if (array_key_exists($field, $data)) {
                $updates[$field] = $data[$field];
            }
        }

        if ((int) $user->user_id === (int) $admin->user_id) {
            if (array_key_exists('user_role', $updates) && $updates['user_role'] !== $user->user_role) {
                throw ValidationException::withMessages([
                    'user_role' => ['Administrators cannot change or demote their own role.'],
                ]);
            }

            if (array_key_exists('account_status', $updates) && $updates['account_status'] !== 'active') {
                throw ValidationException::withMessages([
                    'account_status' => ['Administrators cannot suspend or deactivate their own account.'],
                ]);
            }
        }

        if ($updates !== []) {
            DB::transaction(function () use ($user, $updates, $oldValues, $data, $admin, $request): void {
                $user->forceFill($updates)->save();

                $this->auditLogService->record(
                    actorUserId: (int) $admin->user_id,
                    action: 'admin_user_updated',
                    entityType: 'users',
                    entityId: $user->user_id,
                    oldValues: $oldValues,
                    newValues: $updates,
                    reason: $data['reason'] ?? null,
                    request: $request,
                );
            });
        }

        return $user->fresh()->only([
            'user_id',
            'username',
            'first_name',
            'middle_initial',
            'last_name',
            'email',
            'phone_number',
            'user_role',
            'account_status',
            'updated_at',
        ]);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listRestaurants(array $filters): array
    {
        $perPage = $this->resolvePerPage($filters);
        $search = trim((string) ($filters['search'] ?? ''));
        $status = trim((string) ($filters['status'] ?? ''));
        $sortDir = $this->resolveSortDirection($filters);

        $query = DB::table('restaurants as rest')
            ->join('addresses as addr', 'addr.address_id', '=', 'rest.address_id')
            ->join('barangays as brgy', 'brgy.barangay_id', '=', 'addr.barangay_id')
            ->join('cities as c', 'c.city_id', '=', 'brgy.city_id')
            ->leftJoin('restaurant_applications as ra', 'ra.restaurant_id', '=', 'rest.restaurant_id')
            ->leftJoin('branch_permits as bp', 'bp.restaurant_id', '=', 'rest.restaurant_id')
            ->select([
                'rest.restaurant_id', 'rest.restaurant_name', 'rest.registered_name',
                'rest.parent_restaurant_id', 'rest.brand_restaurant_id', 'rest.branch_name',
                'rest.business_type', 'rest.ownership_structure', 'rest.contact_phone',
                'rest.business_email', 'rest.logo_image', 'rest.cover_image',
                'rest.offers_delivery', 'rest.offers_pickup', 'rest.offers_dine_in',
                'rest.accepts_reservations', 'rest.restaurant_status', 'rest.is_published', 'rest.last_published_at', 'rest.created_at',
                'addr.street', 'brgy.barangay_name', 'c.city_name as zone',
                'ra.restaurant_application_id', 'ra.reference_number', 'ra.application_status',
                'bp.permit_status as branch_permit_status',
                'bp.is_required_locally as branch_is_required_locally',
            ]);

        $this->applyLikeSearch($query, $search, [
            'rest.restaurant_name', 'rest.branch_name', 'rest.business_email', 'c.city_name', 'ra.reference_number',
        ]);

        if ($status !== '' && $status !== 'all') {
            $query->where('rest.restaurant_status', $status);
        }

        $paginator = $query->orderBy('rest.created_at', $sortDir)->paginate($perPage);
        $items = $paginator->items();
        $brandIds = collect($items)
            ->map(fn (object $item): int => (int) ($item->brand_restaurant_id ?? $item->restaurant_id))
            ->unique()
            ->values()
            ->all();
        $branchCounts = $brandIds === []
            ? collect()
            : DB::table('restaurants')
                ->whereIn('brand_restaurant_id', $brandIds)
                ->selectRaw('brand_restaurant_id, COUNT(*) as total')
                ->groupBy('brand_restaurant_id')
                ->pluck('total', 'brand_restaurant_id');

        $rootAppIds = collect($items)
            ->filter(fn (object $item): bool => $item->parent_restaurant_id === null && $item->restaurant_application_id !== null)
            ->map(fn (object $item): int => (int) $item->restaurant_application_id)
            ->unique()
            ->values()
            ->all();

        $rootDocsByAppId = $rootAppIds === []
            ? collect()
            : DB::table('application_documents')
                ->whereIn('restaurant_application_id', $rootAppIds)
                ->where('document_code', 'mayors_permit')
                ->orderByDesc('document_id')
                ->get(['restaurant_application_id', 'document_status'])
                ->unique('restaurant_application_id')
                ->keyBy('restaurant_application_id');

        foreach ($items as $item) {
            $brandId = (int) ($item->brand_restaurant_id ?? $item->restaurant_id);
            $item->brand_restaurant_id = $brandId;
            $item->parent_restaurant_id = $item->parent_restaurant_id !== null ? (int) $item->parent_restaurant_id : null;
            $item->is_main_branch = $item->parent_restaurant_id === null;
            $item->branch_count = max(1, (int) ($branchCounts->get($brandId) ?? 1));
            $item->logo_image = $this->fileStorageService->publicUrl($item->logo_image);
            $item->cover_image = $this->fileStorageService->publicUrl($item->cover_image);

            if ($item->is_main_branch) {
                $doc = $item->restaurant_application_id !== null
                    ? $rootDocsByAppId->get((int) $item->restaurant_application_id)
                    : null;
                $item->permit_status = match ($doc?->document_status) {
                    'verified' => 'approved',
                    'rejected' => 'rejected',
                    'pending' => 'pending_review',
                    'under_review' => 'under_review',
                    default => 'not_submitted',
                };
                $item->is_required_locally = true;
            } else {
                $item->permit_status = $item->branch_permit_status ?? 'pending_submission';
                $item->is_required_locally = $item->branch_is_required_locally !== null
                    ? (bool) $item->branch_is_required_locally
                    : true;
            }

            unset($item->branch_permit_status, $item->branch_is_required_locally);
        }
        $this->attachPrimaryOwnersToRestaurants($items);

        return $this->formatPaginatedResult($paginator, $items);
    }

    /**
     * @return array<string, mixed>
     */
    public function updateRestaurantStatus(
        int $restaurantId,
        string $status,
        ?string $reason,
        User $admin,
        Request $request,
        bool $applyToAllBranches = false,
    ): array {
        $restaurant = DB::table('restaurants')->where('restaurant_id', $restaurantId)->first();
        abort_unless($restaurant !== null, 404, 'Restaurant not found.');

        if ($applyToAllBranches && $restaurant->parent_restaurant_id !== null) {
            throw ValidationException::withMessages([
                'apply_to_all_branches' => ['apply_to_all_branches can only be used on the main (root) branch.'],
            ]);
        }

        $affectedIds = DB::transaction(function () use ($restaurantId, $restaurant, $status, $reason, $admin, $request, $applyToAllBranches): array {
            $targets = $applyToAllBranches
                ? DB::table('restaurants')
                    ->where('brand_restaurant_id', (int) ($restaurant->brand_restaurant_id ?? $restaurantId))
                    ->orderBy('restaurant_id')
                    ->get(['restaurant_id', 'restaurant_status'])
                : collect([(object) ['restaurant_id' => $restaurantId, 'restaurant_status' => $restaurant->restaurant_status]]);

            $now = now();
            $targetIds = $targets->pluck('restaurant_id')->map(fn ($id): int => (int) $id)->all();

            DB::table('restaurants')->whereIn('restaurant_id', $targetIds)->update([
                'restaurant_status' => $status,
                'updated_at' => $now,
            ]);

            foreach ($targets as $target) {
                $this->auditLogService->record(
                    actorUserId: (int) $admin->user_id,
                    action: 'admin_restaurant_status_updated',
                    entityType: 'restaurants',
                    entityId: (int) $target->restaurant_id,
                    oldValues: ['restaurant_status' => $target->restaurant_status],
                    newValues: ['restaurant_status' => $status, 'apply_to_all_branches' => $applyToAllBranches],
                    reason: $reason,
                    request: $request,
                );
            }

            return $targetIds;
        });

        $updated = (array) DB::table('restaurants')->where('restaurant_id', $restaurantId)->first();
        $updated['affected_restaurant_ids'] = $affectedIds;

        return $updated;
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listRiders(array $filters): array
    {
        $perPage = $this->resolvePerPage($filters);
        $search = trim((string) ($filters['search'] ?? ''));
        $status = trim((string) ($filters['status'] ?? ''));
        $sortDir = $this->resolveSortDirection($filters);

        $query = DB::table('riders as r')
            ->join('users as u', 'u.user_id', '=', 'r.user_id')
            ->join('cities as c', 'c.city_id', '=', 'r.base_city_id')
            ->select([
                'r.rider_id', 'r.user_id', 'r.vehicle_type', 'r.vehicle_brand',
                'r.vehicle_model', 'r.vehicle_color', 'r.plate_number',
                'r.preferred_shifts', 'r.available_days', 'r.emergency_contact_name',
                'r.emergency_contact_phone', 'r.rider_status', 'r.approved_at',
                'r.created_at', 'u.first_name', 'u.last_name', 'u.username',
                'u.email', 'u.phone_number', 'c.city_name as zone',
            ]);

        $this->applyLikeSearch($query, $search, [
            'u.first_name', 'u.last_name', 'u.email', 'r.plate_number', 'c.city_name',
        ]);

        if ($status !== '' && $status !== 'all') {
            $query->where('r.rider_status', $status);
        }

        $paginator = $query->orderBy('r.created_at', $sortDir)->paginate($perPage);
        $items = $paginator->items();
        $riderIds = array_map(static fn (object $row): int => (int) $row->rider_id, $items);

        $activeDeliveries = $riderIds === []
            ? collect()
            : DB::table('deliveries')
                ->whereIn('rider_id', $riderIds)
                ->whereIn('delivery_status', ['accepted', 'picked_up'])
                ->distinct()
                ->pluck('rider_id')
                ->flip();

        $codPending = $riderIds === []
            ? collect()
            : DB::table('deliveries')
                ->whereIn('rider_id', $riderIds)
                ->where('delivery_status', 'delivered')
                ->whereIn('cod_remittance_status', ['pending', 'discrepancy'])
                ->selectRaw('rider_id, COALESCE(SUM(cod_amount_collected), 0) as total_cod')
                ->groupBy('rider_id')
                ->pluck('total_cod', 'rider_id');

        foreach ($items as $item) {
            $rid = (int) $item->rider_id;
            $item->is_online = $this->riderService->isOnline($rid);
            $item->on_delivery = $activeDeliveries->has($rid);
            $item->cod_pending_amount = round((float) ($codPending->get($rid) ?? 0), 2);
        }

        $result = $this->formatPaginatedResult($paginator, $items);
        $result['operations_summary'] = [
            'unassigned_ready_orders' => (int) DB::table('orders as o')
                ->leftJoin('deliveries as d', 'd.order_id', '=', 'o.order_id')
                ->where('o.order_type', 'delivery')
                ->where('o.order_status', 'ready')
                ->where(function ($sub): void {
                    $sub->whereNull('d.delivery_id')
                        ->orWhere(function ($u): void {
                            $u->whereNull('d.rider_id')
                                ->whereIn('d.delivery_status', ['pending_assignment', 'offered']);
                        });
                })
                ->count(),
        ];

        return $result;
    }

    /**
     * @return array<string, mixed>
     */
    public function updateRiderStatus(int $riderId, string $status, ?string $reason, User $admin, Request $request): array
    {
        if ($status === 'active') {
            abort(422, 'Use POST /api/admin/riders/{id}/activate to activate an approved rider.');
        }

        $rider = DB::table('riders')->where('rider_id', $riderId)->first();
        abort_unless($rider !== null, 404, 'Rider not found.');

        DB::transaction(function () use ($riderId, $rider, $status, $reason, $admin, $request): void {
            $updates = [
                'rider_status' => $status,
                'updated_at' => now(),
            ];

            DB::table('riders')->where('rider_id', $riderId)->update($updates);

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: 'admin_rider_status_updated',
                entityType: 'riders',
                entityId: $riderId,
                oldValues: ['rider_status' => $rider->rider_status],
                newValues: ['rider_status' => $status],
                reason: $reason,
                request: $request,
            );
        });

        return (array) DB::table('riders')->where('rider_id', $riderId)->first();
    }

    /**
     * Activate an approved rider (admin only, blocks self-activation, 409 if not approved).
     *
     * @return array<string, mixed>
     */
    public function activateRider(int $riderId, User $admin, Request $request): array
    {
        DB::transaction(function () use ($riderId, $admin, $request): void {
            $rider = DB::table('riders')
                ->where('rider_id', $riderId)
                ->lockForUpdate()
                ->first();

            abort_unless($rider !== null, 404, 'Rider not found.');

            if ((int) $rider->user_id === (int) $admin->user_id) {
                abort(403, 'Forbidden: admins cannot activate their own rider account.');
            }

            if ($rider->rider_status !== 'approved') {
                throw new \Symfony\Component\HttpKernel\Exception\ConflictHttpException(
                    "Only approved riders can be activated (current status: {$rider->rider_status})."
                );
            }

            $now = now();
            DB::table('riders')
                ->where('rider_id', $riderId)
                ->update([
                    'rider_status' => 'active',
                    'updated_at' => $now,
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: 'admin_rider_activated',
                entityType: 'riders',
                entityId: $riderId,
                oldValues: ['rider_status' => 'approved'],
                newValues: ['rider_status' => 'active'],
                request: $request,
            );

            $this->notificationService->notifyUser(
                userId: (int) $rider->user_id,
                workspace: 'rider',
                type: 'rider_activated',
                title: 'Rider account activated',
                body: 'Your rider account has been activated. You can now go online and accept deliveries.',
                relatedEntityType: 'rider',
                relatedEntityId: $riderId,
            );
        });

        return (array) DB::table('riders')->where('rider_id', $riderId)->first();
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listAuditLogs(array $filters): array
    {
        $perPage = $this->resolvePerPage($filters, 20);
        $search = trim((string) ($filters['search'] ?? ''));
        $entityType = trim((string) ($filters['entity_type'] ?? ''));

        $query = DB::table('audit_logs as al')
            ->leftJoin('users as u', 'u.user_id', '=', 'al.actor_user_id')
            ->select([
                'al.log_id', 'al.actor_user_id', 'al.action', 'al.entity_type',
                'al.entity_id', 'al.old_values', 'al.new_values', 'al.reason',
                'al.ip_address', 'al.created_at', 'u.first_name', 'u.last_name',
                'u.email as actor_email',
            ]);

        $this->applyLikeSearch($query, $search, [
            'al.action', 'al.entity_type', 'al.entity_id', 'al.reason', 'u.email',
        ]);

        if ($entityType !== '' && $entityType !== 'all') {
            $query->where('al.entity_type', $entityType);
        }

        $paginator = $query->orderByDesc('al.log_id')->paginate($perPage);

        return $this->formatPaginatedResult($paginator);
    }

    /**
     * @param  array<int, object>  $items
     */
    private function attachPrimaryOwnersToRestaurants(array $items): void
    {
        $restaurantIds = array_map(static fn (object $row): int => (int) $row->restaurant_id, $items);
        if ($restaurantIds === []) {
            return;
        }

        $ownerRows = DB::table('restaurant_owners as ro2')
            ->join('users as u2', 'u2.user_id', '=', 'ro2.user_id')
            ->whereIn('ro2.restaurant_id', $restaurantIds)
            ->orderBy('ro2.joined_at', 'asc')
            ->orderBy('ro2.user_id', 'asc')
            ->select([
                'ro2.restaurant_id',
                DB::raw("CONCAT(u2.first_name, ' ', u2.last_name) as owner_name"),
                'u2.email as owner_email',
            ])
            ->get();

        $ownersByRestaurant = [];
        foreach ($ownerRows as $oRow) {
            $rId = (int) $oRow->restaurant_id;
            if (! isset($ownersByRestaurant[$rId])) {
                $ownersByRestaurant[$rId] = $oRow;
            }
        }

        foreach ($items as $item) {
            $owner = $ownersByRestaurant[(int) $item->restaurant_id] ?? null;
            $item->owner_name = $owner?->owner_name ?? null;
            $item->owner_email = $owner?->owner_email ?? null;
        }
    }

    /**
     * @param  array<int, string>  $columns
     */
    private function applyLikeSearch(Builder $query, string $search, array $columns): void
    {
        if ($search === '') {
            return;
        }

        $like = "%{$search}%";
        $query->where(function ($q) use ($like, $columns): void {
            foreach ($columns as $idx => $column) {
                $idx === 0 ? $q->where($column, 'like', $like) : $q->orWhere($column, 'like', $like);
            }
        });
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    private function resolvePerPage(array $filters, int $default = 15): int
    {
        return max(1, min(100, (int) ($filters['per_page'] ?? $default)));
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    private function resolveSortDirection(array $filters): string
    {
        return strtolower((string) ($filters['direction'] ?? 'desc')) === 'asc' ? 'asc' : 'desc';
    }

    /**
     * @param  array<int, mixed>|null  $items
     * @return array<string, mixed>
     */
    private function formatPaginatedResult(LengthAwarePaginator $paginator, ?array $items = null): array
    {
        return [
            'items' => $items ?? $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ];
    }
}
