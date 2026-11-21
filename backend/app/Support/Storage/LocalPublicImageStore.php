<?php

namespace App\Support\Storage;

use Illuminate\Http\File;
use Illuminate\Support\Facades\Storage;

class LocalPublicImageStore implements PublicImageStore
{
    public function put(string $localPath, string $mime, string $name, string $directory, array $meta = []): string
    {
        $cleanDir = trim($directory, '/');
        $storedPath = Storage::disk('public')->putFileAs($cleanDir, new File($localPath), $name);

        if ($storedPath === false) {
            throw ImageStorageUnavailableException::temporarilyUnavailable();
        }

        return $storedPath;
    }

    public function delete(string $storedValue): bool
    {
        $normalized = $this->normalizeRelativePath($storedValue);
        if ($normalized === null || ! Storage::disk('public')->exists($normalized)) {
            return false;
        }

        return Storage::disk('public')->delete($normalized);
    }

    public function exists(string $storedValue): bool
    {
        $normalized = $this->normalizeRelativePath($storedValue);

        return $normalized !== null && Storage::disk('public')->exists($normalized);
    }

    public function url(string $storedValue): ?string
    {
        $relative = $this->normalizeRelativePath($storedValue);
        if ($relative === null) {
            return null;
        }

        $appUrl = rtrim((string) config('app.url', 'http://localhost:8000'), '/');

        return $appUrl.'/storage/'.ltrim($relative, '/');
    }

    public function readStream(string $storedValue): array
    {
        $normalized = $this->normalizeRelativePath($storedValue);
        if ($normalized === null || ! Storage::disk('public')->exists($normalized)) {
            throw ImageStorageUnavailableException::temporarilyUnavailable();
        }

        $stream = Storage::disk('public')->readStream($normalized);
        if (! is_resource($stream)) {
            throw ImageStorageUnavailableException::temporarilyUnavailable();
        }

        return [
            'stream' => $stream,
            'mime' => (string) (Storage::disk('public')->mimeType($normalized) ?: 'application/octet-stream'),
            'size' => (int) Storage::disk('public')->size($normalized),
        ];
    }

    private function normalizeRelativePath(string $storedPath): ?string
    {
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
}
