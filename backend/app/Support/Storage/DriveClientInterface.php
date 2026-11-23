<?php

namespace App\Support\Storage;

interface DriveClientInterface
{
    /**
     * Find an active (non-trashed) folder under $parentId matching all given appProperties.
     *
     * @param  array<string, string>  $appProperties
     */
    public function findFolderByAppProperties(string $parentId, array $appProperties): ?string;

    /**
     * Create a folder under $parentId with the given appProperties and return its Drive fileId.
     *
     * @param  array<string, string>  $appProperties
     */
    public function createFolder(string $parentId, string $name, array $appProperties): string;

    /**
     * Rename a Drive file or folder by fileId. Returns false if 404.
     */
    public function renameFile(string $fileId, string $newName): bool;

    /**
     * Upload a local file into $folderId with an opaque filename and appProperties. Returns `gdrive:{fileId}`.
     *
     * @param  array<string, string>  $appProperties
     */
    public function putFile(string $localPath, string $mime, string $opaqueName, string $folderId, array $appProperties = []): string;

    /**
     * Server-side copy of an existing Drive file into $targetFolderId. Returns `gdrive:{newFileId}`.
     *
     * @param  array<string, string>  $appProperties
     */
    public function copyFile(string $storedValue, string $targetFolderId, string $opaqueName, array $appProperties = []): string;

    /**
     * Move an existing Drive file to $targetFolderId, preserving its fileId. Returns false if 404.
     */
    public function moveFile(string $storedValue, string $targetFolderId): bool;

    /**
     * Move an existing Drive file to $targetFolderId AND update its appProperties (preserving fileId).
     *
     * @param  array<string, string>  $appProperties
     */
    public function moveAndTagFile(string $storedValue, string $targetFolderId, array $appProperties): bool;

    /**
     * Move a Drive file or folder to the Drive trash (`trashed = true`).
     */
    public function trashFile(string $storedValueOrId): bool;

    /**
     * Fetch Drive metadata (`id`, `name`, `mimeType`, `size`, `trashed`, `parents`, `appProperties`). Returns null if 404.
     *
     * @return array<string, mixed>|null
     */
    public function getFileMetadata(string $storedValueOrId): ?array;

    /**
     * Read file bytes stream + mime + size + appProperties.
     *
     * @return array{stream: resource, mime: string, size: int, appProperties: array<string, string>}
     */
    public function readStream(string $storedValueOrId): array;

    /**
     * List Drive permissions on a file or folder.
     *
     * @return list<array<string, mixed>>
     */
    public function listPermissions(string $storedValueOrId): array;

    /**
     * List all non-trashed direct children (files and folders) inside $folderId.
     *
     * @return list<array<string, mixed>>
     */
    public function listChildren(string $folderId): array;
}
