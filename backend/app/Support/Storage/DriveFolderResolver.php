<?php

namespace App\Support\Storage;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class DriveFolderResolver
{
    private const CACHE_TTL_SECONDS = 3600;

    public function __construct(
        private readonly DriveClientInterface $driveClient,
    ) {}

    public function rootFolderId(): string
    {
        $rootId = trim((string) config('salo.uploads.google_drive.public_folder_id', ''));
        if ($rootId === '') {
            Log::critical('Google Drive SALO root folder ID (GOOGLE_DRIVE_PUBLIC_FOLDER_ID) is not configured.');
            throw ImageStorageUnavailableException::credentialsInvalid();
        }

        return $rootId;
    }

    /**
     * Resolve or create the target Drive folder for a given storage purpose and owner context.
     *
     * @param  array<string, mixed>  $context
     */
    public function resolveFolderForPurpose(string $purpose, array $context): string
    {
        return match ($purpose) {
            StoragePurpose::RESTAURANT_LOGO => $this->resolveRestaurantSubfolder(
                brandId: (int) $context['brand_restaurant_id'],
                restaurantName: (string) ($context['restaurant_name'] ?? 'Restaurant'),
                subfolderName: 'Logo',
                saloType: 'restaurant_logo',
            ),
            StoragePurpose::RESTAURANT_COVER => $this->resolveRestaurantSubfolder(
                brandId: (int) $context['brand_restaurant_id'],
                restaurantName: (string) ($context['restaurant_name'] ?? 'Restaurant'),
                subfolderName: 'Cover Photo',
                saloType: 'restaurant_cover',
            ),
            StoragePurpose::MENU_ITEM_PHOTO => $this->resolveMenuCategoryFolder($context),
            StoragePurpose::APPLICATION_DOCUMENT => $this->resolveApplicationFolder($context),
            StoragePurpose::BRANCH_PERMIT => $this->resolveBranchPermitFolder($context),
            StoragePurpose::DELIVERY_CONFIRMATION => $this->resolveDeliveryMonthFolder($context),
            StoragePurpose::SUPPORT_ATTACHMENT => $this->resolveSupportFolder((string) ($context['ticket_ref'] ?? 'general')),
            default => throw new \InvalidArgumentException("Unsupported Drive folder purpose: {$purpose}"),
        };
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public function resolveMenuCategoryFolder(array $context): string
    {
        $brandId = (int) $context['brand_restaurant_id'];
        $restaurantId = (int) ($context['restaurant_id'] ?? $brandId);
        $restaurantName = (string) ($context['restaurant_name'] ?? 'Restaurant');
        $isMainBranch = (bool) ($context['is_main_branch'] ?? ($restaurantId === $brandId));
        $categoryId = (int) $context['menu_category_id'];
        $categoryName = DriveFolderName::sanitize((string) ($context['category_name'] ?? 'Category'), 'Category');

        $brandFolderId = $this->resolveRestaurantBrandFolder($brandId, $restaurantName);

        if ($isMainBranch) {
            $menuParentId = $this->resolveOrCreateFolder(
                parentId: $brandFolderId,
                name: 'Menu',
                saloType: 'restaurant_menu',
                saloId: "R-{$brandId}",
                visibility: StoragePurpose::VISIBILITY_PUBLIC,
            );
        } else {
            $branchesRootId = $this->resolveOrCreateFolder(
                parentId: $brandFolderId,
                name: 'Branches',
                saloType: 'restaurant_branches',
                saloId: "R-{$brandId}",
                visibility: StoragePurpose::VISIBILITY_PUBLIC,
            );
            $branchFolderId = $this->resolveOrCreateFolder(
                parentId: $branchesRootId,
                name: DriveFolderName::branch((string) ($context['branch_name'] ?? 'Branch'), $restaurantId),
                saloType: 'restaurant_branch',
                saloId: "R-{$restaurantId}",
                visibility: StoragePurpose::VISIBILITY_PUBLIC,
            );
            $menuParentId = $this->resolveOrCreateFolder(
                parentId: $branchFolderId,
                name: 'Menu',
                saloType: 'branch_menu',
                saloId: "R-{$restaurantId}",
                visibility: StoragePurpose::VISIBILITY_PUBLIC,
            );
        }

        return $this->resolveOrCreateFolder(
            parentId: $menuParentId,
            name: $categoryName,
            saloType: 'menu_category',
            saloId: "C-{$categoryId}",
            visibility: StoragePurpose::VISIBILITY_PUBLIC,
        );
    }

    public function resolveRestaurantBrandFolder(int $brandId, string $restaurantName): string
    {
        $restaurantsRootId = $this->resolveOrCreateFolder(
            parentId: $this->rootFolderId(),
            name: 'Restaurants',
            saloType: 'root_restaurants',
            saloId: 'root',
            visibility: StoragePurpose::VISIBILITY_PUBLIC,
        );

        return $this->resolveOrCreateFolder(
            parentId: $restaurantsRootId,
            name: DriveFolderName::restaurantBrand($restaurantName, $brandId),
            saloType: 'restaurant_brand',
            saloId: "R-{$brandId}",
            visibility: StoragePurpose::VISIBILITY_PUBLIC,
        );
    }

    private function resolveRestaurantSubfolder(int $brandId, string $restaurantName, string $subfolderName, string $saloType): string
    {
        $brandFolderId = $this->resolveRestaurantBrandFolder($brandId, $restaurantName);

        return $this->resolveOrCreateFolder(
            parentId: $brandFolderId,
            name: $subfolderName,
            saloType: $saloType,
            saloId: "R-{$brandId}",
            visibility: StoragePurpose::VISIBILITY_PUBLIC,
        );
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function resolveApplicationFolder(array $context): string
    {
        $appsRootId = $this->resolveOrCreateFolder(
            parentId: $this->rootFolderId(),
            name: 'Applications',
            saloType: 'root_applications',
            saloId: 'root',
            visibility: StoragePurpose::VISIBILITY_PRIVATE,
        );

        $type = (string) ($context['application_type'] ?? 'restaurant');
        $appId = (int) $context['application_id'];

        if ($type === 'rider') {
            $riderAppsRoot = $this->resolveOrCreateFolder(
                parentId: $appsRootId,
                name: 'Rider Applications',
                saloType: 'root_rider_applications',
                saloId: 'root',
                visibility: StoragePurpose::VISIBILITY_PRIVATE,
            );

            return $this->resolveOrCreateFolder(
                parentId: $riderAppsRoot,
                name: DriveFolderName::riderApplication((string) ($context['rider_name'] ?? 'Rider'), $appId),
                saloType: 'rider_application',
                saloId: "RDA-{$appId}",
                visibility: StoragePurpose::VISIBILITY_PRIVATE,
            );
        }

        $restAppsRoot = $this->resolveOrCreateFolder(
            parentId: $appsRootId,
            name: 'Restaurant Applications',
            saloType: 'root_restaurant_applications',
            saloId: 'root',
            visibility: StoragePurpose::VISIBILITY_PRIVATE,
        );

        return $this->resolveOrCreateFolder(
            parentId: $restAppsRoot,
            name: DriveFolderName::restaurantApplication(
                (string) ($context['owner_name'] ?? 'Owner'),
                (string) ($context['restaurant_name'] ?? 'Restaurant'),
                $appId,
            ),
            saloType: 'restaurant_application',
            saloId: "RA-{$appId}",
            visibility: StoragePurpose::VISIBILITY_PRIVATE,
        );
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function resolveBranchPermitFolder(array $context): string
    {
        $appFolderId = $this->resolveApplicationFolder([
            'application_type' => 'restaurant',
            'application_id' => (int) $context['application_id'],
            'owner_name' => (string) ($context['owner_name'] ?? 'Owner'),
            'restaurant_name' => (string) ($context['restaurant_name'] ?? 'Restaurant'),
        ]);

        $permitsParentId = $this->resolveOrCreateFolder(
            parentId: $appFolderId,
            name: 'Branch Permits',
            saloType: 'restaurant_app_branch_permits',
            saloId: 'RA-'.(int) $context['application_id'],
            visibility: StoragePurpose::VISIBILITY_PRIVATE,
        );

        $branchId = isset($context['restaurant_id']) ? (int) $context['restaurant_id'] : null;
        $appBranchId = isset($context['application_branch_id']) ? (int) $context['application_branch_id'] : null;

        if ($branchId !== null && $branchId > 0) {
            return $this->resolveOrCreateFolder(
                parentId: $permitsParentId,
                name: DriveFolderName::branch((string) ($context['branch_name'] ?? 'Branch'), $branchId),
                saloType: 'branch_permit',
                saloId: "R-{$branchId}",
                visibility: StoragePurpose::VISIBILITY_PRIVATE,
            );
        }

        return $this->resolveOrCreateFolder(
            parentId: $permitsParentId,
            name: DriveFolderName::applicationBranchPermit((string) ($context['branch_name'] ?? 'Branch'), (int) $appBranchId),
            saloType: 'branch_permit',
            saloId: "AB-{$appBranchId}",
            visibility: StoragePurpose::VISIBILITY_PRIVATE,
        );
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function resolveDeliveryMonthFolder(array $context): string
    {
        $ridersRoot = $this->resolveOrCreateFolder(
            parentId: $this->rootFolderId(),
            name: 'Riders',
            saloType: 'root_riders',
            saloId: 'root',
            visibility: StoragePurpose::VISIBILITY_PRIVATE,
        );

        $userId = (int) $context['rider_user_id'];
        $riderFolder = $this->resolveOrCreateFolder(
            parentId: $ridersRoot,
            name: DriveFolderName::rider((string) ($context['rider_name'] ?? 'Rider'), $userId),
            saloType: 'rider',
            saloId: "U-{$userId}",
            visibility: StoragePurpose::VISIBILITY_PRIVATE,
        );

        $confirmationsFolder = $this->resolveOrCreateFolder(
            parentId: $riderFolder,
            name: 'Delivery Confirmations',
            saloType: 'rider_deliveries',
            saloId: "U-{$userId}",
            visibility: StoragePurpose::VISIBILITY_PRIVATE,
        );

        $month = (string) ($context['month'] ?? now()->format('Y-m'));

        return $this->resolveOrCreateFolder(
            parentId: $confirmationsFolder,
            name: $month,
            saloType: 'rider_deliveries_month',
            saloId: "U-{$userId}-{$month}",
            visibility: StoragePurpose::VISIBILITY_PRIVATE,
        );
    }

    private function resolveSupportFolder(string $ticketRef): string
    {
        $supportRoot = $this->resolveOrCreateFolder(
            parentId: $this->rootFolderId(),
            name: 'Support',
            saloType: 'root_support',
            saloId: 'root',
            visibility: StoragePurpose::VISIBILITY_PRIVATE,
        );

        $cleanRef = DriveFolderName::sanitize($ticketRef, 'General');

        return $this->resolveOrCreateFolder(
            parentId: $supportRoot,
            name: $cleanRef,
            saloType: 'support_ticket',
            saloId: "SUP-{$cleanRef}",
            visibility: StoragePurpose::VISIBILITY_PRIVATE,
        );
    }

    public function resolveOrCreateFolder(
        string $parentId,
        string $name,
        string $saloType,
        string $saloId,
        string $visibility,
    ): string {
        $cacheKey = $this->folderCacheKey($parentId, $saloType, $saloId);
        $cached = Cache::get($cacheKey);
        if (is_string($cached) && $cached !== '') {
            return $cached;
        }

        $props = [
            'salo_type' => $saloType,
            'salo_id' => $saloId,
            'visibility' => $visibility,
        ];

        $existing = $this->driveClient->findFolderByAppProperties($parentId, [
            'salo_type' => $saloType,
            'salo_id' => $saloId,
        ]);

        if ($existing !== null) {
            Cache::put($cacheKey, $existing, self::CACHE_TTL_SECONDS);

            return $existing;
        }

        $lock = Cache::lock("lock:{$cacheKey}", 10);
        try {
            $lock->block(5);
            $recheck = $this->driveClient->findFolderByAppProperties($parentId, [
                'salo_type' => $saloType,
                'salo_id' => $saloId,
            ]);
            if ($recheck !== null) {
                Cache::put($cacheKey, $recheck, self::CACHE_TTL_SECONDS);

                return $recheck;
            }

            $created = $this->driveClient->createFolder($parentId, $name, $props);
            Cache::put($cacheKey, $created, self::CACHE_TTL_SECONDS);

            return $created;
        } catch (\Throwable $e) {
            if ($e instanceof ImageStorageUnavailableException) {
                throw $e;
            }
            $created = $this->driveClient->createFolder($parentId, $name, $props);
            Cache::put($cacheKey, $created, self::CACHE_TTL_SECONDS);

            return $created;
        } finally {
            optional($lock)->release();
        }
    }

    /**
     * Drop a cached folder ID so the next resolve re-queries by appProperties (Plan change 4d).
     */
    public function forgetFolderCache(string $parentId, string $saloType, string $saloId): void
    {
        Cache::forget($this->folderCacheKey($parentId, $saloType, $saloId));
    }

    /**
     * Drop all cached folder IDs along the path for a purpose so the next resolve re-queries by appProperties.
     *
     * @param  array<string, mixed>  $context
     */
    public function forgetPurposeCache(string $purpose, array $context): void
    {
        $rootId = $this->rootFolderId();
        $this->forgetFolderCache($rootId, 'root_restaurants', 'root');
        $this->forgetFolderCache($rootId, 'root_applications', 'root');
        $this->forgetFolderCache($rootId, 'root_riders', 'root');
        $this->forgetFolderCache($rootId, 'root_support', 'root');

        if (isset($context['brand_restaurant_id'])) {
            $brandId = (int) $context['brand_restaurant_id'];
            $restaurantsRoot = $this->resolveOrCreateFolder($rootId, 'Restaurants', 'root_restaurants', 'root', StoragePurpose::VISIBILITY_PUBLIC);
            $brandFolderId = Cache::get($this->folderCacheKey($restaurantsRoot, 'restaurant_brand', "R-{$brandId}"));
            if (is_string($brandFolderId) && $brandFolderId !== '') {
                $this->forgetFolderCache($brandFolderId, 'restaurant_logo', "R-{$brandId}");
                $this->forgetFolderCache($brandFolderId, 'restaurant_cover', "R-{$brandId}");
                $this->forgetFolderCache($brandFolderId, 'restaurant_menu', "R-{$brandId}");
                $this->forgetFolderCache($brandFolderId, 'restaurant_branches', "R-{$brandId}");
            }
            $this->forgetFolderCache($restaurantsRoot, 'restaurant_brand', "R-{$brandId}");
        }

        if ($purpose === StoragePurpose::MENU_ITEM_PHOTO && isset($context['menu_category_id'])) {
            $this->forgetAndReResolveMenuCategory($context);
        }
    }

    /**
     * Best-effort rename of an existing category folder by appProperties.
     *
     * @param  array<string, mixed>  $context
     */
    public function renameMenuCategoryFolder(array $context, string $newCategoryName): void
    {
        $folderId = $this->resolveMenuCategoryFolder($context);
        $newName = DriveFolderName::sanitize($newCategoryName, 'Category');
        if (! $this->driveClient->renameFile($folderId, $newName)) {
            $this->forgetAndReResolveMenuCategory($context);
            $freshId = $this->resolveMenuCategoryFolder($context);
            $this->driveClient->renameFile($freshId, $newName);
        }
    }

    /**
     * Best-effort trash of an empty category folder.
     *
     * @param  array<string, mixed>  $context
     */
    public function trashMenuCategoryFolder(array $context): void
    {
        $folderId = $this->resolveMenuCategoryFolder($context);
        $this->driveClient->trashFile($folderId);
        $this->forgetAndReResolveMenuCategory($context);
    }

    /**
     * Best-effort rename of a restaurant brand folder by appProperties.
     */
    public function renameRestaurantBrandFolder(int $brandId, string $newRestaurantName): void
    {
        $restaurantsRootId = $this->resolveOrCreateFolder(
            parentId: $this->rootFolderId(),
            name: 'Restaurants',
            saloType: 'root_restaurants',
            saloId: 'root',
            visibility: StoragePurpose::VISIBILITY_PUBLIC,
        );

        $folderId = $this->driveClient->findFolderByAppProperties($restaurantsRootId, [
            'salo_type' => 'restaurant_brand',
            'salo_id' => "R-{$brandId}",
        ]);

        if ($folderId !== null) {
            $newName = DriveFolderName::restaurantBrand($newRestaurantName, $brandId);
            if (! $this->driveClient->renameFile($folderId, $newName)) {
                $this->forgetFolderCache($restaurantsRootId, 'restaurant_brand', "R-{$brandId}");
            }
        }
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function forgetAndReResolveMenuCategory(array $context): void
    {
        $brandId = (int) $context['brand_restaurant_id'];
        $restaurantId = (int) ($context['restaurant_id'] ?? $brandId);
        $isMainBranch = (bool) ($context['is_main_branch'] ?? ($restaurantId === $brandId));
        $categoryId = (int) $context['menu_category_id'];

        $brandFolderId = $this->resolveRestaurantBrandFolder($brandId, (string) ($context['restaurant_name'] ?? 'Restaurant'));
        if ($isMainBranch) {
            $menuParentId = $this->resolveOrCreateFolder($brandFolderId, 'Menu', 'restaurant_menu', "R-{$brandId}", StoragePurpose::VISIBILITY_PUBLIC);
        } else {
            $branchesRootId = $this->resolveOrCreateFolder($brandFolderId, 'Branches', 'restaurant_branches', "R-{$brandId}", StoragePurpose::VISIBILITY_PUBLIC);
            $branchFolderId = $this->resolveOrCreateFolder($branchesRootId, DriveFolderName::branch((string) ($context['branch_name'] ?? 'Branch'), $restaurantId), 'restaurant_branch', "R-{$restaurantId}", StoragePurpose::VISIBILITY_PUBLIC);
            $menuParentId = $this->resolveOrCreateFolder($branchFolderId, 'Menu', 'branch_menu', "R-{$restaurantId}", StoragePurpose::VISIBILITY_PUBLIC);
        }

        $this->forgetFolderCache($menuParentId, 'menu_category', "C-{$categoryId}");
    }

    private function folderCacheKey(string $parentId, string $saloType, string $saloId): string
    {
        return "salo:drive:folder:{$parentId}:{$saloType}:{$saloId}";
    }
}
