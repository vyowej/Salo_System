<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;

#[Fillable([
    'username',
    'first_name',
    'middle_initial',
    'last_name',
    'email',
    'password_hash',
    'phone_number',
    'date_of_birth',
    'user_role',
    'account_status',
    'email_verified_at',
])]
#[Hidden(['password_hash'])]
class User extends Authenticatable
{
    use Notifiable;

    protected $table = 'users';

    protected $primaryKey = 'user_id';

    public $timestamps = true;

    /**
     * Per-request memoized role context keyed by the active Request object in a WeakMap.
     *
     * @var \WeakMap<object, array<string, mixed>>|null
     */
    private ?\WeakMap $roleContextByRequest = null;

    public function clearRoleContextCache(): void
    {
        $this->roleContextByRequest = null;
    }

    private function currentRequestObject(): ?object
    {
        if (! app()->bound('request')) {
            return null;
        }

        $req = app('request');

        return is_object($req) ? $req : null;
    }

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'date_of_birth' => 'date:Y-m-d',
        ];
    }

    public function getAuthPasswordName(): string
    {
        return 'password_hash';
    }

    public function getAuthPassword(): string
    {
        return (string) $this->password_hash;
    }

    public function getRememberTokenName(): ?string
    {
        return null;
    }

    public function isActiveAccount(): bool
    {
        return $this->account_status === 'active';
    }

    /**
     * Resolve derived roles and membership details from restaurant_owners, restaurant_staff, and riders.
     *
     * @return array<string, mixed>
     */
    public function resolveRoleContext(bool $refresh = false): array
    {
        $req = $this->currentRequestObject();
        $userKey = '_salo_role_context_'.(int) $this->user_id;

        if (! $refresh && $req !== null) {
            if (isset($req->attributes) && is_object($req->attributes) && $req->attributes->has($userKey)) {
                /** @var array<string, mixed> $cached */
                $cached = $req->attributes->get($userKey);

                return $cached;
            }

            if ($this->roleContextByRequest !== null && isset($this->roleContextByRequest[$req])) {
                return $this->roleContextByRequest[$req];
            }
        }

        $ownerships = DB::table('restaurant_owners as ro')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'ro.restaurant_id')
            ->where('ro.user_id', $this->user_id)
            ->select([
                'ro.restaurant_id',
                'r.restaurant_name',
                'r.restaurant_status',
                'ro.joined_at',
            ])
            ->orderBy('ro.restaurant_id')
            ->get()
            ->map(fn ($row) => [
                'restaurant_id' => (int) $row->restaurant_id,
                'restaurant_name' => $row->restaurant_name,
                'restaurant_status' => $row->restaurant_status,
                'joined_at' => $row->joined_at,
            ])
            ->values()
            ->all();

        $staffAssignments = DB::table('restaurant_staff as rs')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'rs.restaurant_id')
            ->where('rs.user_id', $this->user_id)
            ->where('rs.staff_status', 'active')
            ->select([
                'rs.staff_id',
                'rs.restaurant_id',
                'r.restaurant_name',
                'rs.staff_position',
                'rs.staff_status',
                'rs.joined_at',
            ])
            ->orderBy('rs.staff_id')
            ->get()
            ->map(fn ($row) => [
                'staff_id' => (int) $row->staff_id,
                'restaurant_id' => (int) $row->restaurant_id,
                'restaurant_name' => $row->restaurant_name,
                'staff_position' => $row->staff_position,
                'staff_status' => $row->staff_status,
                'can_handle_orders' => self::isOrderHandlerPosition($row->staff_position),
                'can_publish_menu' => self::isMenuPublisherPosition($row->staff_position),
                'permissions' => null,
                'joined_at' => $row->joined_at,
            ])
            ->values()
            ->all();

        $riderRow = DB::table('riders')
            ->where('user_id', $this->user_id)
            ->select([
                'rider_id',
                'vehicle_type',
                'rider_status',
                'approved_at',
            ])
            ->first();

        $riderProfile = $riderRow ? [
            'rider_id' => (int) $riderRow->rider_id,
            'vehicle_type' => $riderRow->vehicle_type,
            'rider_status' => $riderRow->rider_status,
            'approved_at' => $riderRow->approved_at,
        ] : null;

        $isAdmin = $this->user_role === 'admin';
        $isOwner = count($ownerships) > 0;
        $isStaff = count($staffAssignments) > 0;
        $isRider = $riderRow !== null && in_array($riderRow->rider_status, ['approved', 'active'], true);

        $roles = ['customer'];
        if ($isAdmin) {
            $roles[] = 'admin';
        }
        if ($isOwner) {
            $roles[] = 'owner';
        }
        if ($isStaff) {
            $roles[] = 'staff';
        }
        if ($isRider) {
            $roles[] = 'rider';
        }

        $context = [
            'roles' => $roles,
            'capabilities' => [
                'is_customer' => true,
                'is_admin' => $isAdmin,
                'is_restaurant_owner' => $isOwner,
                'is_restaurant_staff' => $isStaff,
                'is_rider' => $isRider,
            ],
            'restaurant_ownerships' => $ownerships,
            'restaurant_staff_assignments' => $staffAssignments,
            'order_handler_positions' => array_values((array) config('salo.orders.handler_positions', [])),
            'menu_publisher_positions' => array_values((array) config('salo.menu.publisher_positions', [])),
            'rider_profile' => $riderProfile,
        ];

        if ($req !== null) {
            if (isset($req->attributes) && is_object($req->attributes)) {
                $req->attributes->set($userKey, $context);
            }
            if ($this->roleContextByRequest === null) {
                $this->roleContextByRequest = new \WeakMap();
            }
            $this->roleContextByRequest[$req] = $context;
        }

        return $context;
    }

    public static function isOrderHandlerPosition(?string $position): bool
    {
        return self::matchesConfiguredPosition($position, 'salo.orders.handler_positions');
    }

    public static function isInventoryManagerPosition(?string $position): bool
    {
        return self::matchesConfiguredPosition($position, 'salo.inventory.manager_positions');
    }

    public static function isMenuPublisherPosition(?string $position): bool
    {
        return self::matchesConfiguredPosition($position, 'salo.menu.publisher_positions');
    }

    private static function matchesConfiguredPosition(?string $position, string $configKey): bool
    {
        $normalized = strtolower(trim((string) $position));
        if ($normalized === '') {
            return false;
        }

        $allowed = array_map(
            static fn (mixed $item): string => strtolower(trim((string) $item)),
            (array) config($configKey, []),
        );

        return in_array($normalized, $allowed, true);
    }

    public function hasDerivedRole(string $role): bool
    {
        $normalized = match (strtolower(trim($role))) {
            'restaurant_owner' => 'owner',
            'restaurant_staff' => 'staff',
            default => strtolower(trim($role)),
        };

        if ($normalized === 'customer') {
            return true;
        }

        if ($normalized === 'admin') {
            return $this->user_role === 'admin';
        }

        $context = $this->resolveRoleContext();

        return in_array($normalized, $context['roles'], true);
    }
}
