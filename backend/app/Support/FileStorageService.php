<?php

namespace App\Support;

use App\Support\Storage\DriveClientInterface;
use App\Support\Storage\DriveFolderResolver;
use App\Support\Storage\GoogleDrivePublicImageStore;
use App\Support\Storage\ImageProcessor;
use App\Support\Storage\ImageStorageUnavailableException;
use App\Support\Storage\PublicImageStore;
use Illuminate\Http\Request;
use App\Support\Storage\StoragePurpose;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class FileStorageService
{
    public function __construct(
        private readonly PublicImageStore $publicImageStore,
        private readonly ?DriveClientInterface $driveClient = null,
        private readonly ?DriveFolderResolver $folderResolver = null,
    ) {}
    private const IMAGE_MIME_MAP = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];

    private const DOCUMENT_MIME_MAP = [
        'application/pdf' => 'pdf',
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
    ];

    /**
     * Extensions that must never appear anywhere in an uploaded filename (including double extensions).
     */
    private const DANGEROUS_EXTENSIONS = [
        'php', 'php3', 'php4', 'php5', 'php7', 'php8', 'phtml', 'phar', 'phps',
        'exe', 'dll', 'bat', 'cmd', 'com', 'msi', 'vbs', 'vbe', 'ps1',
        'sh', 'bash', 'zsh', 'ksh', 'csh',
        'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
        'jsp', 'jspx', 'asp', 'aspx', 'ashx', 'asmx',
        'cgi', 'pl', 'py', 'rb', 'jar', 'war',
        'html', 'htm', 'xhtml', 'svg', 'xml', 'htaccess',
    ];

    /**
     * Store a public image (restaurant logo, cover photo, menu item image) via the configured PublicImageStore.
     *
     * @return array<string, mixed>
     */
    public function storePublicImage(UploadedFile $file, string $directory, string $fieldName = 'image'): array
    {
        $validated = $this->validateUploadedFile(
            file: $file,
            mimeMap: self::IMAGE_MIME_MAP,
            allowedExtensions: (array) config('salo.uploads.allowed_image_types', ['jpg', 'jpeg', 'png', 'webp']),
            fieldName: $fieldName,
        );

        $optimizedPath = ImageProcessor::sanitizeAndOptimize($validated['real_path'], $validated['mime_type']);
        $sourcePath = $optimizedPath ?? $validated['real_path'];

        try {
            $storedValue = $this->publicImageStore->put(
                localPath: $sourcePath,
                mime: $validated['mime_type'],
                name: $validated['filename'],
                directory: trim($directory, '/'),
                meta: ['field' => $fieldName, 'visibility' => StoragePurpose::VISIBILITY_PUBLIC],
            );
        } finally {
            if ($optimizedPath !== null && is_file($optimizedPath)) {
                @unlink($optimizedPath);
            }
        }

        return [
            'path' => $storedValue,
            'url' => $this->publicUrl($storedValue),
            'original_filename' => $validated['original_filename'],
            'mime_type' => $validated['mime_type'],
            'size_bytes' => $validated['size_bytes'],
        ];
    }

    /**
     * Store a public image using a named purpose and owner context (structured Drive folders when Drive is active).
     *
     * @param  array<string, mixed>  $ownerContext
     * @return array<string, mixed>
     */
    public function storePublicImageForPurpose(
        UploadedFile $file,
        string $purpose,
        array $ownerContext,
        string $localDirectory,
        string $fieldName = 'image',
    ): array {
        if (! $this->useStructuredDriveForPublic()) {
            return $this->storePublicImage($file, $localDirectory, $fieldName);
        }

        $validated = $this->validateUploadedFile(
            file: $file,
            mimeMap: self::IMAGE_MIME_MAP,
            allowedExtensions: (array) config('salo.uploads.allowed_image_types', ['jpg', 'jpeg', 'png', 'webp']),
            fieldName: $fieldName,
        );

        $maxDim = $purpose === StoragePurpose::RESTAURANT_LOGO ? 1024 : 1920;
        $optimizedPath = ImageProcessor::sanitizeAndOptimize($validated['real_path'], $validated['mime_type'], $maxDim);
        $sourcePath = $optimizedPath ?? $validated['real_path'];

        try {
            $appProperties = $this->buildAppProperties($purpose, $ownerContext);
            $storedValue = $this->putIntoDriveFolderWithRetry(
                localPath: $sourcePath,
                mime: $validated['mime_type'],
                opaqueName: $validated['filename'],
                purpose: $purpose,
                ownerContext: $ownerContext,
                appProperties: $appProperties,
            );
        } finally {
            if ($optimizedPath !== null && is_file($optimizedPath)) {
                @unlink($optimizedPath);
            }
        }

        return [
            'path' => $storedValue,
            'url' => $this->publicUrl($storedValue),
            'original_filename' => $validated['original_filename'],
            'mime_type' => $validated['mime_type'],
            'size_bytes' => $validated['size_bytes'],
        ];
    }

    /**
     * Store a private file using a named purpose and owner context.
     * Profile change request supporting documents stay local even when PRIVATE_FILE_STORAGE=google_drive.
     *
     * @param  array<string, mixed>  $ownerContext
     * @return array<string, mixed>
     */
    public function storePrivateFileForPurpose(
        UploadedFile $file,
        string $purpose,
        array $ownerContext,
        string $localDirectory,
        string $fieldName = 'document',
        bool $imagesOnly = false,
    ): array {
        $mimeMap = $imagesOnly ? self::IMAGE_MIME_MAP : self::DOCUMENT_MIME_MAP;
        $allowedExt = $imagesOnly
            ? (array) config('salo.uploads.allowed_image_types', ['jpg', 'jpeg', 'png', 'webp'])
            : (array) config('salo.uploads.allowed_document_types', ['pdf', 'jpg', 'jpeg', 'png']);

        $validated = $this->validateUploadedFile(
            file: $file,
            mimeMap: $mimeMap,
            allowedExtensions: $allowedExt,
            fieldName: $fieldName,
        );

        $useDrive = $purpose !== StoragePurpose::PROFILE_CHANGE_DOCUMENT
            && $this->useStructuredDriveForPrivate();

        if (! $useDrive) {
            $optimizedPath = $imagesOnly
                ? ImageProcessor::sanitizeAndOptimize($validated['real_path'], $validated['mime_type'], 1920)
                : null;
            try {
                if ($optimizedPath !== null) {
                    $relative = trim($localDirectory, '/').'/'.$validated['filename'];
                    $bytes = @file_get_contents($optimizedPath);
                    if ($bytes === false || ! Storage::disk('local')->put($relative, $bytes)) {
                        throw ValidationException::withMessages([$fieldName => ['Failed to store uploaded file.']]);
                    }
                    $storedPath = $relative;
                } else {
                    $storedPath = $file->storeAs(trim($localDirectory, '/'), $validated['filename'], 'local');
                    if ($storedPath === false) {
                        throw ValidationException::withMessages([$fieldName => ['Failed to store uploaded file.']]);
                    }
                }
            } finally {
                if ($optimizedPath !== null && is_file($optimizedPath)) {
                    @unlink($optimizedPath);
                }
            }

            return [
                'path' => $storedPath,
                'url' => null,
                'original_filename' => $validated['original_filename'],
                'mime_type' => $validated['mime_type'],
                'size_bytes' => $validated['size_bytes'],
            ];
        }

        $optimizedPath = str_starts_with($validated['mime_type'], 'image/')
            ? ImageProcessor::sanitizeAndOptimize($validated['real_path'], $validated['mime_type'], 1920)
            : null;
        $sourcePath = $optimizedPath ?? $validated['real_path'];

        try {
            $appProperties = $this->buildAppProperties($purpose, $ownerContext);
            $storedValue = $this->putIntoDriveFolderWithRetry(
                localPath: $sourcePath,
                mime: $validated['mime_type'],
                opaqueName: $validated['filename'],
                purpose: $purpose,
                ownerContext: $ownerContext,
                appProperties: $appProperties,
            );
        } finally {
            if ($optimizedPath !== null && is_file($optimizedPath)) {
                @unlink($optimizedPath);
            }
        }

        return [
            'path' => $storedValue,
            'url' => null,
            'original_filename' => $validated['original_filename'],
            'mime_type' => $validated['mime_type'],
            'size_bytes' => $validated['size_bytes'],
        ];
    }

    /**
     * Store a sensitive application document on the private local disk.
     *
     * @return array<string, mixed>
     */
    public function storePrivateDocument(UploadedFile $file, string $directory, string $fieldName = 'document'): array
    {
        $validated = $this->validateUploadedFile(
            file: $file,
            mimeMap: self::DOCUMENT_MIME_MAP,
            allowedExtensions: (array) config('salo.uploads.allowed_document_types', ['pdf', 'jpg', 'jpeg', 'png']),
            fieldName: $fieldName,
        );

        $storedPath = $file->storeAs(trim($directory, '/'), $validated['filename'], 'local');

        if ($storedPath === false) {
            throw ValidationException::withMessages([
                $fieldName => ['Failed to store uploaded file.'],
            ]);
        }

        return [
            'path' => $storedPath,
            'url' => null,
            'original_filename' => $validated['original_filename'],
            'mime_type' => $validated['mime_type'],
            'size_bytes' => $validated['size_bytes'],
        ];
    }

    /**
     * Safely replace a public image: stores the new image first, then deletes the old one
     * only if no database record still references it.
     *
     * @param  callable(string): bool  $isOldPathReferenced
     * @return array<string, mixed>
     */
    public function replacePublicImage(
        UploadedFile $newFile,
        string $directory,
        ?string $oldPath,
        callable $isOldPathReferenced,
        string $fieldName = 'image',
    ): array {
        $stored = $this->storePublicImage($newFile, $directory, $fieldName);

        if ($oldPath !== null && $oldPath !== '') {
            $this->deleteIfUnreferenced('public', $oldPath, $isOldPathReferenced);
        }

        return $stored;
    }

    /**
     * Delete a file from the given disk only when it is no longer referenced.
     *
     * @param  callable(string): bool  $isReferenced
     */
    public function deleteIfUnreferenced(string $disk, ?string $path, callable $isReferenced): bool
    {
        if ($disk === 'public') {
            if ($path === null || trim($path) === '') {
                return false;
            }

            $trimmed = trim($path);
            if (str_starts_with($trimmed, 'gdrive:')) {
                if ($isReferenced($trimmed)) {
                    return false;
                }

                if ($this->useStructuredDriveForPublic()) {
                    return $this->drive()->trashFile($trimmed);
                }

                return $this->publicImageStore->delete($trimmed);
            }

            $normalized = $this->normalizeRelativePath($trimmed);
            if ($normalized === null || $isReferenced($normalized)) {
                return false;
            }

            if ($this->publicImageStore->delete($normalized)) {
                return true;
            }

            return Storage::disk('public')->exists($normalized) && Storage::disk('public')->delete($normalized);
        }

        $normalized = $this->normalizeRelativePath($path);
        if ($normalized === null) {
            return false;
        }

        if ($isReferenced($normalized)) {
            return false;
        }

        if (! Storage::disk($disk)->exists($normalized)) {
            return false;
        }

        return Storage::disk($disk)->delete($normalized);
    }

    /**
     * Delete newly-stored files when an application transaction rolls back or validation fails mid-flight.
     *
     * @param  array<int, string>  $publicPaths
     * @param  array<int, string>  $privatePaths
     */
    public function cleanupStoredPaths(array $publicPaths = [], array $privatePaths = []): void
    {
        foreach ($publicPaths as $path) {
            $trimmed = trim((string) $path);
            if ($trimmed === '') {
                continue;
            }

            if (str_starts_with($trimmed, 'gdrive:')) {
                if ($this->useStructuredDriveForPublic()) {
                    $this->drive()->trashFile($trimmed);
                } else {
                    $this->publicImageStore->delete($trimmed);
                }

                continue;
            }

            $normalized = $this->normalizeRelativePath($trimmed);
            if ($normalized === null) {
                continue;
            }

            if (! $this->publicImageStore->delete($normalized) && Storage::disk('public')->exists($normalized)) {
                Storage::disk('public')->delete($normalized);
            }
        }

        foreach ($privatePaths as $path) {
            $trimmed = trim((string) $path);
            if ($trimmed !== '' && str_starts_with($trimmed, 'gdrive:')) {
                $this->drive()->trashFile($trimmed);

                continue;
            }

            $normalized = $this->normalizeRelativePath($path);
            if ($normalized !== null && Storage::disk('local')->exists($normalized)) {
                Storage::disk('local')->delete($normalized);
            }
        }
    }

    /**
     * Resolve a stored public disk path (or legacy /storage/... path) into a full URL using APP_URL.
     */
    public function publicUrl(?string $storedPath): ?string
    {
        if ($storedPath === null) {
            return null;
        }

        $trimmed = trim($storedPath);
        if ($trimmed === '') {
            return null;
        }

        if (GoogleDrivePublicImageStore::isDriveValue($trimmed)) {
            $fileId = GoogleDrivePublicImageStore::extractFileId($trimmed);
            if ($fileId === null) {
                return null;
            }

            $appUrl = rtrim((string) config('app.url', 'http://localhost:8000'), '/');

            return $appUrl.'/api/media/images/'.$fileId;
        }

        if (preg_match('#^https?://#i', $trimmed) === 1) {
            return $trimmed;
        }

        $relative = $this->normalizeRelativePath($trimmed);
        if ($relative === null) {
            return null;
        }

        $appUrl = rtrim((string) config('app.url', 'http://localhost:8000'), '/');

        return $appUrl.'/storage/'.ltrim($relative, '/');
    }

    /**
     * Normalize a stored path by stripping any legacy '/storage/' or 'storage/' prefix.
     */
    public function normalizeRelativePath(?string $storedPath): ?string
    {
        if ($storedPath === null) {
            return null;
        }

        $trimmed = trim(str_replace('\\', '/', $storedPath));
        if ($trimmed === '') {
            return null;
        }

        if (str_starts_with($trimmed, '/storage/')) {
            $trimmed = substr($trimmed, strlen('/storage/'));
        } elseif (str_starts_with($trimmed, 'storage/')) {
            $trimmed = substr($trimmed, strlen('storage/'));
        }

        $trimmed = ltrim($trimmed, '/');

        return $trimmed === '' ? null : $trimmed;
    }

    public function streamPrivateFile(
        string $path,
        string $downloadName,
        string $mimeType,
        bool $thumbnail = false,
        ?Request $request = null,
    ): Response {
        $normalized = $this->normalizeRelativePath($path) ?? $path;
        /** @var \Illuminate\Filesystem\FilesystemAdapter $localDisk */
        $localDisk = Storage::disk('local');
        abort_unless($localDisk->exists($normalized), 404, 'Document file not found.');

        $etag = '"'.sha1($normalized.($thumbnail ? ':thumb' : '')).'"';
        if ($request !== null && $request->headers->get('If-None-Match') === $etag) {
            return response('', 304, [
                'ETag' => $etag,
                'Cache-Control' => 'private, max-age=300',
            ]);
        }

        if ($thumbnail && str_starts_with($mimeType, 'image/')) {
            $thumbRel = 'private_thumbs/'.sha1($normalized).'.jpg';
            if (! $localDisk->exists($thumbRel)) {
                $fullPath = $localDisk->path($normalized);
                $resized = ImageProcessor::sanitizeAndOptimize($fullPath, $mimeType, 320);
                if ($resized !== null && is_file($resized)) {
                    $thumbBytes = @file_get_contents($resized);
                    @unlink($resized);
                    if ($thumbBytes !== false) {
                        $localDisk->put($thumbRel, $thumbBytes);
                    }
                }
            }
            if ($localDisk->exists($thumbRel)) {
                return $localDisk->response($thumbRel, $downloadName, [
                    'Content-Type' => 'image/jpeg',
                    'Cache-Control' => 'private, max-age=300',
                    'ETag' => $etag,
                    'X-Content-Type-Options' => 'nosniff',
                ]);
            }
        }

        return $localDisk->response($normalized, $downloadName, [
            'Content-Type' => $mimeType,
            'Cache-Control' => 'private, max-age=300',
            'ETag' => $etag,
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /**
     * Stream a private file from either Google Drive (enforcing visibility=private) or local storage.
     */
    public function streamPrivateStoredFile(
        string $path,
        ?string $downloadName,
        string $mimeType,
        bool $thumbnail = false,
        ?Request $request = null,
    ): Response {
        $trimmed = trim($path);
        if (! str_starts_with($trimmed, GoogleDrivePublicImageStore::PREFIX)) {
            return $this->streamPrivateFile($trimmed, $downloadName ?: basename($trimmed), $mimeType, $thumbnail, $request);
        }

        $etag = '"'.sha1($trimmed.($thumbnail ? ':thumb' : '')).'"';
        if ($request !== null && $request->headers->get('If-None-Match') === $etag) {
            return response('', 304, [
                'ETag' => $etag,
                'Cache-Control' => 'private, max-age=300',
            ]);
        }

        /** @var \Illuminate\Filesystem\FilesystemAdapter $localDisk */
        $localDisk = Storage::disk('local');
        $thumbRel = 'private_thumbs/'.sha1($trimmed).'.jpg';
        if ($thumbnail && str_starts_with($mimeType, 'image/') && $localDisk->exists($thumbRel)) {
            return $localDisk->response($thumbRel, $downloadName ?: 'thumb.jpg', [
                'Content-Type' => 'image/jpeg',
                'Cache-Control' => 'private, max-age=300',
                'ETag' => $etag,
                'X-Content-Type-Options' => 'nosniff',
            ]);
        }

        $result = $this->drive()->readStream($trimmed);
        $stream = $result['stream'];
        $appProps = is_array($result['appProperties'] ?? null) ? $result['appProperties'] : [];
        $visibility = (string) ($appProps['visibility'] ?? '');

        if ($visibility !== StoragePurpose::VISIBILITY_PRIVATE) {
            if (is_resource($stream)) {
                fclose($stream);
            }
            abort(404, 'Document file not found.');
        }

        $bytes = stream_get_contents($stream);
        if (is_resource($stream)) {
            fclose($stream);
        }

        if ($bytes === false) {
            abort(503, 'Document storage is temporarily unavailable.');
        }

        $safeName = str_replace(['"', "\r", "\n"], '', $downloadName ?: 'document');
        $resolvedMime = $mimeType !== '' ? $mimeType : (string) ($result['mime'] ?? 'application/octet-stream');

        if ($thumbnail && str_starts_with($resolvedMime, 'image/')) {
            $tmpFile = tempnam(sys_get_temp_dir(), 'salo_thumb_');
            if ($tmpFile !== false) {
                @file_put_contents($tmpFile, $bytes);
                $resized = ImageProcessor::sanitizeAndOptimize($tmpFile, $resolvedMime, 320);
                @unlink($tmpFile);
                if ($resized !== null && is_file($resized)) {
                    $thumbBytes = @file_get_contents($resized);
                    @unlink($resized);
                    if ($thumbBytes !== false) {
                        $localDisk->put($thumbRel, $thumbBytes);
                        return response($thumbBytes, 200, [
                            'Content-Type' => 'image/jpeg',
                            'Content-Length' => (string) strlen($thumbBytes),
                            'Content-Disposition' => 'inline; filename="'.$safeName.'"',
                            'Cache-Control' => 'private, max-age=300',
                            'ETag' => $etag,
                            'X-Content-Type-Options' => 'nosniff',
                        ]);
                    }
                }
            }
        }

        return response($bytes, 200, [
            'Content-Type' => $resolvedMime,
            'Content-Length' => (string) strlen($bytes),
            'Content-Disposition' => 'inline; filename="'.$safeName.'"',
            'Cache-Control' => 'private, max-age=300',
            'ETag' => $etag,
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /**
     * Check ALL public image columns across restaurants and menu_items before trashing any image.
     */
    public function isPublicAssetReferenced(string $storedValue): bool
    {
        $trimmed = trim($storedValue);
        if ($trimmed === '') {
            return false;
        }

        $candidates = [$trimmed];
        if (! str_starts_with($trimmed, GoogleDrivePublicImageStore::PREFIX)) {
            $normalized = $this->normalizeRelativePath($trimmed);
            if ($normalized !== null) {
                $candidates = array_values(array_unique([$normalized, '/storage/'.ltrim($normalized, '/')]));
            }
        }

        return DB::table('restaurants')
            ->whereIn('logo_image', $candidates)
            ->orWhereIn('cover_image', $candidates)
            ->exists()
            || DB::table('menu_items')
                ->whereIn('photo_image', $candidates)
                ->orWhereIn('published_photo_image', $candidates)
                ->exists();
    }

    /**
     * Server-side copy of a menu item photo into a target branch's category folder (never share one fileId).
     *
     * @param  array<string, mixed>  $targetOwnerContext
     */
    public function copyPublicImageToCategory(?string $sourceStoredValue, array $targetOwnerContext): ?string
    {
        if ($sourceStoredValue === null || trim($sourceStoredValue) === '') {
            return null;
        }

        $trimmed = trim($sourceStoredValue);

        if (str_starts_with($trimmed, GoogleDrivePublicImageStore::PREFIX)) {
            if (! $this->useStructuredDriveForPublic()) {
                return $trimmed;
            }

            $meta = $this->drive()->getFileMetadata($trimmed);
            $mime = (string) ($meta['mimeType'] ?? 'image/jpeg');
            $ext = self::IMAGE_MIME_MAP[$mime] ?? 'jpg';
            $opaqueName = Str::uuid()->toString().'.'.$ext;
            $folderId = $this->folders()->resolveFolderForPurpose(StoragePurpose::MENU_ITEM_PHOTO, $targetOwnerContext);
            $appProperties = $this->buildAppProperties(StoragePurpose::MENU_ITEM_PHOTO, $targetOwnerContext);

            return $this->drive()->copyFile($trimmed, $folderId, $opaqueName, $appProperties);
        }

        $relative = $this->normalizeRelativePath($trimmed);
        if ($relative === null || ! Storage::disk('public')->exists($relative)) {
            return $trimmed;
        }

        $ext = strtolower(pathinfo($relative, PATHINFO_EXTENSION)) ?: 'jpg';
        $targetRestaurantId = (int) ($targetOwnerContext['restaurant_id'] ?? 0);
        $newRelative = "restaurants/{$targetRestaurantId}/menu/".Str::uuid()->toString().'.'.$ext;
        Storage::disk('public')->copy($relative, $newRelative);

        return $newRelative;
    }

    /**
     * Move an existing Drive menu item photo to a new category folder (preserving fileId).
     *
     * @param  array<string, mixed>  $targetOwnerContext
     */
    public function moveMenuPhotoToCategory(?string $storedValue, array $targetOwnerContext): void
    {
        if ($storedValue === null || ! str_starts_with(trim($storedValue), GoogleDrivePublicImageStore::PREFIX)) {
            return;
        }

        if (! $this->useStructuredDriveForPublic()) {
            return;
        }

        try {
            $targetFolderId = $this->folders()->resolveFolderForPurpose(StoragePurpose::MENU_ITEM_PHOTO, $targetOwnerContext);
            $this->drive()->moveFile(trim($storedValue), $targetFolderId);
        } catch (\Throwable $e) {
            Log::warning('Failed to move Drive menu photo between category folders.', [
                'error' => $e->getMessage(),
            ]);
        }
    }

    public function folders(): DriveFolderResolver
    {
        return $this->folderResolver ?? app(DriveFolderResolver::class);
    }

    public function drive(): DriveClientInterface
    {
        return $this->driveClient ?? app(DriveClientInterface::class);
    }

    private function useStructuredDriveForPublic(): bool
    {
        return strtolower(trim((string) config('salo.uploads.public_image_driver', 'local'))) === 'google_drive';
    }

    private function useStructuredDriveForPrivate(): bool
    {
        return strtolower(trim((string) config('salo.uploads.private_file_driver', 'local'))) === 'google_drive';
    }

    /**
     * @param  array<string, mixed>  $ownerContext
     * @return array<string, string>
     */
    private function buildAppProperties(string $purpose, array $ownerContext): array
    {
        $props = [
            'visibility' => StoragePurpose::visibility($purpose),
            'salo_purpose' => $purpose,
        ];

        foreach (['brand_restaurant_id', 'restaurant_id', 'menu_category_id', 'application_id', 'application_branch_id', 'rider_user_id', 'order_id'] as $key) {
            if (isset($ownerContext[$key]) && $ownerContext[$key] !== null) {
                $props[$key] = (string) $ownerContext[$key];
            }
        }

        return $props;
    }

    /**
     * @param  array<string, mixed>  $ownerContext
     * @param  array<string, string>  $appProperties
     */
    private function putIntoDriveFolderWithRetry(
        string $localPath,
        string $mime,
        string $opaqueName,
        string $purpose,
        array $ownerContext,
        array $appProperties,
    ): string {
        $folderId = $this->folders()->resolveFolderForPurpose($purpose, $ownerContext);

        try {
            return $this->drive()->putFile($localPath, $mime, $opaqueName, $folderId, $appProperties);
        } catch (ImageStorageUnavailableException $e) {
            if ($e->statusCode() !== 404) {
                throw $e;
            }
            // Cached folder ID returned 404: drop folder cache keys for this purpose and re-resolve by appProperties once.
            $this->folders()->forgetPurposeCache($purpose, $ownerContext);
            $freshFolderId = $this->folders()->resolveFolderForPurpose($purpose, $ownerContext);

            return $this->drive()->putFile($localPath, $mime, $opaqueName, $freshFolderId, $appProperties);
        }
    }

    /**
     * @param  array<string, string>  $mimeMap
     * @param  array<int, string>  $allowedExtensions
     * @return array{real_path: string, filename: string, original_filename: string, mime_type: string, size_bytes: int}
     */
    private function validateUploadedFile(
        UploadedFile $file,
        array $mimeMap,
        array $allowedExtensions,
        string $fieldName,
    ): array {
        if (! $file->isValid()) {
            throw ValidationException::withMessages([
                $fieldName => ['The uploaded file failed to upload. Please try again.'],
            ]);
        }

        $originalName = basename((string) $file->getClientOriginalName());
        $this->assertSafeFilename($originalName, $fieldName);

        $maxKb = max(256, (int) config('salo.uploads.max_size_kb', 5120));
        $sizeBytes = (int) $file->getSize();
        if ($sizeBytes <= 0 || $sizeBytes > ($maxKb * 1024)) {
            throw ValidationException::withMessages([
                $fieldName => ["File size must not exceed {$maxKb} KB."],
            ]);
        }

        // Detect actual MIME type from file contents rather than trusting browser headers.
        $detectedMime = strtolower((string) ($file->getMimeType() ?: ''));
        if (! isset($mimeMap[$detectedMime])) {
            throw ValidationException::withMessages([
                $fieldName => ['Unsupported file content type.'],
            ]);
        }

        $canonicalExt = $mimeMap[$detectedMime];
        if (! in_array($canonicalExt, $allowedExtensions, true) && ! ($canonicalExt === 'jpg' && in_array('jpeg', $allowedExtensions, true))) {
            throw ValidationException::withMessages([
                $fieldName => ['File type is not permitted for this upload.'],
            ]);
        }

        $realPath = $file->getRealPath();
        if ($realPath === false) {
            throw ValidationException::withMessages([
                $fieldName => ['Unable to read uploaded file contents.'],
            ]);
        }

        if (str_starts_with($detectedMime, 'image/')) {
            $this->assertValidImageContent($realPath, $detectedMime, $fieldName);
        } elseif ($detectedMime === 'application/pdf') {
            $this->assertValidPdfHeader($realPath, $fieldName);
        }

        $filename = Str::uuid()->toString().'.'.$canonicalExt;

        return [
            'real_path' => $realPath,
            'filename' => $filename,
            'original_filename' => mb_substr($originalName ?: $filename, 0, 255),
            'mime_type' => $detectedMime,
            'size_bytes' => $sizeBytes,
        ];
    }

    /**
     * Reject executable filenames and double extensions (e.g. shell.php.jpg).
     */
    private function assertSafeFilename(string $filename, string $fieldName): void
    {
        if ($filename === '' || str_contains($filename, "\0")) {
            throw ValidationException::withMessages([
                $fieldName => ['Invalid uploaded filename.'],
            ]);
        }

        $parts = explode('.', strtolower($filename));
        if (count($parts) > 1) {
            // Check every extension segment (ignoring the base name at index 0)
            $extSegments = array_slice($parts, 1);
            foreach ($extSegments as $segment) {
                if ($segment === '' || in_array($segment, self::DANGEROUS_EXTENSIONS, true)) {
                    throw ValidationException::withMessages([
                        $fieldName => ['Unsafe or executable filename extension is not allowed.'],
                    ]);
                }
            }

            // Reject explicit double-extension patterns like file.jpg.png or file.pdf.jpg
            if (count($extSegments) >= 2) {
                $penultimate = $extSegments[count($extSegments) - 2];
                if (in_array($penultimate, ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'gif'], true)) {
                    throw ValidationException::withMessages([
                        $fieldName => ['Double file extensions are not permitted.'],
                    ]);
                }
            }
        }
    }

    /**
     * Verify actual image dimensions and decodability using getimagesize + GD.
     */
    private function assertValidImageContent(string $realPath, string $detectedMime, string $fieldName): void
    {
        $info = @getimagesize($realPath);
        if ($info === false || empty($info[0]) || empty($info[1])) {
            throw ValidationException::withMessages([
                $fieldName => ['The uploaded file is not a valid image.'],
            ]);
        }

        $expectedType = match ($detectedMime) {
            'image/jpeg' => IMAGETYPE_JPEG,
            'image/png' => IMAGETYPE_PNG,
            'image/webp' => IMAGETYPE_WEBP,
            default => null,
        };

        if ($expectedType === null || (int) $info[2] !== $expectedType) {
            throw ValidationException::withMessages([
                $fieldName => ['Image content does not match its detected type.'],
            ]);
        }

        if (function_exists('imagecreatefromjpeg')) {
            $resource = match ($detectedMime) {
                'image/jpeg' => @imagecreatefromjpeg($realPath),
                'image/png' => @imagecreatefrompng($realPath),
                'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($realPath) : true,
                default => false,
            };

            if ($resource === false) {
                throw ValidationException::withMessages([
                    $fieldName => ['The uploaded image could not be decoded safely.'],
                ]);
            }

            if ($resource instanceof \GdImage) {
                imagedestroy($resource);
            }
        }
    }

    private function assertValidPdfHeader(string $realPath, string $fieldName): void
    {
        $handle = @fopen($realPath, 'rb');
        if ($handle === false) {
            throw ValidationException::withMessages([
                $fieldName => ['Unable to verify PDF file contents.'],
            ]);
        }

        $header = fread($handle, 5);
        fclose($handle);

        if ($header !== '%PDF-') {
            throw ValidationException::withMessages([
                $fieldName => ['The uploaded file is not a valid PDF document.'],
            ]);
        }
    }
}
