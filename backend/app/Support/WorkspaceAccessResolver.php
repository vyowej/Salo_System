<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\DB;

class WorkspaceAccessResolver
{
    /**
     * Resolve and authorize an active restaurant owned by the given user.
     */
    public function requireActiveOwnedRestaurant(User $user, ?int $restaurantId = null): object
    {
        $resolvedId = $this->resolveRequestedRestaurantId($restaurantId);
        $restaurant = $this->findOwnedRestaurant($user, $resolvedId);

        if (! $restaurant) {
            abort(403, 'Forbidden: you do not own this restaurant.');
        }

        if ($restaurant->restaurant_status !== 'active') {
            abort(
                403,
                "Restaurant workspace is only available for active, approved restaurants (current status: {$restaurant->restaurant_status})."
            );
        }

        return $restaurant;
    }

    /**
     * Resolve and authorize an active restaurant for order management (owners or active order-handler staff).
     */
    public function requireActiveAuthorizedRestaurantForOrders(User $user, ?int $restaurantId = null): object
    {
        $resolvedId = $this->resolveRequestedRestaurantId($restaurantId);
        $restaurant = $this->findOwnedOrStaffRestaurant(
            user: $user,
            restaurantId: $resolvedId,
            positionCheck: static fn (?string $pos): bool => User::isOrderHandlerPosition($pos),
        );

        if (! $restaurant) {
            abort(403, 'Forbidden: you are not authorized to manage orders for this restaurant.');
        }

        if ($restaurant->restaurant_status !== 'active') {
            abort(
                403,
                "Restaurant order handling is only available for active restaurants (current status: {$restaurant->restaurant_status})."
            );
        }

        return $restaurant;
    }

    /**
     * Resolve and authorize an active restaurant for inventory configuration (owners or active inventory staff).
     */
    public function requireActiveAuthorizedRestaurantForInventory(User $user, ?int $restaurantId = null): object
    {
        $resolvedId = $this->resolveRequestedRestaurantId($restaurantId);
        $restaurant = $this->findOwnedOrStaffRestaurant(
            user: $user,
            restaurantId: $resolvedId,
            positionCheck: static fn (?string $pos): bool => User::isInventoryManagerPosition($pos),
        );

        if (! $restaurant) {
            abort(403, 'Forbidden: you are not authorized to manage inventory for this restaurant.');
        }

        if ($restaurant->restaurant_status !== 'active') {
            abort(
                403,
                "Restaurant inventory is only available for active restaurants (current status: {$restaurant->restaurant_status})."
            );
        }

        return $restaurant;
    }

    /**
     * Resolve and authorize an active restaurant for menu publishing (owners or active publisher staff such as Manager).
     */
    public function requireActiveAuthorizedRestaurantForMenuPublish(User $user, ?int $restaurantId = null): object
    {
        $resolvedId = $this->resolveRequestedRestaurantId($restaurantId);
        $restaurant = $this->findOwnedOrStaffRestaurant(
            user: $user,
            restaurantId: $resolvedId,
            positionCheck: static fn (?string $pos): bool => User::isMenuPublisherPosition($pos),
        );

        if (! $restaurant) {
            abort(403, 'Forbidden: you are not authorized to publish this restaurant menu.');
        }

        if ($restaurant->restaurant_status !== 'active') {
            abort(
                403,
                "Restaurant menu publishing is only available for active restaurants (current status: {$restaurant->restaurant_status})."
            );
        }

        return $restaurant;
    }

    /**
     * Resolve and authorize an active restaurant for reading menu categories/items (owners, Manager, Menu Manager, Inventory Manager).
     */
    public function requireActiveAuthorizedRestaurantForMenuView(User $user, ?int $restaurantId = null): object
    {
        $resolvedId = $this->resolveRequestedRestaurantId($restaurantId);
        $restaurant = $this->findOwnedOrStaffRestaurant(
            user: $user,
            restaurantId: $resolvedId,
            positionCheck: static fn (?string $pos): bool => User::canViewMenuPosition($pos),
        );

        if (! $restaurant) {
            abort(403, 'Forbidden: you are not authorized to view this restaurant menu.');
        }

        if ($restaurant->restaurant_status !== 'active') {
            abort(
                403,
                "Restaurant menu viewing is only available for active restaurants (current status: {$restaurant->restaurant_status})."
            );
        }

        return $restaurant;
    }

    /**
     * Resolve and authorize an active restaurant for menu management (owners, Manager, Menu Manager).
     */
    public function requireActiveAuthorizedRestaurantForMenuManage(User $user, ?int $restaurantId = null): object
    {
        $resolvedId = $this->resolveRequestedRestaurantId($restaurantId);
        $restaurant = $this->findOwnedOrStaffRestaurant(
            user: $user,
            restaurantId: $resolvedId,
            positionCheck: static fn (?string $pos): bool => User::isMenuManagerPosition($pos),
        );

        if (! $restaurant) {
            abort(403, 'Forbidden: you are not authorized to manage this restaurant menu.');
        }

        if ($restaurant->restaurant_status !== 'active') {
            abort(
                403,
                "Restaurant menu management is only available for active restaurants (current status: {$restaurant->restaurant_status})."
            );
        }

        return $restaurant;
    }

    /**
     * Resolve and authorize an active restaurant for reservation operations
     * (owners, Manager, Reservation Handler, Reservation Staff).
     */
    public function requireActiveAuthorizedRestaurantForReservations(
        User $user,
        ?int $restaurantId = null,
        string $permission = 'reservations.view',
    ): object {
        $resolvedId = $this->resolveRequestedRestaurantId($restaurantId);
        $restaurant = $this->findOwnedOrStaffRestaurant(
            user: $user,
            restaurantId: $resolvedId,
            positionCheck: static fn (?string $pos): bool => User::positionHasPermission($pos, $permission),
        );

        if (! $restaurant) {
            abort(403, 'Forbidden: you are not authorized to manage reservations for this restaurant.');
        }

        if ($restaurant->restaurant_status !== 'active') {
            abort(
                403,
                "Restaurant reservation management is only available for active restaurants (current status: {$restaurant->restaurant_status})."
            );
        }

        return $restaurant;
    }

    /**
     * Resolve and authorize an active restaurant for table management operations
     * (owners, Manager, Reservation Handler, Reservation Staff).
     */
    public function requireActiveAuthorizedRestaurantForTables(
        User $user,
        ?int $restaurantId = null,
        string $permission = 'tables.view',
    ): object {
        $resolvedId = $this->resolveRequestedRestaurantId($restaurantId);
        $restaurant = $this->findOwnedOrStaffRestaurant(
            user: $user,
            restaurantId: $resolvedId,
            positionCheck: static fn (?string $pos): bool => User::positionHasPermission($pos, $permission),
        );

        if (! $restaurant) {
            abort(403, 'Forbidden: you are not authorized to manage tables for this restaurant.');
        }

        if ($restaurant->restaurant_status !== 'active') {
            abort(
                403,
                "Restaurant table management is only available for active restaurants (current status: {$restaurant->restaurant_status})."
            );
        }

        return $restaurant;
    }

    /**
     * Resolve and authorize an active rider whose user account is also active.
     */
    public function requireActiveRider(
        User $user,
        string $inactiveAccountMessage = 'Forbidden: account is not active.',
        string $inactiveRiderMessage = 'Forbidden: an active rider account is required.',
    ): object {
        if (! $user->isActiveAccount()) {
            abort(403, $inactiveAccountMessage);
        }

        $rider = DB::table('riders')->where('user_id', $user->user_id)->first();
        if (! $rider || $rider->rider_status !== 'active') {
            abort(403, $inactiveRiderMessage);
        }

        return $rider;
    }

    /**
     * Resolve the requested restaurant_id from explicit argument (query/body/route)
     * or optional X-Restaurant-Id header (explicit argument always wins).
     */
    public function resolveRequestedRestaurantId(?int $restaurantId = null): ?int
    {
        if ($restaurantId !== null) {
            if ($restaurantId <= 0) {
                abort(403, 'Forbidden: invalid restaurant context.');
            }

            return $restaurantId;
        }

        if (! app()->bound('request')) {
            return null;
        }

        $rawParam = request()->input('restaurant_id') ?? request()->query('restaurant_id');
        if ($rawParam !== null && $rawParam !== '') {
            $paramStr = is_scalar($rawParam) ? trim((string) $rawParam) : '';
            if (! ctype_digit($paramStr) || (int) $paramStr <= 0) {
                abort(403, 'Forbidden: invalid restaurant_id.');
            }

            return (int) $paramStr;
        }

        $headerValue = request()->header('X-Restaurant-Id');
        if ($headerValue === null) {
            return null;
        }

        $trimmed = trim((string) $headerValue);
        if ($trimmed === '') {
            return null;
        }

        if (! ctype_digit($trimmed) || (int) $trimmed <= 0) {
            abort(403, 'Forbidden: invalid X-Restaurant-Id header.');
        }

        return (int) $trimmed;
    }

    private function findOwnedRestaurant(User $user, ?int $restaurantId): ?object
    {
        $ownerQuery = DB::table('restaurant_owners as ro')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'ro.restaurant_id')
            ->where('ro.user_id', $user->user_id);

        if ($restaurantId !== null) {
            $ownerQuery->where('ro.restaurant_id', $restaurantId);
        } else {
            $ownerQuery
                ->orderByRaw('CASE WHEN r.parent_restaurant_id IS NULL THEN 0 ELSE 1 END ASC')
                ->orderBy('ro.restaurant_id');
        }

        return $ownerQuery->select('r.*')->first();
    }

    /**
     * @param  callable(?string): bool  $positionCheck
     */
    private function findOwnedOrStaffRestaurant(User $user, ?int $restaurantId, callable $positionCheck): ?object
    {
        $restaurant = $this->findOwnedRestaurant($user, $restaurantId);
        if ($restaurant) {
            return $restaurant;
        }

        $staffQuery = DB::table('restaurant_staff as rs')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'rs.restaurant_id')
            ->where('rs.user_id', $user->user_id)
            ->where('rs.staff_status', 'active');

        if ($restaurantId !== null) {
            $staffQuery->where('rs.restaurant_id', $restaurantId);
        } else {
            $staffQuery
                ->orderByRaw('CASE WHEN r.parent_restaurant_id IS NULL THEN 0 ELSE 1 END ASC')
                ->orderBy('rs.restaurant_id');
        }

        return $staffQuery
            ->select(['r.*', 'rs.staff_position'])
            ->get()
            ->first(static fn (object $row): bool => $positionCheck($row->staff_position));
    }
}
