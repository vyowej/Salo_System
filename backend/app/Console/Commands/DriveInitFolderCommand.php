<?php

namespace App\Console\Commands;

use App\Support\Storage\GoogleDriveTokenProvider;
use App\Support\Storage\ImageStorageUnavailableException;
use Illuminate\Console\Command;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

class DriveInitFolderCommand extends Command
{
    protected $signature = 'salo:drive:init-folder {--name=SALO Public Images : Name of the Google Drive folder to create}';

    protected $description = 'Create the dedicated Google Drive folder for SALO public images and print its folder ID.';

    public function handle(GoogleDriveTokenProvider $tokenProvider): int
    {
        $folderName = trim((string) $this->option('name'));
        if ($folderName === '') {
            $this->error('Folder name cannot be empty.');

            return self::FAILURE;
        }

        try {
            $token = $tokenProvider->getAccessToken();
            $timeout = max(5, (int) config('salo.uploads.google_drive.timeout_seconds', 20));

            $response = Http::withToken($token)
                ->connectTimeout(5)
                ->timeout($timeout)
                ->post('https://www.googleapis.com/drive/v3/files?fields=id,name', [
                    'name' => $folderName,
                    'mimeType' => 'application/vnd.google-apps.folder',
                ]);
        } catch (ImageStorageUnavailableException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        } catch (ConnectionException $e) {
            $this->error('Could not reach Google Drive: '.$e->getMessage());

            return self::FAILURE;
        }

        if (! $response->successful()) {
            $reason = (string) ($response->json('error.message') ?? 'HTTP '.$response->status());
            $this->error('Failed to create Google Drive folder: '.$reason);

            return self::FAILURE;
        }

        $folderId = (string) ($response->json('id') ?? '');
        if ($folderId === '') {
            $this->error('Google Drive did not return a folder ID.');

            return self::FAILURE;
        }

        $this->info('Created Google Drive folder successfully.');
        $this->line('Folder Name: '.$folderName);
        $this->line('Folder ID:   '.$folderId);
        $this->newLine();
        $this->line('Add this to backend/.env:');
        $this->line('GOOGLE_DRIVE_PUBLIC_FOLDER_ID='.$folderId);

        return self::SUCCESS;
    }
}
