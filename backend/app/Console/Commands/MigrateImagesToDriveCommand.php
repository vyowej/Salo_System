<?php

namespace App\Console\Commands;

use App\Support\FileStorageService;
use App\Support\Storage\GoogleDrivePublicImageStore;
use App\Support\Storage\GoogleDriveTokenProvider;
use App\Support\Storage\ImageStorageUnavailableException;
use App\Support\Storage\PublicImageStore;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class MigrateImagesToDriveCommand extends Command
{
    protected $signature = 'salo:images:migrate-to-drive
                            {--dry-run : Preview what would be migrated without uploading or updating the database}
                            {--limit= : Maximum number of image fields to process}
                            {--only= : Limit to restaurants or menu_items}
                            {--force : Skip interactive confirmation prompt}';

    protected $description = 'One-time migration of existing local public images to Google Drive without deleting local files.';

    private const ALLOWED_MIME_MAP = [
        'image/jpeg' => IMAGETYPE_JPEG,
        'image/png' => IMAGETYPE_PNG,
        'image/webp' => IMAGETYPE_WEBP,
    ];

    public function handle(
        FileStorageService $fileStorageService,
        PublicImageStore $publicImageStore,
        GoogleDriveTokenProvider $tokenProvider,
    ): int {
        $dryRun = (bool) $this->option('dry-run');
        $only = $this->option('only');
        $limitOption = $this->option('limit');
        $limit = $limitOption !== null ? max(1, (int) $limitOption) : null;

        if ($only !== null && ! in_array($only, ['restaurants', 'menu_items'], true)) {
            $this->error('Invalid --only value. Allowed: restaurants, menu_items.');

            return self::FAILURE;
        }

        if (config('salo.uploads.public_image_driver') !== 'google_drive') {
            $this->error('PUBLIC_IMAGE_STORAGE must be set to "google_drive" before running this command.');

            return self::FAILURE;
        }

        if (! $dryRun) {
            try {
                $tokenProvider->getAccessToken();
            } catch (ImageStorageUnavailableException $e) {
                $this->error('Google Drive credentials check failed: '.$e->getMessage());

                return self::FAILURE;
            }
        }

        $dbName = (string) (DB::selectOne('SELECT DATABASE() as db')->db ?? 'unknown');
        $this->line('Target database: '.$dbName);
        $this->line('Mode: '.($dryRun ? 'DRY RUN (no uploads or DB writes)' : 'LIVE MIGRATION (local files will NOT be deleted)'));

        if (! $dryRun && ! $this->option('force')) {
            if (! $this->confirm("Proceed with migrating public images in database [{$dbName}] to Google Drive?")) {
                $this->warn('Migration cancelled.');

                return self::SUCCESS;
            }
        }

        $targets = $this->collectTargets($only);
        $counts = [
            'migrated' => 0,
            'would_migrate' => 0,
            'skipped_already_drive' => 0,
            'skipped_concurrent' => 0,
            'missing_local' => 0,
            'invalid_content' => 0,
            'failed' => 0,
        ];
        $details = [];
        $processed = 0;

        foreach ($targets as $target) {
            if ($limit !== null && $processed >= $limit) {
                break;
            }

            $originalValue = (string) $target['value'];
            if (GoogleDrivePublicImageStore::isDriveValue($originalValue)) {
                $counts['skipped_already_drive']++;

                continue;
            }

            $processed++;
            $relativePath = $fileStorageService->normalizeRelativePath($originalValue);
            if ($relativePath === null || ! Storage::disk('public')->exists($relativePath)) {
                $counts['missing_local']++;
                $details[] = array_merge($target, ['status' => 'missing_local', 'relative_path' => $relativePath]);

                continue;
            }

            $localPath = Storage::disk('public')->path($relativePath);
            $mime = $this->validateLocalImage($localPath);
            if ($mime === null) {
                $counts['invalid_content']++;
                $details[] = array_merge($target, ['status' => 'invalid_content', 'relative_path' => $relativePath]);

                continue;
            }

            if ($dryRun) {
                $counts['would_migrate']++;
                $details[] = array_merge($target, ['status' => 'would_migrate', 'relative_path' => $relativePath, 'mime' => $mime]);

                continue;
            }

            try {
                $newValue = $publicImageStore->put(
                    localPath: $localPath,
                    mime: $mime,
                    name: basename($relativePath),
                    directory: $target['directory'],
                    meta: [
                        'field' => $target['column'],
                        'restaurant_id' => (string) $target['restaurant_id'],
                    ],
                );

                $updated = DB::table($target['table'])
                    ->where($target['pk_column'], $target['pk_value'])
                    ->where($target['column'], $originalValue)
                    ->update([
                        $target['column'] => $newValue,
                        'updated_at' => now(),
                    ]);

                if ($updated === 0) {
                    $publicImageStore->delete($newValue);
                    $counts['skipped_concurrent']++;
                    $details[] = array_merge($target, ['status' => 'skipped_concurrent']);

                    continue;
                }

                $counts['migrated']++;
                $details[] = array_merge($target, ['status' => 'migrated', 'new_value' => $newValue]);
            } catch (\Throwable $e) {
                $counts['failed']++;
                $details[] = array_merge($target, ['status' => 'failed', 'error' => $e->getMessage()]);
            }
        }

        $report = [
            'timestamp' => now()->toIso8601String(),
            'database' => $dbName,
            'dry_run' => $dryRun,
            'counts' => $counts,
            'items' => $details,
        ];

        $reportPath = 'reports/drive-migration-'.now()->format('Ymd_His').'.json';
        Storage::disk('local')->put($reportPath, json_encode($report, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));

        $this->table(
            ['Metric', 'Count'],
            array_map(static fn (string $k, int $v): array => [$k, $v], array_keys($counts), array_values($counts)),
        );
        $this->info('Report written to private storage: '.$reportPath);

        return $counts['failed'] > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function collectTargets(?string $only): array
    {
        $targets = [];

        if ($only === null || $only === 'restaurants') {
            $restaurants = DB::table('restaurants')
                ->select(['restaurant_id', 'logo_image', 'cover_image'])
                ->where(function ($q): void {
                    $q->whereNotNull('logo_image')->orWhereNotNull('cover_image');
                })
                ->orderBy('restaurant_id')
                ->get();

            foreach ($restaurants as $r) {
                foreach (['logo_image', 'cover_image'] as $col) {
                    if ($r->{$col} !== null && trim((string) $r->{$col}) !== '') {
                        $targets[] = [
                            'table' => 'restaurants',
                            'pk_column' => 'restaurant_id',
                            'pk_value' => (int) $r->restaurant_id,
                            'restaurant_id' => (int) $r->restaurant_id,
                            'column' => $col,
                            'directory' => 'restaurants/'.$r->restaurant_id,
                            'value' => (string) $r->{$col},
                        ];
                    }
                }
            }
        }

        if ($only === null || $only === 'menu_items') {
            $items = DB::table('menu_items')
                ->select(['menu_item_id', 'restaurant_id', 'photo_image'])
                ->whereNotNull('photo_image')
                ->orderBy('menu_item_id')
                ->get();

            foreach ($items as $item) {
                if (trim((string) $item->photo_image) !== '') {
                    $targets[] = [
                        'table' => 'menu_items',
                        'pk_column' => 'menu_item_id',
                        'pk_value' => (int) $item->menu_item_id,
                        'restaurant_id' => (int) $item->restaurant_id,
                        'column' => 'photo_image',
                        'directory' => 'restaurants/'.$item->restaurant_id.'/menu',
                        'value' => (string) $item->photo_image,
                    ];
                }
            }
        }

        return $targets;
    }

    private function validateLocalImage(string $localPath): ?string
    {
        if (! is_file($localPath) || ! is_readable($localPath)) {
            return null;
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = $finfo !== false ? strtolower((string) finfo_file($finfo, $localPath)) : '';
        if ($finfo !== false) {
            finfo_close($finfo);
        }

        if (! isset(self::ALLOWED_MIME_MAP[$mime])) {
            return null;
        }

        $info = @getimagesize($localPath);
        if ($info === false || empty($info[0]) || empty($info[1]) || (int) $info[2] !== self::ALLOWED_MIME_MAP[$mime]) {
            return null;
        }

        if (function_exists('imagecreatefromjpeg')) {
            $resource = match ($mime) {
                'image/jpeg' => @imagecreatefromjpeg($localPath),
                'image/png' => @imagecreatefrompng($localPath),
                'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($localPath) : true,
                default => false,
            };

            if ($resource === false) {
                return null;
            }

            if ($resource instanceof \GdImage) {
                imagedestroy($resource);
            }
        }

        return $mime;
    }
}
