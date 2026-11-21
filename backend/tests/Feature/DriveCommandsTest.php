<?php

namespace Tests\Feature;

use App\Support\Storage\PublicImageStore;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\Support\FakePublicImageStore;
use Tests\TestCase;

class DriveCommandsTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('local');
        Storage::fake('public');
        Http::preventStrayRequests();

        config([
            'salo.uploads.google_drive.client_id' => 'test-client-id',
            'salo.uploads.google_drive.client_secret' => 'test-client-secret',
            'salo.uploads.google_drive.refresh_token' => 'test-refresh-token',
            'salo.uploads.google_drive.public_folder_id' => 'folder_123',
        ]);
    }

    private function createRestaurant(?string $logo, ?string $cover): int
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
            'street' => '55 Command St',
        ]);

        return (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Command Test Kitchen',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171112222',
            'business_email' => 'cmd@example.com',
            'address_id' => $addressId,
            'logo_image' => $logo,
            'cover_image' => $cover,
            'restaurant_status' => 'active',
        ]);
    }

    public function test_init_folder_creates_folder_and_prints_id(): void
    {
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'tok_ok', 'expires_in' => 3600], 200),
            'https://www.googleapis.com/drive/v3/files*' => Http::response([
                'id' => 'new_folder_987',
                'name' => 'SALO Public Images',
            ], 200),
        ]);

        $this->artisan('salo:drive:init-folder')
            ->expectsOutputToContain('GOOGLE_DRIVE_PUBLIC_FOLDER_ID=new_folder_987')
            ->assertExitCode(0);
    }

    public function test_orphans_command_lists_only_unreferenced_drive_files(): void
    {
        $this->createRestaurant('gdrive:referenced_id_1', null);

        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'tok_ok', 'expires_in' => 3600], 200),
            'https://www.googleapis.com/drive/v3/files*' => Http::response([
                'files' => [
                    ['id' => 'referenced_id_1', 'name' => 'r1-logo.png', 'mimeType' => 'image/png', 'size' => '100', 'createdTime' => '2026-11-21T00:00:00Z'],
                    ['id' => 'orphan_id_999', 'name' => 'r1-old.png', 'mimeType' => 'image/png', 'size' => '200', 'createdTime' => '2026-11-21T00:00:00Z'],
                ],
            ], 200),
        ]);

        $this->artisan('salo:drive:orphans')
            ->expectsOutputToContain('Orphans: 1')
            ->expectsOutputToContain('orphan_id_999')
            ->assertExitCode(0);
    }

    public function test_migrate_command_refuses_when_driver_is_local(): void
    {
        config(['salo.uploads.public_image_driver' => 'local']);

        $this->artisan('salo:images:migrate-to-drive --dry-run')
            ->expectsOutputToContain('PUBLIC_IMAGE_STORAGE must be set to "google_drive"')
            ->assertExitCode(1);
    }

    public function test_migrate_command_dry_run_and_live_run_are_idempotent_and_keep_local_files(): void
    {
        config(['salo.uploads.public_image_driver' => 'google_drive']);

        $fake = new FakePublicImageStore;
        $this->app->instance(PublicImageStore::class, $fake);

        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'tok_ok', 'expires_in' => 3600], 200),
        ]);

        $img1 = UploadedFile::fake()->image('logo.png', 100, 100);
        $img2 = UploadedFile::fake()->image('dish.jpg', 100, 100);
        Storage::disk('public')->put('restaurants/1/logo.png', file_get_contents($img1->getRealPath()));
        Storage::disk('public')->put('restaurants/1/menu/dish.jpg', file_get_contents($img2->getRealPath()));

        $restaurantId = $this->createRestaurant('/storage/restaurants/1/logo.png', 'gdrive:already_on_drive_1');
        $catId = (int) DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $restaurantId,
            'category_name' => 'Mains',
            'sort_order' => 1,
            'is_active' => 1,
        ]);
        $itemId = (int) DB::table('menu_items')->insertGetId([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'item_name' => 'Adobo',
            'photo_image' => 'restaurants/1/menu/dish.jpg',
            'base_price' => '150.00',
            'availability_status' => 'available',
            'approval_status' => 'approved',
        ]);

        // 1. Dry run: no uploads, no DB updates
        $this->artisan('salo:images:migrate-to-drive --dry-run')
            ->expectsOutputToContain('Target database: salo_test')
            ->expectsOutputToContain('DRY RUN')
            ->assertExitCode(0);

        $this->assertCount(0, $fake->putCalls);
        $this->assertSame('/storage/restaurants/1/logo.png', DB::table('restaurants')->where('restaurant_id', $restaurantId)->value('logo_image'));

        // 2. Live run with --force
        $this->artisan('salo:images:migrate-to-drive --force')
            ->expectsOutputToContain('Target database: salo_test')
            ->assertExitCode(0);

        $this->assertCount(2, $fake->putCalls);
        $newLogo = (string) DB::table('restaurants')->where('restaurant_id', $restaurantId)->value('logo_image');
        $cover = (string) DB::table('restaurants')->where('restaurant_id', $restaurantId)->value('cover_image');
        $newPhoto = (string) DB::table('menu_items')->where('menu_item_id', $itemId)->value('photo_image');

        $this->assertStringStartsWith('gdrive:fake_', $newLogo);
        $this->assertSame('gdrive:already_on_drive_1', $cover);
        $this->assertStringStartsWith('gdrive:fake_', $newPhoto);

        // Local files must NEVER be deleted
        $this->assertTrue(Storage::disk('public')->exists('restaurants/1/logo.png'));
        $this->assertTrue(Storage::disk('public')->exists('restaurants/1/menu/dish.jpg'));

        // Report file created on private disk
        $reports = Storage::disk('local')->files('reports');
        $this->assertNotEmpty($reports);

        // 3. Re-run is idempotent
        $this->artisan('salo:images:migrate-to-drive --force')
            ->assertExitCode(0);
        $this->assertCount(2, $fake->putCalls);
    }
}
