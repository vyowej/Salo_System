<?php

namespace Tests\Feature;

use App\Features\Restaurants\Services\OwnerMenuService;
use App\Features\Restaurants\Services\OwnerProfileService;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\FileStorageService;
use App\Support\RestaurantBranchService;
use App\Support\Storage\DriveClientInterface;
use App\Support\Storage\DriveFolderName;
use App\Support\Storage\DriveFolderResolver;
use App\Support\Storage\ImageStorageUnavailableException;
use App\Support\Storage\StoragePurpose;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Support\FakeDriveClient;
use Tests\TestCase;

class StructuredDriveStorageStep1And2Test extends TestCase
{
    use DatabaseTransactions;

    private FakeDriveClient $fakeDrive;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('local');
        Storage::fake('public');

        $this->fakeDrive = new FakeDriveClient('fake_salo_root');
        $this->app->instance(DriveClientInterface::class, $this->fakeDrive);
        $this->app->singleton(DriveFolderResolver::class, fn () => new DriveFolderResolver($this->fakeDrive));
        $this->app->forgetInstance(FileStorageService::class);

        config([
            'salo.uploads.public_image_driver' => 'google_drive',
            'salo.uploads.private_file_driver' => 'local',
            'salo.uploads.google_drive.public_folder_id' => 'fake_salo_root',
            'salo.uploads.google_drive.proxy_cache' => false,
        ]);
    }

    private function createOwnerAndRestaurant(string $name = 'Café Salo'): array
    {
        $provinceId = (int) (DB::table('provinces')->value('province_id')
            ?: DB::table('provinces')->insertGetId(['province_name' => 'Metro Manila']));
        $cityId = (int) (DB::table('cities')->where('province_id', $provinceId)->value('city_id')
            ?: DB::table('cities')->insertGetId(['province_id' => $provinceId, 'city_name' => 'Makati']));
        $barangayId = (int) (DB::table('barangays')->where('city_id', $cityId)->value('barangay_id')
            ?: DB::table('barangays')->insertGetId(['city_id' => $cityId, 'barangay_name' => 'Poblacion']));
        $addressId = (int) DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '123 Ayala Ave',
        ]);

        $userId = (int) DB::table('users')->insertGetId([
            'username' => 'owner_'.uniqid(),
            'first_name' => 'Maria',
            'last_name' => 'Santos',
            'email' => 'owner_'.uniqid().'@example.com',
            'password_hash' => Hash::make('Secret123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => $name,
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234567',
            'business_email' => 'cafe_'.uniqid().'@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
        ]);

        DB::table('restaurants')->where('restaurant_id', $restaurantId)->update([
            'brand_restaurant_id' => $restaurantId,
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $userId,
            'joined_at' => now(),
        ]);

        $user = User::query()->findOrFail($userId);

        return [$user, $restaurantId, $addressId];
    }

    public function test_folder_name_sanitization_keeps_unicode_and_strips_slashes_and_controls(): void
    {
        $sanitized = DriveFolderName::sanitize("  Kainán / Best\x00\n Grill\\PH  ");
        $this->assertSame('Kainán Best Grill PH', $sanitized);
        $this->assertSame('Café Salo [R-12]', DriveFolderName::restaurantBrand('Café Salo', 12));
    }

    public function test_public_images_are_organized_into_restaurant_logo_cover_and_category_folders_with_opaque_names(): void
    {
        [$owner, $restaurantId] = $this->createOwnerAndRestaurant('Bistro Ni Juan');
        $req = Request::create('/api/test', 'POST');

        /** @var OwnerProfileService $profileService */
        $profileService = app(OwnerProfileService::class);
        $profile = $profileService->updateMedia(
            user: $owner,
            restaurantId: $restaurantId,
            logoFile: UploadedFile::fake()->image('my-logo.png', 200, 200),
            coverFile: UploadedFile::fake()->image('my-cover.jpg', 1200, 600),
            removeLogo: false,
            removeCover: false,
            request: $req,
        );

        $row = DB::table('restaurants')->where('restaurant_id', $restaurantId)->first();
        $this->assertStringStartsWith('gdrive:', (string) $row->logo_image);
        $this->assertStringStartsWith('gdrive:', (string) $row->cover_image);

        $logoId = substr((string) $row->logo_image, strlen('gdrive:'));
        $logoNode = $this->fakeDrive->nodes[$logoId];
        $this->assertMatchesRegularExpression('/^[0-9a-f-]{36}\.png$/', $logoNode['name']);
        $this->assertSame('public', $logoNode['appProperties']['visibility']);

        $logoFolder = $this->fakeDrive->nodes[$logoNode['parents'][0]];
        $this->assertSame('Logo', $logoFolder['name']);
        $this->assertSame('restaurant_logo', $logoFolder['appProperties']['salo_type']);

        $brandFolder = $this->fakeDrive->nodes[$logoFolder['parents'][0]];
        $this->assertSame("Bistro Ni Juan [R-{$restaurantId}]", $brandFolder['name']);
        $this->assertSame("R-{$restaurantId}", $brandFolder['appProperties']['salo_id']);
        $this->assertStringContainsString('/api/media/images/', (string) $profile['logo_image']);
    }

    public function test_category_lifecycle_add_rename_move_item_and_delete_guards(): void
    {
        [$owner, $restaurantId] = $this->createOwnerAndRestaurant('Adobo House');
        $req = Request::create('/api/test', 'POST');

        /** @var OwnerMenuService $menuService */
        $menuService = app(OwnerMenuService::class);
        $catA = $menuService->createCategory($owner, ['category_name' => 'Silog Meals'], $restaurantId, $req);
        $catB = $menuService->createCategory($owner, ['category_name' => 'Beverages'], $restaurantId, $req);

        $catAId = (int) $catA['id'];
        $catBId = (int) $catB['id'];

        // Category creation does not eagerly create a Drive folder (lazy on first item photo upload)
        $this->assertNull($this->fakeDrive->findFolderByAppProperties(
            $this->resolveMenuParentFolderId($restaurantId),
            ['salo_type' => 'menu_category', 'salo_id' => "C-{$catAId}"],
        ));

        // Create item in Cat A with photo -> lazily creates Cat A Drive folder
        $item = $menuService->createItem($owner, [
            'menu_category_id' => $catAId,
            'item_name' => 'Tapsilog',
            'base_price' => 145,
        ], UploadedFile::fake()->image('tapsilog.jpg', 800, 600), $restaurantId, $req);

        $catAFolderId = $this->fakeDrive->findFolderByAppProperties(
            $this->resolveMenuParentFolderId($restaurantId),
            ['salo_type' => 'menu_category', 'salo_id' => "C-{$catAId}"],
        );
        $this->assertNotNull($catAFolderId);
        $this->assertSame('Silog Meals', $this->fakeDrive->nodes[$catAFolderId]['name']);

        $storedPhoto = (string) DB::table('menu_items')->where('menu_item_id', $item['id'])->value('photo_image');
        $photoId = substr($storedPhoto, strlen('gdrive:'));
        $this->assertSame([$catAFolderId], $this->fakeDrive->nodes[$photoId]['parents']);

        // Rename category -> renames same folder, no duplicate
        $menuService->updateCategory($owner, $catAId, ['category_name' => 'All-Day Silog'], $restaurantId, $req);
        $this->assertSame('All-Day Silog', $this->fakeDrive->nodes[$catAFolderId]['name']);

        // Deleting non-empty category is blocked (409)
        try {
            $menuService->deleteCategory($owner, $catAId, $restaurantId, $req);
            $this->fail('Expected ConflictHttpException when deleting non-empty category.');
        } catch (ConflictHttpException) {
            $this->assertFalse($this->fakeDrive->nodes[$catAFolderId]['trashed']);
        }

        // Move item to Cat B -> moves Drive file preserving fileId
        $menuService->updateItem($owner, (int) $item['id'], [
            'menu_category_id' => $catBId,
        ], null, false, $restaurantId, $req);

        $catBFolderId = $this->fakeDrive->findFolderByAppProperties(
            $this->resolveMenuParentFolderId($restaurantId),
            ['salo_type' => 'menu_category', 'salo_id' => "C-{$catBId}"],
        );
        $this->assertSame($storedPhoto, DB::table('menu_items')->where('menu_item_id', $item['id'])->value('photo_image'));
        $this->assertSame([$catBFolderId], $this->fakeDrive->nodes[$photoId]['parents']);

        // Now Cat A is empty -> delete trashes empty folder
        $menuService->deleteCategory($owner, $catAId, $restaurantId, $req);
        $this->assertTrue($this->fakeDrive->nodes[$catAFolderId]['trashed']);
    }

    public function test_branch_menu_copy_creates_separate_drive_file_and_never_shares_file_id(): void
    {
        [$owner, $rootId, $addressId] = $this->createOwnerAndRestaurant('Manila Grill');
        $req = Request::create('/api/test', 'POST');

        /** @var OwnerMenuService $menuService */
        $menuService = app(OwnerMenuService::class);
        $cat = $menuService->createCategory($owner, ['category_name' => 'Mains'], $rootId, $req);
        $item = $menuService->createItem($owner, [
            'menu_category_id' => $cat['id'],
            'item_name' => 'Pork BBQ',
            'base_price' => 199,
        ], UploadedFile::fake()->image('bbq.jpg', 600, 600), $rootId, $req);

        $sourcePhoto = (string) DB::table('menu_items')->where('menu_item_id', $item['id'])->value('photo_image');

        $childId = (int) DB::table('restaurants')->insertGetId([
            'parent_restaurant_id' => $rootId,
            'brand_restaurant_id' => $rootId,
            'restaurant_name' => 'Manila Grill',
            'branch_name' => 'BGC',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234568',
            'business_email' => 'bgc_'.uniqid().'@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
        ]);

        app(RestaurantBranchService::class)->cloneMenuAsUnpublishedApproved($rootId, $childId, now());

        $childPhoto = (string) DB::table('menu_items')->where('restaurant_id', $childId)->value('photo_image');
        $this->assertStringStartsWith('gdrive:', $childPhoto);
        $this->assertNotSame($sourcePhoto, $childPhoto);
        $this->assertCount(1, $this->fakeDrive->copyCalls);

        // Deleting child item trashes child's copy, NOT source's file
        $childItemId = (int) DB::table('menu_items')->where('restaurant_id', $childId)->value('menu_item_id');
        DB::table('menu_items')->where('menu_item_id', $childItemId)->delete();
        app(FileStorageService::class)->deleteIfUnreferenced('public', $childPhoto, fn ($p) => app(FileStorageService::class)->isPublicAssetReferenced($p));

        $sourceId = substr($sourcePhoto, strlen('gdrive:'));
        $childFileId = substr($childPhoto, strlen('gdrive:'));
        $this->assertFalse($this->fakeDrive->nodes[$sourceId]['trashed']);
        $this->assertTrue($this->fakeDrive->nodes[$childFileId]['trashed']);
    }

    public function test_public_and_private_routes_fail_closed_on_visibility_tag(): void
    {
        [, $restaurantId] = $this->createOwnerAndRestaurant('Visibility Kitchen');

        // Private file referenced in restaurants.logo_image must be refused (404) by public proxy
        $this->fakeDrive->nodes['priv_file_12345'] = [
            'id' => 'priv_file_12345',
            'name' => 'secret.jpg',
            'mimeType' => 'image/jpeg',
            'parents' => ['fake_salo_root'],
            'appProperties' => ['visibility' => 'private'],
            'trashed' => false,
            'content' => 'secret-bytes',
            'permissions' => [['id' => 'owner', 'type' => 'user', 'role' => 'owner']],
        ];
        // Untagged file (no visibility tag) must also be refused (404)
        $this->fakeDrive->nodes['untagged_12345'] = [
            'id' => 'untagged_12345',
            'name' => 'legacy.jpg',
            'mimeType' => 'image/jpeg',
            'parents' => ['fake_salo_root'],
            'appProperties' => [],
            'trashed' => false,
            'content' => 'legacy-bytes',
            'permissions' => [['id' => 'owner', 'type' => 'user', 'role' => 'owner']],
        ];
        // Public file must be refused by private streamer
        $this->fakeDrive->nodes['pub_file_12345'] = [
            'id' => 'pub_file_12345',
            'name' => 'logo.jpg',
            'mimeType' => 'image/jpeg',
            'parents' => ['fake_salo_root'],
            'appProperties' => ['visibility' => 'public'],
            'trashed' => false,
            'content' => 'public-bytes',
            'permissions' => [['id' => 'owner', 'type' => 'user', 'role' => 'owner']],
        ];

        DB::table('restaurants')->where('restaurant_id', $restaurantId)->update([
            'logo_image' => 'gdrive:priv_file_12345',
            'cover_image' => 'gdrive:untagged_12345',
        ]);

        $this->get('/api/media/images/priv_file_12345')->assertStatus(404);
        $this->get('/api/media/images/untagged_12345')->assertStatus(404);

        /** @var FileStorageService $storage */
        $storage = app(FileStorageService::class);
        try {
            $storage->streamPrivateStoredFile('gdrive:pub_file_12345', 'logo.jpg', 'image/jpeg');
            $this->fail('Expected 404 when streaming public file through private streamer.');
        } catch (HttpException $e) {
            $this->assertSame(404, $e->getStatusCode());
        }

        try {
            $storage->streamPrivateStoredFile('gdrive:untagged_12345', 'legacy.jpg', 'image/jpeg');
            $this->fail('Expected 404 when streaming untagged file through private streamer.');
        } catch (HttpException $e) {
            $this->assertSame(404, $e->getStatusCode());
        }
    }

    public function test_drive_failure_does_not_leave_orphan_db_rows_and_recovers_from_stale_folder_cache(): void
    {
        [$owner, $restaurantId] = $this->createOwnerAndRestaurant('Resilient Kitchen');
        $req = Request::create('/api/test', 'POST');

        // 1. Stale cached folder 404 recovery
        /** @var FileStorageService $storage */
        $storage = app(FileStorageService::class);
        $logoFolderId = $storage->folders()->resolveFolderForPurpose(StoragePurpose::RESTAURANT_LOGO, [
            'brand_restaurant_id' => $restaurantId,
            'restaurant_name' => 'Resilient Kitchen',
        ]);
        // Simulate folder trashed externally while cached
        $this->fakeDrive->nodes[$logoFolderId]['trashed'] = true;

        $stored = $storage->storePublicImageForPurpose(
            file: UploadedFile::fake()->image('logo.png', 120, 120),
            purpose: StoragePurpose::RESTAURANT_LOGO,
            ownerContext: ['brand_restaurant_id' => $restaurantId, 'restaurant_name' => 'Resilient Kitchen'],
            localDirectory: "restaurants/{$restaurantId}",
            fieldName: 'logo_image',
        );
        $this->assertStringStartsWith('gdrive:', $stored['path']);

        // 2. Drive outage during menu item create leaves no DB row
        $cat = app(OwnerMenuService::class)->createCategory($owner, ['category_name' => 'Drinks'], $restaurantId, $req);
        $this->fakeDrive->failNextPutWith = ImageStorageUnavailableException::temporarilyUnavailable();

        try {
            app(OwnerMenuService::class)->createItem($owner, [
                'menu_category_id' => $cat['id'],
                'item_name' => 'Iced Tea',
                'base_price' => 55,
            ], UploadedFile::fake()->image('tea.png', 100, 100), $restaurantId, $req);
            $this->fail('Expected ImageStorageUnavailableException');
        } catch (ImageStorageUnavailableException $e) {
            $this->assertSame(503, $e->statusCode());
            $this->assertSame(0, DB::table('menu_items')->where('restaurant_id', $restaurantId)->count());
        }
    }

    public function test_private_file_audit_logging_dedupes_allowed_and_denied_within_10_minutes(): void
    {
        [$owner] = $this->createOwnerAndRestaurant('Audit Kitchen');
        $req = Request::create('/api/applications/documents/99/file', 'GET');

        /** @var AuditLogService $audit */
        $audit = app(AuditLogService::class);
        $audit->recordPrivateFileAccess((int) $owner->user_id, 'application_documents', 99, true, $req);
        $audit->recordPrivateFileAccess((int) $owner->user_id, 'application_documents', 99, true, $req);

        $audit->recordPrivateFileAccess((int) $owner->user_id, 'application_documents', 99, false, $req);
        $audit->recordPrivateFileAccess((int) $owner->user_id, 'application_documents', 99, false, $req);

        $this->assertSame(1, DB::table('audit_logs')
            ->where('actor_user_id', $owner->user_id)
            ->where('action', 'private_file_viewed')
            ->where('entity_type', 'application_documents')
            ->where('entity_id', '99')
            ->count());

        $this->assertSame(1, DB::table('audit_logs')
            ->where('actor_user_id', $owner->user_id)
            ->where('action', 'private_file_access_denied')
            ->where('entity_type', 'application_documents')
            ->where('entity_id', '99')
            ->count());
    }

    private function resolveMenuParentFolderId(int $restaurantId): string
    {
        $restaurantsRoot = $this->fakeDrive->findFolderByAppProperties('fake_salo_root', ['salo_type' => 'root_restaurants', 'salo_id' => 'root']);
        $brandFolder = $this->fakeDrive->findFolderByAppProperties((string) $restaurantsRoot, ['salo_type' => 'restaurant_brand', 'salo_id' => "R-{$restaurantId}"]);

        return (string) $this->fakeDrive->findFolderByAppProperties((string) $brandFolder, ['salo_type' => 'restaurant_menu', 'salo_id' => "R-{$restaurantId}"]);
    }
}
