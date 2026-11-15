<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class FileStorageService
{
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
     * Store a public image (restaurant logo, cover photo, menu item image) on the public disk.
     *
     * @return array<string, mixed>
     */
    public function storePublicImage(UploadedFile $file, string $directory, string $fieldName = 'image'): array
    {
        return $this->storeFile(
            file: $file,
            disk: 'public',
            directory: trim($directory, '/'),
            mimeMap: self::IMAGE_MIME_MAP,
            allowedExtensions: (array) config('salo.uploads.allowed_image_types', ['jpg', 'jpeg', 'png', 'webp']),
            fieldName: $fieldName,
        );
    }

    /**
     * Store a sensitive application document on the private local disk.
     *
     * @return array<string, mixed>
     */
    public function storePrivateDocument(UploadedFile $file, string $directory, string $fieldName = 'document'): array
    {
        return $this->storeFile(
            file: $file,
            disk: 'local',
            directory: trim($directory, '/'),
            mimeMap: self::DOCUMENT_MIME_MAP,
            allowedExtensions: (array) config('salo.uploads.allowed_document_types', ['pdf', 'jpg', 'jpeg', 'png']),
            fieldName: $fieldName,
        );
    }

    public function streamPrivateFile(string $path, string $downloadName, string $mimeType): StreamedResponse
    {
        abort_unless(Storage::disk('local')->exists($path), 404, 'Document file not found.');

        return Storage::disk('local')->response($path, $downloadName, [
            'Content-Type' => $mimeType,
            'Cache-Control' => 'private, no-store, max-age=0',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /**
     * @param  array<string, string>  $mimeMap
     * @param  array<int, string>  $allowedExtensions
     * @return array<string, mixed>
     */
    private function storeFile(
        UploadedFile $file,
        string $disk,
        string $directory,
        array $mimeMap,
        array $allowedExtensions,
        string $fieldName,
    ): array {
        if (! $file->isValid()) {
            throw ValidationException::withMessages([
                $fieldName => ['The uploaded file failed to upload. Please try again.'],
            ]);
        }

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

        $filename = Str::uuid()->toString().'.'.$canonicalExt;
        $storedPath = $file->storeAs($directory, $filename, $disk);

        if ($storedPath === false) {
            throw ValidationException::withMessages([
                $fieldName => ['Failed to store uploaded file.'],
            ]);
        }

        return [
            'path' => $storedPath,
            'url' => $disk === 'public' ? '/storage/'.$storedPath : null,
            'original_filename' => mb_substr(basename((string) $file->getClientOriginalName()) ?: $filename, 0, 255),
            'mime_type' => $detectedMime,
            'size_bytes' => $sizeBytes,
        ];
    }
}
