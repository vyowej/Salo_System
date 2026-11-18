<?php

namespace App\Features\Riders\Services;

use App\Models\User;
use App\Support\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class RiderService
{
    public const AVAILABILITY_STATUSES = [
        'offline',
        'online',
        'temporarily_unavailable',
    ];

    public function __construct(
        private readonly AuditLogService $auditLogService,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function getDashboard(User $user): array
    {
        $rider = $this->requireRiderRecord($user);
        $availability = $this->getAvailabilityState((int) $rider->rider_id);

        $todayStart = now('Asia/Manila')->startOfDay()->utc();
        $completedToday = DB::table('deliveries')
            ->where('rider_id', $rider->rider_id)
            ->where('delivery_status', 'delivered')
            ->where('delivered_at', '>=', $todayStart)
            ->count();

        $activeDelivery = DB::table('deliveries as d')
            ->join('orders as o', 'o.order_id', '=', 'd.order_id')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->where('d.rider_id', $rider->rider_id)
            ->whereIn('d.delivery_status', ['accepted', 'picked_up'])
            ->select([
                'd.delivery_id',
                'd.order_id',
                'd.delivery_status',
                'd.accepted_at',
                'd.picked_up_at',
                'o.order_reference',
                'o.total_amount',
                'r.restaurant_name',
            ])
            ->first();

        return [
            'rider' => $this->formatRiderProfile($user, $rider, $availability),
            'availability' => $availability,
            'stats' => [
                'completed_today' => $completedToday,
                'has_active_delivery' => $activeDelivery !== null,
            ],
            'active_delivery' => $activeDelivery,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function getProfile(User $user): array
    {
        $rider = $this->requireRiderRecord($user);
        $availability = $this->getAvailabilityState((int) $rider->rider_id);

        return $this->formatRiderProfile($user, $rider, $availability);
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function updateProfile(User $user, array $validated, Request $request): array
    {
        $rider = $this->requireRiderRecord($user);

        $updates = [];
        foreach ([
            'emergency_contact_name',
            'emergency_contact_relationship',
            'emergency_contact_phone',
            'emergency_contact_alt_phone',
            'preferred_hubs',
        ] as $field) {
            if (array_key_exists($field, $validated)) {
                $updates[$field] = $validated[$field];
            }
        }

        if (array_key_exists('preferred_shifts', $validated)) {
            $updates['preferred_shifts'] = is_array($validated['preferred_shifts']) && $validated['preferred_shifts'] !== []
                ? implode(',', $validated['preferred_shifts'])
                : null;
        }

        if (array_key_exists('available_days', $validated)) {
            $updates['available_days'] = is_array($validated['available_days']) && $validated['available_days'] !== []
                ? implode(',', $validated['available_days'])
                : null;
        }

        if ($updates !== []) {
            $updates['updated_at'] = now();
            DB::table('riders')->where('rider_id', $rider->rider_id)->update($updates);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'rider_profile_updated',
                entityType: 'riders',
                entityId: $rider->rider_id,
                newValues: $updates,
                request: $request,
            );
        }

        return $this->getProfile($user);
    }

    /**
     * @return array<string, mixed>
     */
    public function updateAvailability(User $user, string $status, Request $request): array
    {
        $rider = $this->requireRiderRecord($user);

        if (! $user->isActiveAccount() || $rider->rider_status !== 'active') {
            abort(403, 'Only active riders with an active account can change online availability.');
        }

        if ($status !== 'online') {
            $hasActiveDelivery = DB::table('deliveries')
                ->where('rider_id', $rider->rider_id)
                ->whereIn('delivery_status', ['accepted', 'picked_up'])
                ->exists();

            if ($hasActiveDelivery) {
                throw new ConflictHttpException('Cannot go offline while handling an unfinished delivery.');
            }
        }

        $previous = $this->getAvailabilityState((int) $rider->rider_id);
        $nextState = [
            'status' => $status,
            'is_online' => $status === 'online',
            'updated_at' => now()->toIso8601String(),
        ];

        Cache::forever($this->availabilityKey((int) $rider->rider_id), $nextState);

        $this->auditLogService->record(
            actorUserId: (int) $user->user_id,
            action: 'rider_availability_changed',
            entityType: 'riders',
            entityId: $rider->rider_id,
            oldValues: ['status' => $previous['status']],
            newValues: ['status' => $status],
            request: $request,
        );

        return $nextState;
    }

    private function requireRiderRecord(User $user): object
    {
        $rider = DB::table('riders as r')
            ->leftJoin('cities as c', 'c.city_id', '=', 'r.base_city_id')
            ->where('r.user_id', $user->user_id)
            ->select(['r.*', 'c.city_name as base_city_name'])
            ->first();

        abort_unless($rider !== null, 404, 'Rider profile not found.');

        return $rider;
    }

    public function isOnline(int $riderId): bool
    {
        $state = $this->getAvailabilityState($riderId);

        return ($state['status'] ?? 'offline') === 'online';
    }

    /**
     * @return array<string, mixed>
     */
    private function getAvailabilityState(int $riderId): array
    {
        $cached = Cache::get($this->availabilityKey($riderId));

        if (is_array($cached) && isset($cached['status'])) {
            return $cached;
        }

        return [
            'status' => 'offline',
            'is_online' => false,
            'updated_at' => null,
        ];
    }

    private function availabilityKey(int $riderId): string
    {
        return "rider:availability:{$riderId}";
    }

    /**
     * @param  array<string, mixed>  $availability
     * @return array<string, mixed>
     */
    private function formatRiderProfile(User $user, object $rider, array $availability): array
    {
        return [
            'rider_id' => (int) $rider->rider_id,
            'user_id' => (int) $user->user_id,
            'first_name' => $user->first_name,
            'middle_initial' => $user->middle_initial,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'phone_number' => $user->phone_number,
            'vehicle_type' => $rider->vehicle_type,
            'vehicle_brand' => $rider->vehicle_brand,
            'vehicle_model' => $rider->vehicle_model,
            'vehicle_color' => $rider->vehicle_color,
            'vehicle_year' => $rider->vehicle_year ? (int) $rider->vehicle_year : null,
            'plate_number' => $rider->plate_number,
            'base_city' => $rider->base_city_name,
            'preferred_hubs' => $rider->preferred_hubs,
            'preferred_shifts' => $rider->preferred_shifts ? explode(',', $rider->preferred_shifts) : [],
            'available_days' => $rider->available_days ? explode(',', $rider->available_days) : [],
            'emergency_contact_name' => $rider->emergency_contact_name,
            'emergency_contact_relationship' => $rider->emergency_contact_relationship,
            'emergency_contact_phone' => $rider->emergency_contact_phone,
            'rider_status' => $rider->rider_status,
            'approved_at' => $rider->approved_at,
            'availability' => $availability,
        ];
    }
}
