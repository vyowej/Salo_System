<?php

namespace App\Console\Commands;

use App\Support\Storage\GoogleDrivePublicImageStore;
use App\Support\Storage\GoogleDriveTokenProvider;
use App\Support\Storage\ImageStorageUnavailableException;
use Illuminate\Console\Command;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class DriveOrphansCommand extends Command
{
    protected $signature = 'salo:drive:orphans';

    protected $description = 'List files in the configured Google Drive folder that are not referenced by any database row (read-only).';

    public function handle(GoogleDriveTokenProvider $tokenProvider): int
    {
        $folderId = trim((string) config('salo.uploads.google_drive.public_folder_id', ''));
        if ($folderId === '') {
            $this->error('GOOGLE_DRIVE_PUBLIC_FOLDER_ID is not configured.');

            return self::FAILURE;
        }

        $dbName = (string) (DB::selectOne('SELECT DATABASE() as db')->db ?? 'unknown');
        $this->line("Checking Drive folder against database [{$dbName}]...");

        try {
            $token = $tokenProvider->getAccessToken();
            $driveFiles = $this->listDriveFolderFiles($token, $folderId);
        } catch (ImageStorageUnavailableException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        } catch (ConnectionException $e) {
            $this->error('Could not reach Google Drive: '.$e->getMessage());

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

        $this->info(sprintf('Drive files in folder: %d | Referenced in DB: %d | Orphans: %d', count($driveFiles), count($referencedIds), count($orphans)));

        if ($orphans !== []) {
            $this->table(['File ID', 'Name', 'MIME Type', 'Size (bytes)', 'Created'], $orphans);
        }

        return self::SUCCESS;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function listDriveFolderFiles(string $token, string $folderId): array
    {
        $timeout = max(5, (int) config('salo.uploads.google_drive.timeout_seconds', 20));
        $escapedFolder = str_replace("'", "\\'", $folderId);
        $files = [];
        $pageToken = null;

        do {
            $query = array_filter([
                'q' => "'{$escapedFolder}' in parents and trashed = false",
                'fields' => 'nextPageToken,files(id,name,mimeType,size,createdTime)',
                'pageSize' => 1000,
                'pageToken' => $pageToken,
            ], static fn ($v) => $v !== null);

            $response = Http::withToken($token)
                ->connectTimeout(5)
                ->timeout($timeout)
                ->get('https://www.googleapis.com/drive/v3/files', $query);

            if (! $response->successful()) {
                $reason = (string) ($response->json('error.message') ?? 'HTTP '.$response->status());
                throw new ImageStorageUnavailableException('Failed to list Google Drive files: '.$reason);
            }

            $batch = $response->json('files');
            if (is_array($batch)) {
                foreach ($batch as $item) {
                    if (is_array($item)) {
                        $files[] = $item;
                    }
                }
            }

            $pageToken = $response->json('nextPageToken');
        } while (is_string($pageToken) && $pageToken !== '');

        return $files;
    }

    /**
     * @return array<string, true>
     */
    private function collectReferencedDriveIds(): array
    {
        $ids = [];

        $restaurants = DB::table('restaurants')
            ->select(['logo_image', 'cover_image'])
            ->where('logo_image', 'like', GoogleDrivePublicImageStore::PREFIX.'%')
            ->orWhere('cover_image', 'like', GoogleDrivePublicImageStore::PREFIX.'%')
            ->get();

        foreach ($restaurants as $row) {
            foreach ([$row->logo_image, $row->cover_image] as $val) {
                $id = GoogleDrivePublicImageStore::extractFileId(is_string($val) ? $val : null);
                if ($id !== null) {
                    $ids[$id] = true;
                }
            }
        }

        $menuItems = DB::table('menu_items')
            ->select(['photo_image', 'published_photo_image'])
            ->where('photo_image', 'like', GoogleDrivePublicImageStore::PREFIX.'%')
            ->orWhere('published_photo_image', 'like', GoogleDrivePublicImageStore::PREFIX.'%')
            ->get();

        foreach ($menuItems as $row) {
            foreach (['photo_image', 'published_photo_image'] as $col) {
                $id = GoogleDrivePublicImageStore::extractFileId(is_string($row->{$col}) ? $row->{$col} : null);
                if ($id !== null) {
                    $ids[$id] = true;
                }
            }
        }

        return $ids;
    }
}
