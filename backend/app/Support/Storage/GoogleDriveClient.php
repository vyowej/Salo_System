<?php

namespace App\Support\Storage;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class GoogleDriveClient implements DriveClientInterface
{
    private const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

    private const FILES_URL = 'https://www.googleapis.com/drive/v3/files';

    private const FOLDER_MIME = 'application/vnd.google-apps.folder';

    public function __construct(
        private readonly GoogleDriveTokenProvider $tokenProvider,
        private readonly int $retryBaseDelayMs = 200,
    ) {}

    public function findFolderByAppProperties(string $parentId, array $appProperties): ?string
    {
        $clauses = [
            "'{$this->escapeQuery($parentId)}' in parents",
            "mimeType = '".self::FOLDER_MIME."'",
            'trashed = false',
        ];

        foreach ($this->sanitizeAppProperties($appProperties) as $key => $val) {
            $clauses[] = "appProperties has { key='{$this->escapeQuery($key)}' and value='{$this->escapeQuery($val)}' }";
        }

        $response = $this->sendWithRetry(function (string $token) use ($clauses): Response {
            return Http::withToken($token)
                ->connectTimeout(5)
                ->timeout($this->timeoutSeconds())
                ->get(self::FILES_URL, [
                    'q' => implode(' and ', $clauses),
                    'fields' => 'files(id,name,appProperties)',
                    'pageSize' => 1,
                ]);
        }, 'find_folder');

        $files = $response->json('files');
        if (! is_array($files) || $files === [] || empty($files[0]['id'])) {
            return null;
        }

        return (string) $files[0]['id'];
    }

    public function createFolder(string $parentId, string $name, array $appProperties): string
    {
        $cleanProps = $this->sanitizeAppProperties($appProperties);

        $response = $this->sendWithRetry(function (string $token) use ($parentId, $name, $cleanProps): Response {
            return Http::withToken($token)
                ->connectTimeout(5)
                ->timeout($this->timeoutSeconds())
                ->post(self::FILES_URL.'?fields=id,name,appProperties', array_filter([
                    'name' => $name,
                    'mimeType' => self::FOLDER_MIME,
                    'parents' => [$parentId],
                    'appProperties' => $cleanProps !== [] ? $cleanProps : null,
                ], static fn ($v) => $v !== null));
        }, 'create_folder');

        $folderId = (string) ($response->json('id') ?? '');
        if ($folderId === '') {
            throw ImageStorageUnavailableException::temporarilyUnavailable();
        }

        return $folderId;
    }

    public function renameFile(string $fileId, string $newName): bool
    {
        $response = $this->sendAllowingNotFound(function (string $token) use ($fileId, $newName): Response {
            return Http::withToken($token)
                ->connectTimeout(5)
                ->timeout($this->timeoutSeconds())
                ->patch(self::FILES_URL.'/'.rawurlencode($fileId).'?fields=id,name', [
                    'name' => $newName,
                ]);
        }, 'rename');

        return $response !== null && $response->successful();
    }

    public function putFile(string $localPath, string $mime, string $opaqueName, string $folderId, array $appProperties = []): string
    {
        $bytes = @file_get_contents($localPath);
        if ($bytes === false) {
            throw ImageStorageUnavailableException::temporarilyUnavailable();
        }

        $cleanProps = $this->sanitizeAppProperties($appProperties);
        $metadataJson = json_encode(array_filter([
            'name' => $opaqueName,
            'parents' => [$folderId],
            'appProperties' => $cleanProps !== [] ? $cleanProps : null,
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
                ->post(self::UPLOAD_URL.'?uploadType=multipart&fields=id,mimeType,size,appProperties');
        }, 'upload', allowNotFound: true);

        $fileId = (string) ($response->json('id') ?? '');
        if ($fileId === '') {
            throw ImageStorageUnavailableException::temporarilyUnavailable();
        }

        return GoogleDrivePublicImageStore::PREFIX.$fileId;
    }

    public function copyFile(string $storedValue, string $targetFolderId, string $opaqueName, array $appProperties = []): string
    {
        $fileId = $this->extractId($storedValue);
        $cleanProps = $this->sanitizeAppProperties($appProperties);

        $response = $this->sendWithRetry(function (string $token) use ($fileId, $targetFolderId, $opaqueName, $cleanProps): Response {
            return Http::withToken($token)
                ->connectTimeout(5)
                ->timeout($this->timeoutSeconds())
                ->post(self::FILES_URL.'/'.rawurlencode($fileId).'/copy?fields=id,mimeType,size,appProperties', array_filter([
                    'name' => $opaqueName,
                    'parents' => [$targetFolderId],
                    'appProperties' => $cleanProps !== [] ? $cleanProps : null,
                ], static fn ($v) => $v !== null));
        }, 'copy');

        $newId = (string) ($response->json('id') ?? '');
        if ($newId === '') {
            throw ImageStorageUnavailableException::temporarilyUnavailable();
        }

        return GoogleDrivePublicImageStore::PREFIX.$newId;
    }

    public function moveFile(string $storedValue, string $targetFolderId): bool
    {
        return $this->moveAndTagFile($storedValue, $targetFolderId, []);
    }

    public function moveAndTagFile(string $storedValue, string $targetFolderId, array $appProperties): bool
    {
        $fileId = $this->extractId($storedValue);
        $meta = $this->getFileMetadata($fileId);
        if ($meta === null) {
            return false;
        }

        $currentParents = array_values(array_filter(
            (array) ($meta['parents'] ?? []),
            static fn ($p): bool => is_string($p) && $p !== '' && $p !== $targetFolderId,
        ));

        $query = ['addParents' => $targetFolderId, 'fields' => 'id,parents,appProperties'];
        if ($currentParents !== []) {
            $query['removeParents'] = implode(',', $currentParents);
        }

        $cleanProps = $this->sanitizeAppProperties($appProperties);
        $body = $cleanProps !== [] ? ['appProperties' => $cleanProps] : [];

        $response = $this->sendAllowingNotFound(function (string $token) use ($fileId, $query, $body): Response {
            return Http::withToken($token)
                ->connectTimeout(5)
                ->timeout($this->timeoutSeconds())
                ->patch(self::FILES_URL.'/'.rawurlencode($fileId).'?'.http_build_query($query), $body);
        }, 'move');

        return $response !== null && $response->successful();
    }

    public function trashFile(string $storedValueOrId): bool
    {
        $fileId = $this->extractId($storedValueOrId);
        if ($fileId === '') {
            return false;
        }

        try {
            $response = $this->sendAllowingNotFound(function (string $token) use ($fileId): Response {
                return Http::withToken($token)
                    ->connectTimeout(5)
                    ->timeout($this->timeoutSeconds())
                    ->patch(self::FILES_URL.'/'.rawurlencode($fileId).'?fields=id,trashed', [
                        'trashed' => true,
                    ]);
            }, 'trash');

            return $response === null || $response->successful();
        } catch (\Throwable $e) {
            Log::warning('Google Drive trash error.', [
                'file_id' => $fileId,
                'reason' => $e->getMessage(),
            ]);

            return false;
        }
    }

    public function getFileMetadata(string $storedValueOrId): ?array
    {
        $fileId = $this->extractId($storedValueOrId);
        if ($fileId === '') {
            return null;
        }

        $response = $this->sendAllowingNotFound(function (string $token) use ($fileId): Response {
            return Http::withToken($token)
                ->connectTimeout(5)
                ->timeout($this->timeoutSeconds())
                ->get(self::FILES_URL.'/'.rawurlencode($fileId), [
                    'fields' => 'id,name,mimeType,size,trashed,parents,appProperties',
                ]);
        }, 'metadata');

        if ($response === null || ! $response->successful()) {
            return null;
        }

        $json = $response->json();

        return is_array($json) ? $json : null;
    }

    public function readStream(string $storedValueOrId): array
    {
        $fileId = $this->extractId($storedValueOrId);
        $meta = $this->getFileMetadata($fileId);
        if ($meta === null || (bool) ($meta['trashed'] ?? false)) {
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

        $mime = strtolower(trim(explode(';', (string) ($meta['mimeType'] ?? $response->header('Content-Type')))[0]));
        if ($mime === '' || $mime === 'application/octet-stream') {
            $mime = 'image/jpeg';
        }

        $rawProps = is_array($meta['appProperties'] ?? null) ? $meta['appProperties'] : [];
        $appProperties = [];
        foreach ($rawProps as $k => $v) {
            if (is_string($k) && is_scalar($v)) {
                $appProperties[$k] = (string) $v;
            }
        }

        return [
            'stream' => $stream,
            'mime' => $mime,
            'size' => strlen($body),
            'appProperties' => $appProperties,
        ];
    }

    public function listPermissions(string $storedValueOrId): array
    {
        $fileId = $this->extractId($storedValueOrId);

        $response = $this->sendWithRetry(function (string $token) use ($fileId): Response {
            return Http::withToken($token)
                ->connectTimeout(5)
                ->timeout($this->timeoutSeconds())
                ->get(self::FILES_URL.'/'.rawurlencode($fileId).'/permissions', [
                    'fields' => 'permissions(id,type,role,emailAddress)',
                ]);
        }, 'list_permissions');

        $perms = $response->json('permissions');

        return is_array($perms) ? array_values($perms) : [];
    }

    public function listChildren(string $folderId): array
    {
        $escaped = $this->escapeQuery($this->extractId($folderId));
        $items = [];
        $pageToken = null;

        do {
            $query = array_filter([
                'q' => "'{$escaped}' in parents and trashed = false",
                'fields' => 'nextPageToken,files(id,name,mimeType,size,createdTime,appProperties)',
                'pageSize' => 1000,
                'pageToken' => $pageToken,
            ], static fn ($v) => $v !== null);

            $response = $this->sendWithRetry(function (string $token) use ($query): Response {
                return Http::withToken($token)
                    ->connectTimeout(5)
                    ->timeout($this->timeoutSeconds())
                    ->get(self::FILES_URL, $query);
            }, 'list_children');

            $batch = $response->json('files');
            if (is_array($batch)) {
                foreach ($batch as $item) {
                    if (is_array($item)) {
                        $items[] = $item;
                    }
                }
            }

            $pageToken = $response->json('nextPageToken');
        } while (is_string($pageToken) && $pageToken !== '');

        return $items;
    }

    private function extractId(string $storedValueOrId): string
    {
        $trimmed = trim($storedValueOrId);
        if (str_starts_with($trimmed, GoogleDrivePublicImageStore::PREFIX)) {
            return trim(substr($trimmed, strlen(GoogleDrivePublicImageStore::PREFIX)));
        }

        return $trimmed;
    }

    private function escapeQuery(string $value): string
    {
        return str_replace(["\\", "'"], ["\\\\", "\\'"], $value);
    }

    /**
     * @param  array<string, mixed>  $props
     * @return array<string, string>
     */
    private function sanitizeAppProperties(array $props): array
    {
        $clean = [];
        foreach ($props as $key => $value) {
            if (! is_string($key) || $key === '' || $value === null) {
                continue;
            }
            $clean[substr($key, 0, 100)] = substr((string) $value, 0, 100);
        }

        return $clean;
    }

    /**
     * @param  callable(string): Response  $requestFn
     */
    private function sendAllowingNotFound(callable $requestFn, string $operation): ?Response
    {
        try {
            return $this->sendWithRetry($requestFn, $operation, allowNotFound: true);
        } catch (ImageStorageUnavailableException $e) {
            if ($e->statusCode() === 404) {
                return null;
            }
            throw $e;
        }
    }

    /**
     * @param  callable(string): Response  $requestFn
     */
    private function sendWithRetry(callable $requestFn, string $operation, bool $allowNotFound = false): Response
    {
        $attempt = 0;
        $maxAttempts = 3;

        while (true) {
            $attempt++;
            $token = $this->tokenProvider->getAccessToken();

            try {
                $response = $requestFn($token);
            } catch (ConnectionException $e) {
                if ($attempt < 2) {
                    $this->backoffMs($attempt);

                    continue;
                }
                Log::warning("Google Drive {$operation} connection error.", ['reason' => $e->getMessage()]);
                throw ImageStorageUnavailableException::temporarilyUnavailable();
            }

            if ($response->status() === 401 && $attempt === 1) {
                $this->tokenProvider->forgetToken();
                $token = $this->tokenProvider->getAccessToken(true);
                $response = $requestFn($token);
            }

            if ($allowNotFound && $response->status() === 404) {
                throw new ImageStorageUnavailableException('Not found', 404);
            }

            if ($response->successful()) {
                return $response;
            }

            $status = $response->status();
            $reason = strtolower((string) ($response->json('error.errors.0.reason') ?? ''));

            if ($status === 403 && $reason === 'storagequotaexceeded') {
                Log::critical('Google Drive storage quota exceeded.');
                throw ImageStorageUnavailableException::quotaExceeded();
            }

            $isRateLimited = $status === 429 || ($status === 403 && in_array($reason, ['ratelimitexceeded', 'userratelimitexceeded'], true));
            if ($isRateLimited && $attempt < $maxAttempts) {
                $this->backoffMs($attempt);

                continue;
            }

            if ($status >= 500 && $attempt < 2) {
                $this->backoffMs($attempt);

                continue;
            }

            Log::warning("Google Drive {$operation} failed.", ['status' => $status, 'reason' => $reason !== '' ? $reason : 'unknown']);
            throw ImageStorageUnavailableException::temporarilyUnavailable();
        }
    }

    private function backoffMs(int $attempt): void
    {
        if ($this->retryBaseDelayMs <= 0) {
            return;
        }
        usleep(($this->retryBaseDelayMs * (2 ** ($attempt - 1))) * 1000);
    }

    private function timeoutSeconds(): int
    {
        return max(5, (int) config('salo.uploads.google_drive.timeout_seconds', 20));
    }
}
