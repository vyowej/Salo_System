<?php

namespace App\Features\Restaurants\Services;

use App\Models\User;
use App\Support\AuditLogService;
use App\Support\FileStorageService;
use App\Support\WorkspaceAccessResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MenuPublishService
{
    private const AVAILABILITY_LABELS = [
        'available' => 'Available',
        'sold_out' => 'Sold Out',
        'temporarily_unavailable' => 'Temporarily Unavailable',
    ];

    public function __construct(
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
        private readonly FileStorageService $fileStorageService,
        private readonly AuditLogService $auditLogService,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function getPublishStatus(User $user, ?int $restaurantId = null): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForMenuPublish($user, $restaurantId);

        return $this->buildPublishStatusForRestaurant($restaurant);
    }

    /**
     * Build publish status summary (used by both publish-status endpoint and setup-status).
     *
     * @return array<string, mixed>
     */
    public function buildPublishStatusForRestaurant(object $restaurant, ?object $preloadedAddress = null): array
    {
        $targetId = (int) $restaurant->restaurant_id;

        $address = $preloadedAddress ?? DB::table('addresses as a')
            ->join('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->join('cities as c', 'c.city_id', '=', 'b.city_id')
            ->join('provinces as p', 'p.province_id', '=', 'c.province_id')
            ->where('a.address_id', $restaurant->address_id)
            ->first(['a.street', 'b.barangay_name', 'c.city_name', 'p.province_name']);

        $counts = DB::selectOne(
            'SELECT
                (SELECT COUNT(*) FROM operating_hours WHERE restaurant_id = ? AND is_closed = 0) AS open_periods_count,
                (SELECT COUNT(*) FROM restaurant_tables WHERE restaurant_id = ? AND is_active = 1) AS tables_count,
                (SELECT COUNT(*) FROM menu_categories WHERE restaurant_id = ? AND draft_state = ?) AS cats_new,
                (SELECT COUNT(*) FROM menu_categories WHERE restaurant_id = ? AND draft_state = ?) AS cats_modified,
                (SELECT COUNT(*) FROM menu_categories WHERE restaurant_id = ? AND draft_state = ?) AS cats_pending_delete,
                (SELECT COUNT(*) FROM menu_items WHERE restaurant_id = ? AND draft_state = ?) AS items_new,
                (SELECT COUNT(*) FROM menu_items WHERE restaurant_id = ? AND draft_state = ?) AS items_modified,
                (SELECT COUNT(*) FROM menu_items WHERE restaurant_id = ? AND draft_state = ?) AS items_pending_delete,
                (SELECT COUNT(*) FROM menu_items mi
                    INNER JOIN menu_categories mc ON mc.menu_category_id = mi.menu_category_id
                    WHERE mi.restaurant_id = ?
                      AND mc.restaurant_id = ?
                      AND mc.is_active = 1
                      AND mc.draft_state != ?
                      AND mi.approval_status = ?
                      AND mi.availability_status != ?
                      AND mi.draft_state != ?) AS visible_draft_items_count',
            [
                $targetId,
                $targetId,
                $targetId, 'new',
                $targetId, 'modified',
                $targetId, 'pending_delete',
                $targetId, 'new',
                $targetId, 'modified',
                $targetId, 'pending_delete',
                $targetId, $targetId, 'pending_delete', 'approved', 'hidden', 'pending_delete',
            ],
        );

        $catsNew = (int) ($counts->cats_new ?? 0);
        $catsModified = (int) ($counts->cats_modified ?? 0);
        $catsPendingDelete = (int) ($counts->cats_pending_delete ?? 0);
        $itemsNew = (int) ($counts->items_new ?? 0);
        $itemsModified = (int) ($counts->items_modified ?? 0);
        $itemsPendingDelete = (int) ($counts->items_pending_delete ?? 0);

        $pendingTotal = $catsNew + $catsModified + $catsPendingDelete + $itemsNew + $itemsModified + $itemsPendingDelete;

        $blockers = [];
        if ($restaurant->restaurant_status !== 'active') {
            $blockers[] = 'Your restaurant must be active to publish.';
        }

        $hasInfo = ! empty($restaurant->restaurant_name)
            && ! empty($restaurant->description)
            && ! empty($restaurant->contact_phone)
            && ! empty($restaurant->business_email);
        if (! $hasInfo) {
            $blockers[] = 'Complete your business profile details (description, phone, and email) before publishing.';
        }

        $hasAddress = $address !== null
            && ! empty($address->street)
            && ! empty($address->barangay_name)
            && ! empty($address->city_name)
            && ! empty($address->province_name);
        if (! $hasAddress) {
            $blockers[] = 'Complete your restaurant address before publishing.';
        }

        if ((int) ($counts->open_periods_count ?? 0) < 1) {
            $blockers[] = 'Add at least one open operating hour period before publishing.';
        }

        if ((int) ($counts->visible_draft_items_count ?? 0) < 1) {
            $blockers[] = 'Add at least one active menu category with at least one non-hidden menu item before publishing.';
        }

        $warnings = [];
        if (empty($restaurant->logo_image)) {
            $warnings[] = 'Add a restaurant logo so customers can recognize your brand.';
        }
        if (empty($restaurant->cover_image)) {
            $warnings[] = 'Add a cover photo to make your storefront stand out.';
        }
        if (((bool) $restaurant->offers_dine_in || (bool) $restaurant->accepts_reservations) && (int) ($counts->tables_count ?? 0) < 1) {
            $warnings[] = 'Add at least one table for dine-in or reservation guests.';
        }
        if (! (bool) $restaurant->accepting_orders) {
            $warnings[] = 'Orders are currently paused; customers can view your menu but cannot place orders until you resume.';
        }

        $isPublished = (bool) $restaurant->is_published;

        return [
            'restaurant_id' => $targetId,
            'is_published' => $isPublished,
            'first_published_at' => $restaurant->first_published_at,
            'last_published_at' => $restaurant->last_published_at,
            'last_published_by' => $restaurant->last_published_by !== null ? (int) $restaurant->last_published_by : null,
            'has_unpublished_changes' => $pendingTotal > 0,
            'pending_changes' => [
                'total' => $pendingTotal,
                'new' => $itemsNew + $catsNew,
                'modified' => $itemsModified + $catsModified,
                'pending_delete' => $itemsPendingDelete + $catsPendingDelete,
                'items_new' => $itemsNew,
                'items_modified' => $itemsModified,
                'items_pending_delete' => $itemsPendingDelete,
                'categories_new' => $catsNew,
                'categories_modified' => $catsModified,
                'categories_pending_delete' => $catsPendingDelete,
            ],
            'can_publish' => $blockers === [],
            'blockers' => $blockers,
            'warnings' => $warnings,
            'complete' => $isPublished,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function publish(User $user, ?int $restaurantId, Request $request): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForMenuPublish($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $candidatePhotosToCleanup = [];
        $result = DB::transaction(function () use ($targetId, $user, $request, &$candidatePhotosToCleanup): array {
            $lockedRestaurant = DB::table('restaurants')
                ->where('restaurant_id', $targetId)
                ->lockForUpdate()
                ->first();

            abort_unless($lockedRestaurant !== null, 404, 'Restaurant not found.');

            $status = $this->buildPublishStatusForRestaurant($lockedRestaurant);
            if ($status['blockers'] !== []) {
                throw ValidationException::withMessages([
                    'publish' => $status['blockers'],
                ]);
            }

            if ((bool) $lockedRestaurant->is_published && $status['pending_changes']['total'] === 0) {
                return [
                    'changed' => false,
                    'publish_status' => $status,
                ];
            }

            $now = now();
            $summary = $this->applyPublishSnapshot($targetId, $lockedRestaurant, $user, $now, $candidatePhotosToCleanup);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_menu_published',
                entityType: 'restaurants',
                entityId: $targetId,
                oldValues: [
                    'is_published' => (bool) $lockedRestaurant->is_published,
                    'last_published_at' => $lockedRestaurant->last_published_at,
                ],
                newValues: [
                    'is_published' => true,
                    'summary' => $summary,
                ],
                request: $request,
            );

            $fresh = DB::table('restaurants')->where('restaurant_id', $targetId)->first();

            return [
                'changed' => true,
                'publish_status' => $this->buildPublishStatusForRestaurant($fresh),
            ];
        });

        $this->cleanupUnreferencedMenuPhotos($candidatePhotosToCleanup);

        return $result;
    }

    /**
     * @param  array<int, string>  $candidatePhotosToCleanup
     * @return array<string, int>
     */
    private function applyPublishSnapshot(
        int $targetId,
        object $lockedRestaurant,
        User $user,
        \DateTimeInterface $now,
        array &$candidatePhotosToCleanup,
    ): array {
        // 1. Delete or hide pending_delete items first so category FKs can be cleared.
        $pendingDeleteItems = DB::table('menu_items')
            ->where('restaurant_id', $targetId)
            ->where('draft_state', 'pending_delete')
            ->get(['menu_item_id', 'photo_image', 'published_photo_image']);

        $itemsRemoved = 0;
        foreach ($pendingDeleteItems as $item) {
            if ($item->photo_image) {
                $candidatePhotosToCleanup[] = $item->photo_image;
            }
            if ($item->published_photo_image) {
                $candidatePhotosToCleanup[] = $item->published_photo_image;
            }

            $hasOrders = DB::table('order_items')->where('menu_item_id', $item->menu_item_id)->exists();
            if ($hasOrders) {
                DB::table('menu_items')
                    ->where('menu_item_id', $item->menu_item_id)
                    ->update([
                        'is_published' => 0,
                        'availability_status' => 'hidden',
                        'draft_state' => 'clean',
                        'updated_at' => $now,
                    ]);
            } else {
                DB::table('menu_items')->where('menu_item_id', $item->menu_item_id)->delete();
            }
            $itemsRemoved++;
        }

        // 2. Delete pending_delete categories (or deactivate if an order-referenced hidden item still points to them).
        $pendingDeleteCategories = DB::table('menu_categories')
            ->where('restaurant_id', $targetId)
            ->where('draft_state', 'pending_delete')
            ->get(['menu_category_id']);

        $categoriesRemoved = 0;
        foreach ($pendingDeleteCategories as $cat) {
            $stillReferenced = DB::table('menu_items')
                ->where('restaurant_id', $targetId)
                ->where('menu_category_id', $cat->menu_category_id)
                ->exists();

            if ($stillReferenced) {
                DB::table('menu_categories')
                    ->where('menu_category_id', $cat->menu_category_id)
                    ->update([
                        'is_active' => 0,
                        'is_published' => 0,
                        'published_is_active' => 0,
                        'draft_state' => 'clean',
                        'updated_at' => $now,
                    ]);
            } else {
                DB::table('menu_categories')->where('menu_category_id', $cat->menu_category_id)->delete();
            }
            $categoriesRemoved++;
        }

        // 3. Publish new/modified categories.
        $dirtyCategories = DB::table('menu_categories')
            ->where('restaurant_id', $targetId)
            ->whereIn('draft_state', ['new', 'modified'])
            ->get();

        foreach ($dirtyCategories as $cat) {
            DB::table('menu_categories')
                ->where('menu_category_id', $cat->menu_category_id)
                ->update([
                    'published_category_name' => $cat->category_name,
                    'published_description' => $cat->description,
                    'published_sort_order' => $cat->sort_order,
                    'published_is_active' => $cat->is_active,
                    'is_published' => 1,
                    'draft_state' => 'clean',
                    'updated_at' => $now,
                ]);
        }

        // 4. Publish new/modified approved items.
        $dirtyItems = DB::table('menu_items')
            ->where('restaurant_id', $targetId)
            ->where('approval_status', 'approved')
            ->whereIn('draft_state', ['new', 'modified'])
            ->get();

        $itemsAdded = 0;
        $itemsUpdated = 0;
        foreach ($dirtyItems as $item) {
            if ($item->published_photo_image && $item->published_photo_image !== $item->photo_image) {
                $candidatePhotosToCleanup[] = $item->published_photo_image;
            }

            if ((int) $item->is_published === 1) {
                $itemsUpdated++;
            } else {
                $itemsAdded++;
            }

            DB::table('menu_items')
                ->where('menu_item_id', $item->menu_item_id)
                ->update([
                    'published_menu_category_id' => $item->menu_category_id,
                    'published_item_name' => $item->item_name,
                    'published_description' => $item->description,
                    'published_photo_image' => $item->photo_image,
                    'published_base_price' => $item->base_price,
                    'published_sort_order' => $item->sort_order,
                    'is_published' => 1,
                    'draft_state' => 'clean',
                    'published_at' => $now,
                    'updated_at' => $now,
                ]);
        }

        // 5. Mark restaurant as published.
        DB::table('restaurants')
            ->where('restaurant_id', $targetId)
            ->update([
                'is_published' => 1,
                'first_published_at' => $lockedRestaurant->first_published_at ?? $now,
                'last_published_at' => $now,
                'last_published_by' => $user->user_id,
                'updated_at' => $now,
            ]);

        return [
            'items_added' => $itemsAdded,
            'items_updated' => $itemsUpdated,
            'items_removed' => $itemsRemoved,
            'categories_published' => $dirtyCategories->count(),
            'categories_removed' => $categoriesRemoved,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function unpublish(User $user, ?string $reason, ?int $restaurantId, Request $request): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForMenuPublish($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;
        $cleanReason = $reason !== null && trim($reason) !== '' ? trim($reason) : null;

        DB::transaction(function () use ($targetId, $restaurant, $cleanReason, $user, $request): void {
            DB::table('restaurants')
                ->where('restaurant_id', $targetId)
                ->update([
                    'is_published' => 0,
                    'updated_at' => now(),
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_restaurant_unpublished',
                entityType: 'restaurants',
                entityId: $targetId,
                oldValues: ['is_published' => (bool) $restaurant->is_published],
                newValues: ['is_published' => false, 'reason' => $cleanReason],
                request: $request,
            );
        });

        $fresh = DB::table('restaurants')->where('restaurant_id', $targetId)->first();

        return $this->buildPublishStatusForRestaurant($fresh);
    }

    /**
     * Revert all unpublished draft changes back to the last published snapshot.
     *
     * @return array<string, mixed>
     */
    public function discardChanges(User $user, ?int $restaurantId, Request $request): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForMenuPublish($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;
        $candidatePhotosToCleanup = [];

        DB::transaction(function () use ($targetId, $user, $request, &$candidatePhotosToCleanup): void {
            $now = now();

            // 1. Delete brand-new (never published) items.
            $newItems = DB::table('menu_items')
                ->where('restaurant_id', $targetId)
                ->where('is_published', 0)
                ->get(['menu_item_id', 'photo_image']);

            foreach ($newItems as $item) {
                if ($item->photo_image) {
                    $candidatePhotosToCleanup[] = $item->photo_image;
                }
                DB::table('menu_items')->where('menu_item_id', $item->menu_item_id)->delete();
            }

            // 2. Revert modified / pending_delete published items back to their published_* snapshot.
            $dirtyPublishedItems = DB::table('menu_items')
                ->where('restaurant_id', $targetId)
                ->where('is_published', 1)
                ->whereIn('draft_state', ['modified', 'pending_delete'])
                ->get();

            foreach ($dirtyPublishedItems as $item) {
                if ($item->photo_image && $item->photo_image !== $item->published_photo_image) {
                    $candidatePhotosToCleanup[] = $item->photo_image;
                }

                DB::table('menu_items')
                    ->where('menu_item_id', $item->menu_item_id)
                    ->update([
                        'menu_category_id' => $item->published_menu_category_id,
                        'item_name' => $item->published_item_name,
                        'description' => $item->published_description,
                        'photo_image' => $item->published_photo_image,
                        'base_price' => $item->published_base_price,
                        'sort_order' => $item->published_sort_order,
                        'draft_state' => 'clean',
                        'updated_at' => $now,
                    ]);
            }

            // 3. Delete brand-new (never published) categories (now empty because step 1 & 2 moved/deleted items).
            DB::table('menu_categories')
                ->where('restaurant_id', $targetId)
                ->where('is_published', 0)
                ->delete();

            // 4. Revert modified / pending_delete published categories.
            $dirtyPublishedCats = DB::table('menu_categories')
                ->where('restaurant_id', $targetId)
                ->where('is_published', 1)
                ->whereIn('draft_state', ['modified', 'pending_delete'])
                ->get();

            foreach ($dirtyPublishedCats as $cat) {
                DB::table('menu_categories')
                    ->where('menu_category_id', $cat->menu_category_id)
                    ->update([
                        'category_name' => $cat->published_category_name,
                        'description' => $cat->published_description,
                        'sort_order' => $cat->published_sort_order,
                        'is_active' => $cat->published_is_active,
                        'draft_state' => 'clean',
                        'updated_at' => $now,
                    ]);
            }

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_menu_changes_discarded',
                entityType: 'restaurants',
                entityId: $targetId,
                newValues: [
                    'discarded_new_items' => $newItems->count(),
                    'reverted_items' => $dirtyPublishedItems->count(),
                    'reverted_categories' => $dirtyPublishedCats->count(),
                ],
                request: $request,
            );
        });

        $this->cleanupUnreferencedMenuPhotos($candidatePhotosToCleanup);

        $fresh = DB::table('restaurants')->where('restaurant_id', $targetId)->first();

        return $this->buildPublishStatusForRestaurant($fresh);
    }

    /**
     * Return the draft menu formatted identically to the public customer menu endpoint.
     *
     * @return array<string, mixed>
     */
    public function preview(User $user, ?int $restaurantId = null): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForMenuPublish($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $categories = DB::table('menu_categories')
            ->where('restaurant_id', $targetId)
            ->where('is_active', 1)
            ->where('draft_state', '!=', 'pending_delete')
            ->orderBy('sort_order')
            ->orderBy('menu_category_id')
            ->get(['menu_category_id', 'category_name', 'description', 'sort_order']);

        $categoryIds = $categories->pluck('menu_category_id')->map(fn ($id) => (int) $id)->all();

        $items = $categoryIds === []
            ? collect()
            : DB::table('menu_items')
                ->where('restaurant_id', $targetId)
                ->whereIn('menu_category_id', $categoryIds)
                ->where('approval_status', 'approved')
                ->where('availability_status', '!=', 'hidden')
                ->where('draft_state', '!=', 'pending_delete')
                ->orderBy('sort_order')
                ->orderBy('menu_item_id')
                ->get([
                    'menu_item_id',
                    'menu_category_id',
                    'item_name',
                    'description',
                    'photo_image',
                    'base_price',
                    'availability_status',
                    'sort_order',
                ]);

        $itemIds = $items->pluck('menu_item_id')->map(fn ($id) => (int) $id)->all();
        $addOnGroupsByItem = $this->loadAddOnGroupsForItems($itemIds);
        $itemsByCategory = $items->groupBy('menu_category_id');

        $formattedCategories = $categories->map(function (object $category) use ($itemsByCategory, $addOnGroupsByItem): array {
            $categoryItems = $itemsByCategory->get($category->menu_category_id, collect())
                ->map(function (object $item) use ($addOnGroupsByItem): array {
                    $status = (string) $item->availability_status;

                    return [
                        'id' => (int) $item->menu_item_id,
                        'name' => $item->item_name,
                        'description' => $item->description,
                        'price' => (float) $item->base_price,
                        'photo_path' => $this->fileStorageService->publicUrl($item->photo_image),
                        'availability' => self::AVAILABILITY_LABELS[$status] ?? 'Available',
                        'availability_status' => $status,
                        'add_on_groups' => $addOnGroupsByItem->get((int) $item->menu_item_id, []),
                    ];
                })
                ->values()
                ->all();

            return [
                'id' => (int) $category->menu_category_id,
                'name' => $category->category_name,
                'description' => $category->description,
                'items' => $categoryItems,
            ];
        })->values()->all();

        return [
            'restaurant_id' => $targetId,
            'restaurant_name' => $restaurant->restaurant_name,
            'is_preview' => true,
            'categories' => $formattedCategories,
        ];
    }

    /**
     * @param  array<int, string>  $paths
     */
    private function cleanupUnreferencedMenuPhotos(array $paths): void
    {
        foreach (array_unique(array_filter($paths)) as $path) {
            $this->fileStorageService->deleteIfUnreferenced(
                'public',
                $path,
                function (string $relativePath): bool {
                    $prefixed = '/storage/'.ltrim($relativePath, '/');

                    return DB::table('menu_items')
                        ->whereIn('photo_image', [$relativePath, $prefixed])
                        ->orWhereIn('published_photo_image', [$relativePath, $prefixed])
                        ->exists();
                },
            );
        }
    }

    /**
     * @param  array<int, int>  $itemIds
     * @return Collection<int, array<int, array<string, mixed>>>
     */
    private function loadAddOnGroupsForItems(array $itemIds): Collection
    {
        if ($itemIds === []) {
            return collect();
        }

        $groups = DB::table('add_on_groups')
            ->whereIn('menu_item_id', $itemIds)
            ->orderBy('sort_order')
            ->orderBy('add_on_group_id')
            ->get([
                'add_on_group_id',
                'menu_item_id',
                'group_name',
                'is_required',
                'minimum_selections',
                'maximum_selections',
            ]);

        $groupIds = $groups->pluck('add_on_group_id')->map(fn ($id) => (int) $id)->all();
        if ($groupIds === []) {
            return collect();
        }

        $optionsByGroup = DB::table('add_on_options')
            ->whereIn('add_on_group_id', $groupIds)
            ->orderBy('sort_order')
            ->orderBy('add_on_option_id')
            ->get([
                'add_on_option_id',
                'add_on_group_id',
                'option_name',
                'additional_price',
                'is_available',
            ])
            ->groupBy('add_on_group_id')
            ->map(fn (Collection $opts): array => $opts->map(fn (object $opt): array => [
                'id' => (int) $opt->add_on_option_id,
                'name' => $opt->option_name,
                'additional_price' => (float) $opt->additional_price,
                'is_available' => (bool) $opt->is_available,
            ])->values()->all());

        return $groups->groupBy('menu_item_id')->map(fn (Collection $itemGroups): array => $itemGroups->map(fn (object $group): array => [
            'id' => (int) $group->add_on_group_id,
            'name' => $group->group_name,
            'is_required' => (bool) $group->is_required,
            'minimum_selections' => (int) $group->minimum_selections,
            'maximum_selections' => (int) $group->maximum_selections,
            'options' => $optionsByGroup->get((int) $group->add_on_group_id, []),
        ])->values()->all());
    }
}
