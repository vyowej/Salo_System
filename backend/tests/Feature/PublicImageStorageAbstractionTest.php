<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\FileStorageService;
use App\Support\Storage\GoogleDrivePublicImageStore;
use App\Support\Storage\ImageStorageUnavailableException;
use App\Support\Storage\LocalPublicImageStore;
use App\Support\Storage\PublicImageStore;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\Support\FakePublicImageStore;
use Tests\TestCase;

class PublicImageStorageAbstractionTest extends TestCase
{
    use DatabaseTransactions;

    public function test_default_driver_is_local(): void
    {
        $this->assertSame('local', config('salo.uploads.public_image_driver'));
        $this->assertInstanceOf(LocalPublicImageStore::class, app(PublicImageStore::class));
    }

    public function test_google_drive_driver_resolves_when_configured(): void
    {
        config(['salo.uploads.public_image_driver' => 'google_drive']);
        app()->forgetInstance(PublicImageStore::class);

        $this->assertInstanceOf(GoogleDrivePublicImageStore::class, app(PublicImageStore::class));
    }

    public function test_file_storage_service_delegates_public_images_to_bound_store(): void
    {
        $fake = new FakePublicImageStore;
        $this->app->instance(PublicImageStore::class, $fake);
        $this->app->forgetInstance(FileStorageService::class);

        /** @var FileStorageService $service */
        $service = app(FileStorageService::class);

        $file = UploadedFile::fake()->image('logo.png', 150, 150);
        $stored = $service->storePublicImage($file, 'restaurants/10', 'logo_image');

        $this->assertStringStartsWith('gdrive:fake_', $stored['path']);
        $this->assertCount(1, $fake->putCalls);
        $this->assertTrue($fake->exists($stored['path']));

        $this->assertFalse($service->deleteIfUnreferenced('public', $stored['path'], fn () => true));
        $this->assertTrue($fake->exists($stored['path']));

        $this->assertTrue($service->deleteIfUnreferenced('public', $stored['path'], fn () => false));
        $this->assertFalse($fake->exists($stored['path']));
    }

    public function test_owner_media_upload_returns_503_and_leaves_db_unchanged_when_storage_unavailable(): void
    {
        $fake = new FakePublicImageStore;
        $fake->failNextPutWith = ImageStorageUnavailableException::temporarilyUnavailable();
        $this->app->instance(PublicImageStore::class, $fake);
        $this->app->forgetInstance(FileStorageService::class);

        $owner = User::forceCreate([
            'username' => 'drv_owner_'.random_int(10000, 99999),
            'first_name' => 'Drive',
            'last_name' => 'Owner',
            'email' => 'drv_owner_'.random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

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
            'street' => '1 Test St',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Drive Failure Kitchen',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171112222',
            'business_email' => 'kitchen@example.com',
            'address_id' => $addressId,
            'logo_image' => 'restaurants/existing/old.png',
            'restaurant_status' => 'active',
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
        ]);

        $res = $this->actingAs($owner)->post('/api/restaurant/profile/media', [
            'logo_image' => UploadedFile::fake()->image('new_logo.png', 200, 200),
        ], ['Accept' => 'application/json']);

        $res->assertStatus(503)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Image storage is temporarily unavailable. Your changes were not saved. Please try again in a few minutes.');

        $row = DB::table('restaurants')->where('restaurant_id', $restaurantId)->first();
        $this->assertSame('restaurants/existing/old.png', $row->logo_image);
    }
}
