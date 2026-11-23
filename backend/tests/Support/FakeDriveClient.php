<?php

namespace Tests\Support;

use App\Support\Storage\DriveClientInterface;
use App\Support\Storage\GoogleDrivePublicImageStore;
use App\Support\Storage\ImageStorageUnavailableException;
use Illuminate\Support\Str;

class FakeDriveClient implements DriveClientInterface
{
    /** @var array<string, array{id: string, name: string, mimeType: string, parents: list<string>, appProperties: array<string, string>, trashed: bool, content: string, permissions: list<array<string, mixed>>}> */
    public array $nodes = [];

    /** @var list<array<string, mixed>> */
    public array $copyCalls = [];

    /** @var list<array<string, mixed>> */
    public array $moveCalls = [];

    /** @var list<string> */
    public array $trashCalls = [];

    /** @var list<array{id: string, name: string}> */
    public array $renameCalls = [];

    public ?ImageStorageUnavailableException $failNextPutWith = null;

    public ?ImageStorageUnavailableException $failNextCopyWith = null;

    public function __construct(string $rootId = 'fake_salo_root')
    {
        $this->nodes[$rootId] = [
            'id' => $rootId,
            'name' => 'SALO',
            'mimeType' => 'application/vnd.google-apps.folder',
            'parents' => [],
            'appProperties' => [],
            'trashed' => false,
            'content' => '',
            'permissions' => [['id' => 'owner', 'type' => 'user', 'role' => 'owner']],
        ];
    }

    public function findFolderByAppProperties(string $parentId, array $appProperties): ?string
    {
        foreach ($this->nodes as $node) {
            if ($node['trashed'] || $node['mimeType'] !== 'application/vnd.google-apps.folder') {
                continue;
            }
            if (! in_array($parentId, $node['parents'], true)) {
                continue;
            }
            $matches = true;
            foreach ($appProperties as $k => $v) {
                if (($node['appProperties'][$k] ?? null) !== (string) $v) {
                    $matches = false;
                    break;
                }
            }
            if ($matches) {
                return $node['id'];
            }
        }

        return null;
    }

    public function createFolder(string $parentId, string $name, array $appProperties): string
    {
        $id = 'fld_'.Str::random(14);
        $this->nodes[$id] = [
            'id' => $id,
            'name' => $name,
            'mimeType' => 'application/vnd.google-apps.folder',
            'parents' => [$parentId],
            'appProperties' => array_map('strval', $appProperties),
            'trashed' => false,
            'content' => '',
            'permissions' => [['id' => 'owner', 'type' => 'user', 'role' => 'owner']],
        ];

        return $id;
    }

    public function renameFile(string $fileId, string $newName): bool
    {
        if (! isset($this->nodes[$fileId]) || $this->nodes[$fileId]['trashed']) {
            return false;
        }
        $this->nodes[$fileId]['name'] = $newName;
        $this->renameCalls[] = ['id' => $fileId, 'name' => $newName];

        return true;
    }

    public function putFile(string $localPath, string $mime, string $opaqueName, string $folderId, array $appProperties = []): string
    {
        if ($this->failNextPutWith !== null) {
            $e = $this->failNextPutWith;
            $this->failNextPutWith = null;
            throw $e;
        }

        if (! isset($this->nodes[$folderId]) || $this->nodes[$folderId]['trashed']) {
            throw new ImageStorageUnavailableException('Folder not found', 404);
        }

        $id = 'file_'.Str::random(14);
        $this->nodes[$id] = [
            'id' => $id,
            'name' => $opaqueName,
            'mimeType' => $mime,
            'parents' => [$folderId],
            'appProperties' => array_map('strval', $appProperties),
            'trashed' => false,
            'content' => (string) @file_get_contents($localPath),
            'permissions' => [['id' => 'owner', 'type' => 'user', 'role' => 'owner']],
        ];

        return GoogleDrivePublicImageStore::PREFIX.$id;
    }

    public function copyFile(string $storedValue, string $targetFolderId, string $opaqueName, array $appProperties = []): string
    {
        if ($this->failNextCopyWith !== null) {
            $e = $this->failNextCopyWith;
            $this->failNextCopyWith = null;
            throw $e;
        }

        $sourceId = $this->stripPrefix($storedValue);
        if (! isset($this->nodes[$sourceId]) || $this->nodes[$sourceId]['trashed']) {
            throw ImageStorageUnavailableException::temporarilyUnavailable();
        }

        $newId = 'copy_'.Str::random(14);
        $source = $this->nodes[$sourceId];
        $this->nodes[$newId] = [
            'id' => $newId,
            'name' => $opaqueName,
            'mimeType' => $source['mimeType'],
            'parents' => [$targetFolderId],
            'appProperties' => array_map('strval', $appProperties ?: $source['appProperties']),
            'trashed' => false,
            'content' => $source['content'],
            'permissions' => [['id' => 'owner', 'type' => 'user', 'role' => 'owner']],
        ];

        $this->copyCalls[] = ['source' => $storedValue, 'target_folder' => $targetFolderId, 'new_id' => GoogleDrivePublicImageStore::PREFIX.$newId];

        return GoogleDrivePublicImageStore::PREFIX.$newId;
    }

    public function moveFile(string $storedValue, string $targetFolderId): bool
    {
        return $this->moveAndTagFile($storedValue, $targetFolderId, []);
    }

    public function moveAndTagFile(string $storedValue, string $targetFolderId, array $appProperties): bool
    {
        $fileId = $this->stripPrefix($storedValue);
        if (! isset($this->nodes[$fileId]) || $this->nodes[$fileId]['trashed']) {
            return false;
        }

        $oldParents = $this->nodes[$fileId]['parents'];
        $this->nodes[$fileId]['parents'] = [$targetFolderId];
        foreach ($appProperties as $k => $v) {
            $this->nodes[$fileId]['appProperties'][(string) $k] = (string) $v;
        }
        $this->moveCalls[] = [
            'file' => $storedValue,
            'from' => $oldParents,
            'to' => $targetFolderId,
            'appProperties' => $appProperties,
        ];

        return true;
    }

    public function trashFile(string $storedValueOrId): bool
    {
        $fileId = $this->stripPrefix($storedValueOrId);
        $this->trashCalls[] = $storedValueOrId;
        if (! isset($this->nodes[$fileId])) {
            return false;
        }
        $this->nodes[$fileId]['trashed'] = true;

        return true;
    }

    public function getFileMetadata(string $storedValueOrId): ?array
    {
        $fileId = $this->stripPrefix($storedValueOrId);
        if (! isset($this->nodes[$fileId])) {
            return null;
        }
        $node = $this->nodes[$fileId];

        return [
            'id' => $node['id'],
            'name' => $node['name'],
            'mimeType' => $node['mimeType'],
            'size' => strlen($node['content']),
            'trashed' => $node['trashed'],
            'parents' => $node['parents'],
            'appProperties' => $node['appProperties'],
        ];
    }

    public function readStream(string $storedValueOrId): array
    {
        $fileId = $this->stripPrefix($storedValueOrId);
        if (! isset($this->nodes[$fileId]) || $this->nodes[$fileId]['trashed']) {
            throw ImageStorageUnavailableException::temporarilyUnavailable();
        }
        $node = $this->nodes[$fileId];
        $stream = fopen('php://temp', 'w+b');
        fwrite($stream, $node['content']);
        rewind($stream);

        return [
            'stream' => $stream,
            'mime' => $node['mimeType'],
            'size' => strlen($node['content']),
            'appProperties' => $node['appProperties'],
        ];
    }

    public function listPermissions(string $storedValueOrId): array
    {
        $fileId = $this->stripPrefix($storedValueOrId);

        return $this->nodes[$fileId]['permissions'] ?? [];
    }

    public function listChildren(string $folderId): array
    {
        $target = $this->stripPrefix($folderId);
        $children = [];

        foreach ($this->nodes as $node) {
            if ($node['trashed'] || ! in_array($target, $node['parents'], true)) {
                continue;
            }
            $children[] = [
                'id' => $node['id'],
                'name' => $node['name'],
                'mimeType' => $node['mimeType'],
                'size' => (string) strlen($node['content']),
                'createdTime' => '2026-11-23T00:00:00Z',
                'appProperties' => $node['appProperties'],
            ];
        }

        return $children;
    }

    private function stripPrefix(string $val): string
    {
        return str_starts_with($val, GoogleDrivePublicImageStore::PREFIX)
            ? substr($val, strlen(GoogleDrivePublicImageStore::PREFIX))
            : $val;
    }
}
