<?php

namespace App\Features\Restaurants\Services;

use App\Models\User;
use App\Support\AuditLogService;
use App\Support\FileStorageService;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class OwnerMenuService
{
    public function __construct(
        private readonly OwnerProfileService $ownerProfileService,
        private readonly FileStorageService $fileStorageService,
        private readonly AuditLogService $auditLogService,
    ) {}

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listCategories(User $user, ?int $restaurantId = null): array
    {
        $restaurant = $this->ownerProfileService->requireActiveOwnedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $counts = DB::table('menu_items')
            ->where('restaurant_id', $targetId)
            ->selectRaw('menu_category_id, COUNT(*) as total')
            ->groupBy('menu_category_id')
            ->pluck('total', 'menu_category_id');

        return DB::table('menu_categories')
            ->where('restaurant_id', $targetId)
            ->orderBy('sort_order')
            ->orderBy('menu_category_id')
            ->get(['menu_category_id', 'category_name', 'description', 'sort_order', 'is_active'])
            ->map(fn ($row) => [
                'id' => (int) $row->menu_category_id,
                'name' => $row->category_name,
                'description' => $row->description,
                'sort_order' => (int) $row->sort_order,
                'is_active' => (bool) $row->is_active,
                'items_count' => (int) ($counts[$row->menu_category_id] ?? 0),
            ])
            ->values()
            ->all();
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function createCategory(User $user, array $validated, ?int $restaurantId, Request $request): array
    {
        $restaurant = $this->ownerProfileService->requireActiveOwnedRestaurant($user, $restaurantId);
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

        return collect($this->listCategories($user, $targetId))->firstWhere('id', $categoryId);
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function updateCategory(User $user, int $categoryId, array $validated, ?int $restaurantId, Request $request): array
    {
        $restaurant = $this->ownerProfileService->requireActiveOwnedRestaurant($user, $restaurantId);
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

        return collect($this->listCategories($user, $targetId))->firstWhere('id', $categoryId);
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function buildCategoryUpdates(array $validated, object $category, string $newName): array
    {
        return [
            'category_name' => $newName,
            'description' => array_key_exists('description', $validated)
                ? ($validated['description'] !== null ? trim((string) $validated['description']) : null)
                : $category->description,
            'sort_order' => array_key_exists('sort_order', $validated) ? (int) $validated['sort_order'] : (int) $category->sort_order,
            'is_active' => array_key_exists('is_active', $validated) ? ((bool) $validated['is_active'] ? 1 : 0) : (int) $category->is_active,
            'updated_at' => now(),
        ];
    }

    /**
     * @param  array<int, int>  $orderedIds
     * @return array<int, array<string, mixed>>
     */
    public function reorderCategories(User $user, array $orderedIds, ?int $restaurantId, Request $request): array
    {
        $restaurant = $this->ownerProfileService->requireActiveOwnedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $existingIds = DB::table('menu_categories')
            ->where('restaurant_id', $targetId)
            ->pluck('menu_category_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        foreach ($orderedIds as $catId) {
            if (! in_array((int) $catId, $existingIds, true)) {
                throw ValidationException::withMessages([
                    'ordered_ids' => ['All category IDs must belong to your restaurant.'],
                ]);
            }
        }

        DB::transaction(function () use ($orderedIds, $targetId, $user, $request): void {
            $now = now();
            foreach (array_values($orderedIds) as $index => $catId) {
                DB::table('menu_categories')
                    ->where('menu_category_id', (int) $catId)
                    ->where('restaurant_id', $targetId)
                    ->update(['sort_order' => $index, 'updated_at' => $now]);
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
        $restaurant = $this->ownerProfileService->requireActiveOwnedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $category = DB::table('menu_categories')
            ->where('menu_category_id', $categoryId)
            ->where('restaurant_id', $targetId)
            ->first();

        abort_unless($category !== null, 404, 'Menu category not found.');

        $hasItems = DB::table('menu_items')
            ->where('restaurant_id', $targetId)
            ->where('menu_category_id', $categoryId)
            ->exists();

        if ($hasItems) {
            throw new ConflictHttpException(
                'Cannot delete a category that still has menu items. Move the items or archive the category instead.'
            );
        }

        DB::transaction(function () use ($categoryId, $targetId, $category, $user, $request): void {
            DB::table('menu_categories')
                ->where('menu_category_id', $categoryId)
                ->where('restaurant_id', $targetId)
                ->delete();

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_menu_category_deleted',
                entityType: 'menu_categories',
                entityId: $categoryId,
                oldValues: ['restaurant_id' => $targetId, 'category_name' => $category->category_name],
                request: $request,
            );
        });
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listItems(User $user, ?int $restaurantId = null): array
    {
        $restaurant = $this->ownerProfileService->requireActiveOwnedRestaurant($user, $restaurantId);
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

        return array_values(array_map(fn (object $row): array => $this->formatItem($row), $items));
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function createItem(User $user, array $validated, ?UploadedFile $photoFile, ?int $restaurantId, Request $request): array
    {
        $restaurant = $this->ownerProfileService->requireActiveOwnedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;
        $categoryId = (int) $validated['menu_category_id'];

        $this->assertCategoryOwnedByRestaurant($categoryId, $targetId);

        $storedPhotoPath = $this->storeMenuPhotoIfPresent($photoFile, $targetId);
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
        $restaurant = $this->ownerProfileService->requireActiveOwnedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;
        $existing = $this->findOwnedMenuItem($itemId, $targetId);

        $categoryId = array_key_exists('menu_category_id', $validated)
            ? (int) $validated['menu_category_id']
            : (int) $existing->menu_category_id;
        $this->assertCategoryOwnedByRestaurant($categoryId, $targetId);

        $oldPhoto = $existing->photo_image;
        $newlyStoredPath = null;
        try {
            $newlyStoredPath = $this->storeMenuPhotoIfPresent($photoFile, $targetId);
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

        return $this->getFormattedItem($itemId, $targetId);
    }

    private function storeMenuPhotoIfPresent(?UploadedFile $photoFile, int $restaurantId): ?string
    {
        if ($photoFile === null) {
            return null;
        }

        return $this->fileStorageService->storePublicImage(
            file: $photoFile,
            directory: "restaurants/{$restaurantId}/menu",
            fieldName: 'photo',
        )['path'];
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function buildItemUpdates(array $validated, object $existing, int $categoryId, ?string $newPhoto): array
    {
        return [
            'menu_category_id' => $categoryId,
            'item_name' => array_key_exists('item_name', $validated) ? trim((string) $validated['item_name']) : $existing->item_name,
            'description' => array_key_exists('description', $validated)
                ? ($validated['description'] !== null ? trim((string) $validated['description']) : null)
                : $existing->description,
            'photo_image' => $newPhoto,
            'base_price' => array_key_exists('base_price', $validated)
                ? number_format((float) $validated['base_price'], 2, '.', '')
                : (string) $existing->base_price,
            'availability_status' => array_key_exists('availability_status', $validated)
                ? (string) $validated['availability_status']
                : (string) $existing->availability_status,
            'sort_order' => array_key_exists('sort_order', $validated) ? (int) $validated['sort_order'] : (int) $existing->sort_order,
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
        $restaurant = $this->ownerProfileService->requireActiveOwnedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;
        $existing = $this->findOwnedMenuItem($itemId, $targetId);

        if (DB::table('order_items')->where('menu_item_id', $itemId)->exists()) {
            throw new ConflictHttpException(
                'This menu item cannot be deleted because it is referenced by existing orders. Set its availability to Hidden instead.'
            );
        }

        $oldPhoto = $existing->photo_image;

        DB::transaction(function () use ($itemId, $targetId, $existing, $user, $request): void {
            DB::table('menu_items')->where('menu_item_id', $itemId)->where('restaurant_id', $targetId)->delete();

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_menu_item_deleted',
                entityType: 'menu_items',
                entityId: $itemId,
                oldValues: [
                    'restaurant_id' => $targetId,
                    'item_name' => $existing->item_name,
                    'base_price' => (string) $existing->base_price,
                ],
                request: $request,
            );
        });

        $this->deleteOldMenuPhotoIfReplaced($oldPhoto, null);
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
        $prefixed = '/storage/'.ltrim($relativePath, '/');

        return DB::table('menu_items')
            ->whereIn('photo_image', [$relativePath, $prefixed])
            ->exists();
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
                'mc.category_name',
            ]);

        abort_unless($row !== null, 404, 'Menu item not found.');

        return $this->formatItem($row);
    }

    /**
     * @return array<string, mixed>
     */
    private function formatItem(object $row): array
    {
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
        ];
    }
}
