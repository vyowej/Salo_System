<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\RestaurantBranchService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MultiBranchPublicCheckoutAdminTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'p6'): User
    {
        return User::create([
            'username' => "{$prefix}_" . random_int(10000, 99999),
            'first_name' => ucfirst($prefix),
            'last_name' => 'Test',
            'email' => "{$prefix}_" . random_int(10000, 99999) . '@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createPublishedBranch(
        User $owner,
        string $name,
        ?string $branchName,
        string $cityName,
        string $barangayName,
        ?int $parentId = null,
        bool $published = true,
        string $status = 'active',
    ): int {
        $addressService = app(\App\Support\AddressService::class);
        $branchService = app(RestaurantBranchService::class);

        $addressId = $addressService->createAddress([
            'province' => 'Metro Manila',
            'city' => $cityName,
            'barangay' => $barangayName,
            'street' => '100 Branch St',
        ]);

        $payload = [
            'restaurant_name' => $name,
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234567',
            'business_email' => $owner->email,
            'address_id' => $addressId,
            'branch_name' => $branchName,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'accepting_orders' => 1,
            'restaurant_status' => $status,
            'is_published' => $published ? 1 : 0,
        ];

        $restaurantId = $parentId === null
            ? $branchService->createRootRestaurant($payload)
            : $branchService->createChildBranch($parentId, $payload);

        if ($parentId === null) {
            DB::table('restaurant_owners')->insert([
                'restaurant_id' => $restaurantId,
                'user_id' => $owner->user_id,
                'joined_at' => now(),
            ]);
        } else {
            DB::table('branch_permits')->where('restaurant_id', $restaurantId)->update([
                'is_required_locally' => 0,
                'exemption_reason' => 'Approved in test setup',
                'permit_status' => 'approved',
                'reviewed_by' => $owner->user_id,
                'reviewed_at' => now(),
            ]);
        }

        // Open 24/7 for all days so availability is_open = true
        for ($dow = 0; $dow <= 6; $dow++) {
            DB::table('operating_hours')->insert([
                'restaurant_id' => $restaurantId,
                'day_of_week' => $dow,
                'opening_time' => '00:00:00',
                'closing_time' => '23:59:00',
                'closes_next_day' => 0,
                'is_closed' => 0,
            ]);
        }

        // Add published menu category + item so PublicRestaurantVisibility includes it
        $catId = (int) DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $restaurantId,
            'category_name' => 'Mains',
            'sort_order' => 1,
            'is_active' => 1,
            'is_published' => 1,
            'published_category_name' => 'Mains',
            'published_sort_order' => 1,
            'published_is_active' => 1,
            'draft_state' => 'clean',
        ]);

        DB::table('menu_items')->insert([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'published_menu_category_id' => $catId,
            'item_name' => 'Adobo Bowl',
            'published_item_name' => 'Adobo Bowl',
            'base_price' => 180.00,
            'published_base_price' => 180.00,
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'is_published' => 1,
            'draft_state' => 'clean',
            'sort_order' => 1,
            'published_sort_order' => 1,
        ]);

        return $restaurantId;
    }

    public function test_public_listing_search_and_detail_siblings_for_1_2_and_3_branches(): void
    {
        $owner = $this->createUser('customer', 'pubown');
        $singleId = $this->createPublishedBranch($owner, 'Solo Diner', null, 'Quezon City', 'Diliman');

        // 1-branch (single location): display_name equals name, siblings is empty
        $singleDetail = $this->getJson("/api/restaurants/{$singleId}")->assertOk()->json('data.restaurant');
        $this->assertSame('Solo Diner', $singleDetail['display_name']);
        $this->assertNull($singleDetail['branch_name']);
        $this->assertSame(1, $singleDetail['branch_count']);
        $this->assertSame([], $singleDetail['siblings']);

        // Multi-branch brand: Main (visible) + Makati (visible) + Hidden (unpublished)
        $rootId = $this->createPublishedBranch($owner, 'Salo Grill', 'Main', 'Quezon City', 'South Triangle');
        $makatiId = $this->createPublishedBranch($owner, 'Salo Grill', 'Makati', 'Makati', 'Bel-Air', $rootId, true);
        $hiddenId = $this->createPublishedBranch($owner, 'Salo Grill', 'Secret', 'Pasig', 'Kapitolyo', $rootId, false);

        // Listing returns both visible branches, excludes unpublished branch
        $list = $this->getJson('/api/restaurants?search=Salo+Grill&per_page=50')->assertOk()->json('data.restaurants');
        $ids = array_column($list, 'id');
        $this->assertContains($rootId, $ids);
        $this->assertContains($makatiId, $ids);
        $this->assertNotContains($hiddenId, $ids);

        $makatiCard = collect($list)->firstWhere('id', $makatiId);
        $this->assertSame('Salo Grill — Makati', $makatiCard['display_name']);
        $this->assertSame('Makati', $makatiCard['branch_name']);
        $this->assertSame(2, $makatiCard['branch_count']);

        // Search by branch_name and area
        $byBranch = $this->getJson('/api/restaurants?search=Bel-Air')->assertOk()->json('data.restaurants');
        $this->assertContains($makatiId, array_column($byBranch, 'id'));

        // Detail with 2 visible branches -> 1 sibling (hidden excluded)
        $detail2 = $this->getJson("/api/restaurants/{$rootId}")->assertOk()->json('data.restaurant');
        $this->assertSame('Salo Grill — Main', $detail2['display_name']);
        $this->assertSame(2, $detail2['branch_count']);
        $this->assertCount(1, $detail2['siblings']);
        $this->assertSame($makatiId, $detail2['siblings'][0]['id']);

        // Publish 3rd branch -> detail returns 2 siblings
        DB::table('restaurants')->where('restaurant_id', $hiddenId)->update(['is_published' => 1]);
        $detail3 = $this->getJson("/api/restaurants/{$rootId}")->assertOk()->json('data.restaurant');
        $this->assertSame(3, $detail3['branch_count']);
        $this->assertCount(2, $detail3['siblings']);
    }

    public function test_checkout_from_two_branches_snapshots_display_names_for_orders_notifications_and_rider(): void
    {
        $owner = $this->createUser('customer', 'chkown');
        $customer = $this->createUser('customer', 'chkcust');
        $customer->phone_number = '09179998888';
        $customer->save();
        $riderUser = $this->createUser('customer', 'chkrid');

        $rootId = $this->createPublishedBranch($owner, 'Bistro', 'Main', 'Quezon City', 'Diliman');
        $makatiId = $this->createPublishedBranch($owner, 'Bistro', 'Makati', 'Makati', 'Bel-Air', $rootId);

        $rootItemId = (int) DB::table('menu_items')->where('restaurant_id', $rootId)->value('menu_item_id');
        $makatiItemId = (int) DB::table('menu_items')->where('restaurant_id', $makatiId)->value('menu_item_id');

        $custAddrId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '55 Customer St',
        ]);
        DB::table('user_addresses')->insert([
            'user_id' => $customer->user_id,
            'address_id' => $custAddrId,
            'address_label' => 'Home',
            'is_default' => 1,
        ]);

        // Add service_areas for delivery
        $qcCityId = (int) DB::table('cities')->where('city_name', 'Quezon City')->value('city_id');
        foreach ([$rootId, $makatiId] as $rId) {
            DB::table('service_areas')->insert([
                'restaurant_id' => $rId,
                'city_id' => $qcCityId,
                'barangay_id' => null,
            ]);
        }

        // Checkout with items from both branches
        $resp = $this->actingAs($customer)->postJson('/api/customer/checkout', [
            'idempotency_key' => 'p6a-two-branches-' . random_int(1000, 9999),
            'contact_phone' => '09179998888',
            'payment_method' => 'cod',
            'groups' => [
                [
                    'restaurant_id' => $rootId,
                    'fulfillment' => 'delivery',
                    'address_id' => $custAddrId,
                    'items' => [['menu_item_id' => $rootItemId, 'quantity' => 1]],
                ],
                [
                    'restaurant_id' => $makatiId,
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $makatiItemId, 'quantity' => 1]],
                ],
            ],
        ])->assertStatus(201);

        $orders = $resp->json('data.orders') ?? $resp->json('data.checkout.orders');
        $this->assertCount(2, $orders);
        $names = array_column($orders, 'restaurant_name');
        $this->assertContains('Bistro — Main', $names);
        $this->assertContains('Bistro — Makati', $names);

        // Customer order list shows branch display names
        $custOrders = $this->actingAs($customer)->getJson('/api/customer/orders')->assertOk()->json('data.orders');
        $this->assertContains('Bistro — Main', array_column($custOrders, 'restaurant_name'));
        $this->assertContains('Bistro — Makati', array_column($custOrders, 'restaurant_name'));

        // Order received notifications contain branch display name
        $notifBodies = DB::table('notifications')->where('user_id', $owner->user_id)->pluck('body')->implode("\n");
        $this->assertStringContainsString('Bistro — Main', $notifBodies);
        $this->assertStringContainsString('Bistro — Makati', $notifBodies);

        // Rider available deliveries shows branch display name for delivery order
        $riderId = (int) DB::table('riders')->insertGetId([
            'user_id' => $riderUser->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'EC',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09170000001',
            'base_city_id' => $qcCityId,
            'rider_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        \Illuminate\Support\Facades\Cache::put("rider:availability:{$riderId}", ['status' => 'online', 'is_online' => true], 3600);

        $deliveryOrder = collect($orders)->firstWhere('restaurant_id', $rootId);
        DB::table('orders')->where('order_id', $deliveryOrder['order_id'])->update(['order_status' => 'ready']);
        $avail = $this->actingAs($riderUser)->getJson('/api/rider/deliveries/available')->assertOk()->json('data.deliveries');
        $matched = collect($avail)->firstWhere('order_id', $deliveryOrder['order_id']);
        $this->assertSame('Bistro — Main', $matched['restaurant_name']);
    }

    public function test_admin_branch_status_single_vs_apply_to_all_branches_and_guards(): void
    {
        $admin = $this->createUser('admin', 'p6adm');
        $owner = $this->createUser('customer', 'p6own');
        $rootId = $this->createPublishedBranch($owner, 'Admin Brand', 'Main', 'Quezon City', 'Diliman');
        $branchId = $this->createPublishedBranch($owner, 'Admin Brand', 'BGC', 'Taguig', 'Fort Bonifacio', $rootId);

        // Non-admin -> 403
        $this->actingAs($owner)->patchJson("/api/admin/restaurants/{$rootId}/status", [
            'status' => 'inactive',
        ])->assertStatus(403);

        // Admin list returns branch metadata
        $list = $this->actingAs($admin)->getJson('/api/admin/restaurants?search=Admin+Brand&per_page=50')->assertOk()->json('data.items');
        $rootRow = collect($list)->firstWhere('restaurant_id', $rootId);
        $this->assertTrue($rootRow['is_main_branch']);
        $this->assertSame(2, $rootRow['branch_count']);
        $this->assertSame('Main', $rootRow['branch_name']);

        // Status on branch only leaves root active
        $this->actingAs($admin)->patchJson("/api/admin/restaurants/{$branchId}/status", [
            'status' => 'suspended',
            'reason' => 'Branch audit',
        ])->assertOk();
        $this->assertSame('suspended', DB::table('restaurants')->where('restaurant_id', $branchId)->value('restaurant_status'));
        $this->assertSame('active', DB::table('restaurants')->where('restaurant_id', $rootId)->value('restaurant_status'));

        // apply_to_all_branches on non-root -> 422
        $this->actingAs($admin)->patchJson("/api/admin/restaurants/{$branchId}/status", [
            'status' => 'active',
            'apply_to_all_branches' => true,
        ])->assertStatus(422);

        // Status on root only (default) leaves branch suspended
        $this->actingAs($admin)->patchJson("/api/admin/restaurants/{$rootId}/status", [
            'status' => 'inactive',
        ])->assertOk();
        $this->assertSame('inactive', DB::table('restaurants')->where('restaurant_id', $rootId)->value('restaurant_status'));
        $this->assertSame('suspended', DB::table('restaurants')->where('restaurant_id', $branchId)->value('restaurant_status'));

        // apply_to_all_branches on root updates both branches and records 1 audit_log per affected restaurant
        $this->actingAs($admin)->patchJson("/api/admin/restaurants/{$rootId}/status", [
            'status' => 'active',
            'reason' => 'Brand reactivated',
            'apply_to_all_branches' => true,
        ])->assertOk();

        $this->assertSame('active', DB::table('restaurants')->where('restaurant_id', $rootId)->value('restaurant_status'));
        $this->assertSame('active', DB::table('restaurants')->where('restaurant_id', $branchId)->value('restaurant_status'));

        $auditCount = DB::table('audit_logs')
            ->where('action', 'admin_restaurant_status_updated')
            ->where('entity_type', 'restaurants')
            ->whereIn('entity_id', [$rootId, $branchId])
            ->where('reason', 'Brand reactivated')
            ->count();
        $this->assertSame(2, $auditCount);
    }
}
