<?php

namespace App\Features\Admin\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Models\User;
use App\Support\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AdminManagementService
{
    public function __construct(
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listUsers(array $filters): array
    {
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 15)));
        $search = trim((string) ($filters['search'] ?? ''));
        $role = trim((string) ($filters['role'] ?? ''));
        $status = trim((string) ($filters['status'] ?? ''));
        $sortDir = strtolower((string) ($filters['direction'] ?? 'desc')) === 'asc' ? 'asc' : 'desc';

        $query = DB::table('users')
            ->select([
                'user_id',
                'username',
                'first_name',
                'middle_initial',
                'last_name',
                'email',
                'phone_number',
                'user_role',
                'account_status',
                'email_verified_at',
                'created_at',
                'updated_at',
            ]);

        if ($search !== '') {
            $like = "%{$search}%";
            $query->where(function ($q) use ($like): void {
                $q->where('username', 'like', $like)
                    ->orWhere('first_name', 'like', $like)
                    ->orWhere('last_name', 'like', $like)
                    ->orWhere('email', 'like', $like);
            });
        }

        if ($role !== '' && $role !== 'all') {
            $query->where('user_role', $role);
        }

        if ($status !== '' && $status !== 'all') {
            $query->where('account_status', $status);
        }

        $paginator = $query->orderBy('created_at', $sortDir)->paginate($perPage);

        return [
            'items' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function createUser(array $data, User $admin, Request $request): array
    {
        $user = DB::transaction(function () use ($data, $admin, $request): User {
            $created = User::create([
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
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 15)));
        $search = trim((string) ($filters['search'] ?? ''));
        $status = trim((string) ($filters['status'] ?? ''));
        $sortDir = strtolower((string) ($filters['direction'] ?? 'desc')) === 'asc' ? 'asc' : 'desc';

        $query = DB::table('restaurants as rest')
            ->join('addresses as addr', 'addr.address_id', '=', 'rest.address_id')
            ->join('barangays as brgy', 'brgy.barangay_id', '=', 'addr.barangay_id')
            ->join('cities as c', 'c.city_id', '=', 'brgy.city_id')
            ->leftJoin('restaurant_applications as ra', 'ra.restaurant_id', '=', 'rest.restaurant_id')
            ->select([
                'rest.restaurant_id',
                'rest.restaurant_name',
                'rest.registered_name',
                'rest.business_type',
                'rest.ownership_structure',
                'rest.contact_phone',
                'rest.business_email',
                'rest.logo_image',
                'rest.cover_image',
                'rest.offers_delivery',
                'rest.offers_pickup',
                'rest.offers_dine_in',
                'rest.accepts_reservations',
                'rest.restaurant_status',
                'rest.created_at',
                'addr.street',
                'brgy.barangay_name',
                'c.city_name as zone',
                'ra.reference_number',
                'ra.application_status',
            ]);

        if ($search !== '') {
            $like = "%{$search}%";
            $query->where(function ($q) use ($like): void {
                $q->where('rest.restaurant_name', 'like', $like)
                    ->orWhere('rest.business_email', 'like', $like)
                    ->orWhere('c.city_name', 'like', $like)
                    ->orWhere('ra.reference_number', 'like', $like);
            });
        }

        if ($status !== '' && $status !== 'all') {
            $query->where('rest.restaurant_status', $status);
        }

        $paginator = $query->orderBy('rest.created_at', $sortDir)->paginate($perPage);
        $items = $paginator->items();
        $restaurantIds = array_map(static fn (object $row): int => (int) $row->restaurant_id, $items);

        $ownersByRestaurant = [];
        if ($restaurantIds !== []) {
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

            foreach ($ownerRows as $oRow) {
                $rId = (int) $oRow->restaurant_id;
                if (! isset($ownersByRestaurant[$rId])) {
                    $ownersByRestaurant[$rId] = $oRow;
                }
            }
        }

        foreach ($items as $item) {
            $owner = $ownersByRestaurant[(int) $item->restaurant_id] ?? null;
            $item->owner_name = $owner?->owner_name ?? null;
            $item->owner_email = $owner?->owner_email ?? null;
        }

        return [
            'items' => $items,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function updateRestaurantStatus(int $restaurantId, string $status, ?string $reason, User $admin, Request $request): array
    {
        $restaurant = DB::table('restaurants')->where('restaurant_id', $restaurantId)->first();
        abort_unless($restaurant !== null, 404, 'Restaurant not found.');

        DB::transaction(function () use ($restaurantId, $restaurant, $status, $reason, $admin, $request): void {
            DB::table('restaurants')->where('restaurant_id', $restaurantId)->update([
                'restaurant_status' => $status,
                'updated_at' => now(),
            ]);

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: 'admin_restaurant_status_updated',
                entityType: 'restaurants',
                entityId: $restaurantId,
                oldValues: ['restaurant_status' => $restaurant->restaurant_status],
                newValues: ['restaurant_status' => $status],
                reason: $reason,
                request: $request,
            );
        });

        return (array) DB::table('restaurants')->where('restaurant_id', $restaurantId)->first();
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listRiders(array $filters): array
    {
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 15)));
        $search = trim((string) ($filters['search'] ?? ''));
        $status = trim((string) ($filters['status'] ?? ''));
        $sortDir = strtolower((string) ($filters['direction'] ?? 'desc')) === 'asc' ? 'asc' : 'desc';

        $query = DB::table('riders as r')
            ->join('users as u', 'u.user_id', '=', 'r.user_id')
            ->join('cities as c', 'c.city_id', '=', 'r.base_city_id')
            ->select([
                'r.rider_id',
                'r.user_id',
                'r.vehicle_type',
                'r.vehicle_brand',
                'r.vehicle_model',
                'r.vehicle_color',
                'r.plate_number',
                'r.preferred_shifts',
                'r.available_days',
                'r.emergency_contact_name',
                'r.emergency_contact_phone',
                'r.rider_status',
                'r.approved_at',
                'r.created_at',
                'u.first_name',
                'u.last_name',
                'u.username',
                'u.email',
                'u.phone_number',
                'c.city_name as zone',
            ]);

        if ($search !== '') {
            $like = "%{$search}%";
            $query->where(function ($q) use ($like): void {
                $q->where('u.first_name', 'like', $like)
                    ->orWhere('u.last_name', 'like', $like)
                    ->orWhere('u.email', 'like', $like)
                    ->orWhere('r.plate_number', 'like', $like)
                    ->orWhere('c.city_name', 'like', $like);
            });
        }

        if ($status !== '' && $status !== 'all') {
            $query->where('r.rider_status', $status);
        }

        $paginator = $query->orderBy('r.created_at', $sortDir)->paginate($perPage);

        return [
            'items' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ];
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
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 20)));
        $search = trim((string) ($filters['search'] ?? ''));
        $entityType = trim((string) ($filters['entity_type'] ?? ''));

        $query = DB::table('audit_logs as al')
            ->leftJoin('users as u', 'u.user_id', '=', 'al.actor_user_id')
            ->select([
                'al.log_id',
                'al.actor_user_id',
                'al.action',
                'al.entity_type',
                'al.entity_id',
                'al.old_values',
                'al.new_values',
                'al.reason',
                'al.ip_address',
                'al.created_at',
                'u.first_name',
                'u.last_name',
                'u.email as actor_email',
            ]);

        if ($search !== '') {
            $like = "%{$search}%";
            $query->where(function ($q) use ($like): void {
                $q->where('al.action', 'like', $like)
                    ->orWhere('al.entity_type', 'like', $like)
                    ->orWhere('al.entity_id', 'like', $like)
                    ->orWhere('al.reason', 'like', $like)
                    ->orWhere('u.email', 'like', $like);
            });
        }

        if ($entityType !== '' && $entityType !== 'all') {
            $query->where('al.entity_type', $entityType);
        }

        $paginator = $query->orderByDesc('al.log_id')->paginate($perPage);

        return [
            'items' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ];
    }
}
