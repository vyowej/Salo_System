<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\RestaurantBranchService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MultiBranchStaffTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $prefix): User
    {
        return User::create([
            'username' => "{$prefix}_" . random_int(10000, 99999),
            'first_name' => ucfirst($prefix),
            'last_name' => 'Staff',
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
            'restaurant_name' => 'Salo Kitchen',
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
            'restaurant_name' => 'Salo Kitchen',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234568',
            'business_email' => $owner->email,
            'branch_name' => 'Makati',
            'address_id' => $addressService->createAddress([
                'province' => 'Metro Manila',
                'city' => 'Makati',
                'barangay' => 'Bel-Air',
                'street' => '202 Ayala Ave',
            ]),
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'restaurant_status' => 'active',
        ]);

        return [$rootId, $siblingId];
    }

    public function test_invite_same_user_to_two_branches_duplicate_422_owner_blocked_and_notifications_include_branch(): void
    {
        $owner = $this->createUser('mbown');
        $coOwner = $this->createUser('mbcoown');
        $candidate = $this->createUser('mbcand');
        [$rootId, $siblingId] = $this->createBrandWithTwoBranches($owner);

        // Add co-owner to root + sibling
        DB::table('restaurant_owners')->insert([
            ['restaurant_id' => $rootId, 'user_id' => $coOwner->user_id, 'joined_at' => now()],
            ['restaurant_id' => $siblingId, 'user_id' => $coOwner->user_id, 'joined_at' => now()],
        ]);

        // Owner of business cannot be invited as staff on any branch
        $this->actingAs($owner)->postJson('/api/restaurant/staff/invitations', [
            'restaurant_id' => $siblingId,
            'username' => $coOwner->username,
            'staff_position' => 'Manager',
        ])->assertStatus(422);

        // Invite candidate to root as Manager
        $this->actingAs($owner)->postJson('/api/restaurant/staff/invitations', [
            'restaurant_id' => $rootId,
            'username' => $candidate->username,
            'staff_position' => 'Manager',
        ])->assertOk();

        // Duplicate invite on same branch -> 422
        $this->actingAs($owner)->postJson('/api/restaurant/staff/invitations', [
            'restaurant_id' => $rootId,
            'username' => $candidate->username,
            'staff_position' => 'Order Handler',
        ])->assertStatus(422);

        // Invite same candidate to sibling branch as Order Handler -> OK
        $this->actingAs($owner)->postJson('/api/restaurant/staff/invitations', [
            'restaurant_id' => $siblingId,
            'username' => $candidate->username,
            'staff_position' => 'Order Handler',
        ])->assertOk();

        // Notification text includes branch display name
        $notifTitles = DB::table('notifications')
            ->where('user_id', $candidate->user_id)
            ->pluck('title')
            ->all();
        $this->assertContains('Staff invitation from Salo Kitchen — Main', $notifTitles);
        $this->assertContains('Staff invitation from Salo Kitchen — Makati', $notifTitles);

        // Invitee inbox shows display_name per branch
        $inbox = $this->actingAs($candidate)->getJson('/api/account/staff-invitations')->assertOk();
        $invitations = $inbox->json('data.invitations');
        $this->assertCount(2, $invitations);
        $displayNames = array_column($invitations, 'display_name');
        $this->assertContains('Salo Kitchen — Main', $displayNames);
        $this->assertContains('Salo Kitchen — Makati', $displayNames);

        // Accept root invitation, decline sibling invitation
        $rootInvite = collect($invitations)->firstWhere('restaurant_id', $rootId);
        $siblingInvite = collect($invitations)->firstWhere('restaurant_id', $siblingId);

        $this->actingAs($candidate)->postJson("/api/account/staff-invitations/{$rootInvite['staff_id']}/accept")->assertOk();
        $this->actingAs($candidate)->postJson("/api/account/staff-invitations/{$siblingInvite['staff_id']}/decline")->assertOk();

        // Only root assignment is active in /api/auth/me
        $me = $this->actingAs($candidate)->getJson('/api/auth/me')->assertOk();
        $assignments = $me->json('data.user.restaurant_staff_assignments');
        $this->assertCount(1, $assignments);
        $this->assertSame($rootId, $assignments[0]['restaurant_id']);
        $this->assertSame('Manager', $assignments[0]['staff_position']);
        $this->assertSame('Salo Kitchen — Main', $assignments[0]['display_name']);
    }

    public function test_sibling_branch_isolation_all_branches_read_update_remove_and_guards(): void
    {
        $owner = $this->createUser('isoown');
        $staffA = $this->createUser('isosta');
        $staffB = $this->createUser('isostb');
        $outsider = $this->createUser('isoout');
        [$rootId, $siblingId] = $this->createBrandWithTwoBranches($owner);

        // Invite + activate staffA on root (Manager), staffB on sibling (Order Handler)
        $this->actingAs($owner)->postJson('/api/restaurant/staff/invitations', [
            'restaurant_id' => $rootId,
            'username' => $staffA->username,
            'staff_position' => 'Manager',
        ])->assertOk();
        $staffAId = (int) DB::table('restaurant_staff')->where('user_id', $staffA->user_id)->value('staff_id');
        $this->actingAs($staffA)->postJson("/api/account/staff-invitations/{$staffAId}/accept")->assertOk();

        $this->actingAs($owner)->postJson('/api/restaurant/staff/invitations', [
            'restaurant_id' => $siblingId,
            'username' => $staffB->username,
            'staff_position' => 'Order Handler',
        ])->assertOk();
        $staffBId = (int) DB::table('restaurant_staff')->where('user_id', $staffB->user_id)->value('staff_id');

        // Manager & outsider cannot invite, list, update, or remove staff (403)
        $this->actingAs($staffA)->getJson('/api/restaurant/staff', ['X-Restaurant-Id' => (string) $rootId])->assertStatus(403);
        $this->actingAs($staffA)->getJson('/api/restaurant/staff?all_branches=1', ['X-Restaurant-Id' => (string) $rootId])->assertStatus(403);
        $this->actingAs($staffA)->postJson('/api/restaurant/staff/invitations', [
            'restaurant_id' => $rootId,
            'username' => $outsider->username,
            'staff_position' => 'Order Handler',
        ])->assertStatus(403);
        $this->actingAs($outsider)->getJson('/api/restaurant/staff', ['X-Restaurant-Id' => (string) $rootId])->assertStatus(403);

        // Selected-branch list returns only that branch's staff
        $rootList = $this->actingAs($owner)->getJson('/api/restaurant/staff', ['X-Restaurant-Id' => (string) $rootId])->assertOk();
        $this->assertCount(1, $rootList->json('data.staff'));
        $this->assertSame($staffAId, $rootList->json('data.staff.0.staff_id'));

        // Owner all_branches=1 returns both branches with branch_name and display_name
        $allList = $this->actingAs($owner)->getJson('/api/restaurant/staff?all_branches=1', ['X-Restaurant-Id' => (string) $rootId])->assertOk();
        $this->assertTrue($allList->json('data.all_branches'));
        $this->assertCount(2, $allList->json('data.staff'));
        $this->assertContains('Makati', array_column($allList->json('data.staff'), 'branch_name'));

        // Sibling isolation: owner targeting root via X-Restaurant-Id cannot cancel/update/remove sibling's staffBId (403)
        $this->actingAs($owner)->postJson("/api/restaurant/staff/invitations/{$staffBId}/cancel", [], ['X-Restaurant-Id' => (string) $rootId])->assertStatus(403);
        $this->actingAs($owner)->patchJson("/api/restaurant/staff/{$staffBId}/position", ['staff_position' => 'Menu Manager'], ['X-Restaurant-Id' => (string) $rootId])->assertStatus(403);
        $this->actingAs($owner)->deleteJson("/api/restaurant/staff/{$staffAId}", [], ['X-Restaurant-Id' => (string) $siblingId])->assertStatus(403);

        // Valid cancel on sibling
        $this->actingAs($owner)->postJson("/api/restaurant/staff/invitations/{$staffBId}/cancel", [], ['X-Restaurant-Id' => (string) $siblingId])->assertOk();

        // Valid update position & remove on root
        $updated = $this->actingAs($owner)->patchJson("/api/restaurant/staff/{$staffAId}/position", [
            'staff_position' => 'Menu Manager',
        ], ['X-Restaurant-Id' => (string) $rootId])->assertOk();
        $this->assertSame('Menu Manager', $updated->json('data.staff_position'));

        $this->actingAs($owner)->deleteJson("/api/restaurant/staff/{$staffAId}", [], ['X-Restaurant-Id' => (string) $rootId])->assertOk();
        $this->assertSame('inactive', DB::table('restaurant_staff')->where('staff_id', $staffAId)->value('staff_status'));
    }

    public function test_deactivated_branch_preserves_staff_row_denies_operational_access_and_marks_status_in_auth_me(): void
    {
        $owner = $this->createUser('deactown');
        $staff = $this->createUser('deactst');
        [$rootId, $siblingId] = $this->createBrandWithTwoBranches($owner);

        // Assign staff to both branches as Order Handler
        foreach ([$rootId, $siblingId] as $branchId) {
            DB::table('restaurant_staff')->insert([
                'restaurant_id' => $branchId,
                'user_id' => $staff->user_id,
                'invited_by' => $owner->user_id,
                'staff_position' => 'Order Handler',
                'staff_status' => 'active',
                'invited_at' => now(),
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // Deactivate sibling branch
        DB::table('restaurants')->where('restaurant_id', $siblingId)->update([
            'restaurant_status' => 'inactive',
            'updated_at' => now(),
        ]);

        // Staff rows are preserved in DB
        $this->assertSame(2, DB::table('restaurant_staff')->where('user_id', $staff->user_id)->where('staff_status', 'active')->count());

        // Operational access on deactivated branch is 403; active branch remains 200
        $this->actingAs($staff)->getJson('/api/restaurant/orders', ['X-Restaurant-Id' => (string) $siblingId])->assertStatus(403);
        $this->actingAs($staff)->getJson('/api/restaurant/orders', ['X-Restaurant-Id' => (string) $rootId])->assertOk();

        // /api/auth/me exposes restaurant_status on assignments so frontend switcher lands on active branch
        $me = $this->actingAs($staff)->getJson('/api/auth/me')->assertOk();
        $assignments = $me->json('data.user.restaurant_staff_assignments');
        $siblingAssign = collect($assignments)->firstWhere('restaurant_id', $siblingId);
        $this->assertSame('inactive', $siblingAssign['restaurant_status']);
    }
}
