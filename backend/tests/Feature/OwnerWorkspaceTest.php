<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class OwnerWorkspaceTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Storage::fake('local');
    }

    private function createUser(string $role = 'customer', string $prefix = 'u'): User
    {
        return User::create([
            'username' => "{$prefix}_".random_int(10000, 99999),
            'first_name' => ucfirst($prefix),
            'last_name' => 'Tester',
            'email' => "{$prefix}_".random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createOwnedRestaurant(User $owner, string $status = 'active', string $name = 'Owner Bistro'): int
    {
        $addressId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '10 Workspace St',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => $name,
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234567',
            'business_email' => $owner->email,
            'address_id' => $addressId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepting_orders' => 1,
            'accepting_reservations' => 1,
            'restaurant_status' => $status,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        $cityId = DB::table('addresses as a')
            ->join('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->where('a.address_id', $addressId)
            ->value('b.city_id');
        if ($cityId !== null) {
            DB::table('service_areas')->insert([
                'restaurant_id' => $restaurantId,
                'city_id' => (int) $cityId,
                'barangay_id' => null,
                'created_at' => now(),
            ]);
        }

        return $restaurantId;
    }

    public function test_workspace_access_requires_active_owned_restaurant(): void
    {
        $pendingOwner = $this->createUser('customer', 'pend');
        $pendingId = $this->createOwnedRestaurant($pendingOwner, 'pending', 'Pending Spot');

        $approvedOwner = $this->createUser('customer', 'appr');
        $approvedId = $this->createOwnedRestaurant($approvedOwner, 'approved', 'ApprovedNotActive Spot');

        $activeOwnerA = $this->createUser('customer', 'ownA');
        $activeIdA = $this->createOwnedRestaurant($activeOwnerA, 'active', 'Active A');

        $activeOwnerB = $this->createUser('customer', 'ownB');
        $activeIdB = $this->createOwnedRestaurant($activeOwnerB, 'active', 'Active B');

        $customer = $this->createUser('customer', 'cust');
        $admin = $this->createUser('admin', 'adm');

        // Unauthenticated -> 401
        $this->getJson('/api/restaurant/profile')->assertStatus(401);

        // Customer & Admin (without ownership) -> 403
        $this->actingAs($customer)->getJson('/api/restaurant/profile')->assertStatus(403);
        $this->actingAs($admin)->getJson("/api/restaurant/profile?restaurant_id={$activeIdA}")->assertStatus(403);

        // Pending and 'approved' (not 'active') owners -> 403 on Step 7 endpoints
        $this->actingAs($pendingOwner)->getJson("/api/restaurant/profile?restaurant_id={$pendingId}")->assertStatus(403);
        $this->actingAs($pendingOwner)->getJson("/api/restaurant/menu/items?restaurant_id={$pendingId}")->assertStatus(403);

        $this->actingAs($approvedOwner)->getJson("/api/restaurant/profile?restaurant_id={$approvedId}")->assertStatus(403);

        // Owner B cannot access Owner A's restaurant -> 403
        $this->actingAs($activeOwnerB)->getJson("/api/restaurant/profile?restaurant_id={$activeIdA}")->assertStatus(403);
        $this->actingAs($activeOwnerB)->patchJson('/api/restaurant/profile', [
            'restaurant_id' => $activeIdA,
            'description' => 'Hacked',
        ])->assertStatus(403);

        // Owner A CAN access their own active restaurant -> 200
        $this->actingAs($activeOwnerA)->getJson("/api/restaurant/profile?restaurant_id={$activeIdA}")
            ->assertOk()
            ->assertJsonPath('data.profile.restaurant_name', 'Active A');

        // Owner B can access their own restaurant
        $this->actingAs($activeOwnerB)->getJson("/api/restaurant/profile?restaurant_id={$activeIdB}")->assertOk();
    }

    public function test_profile_media_toggles_and_operating_hours_crud_and_validation(): void
    {
        $owner = $this->createUser('customer', 'prof');
        $restId = $this->createOwnedRestaurant($owner, 'active', 'Profile Bistro');

        // Update profile fields (must keep at least one of delivery/pickup)
        $this->actingAs($owner)->patchJson('/api/restaurant/profile', [
            'restaurant_id' => $restId,
            'offers_delivery' => false,
            'offers_pickup' => false,
        ])->assertStatus(422)->assertJsonValidationErrors(['offers_delivery']);

        $this->actingAs($owner)->patchJson('/api/restaurant/profile', [
            'restaurant_id' => $restId,
            'description' => 'Freshly updated kitchen description.',
            'contact_phone' => '09178889999',
            'business_email' => 'hello@profilebistro.test',
            'offers_delivery' => true,
            'offers_pickup' => false,
        ])->assertOk()
            ->assertJsonPath('data.profile.description', 'Freshly updated kitchen description.')
            ->assertJsonPath('data.profile.offers_pickup', false);

        // Accepting toggles
        $this->actingAs($owner)->patchJson('/api/restaurant/accepting-status', [
            'restaurant_id' => $restId,
            'accepting_orders' => false,
            'accepting_reservations' => true,
        ])->assertOk()
            ->assertJsonPath('data.profile.accepting_orders', false)
            ->assertJsonPath('data.profile.accepting_reservations', true);

        // Logo upload, replacement, and fake-image rejection
        $this->actingAs($owner)->post('/api/restaurant/profile/media', [
            'restaurant_id' => $restId,
            'logo_image' => UploadedFile::fake()->image('logo1.png', 120, 120),
        ], ['Accept' => 'application/json'])->assertOk();

        $firstLogo = DB::table('restaurants')->where('restaurant_id', $restId)->value('logo_image');
        $this->assertStringStartsWith("restaurants/{$restId}/", $firstLogo);
        Storage::disk('public')->assertExists($firstLogo);

        // Fake image fails 422 and keeps old logo intact
        $this->actingAs($owner)->post('/api/restaurant/profile/media', [
            'restaurant_id' => $restId,
            'logo_image' => UploadedFile::fake()->createWithContent('bad.jpg', '<?php echo 1; ?>'),
        ], ['Accept' => 'application/json'])->assertStatus(422);
        Storage::disk('public')->assertExists($firstLogo);

        // Valid replacement deletes old logo
        $this->actingAs($owner)->post('/api/restaurant/profile/media', [
            'restaurant_id' => $restId,
            'logo_image' => UploadedFile::fake()->image('logo2.png', 120, 120),
        ], ['Accept' => 'application/json'])->assertOk();
        $secondLogo = DB::table('restaurants')->where('restaurant_id', $restId)->value('logo_image');
        $this->assertNotSame($firstLogo, $secondLogo);
        Storage::disk('public')->assertMissing($firstLogo);
        Storage::disk('public')->assertExists($secondLogo);

        // Operating hours: reject overlap
        $this->actingAs($owner)->putJson('/api/restaurant/operating-hours', [
            'restaurant_id' => $restId,
            'operating_hours' => [
                ['day_of_week' => 1, 'opening_time' => '09:00', 'closing_time' => '14:00', 'is_closed' => false],
                ['day_of_week' => 1, 'opening_time' => '13:00', 'closing_time' => '21:00', 'is_closed' => false],
            ],
        ])->assertStatus(422);

        // Valid split shift + overnight
        $this->actingAs($owner)->putJson('/api/restaurant/operating-hours', [
            'restaurant_id' => $restId,
            'operating_hours' => [
                ['day_of_week' => 1, 'opening_time' => '09:00', 'closing_time' => '14:00', 'is_closed' => false],
                ['day_of_week' => 1, 'opening_time' => '17:00', 'closing_time' => '01:00', 'closes_next_day' => true, 'is_closed' => false],
                ['day_of_week' => 0, 'is_closed' => true],
            ],
        ])->assertOk()
            ->assertJsonCount(3, 'data.operating_hours');

        $this->assertDatabaseHas('audit_logs', ['entity_type' => 'restaurants', 'entity_id' => (string) $restId, 'action' => 'owner_profile_updated']);
        $this->assertDatabaseHas('audit_logs', ['entity_type' => 'restaurants', 'entity_id' => (string) $restId, 'action' => 'owner_operating_hours_updated']);
    }

    public function test_menu_categories_items_order_delete_guard_and_public_visibility(): void
    {
        $owner = $this->createUser('customer', 'menuown');
        $restId = $this->createOwnedRestaurant($owner, 'active', 'Menu Master Kitchen');

        $otherOwner = $this->createUser('customer', 'otherown');
        $otherRestId = $this->createOwnedRestaurant($otherOwner, 'active', 'Other Kitchen');

        // Create two categories and reorder
        $cat1 = $this->actingAs($owner)->postJson('/api/restaurant/menu/categories', [
            'restaurant_id' => $restId,
            'category_name' => 'Mains',
        ])->assertStatus(201)->json('data.category');

        $cat2 = $this->actingAs($owner)->postJson('/api/restaurant/menu/categories', [
            'restaurant_id' => $restId,
            'category_name' => 'Drinks',
        ])->assertStatus(201)->json('data.category');

        $this->actingAs($owner)->putJson('/api/restaurant/menu/categories/reorder', [
            'restaurant_id' => $restId,
            'ordered_ids' => [$cat2['id'], $cat1['id']],
        ])->assertOk()
            ->assertJsonPath('data.categories.0.id', $cat2['id']);

        // Cannot create item under another restaurant's category
        $otherCat = $this->actingAs($otherOwner)->postJson('/api/restaurant/menu/categories', [
            'restaurant_id' => $otherRestId,
            'category_name' => 'Other Mains',
        ])->assertStatus(201)->json('data.category');

        $this->actingAs($owner)->postJson('/api/restaurant/menu/items', [
            'restaurant_id' => $restId,
            'menu_category_id' => $otherCat['id'],
            'item_name' => 'Cross Tenant Dish',
            'base_price' => '150.00',
        ])->assertStatus(422);

        // Create available, sold_out, and hidden items
        $availableItem = $this->actingAs($owner)->post('/api/restaurant/menu/items', [
            'restaurant_id' => $restId,
            'menu_category_id' => $cat1['id'],
            'item_name' => 'Sizzling Sisig',
            'base_price' => '220.50',
            'availability_status' => 'available',
            'photo' => UploadedFile::fake()->image('sisig.jpg', 200, 200),
        ], ['Accept' => 'application/json'])
            ->assertStatus(201)
            ->assertJsonPath('data.item.approval_status', 'approved')
            ->json('data.item');

        $soldOutItem = $this->actingAs($owner)->postJson('/api/restaurant/menu/items', [
            'restaurant_id' => $restId,
            'menu_category_id' => $cat1['id'],
            'item_name' => 'Sold Out Steak',
            'base_price' => '450.00',
            'availability_status' => 'sold_out',
        ])->assertStatus(201)->json('data.item');

        $hiddenItem = $this->actingAs($owner)->postJson('/api/restaurant/menu/items', [
            'restaurant_id' => $restId,
            'menu_category_id' => $cat1['id'],
            'item_name' => 'Secret Hidden Dish',
            'base_price' => '99.00',
            'availability_status' => 'hidden',
        ])->assertStatus(201)->json('data.item');

        // Draft items are NOT publicly visible before publishing
        $this->getJson("/api/restaurants/{$restId}/menu")->assertStatus(404);

        // Complete required profile/hours then publish
        DB::table('restaurants')->where('restaurant_id', $restId)->update([
            'description' => 'Bistro description',
            'contact_phone' => '09171234567',
        ]);
        DB::table('operating_hours')->insert([
            'restaurant_id' => $restId,
            'day_of_week' => 1,
            'opening_time' => '09:00:00',
            'closing_time' => '21:00:00',
            'closes_next_day' => 0,
            'is_closed' => 0,
        ]);
        $this->actingAs($owner)->postJson('/api/restaurant/menu/publish', ['restaurant_id' => $restId])
            ->assertOk();

        // Public menu shows available & sold_out, hides 'hidden'
        $publicMenu = $this->getJson("/api/restaurants/{$restId}/menu")->assertOk();
        $publicJson = (string) $publicMenu->getContent();
        $this->assertStringContainsString('Sizzling Sisig', $publicJson);
        $this->assertStringContainsString('Sold Out Steak', $publicJson);
        $this->assertStringNotContainsString('Secret Hidden Dish', $publicJson);

        // Cannot delete category that still has items -> 409
        $this->actingAs($owner)->deleteJson("/api/restaurant/menu/categories/{$cat1['id']}?restaurant_id={$restId}")
            ->assertStatus(409);

        // Can delete empty category
        $this->actingAs($owner)->deleteJson("/api/restaurant/menu/categories/{$cat2['id']}?restaurant_id={$restId}")
            ->assertOk();

        // Can delete unreferenced item (hiddenItem)
        $this->actingAs($owner)->deleteJson("/api/restaurant/menu/items/{$hiddenItem['id']}?restaurant_id={$restId}")
            ->assertOk();

        // Simulate order_items reference for availableItem -> delete must fail with 409
        $buyer = $this->createUser('customer', 'buyer');
        $buyerAddr = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '5 Buyer Rd',
        ]);
        $checkoutId = DB::table('checkouts')->insertGetId([
            'customer_id' => $buyer->user_id,
            'checkout_status' => 'pending',
            'total_amount' => 220.50,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $orderId = DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'customer_id' => $buyer->user_id,
            'restaurant_id' => $restId,
            'restaurant_name' => 'Menu Master Kitchen',
            'customer_name' => 'Buyer Tester',
            'order_reference' => 'ORD-TEST-'.random_int(10000, 99999),
            'order_type' => 'delivery',
            'delivery_address_id' => $buyerAddr,
            'subtotal_amount' => 220.50,
            'total_amount' => 220.50,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('order_items')->insert([
            'order_id' => $orderId,
            'menu_item_id' => $availableItem['id'],
            'item_name' => 'Sizzling Sisig',
            'unit_price' => 220.50,
            'quantity' => 1,
            'line_total' => 220.50,
        ]);

        $this->actingAs($owner)->deleteJson("/api/restaurant/menu/items/{$availableItem['id']}?restaurant_id={$restId}")
            ->assertStatus(409);

        // Can set soldOutItem to hidden via availability endpoint
        $this->actingAs($owner)->patchJson("/api/restaurant/menu/items/{$soldOutItem['id']}/availability", [
            'restaurant_id' => $restId,
            'availability_status' => 'hidden',
        ])->assertOk()
            ->assertJsonPath('data.item.availability', 'hidden');

        $this->assertDatabaseHas('audit_logs', [
            'entity_type' => 'menu_items',
            'entity_id' => (string) $soldOutItem['id'],
            'action' => 'owner_menu_item_updated',
        ]);
    }

    public function test_menu_categories_mixed_case_duplicate_guard_items_sort_and_setup_status_query_counts(): void
    {
        $owner = $this->createUser('customer', 'perfown');
        $restId = $this->createOwnedRestaurant($owner, 'active', 'Perf Menu Kitchen');

        $catA = $this->actingAs($owner)->postJson('/api/restaurant/menu/categories', [
            'restaurant_id' => $restId,
            'category_name' => 'Main Dishes',
        ])->assertStatus(201)->json('data.category');

        // Mixed-case duplicate category name must still be rejected with 422 after dropping LOWER()
        $this->actingAs($owner)->postJson('/api/restaurant/menu/categories', [
            'restaurant_id' => $restId,
            'category_name' => 'mAiN dIsHeS',
        ])->assertStatus(422)->assertJsonValidationErrors(['category_name']);

        $catB = $this->actingAs($owner)->postJson('/api/restaurant/menu/categories', [
            'restaurant_id' => $restId,
            'category_name' => 'Appetizers',
        ])->assertStatus(201)->json('data.category');

        // Updating catB to mixed-case duplicate of catA must also be rejected with 422
        $this->actingAs($owner)->patchJson("/api/restaurant/menu/categories/{$catB['id']}", [
            'restaurant_id' => $restId,
            'category_name' => 'MAIN DISHES',
        ])->assertStatus(422)->assertJsonValidationErrors(['category_name']);

        // Reorder so catB (Appetizers) is sort_order 1 and catA (Main Dishes) is sort_order 2
        $this->actingAs($owner)->putJson('/api/restaurant/menu/categories/reorder', [
            'restaurant_id' => $restId,
            'ordered_ids' => [$catB['id'], $catA['id']],
        ])->assertOk();

        $itemA = $this->actingAs($owner)->postJson('/api/restaurant/menu/items', [
            'restaurant_id' => $restId,
            'menu_category_id' => $catA['id'],
            'item_name' => 'Kare-Kare',
            'base_price' => '320.00',
        ])->assertStatus(201)->json('data.item');

        $itemB = $this->actingAs($owner)->postJson('/api/restaurant/menu/items', [
            'restaurant_id' => $restId,
            'menu_category_id' => $catB['id'],
            'item_name' => 'Lumpia',
            'base_price' => '120.00',
        ])->assertStatus(201)->json('data.item');

        // Verify GET /api/restaurant/menu/items preserves category sort_order -> item sort_order and <= 8 queries
        DB::flushQueryLog();
        DB::enableQueryLog();
        $itemsRes = $this->actingAs($owner)->getJson("/api/restaurant/menu/items?restaurant_id={$restId}")
            ->assertOk();
        $this->assertLessThanOrEqual(8, count(DB::getQueryLog()), 'GET /api/restaurant/menu/items must execute at most 8 queries.');
        $this->assertSame([$itemB['id'], $itemA['id']], collect($itemsRes->json('data.items'))->pluck('id')->all());

        // Verify GET /api/restaurant/setup-status combines 4 count checks into 1 query (<= 8 total queries)
        DB::flushQueryLog();
        $this->actingAs($owner)->getJson("/api/restaurant/setup-status?restaurant_id={$restId}")
            ->assertOk()
            ->assertJsonPath('data.setup_status.menu.categories_count', 2)
            ->assertJsonPath('data.setup_status.menu.items_count', 2)
            ->assertJsonPath('data.setup_status.menu.complete', true)
            ->assertJsonPath('data.setup_status.operating_hours.complete', false);
        $this->assertLessThanOrEqual(8, count(DB::getQueryLog()), 'GET /api/restaurant/setup-status must execute at most 8 queries.');
    }
}
