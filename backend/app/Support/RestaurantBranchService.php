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
    public function createChildBranch(int $parentRestaurantId, array $attributes): int
    {
        return (int) DB::transaction(function () use ($parentRestaurantId, $attributes): int {
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
}
