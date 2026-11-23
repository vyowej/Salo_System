<?php

namespace Tests\Feature;

use App\Support\Storage\DriveClientInterface;
use App\Support\Storage\DriveFolderResolver;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\Support\FakeDriveClient;
use Tests\TestCase;

class DriveReorganizePublicCommandTest extends TestCase
{
    use DatabaseTransactions;

    private FakeDriveClient $fakeDrive;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('local');

        $this->fakeDrive = new FakeDriveClient('flat_root_id');
        $this->app->instance(DriveClientInterface::class, $this->fakeDrive);
        $this->app->singleton(DriveFolderResolver::class, fn () => new DriveFolderResolver($this->fakeDrive));

        config([
            'salo.uploads.google_drive.public_folder_id' => 'flat_root_id',
            'salo.uploads.google_drive.proxy_cache' => false,
        ]);
    }

    public function test_dry_run_does_not_modify_drive_and_live_run_moves_and_tags_without_db_change(): void
    {
        $provinceId = (int) (DB::table('provinces')->value('province_id')
            ?: DB::table('provinces')->insertGetId(['province_name' => 'Metro Manila']));
        $cityId = (int) (DB::table('cities')->where('province_id', $provinceId)->value('city_id')
            ?: DB::table('cities')->insertGetId(['province_id' => $provinceId, 'city_name' => 'Makati']));
        $barangayId = (int) (DB::table('barangays')->where('city_id', $cityId)->value('barangay_id')
            ?: DB::table('barangays')->insertGetId(['city_id' => $cityId, 'barangay_name' => 'Poblacion']));
        $addressId = (int) DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '456 Ayala Ave',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Legacy Flat Kitchen',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234567',
            'business_email' => 'legacy_'.uniqid().'@example.com',
            'address_id' => $addressId,
            'logo_image' => 'gdrive:legacy_logo_12345',
            'restaurant_status' => 'active',
        ]);
        DB::table('restaurants')->where('restaurant_id', $restaurantId)->update(['brand_restaurant_id' => $restaurantId]);

        $catId = (int) DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $restaurantId,
            'category_name' => 'Mains',
            'is_active' => 1,
        ]);
        $itemId = (int) DB::table('menu_items')->insertGetId([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'item_name' => 'Sisig',
            'photo_image' => 'gdrive:legacy_dish_12345',
            'base_price' => '180.00',
            'availability_status' => 'available',
            'approval_status' => 'approved',
        ]);

        // Seed untagged flat-folder files
        $this->fakeDrive->nodes['legacy_logo_12345'] = [
            'id' => 'legacy_logo_12345',
            'name' => 'r1-logo.png',
            'mimeType' => 'image/png',
            'parents' => ['flat_root_id'],
            'appProperties' => [],
            'trashed' => false,
            'content' => 'logo-bytes',
            'permissions' => [['id' => 'owner', 'type' => 'user', 'role' => 'owner']],
        ];
        $this->fakeDrive->nodes['legacy_dish_12345'] = [
            'id' => 'legacy_dish_12345',
            'name' => 'r1-dish.jpg',
            'mimeType' => 'image/jpeg',
            'parents' => ['flat_root_id'],
            'appProperties' => [],
            'trashed' => false,
            'content' => 'dish-bytes',
            'permissions' => [['id' => 'owner', 'type' => 'user', 'role' => 'owner']],
        ];

        // 1. Before Step 3: untagged file is refused by public proxy
        $this->get('/api/media/images/legacy_logo_12345')->assertStatus(404);

        // 2. Dry run makes zero Drive moves/folders
        $this->artisan('salo:drive:reorganize-public', ['--dry-run' => true])
            ->assertExitCode(0);
        $this->assertCount(0, $this->fakeDrive->moveCalls);
        $this->assertSame(['flat_root_id'], $this->fakeDrive->nodes['legacy_logo_12345']['parents']);

        // 3. Live run moves & tags visibility=public without touching DB columns
        $this->artisan('salo:drive:reorganize-public', ['--force' => true])
            ->assertExitCode(0);

        $this->assertSame('gdrive:legacy_logo_12345', DB::table('restaurants')->where('restaurant_id', $restaurantId)->value('logo_image'));
        $this->assertSame('gdrive:legacy_dish_12345', DB::table('menu_items')->where('menu_item_id', $itemId)->value('photo_image'));

        $this->assertSame('public', $this->fakeDrive->nodes['legacy_logo_12345']['appProperties']['visibility']);
        $this->assertSame('public', $this->fakeDrive->nodes['legacy_dish_12345']['appProperties']['visibility']);
        $this->assertNotSame(['flat_root_id'], $this->fakeDrive->nodes['legacy_logo_12345']['parents']);
        $this->assertNotSame(['flat_root_id'], $this->fakeDrive->nodes['legacy_dish_12345']['parents']);

        // 4. After Step 3: public proxy now serves the tagged image
        $this->get('/api/media/images/legacy_logo_12345')->assertOk();

        // 5. Idempotent second run
        $moveCountAfterFirst = count($this->fakeDrive->moveCalls);
        $this->artisan('salo:drive:reorganize-public', ['--force' => true])
            ->assertExitCode(0);
        $this->assertCount($moveCountAfterFirst, $this->fakeDrive->moveCalls);
    }
}
