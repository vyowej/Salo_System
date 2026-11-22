<?php

namespace App\Support;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class PublicRestaurantVisibility
{
    /**
     * Restrict a query on `restaurants` (aliased as `$alias`) to restaurants that
     * are active, published by the owner/manager, and have at least one
     * published, active category containing at least one published, non-hidden item.
     */
    public function applyVisibleRestaurantScope(Builder $query, string $alias = 'r'): Builder
    {
        return $query
            ->where("{$alias}.restaurant_status", 'active')
            ->where("{$alias}.is_published", 1)
            ->where(function (Builder $q) use ($alias): void {
                $q->whereNull("{$alias}.parent_restaurant_id")
                    ->orWhereExists(function (Builder $sub) use ($alias): void {
                        $sub->selectRaw('1')
                            ->from('branch_permits as bp')
                            ->whereColumn('bp.restaurant_id', "{$alias}.restaurant_id")
                            ->whereIn('bp.permit_status', ['approved', 'waived']);
                    });
            })
            ->whereExists(function (Builder $sub) use ($alias): void {
                $sub->selectRaw('1')
                    ->from('menu_items as mi')
                    ->join('menu_categories as mc', 'mc.menu_category_id', '=', 'mi.published_menu_category_id')
                    ->whereColumn('mi.restaurant_id', "{$alias}.restaurant_id")
                    ->whereColumn('mc.restaurant_id', "{$alias}.restaurant_id")
                    ->where('mi.is_published', 1)
                    ->where('mi.approval_status', 'approved')
                    ->where('mi.availability_status', '!=', 'hidden')
                    ->where('mc.is_published', 1)
                    ->where('mc.published_is_active', 1);
            });
    }

    public function isVisible(int $restaurantId): bool
    {
        return $this->applyVisibleRestaurantScope(DB::table('restaurants as r'))
            ->where('r.restaurant_id', $restaurantId)
            ->exists();
    }

    public function publishedCategoriesQuery(int $restaurantId): Builder
    {
        return DB::table('menu_categories')
            ->where('restaurant_id', $restaurantId)
            ->where('is_published', 1)
            ->where('published_is_active', 1)
            ->orderBy('published_sort_order')
            ->orderBy('menu_category_id');
    }

    /**
     * @param  array<int, int>  $categoryIds
     */
    public function publishedItemsQuery(int $restaurantId, array $categoryIds): Builder
    {
        return DB::table('menu_items')
            ->where('restaurant_id', $restaurantId)
            ->whereIn('published_menu_category_id', $categoryIds)
            ->where('is_published', 1)
            ->where('approval_status', 'approved')
            ->where('availability_status', '!=', 'hidden')
            ->orderBy('published_sort_order')
            ->orderBy('menu_item_id');
    }
}
