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
        $restaurant = $this->findOwnedRestaurant($user, $restaurantId);

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
        $restaurant = $this->findOwnedOrStaffRestaurant(
            user: $user,
            restaurantId: $restaurantId,
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
        $restaurant = $this->findOwnedOrStaffRestaurant(
            user: $user,
            restaurantId: $restaurantId,
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
        $restaurant = $this->findOwnedOrStaffRestaurant(
            user: $user,
            restaurantId: $restaurantId,
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

    private function findOwnedRestaurant(User $user, ?int $restaurantId): ?object
    {
        $ownerQuery = DB::table('restaurant_owners as ro')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'ro.restaurant_id')
            ->where('ro.user_id', $user->user_id);

        if ($restaurantId !== null) {
            $ownerQuery->where('ro.restaurant_id', $restaurantId);
        } else {
            $ownerQuery->orderBy('ro.restaurant_id');
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
            $staffQuery->orderBy('rs.restaurant_id');
        }

        return $staffQuery
            ->select(['r.*', 'rs.staff_position'])
            ->get()
            ->first(static fn (object $row): bool => $positionCheck($row->staff_position));
    }
}
