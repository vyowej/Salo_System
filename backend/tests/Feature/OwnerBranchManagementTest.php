<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\AddressService;
use App\Support\RestaurantBranchService;
use App\Support\Storage\GoogleDrivePublicImageStore;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class OwnerBranchManagementTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $prefix = 'br', string $role = 'customer'): User
    {
        return User::create([
            'username' => $prefix.'_'.random_int(10000, 99999),
            'first_name' => ucfirst($prefix),
            'last_name' => 'Tester',
            'email' => $prefix.'_'.random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createAddress(string $barangay = 'Diliman', string $street = '101 Katipunan Ave'): int
    {
        return app(AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => $barangay,
            'street' => $street,
            'latitude' => 14.650000,
            'longitude' => 121.050000,
        ]);
    }

    private function createActiveRoot(User $owner, ?string $branchName = 'Main Branch', string $status = 'active'): int
    {
        $now = now();
        $addressId = $this->createAddress('Diliman', '1 Root Ave');
        $rootId = app(RestaurantBranchService::class)->createRootRestaurant([
            'restaurant_name' => 'Salo Branches Bistro',
            'registered_name' => 'Salo Branches Bistro Inc',
            'branch_name' => $branchName,
            'business_type' => 'restaurant',
            'ownership_structure' => 'corporation',
            'description' => 'Fresh Filipino dishes.',
            'contact_phone' => '09171001111',
            'business_email' => 'root_'.random_int(100, 999).'@example.com',
            'address_id' => $addressId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepts_reservations' => 1,
            'accepting_orders' => 1,
            'is_published' => 1,
            'restaurant_status' => $status,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $rootId,
            'user_id' => $owner->user_id,
            'joined_at' => $now,
        ]);

        // Add operating hours, category, menu item + add-on, service area, and payout account to root.
        for ($d = 0; $d <= 6; $d++) {
            DB::table('operating_hours')->insert([
                'restaurant_id' => $rootId,
                'day_of_week' => $d,
                'opening_time' => '09:00:00',
                'closing_time' => '21:00:00',
                'closes_next_day' => 0,
                'is_closed' => 0,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $catId = (int) DB::table('restaurant_categories')->insertGetId([
            'category_name' => 'Branch Test Cuisine '.random_int(100, 999),
            'is_active' => 1,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        DB::table('restaurant_category_map')->insert([
            'restaurant_id' => $rootId,
            'category_id' => $catId,
        ]);

        $menuCatId = (int) DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $rootId,
            'category_name' => 'Signatures',
            'sort_order' => 1,
            'is_active' => 1,
            'draft_state' => 'clean',
            'is_published' => 1,
            'published_category_name' => 'Signatures',
            'published_sort_order' => 1,
            'published_is_active' => 1,
        ]);

        $menuItemId = (int) DB::table('menu_items')->insertGetId([
            'restaurant_id' => $rootId,
            'menu_category_id' => $menuCatId,
            'item_name' => 'Sisig Platter',
            'base_price' => '220.00',
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'sort_order' => 1,
            'draft_state' => 'clean',
            'is_published' => 1,
            'published_menu_category_id' => $menuCatId,
            'published_item_name' => 'Sisig Platter',
            'published_base_price' => '220.00',
            'published_sort_order' => 1,
        ]);

        $groupId = (int) DB::table('add_on_groups')->insertGetId([
            'menu_item_id' => $menuItemId,
            'group_name' => 'Spice Level',
            'is_required' => 0,
            'minimum_selections' => 0,
            'maximum_selections' => 1,
            'sort_order' => 1,
        ]);
        DB::table('add_on_options')->insert([
            'add_on_group_id' => $groupId,
            'option_name' => 'Extra Chili',
            'additional_price' => '15.00',
            'is_available' => 1,
            'sort_order' => 1,
        ]);

        $cityId = DB::table('addresses as a')
            ->join('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->where('a.address_id', $addressId)
            ->value('b.city_id');
        DB::table('service_areas')->insert([
            'restaurant_id' => $rootId,
            'city_id' => (int) $cityId,
            'barangay_id' => null,
            'created_at' => $now,
        ]);

        DB::table('payout_accounts')->insert([
            'restaurant_id' => $rootId,
            'provider' => 'BPI',
            'account_type' => 'savings',
            'account_holder_name' => 'Owner Name',
            'account_number_encrypted' => 'enc_dummy',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return $rootId;
    }

    public function test_list_branches_scopes_by_owner_staff_and_outsider(): void
    {
        $owner = $this->createUser('lstown');
        $staff = $this->createUser('lststf');
        $outsider = $this->createUser('lstout');
        $customer = $this->createUser('lstcust');

        $rootId = $this->createActiveRoot($owner, 'Main Branch');
        $branchBId = app(RestaurantBranchService::class)->createChildBranch($rootId, [
            'restaurant_name' => 'Salo Branches Bistro',
            'branch_name' => 'BGC Branch',
            'business_type' => 'restaurant',
            'ownership_structure' => 'corporation',
            'contact_phone' => '09171002222',
            'business_email' => 'bgc_'.random_int(100, 999).'@example.com',
            'address_id' => $this->createAddress('Loyola Heights', '2 BGC St'),
            'restaurant_status' => 'active',
            'is_published' => 0,
            'accepting_orders' => 1,
        ]);

        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $branchBId,
            'user_id' => $staff->user_id,
            'invited_by' => $owner->user_id,
            'staff_position' => 'Manager',
            'staff_status' => 'active',
            'invited_at' => now(),
            'responded_at' => now(),
        ]);

        // Seed 1 pending order on Branch B
        $chkId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $customer->user_id,
            'idempotency_key' => 'br-lst-'.random_int(10000, 99999),
            'checkout_status' => 'pending',
            'total_amount' => '220.00',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('orders')->insert([
            'checkout_id' => $chkId,
            'order_reference' => 'SALO-BR-'.random_int(10000, 99999),
            'customer_id' => $customer->user_id,
            'restaurant_id' => $branchBId,
            'restaurant_name' => 'Salo Branches Bistro — BGC Branch',
            'customer_name' => 'Cust',
            'order_type' => 'pickup',
            'order_priority' => 'standard',
            'order_status' => 'pending',
            'delivery_recipient_name' => 'Cust',
            'delivery_phone' => '09170000000',
            'delivery_address_text' => 'QC',
            'subtotal_amount' => '220.00',
            'delivery_fee' => '0.00',
            'total_amount' => '220.00',
            'placed_at' => now(),
        ]);

        // Owner sees both branches (root first)
        $ownerRes = $this->actingAs($owner)->getJson('/api/restaurant/branches')->assertOk();
        $ownerBranches = $ownerRes->json('data.branches');
        $this->assertCount(2, $ownerBranches);
        $this->assertSame($rootId, $ownerBranches[0]['restaurant_id']);
        $this->assertTrue($ownerBranches[0]['is_main_branch']);
        $this->assertSame($branchBId, $ownerBranches[1]['restaurant_id']);
        $this->assertFalse($ownerBranches[1]['is_main_branch']);
        $this->assertSame(1, $ownerBranches[1]['pending_order_count']);
        $this->assertSame('Salo Branches Bistro — BGC Branch', $ownerBranches[1]['display_name']);

        // Staff sees ONLY Branch B
        $staffRes = $this->actingAs($staff)->getJson('/api/restaurant/branches')->assertOk();
        $staffBranches = $staffRes->json('data.branches');
        $this->assertCount(1, $staffBranches);
        $this->assertSame($branchBId, $staffBranches[0]['restaurant_id']);

        // Outsider gets 403
        $this->actingAs($outsider)->getJson('/api/restaurant/branches')->assertStatus(403);
    }

    public function test_create_branch_rules_first_main_name_copying_audit_and_notifications(): void
    {
        $owner = $this->createUser('crtown');
        $staff = $this->createUser('crtstf');
        $admin = $this->createUser('crtadm', 'admin');

        // Root starts with NULL branch_name
        $rootId = $this->createActiveRoot($owner, null);

        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $rootId,
            'user_id' => $staff->user_id,
            'invited_by' => $owner->user_id,
            'staff_position' => 'Manager',
            'staff_status' => 'active',
            'invited_at' => now(),
            'responded_at' => now(),
        ]);

        $basePayload = [
            'branch_name' => 'Makati Ave Branch',
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Loyola Heights',
            'street' => '55 Katipunan Ave',
            'postal_code' => '1108',
        ];

        // 1. Staff/Manager denied (403)
        $this->actingAs($staff)->postJson('/api/restaurant/branches', $basePayload)->assertStatus(403);

        // 2. First extra branch on root with NULL branch_name requires main_branch_name -> 422
        $this->actingAs($owner)->postJson('/api/restaurant/branches', $basePayload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['main_branch_name']);

        // 3. Valid creation sets root's main_branch_name + creates child branch
        $res = $this->actingAs($owner)->postJson('/api/restaurant/branches', array_merge($basePayload, [
            'main_branch_name' => 'QC Flagship',
        ]))->assertStatus(201);

        $childId = (int) $res->json('data.branch.restaurant_id');
        $this->assertGreaterThan(0, $childId);
        $this->assertSame('Makati Ave Branch', $res->json('data.branch.branch_name'));
        $this->assertFalse($res->json('data.branch.is_published'));

        $this->assertSame('QC Flagship', DB::table('restaurants')->where('restaurant_id', $rootId)->value('branch_name'));

        $childRow = DB::table('restaurants')->where('restaurant_id', $childId)->first();
        $this->assertSame($rootId, (int) $childRow->parent_restaurant_id);
        $this->assertSame($rootId, (int) $childRow->brand_restaurant_id);
        $this->assertSame('active', $childRow->restaurant_status);
        $this->assertSame(0, (int) $childRow->is_published);

        // Copied owners, categories, hours, menu (unpublished + approved); NO service_areas or payout_accounts
        $this->assertTrue(DB::table('restaurant_owners')->where('restaurant_id', $childId)->where('user_id', $owner->user_id)->exists());
        $this->assertSame(1, DB::table('restaurant_category_map')->where('restaurant_id', $childId)->count());
        $this->assertSame(7, DB::table('operating_hours')->where('restaurant_id', $childId)->count());

        $clonedItem = DB::table('menu_items')->where('restaurant_id', $childId)->first();
        $this->assertNotNull($clonedItem);
        $this->assertSame('approved', $clonedItem->approval_status);
        $this->assertSame(0, (int) $clonedItem->is_published);
        $this->assertSame(1, DB::table('add_on_groups')->where('menu_item_id', $clonedItem->menu_item_id)->count());

        $this->assertSame(0, DB::table('service_areas')->where('restaurant_id', $childId)->count());
        $this->assertSame(0, DB::table('payout_accounts')->where('restaurant_id', $childId)->count());

        // Audit log & admin notification created
        $audit = DB::table('audit_logs')
            ->where('action', 'restaurant_branch_created')
            ->where('entity_id', (string) $childId)
            ->first();
        $this->assertNotNull($audit);
        $this->assertSame($rootId, json_decode((string) $audit->new_values, true)['brand_restaurant_id']);

        $this->assertTrue(
            DB::table('notifications')
                ->where('user_id', $admin->user_id)
                ->where('type', 'restaurant_branch_created')
                ->where('related_entity_id', $childId)
                ->exists()
        );

        // 4. Duplicate branch name (case-insensitive) -> 422
        $this->actingAs($owner)->postJson('/api/restaurant/branches', array_merge($basePayload, [
            'branch_name' => '  makati ave branch  ',
        ]))->assertStatus(422)
            ->assertJsonValidationErrors(['branch_name']);

        // 5. Max branches limit -> 422
        Config::set('salo.restaurants.max_branches_per_business', 2);
        $this->actingAs($owner)->postJson('/api/restaurant/branches', array_merge($basePayload, [
            'branch_name' => 'Third Branch',
        ]))->assertStatus(422)
            ->assertJsonValidationErrors(['branch_name']);

        // 6. Invalid copy_from_restaurant_id (another brand's active restaurant) -> 422, nothing copied
        $otherOwner = $this->createUser('otherbr');
        $otherBrandRootId = $this->createActiveRoot($otherOwner, 'Rival Main');
        $countBeforeRollback = DB::table('restaurants')->where('brand_restaurant_id', $rootId)->count();
        $this->actingAs($owner)->postJson('/api/restaurant/branches', array_merge($basePayload, [
            'branch_name' => 'Rollback Branch',
            'copy_from_restaurant_id' => $otherBrandRootId,
        ]))->assertStatus(422)
            ->assertJsonValidationErrors(['copy_from_restaurant_id']);
        $this->assertSame($countBeforeRollback, DB::table('restaurants')->where('brand_restaurant_id', $rootId)->count());

        // 7. All three service toggles false -> 422 with field error (not DB 500)
        $this->actingAs($owner)->postJson('/api/restaurant/branches', array_merge($basePayload, [
            'branch_name' => 'No Service Branch',
            'offers_delivery' => false,
            'offers_pickup' => false,
            'offers_dine_in' => false,
        ]))->assertStatus(422)
            ->assertJsonValidationErrors(['offers_delivery']);

        // 8. Latitude / longitude validation: both or neither, and ranges enforced
        $this->actingAs($owner)->postJson('/api/restaurant/branches', array_merge($basePayload, [
            'branch_name' => 'Lat Only Branch',
            'latitude' => 14.6500,
        ]))->assertStatus(422)
            ->assertJsonValidationErrors(['longitude']);

        $this->actingAs($owner)->postJson('/api/restaurant/branches', array_merge($basePayload, [
            'branch_name' => 'Lng Only Branch',
            'longitude' => 121.0500,
        ]))->assertStatus(422)
            ->assertJsonValidationErrors(['latitude']);

        $this->actingAs($owner)->postJson('/api/restaurant/branches', array_merge($basePayload, [
            'branch_name' => 'Bad Range Branch',
            'latitude' => 95.0,
            'longitude' => 190.0,
        ]))->assertStatus(422)
            ->assertJsonValidationErrors(['latitude', 'longitude']);

        // 9. Inactive root -> 403
        Config::set('salo.restaurants.max_branches_per_business', 10);
        DB::table('restaurants')->where('restaurant_id', $rootId)->update(['restaurant_status' => 'suspended']);
        $this->actingAs($owner)->postJson('/api/restaurant/branches', array_merge($basePayload, [
            'branch_name' => 'Blocked Branch',
        ]))->assertStatus(403);
    }

    public function test_publish_blocked_with_delivery_enabled_and_no_coverage_then_allowed_once_configured(): void
    {
        $owner = $this->createUser('pubcov');
        $rootId = $this->createActiveRoot($owner, 'Main Branch');

        // Create child branch (active, is_published=0, offers_delivery=1, NO service_areas)
        $res = $this->actingAs($owner)->postJson('/api/restaurant/branches', [
            'branch_name' => 'Delivery Check Branch',
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '88 Maginhawa St',
        ])->assertStatus(201);
        $branchId = (int) $res->json('data.branch.restaurant_id');

        // Publish blocked while offers_delivery=1 and 0 service_areas
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $branchId)
            ->postJson('/api/restaurant/menu/publish')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['publish']);

        // Configure coverage -> publish succeeds
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $branchId)
            ->putJson('/api/restaurant/coverage', [
                'areas' => [['province' => 'Metro Manila', 'city' => 'Quezon City']],
            ])
            ->assertOk();

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $branchId)
            ->postJson('/api/restaurant/menu/publish')
            ->assertOk();
    }

    public function test_shared_menu_item_photo_survives_replacement_or_deletion_on_sibling_branch(): void
    {
        Storage::fake('public');
        Config::set('salo.uploads.public_image_driver', 'local');

        $owner = $this->createUser('mphoto');
        $rootId = $this->createActiveRoot($owner, 'Main Branch');
        $rootItemId = (int) DB::table('menu_items')->where('restaurant_id', $rootId)->value('menu_item_id');

        // Upload a local photo on root item
        $uploadRes = $this->actingAs($owner)
            ->post('/api/restaurant/menu/items/'.$rootItemId, [
                'photo' => UploadedFile::fake()->image('sisig.jpg', 300, 300),
            ], ['Accept' => 'application/json'])
            ->assertOk();
        $sharedPhotoPath = (string) DB::table('menu_items')->where('menu_item_id', $rootItemId)->value('photo_image');
        $this->assertNotEmpty($sharedPhotoPath);
        Storage::disk('public')->assertExists(ltrim(str_replace('/storage/', '', $sharedPhotoPath), '/'));

        // Create child branch cloning menu (shares $sharedPhotoPath)
        $branchRes = $this->actingAs($owner)->postJson('/api/restaurant/branches', [
            'branch_name' => 'Shared Photo Branch',
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '77 Katipunan Ave',
        ])->assertStatus(201);
        $branchId = (int) $branchRes->json('data.branch.restaurant_id');
        $branchItemId = (int) DB::table('menu_items')->where('restaurant_id', $branchId)->value('menu_item_id');

        // Remove photo on child branch -> local file must NOT be deleted because root item still references it
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $branchId)
            ->post('/api/restaurant/menu/items/'.$branchItemId, [
                'remove_photo' => true,
            ], ['Accept' => 'application/json'])
            ->assertOk();

        Storage::disk('public')->assertExists(ltrim(str_replace('/storage/', '', $sharedPhotoPath), '/'));

        // Verify Google Drive path reference protection too: mock GoogleDrivePublicImageStore->delete() must NOT be called
        $driveMock = $this->mock(GoogleDrivePublicImageStore::class);
        $driveMock->shouldReceive('delete')->never();

        $gdrivePath = 'gdrive:shared_file_id_123';
        DB::table('menu_items')->whereIn('menu_item_id', [$rootItemId, $branchItemId])->update(['photo_image' => $gdrivePath]);

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $branchId)
            ->post('/api/restaurant/menu/items/'.$branchItemId, [
                'remove_photo' => true,
            ], ['Accept' => 'application/json'])
            ->assertOk();
    }

    public function test_cors_preflight_allows_x_restaurant_id_header(): void
    {
        $res = $this->options('/api/restaurant/branches', [], [
            'Origin' => 'http://localhost:5173',
            'Access-Control-Request-Method' => 'GET',
            'Access-Control-Request-Headers' => 'X-Restaurant-Id, Content-Type',
        ]);

        $this->assertTrue(in_array($res->getStatusCode(), [200, 204], true));
        $res->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
        $allowHeaders = strtolower((string) $res->headers->get('Access-Control-Allow-Headers', ''));
        $this->assertTrue(
            str_contains($allowHeaders, '*') || str_contains($allowHeaders, 'x-restaurant-id'),
            "Expected Access-Control-Allow-Headers to allow X-Restaurant-Id, got: {$allowHeaders}"
        );
    }
}
