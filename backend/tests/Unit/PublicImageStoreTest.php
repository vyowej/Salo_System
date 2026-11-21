<?php

namespace Tests\Unit;

use App\Support\Storage\GoogleDrivePublicImageStore;
use App\Support\Storage\GoogleDriveTokenProvider;
use App\Support\Storage\ImageStorageUnavailableException;
use App\Support\Storage\LocalPublicImageStore;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PublicImageStoreTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Http::preventStrayRequests();

        config([
            'salo.uploads.google_drive.client_id' => 'test-client-id',
            'salo.uploads.google_drive.client_secret' => 'test-client-secret',
            'salo.uploads.google_drive.refresh_token' => 'test-refresh-token',
            'salo.uploads.google_drive.public_folder_id' => 'folder_123',
            'salo.uploads.google_drive.timeout_seconds' => 10,
        ]);
    }

    public function test_local_store_put_exists_url_and_delete(): void
    {
        Storage::fake('public');
        $store = new LocalPublicImageStore;

        $tmpFile = UploadedFile::fake()->image('logo.png', 100, 100);
        $stored = $store->put($tmpFile->getRealPath(), 'image/png', 'abc.png', 'restaurants/5');

        $this->assertSame('restaurants/5/abc.png', $stored);
        $this->assertTrue($store->exists($stored));
        $this->assertStringEndsWith('/storage/restaurants/5/abc.png', (string) $store->url($stored));
        $this->assertTrue($store->delete($stored));
        $this->assertFalse($store->exists($stored));
    }

    public function test_token_provider_caches_token_and_handles_invalid_grant(): void
    {
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::sequence()
                ->push(['access_token' => 'tok_1', 'expires_in' => 3600], 200)
                ->push(['error' => 'invalid_grant'], 400),
        ]);

        $provider = new GoogleDriveTokenProvider;
        $this->assertSame('tok_1', $provider->getAccessToken());
        // Cached on second call
        $this->assertSame('tok_1', $provider->getAccessToken());
        Http::assertSentCount(1);

        $provider->forgetToken();

        $this->expectException(ImageStorageUnavailableException::class);
        $this->expectExceptionMessage('Image upload is unavailable right now. Please contact SALO support.');
        $provider->getAccessToken();
    }

    public function test_token_provider_handles_connection_exception(): void
    {
        Http::fake([
            'https://oauth2.googleapis.com/token' => fn () => throw new ConnectionException('Network down'),
        ]);

        $provider = new GoogleDriveTokenProvider;

        $this->expectException(ImageStorageUnavailableException::class);
        $this->expectExceptionMessage('Image storage is temporarily unavailable. Your changes were not saved. Please try again in a few minutes.');
        $provider->getAccessToken();
    }

    public function test_drive_store_uploads_and_returns_prefixed_id(): void
    {
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'tok_ok', 'expires_in' => 3600], 200),
            'https://www.googleapis.com/upload/drive/v3/files*' => Http::response([
                'id' => '1AbC_driveFileId99',
                'mimeType' => 'image/png',
                'size' => '1234',
            ], 200),
        ]);

        $store = new GoogleDrivePublicImageStore(new GoogleDriveTokenProvider, retryBaseDelayMs: 0);
        $tmpFile = UploadedFile::fake()->image('logo.png', 100, 100);

        $stored = $store->put(
            localPath: $tmpFile->getRealPath(),
            mime: 'image/png',
            name: 'uuid-1.png',
            directory: 'restaurants/7',
            meta: ['field' => 'logo_image'],
        );

        $this->assertSame('gdrive:1AbC_driveFileId99', $stored);
        $this->assertStringEndsWith('/api/media/images/1AbC_driveFileId99', (string) $store->url($stored));

        Http::assertSent(function ($request) {
            return str_starts_with($request->url(), 'https://www.googleapis.com/upload/drive/v3/files')
                && str_contains($request->body(), 'r7-logo-uuid-1.png')
                && str_contains($request->body(), 'folder_123');
        });
    }

    public function test_drive_store_refreshes_on_401_and_retries_on_429(): void
    {
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::sequence()
                ->push(['access_token' => 'tok_old', 'expires_in' => 3600], 200)
                ->push(['access_token' => 'tok_new', 'expires_in' => 3600], 200),
            'https://www.googleapis.com/upload/drive/v3/files*' => Http::sequence()
                ->push(['error' => ['code' => 401]], 401)
                ->push(['error' => ['errors' => [['reason' => 'rateLimitExceeded']]]], 429)
                ->push(['id' => '1RetriedOk'], 200),
        ]);

        $store = new GoogleDrivePublicImageStore(new GoogleDriveTokenProvider, retryBaseDelayMs: 0);
        $tmpFile = UploadedFile::fake()->image('dish.jpg', 100, 100);

        $stored = $store->put($tmpFile->getRealPath(), 'image/jpeg', 'dish.jpg', 'restaurants/1/menu');
        $this->assertSame('gdrive:1RetriedOk', $stored);
    }

    public function test_drive_store_does_not_retry_quota_exceeded(): void
    {
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'tok_ok', 'expires_in' => 3600], 200),
            'https://www.googleapis.com/upload/drive/v3/files*' => Http::response([
                'error' => ['errors' => [['reason' => 'storageQuotaExceeded']]],
            ], 403),
        ]);

        $store = new GoogleDrivePublicImageStore(new GoogleDriveTokenProvider, retryBaseDelayMs: 0);
        $tmpFile = UploadedFile::fake()->image('dish.jpg', 100, 100);

        try {
            $store->put($tmpFile->getRealPath(), 'image/jpeg', 'dish.jpg', 'restaurants/1/menu');
            $this->fail('Expected ImageStorageUnavailableException');
        } catch (ImageStorageUnavailableException $e) {
            $this->assertSame(503, $e->statusCode());
            $this->assertSame('Image upload is unavailable right now. Please contact SALO support.', $e->getMessage());
        }

        // 1 token request + 1 upload attempt (no retries)
        Http::assertSentCount(2);
    }

    public function test_drive_store_delete_handles_204_404_and_500_safely(): void
    {
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'tok_ok', 'expires_in' => 3600], 200),
            'https://www.googleapis.com/drive/v3/files/*' => Http::sequence()
                ->push('', 204)
                ->push('', 404)
                ->push(['error' => 'server_error'], 500),
        ]);

        $store = new GoogleDrivePublicImageStore(new GoogleDriveTokenProvider, retryBaseDelayMs: 0);

        $this->assertTrue($store->delete('gdrive:file_a_1234'));
        $this->assertTrue($store->delete('gdrive:file_b_1234'));
        $this->assertFalse($store->delete('gdrive:file_c_1234'));
    }
}
