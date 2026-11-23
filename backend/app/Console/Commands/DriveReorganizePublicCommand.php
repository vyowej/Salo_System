<?php

namespace App\Console\Commands;

use App\Support\Storage\DriveClientInterface;
use App\Support\Storage\DriveFolderName;
use App\Support\Storage\DriveFolderResolver;
use App\Support\Storage\GoogleDrivePublicImageStore;
use App\Support\Storage\ImageStorageUnavailableException;
use App\Support\Storage\StoragePurpose;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class DriveReorganizePublicCommand extends Command
{
    protected $signature = 'salo:drive:reorganize-public
                            {--dry-run : Preview moves and visibility=public tagging without modifying Google Drive}
                            {--limit= : Maximum number of Drive files to process}
                            {--force : Run without interactive confirmation}';

    protected $description = 'Move existing flat-folder public Drive images into the structured SALO folder tree and tag visibility=public (no DB changes).';

    public function handle(DriveClientInterface $driveClient, DriveFolderResolver $folderResolver): int
    {
        $rootFolderId = trim((string) config('salo.uploads.google_drive.public_folder_id', ''));
        if ($rootFolderId === '') {
            $this->error('GOOGLE_DRIVE_PUBLIC_FOLDER_ID is not configured.');

            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');
        $limitOpt = $this->option('limit');
        $limit = is_numeric($limitOpt) && (int) $limitOpt > 0 ? (int) $limitOpt : null;

        $dbName = (string) (DB::selectOne('SELECT DATABASE() as db')->db ?? 'unknown');
        $this->line(sprintf(
            'Database: [%s] | Mode: %s | SALO Root: %s',
            $dbName,
            $dryRun ? 'DRY RUN (no Drive changes)' : 'LIVE (moves + tags Drive files; no DB changes)',
            $rootFolderId,
        ));

        if (! $dryRun && ! $this->option('force')) {
            if (! $this->confirm("Proceed with reorganizing public Drive files referenced in [{$dbName}]? (Have you backed up {$dbName} first?)", false)) {
                $this->warn('Aborted.');

                return self::FAILURE;
            }
        }

        $candidates = $this->collectCandidates($limit);
        $counts = [
            'total' => count($candidates),
            'reorganized' => 0,
            'already_organized' => 0,
            'missing_or_trashed' => 0,
            'failed' => 0,
        ];
        $details = [];

        foreach ($candidates as $item) {
            $storedValue = $item['stored'];
            $fileId = GoogleDrivePublicImageStore::extractFileId($storedValue);
            if ($fileId === null) {
                continue;
            }

            try {
                $meta = $driveClient->getFileMetadata($fileId);
            } catch (ImageStorageUnavailableException $e) {
                $counts['failed']++;
                $details[] = ['file_id' => $fileId, 'status' => 'failed', 'reason' => $e->getMessage()];

                continue;
            }

            if ($meta === null || (bool) ($meta['trashed'] ?? false)) {
                $counts['missing_or_trashed']++;
                $details[] = ['file_id' => $fileId, 'status' => 'missing_or_trashed', 'target' => $item['target_label']];

                continue;
            }

            $currentProps = is_array($meta['appProperties'] ?? null) ? $meta['appProperties'] : [];
            $hasPublicTag = ($currentProps['visibility'] ?? null) === StoragePurpose::VISIBILITY_PUBLIC;
            $currentParents = (array) ($meta['parents'] ?? []);

            if ($dryRun) {
                $counts['reorganized']++;
                $details[] = [
                    'file_id' => $fileId,
                    'status' => $hasPublicTag ? 'would_move' : 'would_move_and_tag_public',
                    'target' => $item['target_label'],
                ];

                continue;
            }

            try {
                $targetFolderId = $folderResolver->resolveFolderForPurpose($item['purpose'], $item['context']);
                $alreadyInFolder = in_array($targetFolderId, $currentParents, true);

                if ($alreadyInFolder && $hasPublicTag) {
                    $counts['already_organized']++;
                    $details[] = ['file_id' => $fileId, 'status' => 'already_organized', 'target' => $item['target_label']];

                    continue;
                }

                $appProperties = $this->buildAppProperties($item['purpose'], $item['context']);
                $ok = $driveClient->moveAndTagFile($storedValue, $targetFolderId, $appProperties);
                if ($ok) {
                    $counts['reorganized']++;
                    $details[] = ['file_id' => $fileId, 'status' => 'reorganized', 'target' => $item['target_label']];
                } else {
                    $counts['failed']++;
                    $details[] = ['file_id' => $fileId, 'status' => 'failed', 'reason' => 'Drive PATCH returned false'];
                }
            } catch (\Throwable $e) {
                $counts['failed']++;
                $details[] = ['file_id' => $fileId, 'status' => 'failed', 'reason' => $e->getMessage()];
            }
        }

        $this->table(
            ['Metric', 'Count'],
            [
                ['Total referenced Drive files', $counts['total']],
                [$dryRun ? 'Would reorganize' : 'Reorganized', $counts['reorganized']],
                ['Already organized', $counts['already_organized']],
                ['Missing or trashed in Drive', $counts['missing_or_trashed']],
                ['Failed', $counts['failed']],
            ],
        );

        $reportPath = 'reports/drive-reorganize-'.now()->format('Ymd_His').'.json';
        Storage::disk('local')->put($reportPath, json_encode([
            'dry_run' => $dryRun,
            'database' => $dbName,
            'counts' => $counts,
            'details' => $details,
        ], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));

        $this->info('Report written to private storage: '.$reportPath);

        return $counts['failed'] > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * @return list<array{stored: string, purpose: string, context: array<string, mixed>, target_label: string}>
     */
    private function collectCandidates(?int $limit): array
    {
        $itemsByFileId = [];

        $restaurants = DB::table('restaurants')
            ->select(['restaurant_id', 'parent_restaurant_id', 'brand_restaurant_id', 'restaurant_name', 'logo_image', 'cover_image'])
            ->where(function ($q): void {
                $q->where('logo_image', 'like', GoogleDrivePublicImageStore::PREFIX.'%')
                    ->orWhere('cover_image', 'like', GoogleDrivePublicImageStore::PREFIX.'%');
            })
            ->orderBy('restaurant_id')
            ->get();

        foreach ($restaurants as $r) {
            $brandId = (int) ($r->brand_restaurant_id ?: ($r->parent_restaurant_id ?: $r->restaurant_id));
            $brandLabel = DriveFolderName::restaurantBrand((string) $r->restaurant_name, $brandId);
            $context = [
                'brand_restaurant_id' => $brandId,
                'restaurant_name' => (string) $r->restaurant_name,
            ];

            foreach (['logo_image' => [StoragePurpose::RESTAURANT_LOGO, 'Logo'], 'cover_image' => [StoragePurpose::RESTAURANT_COVER, 'Cover Photo']] as $col => [$purpose, $sub]) {
                $val = is_string($r->{$col}) ? trim($r->{$col}) : '';
                if ($val !== '' && GoogleDrivePublicImageStore::isDriveValue($val) && ! isset($itemsByFileId[$val])) {
                    $itemsByFileId[$val] = [
                        'stored' => $val,
                        'purpose' => $purpose,
                        'context' => $context,
                        'target_label' => "Restaurants/{$brandLabel}/{$sub}",
                    ];
                }
            }
        }

        $menuItems = DB::table('menu_items as mi')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'mi.restaurant_id')
            ->join('menu_categories as mc', 'mc.menu_category_id', '=', 'mi.menu_category_id')
            ->select([
                'mi.photo_image',
                'mi.published_photo_image',
                'r.restaurant_id',
                'r.parent_restaurant_id',
                'r.brand_restaurant_id',
                'r.restaurant_name',
                'r.branch_name',
                'mc.menu_category_id',
                'mc.category_name',
            ])
            ->where(function ($q): void {
                $q->where('mi.photo_image', 'like', GoogleDrivePublicImageStore::PREFIX.'%')
                    ->orWhere('mi.published_photo_image', 'like', GoogleDrivePublicImageStore::PREFIX.'%');
            })
            ->orderBy('mi.menu_item_id')
            ->get();

        foreach ($menuItems as $mi) {
            $restaurantId = (int) $mi->restaurant_id;
            $brandId = (int) ($mi->brand_restaurant_id ?: ($mi->parent_restaurant_id ?: $restaurantId));
            $isMainBranch = $mi->parent_restaurant_id === null;
            $brandLabel = DriveFolderName::restaurantBrand((string) $mi->restaurant_name, $brandId);
            $catLabel = DriveFolderName::sanitize((string) $mi->category_name, 'Category');
            $targetLabel = $isMainBranch
                ? "Restaurants/{$brandLabel}/Menu/{$catLabel}"
                : "Restaurants/{$brandLabel}/Branches/".DriveFolderName::branch((string) ($mi->branch_name ?? 'Branch'), $restaurantId)."/Menu/{$catLabel}";

            $context = [
                'brand_restaurant_id' => $brandId,
                'restaurant_id' => $restaurantId,
                'restaurant_name' => (string) $mi->restaurant_name,
                'branch_name' => $mi->branch_name,
                'is_main_branch' => $isMainBranch,
                'menu_category_id' => (int) $mi->menu_category_id,
                'category_name' => (string) $mi->category_name,
            ];

            foreach (['photo_image', 'published_photo_image'] as $col) {
                $val = is_string($mi->{$col}) ? trim($mi->{$col}) : '';
                if ($val !== '' && GoogleDrivePublicImageStore::isDriveValue($val) && ! isset($itemsByFileId[$val])) {
                    $itemsByFileId[$val] = [
                        'stored' => $val,
                        'purpose' => StoragePurpose::MENU_ITEM_PHOTO,
                        'context' => $context,
                        'target_label' => $targetLabel,
                    ];
                }
            }
        }

        $list = array_values($itemsByFileId);

        return $limit !== null ? array_slice($list, 0, $limit) : $list;
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, string>
     */
    private function buildAppProperties(string $purpose, array $context): array
    {
        $props = [
            'visibility' => StoragePurpose::VISIBILITY_PUBLIC,
            'salo_purpose' => $purpose,
        ];

        foreach (['brand_restaurant_id', 'restaurant_id', 'menu_category_id'] as $key) {
            if (isset($context[$key]) && $context[$key] !== null) {
                $props[$key] = (string) $context[$key];
            }
        }

        return $props;
    }
}
