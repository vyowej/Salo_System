<?php

namespace App\Support;

use App\Support\Storage\GoogleDrivePublicImageStore;
use App\Support\Storage\PublicImageStore;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class FileStorageService
{
    public function __construct(
        private readonly PublicImageStore $publicImageStore,
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

        $storedValue = $this->publicImageStore->put(
            localPath: $validated['real_path'],
            mime: $validated['mime_type'],
            name: $validated['filename'],
            directory: trim($directory, '/'),
            meta: ['field' => $fieldName],
        );

        return [
            'path' => $storedValue,
            'url' => $this->publicUrl($storedValue),
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
                $this->publicImageStore->delete($trimmed);

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

    public function streamPrivateFile(string $path, string $downloadName, string $mimeType): StreamedResponse
    {
        $normalized = $this->normalizeRelativePath($path) ?? $path;
        abort_unless(Storage::disk('local')->exists($normalized), 404, 'Document file not found.');

        return Storage::disk('local')->response($normalized, $downloadName, [
            'Content-Type' => $mimeType,
            'Cache-Control' => 'private, no-store, max-age=0',
            'X-Content-Type-Options' => 'nosniff',
        ]);
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
