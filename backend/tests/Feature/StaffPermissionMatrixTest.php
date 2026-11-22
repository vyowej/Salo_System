<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\RestaurantBranchService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class StaffPermissionMatrixTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $prefix): User
    {
        return User::create([
            'username' => "{$prefix}_" . random_int(10000, 99999),
            'first_name' => ucfirst($prefix),
            'last_name' => 'Matrix',
            'email' => "{$prefix}_" . random_int(10000, 99999) . '@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);
    }

    private function createBrandWithTwoBranches(User $owner): array
    {
        $addressService = app(\App\Support\AddressService::class);
        $branchService = app(RestaurantBranchService::class);

        $rootId = $branchService->createRootRestaurant([
            'restaurant_name' => 'Matrix Bistro',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234567',
            'business_email' => $owner->email,
            'address_id' => $addressService->createAddress([
                'province' => 'Metro Manila',
                'city' => 'Quezon City',
                'barangay' => 'Diliman',
                'street' => '101 Main St',
            ]),
            'branch_name' => 'Main',
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'restaurant_status' => 'active',
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $rootId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        $siblingId = $branchService->createChildBranch($rootId, [
            'restaurant_name' => 'Matrix Bistro',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234568',
            'business_email' => $owner->email,
            'branch_name' => 'BGC',
            'address_id' => $addressService->createAddress([
                'province' => 'Metro Manila',
                'city' => 'Taguig',
                'barangay' => 'Fort Bonifacio',
                'street' => '202 High St',
            ]),
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'restaurant_status' => 'active',
        ]);

        return [$rootId, $siblingId];
    }

    private function assignStaff(int $restaurantId, User $staff, User $inviter, string $position, string $status = 'active'): int
    {
        return (int) DB::table('restaurant_staff')->insertGetId([
            'restaurant_id' => $restaurantId,
            'user_id' => $staff->user_id,
            'invited_by' => $inviter->user_id,
            'staff_position' => $position,
            'staff_status' => $status,
            'invited_at' => now(),
            'expires_at' => now()->addDays(7),
            'responded_at' => $status === 'invited' ? null : now(),
            'joined_at' => $status === 'active' ? now() : null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_config_position_permissions_is_single_source_of_truth_for_derived_lists(): void
    {
        $map = config('salo.staff.position_permissions');
        $this->assertIsArray($map);
        $this->assertSame(array_keys($map), config('salo.staff.positions'));
        $this->assertSame(['Manager', 'Order Handler', 'Order Staff'], config('salo.orders.handler_positions'));
        $this->assertSame(['Manager', 'Inventory Manager'], config('salo.inventory.manager_positions'));
        $this->assertSame(['Manager'], config('salo.menu.publisher_positions'));

        $this->assertContains('reservations.view', $map['Reservation Handler']);
        $this->assertContains('tables.view', $map['Reservation Staff']);
        $this->assertContains('menu.view', $map['Inventory Manager']);
        $this->assertNotContains('menu.categories.manage', $map['Inventory Manager']);
        $this->assertNotContains('menu.publish', $map['Menu Manager']);
    }

    public function test_auth_me_returns_canonical_permissions_and_backward_compat_flags(): void
    {
        $owner = $this->createUser('ownme');
        [$rootId, $siblingId] = $this->createBrandWithTwoBranches($owner);

        $menuMgr = $this->createUser('menumgr');
        $this->assignStaff($rootId, $menuMgr, $owner, 'Menu Manager');

        $resHandler = $this->createUser('reshandler');
        $this->assignStaff($rootId, $resHandler, $owner, 'Reservation Handler');

        $ownerResp = $this->actingAs($owner)->getJson('/api/auth/me')->assertOk();
        $ownerPerms = $ownerResp->json('data.user.restaurant_ownerships.0.permissions');
        $this->assertIsArray($ownerPerms);
        $this->assertContains('business.profile.edit', $ownerPerms);
        $this->assertContains('menu.publish', $ownerPerms);
        $this->assertContains('team.invite', $ownerPerms);

        $menuResp = $this->actingAs($menuMgr)->getJson('/api/auth/me')->assertOk();
        $assignment = $menuResp->json('data.user.restaurant_staff_assignments.0');
        $this->assertSame(false, $assignment['can_handle_orders']);
        $this->assertSame(false, $assignment['can_publish_menu']);
        $this->assertContains('menu.categories.manage', $assignment['permissions']);
        $this->assertContains('menu.items.create', $assignment['permissions']);
        $this->assertNotContains('menu.publish', $assignment['permissions']);
        $this->assertNotContains('orders.view', $assignment['permissions']);

        $resResp = $this->actingAs($resHandler)->getJson('/api/auth/me')->assertOk();
        $resAssignment = $resResp->json('data.user.restaurant_staff_assignments.0');
        $this->assertContains('reservations.view', $resAssignment['permissions']);
        $this->assertContains('tables.view', $resAssignment['permissions']);
        $this->assertNotContains('menu.view', $resAssignment['permissions']);
    }

    public function test_permission_matrix_across_positions_branches_and_outsiders(): void
    {
        $owner = $this->createUser('matown');
        [$rootId, $siblingId] = $this->createBrandWithTwoBranches($owner);

        $manager = $this->createUser('matmgr');
        $menuManager = $this->createUser('matmenu');
        $orderHandler = $this->createUser('matord');
        $inventoryManager = $this->createUser('matinv');
        $reservationHandler = $this->createUser('matres');
        $outsider = $this->createUser('matout');

        $this->assignStaff($rootId, $manager, $owner, 'Manager');
        $this->assignStaff($rootId, $menuManager, $owner, 'Menu Manager');
        $this->assignStaff($rootId, $orderHandler, $owner, 'Order Handler');
        $this->assignStaff($rootId, $inventoryManager, $owner, 'Inventory Manager');
        $this->assignStaff($rootId, $reservationHandler, $owner, 'Reservation Handler');

        $headersRoot = ['X-Restaurant-Id' => (string) $rootId];
        $headersSibling = ['X-Restaurant-Id' => (string) $siblingId];

        // 1. Owner: permitted on all endpoints on both branches
        $this->actingAs($owner)->getJson('/api/restaurant/profile', $headersRoot)->assertOk();
        $this->actingAs($owner)->getJson('/api/restaurant/staff', $headersSibling)->assertOk();
        $this->actingAs($owner)->postJson('/api/restaurant/menu/categories', ['category_name' => 'Owner Cat'], $headersRoot)->assertStatus(201);
        $this->actingAs($owner)->getJson('/api/restaurant/menu/publish-status', $headersRoot)->assertOk();
        $this->actingAs($owner)->getJson('/api/restaurant/orders', $headersRoot)->assertOk();
        $this->actingAs($owner)->getJson('/api/restaurant/inventory/config', $headersRoot)->assertOk();

        // 2. Manager on assigned root: menu CRUD, publish, orders, inventory OK; owner-only endpoints 403; sibling 403
        $this->actingAs($manager)->getJson('/api/restaurant/menu/categories', $headersRoot)->assertOk();
        $this->actingAs($manager)->postJson('/api/restaurant/menu/categories', ['category_name' => 'Manager Cat'], $headersRoot)->assertStatus(201);
        $this->actingAs($manager)->getJson('/api/restaurant/menu/publish-status', $headersRoot)->assertOk();
        $this->actingAs($manager)->getJson('/api/restaurant/orders', $headersRoot)->assertOk();
        $this->actingAs($manager)->getJson('/api/restaurant/inventory/config', $headersRoot)->assertOk();

        $this->actingAs($manager)->getJson('/api/restaurant/profile', $headersRoot)->assertStatus(403);
        $this->actingAs($manager)->getJson('/api/restaurant/operating-hours', $headersRoot)->assertStatus(403);
        $this->actingAs($manager)->getJson('/api/restaurant/staff', $headersRoot)->assertStatus(403);
        $this->actingAs($manager)->getJson('/api/restaurant/change-requests', $headersRoot)->assertStatus(403);
        $this->actingAs($manager)->postJson('/api/restaurant/branches', ['branch_name' => 'Hack'], $headersRoot)->assertStatus(403);
        $this->actingAs($manager)->getJson('/api/restaurant/orders', $headersSibling)->assertStatus(403);

        // 3. Menu Manager on assigned root: menu read & CRUD OK; publish, orders, inventory, owner-only 403; sibling 403
        $this->actingAs($menuManager)->getJson('/api/restaurant/menu/categories', $headersRoot)->assertOk();
        $this->actingAs($menuManager)->getJson('/api/restaurant/menu/items', $headersRoot)->assertOk();
        $this->actingAs($menuManager)->postJson('/api/restaurant/menu/categories', ['category_name' => 'MenuMgr Cat'], $headersRoot)->assertStatus(201);
        $this->actingAs($menuManager)->getJson('/api/restaurant/menu/publish-status', $headersRoot)->assertStatus(403);
        $this->actingAs($menuManager)->postJson('/api/restaurant/menu/publish', [], $headersRoot)->assertStatus(403);
        $this->actingAs($menuManager)->getJson('/api/restaurant/orders', $headersRoot)->assertStatus(403);
        $this->actingAs($menuManager)->getJson('/api/restaurant/inventory/config', $headersRoot)->assertStatus(403);
        $this->actingAs($menuManager)->getJson('/api/restaurant/profile', $headersRoot)->assertStatus(403);
        $this->actingAs($menuManager)->getJson('/api/restaurant/menu/categories', $headersSibling)->assertStatus(403);

        // 4. Order Handler: orders OK; menu read/CRUD, publish, inventory, owner-only 403; sibling 403
        $this->actingAs($orderHandler)->getJson('/api/restaurant/orders', $headersRoot)->assertOk();
        $this->actingAs($orderHandler)->getJson('/api/restaurant/menu/categories', $headersRoot)->assertStatus(403);
        $this->actingAs($orderHandler)->postJson('/api/restaurant/menu/categories', ['category_name' => 'Ord Cat'], $headersRoot)->assertStatus(403);
        $this->actingAs($orderHandler)->getJson('/api/restaurant/menu/publish-status', $headersRoot)->assertStatus(403);
        $this->actingAs($orderHandler)->getJson('/api/restaurant/inventory/config', $headersRoot)->assertStatus(403);
        $this->actingAs($orderHandler)->getJson('/api/restaurant/orders', $headersSibling)->assertStatus(403);

        // 5. Inventory Manager: inventory + menu read OK; menu write, publish, orders, owner-only 403; sibling 403
        $this->actingAs($inventoryManager)->getJson('/api/restaurant/inventory/config', $headersRoot)->assertOk();
        $this->actingAs($inventoryManager)->getJson('/api/restaurant/menu/categories', $headersRoot)->assertOk();
        $this->actingAs($inventoryManager)->getJson('/api/restaurant/menu/items', $headersRoot)->assertOk();
        $this->actingAs($inventoryManager)->postJson('/api/restaurant/menu/categories', ['category_name' => 'Inv Cat'], $headersRoot)->assertStatus(403);
        $this->actingAs($inventoryManager)->getJson('/api/restaurant/menu/publish-status', $headersRoot)->assertStatus(403);
        $this->actingAs($inventoryManager)->getJson('/api/restaurant/orders', $headersRoot)->assertStatus(403);
        $this->actingAs($inventoryManager)->getJson('/api/restaurant/inventory/config', $headersSibling)->assertStatus(403);

        // 6. Reservation Handler: denied on all current operational endpoints (403)
        $this->actingAs($reservationHandler)->getJson('/api/restaurant/orders', $headersRoot)->assertStatus(403);
        $this->actingAs($reservationHandler)->getJson('/api/restaurant/menu/categories', $headersRoot)->assertStatus(403);
        $this->actingAs($reservationHandler)->getJson('/api/restaurant/inventory/config', $headersRoot)->assertStatus(403);
        $this->actingAs($reservationHandler)->getJson('/api/restaurant/profile', $headersRoot)->assertStatus(403);

        // 7. Outsider: 403 everywhere
        $this->actingAs($outsider)->getJson('/api/restaurant/orders', $headersRoot)->assertStatus(403);
        $this->actingAs($outsider)->getJson('/api/restaurant/menu/categories', $headersRoot)->assertStatus(403);
        $this->actingAs($outsider)->getJson('/api/restaurant/inventory/config', $headersRoot)->assertStatus(403);
    }

    public function test_position_changes_take_effect_on_next_request_and_inactive_or_invited_staff_are_denied(): void
    {
        $owner = $this->createUser('dynown');
        [$rootId] = $this->createBrandWithTwoBranches($owner);

        $staff = $this->createUser('dynstaff');
        $staffId = $this->assignStaff($rootId, $staff, $owner, 'Order Handler', 'active');
        $headers = ['X-Restaurant-Id' => (string) $rootId];

        // Initially Order Handler: orders OK, menu CRUD 403
        $this->actingAs($staff)->getJson('/api/restaurant/orders', $headers)->assertOk();
        $this->actingAs($staff)->postJson('/api/restaurant/menu/categories', ['category_name' => 'Before Promote'], $headers)->assertStatus(403);

        // Change position in DB -> Menu Manager takes effect on next request
        DB::table('restaurant_staff')->where('staff_id', $staffId)->update([
            'staff_position' => 'Menu Manager',
            'updated_at' => now(),
        ]);

        $this->actingAs($staff)->postJson('/api/restaurant/menu/categories', ['category_name' => 'After Promote'], $headers)->assertStatus(201);
        $this->actingAs($staff)->getJson('/api/restaurant/orders', $headers)->assertStatus(403);

        // Mark inactive -> 403 immediately
        DB::table('restaurant_staff')->where('staff_id', $staffId)->update([
            'staff_status' => 'inactive',
            'updated_at' => now(),
        ]);
        $this->actingAs($staff)->getJson('/api/restaurant/menu/categories', $headers)->assertStatus(403);

        // Invited (not accepted) staff -> 403
        $invited = $this->createUser('dyninv');
        $this->assignStaff($rootId, $invited, $owner, 'Manager', 'invited');
        $this->actingAs($invited)->getJson('/api/restaurant/orders', $headers)->assertStatus(403);
        $this->actingAs($invited)->getJson('/api/restaurant/menu/categories', $headers)->assertStatus(403);
    }
}
