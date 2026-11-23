<?php

namespace App\Console\Commands;

use App\Support\FileStorageService;
use App\Support\Storage\DriveClientInterface;
use App\Support\Storage\DriveFolderResolver;
use App\Support\Storage\GoogleDrivePublicImageStore;
use App\Support\Storage\ImageProcessor;
use App\Support\Storage\StoragePurpose;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class MigratePrivateFilesToDriveCommand extends Command
{
    protected $signature = 'salo:private-files:migrate-to-drive
                            {--dry-run : Preview migration without uploading to Drive or updating the database}
                            {--limit= : Maximum number of rows to process}
                            {--only= : Limit to application_documents, branch_permits, or deliveries}
                            {--force : Run without interactive confirmation}';

    protected $description = 'Migrate existing local private files (application documents, branch permits, delivery proofs) to Google Drive (never deletes local files).';

    public function handle(
        FileStorageService $fileStorage,
        DriveClientInterface $driveClient,
        DriveFolderResolver $folderResolver,
    ): int {
        $driver = strtolower(trim((string) config('salo.uploads.private_file_driver', 'local')));
        $dryRun = (bool) $this->option('dry-run');

        if (! $dryRun && $driver !== 'google_drive') {
            $this->error('PRIVATE_FILE_STORAGE must be set to google_drive before running live migration.');

            return self::FAILURE;
        }

        if (trim((string) config('salo.uploads.google_drive.public_folder_id', '')) === '') {
            $this->error('GOOGLE_DRIVE_PUBLIC_FOLDER_ID is not configured.');

            return self::FAILURE;
        }

        $only = $this->option('only');
        if ($only !== null && ! in_array($only, ['application_documents', 'branch_permits', 'deliveries'], true)) {
            $this->error('--only must be one of: application_documents, branch_permits, deliveries.');

            return self::FAILURE;
        }

        $limitOpt = $this->option('limit');
        $limit = is_numeric($limitOpt) && (int) $limitOpt > 0 ? (int) $limitOpt : null;

        $dbName = (string) (DB::selectOne('SELECT DATABASE() as db')->db ?? 'unknown');
        $this->line(sprintf(
            'Database: [%s] | Mode: %s',
            $dbName,
            $dryRun ? 'DRY RUN (no uploads or DB writes)' : 'LIVE (uploads to Drive & updates DB; local files kept)',
        ));

        if (! $dryRun && ! $this->option('force')) {
            if (! $this->confirm("Proceed with migrating local private files in [{$dbName}] to Google Drive?", false)) {
                $this->warn('Aborted.');

                return self::FAILURE;
            }
        }

        $candidates = $this->collectCandidates($only, $limit);
        $counts = [
            'total' => count($candidates),
            'migrated' => 0,
            'skipped_already_drive' => 0,
            'missing_local_file' => 0,
            'failed' => 0,
        ];
        $details = [];

        foreach ($candidates as $item) {
            $rawPath = (string) $item['path'];
            if (GoogleDrivePublicImageStore::isDriveValue($rawPath)) {
                $counts['skipped_already_drive']++;
                continue;
            }

            $relative = $fileStorage->normalizeRelativePath($rawPath);
            if ($relative === null || ! Storage::disk('local')->exists($relative)) {
                $counts['missing_local_file']++;
                $details[] = ['table' => $item['table'], 'id' => $item['id'], 'status' => 'missing_local_file', 'path' => $rawPath];
                continue;
            }

            if ($dryRun) {
                $counts['migrated']++;
                $details[] = ['table' => $item['table'], 'id' => $item['id'], 'status' => 'would_migrate', 'purpose' => $item['purpose']];
                continue;
            }

            /** @var \Illuminate\Filesystem\FilesystemAdapter $localDisk */
            $localDisk = Storage::disk('local');
            $localFullPath = $localDisk->path($relative);
            $mime = (string) ($localDisk->mimeType($relative) ?: 'application/octet-stream');
            $ext = strtolower(pathinfo($relative, PATHINFO_EXTENSION)) ?: 'bin';
            $opaqueName = Str::uuid()->toString().'.'.$ext;

            $optimizedTemp = str_starts_with($mime, 'image/')
                ? ImageProcessor::sanitizeAndOptimize($localFullPath, $mime, 1920)
                : null;
            $uploadPath = $optimizedTemp ?? $localFullPath;

            $newDriveValue = null;
            try {
                $folderId = $folderResolver->resolveFolderForPurpose($item['purpose'], $item['context']);
                $newDriveValue = $driveClient->putFile(
                    localPath: $uploadPath,
                    mime: $mime,
                    opaqueName: $opaqueName,
                    folderId: $folderId,
                    appProperties: [
                        'visibility' => StoragePurpose::VISIBILITY_PRIVATE,
                        'salo_purpose' => $item['purpose'],
                    ],
                );

                $updated = DB::table($item['table'])
                    ->where($item['pk'], $item['id'])
                    ->where($item['column'], $rawPath)
                    ->update([$item['column'] => $newDriveValue]);

                if ($updated === 0) {
                    $driveClient->trashFile($newDriveValue);
                    $counts['failed']++;
                    $details[] = ['table' => $item['table'], 'id' => $item['id'], 'status' => 'failed', 'reason' => 'Optimistic DB guard matched 0 rows'];
                    continue;
                }

                $counts['migrated']++;
                $details[] = ['table' => $item['table'], 'id' => $item['id'], 'status' => 'migrated', 'purpose' => $item['purpose']];
            } catch (\Throwable $e) {
                if ($newDriveValue !== null) {
                    $driveClient->trashFile($newDriveValue);
                }
                $counts['failed']++;
                $details[] = ['table' => $item['table'], 'id' => $item['id'], 'status' => 'failed', 'reason' => $e->getMessage()];
            } finally {
                if ($optimizedTemp !== null && is_file($optimizedTemp)) {
                    @unlink($optimizedTemp);
                }
            }
        }

        $this->table(
            ['Metric', 'Count'],
            [
                ['Total candidate rows', $counts['total']],
                [$dryRun ? 'Would migrate' : 'Migrated', $counts['migrated']],
                ['Skipped (already Drive)', $counts['skipped_already_drive']],
                ['Missing local file', $counts['missing_local_file']],
                ['Failed', $counts['failed']],
            ],
        );

        $reportPath = 'reports/drive-private-migration-'.now()->format('Ymd_His').'.json';
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
     * @return list<array<string, mixed>>
     */
    private function collectCandidates(?string $only, ?int $limit): array
    {
        $items = [];

        if ($only === null || $only === 'application_documents') {
            $docs = DB::table('application_documents as ad')
                ->leftJoin('restaurant_applications as ra', 'ra.restaurant_application_id', '=', 'ad.restaurant_application_id')
                ->leftJoin('restaurants as r', 'r.restaurant_id', '=', 'ra.restaurant_id')
                ->leftJoin('users as ru', 'ru.user_id', '=', 'ra.applicant_user_id')
                ->leftJoin('rider_applications as rda', 'rda.rider_application_id', '=', 'ad.rider_application_id')
                ->leftJoin('users as rdu', 'rdu.user_id', '=', 'rda.applicant_user_id')
                ->where('ad.file_path', 'not like', GoogleDrivePublicImageStore::PREFIX.'%')
                ->select([
                    'ad.document_id',
                    'ad.file_path',
                    'ad.restaurant_application_id',
                    'ad.rider_application_id',
                    'r.restaurant_name',
                    'ru.first_name as rest_first',
                    'ru.last_name as rest_last',
                    'rdu.first_name as rider_first',
                    'rdu.last_name as rider_last',
                ])
                ->orderBy('ad.document_id')
                ->get();

            foreach ($docs as $d) {
                $isRider = $d->rider_application_id !== null;
                $context = $isRider
                    ? [
                        'application_type' => 'rider',
                        'application_id' => (int) $d->rider_application_id,
                        'rider_name' => trim(((string) ($d->rider_first ?? '')).' '.((string) ($d->rider_last ?? ''))) ?: 'Rider',
                    ]
                    : [
                        'application_type' => 'restaurant',
                        'application_id' => (int) $d->restaurant_application_id,
                        'owner_name' => trim(((string) ($d->rest_first ?? '')).' '.((string) ($d->rest_last ?? ''))) ?: 'Owner',
                        'restaurant_name' => (string) ($d->restaurant_name ?? 'Restaurant'),
                    ];

                $items[] = [
                    'table' => 'application_documents',
                    'pk' => 'document_id',
                    'column' => 'file_path',
                    'id' => (int) $d->document_id,
                    'path' => (string) $d->file_path,
                    'purpose' => StoragePurpose::APPLICATION_DOCUMENT,
                    'context' => $context,
                ];
            }
        }

        if ($only === null || $only === 'branch_permits') {
            $permits = DB::table('branch_permits as bp')
                ->leftJoin('restaurants as r', 'r.restaurant_id', '=', 'bp.restaurant_id')
                ->leftJoin('restaurant_application_branches as rab', 'rab.application_branch_id', '=', 'bp.application_branch_id')
                ->leftJoin('restaurant_applications as ra', function ($join): void {
                    $join->on('ra.restaurant_application_id', '=', 'rab.restaurant_application_id')
                        ->orOn('ra.restaurant_id', '=', 'r.brand_restaurant_id');
                })
                ->leftJoin('restaurants as root_r', 'root_r.restaurant_id', '=', 'ra.restaurant_id')
                ->leftJoin('users as u', 'u.user_id', '=', 'ra.applicant_user_id')
                ->whereNotNull('bp.file_path')
                ->where('bp.file_path', '!=', '')
                ->where('bp.file_path', 'not like', GoogleDrivePublicImageStore::PREFIX.'%')
                ->select([
                    'bp.permit_id',
                    'bp.file_path',
                    'bp.restaurant_id',
                    'bp.application_branch_id',
                    'r.branch_name as rest_branch_name',
                    'rab.branch_name as app_branch_name',
                    'ra.restaurant_application_id',
                    'root_r.restaurant_name',
                    'u.first_name',
                    'u.last_name',
                ])
                ->orderBy('bp.permit_id')
                ->get();

            foreach ($permits as $p) {
                $ownerName = trim(((string) ($p->first_name ?? '')).' '.((string) ($p->last_name ?? ''))) ?: 'Owner';
                $items[] = [
                    'table' => 'branch_permits',
                    'pk' => 'permit_id',
                    'column' => 'file_path',
                    'id' => (int) $p->permit_id,
                    'path' => (string) $p->file_path,
                    'purpose' => StoragePurpose::BRANCH_PERMIT,
                    'context' => [
                        'application_id' => (int) ($p->restaurant_application_id ?? $p->permit_id),
                        'restaurant_id' => $p->restaurant_id !== null ? (int) $p->restaurant_id : null,
                        'application_branch_id' => $p->application_branch_id !== null ? (int) $p->application_branch_id : null,
                        'owner_name' => $ownerName,
                        'restaurant_name' => (string) ($p->restaurant_name ?? 'Restaurant'),
                        'branch_name' => (string) ($p->rest_branch_name ?? $p->app_branch_name ?? 'Branch'),
                    ],
                ];
            }
        }

        if ($only === null || $only === 'deliveries') {
            $deliveries = DB::table('deliveries as d')
                ->join('riders as rd', 'rd.rider_id', '=', 'd.rider_id')
                ->join('users as u', 'u.user_id', '=', 'rd.user_id')
                ->whereNotNull('d.proof_photo')
                ->where('d.proof_photo', '!=', '')
                ->where('d.proof_photo', 'not like', GoogleDrivePublicImageStore::PREFIX.'%')
                ->select([
                    'd.delivery_id',
                    'd.order_id',
                    'd.proof_photo',
                    'd.delivered_at',
                    'd.created_at',
                    'u.user_id',
                    'u.first_name',
                    'u.last_name',
                ])
                ->orderBy('d.delivery_id')
                ->get();

            foreach ($deliveries as $del) {
                $dt = $del->delivered_at ?? $del->created_at ?? now();
                $month = Carbon::parse((string) $dt)->format('Y-m');
                $riderName = trim(((string) ($del->first_name ?? '')).' '.((string) ($del->last_name ?? ''))) ?: 'Rider';

                $items[] = [
                    'table' => 'deliveries',
                    'pk' => 'delivery_id',
                    'column' => 'proof_photo',
                    'id' => (int) $del->delivery_id,
                    'path' => (string) $del->proof_photo,
                    'purpose' => StoragePurpose::DELIVERY_CONFIRMATION,
                    'context' => [
                        'rider_user_id' => (int) $del->user_id,
                        'rider_name' => $riderName,
                        'month' => $month,
                        'order_id' => (int) $del->order_id,
                    ],
                ];
            }
        }

        return $limit !== null ? array_slice($items, 0, $limit) : $items;
    }
}
