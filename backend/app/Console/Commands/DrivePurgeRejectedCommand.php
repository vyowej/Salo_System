<?php

namespace App\Console\Commands;

use App\Support\FileStorageService;
use App\Support\Storage\DriveClientInterface;
use App\Support\Storage\GoogleDrivePublicImageStore;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class DrivePurgeRejectedCommand extends Command
{
    protected $signature = 'salo:drive:purge-rejected
                            {--days=90 : Retention days after application rejection}
                            {--dry-run : List eligible files without trashing or deleting}
                            {--force : Run without interactive confirmation}';

    protected $description = 'List or purge (trash in Drive / delete locally) private files belonging to rejected applications past the 90-day retention period.';

    public function handle(DriveClientInterface $driveClient, FileStorageService $fileStorage): int
    {
        $days = max(1, (int) $this->option('days'));
        $dryRun = (bool) $this->option('dry-run');
        $cutoff = now()->subDays($days);

        $dbName = (string) (DB::selectOne('SELECT DATABASE() as db')->db ?? 'unknown');
        $this->line(sprintf(
            'Database: [%s] | Retention: %d days (cutoff <= %s) | Mode: %s',
            $dbName,
            $days,
            $cutoff->toDateTimeString(),
            $dryRun ? 'DRY RUN' : 'LIVE PURGE',
        ));

        $eligible = $this->findEligibleFiles($cutoff);
        if ($eligible === []) {
            $this->info('No rejected application files past the retention period.');

            return self::SUCCESS;
        }

        $this->table(
            ['Table', 'Row ID', 'Application', 'Decided At', 'Stored Path'],
            array_map(static fn (array $r): array => [
                $r['table'],
                $r['id'],
                $r['app_ref'],
                $r['decided_at'],
                $r['path'],
            ], $eligible),
        );

        if ($dryRun) {
            $this->info('Dry run complete. No files were trashed or deleted.');

            return self::SUCCESS;
        }

        if (! $this->option('force')) {
            if (! $this->confirm('Trash/delete these '.count($eligible).' file(s)?', false)) {
                $this->warn('Aborted.');

                return self::FAILURE;
            }
        }

        $purged = 0;
        $failed = 0;
        foreach ($eligible as $item) {
            $path = $item['path'];
            if (GoogleDrivePublicImageStore::isDriveValue($path)) {
                $ok = $driveClient->trashFile($path);
            } else {
                $rel = $fileStorage->normalizeRelativePath($path);
                $ok = $rel !== null && Storage::disk('local')->exists($rel)
                    ? Storage::disk('local')->delete($rel)
                    : true;
            }

            if ($ok) {
                $purged++;
            } else {
                $failed++;
            }
        }

        $this->info("Purged: {$purged} | Failed: {$failed}");

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * @return list<array{table: string, id: int, app_ref: string, decided_at: string, path: string}>
     */
    private function findEligibleFiles(mixed $cutoff): array
    {
        $items = [];

        $restDocs = DB::table('application_documents as ad')
            ->join('restaurant_applications as ra', 'ra.restaurant_application_id', '=', 'ad.restaurant_application_id')
            ->where('ra.application_status', 'rejected')
            ->whereRaw('COALESCE(ra.decided_at, ra.updated_at) <= ?', [$cutoff])
            ->select(['ad.document_id', 'ad.file_path', 'ra.reference_number', DB::raw('COALESCE(ra.decided_at, ra.updated_at) as resolved_decided_at')])
            ->get();

        foreach ($restDocs as $row) {
            $items[] = [
                'table' => 'application_documents',
                'id' => (int) $row->document_id,
                'app_ref' => (string) $row->reference_number,
                'decided_at' => (string) $row->resolved_decided_at,
                'path' => (string) $row->file_path,
            ];
        }

        $riderDocs = DB::table('application_documents as ad')
            ->join('rider_applications as rda', 'rda.rider_application_id', '=', 'ad.rider_application_id')
            ->where('rda.application_status', 'rejected')
            ->whereRaw('COALESCE(rda.decided_at, rda.updated_at) <= ?', [$cutoff])
            ->select(['ad.document_id', 'ad.file_path', 'rda.reference_number', DB::raw('COALESCE(rda.decided_at, rda.updated_at) as resolved_decided_at')])
            ->get();

        foreach ($riderDocs as $row) {
            $items[] = [
                'table' => 'application_documents',
                'id' => (int) $row->document_id,
                'app_ref' => (string) $row->reference_number,
                'decided_at' => (string) $row->resolved_decided_at,
                'path' => (string) $row->file_path,
            ];
        }

        $permits = DB::table('branch_permits as bp')
            ->join('restaurant_application_branches as rab', 'rab.application_branch_id', '=', 'bp.application_branch_id')
            ->join('restaurant_applications as ra', 'ra.restaurant_application_id', '=', 'rab.restaurant_application_id')
            ->whereNull('bp.restaurant_id')
            ->where('ra.application_status', 'rejected')
            ->whereNotNull('bp.file_path')
            ->whereRaw('COALESCE(ra.decided_at, ra.updated_at) <= ?', [$cutoff])
            ->select(['bp.permit_id', 'bp.file_path', 'ra.reference_number', DB::raw('COALESCE(ra.decided_at, ra.updated_at) as resolved_decided_at')])
            ->get();

        foreach ($permits as $row) {
            $items[] = [
                'table' => 'branch_permits',
                'id' => (int) $row->permit_id,
                'app_ref' => (string) $row->reference_number,
                'decided_at' => (string) $row->resolved_decided_at,
                'path' => (string) $row->file_path,
            ];
        }

        return $items;
    }
}
