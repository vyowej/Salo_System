<?php

namespace Tests\Feature;

use App\Features\Applications\Services\ProfileChangeRequestService;
use App\Features\Notifications\Services\NotificationService;
use App\Models\User;
use App\Support\AddressService;
use App\Support\RestaurantBranchService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class MultiBranchAuthorizationMatrixTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $prefix = 'mbauth', string $role = 'customer'): User
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

    /**
     * @return array{root_id: int, branch_b_id: int}
     */
    private function createBrandWithTwoActiveBranches(User $owner, string $brandName = 'Salo Grill'): array
    {
        $branchService = app(RestaurantBranchService::class);
        $now = now();

        $rootId = $branchService->createRootRestaurant([
            'restaurant_name' => $brandName,
            'registered_name' => $brandName.' Corp',
            'branch_name' => 'Main Branch',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'description' => 'Original brand description',
            'contact_phone' => '09171110001',
            'business_email' => strtolower(str_replace(' ', '', $brandName)).'_root_'.random_int(100, 999).'@example.com',
            'address_id' => $this->createAddress('Diliman', '1 Main Ave'),
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepting_orders' => 1,
            'is_published' => 1,
            'restaurant_status' => 'active',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $rootId,
            'user_id' => $owner->user_id,
            'joined_at' => $now,
        ]);

        $branchBId = $branchService->createChildBranch($rootId, [
            'restaurant_name' => $brandName,
            'registered_name' => $brandName.' Corp',
            'branch_name' => 'BGC Branch',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'description' => 'Original brand description',
            'contact_phone' => '09171110002',
            'business_email' => strtolower(str_replace(' ', '', $brandName)).'_bgc_'.random_int(100, 999).'@example.com',
            'address_id' => $this->createAddress('Loyola Heights', '2 BGC High St'),
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepting_orders' => 1,
            'is_published' => 1,
            'restaurant_status' => 'active',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        foreach ([$rootId, $branchBId] as $rId) {
            for ($d = 0; $d <= 6; $d++) {
                DB::table('operating_hours')->insert([
                    'restaurant_id' => $rId,
                    'day_of_week' => $d,
                    'opening_time' => '00:00:00',
                    'closing_time' => '23:59:00',
                    'closes_next_day' => 0,
                    'is_closed' => 0,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }

        return ['root_id' => $rootId, 'branch_b_id' => $branchBId];
    }

    private function seedOrderForRestaurant(int $restaurantId, int $customerId): int
    {
        $checkoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $customerId,
            'idempotency_key' => 'mb-'.random_int(100000, 999999).'-'.microtime(true),
            'checkout_status' => 'pending',
            'total_amount' => '150.00',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'order_reference' => 'SALO-MB-'.random_int(10000, 99999),
            'customer_id' => $customerId,
            'restaurant_id' => $restaurantId,
            'restaurant_name' => 'Salo Grill',
            'customer_name' => 'Test Customer',
            'order_type' => 'pickup',
            'order_priority' => 'standard',
            'order_status' => 'pending',
            'delivery_recipient_name' => 'Test Customer',
            'delivery_phone' => '09171234567',
            'delivery_address_text' => '55 Customer Rd, Quezon City',
            'subtotal_amount' => '150.00',
            'delivery_fee' => '0.00',
            'total_amount' => '150.00',
            'placed_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function seedPublishedMenuItem(int $restaurantId, string $name = 'Branch Dish'): int
    {
        $catId = (int) DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $restaurantId,
            'category_name' => 'Mains',
            'sort_order' => 1,
            'is_active' => 1,
            'draft_state' => 'clean',
            'is_published' => 1,
            'published_category_name' => 'Mains',
            'published_sort_order' => 1,
            'published_is_active' => 1,
        ]);

        return (int) DB::table('menu_items')->insertGetId([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'item_name' => $name,
            'base_price' => '150.00',
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'sort_order' => 1,
            'draft_state' => 'clean',
            'is_published' => 1,
            'published_menu_category_id' => $catId,
            'published_item_name' => $name,
            'published_base_price' => '150.00',
            'published_sort_order' => 1,
        ]);
    }

    public function test_role_context_returns_branch_metadata_and_root_first_ordering(): void
    {
        $owner = $this->createUser('ctxown');
        $staff = $this->createUser('ctxstf');
        $brand = $this->createBrandWithTwoActiveBranches($owner, 'Context Bistro');

        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $brand['branch_b_id'],
            'user_id' => $staff->user_id,
            'invited_by' => $owner->user_id,
            'staff_position' => 'Manager',
            'staff_status' => 'active',
            'invited_at' => now(),
            'responded_at' => now(),
        ]);

        $ownerCtx = $owner->resolveRoleContext(true);
        $this->assertCount(2, $ownerCtx['restaurant_ownerships']);
        $first = $ownerCtx['restaurant_ownerships'][0];
        $second = $ownerCtx['restaurant_ownerships'][1];

        $this->assertSame($brand['root_id'], $first['restaurant_id']);
        $this->assertNull($first['parent_restaurant_id']);
        $this->assertSame($brand['root_id'], $first['brand_restaurant_id']);
        $this->assertSame('Main Branch', $first['branch_name']);
        $this->assertSame('Context Bistro — Main Branch', $first['display_name']);
        $this->assertTrue($first['is_main_branch']);
        $this->assertSame('Diliman, Quezon City', $first['short_address']);

        $this->assertSame($brand['branch_b_id'], $second['restaurant_id']);
        $this->assertSame($brand['root_id'], $second['parent_restaurant_id']);
        $this->assertSame($brand['root_id'], $second['brand_restaurant_id']);
        $this->assertSame('BGC Branch', $second['branch_name']);
        $this->assertSame('Context Bistro — BGC Branch', $second['display_name']);
        $this->assertFalse($second['is_main_branch']);

        $staffCtx = $staff->resolveRoleContext(true);
        $this->assertCount(1, $staffCtx['restaurant_staff_assignments']);
        $assign = $staffCtx['restaurant_staff_assignments'][0];
        $this->assertSame($brand['branch_b_id'], $assign['restaurant_id']);
        $this->assertSame('Context Bistro — BGC Branch', $assign['display_name']);
        $this->assertFalse($assign['is_main_branch']);
    }

    public function test_owner_and_staff_branch_authorization_matrix_and_headers(): void
    {
        $owner = $this->createUser('matown');
        $otherOwner = $this->createUser('otherown');
        $staff = $this->createUser('matstf');
        $customer = $this->createUser('matcust');

        $brand = $this->createBrandWithTwoActiveBranches($owner, 'Matrix Grill');
        $otherBrand = $this->createBrandWithTwoActiveBranches($otherOwner, 'Rival Grill');

        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $brand['branch_b_id'],
            'user_id' => $staff->user_id,
            'invited_by' => $owner->user_id,
            'staff_position' => 'Manager',
            'staff_status' => 'active',
            'invited_at' => now(),
            'responded_at' => now(),
        ]);

        $orderRootId = $this->seedOrderForRestaurant($brand['root_id'], $customer->user_id);
        $orderBId = $this->seedOrderForRestaurant($brand['branch_b_id'], $customer->user_id);
        $this->seedPublishedMenuItem($brand['branch_b_id'], 'BGC Menu Publish Dish');

        // 1. Owner default (no param/header) resolves to Main Branch; X-Restaurant-Id switches; explicit param wins.
        $this->actingAs($owner)
            ->getJson('/api/restaurant/profile')
            ->assertOk()
            ->assertJsonPath('data.profile.restaurant_id', $brand['root_id']);

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $brand['branch_b_id'])
            ->getJson('/api/restaurant/profile')
            ->assertOk()
            ->assertJsonPath('data.profile.restaurant_id', $brand['branch_b_id']);

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $brand['branch_b_id'])
            ->getJson('/api/restaurant/profile?restaurant_id='.$brand['root_id'])
            ->assertOk()
            ->assertJsonPath('data.profile.restaurant_id', $brand['root_id']);

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $brand['branch_b_id'])
            ->getJson('/api/restaurant/location')
            ->assertOk()
            ->assertJsonPath('data.restaurant_id', $brand['branch_b_id']);

        // 2. Owner denied on another business and on invalid restaurant_id / X-Restaurant-Id.
        $this->actingAs($owner)
            ->getJson('/api/restaurant/profile?restaurant_id='.$otherBrand['root_id'])
            ->assertStatus(403);

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', 'abc')
            ->getJson('/api/restaurant/profile')
            ->assertStatus(403);

        $this->actingAs($owner)
            ->getJson('/api/restaurant/profile?restaurant_id=0')
            ->assertStatus(403);

        // 3. Staff (Manager at Branch B) permitted on Branch B for orders, order actions, inventory, menu publish.
        $this->actingAs($staff)
            ->withHeader('X-Restaurant-Id', (string) $brand['branch_b_id'])
            ->getJson('/api/restaurant/orders')
            ->assertOk();

        $this->actingAs($staff)
            ->withHeader('X-Restaurant-Id', (string) $brand['branch_b_id'])
            ->postJson("/api/restaurant/orders/{$orderBId}/accept")
            ->assertOk();

        $this->actingAs($staff)
            ->withHeader('X-Restaurant-Id', (string) $brand['branch_b_id'])
            ->getJson('/api/restaurant/inventory/config')
            ->assertOk();

        $this->actingAs($staff)
            ->withHeader('X-Restaurant-Id', (string) $brand['branch_b_id'])
            ->patchJson('/api/restaurant/inventory/config', ['deduction_mode' => 'on_completion'])
            ->assertOk();

        $this->actingAs($staff)
            ->withHeader('X-Restaurant-Id', (string) $brand['branch_b_id'])
            ->postJson('/api/restaurant/menu/publish')
            ->assertOk();

        // 4. Staff denied (403) on sibling Main Branch for orders, order actions, inventory, menu publish.
        $this->actingAs($staff)
            ->withHeader('X-Restaurant-Id', (string) $brand['root_id'])
            ->getJson('/api/restaurant/orders')
            ->assertStatus(403);

        $this->actingAs($staff)
            ->withHeader('X-Restaurant-Id', (string) $brand['root_id'])
            ->postJson("/api/restaurant/orders/{$orderRootId}/accept")
            ->assertStatus(403);

        $this->actingAs($staff)
            ->withHeader('X-Restaurant-Id', (string) $brand['root_id'])
            ->getJson('/api/restaurant/inventory/config')
            ->assertStatus(403);

        $this->actingAs($staff)
            ->withHeader('X-Restaurant-Id', (string) $brand['root_id'])
            ->postJson('/api/restaurant/menu/publish')
            ->assertStatus(403);

        // 5. Owner-only endpoints denied (403) for staff even on their assigned branch.
        $this->actingAs($staff)
            ->withHeader('X-Restaurant-Id', (string) $brand['branch_b_id'])
            ->getJson('/api/restaurant/profile')
            ->assertStatus(403);

        $this->actingAs($staff)
            ->withHeader('X-Restaurant-Id', (string) $brand['branch_b_id'])
            ->getJson('/api/restaurant/location')
            ->assertStatus(403);

        $this->actingAs($staff)
            ->withHeader('X-Restaurant-Id', (string) $brand['branch_b_id'])
            ->getJson('/api/restaurant/staff')
            ->assertStatus(403);

        // 6. Inactive branch -> 403 for both owner (including location!) and staff.
        DB::table('restaurants')->where('restaurant_id', $brand['branch_b_id'])->update(['restaurant_status' => 'suspended']);

        $this->actingAs($owner)
            ->getJson('/api/restaurant/location?restaurant_id='.$brand['branch_b_id'])
            ->assertStatus(403);

        $this->actingAs($staff)
            ->withHeader('X-Restaurant-Id', (string) $brand['branch_b_id'])
            ->getJson('/api/restaurant/orders')
            ->assertStatus(403);
    }

    public function test_hierarchy_rules_and_strategy_b_owner_sync_and_integrity_command(): void
    {
        $owner = $this->createUser('hierown');
        $coOwner = $this->createUser('hierco');
        $brand = $this->createBrandWithTwoActiveBranches($owner, 'Hier Bistro');
        $branchService = app(RestaurantBranchService::class);

        // 1. Grandchild rejected (parent must be root).
        try {
            $branchService->assertValidNewBranch($brand['branch_b_id'], 'Grandchild Branch');
            $this->fail('Expected ValidationException for grandchild branch.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('parent_restaurant_id', $e->errors());
        }

        // 2. Self-parent rejected.
        try {
            $branchService->assertValidNewBranch($brand['root_id'], 'Self Branch', $brand['root_id']);
            $this->fail('Expected ValidationException for self-parent.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('parent_restaurant_id', $e->errors());
        }

        // 3. Case-insensitive duplicate branch name rejected (both child name and root's branch_name).
        foreach (['bgc branch', '  MAIN BRANCH  '] as $dupName) {
            try {
                $branchService->assertValidNewBranch($brand['root_id'], $dupName);
                $this->fail("Expected ValidationException for duplicate branch name {$dupName}.");
            } catch (ValidationException $e) {
                $this->assertArrayHasKey('branch_name', $e->errors());
            }
        }

        // 4. Max branches per business enforced.
        Config::set('salo.restaurants.max_branches_per_business', 2);
        try {
            $branchService->assertValidNewBranch($brand['root_id'], 'Third Branch');
            $this->fail('Expected ValidationException when max_branches_per_business is reached.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('branch_name', $e->errors());
        }

        // 5. Strategy B co-owner sync across all branches + integrity command passes.
        $branchService->addOwnerToBrand($brand['root_id'], $coOwner->user_id);
        $this->assertTrue(DB::table('restaurant_owners')->where('restaurant_id', $brand['root_id'])->where('user_id', $coOwner->user_id)->exists());
        $this->assertTrue(DB::table('restaurant_owners')->where('restaurant_id', $brand['branch_b_id'])->where('user_id', $coOwner->user_id)->exists());

        $this->artisan('salo:check-branch-integrity')->assertSuccessful();

        $branchService->removeOwnerFromBrand($brand['root_id'], $coOwner->user_id);
        $this->assertFalse(DB::table('restaurant_owners')->where('restaurant_id', $brand['branch_b_id'])->where('user_id', $coOwner->user_id)->exists());
    }

    public function test_self_order_block_order_notifications_and_brand_field_propagation(): void
    {
        $owner = $this->createUser('notifown');
        $staffB = $this->createUser('notifstf');
        $staffRoot = $this->createUser('notifroot');
        $customer = $this->createUser('notifcust');
        $admin = $this->createUser('notifadmin', 'admin');

        $brand = $this->createBrandWithTwoActiveBranches($owner, 'Notify Cafe');

        DB::table('restaurant_staff')->insert([
            [
                'restaurant_id' => $brand['branch_b_id'],
                'user_id' => $staffB->user_id,
                'invited_by' => $owner->user_id,
                'staff_position' => 'Order Handler',
                'staff_status' => 'active',
                'invited_at' => now(),
                'responded_at' => now(),
            ],
            [
                'restaurant_id' => $brand['root_id'],
                'user_id' => $staffRoot->user_id,
                'invited_by' => $owner->user_id,
                'staff_position' => 'Order Handler',
                'staff_status' => 'active',
                'invited_at' => now(),
                'responded_at' => now(),
            ],
        ]);

        $itemRootId = $this->seedPublishedMenuItem($brand['root_id'], 'Root Espresso');
        $itemBId = $this->seedPublishedMenuItem($brand['branch_b_id'], 'BGC Latte');

        // 1. Owner is blocked from ordering from ANY branch of the business (including Branch B).
        $this->actingAs($owner)
            ->postJson('/api/customer/checkout', [
                'idempotency_key' => 'mb-self-own-'.random_int(10000, 99999),
                'payment_method' => 'cod',
                'groups' => [[
                    'restaurant_id' => $brand['branch_b_id'],
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $itemBId, 'quantity' => 1]],
                ]],
            ])
            ->assertStatus(422);

        // 2. Staff at Branch B is blocked from Branch B, but allowed to order from sibling Main Branch.
        $this->actingAs($staffB)
            ->postJson('/api/customer/checkout', [
                'idempotency_key' => 'mb-self-stfb-'.random_int(10000, 99999),
                'payment_method' => 'cod',
                'groups' => [[
                    'restaurant_id' => $brand['branch_b_id'],
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $itemBId, 'quantity' => 1]],
                ]],
            ])
            ->assertStatus(422);

        $this->actingAs($staffB)
            ->postJson('/api/customer/checkout', [
                'idempotency_key' => 'mb-self-stfa-'.random_int(10000, 99999),
                'payment_method' => 'cod',
                'groups' => [[
                    'restaurant_id' => $brand['root_id'],
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $itemRootId, 'quantity' => 1]],
                ]],
            ])
            ->assertStatus(201);

        // 3. Order-handler notifications for Branch B go to owner + Branch B staff ONLY (not Main Branch staff).
        $notificationService = app(NotificationService::class);
        $recipientsB = $notificationService->resolveRestaurantOrderHandlerUserIds($brand['branch_b_id']);
        $this->assertContains($owner->user_id, $recipientsB);
        $this->assertContains($staffB->user_id, $recipientsB);
        $this->assertNotContains($staffRoot->user_id, $recipientsB);

        // 4. ProfileChangeRequestService propagates brand-level fields across all branches in one transaction.
        $changeService = app(ProfileChangeRequestService::class);
        $created = $changeService->submitRestaurantRequest(
            $owner,
            ['restaurant_name' => 'Notify Cafe Rebranded', 'ownership_structure' => 'corporation'],
            [],
            $brand['root_id'],
            Request::create('/api/restaurant/profile/change-requests', 'POST'),
        );

        $changeService->decideChangeRequest(
            (int) $created['request_id'],
            'approve',
            'Approved rebrand',
            $admin,
            Request::create('/api/admin/change-requests/'.$created['request_id'].'/decide', 'POST'),
        );

        $rootAfter = DB::table('restaurants')->where('restaurant_id', $brand['root_id'])->first();
        $branchBAfter = DB::table('restaurants')->where('restaurant_id', $brand['branch_b_id'])->first();
        $this->assertSame('Notify Cafe Rebranded', $rootAfter->restaurant_name);
        $this->assertSame('Notify Cafe Rebranded', $branchBAfter->restaurant_name);
        $this->assertSame('corporation', $branchBAfter->ownership_structure);
    }
}
