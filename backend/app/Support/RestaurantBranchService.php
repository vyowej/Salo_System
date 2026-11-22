<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Shared multi-branch hierarchy, creation, and Strategy B owner-sync helpers.
 */
class RestaurantBranchService
{
    public static function formatDisplayName(string $restaurantName, ?string $branchName): string
    {
        $trimmedBranch = trim((string) $branchName);

        return $trimmedBranch !== '' ? "{$restaurantName} — {$branchName}" : $restaurantName;
    }

    /**
     * Resolve the canonical brand_restaurant_id for a restaurant row.
     */
    public function resolveBrandId(int $restaurantId): int
    {
        $row = DB::table('restaurants')
            ->where('restaurant_id', $restaurantId)
            ->first(['restaurant_id', 'parent_restaurant_id', 'brand_restaurant_id']);

        if (! $row) {
            return $restaurantId;
        }

        if ($row->brand_restaurant_id !== null) {
            return (int) $row->brand_restaurant_id;
        }

        return $row->parent_restaurant_id !== null
            ? (int) $row->parent_restaurant_id
            : (int) $row->restaurant_id;
    }

    /**
     * Insert a root restaurant row and immediately set brand_restaurant_id = restaurant_id
     * inside a transaction.
     *
     * @param  array<string, mixed>  $attributes
     */
    public function createRootRestaurant(array $attributes): int
    {
        return (int) DB::transaction(function () use ($attributes): int {
            $payload = array_merge($attributes, [
                'parent_restaurant_id' => null,
                'brand_restaurant_id' => null,
            ]);

            $restaurantId = (int) DB::table('restaurants')->insertGetId($payload);

            DB::table('restaurants')
                ->where('restaurant_id', $restaurantId)
                ->update(['brand_restaurant_id' => $restaurantId]);

            return $restaurantId;
        });
    }

    /**
     * Insert a child branch under a root restaurant, enforcing service-level hierarchy rules
     * and copying restaurant_owners from the root restaurant (Strategy B).
     *
     * @param  array<string, mixed>  $attributes
     */
    public function createChildBranch(int $parentRestaurantId, array $attributes, ?int $applicationBranchId = null): int
    {
        return (int) DB::transaction(function () use ($parentRestaurantId, $attributes, $applicationBranchId): int {
            $branchName = isset($attributes['branch_name']) ? trim((string) $attributes['branch_name']) : null;
            $parent = $this->assertValidNewBranch($parentRestaurantId, $branchName);
            $brandId = (int) ($parent->brand_restaurant_id ?: $parent->restaurant_id);

            $payload = array_merge($attributes, [
                'parent_restaurant_id' => (int) $parent->restaurant_id,
                'brand_restaurant_id' => $brandId,
                'branch_name' => $branchName,
            ]);

            $branchId = (int) DB::table('restaurants')->insertGetId($payload);

            $this->syncOwnersFromRootToBranch((int) $parent->restaurant_id, $branchId);

            if (\Illuminate\Support\Facades\Schema::hasTable('branch_permits')) {
                $now = $attributes['created_at'] ?? now();
                $existing = $applicationBranchId !== null
                    ? DB::table('branch_permits')->where('application_branch_id', $applicationBranchId)->lockForUpdate()->first()
                    : null;

                if ($existing !== null) {
                    DB::table('branch_permits')
                        ->where('permit_id', $existing->permit_id)
                        ->update([
                            'restaurant_id' => $branchId,
                            'updated_at' => $now,
                        ]);
                } else {
                    DB::table('branch_permits')->insert([
                        'restaurant_id' => $branchId,
                        'application_branch_id' => $applicationBranchId,
                        'is_required_locally' => 1,
                        'permit_status' => 'pending_submission',
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }

            return $branchId;
        });
    }

    /**
     * Enforce single-level hierarchy, no self-parenting, brand consistency,
     * case-insensitive unique branch_name per brand, and max branches per business.
     */
    public function assertValidNewBranch(
        int $parentRestaurantId,
        ?string $branchName,
        ?int $candidateRestaurantId = null,
    ): object {
        if ($candidateRestaurantId !== null && $parentRestaurantId === $candidateRestaurantId) {
            throw ValidationException::withMessages([
                'parent_restaurant_id' => ['A restaurant cannot be its own parent branch.'],
            ]);
        }

        $parent = DB::table('restaurants')
            ->where('restaurant_id', $parentRestaurantId)
            ->first(['restaurant_id', 'parent_restaurant_id', 'brand_restaurant_id', 'branch_name']);

        if (! $parent) {
            throw ValidationException::withMessages([
                'parent_restaurant_id' => ['Parent restaurant was not found.'],
            ]);
        }

        if ($parent->parent_restaurant_id !== null) {
            throw ValidationException::withMessages([
                'parent_restaurant_id' => ['Branches can only be added under the main (root) restaurant, not under another branch.'],
            ]);
        }

        if ($parent->brand_restaurant_id !== null && (int) $parent->brand_restaurant_id !== (int) $parent->restaurant_id) {
            throw ValidationException::withMessages([
                'brand_restaurant_id' => ['Parent restaurant brand reference is inconsistent.'],
            ]);
        }

        $brandId = (int) ($parent->brand_restaurant_id ?: $parent->restaurant_id);

        $trimmedName = trim((string) $branchName);
        if ($trimmedName === '') {
            throw ValidationException::withMessages([
                'branch_name' => ['Branch name is required.'],
            ]);
        }

        $duplicateQuery = DB::table('restaurants')
            ->where('brand_restaurant_id', $brandId)
            ->whereNotNull('branch_name')
            ->whereRaw('LOWER(TRIM(branch_name)) = ?', [mb_strtolower($trimmedName)]);

        if ($candidateRestaurantId !== null) {
            $duplicateQuery->where('restaurant_id', '!=', $candidateRestaurantId);
        }

        if ($duplicateQuery->exists()) {
            throw ValidationException::withMessages([
                'branch_name' => ["A branch named \"{$trimmedName}\" already exists for this business."],
            ]);
        }

        $maxBranches = max(1, (int) config('salo.restaurants.max_branches_per_business', 10));
        $currentCount = DB::table('restaurants')
            ->where('brand_restaurant_id', $brandId)
            ->count();

        if ($currentCount >= $maxBranches) {
            throw ValidationException::withMessages([
                'branch_name' => ["Maximum of {$maxBranches} branches per business reached."],
            ]);
        }

        return $parent;
    }

    /**
     * Strategy B: copy all current restaurant_owners rows from root to a new branch.
     */
    public function syncOwnersFromRootToBranch(int $rootRestaurantId, int $branchRestaurantId): void
    {
        $owners = DB::table('restaurant_owners')
            ->where('restaurant_id', $rootRestaurantId)
            ->get(['user_id', 'joined_at']);

        foreach ($owners as $owner) {
            DB::table('restaurant_owners')->updateOrInsert(
                [
                    'restaurant_id' => $branchRestaurantId,
                    'user_id' => (int) $owner->user_id,
                ],
                [
                    'joined_at' => $owner->joined_at ?? now(),
                ]
            );
        }
    }

    /**
     * Strategy B: add a co-owner to every branch of a brand in one transaction.
     */
    public function addOwnerToBrand(int $brandRestaurantId, int $userId, mixed $joinedAt = null): void
    {
        DB::transaction(function () use ($brandRestaurantId, $userId, $joinedAt): void {
            $branchIds = DB::table('restaurants')
                ->where('brand_restaurant_id', $brandRestaurantId)
                ->orWhere('restaurant_id', $brandRestaurantId)
                ->pluck('restaurant_id');

            $timestamp = $joinedAt ?? now();

            foreach ($branchIds as $branchId) {
                DB::table('restaurant_owners')->updateOrInsert(
                    [
                        'restaurant_id' => (int) $branchId,
                        'user_id' => $userId,
                    ],
                    [
                        'joined_at' => $timestamp,
                    ]
                );
            }
        });
    }

    /**
     * Strategy B: remove an owner from every branch of a brand in one transaction.
     */
    public function removeOwnerFromBrand(int $brandRestaurantId, int $userId): void
    {
        DB::transaction(function () use ($brandRestaurantId, $userId): void {
            $branchIds = DB::table('restaurants')
                ->where('brand_restaurant_id', $brandRestaurantId)
                ->orWhere('restaurant_id', $brandRestaurantId)
                ->pluck('restaurant_id')
                ->all();

            if ($branchIds !== []) {
                DB::table('restaurant_owners')
                    ->whereIn('restaurant_id', $branchIds)
                    ->where('user_id', $userId)
                    ->delete();
            }
        });
    }

    /**
     * Copy restaurant_category_map and operating_hours from root to a child branch.
     */
    public function copyCategoriesAndHoursFromRoot(int $rootRestaurantId, int $branchRestaurantId, mixed $now = null): void
    {
        $timestamp = $now ?? now();

        $categoryIds = DB::table('restaurant_category_map')
            ->where('restaurant_id', $rootRestaurantId)
            ->pluck('category_id');

        foreach ($categoryIds as $categoryId) {
            DB::table('restaurant_category_map')->insertOrIgnore([
                'restaurant_id' => $branchRestaurantId,
                'category_id' => (int) $categoryId,
            ]);
        }

        $hours = DB::table('operating_hours')
            ->where('restaurant_id', $rootRestaurantId)
            ->orderBy('day_of_week')
            ->get();

        foreach ($hours as $hour) {
            DB::table('operating_hours')->insert([
                'restaurant_id' => $branchRestaurantId,
                'day_of_week' => (int) $hour->day_of_week,
                'opening_time' => $hour->opening_time,
                'closing_time' => $hour->closing_time,
                'closes_next_day' => (int) ($hour->closes_next_day ?? 0),
                'is_closed' => (int) $hour->is_closed,
                'created_at' => $timestamp,
                'updated_at' => $timestamp,
            ]);
        }
    }

    /**
     * Clone menu categories, items, and add-ons from a source restaurant to a target branch
     * as approved but unpublished (is_published = 0, draft_state = 'new').
     */
    public function cloneMenuAsUnpublishedApproved(int $sourceRestaurantId, int $targetRestaurantId, mixed $now = null): void
    {
        $timestamp = $now ?? now();

        $categories = DB::table('menu_categories')
            ->where('restaurant_id', $sourceRestaurantId)
            ->orderBy('sort_order')
            ->orderBy('menu_category_id')
            ->get();

        $categoryMap = [];
        foreach ($categories as $cat) {
            $newCatId = (int) DB::table('menu_categories')->insertGetId([
                'restaurant_id' => $targetRestaurantId,
                'category_name' => $cat->category_name,
                'description' => $cat->description,
                'sort_order' => (int) $cat->sort_order,
                'is_active' => (int) $cat->is_active,
                'draft_state' => 'new',
                'is_published' => 0,
                'published_category_name' => null,
                'published_description' => null,
                'published_sort_order' => null,
                'published_is_active' => null,
                'created_at' => $timestamp,
                'updated_at' => $timestamp,
            ]);
            $categoryMap[(int) $cat->menu_category_id] = $newCatId;
        }

        $items = DB::table('menu_items')
            ->where('restaurant_id', $sourceRestaurantId)
            ->orderBy('sort_order')
            ->orderBy('menu_item_id')
            ->get();

        $itemMap = [];
        foreach ($items as $item) {
            $newCatId = $categoryMap[(int) $item->menu_category_id] ?? null;
            if ($newCatId === null) {
                continue;
            }

            $newItemId = (int) DB::table('menu_items')->insertGetId([
                'restaurant_id' => $targetRestaurantId,
                'menu_category_id' => $newCatId,
                'item_name' => $item->item_name,
                'description' => $item->description,
                'photo_image' => $item->photo_image,
                'base_price' => $item->base_price,
                'availability_status' => $item->availability_status,
                'approval_status' => 'approved',
                'sort_order' => (int) $item->sort_order,
                'draft_state' => 'new',
                'is_published' => 0,
                'published_menu_category_id' => null,
                'published_item_name' => null,
                'published_description' => null,
                'published_photo_image' => null,
                'published_base_price' => null,
                'published_sort_order' => null,
                'published_at' => null,
                'created_at' => $timestamp,
                'updated_at' => $timestamp,
            ]);
            $itemMap[(int) $item->menu_item_id] = $newItemId;
        }

        if ($itemMap === []) {
            return;
        }

        $groups = DB::table('add_on_groups')
            ->whereIn('menu_item_id', array_keys($itemMap))
            ->orderBy('sort_order')
            ->orderBy('add_on_group_id')
            ->get();

        $groupMap = [];
        foreach ($groups as $group) {
            $targetItemId = $itemMap[(int) $group->menu_item_id] ?? null;
            if ($targetItemId === null) {
                continue;
            }

            $newGroupId = (int) DB::table('add_on_groups')->insertGetId([
                'menu_item_id' => $targetItemId,
                'group_name' => $group->group_name,
                'is_required' => (int) $group->is_required,
                'minimum_selections' => (int) $group->minimum_selections,
                'maximum_selections' => (int) $group->maximum_selections,
                'sort_order' => (int) $group->sort_order,
                'created_at' => $timestamp,
                'updated_at' => $timestamp,
            ]);
            $groupMap[(int) $group->add_on_group_id] = $newGroupId;
        }

        if ($groupMap === []) {
            return;
        }

        $options = DB::table('add_on_options')
            ->whereIn('add_on_group_id', array_keys($groupMap))
            ->orderBy('sort_order')
            ->orderBy('add_on_option_id')
            ->get();

        foreach ($options as $opt) {
            $targetGroupId = $groupMap[(int) $opt->add_on_group_id] ?? null;
            if ($targetGroupId === null) {
                continue;
            }

            DB::table('add_on_options')->insert([
                'add_on_group_id' => $targetGroupId,
                'option_name' => $opt->option_name,
                'additional_price' => $opt->additional_price,
                'is_available' => (int) $opt->is_available,
                'sort_order' => (int) $opt->sort_order,
                'created_at' => $timestamp,
                'updated_at' => $timestamp,
            ]);
        }
    }
}
