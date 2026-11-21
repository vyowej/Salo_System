<?php

namespace Tests\Feature;

use App\Features\Admin\Services\AdminManagementService;
use App\Models\User;
use App\Support\FileStorageService;
use App\Support\Storage\PublicImageStore;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\Support\FakePublicImageStore;
use Tests\TestCase;

class PublicImageProxyTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Storage::fake('public');
    }

    private function createRestaurantRow(?string $logo, ?string $cover): int
    {
        $cityId = (int) DB::table('cities')->value('city_id');
        if ($cityId === 0) {
            $provinceId = (int) DB::table('provinces')->insertGetId(['province_name' => 'Metro Manila']);
            $cityId = (int) DB::table('cities')->insertGetId(['province_id' => $provinceId, 'city_name' => 'Quezon City']);
        }
        $barangayId = (int) DB::table('barangays')->where('city_id', $cityId)->value('barangay_id');
        if ($barangayId === 0) {
            $barangayId = (int) DB::table('barangays')->insertGetId(['city_id' => $cityId, 'barangay_name' => 'Diliman']);
        }
        $addressId = (int) DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '99 Proxy St',
        ]);

        return (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Proxy Test Resto',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171112222',
            'business_email' => 'proxy@example.com',
            'address_id' => $addressId,
            'logo_image' => $logo,
            'cover_image' => $cover,
            'restaurant_status' => 'active',
        ]);
    }

    public function test_public_url_dispatches_gdrive_local_and_http_urls(): void
    {
        /** @var FileStorageService $service */
        $service = app(FileStorageService::class);
        $appUrl = rtrim((string) config('app.url', 'http://localhost:8000'), '/');

        $this->assertSame(
            $appUrl.'/api/media/images/1AbC_driveFileId99',
            $service->publicUrl('gdrive:1AbC_driveFileId99'),
        );
        $this->assertSame(
            $appUrl.'/storage/restaurants/1/logo.png',
            $service->publicUrl('restaurants/1/logo.png'),
        );
        $this->assertSame(
            'https://example.com/img.png',
            $service->publicUrl('https://example.com/img.png'),
        );
        $this->assertNull($service->publicUrl(null));
    }

    public function test_proxy_returns_404_for_unreferenced_file_id(): void
    {
        $fake = new FakePublicImageStore;
        $fake->files['gdrive:unreferenced_12345'] = [
            'content' => 'fakebytes',
            'mime' => 'image/png',
            'name' => 'a.png',
            'directory' => 'restaurants/1',
            'meta' => [],
        ];
        $this->app->instance(PublicImageStore::class, $fake);

        $this->get('/api/media/images/unreferenced_12345')
            ->assertStatus(404);
    }

    public function test_proxy_streams_referenced_image_caches_to_local_disk_and_supports_etag(): void
    {
        $fake = new FakePublicImageStore;
        $this->app->instance(PublicImageStore::class, $fake);
        $this->app->forgetInstance(FileStorageService::class);

        /** @var FileStorageService $service */
        $service = app(FileStorageService::class);
        $uploaded = UploadedFile::fake()->image('logo.png', 100, 100);
        $stored = $service->storePublicImage($uploaded, 'restaurants/1', 'logo_image');
        $fileId = substr($stored['path'], strlen('gdrive:'));

        $this->createRestaurantRow($stored['path'], null);

        $res = $this->get('/api/media/images/'.$fileId);
        $res->assertOk();
        $res->assertHeader('Content-Type', 'image/png');
        $res->assertHeader('X-Content-Type-Options', 'nosniff');
        $res->assertHeader('Content-Security-Policy', "default-src 'none'");
        $res->assertHeader('ETag', '"gdrive-'.$fileId.'"');
        $this->assertStringContainsString('max-age=31536000', (string) $res->headers->get('Cache-Control'));

        // Verify disk cache was populated
        $this->assertTrue(Storage::disk('local')->exists("drive-cache/{$fileId}.bin"));
        $this->assertTrue(Storage::disk('local')->exists("drive-cache/{$fileId}.json"));

        // Remove from FakePublicImageStore: second request must still succeed from disk cache
        $fake->delete($stored['path']);
        $res2 = $this->get('/api/media/images/'.$fileId);
        $res2->assertOk();
        $res2->assertHeader('Content-Type', 'image/png');

        // ETag conditional request returns 304
        $res3 = $this->withHeaders(['If-None-Match' => '"gdrive-'.$fileId.'"'])
            ->get('/api/media/images/'.$fileId);
        $res3->assertStatus(304);
    }

    public function test_proxy_returns_503_when_drive_unavailable_and_not_cached(): void
    {
        $fake = new FakePublicImageStore;
        $this->app->instance(PublicImageStore::class, $fake);

        $this->createRestaurantRow('gdrive:missing_drive_id_99', null);

        $this->get('/api/media/images/missing_drive_id_99')
            ->assertStatus(503);
    }

    public function test_admin_management_list_restaurants_resolves_image_urls(): void
    {
        $this->createRestaurantRow('gdrive:admin_logo_12345', 'restaurants/2/cover.png');

        /** @var AdminManagementService $adminMgmt */
        $adminMgmt = app(AdminManagementService::class);
        $result = $adminMgmt->listRestaurants(['per_page' => 50]);

        $appUrl = rtrim((string) config('app.url', 'http://localhost:8000'), '/');
        $found = collect($result['items'] ?? $result['data'] ?? [])->first(
            fn ($item) => $item->restaurant_name === 'Proxy Test Resto'
        );

        $this->assertNotNull($found);
        $this->assertSame($appUrl.'/api/media/images/admin_logo_12345', $found->logo_image);
        $this->assertSame($appUrl.'/storage/restaurants/2/cover.png', $found->cover_image);
    }

    public function test_private_documents_never_use_public_image_store(): void
    {
        $fake = new FakePublicImageStore;
        $this->app->instance(PublicImageStore::class, $fake);
        $this->app->forgetInstance(FileStorageService::class);

        /** @var FileStorageService $service */
        $service = app(FileStorageService::class);
        $doc = UploadedFile::fake()->createWithContent('permit.pdf', "%PDF-1.4\n%private\n");
        $storedDoc = $service->storePrivateDocument($doc, 'applications/restaurant/99', 'dti_certificate');

        $this->assertStringStartsWith('applications/restaurant/99/', $storedDoc['path']);
        $this->assertStringNotContainsString('gdrive:', $storedDoc['path']);
        $this->assertCount(0, $fake->putCalls);
        $this->assertTrue(Storage::disk('local')->exists($storedDoc['path']));

        $streamResponse = $service->streamPrivateFile($storedDoc['path'], 'permit.pdf', 'application/pdf');
        $this->assertSame(200, $streamResponse->getStatusCode());
        $this->assertSame('nosniff', $streamResponse->headers->get('X-Content-Type-Options'));
    }
}
