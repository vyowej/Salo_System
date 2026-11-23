<?php

namespace App\Features\Restaurants\Services;

use App\Models\User;
use App\Support\AuditLogService;
use App\Support\FileStorageService;
use App\Support\Storage\StoragePurpose;
use App\Support\WorkspaceAccessResolver;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class OwnerMenuService
{
    public function __construct(
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
        private readonly FileStorageService $fileStorageService,
        private readonly AuditLogService $auditLogService,
    ) {}

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listCategories(User $user, ?int $restaurantId = null): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForMenuView($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $counts = DB::table('menu_items')
            ->where('restaurant_id', $targetId)
            ->where('draft_state', '!=', 'pending_delete')
            ->selectRaw('menu_category_id, COUNT(*) as total')
            ->groupBy('menu_category_id')
            ->pluck('total', 'menu_category_id');

        return DB::table('menu_categories')
            ->where('restaurant_id', $targetId)
            ->orderBy('sort_order')
            ->orderBy('menu_category_id')
            ->get([
                'menu_category_id',
                'category_name',
                'description',
                'sort_order',
                'is_active',
                'draft_state',
                'is_published',
                'published_category_name',
                'published_description',
                'published_sort_order',
                'published_is_active',
            ])
            ->map(fn ($row) => $this->formatCategory($row, (int) ($counts[$row->menu_category_id] ?? 0)))
            ->values()
            ->all();
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function createCategory(User $user, array $validated, ?int $restaurantId, Request $request): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForMenuManage($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;
        $name = trim((string) $validated['category_name']);

        $exists = DB::table('menu_categories')
            ->where('restaurant_id', $targetId)
            ->where('category_name', $name)
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'category_name' => ['A menu category with this name already exists for your restaurant.'],
            ]);
        }

        $nextOrder = ((int) DB::table('menu_categories')->where('restaurant_id', $targetId)->max('sort_order')) + 1;

        $categoryId = DB::transaction(function () use ($targetId, $name, $validated, $nextOrder, $user, $request): int {
            $now = now();
            $id = (int) DB::table('menu_categories')->insertGetId([
                'restaurant_id' => $targetId,
                'category_name' => $name,
                'description' => ! empty($validated['description']) ? trim((string) $validated['description']) : null,
                'sort_order' => $validated['sort_order'] ?? $nextOrder,
                'is_active' => array_key_exists('is_active', $validated) ? ((bool) $validated['is_active'] ? 1 : 0) : 1,
                'draft_state' => 'new',
                'is_published' => 0,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_menu_category_created',
                entityType: 'menu_categories',
                entityId: $id,
                newValues: ['restaurant_id' => $targetId, 'category_name' => $name],
                request: $request,
            );

            return $id;
        });

        $this->bestEffortEnsureCategoryFolder($restaurant, $categoryId, $name);

        return collect($this->listCategories($user, $targetId))->firstWhere('id', $categoryId);
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function updateCategory(User $user, int $categoryId, array $validated, ?int $restaurantId, Request $request): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForMenuManage($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $category = DB::table('menu_categories')
            ->where('menu_category_id', $categoryId)
            ->where('restaurant_id', $targetId)
            ->first();

        abort_unless($category !== null, 404, 'Menu category not found.');

        $newName = array_key_exists('category_name', $validated)
            ? trim((string) $validated['category_name'])
            : $category->category_name;

        $duplicate = DB::table('menu_categories')
            ->where('restaurant_id', $targetId)
            ->where('menu_category_id', '!=', $categoryId)
            ->where('category_name', $newName)
            ->exists();

        if ($duplicate) {
            throw ValidationException::withMessages([
                'category_name' => ['Another category with this name already exists.'],
            ]);
        }

        $updates = $this->buildCategoryUpdates($validated, $category, $newName);

        DB::transaction(function () use ($categoryId, $category, $updates, $user, $request): void {
            DB::table('menu_categories')->where('menu_category_id', $categoryId)->update($updates);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_menu_category_updated',
                entityType: 'menu_categories',
                entityId: $categoryId,
                oldValues: ['category_name' => $category->category_name, 'is_active' => (bool) $category->is_active],
                newValues: ['category_name' => $updates['category_name'], 'is_active' => (bool) $updates['is_active']],
                request: $request,
            );
        });

        if ($newName !== $category->category_name) {
            $this->bestEffortRenameCategoryFolder($restaurant, $categoryId, $newName);
        }

        return collect($this->listCategories($user, $targetId))->firstWhere('id', $categoryId);
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function buildCategoryUpdates(array $validated, object $category, string $newName): array
    {
        $newDescription = array_key_exists('description', $validated)
            ? ($validated['description'] !== null ? trim((string) $validated['description']) : null)
            : $category->description;
        $newSortOrder = array_key_exists('sort_order', $validated)
            ? (int) $validated['sort_order']
            : (int) $category->sort_order;
        $newIsActive = array_key_exists('is_active', $validated)
            ? ((bool) $validated['is_active'] ? 1 : 0)
            : (int) $category->is_active;

        return [
            'category_name' => $newName,
            'description' => $newDescription,
            'sort_order' => $newSortOrder,
            'is_active' => $newIsActive,
            'draft_state' => $this->computeCategoryDraftState($category, $newName, $newDescription, $newSortOrder, $newIsActive),
            'updated_at' => now(),
        ];
    }

    /**
     * @param  array<int, int>  $orderedIds
     * @return array<int, array<string, mixed>>
     */
    public function reorderCategories(User $user, array $orderedIds, ?int $restaurantId, Request $request): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForMenuManage($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $existingRows = DB::table('menu_categories')
            ->where('restaurant_id', $targetId)
            ->get()
            ->keyBy('menu_category_id');

        foreach ($orderedIds as $catId) {
            if (! $existingRows->has((int) $catId)) {
                throw ValidationException::withMessages([
                    'ordered_ids' => ['All category IDs must belong to your restaurant.'],
                ]);
            }
        }

        DB::transaction(function () use ($orderedIds, $targetId, $existingRows, $user, $request): void {
            $now = now();
            foreach (array_values($orderedIds) as $index => $catId) {
                $cat = $existingRows->get((int) $catId);
                $draftState = $this->computeCategoryDraftState(
                    $cat,
                    (string) $cat->category_name,
                    $cat->description,
                    $index,
                    (int) $cat->is_active,
                );
                DB::table('menu_categories')
                    ->where('menu_category_id', (int) $catId)
                    ->where('restaurant_id', $targetId)
                    ->update([
                        'sort_order' => $index,
                        'draft_state' => $draftState,
                        'updated_at' => $now,
                    ]);
            }

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_menu_categories_reordered',
                entityType: 'restaurants',
                entityId: $targetId,
                newValues: ['ordered_ids' => array_map('intval', $orderedIds)],
                request: $request,
            );
        });

        return $this->listCategories($user, $targetId);
    }

    public function deleteCategory(User $user, int $categoryId, ?int $restaurantId, Request $request): void
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForMenuManage($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $category = DB::table('menu_categories')
            ->where('menu_category_id', $categoryId)
            ->where('restaurant_id', $targetId)
            ->first();

        abort_unless($category !== null, 404, 'Menu category not found.');

        $hasItems = DB::table('menu_items')
            ->where('restaurant_id', $targetId)
            ->where('menu_category_id', $categoryId)
            ->where('draft_state', '!=', 'pending_delete')
            ->exists();

        if ($hasItems) {
            throw new ConflictHttpException(
                'Cannot delete a category that still has menu items. Move the items or archive the category instead.'
            );
        }

        DB::transaction(function () use ($categoryId, $targetId, $category, $user, $request): void {
            if ((int) $category->is_published === 1) {
                DB::table('menu_categories')
                    ->where('menu_category_id', $categoryId)
                    ->where('restaurant_id', $targetId)
                    ->update(['draft_state' => 'pending_delete', 'updated_at' => now()]);
            } else {
                DB::table('menu_categories')
                    ->where('menu_category_id', $categoryId)
                    ->where('restaurant_id', $targetId)
                    ->delete();
            }

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_menu_category_deleted',
                entityType: 'menu_categories',
                entityId: $categoryId,
                oldValues: [
                    'restaurant_id' => $targetId,
                    'category_name' => $category->category_name,
                    'pending_delete' => (int) $category->is_published === 1,
                ],
                request: $request,
            );
        });

        if ((int) $category->is_published !== 1) {
            $this->bestEffortTrashCategoryFolder($restaurant, $categoryId, (string) $category->category_name);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function restoreCategory(User $user, int $categoryId, ?int $restaurantId, Request $request): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForMenuManage($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $category = DB::table('menu_categories')
            ->where('menu_category_id', $categoryId)
            ->where('restaurant_id', $targetId)
            ->first();

        abort_unless($category !== null, 404, 'Menu category not found.');

        if ($category->draft_state === 'pending_delete') {
            $nextState = $this->computeCategoryDraftState(
                $category,
                (string) $category->category_name,
                $category->description,
                (int) $category->sort_order,
                (int) $category->is_active,
                ignorePendingDelete: true,
            );

            DB::transaction(function () use ($categoryId, $targetId, $nextState, $user, $request): void {
                DB::table('menu_categories')
                    ->where('menu_category_id', $categoryId)
                    ->where('restaurant_id', $targetId)
                    ->update(['draft_state' => $nextState, 'updated_at' => now()]);

                $this->auditLogService->record(
                    actorUserId: (int) $user->user_id,
                    action: 'owner_menu_category_restored',
                    entityType: 'menu_categories',
                    entityId: $categoryId,
                    newValues: ['restaurant_id' => $targetId, 'draft_state' => $nextState],
                    request: $request,
                );
            });
        }

        return collect($this->listCategories($user, $targetId))->firstWhere('id', $categoryId);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listItems(User $user, ?int $restaurantId = null): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForMenuView($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $categoriesById = DB::table('menu_categories')
            ->where('restaurant_id', $targetId)
            ->get(['menu_category_id', 'category_name', 'sort_order'])
            ->keyBy('menu_category_id');

        $items = DB::table('menu_items')
            ->where('restaurant_id', $targetId)
            ->get([
                'menu_item_id',
                'restaurant_id',
                'menu_category_id',
                'item_name',
                'description',
                'photo_image',
                'base_price',
                'availability_status',
                'approval_status',
                'sort_order',
                'draft_state',
                'is_published',
                'published_menu_category_id',
                'published_item_name',
                'published_description',
                'published_photo_image',
                'published_base_price',
                'published_sort_order',
                'published_at',
            ])
            ->filter(static fn (object $row): bool => $categoriesById->has($row->menu_category_id))
            ->map(function (object $row) use ($categoriesById): object {
                $cat = $categoriesById->get($row->menu_category_id);
                $row->category_name = $cat->category_name;
                $row->category_sort_order = (int) $cat->sort_order;

                return $row;
            })
            ->all();

        usort($items, static function (object $a, object $b): int {
            if ($a->category_sort_order !== $b->category_sort_order) {
                return $a->category_sort_order <=> $b->category_sort_order;
            }
            if ((int) $a->sort_order !== (int) $b->sort_order) {
                return (int) $a->sort_order <=> (int) $b->sort_order;
            }

            return (int) $a->menu_item_id <=> (int) $b->menu_item_id;
        });

        $itemIds = array_map(static fn (object $row): int => (int) $row->menu_item_id, $items);
        $addOnsByItem = $this->loadAddOnGroupsByItemIds($itemIds);

        return array_values(array_map(
            fn (object $row): array => $this->formatItem($row, $addOnsByItem[(int) $row->menu_item_id] ?? []),
            $items,
        ));
    }

    /**
     * Replace/sync add-on groups and options for a menu item.
     *
     * @param  array<int, array<string, mixed>>  $groups
     * @return array<string, mixed>
     */
    public function syncAddOnGroups(
        User $user,
        int $itemId,
        array $groups,
        ?int $restaurantId,
        Request $request,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForMenuManage($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;
        $this->findOwnedMenuItem($itemId, $targetId);

        $normalizedGroups = [];
        foreach (array_values($groups) as $gIdx => $group) {
            $groupName = trim((string) ($group['group_name'] ?? $group['name'] ?? ''));
            if ($groupName === '' || mb_strlen($groupName) > 100) {
                throw ValidationException::withMessages([
                    "groups.{$gIdx}.group_name" => ['Add-on group name is required (max 100 characters).'],
                ]);
            }

            $isRequired = (bool) ($group['is_required'] ?? $group['required'] ?? false);
            $minSel = (int) ($group['minimum_selections'] ?? $group['min'] ?? ($isRequired ? 1 : 0));
            $maxSel = (int) ($group['maximum_selections'] ?? $group['max'] ?? 1);
            if ($minSel < 0 || $maxSel < 1 || $minSel > $maxSel) {
                throw ValidationException::withMessages([
                    "groups.{$gIdx}.minimum_selections" => ['Selection bounds must satisfy 0 <= minimum_selections <= maximum_selections (max >= 1).'],
                ]);
            }

            $rawOptions = is_array($group['options'] ?? null) ? $group['options'] : [];
            $normalizedOptions = [];
            foreach (array_values($rawOptions) as $oIdx => $opt) {
                $optName = trim((string) ($opt['option_name'] ?? $opt['name'] ?? ''));
                if ($optName === '' || mb_strlen($optName) > 100) {
                    throw ValidationException::withMessages([
                        "groups.{$gIdx}.options.{$oIdx}.option_name" => ['Option name is required (max 100 characters).'],
                    ]);
                }

                $price = (float) ($opt['additional_price'] ?? $opt['price'] ?? 0);
                if ($price < 0) {
                    throw ValidationException::withMessages([
                        "groups.{$gIdx}.options.{$oIdx}.additional_price" => ['Additional price must be 0 or greater.'],
                    ]);
                }

                $normalizedOptions[] = [
                    'option_name' => $optName,
                    'additional_price' => number_format($price, 2, '.', ''),
                    'is_available' => (bool) ($opt['is_available'] ?? $opt['available'] ?? true) ? 1 : 0,
                    'sort_order' => (int) ($opt['sort_order'] ?? $oIdx),
                ];
            }

            $normalizedGroups[] = [
                'group_name' => $groupName,
                'is_required' => $isRequired ? 1 : 0,
                'minimum_selections' => $minSel,
                'maximum_selections' => $maxSel,
                'sort_order' => (int) ($group['sort_order'] ?? $gIdx),
                'options' => $normalizedOptions,
            ];
        }

        DB::transaction(function () use ($itemId, $normalizedGroups, $user, $request): void {
            DB::table('add_on_groups')->where('menu_item_id', $itemId)->delete();

            $now = now();
            foreach ($normalizedGroups as $group) {
                $groupId = (int) DB::table('add_on_groups')->insertGetId([
                    'menu_item_id' => $itemId,
                    'group_name' => $group['group_name'],
                    'is_required' => $group['is_required'],
                    'minimum_selections' => $group['minimum_selections'],
                    'maximum_selections' => $group['maximum_selections'],
                    'sort_order' => $group['sort_order'],
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                foreach ($group['options'] as $option) {
                    DB::table('add_on_options')->insert([
                        'add_on_group_id' => $groupId,
                        'option_name' => $option['option_name'],
                        'additional_price' => $option['additional_price'],
                        'is_available' => $option['is_available'],
                        'sort_order' => $option['sort_order'],
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_menu_item_addons_updated',
                entityType: 'menu_items',
                entityId: $itemId,
                newValues: ['groups_count' => count($normalizedGroups)],
                request: $request,
            );
        });

        return $this->getFormattedItem($itemId, $targetId);
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function createItem(User $user, array $validated, ?UploadedFile $photoFile, ?int $restaurantId, Request $request): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForMenuManage($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;
        $categoryId = (int) $validated['menu_category_id'];

        $this->assertCategoryOwnedByRestaurant($categoryId, $targetId);

        $storedPhotoPath = $this->storeMenuPhotoIfPresent($photoFile, $restaurant, $categoryId);
        try {
            $itemId = $this->persistNewItem($targetId, $categoryId, $validated, $storedPhotoPath, $user, $request);
        } catch (\Throwable $e) {
            if ($storedPhotoPath !== null) {
                $this->fileStorageService->cleanupStoredPaths([$storedPhotoPath], []);
            }
            throw $e;
        }

        return $this->getFormattedItem($itemId, $targetId);
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function persistNewItem(
        int $targetId,
        int $categoryId,
        array $validated,
        ?string $storedPhotoPath,
        User $user,
        Request $request,
    ): int {
        return DB::transaction(function () use ($targetId, $categoryId, $validated, $storedPhotoPath, $user, $request): int {
            $now = now();
            $nextOrder = ((int) DB::table('menu_items')->where('restaurant_id', $targetId)->max('sort_order')) + 1;
            $price = number_format((float) $validated['base_price'], 2, '.', '');
            $availability = (string) ($validated['availability_status'] ?? 'available');

            $id = (int) DB::table('menu_items')->insertGetId([
                'restaurant_id' => $targetId,
                'menu_category_id' => $categoryId,
                'item_name' => trim((string) $validated['item_name']),
                'description' => ! empty($validated['description']) ? trim((string) $validated['description']) : null,
                'photo_image' => $storedPhotoPath,
                'base_price' => $price,
                'availability_status' => $availability,
                'approval_status' => 'approved',
                'sort_order' => $validated['sort_order'] ?? $nextOrder,
                'draft_state' => 'new',
                'is_published' => 0,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_menu_item_created',
                entityType: 'menu_items',
                entityId: $id,
                newValues: [
                    'restaurant_id' => $targetId,
                    'menu_category_id' => $categoryId,
                    'item_name' => trim((string) $validated['item_name']),
                    'base_price' => $price,
                    'availability_status' => $availability,
                ],
                request: $request,
            );

            return $id;
        });
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function updateItem(
        User $user,
        int $itemId,
        array $validated,
        ?UploadedFile $photoFile,
        bool $removePhoto,
        ?int $restaurantId,
        Request $request,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForMenuManage($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;
        $existing = $this->findOwnedMenuItem($itemId, $targetId);

        $categoryId = array_key_exists('menu_category_id', $validated)
            ? (int) $validated['menu_category_id']
            : (int) $existing->menu_category_id;
        $this->assertCategoryOwnedByRestaurant($categoryId, $targetId);

        $oldPhoto = $existing->photo_image;
        $newlyStoredPath = null;
        try {
            $newlyStoredPath = $this->storeMenuPhotoIfPresent($photoFile, $restaurant, $categoryId);
            $newPhoto = $newlyStoredPath ?? ($removePhoto ? null : $oldPhoto);
            $updates = $this->buildItemUpdates($validated, $existing, $categoryId, $newPhoto);
            $this->persistItemUpdate($itemId, $existing, $updates, $user, $request);
        } catch (\Throwable $e) {
            if ($newlyStoredPath !== null) {
                $this->fileStorageService->cleanupStoredPaths([$newlyStoredPath], []);
            }
            throw $e;
        }

        $this->deleteOldMenuPhotoIfReplaced($oldPhoto, $newPhoto);

        if ($categoryId !== (int) $existing->menu_category_id && $newlyStoredPath === null && ! $removePhoto && $newPhoto !== null) {
            $this->fileStorageService->moveMenuPhotoToCategory($newPhoto, $this->buildCategoryFolderContext($restaurant, $categoryId));
        }

        return $this->getFormattedItem($itemId, $targetId);
    }

    private function storeMenuPhotoIfPresent(?UploadedFile $photoFile, object $restaurant, int $categoryId): ?string
    {
        if ($photoFile === null) {
            return null;
        }

        $restaurantId = (int) $restaurant->restaurant_id;

        return $this->fileStorageService->storePublicImageForPurpose(
            file: $photoFile,
            purpose: StoragePurpose::MENU_ITEM_PHOTO,
            ownerContext: $this->buildCategoryFolderContext($restaurant, $categoryId),
            localDirectory: "restaurants/{$restaurantId}/menu",
            fieldName: 'photo',
        )['path'];
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function buildItemUpdates(array $validated, object $existing, int $categoryId, ?string $newPhoto): array
    {
        $newName = array_key_exists('item_name', $validated) ? trim((string) $validated['item_name']) : $existing->item_name;
        $newDescription = array_key_exists('description', $validated)
            ? ($validated['description'] !== null ? trim((string) $validated['description']) : null)
            : $existing->description;
        $newPrice = array_key_exists('base_price', $validated)
            ? number_format((float) $validated['base_price'], 2, '.', '')
            : number_format((float) $existing->base_price, 2, '.', '');
        $newSortOrder = array_key_exists('sort_order', $validated) ? (int) $validated['sort_order'] : (int) $existing->sort_order;

        return [
            'menu_category_id' => $categoryId,
            'item_name' => $newName,
            'description' => $newDescription,
            'photo_image' => $newPhoto,
            'base_price' => $newPrice,
            'availability_status' => array_key_exists('availability_status', $validated)
                ? (string) $validated['availability_status']
                : (string) $existing->availability_status,
            'sort_order' => $newSortOrder,
            'draft_state' => $this->computeItemDraftState(
                $existing,
                $categoryId,
                $newName,
                $newDescription,
                $newPhoto,
                $newPrice,
                $newSortOrder,
            ),
            'updated_at' => now(),
        ];
    }

    /**
     * @param  array<string, mixed>  $updates
     */
    private function persistItemUpdate(int $itemId, object $existing, array $updates, User $user, Request $request): void
    {
        DB::transaction(function () use ($itemId, $existing, $updates, $user, $request): void {
            DB::table('menu_items')->where('menu_item_id', $itemId)->update($updates);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_menu_item_updated',
                entityType: 'menu_items',
                entityId: $itemId,
                oldValues: [
                    'item_name' => $existing->item_name,
                    'base_price' => (string) $existing->base_price,
                    'availability_status' => $existing->availability_status,
                    'menu_category_id' => (int) $existing->menu_category_id,
                ],
                newValues: [
                    'item_name' => $updates['item_name'],
                    'base_price' => $updates['base_price'],
                    'availability_status' => $updates['availability_status'],
                    'menu_category_id' => (int) $updates['menu_category_id'],
                ],
                request: $request,
            );
        });
    }

    private function findOwnedMenuItem(int $itemId, int $restaurantId): object
    {
        $existing = DB::table('menu_items')
            ->where('menu_item_id', $itemId)
            ->where('restaurant_id', $restaurantId)
            ->first();

        abort_unless($existing !== null, 404, 'Menu item not found.');

        return $existing;
    }

    private function deleteOldMenuPhotoIfReplaced(?string $oldPhoto, ?string $newPhoto): void
    {
        if ($oldPhoto !== null && $oldPhoto !== '' && $oldPhoto !== $newPhoto) {
            $this->fileStorageService->deleteIfUnreferenced(
                'public',
                $oldPhoto,
                fn (string $path): bool => $this->isMenuPhotoReferenced($path),
            );
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function updateItemAvailability(User $user, int $itemId, string $availabilityStatus, ?int $restaurantId, Request $request): array
    {
        return $this->updateItem(
            user: $user,
            itemId: $itemId,
            validated: ['availability_status' => $availabilityStatus],
            photoFile: null,
            removePhoto: false,
            restaurantId: $restaurantId,
            request: $request,
        );
    }

    public function deleteItem(User $user, int $itemId, ?int $restaurantId, Request $request): void
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForMenuManage($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;
        $existing = $this->findOwnedMenuItem($itemId, $targetId);

        if (DB::table('order_items')->where('menu_item_id', $itemId)->exists()) {
            throw new ConflictHttpException(
                'This menu item cannot be deleted because it is referenced by existing orders. Set its availability to Hidden instead.'
            );
        }

        $oldPhoto = $existing->photo_image;
        $isPublished = (int) $existing->is_published === 1;

        DB::transaction(function () use ($itemId, $targetId, $existing, $isPublished, $user, $request): void {
            if ($isPublished) {
                DB::table('menu_items')
                    ->where('menu_item_id', $itemId)
                    ->where('restaurant_id', $targetId)
                    ->update(['draft_state' => 'pending_delete', 'updated_at' => now()]);
            } else {
                DB::table('menu_items')->where('menu_item_id', $itemId)->where('restaurant_id', $targetId)->delete();
            }

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_menu_item_deleted',
                entityType: 'menu_items',
                entityId: $itemId,
                oldValues: [
                    'restaurant_id' => $targetId,
                    'item_name' => $existing->item_name,
                    'base_price' => (string) $existing->base_price,
                    'pending_delete' => $isPublished,
                ],
                request: $request,
            );
        });

        if (! $isPublished) {
            $this->deleteOldMenuPhotoIfReplaced($oldPhoto, null);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function restoreItem(User $user, int $itemId, ?int $restaurantId, Request $request): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForMenuManage($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;
        $existing = $this->findOwnedMenuItem($itemId, $targetId);

        if ($existing->draft_state === 'pending_delete') {
            $nextState = $this->computeItemDraftState(
                $existing,
                (int) $existing->menu_category_id,
                (string) $existing->item_name,
                $existing->description,
                $existing->photo_image,
                number_format((float) $existing->base_price, 2, '.', ''),
                (int) $existing->sort_order,
                ignorePendingDelete: true,
            );

            DB::transaction(function () use ($itemId, $targetId, $nextState, $user, $request): void {
                DB::table('menu_items')
                    ->where('menu_item_id', $itemId)
                    ->where('restaurant_id', $targetId)
                    ->update(['draft_state' => $nextState, 'updated_at' => now()]);

                $this->auditLogService->record(
                    actorUserId: (int) $user->user_id,
                    action: 'owner_menu_item_restored',
                    entityType: 'menu_items',
                    entityId: $itemId,
                    newValues: ['restaurant_id' => $targetId, 'draft_state' => $nextState],
                    request: $request,
                );
            });
        }

        return $this->getFormattedItem($itemId, $targetId);
    }

    private function assertCategoryOwnedByRestaurant(int $categoryId, int $restaurantId): void
    {
        $exists = DB::table('menu_categories')
            ->where('menu_category_id', $categoryId)
            ->where('restaurant_id', $restaurantId)
            ->exists();

        if (! $exists) {
            throw ValidationException::withMessages([
                'menu_category_id' => ['The selected menu category does not belong to this restaurant.'],
            ]);
        }
    }

    private function isMenuPhotoReferenced(string $relativePath): bool
    {
        return $this->fileStorageService->isPublicAssetReferenced($relativePath);
    }

    /**
     * @return array<string, mixed>
     */
    private function buildCategoryFolderContext(object $restaurant, int $categoryId, ?string $categoryName = null): array
    {
        $restaurantId = (int) $restaurant->restaurant_id;
        $brandId = (int) ($restaurant->brand_restaurant_id ?: ($restaurant->parent_restaurant_id ?: $restaurantId));
        $isMainBranch = ($restaurant->parent_restaurant_id ?? null) === null;
        $resolvedCatName = $categoryName ?? (string) (DB::table('menu_categories')->where('menu_category_id', $categoryId)->value('category_name') ?? 'Category');

        return [
            'brand_restaurant_id' => $brandId,
            'restaurant_id' => $restaurantId,
            'restaurant_name' => (string) $restaurant->restaurant_name,
            'branch_name' => $restaurant->branch_name ?? null,
            'is_main_branch' => $isMainBranch,
            'menu_category_id' => $categoryId,
            'category_name' => $resolvedCatName,
        ];
    }

    private function bestEffortEnsureCategoryFolder(object $restaurant, int $categoryId, string $categoryName): void
    {
        if (strtolower(trim((string) config('salo.uploads.public_image_driver', 'local'))) !== 'google_drive') {
            return;
        }

        try {
            $this->fileStorageService->folders()->resolveMenuCategoryFolder(
                $this->buildCategoryFolderContext($restaurant, $categoryId, $categoryName)
            );
        } catch (\Throwable $e) {
            Log::warning('Best-effort Drive category folder creation failed.', ['category_id' => $categoryId, 'error' => $e->getMessage()]);
        }
    }

    private function bestEffortRenameCategoryFolder(object $restaurant, int $categoryId, string $newName): void
    {
        if (strtolower(trim((string) config('salo.uploads.public_image_driver', 'local'))) !== 'google_drive') {
            return;
        }

        try {
            $this->fileStorageService->folders()->renameMenuCategoryFolder(
                $this->buildCategoryFolderContext($restaurant, $categoryId, $newName),
                $newName,
            );
        } catch (\Throwable $e) {
            Log::warning('Best-effort Drive category folder rename failed.', ['category_id' => $categoryId, 'error' => $e->getMessage()]);
        }
    }

    private function bestEffortTrashCategoryFolder(object $restaurant, int $categoryId, string $categoryName): void
    {
        if (strtolower(trim((string) config('salo.uploads.public_image_driver', 'local'))) !== 'google_drive') {
            return;
        }

        try {
            $this->fileStorageService->folders()->trashMenuCategoryFolder(
                $this->buildCategoryFolderContext($restaurant, $categoryId, $categoryName)
            );
        } catch (\Throwable $e) {
            Log::warning('Best-effort Drive category folder trash failed.', ['category_id' => $categoryId, 'error' => $e->getMessage()]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function getFormattedItem(int $itemId, int $restaurantId): array
    {
        $row = DB::table('menu_items as mi')
            ->join('menu_categories as mc', 'mc.menu_category_id', '=', 'mi.menu_category_id')
            ->where('mi.menu_item_id', $itemId)
            ->where('mi.restaurant_id', $restaurantId)
            ->first([
                'mi.menu_item_id',
                'mi.restaurant_id',
                'mi.menu_category_id',
                'mi.item_name',
                'mi.description',
                'mi.photo_image',
                'mi.base_price',
                'mi.availability_status',
                'mi.approval_status',
                'mi.sort_order',
                'mi.draft_state',
                'mi.is_published',
                'mi.published_menu_category_id',
                'mi.published_item_name',
                'mi.published_description',
                'mi.published_photo_image',
                'mi.published_base_price',
                'mi.published_sort_order',
                'mi.published_at',
                'mc.category_name',
            ]);

        abort_unless($row !== null, 404, 'Menu item not found.');

        $addOns = $this->loadAddOnGroupsByItemIds([(int) $row->menu_item_id]);

        return $this->formatItem($row, $addOns[(int) $row->menu_item_id] ?? []);
    }

    /**
     * @param  array<int, int>  $itemIds
     * @return array<int, array<int, array<string, mixed>>>
     */
    private function loadAddOnGroupsByItemIds(array $itemIds): array
    {
        if ($itemIds === []) {
            return [];
        }

        $groups = DB::table('add_on_groups')
            ->whereIn('menu_item_id', $itemIds)
            ->orderBy('sort_order')
            ->orderBy('add_on_group_id')
            ->get();

        if ($groups->isEmpty()) {
            return [];
        }

        $groupIds = $groups->pluck('add_on_group_id')->map(static fn ($id): int => (int) $id)->all();
        $optionsByGroup = DB::table('add_on_options')
            ->whereIn('add_on_group_id', $groupIds)
            ->orderBy('sort_order')
            ->orderBy('add_on_option_id')
            ->get()
            ->groupBy('add_on_group_id');

        $result = [];
        foreach ($groups as $g) {
            $gid = (int) $g->add_on_group_id;
            $itemId = (int) $g->menu_item_id;
            $opts = ($optionsByGroup->get($gid) ?? collect())->map(static fn (object $o): array => [
                'id' => (int) $o->add_on_option_id,
                'option_name' => $o->option_name,
                'additional_price' => (float) $o->additional_price,
                'is_available' => (bool) $o->is_available,
                'sort_order' => (int) $o->sort_order,
            ])->values()->all();

            $result[$itemId][] = [
                'id' => $gid,
                'group_name' => $g->group_name,
                'is_required' => (bool) $g->is_required,
                'minimum_selections' => (int) $g->minimum_selections,
                'maximum_selections' => (int) $g->maximum_selections,
                'sort_order' => (int) $g->sort_order,
                'options' => $opts,
            ];
        }

        return $result;
    }

    /**
     * @return array<string, mixed>
     */
    private function formatCategory(object $row, int $itemsCount): array
    {
        $isPublished = (bool) $row->is_published;

        return [
            'id' => (int) $row->menu_category_id,
            'name' => $row->category_name,
            'description' => $row->description,
            'sort_order' => (int) $row->sort_order,
            'is_active' => (bool) $row->is_active,
            'items_count' => $itemsCount,
            'is_published' => $isPublished,
            'publish_state' => $this->resolvePublishState((string) $row->draft_state, $isPublished),
            'published' => $isPublished ? [
                'name' => $row->published_category_name,
                'description' => $row->published_description,
                'sort_order' => $row->published_sort_order !== null ? (int) $row->published_sort_order : null,
                'is_active' => $row->published_is_active !== null ? (bool) $row->published_is_active : null,
            ] : null,
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $addOnGroups
     * @return array<string, mixed>
     */
    private function formatItem(object $row, array $addOnGroups = []): array
    {
        $isPublished = (bool) $row->is_published;

        return [
            'id' => (int) $row->menu_item_id,
            'restaurant_id' => (int) $row->restaurant_id,
            'menu_category_id' => (int) $row->menu_category_id,
            'category' => $row->category_name,
            'name' => $row->item_name,
            'description' => $row->description,
            'photo_url' => $this->fileStorageService->publicUrl($row->photo_image),
            'price' => (float) $row->base_price,
            'availability' => $row->availability_status,
            'approval_status' => $row->approval_status,
            'sort_order' => (int) $row->sort_order,
            'add_on_groups' => $addOnGroups,
            'is_published' => $isPublished,
            'publish_state' => $this->resolvePublishState((string) $row->draft_state, $isPublished),
            'published' => $isPublished ? [
                'menu_category_id' => $row->published_menu_category_id !== null ? (int) $row->published_menu_category_id : null,
                'name' => $row->published_item_name,
                'description' => $row->published_description,
                'photo_url' => $this->fileStorageService->publicUrl($row->published_photo_image),
                'price' => $row->published_base_price !== null ? (float) $row->published_base_price : null,
                'sort_order' => $row->published_sort_order !== null ? (int) $row->published_sort_order : null,
                'published_at' => $row->published_at,
            ] : null,
        ];
    }

    private function resolvePublishState(string $draftState, bool $isPublished): string
    {
        if (! $isPublished) {
            return 'new';
        }

        return match ($draftState) {
            'clean' => 'published',
            'modified' => 'modified',
            'pending_delete' => 'pending_delete',
            default => 'new',
        };
    }

    private function computeCategoryDraftState(
        object $existing,
        string $name,
        ?string $description,
        int $sortOrder,
        int $isActive,
        bool $ignorePendingDelete = false,
    ): string {
        if ((int) $existing->is_published !== 1) {
            return 'new';
        }

        if (! $ignorePendingDelete && $existing->draft_state === 'pending_delete') {
            return 'pending_delete';
        }

        $matchesPublished = $name === $existing->published_category_name
            && $description === $existing->published_description
            && $sortOrder === (int) $existing->published_sort_order
            && $isActive === (int) $existing->published_is_active;

        return $matchesPublished ? 'clean' : 'modified';
    }

    private function computeItemDraftState(
        object $existing,
        int $categoryId,
        string $name,
        ?string $description,
        ?string $photoImage,
        string $price,
        int $sortOrder,
        bool $ignorePendingDelete = false,
    ): string {
        if ((int) $existing->is_published !== 1) {
            return 'new';
        }

        if (! $ignorePendingDelete && $existing->draft_state === 'pending_delete') {
            return 'pending_delete';
        }

        $publishedPrice = $existing->published_base_price !== null
            ? number_format((float) $existing->published_base_price, 2, '.', '')
            : null;

        $matchesPublished = $categoryId === (int) $existing->published_menu_category_id
            && $name === $existing->published_item_name
            && $description === $existing->published_description
            && $photoImage === $existing->published_photo_image
            && $price === $publishedPrice
            && $sortOrder === (int) $existing->published_sort_order;

        return $matchesPublished ? 'clean' : 'modified';
    }
}
