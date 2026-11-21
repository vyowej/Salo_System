<?php

namespace App\Support\Storage;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class GoogleDrivePublicImageStore implements PublicImageStore
{
    public const PREFIX = 'gdrive:';

    private const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

    private const FILES_URL = 'https://www.googleapis.com/drive/v3/files';

    public function __construct(
        private readonly GoogleDriveTokenProvider $tokenProvider,
        private readonly int $retryBaseDelayMs = 200,
    ) {}

    public function put(string $localPath, string $mime, string $name, string $directory, array $meta = []): string
    {
        $folderId = trim((string) config('salo.uploads.google_drive.public_folder_id', ''));
        if ($folderId === '') {
            Log::critical('Google Drive public folder ID is not configured.');
            throw ImageStorageUnavailableException::credentialsInvalid();
        }

        $bytes = @file_get_contents($localPath);
        if ($bytes === false) {
            throw ImageStorageUnavailableException::temporarilyUnavailable();
        }

        $driveName = $this->buildDriveFilename($name, $directory, $meta);
        $appProperties = $this->sanitizeMeta($meta);

        $metadataJson = json_encode(array_filter([
            'name' => $driveName,
            'parents' => [$folderId],
            'appProperties' => $appProperties !== [] ? $appProperties : null,
        ], static fn ($v) => $v !== null), JSON_THROW_ON_ERROR);

        $boundary = 'salo_'.Str::random(24);
        $multipartBody = "--{$boundary}\r\n"
            ."Content-Type: application/json; charset=UTF-8\r\n\r\n"
            .$metadataJson."\r\n"
            ."--{$boundary}\r\n"
            ."Content-Type: {$mime}\r\n\r\n"
            .$bytes."\r\n"
            ."--{$boundary}--";

        $response = $this->sendWithRetry(function (string $token) use ($multipartBody, $boundary): Response {
            return Http::withToken($token)
                ->connectTimeout(5)
                ->timeout($this->timeoutSeconds())
                ->withBody($multipartBody, "multipart/related; boundary={$boundary}")
                ->post(self::UPLOAD_URL.'?uploadType=multipart&fields=id,mimeType,size');
        }, 'upload');

        $fileId = (string) ($response->json('id') ?? '');
        if ($fileId === '') {
            Log::warning('Google Drive upload response missing file id.');
            throw ImageStorageUnavailableException::temporarilyUnavailable();
        }

        return self::PREFIX.$fileId;
    }

    public function delete(string $storedValue): bool
    {
        $fileId = self::extractFileId($storedValue);
        if ($fileId === null) {
            return false;
        }

        try {
            $token = $this->tokenProvider->getAccessToken();
            $response = Http::withToken($token)
                ->connectTimeout(5)
                ->timeout($this->timeoutSeconds())
                ->delete(self::FILES_URL.'/'.rawurlencode($fileId));

            if ($response->status() === 401) {
                $this->tokenProvider->forgetToken();
                $token = $this->tokenProvider->getAccessToken(true);
                $response = Http::withToken($token)
                    ->connectTimeout(5)
                    ->timeout($this->timeoutSeconds())
                    ->delete(self::FILES_URL.'/'.rawurlencode($fileId));
            }

            if ($response->successful() || $response->status() === 404) {
                return true;
            }

            Log::warning('Google Drive delete failed.', [
                'file_id' => $fileId,
                'status' => $response->status(),
                'reason' => $this->extractGoogleReason($response),
            ]);

            return false;
        } catch (\Throwable $e) {
            Log::warning('Google Drive delete error.', [
                'file_id' => $fileId,
                'reason' => $e->getMessage(),
            ]);

            return false;
        }
    }

    public function exists(string $storedValue): bool
    {
        $fileId = self::extractFileId($storedValue);
        if ($fileId === null) {
            return false;
        }

        try {
            $token = $this->tokenProvider->getAccessToken();
            $response = Http::withToken($token)
                ->connectTimeout(5)
                ->timeout($this->timeoutSeconds())
                ->get(self::FILES_URL.'/'.rawurlencode($fileId), [
                    'fields' => 'id,trashed',
                ]);

            if (! $response->successful()) {
                return false;
            }

            return ! (bool) $response->json('trashed', false);
        } catch (\Throwable) {
            return false;
        }
    }

    public function url(string $storedValue): ?string
    {
        $fileId = self::extractFileId($storedValue);
        if ($fileId === null) {
            return null;
        }

        $appUrl = rtrim((string) config('app.url', 'http://localhost:8000'), '/');

        return $appUrl.'/api/media/images/'.$fileId;
    }

    public function readStream(string $storedValue): array
    {
        $fileId = self::extractFileId($storedValue);
        if ($fileId === null) {
            throw ImageStorageUnavailableException::temporarilyUnavailable();
        }

        $response = $this->sendWithRetry(function (string $token) use ($fileId): Response {
            return Http::withToken($token)
                ->connectTimeout(5)
                ->timeout($this->timeoutSeconds())
                ->get(self::FILES_URL.'/'.rawurlencode($fileId).'?alt=media');
        }, 'download');

        $body = $response->body();
        $stream = fopen('php://temp', 'w+b');
        if ($stream === false) {
            throw ImageStorageUnavailableException::temporarilyUnavailable();
        }

        fwrite($stream, $body);
        rewind($stream);

        $mime = strtolower(trim(explode(';', (string) $response->header('Content-Type'))[0]));
        if ($mime === '' || $mime === 'application/octet-stream') {
            $mime = 'image/jpeg';
        }

        return [
            'stream' => $stream,
            'mime' => $mime,
            'size' => strlen($body),
        ];
    }

    public static function isDriveValue(?string $storedValue): bool
    {
        return $storedValue !== null && str_starts_with(trim($storedValue), self::PREFIX);
    }

    public static function extractFileId(?string $storedValue): ?string
    {
        if ($storedValue === null) {
            return null;
        }

        $trimmed = trim($storedValue);
        if (! str_starts_with($trimmed, self::PREFIX)) {
            return null;
        }

        $id = substr($trimmed, strlen(self::PREFIX));
        if ($id === '' || preg_match('/^[A-Za-z0-9_-]{4,128}$/', $id) !== 1) {
            return null;
        }

        return $id;
    }

    /**
     * @param  callable(string): Response  $sender
     */
    private function sendWithRetry(callable $sender, string $operation): Response
    {
        $hasRefreshed = false;
        $forceRefresh = false;
        $rateLimitAttempts = 0;
        $serverErrorAttempts = 0;

        while (true) {
            $token = $this->tokenProvider->getAccessToken($forceRefresh);
            $forceRefresh = false;

            try {
                $response = $sender($token);
            } catch (ConnectionException $e) {
                $serverErrorAttempts++;
                if ($serverErrorAttempts <= 1) {
                    $this->backoff($serverErrorAttempts);

                    continue;
                }
                Log::warning("Google Drive {$operation} connection error.", ['error' => $e->getMessage()]);
                throw ImageStorageUnavailableException::temporarilyUnavailable($e);
            }

            if ($response->successful()) {
                return $response;
            }

            $status = $response->status();
            $reason = $this->extractGoogleReason($response);

            if ($status === 401 && ! $hasRefreshed) {
                $this->tokenProvider->forgetToken();
                $hasRefreshed = true;
                $forceRefresh = true;

                continue;
            }

            if ($status === 403 && $reason === 'storageQuotaExceeded') {
                Log::critical('Google Drive storage quota exceeded.', [
                    'operation' => $operation,
                    'status' => $status,
                    'reason' => $reason,
                ]);
                throw ImageStorageUnavailableException::quotaExceeded();
            }

            if ($status === 429 || ($status === 403 && in_array($reason, ['rateLimitExceeded', 'userRateLimitExceeded'], true))) {
                $rateLimitAttempts++;
                if ($rateLimitAttempts <= 2) {
                    $this->backoff($rateLimitAttempts);

                    continue;
                }
                Log::warning("Google Drive {$operation} rate limited.", ['status' => $status, 'reason' => $reason]);
                throw ImageStorageUnavailableException::temporarilyUnavailable();
            }

            if ($status >= 500) {
                $serverErrorAttempts++;
                if ($serverErrorAttempts <= 1) {
                    $this->backoff($serverErrorAttempts);

                    continue;
                }
                Log::warning("Google Drive {$operation} server error.", ['status' => $status, 'reason' => $reason]);
                throw ImageStorageUnavailableException::temporarilyUnavailable();
            }

            Log::warning("Google Drive {$operation} unexpected error.", ['status' => $status, 'reason' => $reason]);
            throw ImageStorageUnavailableException::temporarilyUnavailable();
        }
    }

    private function extractGoogleReason(Response $response): string
    {
        $errors = $response->json('error.errors');
        if (is_array($errors) && isset($errors[0]['reason'])) {
            return (string) $errors[0]['reason'];
        }

        $status = $response->json('error.status');

        return is_string($status) ? $status : 'unknown';
    }

    private function backoff(int $attempt): void
    {
        if ($this->retryBaseDelayMs <= 0) {
            return;
        }

        $delayMs = ($this->retryBaseDelayMs * (2 ** ($attempt - 1))) + random_int(0, 50);
        usleep($delayMs * 1000);
    }

    private function timeoutSeconds(): int
    {
        return max(5, (int) config('salo.uploads.google_drive.timeout_seconds', 20));
    }

    /**
     * @param  array<string, string>  $meta
     */
    private function buildDriveFilename(string $name, string $directory, array $meta): string
    {
        if (preg_match('#^restaurants/(\d+)(?:/(menu))?$#', trim($directory, '/'), $m) === 1) {
            $restaurantId = $m[1];
            $kind = $meta['field'] ?? ($m[2] ?? 'image');
            $kindSlug = match ($kind) {
                'logo_image' => 'logo',
                'cover_image' => 'cover',
                'menu', 'photo' => 'menu',
                default => str_starts_with((string) $kind, 'menu') ? 'menu' : 'image',
            };

            return "r{$restaurantId}-{$kindSlug}-{$name}";
        }

        return $name;
    }

    /**
     * @param  array<string, string>  $meta
     * @return array<string, string>
     */
    private function sanitizeMeta(array $meta): array
    {
        $out = ['salo_kind' => 'public_image'];
        foreach ($meta as $k => $v) {
            $key = preg_replace('/[^a-zA-Z0-9_]/', '_', (string) $k);
            if ($key !== '' && $v !== '') {
                $out[$key] = mb_substr((string) $v, 0, 100);
            }
        }

        return $out;
    }
}
