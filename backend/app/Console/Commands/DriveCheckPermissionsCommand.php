<?php

namespace App\Console\Commands;

use App\Support\Storage\DriveClientInterface;
use Illuminate\Console\Command;

class DriveCheckPermissionsCommand extends Command
{
    protected $signature = 'salo:drive:check-permissions';

    protected $description = 'Verify that no folder or file in the private Drive tree (Applications, Riders, Support) has permissions beyond the owner.';

    private const FOLDER_MIME = 'application/vnd.google-apps.folder';

    public function handle(DriveClientInterface $driveClient): int
    {
        $rootId = trim((string) config('salo.uploads.google_drive.public_folder_id', ''));
        if ($rootId === '') {
            $this->error('GOOGLE_DRIVE_PUBLIC_FOLDER_ID is not configured.');

            return self::FAILURE;
        }

        $privateTopFolders = ['Applications', 'Riders', 'Support'];
        $topChildren = $driveClient->listChildren($rootId);

        $checked = 0;
        $violations = [];

        $queue = [];
        foreach ($topChildren as $child) {
            if (($child['mimeType'] ?? '') === self::FOLDER_MIME && in_array($child['name'] ?? '', $privateTopFolders, true)) {
                $queue[] = $child;
            }
        }

        while ($queue !== []) {
            $node = array_shift($queue);
            $nodeId = (string) ($node['id'] ?? '');
            if ($nodeId === '') {
                continue;
            }

            $checked++;
            $perms = $driveClient->listPermissions($nodeId);
            foreach ($perms as $perm) {
                $role = strtolower((string) ($perm['role'] ?? ''));
                $type = strtolower((string) ($perm['type'] ?? ''));
                if ($role !== 'owner') {
                    $violations[] = [
                        'id' => $nodeId,
                        'name' => (string) ($node['name'] ?? ''),
                        'type' => $type,
                        'role' => $role,
                    ];
                }
            }

            if (($node['mimeType'] ?? '') === self::FOLDER_MIME) {
                foreach ($driveClient->listChildren($nodeId) as $sub) {
                    $queue[] = $sub;
                }
            }
        }

        $this->info("Checked {$checked} private Drive node(s). Violations: ".count($violations));

        if ($violations !== []) {
            $this->table(['Drive ID', 'Name', 'Permission Type', 'Role'], $violations);

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
