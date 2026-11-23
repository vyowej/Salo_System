<?php

namespace App\Console\Commands;

use App\Support\Storage\DriveClientInterface;
use App\Support\Storage\GoogleDrivePublicImageStore;
use App\Support\Storage\ImageStorageUnavailableException;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class DriveOrphansCommand extends Command
{
    protected $signature = 'salo:drive:orphans';

    protected $description = 'Walk the entire SALO Google Drive folder tree and list files not referenced by any database row (read-only).';

    private const FOLDER_MIME = 'application/vnd.google-apps.folder';

    public function handle(DriveClientInterface $driveClient): int
    {
        $folderId = trim((string) config('salo.uploads.google_drive.public_folder_id', ''));
        if ($folderId === '') {
            $this->error('GOOGLE_DRIVE_PUBLIC_FOLDER_ID is not configured.');

            return self::FAILURE;
        }

        $dbName = (string) (DB::selectOne('SELECT DATABASE() as db')->db ?? 'unknown');
        $this->line("Walking SALO Drive tree against database [{$dbName}]...");

        try {
            $driveFiles = $this->walkDriveFiles($driveClient, $folderId);
        } catch (ImageStorageUnavailableException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $referencedIds = $this->collectReferencedDriveIds();
        $orphans = [];

        foreach ($driveFiles as $file) {
            $id = (string) ($file['id'] ?? '');
            if ($id !== '' && ! isset($referencedIds[$id])) {
                $orphans[] = [
                    'id' => $id,
                    'name' => (string) ($file['name'] ?? ''),
                    'mimeType' => (string) ($file['mimeType'] ?? ''),
                    'size' => (string) ($file['size'] ?? '0'),
                    'createdTime' => (string) ($file['createdTime'] ?? ''),
                ];
            }
        }

        $this->info(sprintf('Drive files in tree: %d | Referenced in DB: %d | Orphans: %d', count($driveFiles), count($referencedIds), count($orphans)));

        if ($orphans !== []) {
            $this->table(['File ID', 'Name', 'MIME Type', 'Size (bytes)', 'Created'], $orphans);
        }

        return self::SUCCESS;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function walkDriveFiles(DriveClientInterface $driveClient, string $rootFolderId): array
    {
        $files = [];
        $queue = [$rootFolderId];
        $visited = [];

        while ($queue !== []) {
            $currentId = array_shift($queue);
            if (isset($visited[$currentId])) {
                continue;
            }
            $visited[$currentId] = true;

            foreach ($driveClient->listChildren($currentId) as $child) {
                if (($child['mimeType'] ?? '') === self::FOLDER_MIME) {
                    if (! empty($child['id'])) {
                        $queue[] = (string) $child['id'];
                    }
                    continue;
                }
                $files[] = $child;
            }
        }

        return $files;
    }

    /**
     * @return array<string, true>
     */
    private function collectReferencedDriveIds(): array
    {
        $ids = [];
        $prefix = GoogleDrivePublicImageStore::PREFIX.'%';

        $add = static function (?string $val) use (&$ids): void {
            $id = GoogleDrivePublicImageStore::extractFileId($val);
            if ($id !== null) {
                $ids[$id] = true;
            }
        };

        $restaurants = DB::table('restaurants')
            ->select(['logo_image', 'cover_image'])
            ->where('logo_image', 'like', $prefix)
            ->orWhere('cover_image', 'like', $prefix)
            ->get();
        foreach ($restaurants as $row) {
            $add(is_string($row->logo_image) ? $row->logo_image : null);
            $add(is_string($row->cover_image) ? $row->cover_image : null);
        }

        $menuItems = DB::table('menu_items')
            ->select(['photo_image', 'published_photo_image'])
            ->where('photo_image', 'like', $prefix)
            ->orWhere('published_photo_image', 'like', $prefix)
            ->get();
        foreach ($menuItems as $row) {
            $add(is_string($row->photo_image) ? $row->photo_image : null);
            $add(is_string($row->published_photo_image) ? $row->published_photo_image : null);
        }

        foreach (DB::table('application_documents')->where('file_path', 'like', $prefix)->pluck('file_path') as $val) {
            $add(is_string($val) ? $val : null);
        }

        foreach (DB::table('branch_permits')->where('file_path', 'like', $prefix)->pluck('file_path') as $val) {
            $add(is_string($val) ? $val : null);
        }

        foreach (DB::table('deliveries')->where('proof_photo', 'like', $prefix)->pluck('proof_photo') as $val) {
            $add(is_string($val) ? $val : null);
        }

        return $ids;
    }
}
