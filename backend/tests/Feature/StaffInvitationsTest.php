<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class StaffInvitationsTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'inv', string $firstName = 'Test'): User
    {
        return User::create([
            'username' => "{$prefix}_" . random_int(10000, 99999),
            'first_name' => $firstName,
            'last_name' => 'User',
            'phone_number' => '+639171234567',
            'email' => "{$prefix}_" . random_int(10000, 99999) . '@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createRestaurant(User $owner, string $status = 'active', string $name = 'Davao Grill'): int
    {
        $addrId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '55 Maginhawa St',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => $name,
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'rest_' . random_int(1000, 9999) . '@example.com',
            'contact_phone' => '09171234567',
            'address_id' => $addrId,
            'restaurant_status' => $status,
            'accepting_orders' => 1,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        return $restaurantId;
    }

    public function test_valid_invite_accept_grants_staff_role_and_notifies_both_sides(): void
    {
        $owner = $this->createUser('customer', 'own', 'Sofia');
        $invitee = $this->createUser('customer', 'emp', 'Miguel');
        $restaurantId = $this->createRestaurant($owner, 'active', 'Iloilo Kitchen');

        $this->assertFalse($invitee->hasDerivedRole('staff'));

        $this->actingAs($owner)
            ->postJson('/api/restaurant/staff/invitations', [
                'email' => $invitee->email,
                'staff_position' => 'Order Handler',
                'note' => 'Welcome aboard!',
            ])
            ->assertOk()
            ->assertJsonPath('success', true);

        // Staff role is NOT added before accept
        $this->assertFalse($invitee->fresh()->hasDerivedRole('staff'));

        // Invitee received notification
        $this->assertSame(1, DB::table('notifications')->where('user_id', $invitee->user_id)->where('workspace', 'customer')->where('type', 'staff_invitation_received')->count());

        // Invitee lists invitations
        $listRes = $this->actingAs($invitee)->getJson('/api/account/staff-invitations')->assertOk();
        $invitations = $listRes->json('data.invitations');
        $this->assertCount(1, $invitations);
        $this->assertSame('pending', $invitations[0]['status']);
        $staffId = $invitations[0]['staff_id'];

        // Accept invitation
        $this->actingAs($invitee)
            ->postJson("/api/account/staff-invitations/{$staffId}/accept")
            ->assertOk()
            ->assertJsonPath('data.status', 'accepted');

        // Staff role is now active and Order Handler can view orders
        $this->assertTrue($invitee->fresh()->hasDerivedRole('staff'));
        $this->actingAs($invitee)->getJson('/api/restaurant/orders')->assertOk();

        // Owner notified in restaurant workspace
        $this->assertSame(1, DB::table('notifications')->where('user_id', $owner->user_id)->where('workspace', 'restaurant')->where('type', 'staff_invitation_accepted')->count());

        // Double-accept returns 409
        $this->actingAs($invitee)
            ->postJson("/api/account/staff-invitations/{$staffId}/accept")
            ->assertStatus(409);
    }

    public function test_non_handler_staff_position_does_not_grant_order_handling_access(): void
    {
        $owner = $this->createUser('customer', 'ownnh');
        $invitee = $this->createUser('customer', 'empnh');
        $this->createRestaurant($owner, 'active');

        $this->actingAs($owner)->postJson('/api/restaurant/staff/invitations', [
            'username' => $invitee->username,
            'staff_position' => 'Inventory Manager',
        ])->assertOk();

        $staffId = (int) DB::table('restaurant_staff')->where('user_id', $invitee->user_id)->value('staff_id');
        $this->actingAs($invitee)->postJson("/api/account/staff-invitations/{$staffId}/accept")->assertOk();

        $this->assertTrue($invitee->fresh()->hasDerivedRole('staff'));
        $this->actingAs($invitee)->getJson('/api/restaurant/orders')->assertStatus(403);
    }

    public function test_self_invite_duplicate_unknown_user_and_authorization_guards(): void
    {
        $owner = $this->createUser('customer', 'owng');
        $otherOwner = $this->createUser('customer', 'owno');
        $customer = $this->createUser('customer', 'custg');
        $invitee = $this->createUser('customer', 'empg');

        $restaurantId = $this->createRestaurant($owner, 'active');
        $this->createRestaurant($otherOwner, 'active', 'Other Rest');

        // Self-invite blocked
        $this->actingAs($owner)->postJson('/api/restaurant/staff/invitations', [
            'email' => $owner->email,
            'staff_position' => 'Manager',
        ])->assertStatus(422);

        // Wrong role (customer) -> 403
        $this->actingAs($customer)->postJson('/api/restaurant/staff/invitations', [
            'email' => $invitee->email,
            'staff_position' => 'Manager',
        ])->assertStatus(403);

        // Wrong restaurant -> 403
        $this->actingAs($otherOwner)->postJson('/api/restaurant/staff/invitations', [
            'restaurant_id' => $restaurantId,
            'email' => $invitee->email,
            'staff_position' => 'Manager',
        ])->assertStatus(403);

        // Unknown user -> neutral 200 response, no rows created
        $this->actingAs($owner)->postJson('/api/restaurant/staff/invitations', [
            'email' => 'nonexistent_' . random_int(10000, 99999) . '@example.com',
            'staff_position' => 'Manager',
        ])->assertOk()->assertJsonPath('success', true);
        $this->assertSame(0, DB::table('restaurant_staff')->where('restaurant_id', $restaurantId)->count());

        // Invalid position -> 422
        $this->actingAs($owner)->postJson('/api/restaurant/staff/invitations', [
            'email' => $invitee->email,
            'staff_position' => 'Arbitrary Free Text',
        ])->assertStatus(422);

        // Valid invite then duplicate -> 409
        $this->actingAs($owner)->postJson('/api/restaurant/staff/invitations', [
            'email' => $invitee->email,
            'staff_position' => 'Manager',
        ])->assertOk();

        $this->actingAs($owner)->postJson('/api/restaurant/staff/invitations', [
            'email' => $invitee->email,
            'staff_position' => 'Order Handler',
        ])->assertStatus(409);

        // Inactive restaurant blocked -> 403
        $inactiveOwner = $this->createUser('customer', 'owni');
        $this->createRestaurant($inactiveOwner, 'pending', 'Pending Rest');
        $this->actingAs($inactiveOwner)->postJson('/api/restaurant/staff/invitations', [
            'email' => $customer->email,
            'staff_position' => 'Manager',
        ])->assertStatus(403);
    }

    public function test_decline_cancel_wrong_user_and_expiry_rules(): void
    {
        $owner = $this->createUser('customer', 'ownd');
        $invitee = $this->createUser('customer', 'empd');
        $stranger = $this->createUser('customer', 'strd');
        $restaurantId = $this->createRestaurant($owner, 'active');

        // Invite -> Decline
        $this->actingAs($owner)->postJson('/api/restaurant/staff/invitations', [
            'username' => $invitee->username,
            'staff_position' => 'Order Staff',
        ])->assertOk();
        $staffId = (int) DB::table('restaurant_staff')->where('user_id', $invitee->user_id)->value('staff_id');

        // Wrong user cannot accept or decline -> 404
        $this->actingAs($stranger)->postJson("/api/account/staff-invitations/{$staffId}/accept")->assertStatus(404);
        $this->actingAs($stranger)->postJson("/api/account/staff-invitations/{$staffId}/decline")->assertStatus(404);

        // Invitee declines
        $this->actingAs($invitee)->postJson("/api/account/staff-invitations/{$staffId}/decline")
            ->assertOk()
            ->assertJsonPath('data.status', 'declined');
        $this->assertFalse($invitee->fresh()->hasDerivedRole('staff'));
        $this->assertSame(1, DB::table('notifications')->where('user_id', $owner->user_id)->where('type', 'staff_invitation_declined')->count());

        // Re-invite -> Cancel by owner
        $this->actingAs($owner)->postJson('/api/restaurant/staff/invitations', [
            'username' => $invitee->username,
            'staff_position' => 'Order Staff',
        ])->assertOk();

        // Stranger cannot cancel -> 403
        $this->actingAs($stranger)->postJson("/api/restaurant/staff/invitations/{$staffId}/cancel")->assertStatus(403);

        // Owner cancels
        $this->actingAs($owner)->postJson("/api/restaurant/staff/invitations/{$staffId}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
        $this->assertSame(1, DB::table('notifications')->where('user_id', $invitee->user_id)->where('type', 'staff_invitation_cancelled')->count());

        // Re-invite and simulate expiry -> accept returns 409 and marks expired
        $this->actingAs($owner)->postJson('/api/restaurant/staff/invitations', [
            'username' => $invitee->username,
            'staff_position' => 'Order Staff',
        ])->assertOk();

        DB::table('restaurant_staff')
            ->where('staff_id', $staffId)
            ->update(['expires_at' => now()->subMinute()]);

        $this->actingAs($invitee)->postJson("/api/account/staff-invitations/{$staffId}/accept")->assertStatus(409);
        $this->assertSame('expired', DB::table('restaurant_staff')->where('staff_id', $staffId)->value('staff_status'));
    }

    public function test_mixed_case_email_and_username_lookup_and_conditional_expiry_update_query_count(): void
    {
        $owner = $this->createUser('customer', 'ownmc');
        $inviteeByEmail = $this->createUser('customer', 'empmce');
        $inviteeByUser = $this->createUser('customer', 'empmcu');
        $this->createRestaurant($owner, 'active', 'Case Insensitive Bistro');

        // Invite using uppercase email and uppercase username after dropping LOWER()
        $this->actingAs($owner)->postJson('/api/restaurant/staff/invitations', [
            'email' => strtoupper($inviteeByEmail->email),
            'staff_position' => 'Order Handler',
        ])->assertOk();

        $this->actingAs($owner)->postJson('/api/restaurant/staff/invitations', [
            'username' => strtoupper($inviteeByUser->username),
            'staff_position' => 'Manager',
        ])->assertOk();

        // When no invitations are overdue, GET /api/account/staff-invitations and GET /api/restaurant/staff must NOT run an UPDATE query
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($inviteeByEmail)->getJson('/api/account/staff-invitations')
            ->assertOk()
            ->assertJsonCount(1, 'data.invitations')
            ->assertJsonPath('data.invitations.0.status', 'pending');
        $queries = DB::getQueryLog();
        $this->assertLessThanOrEqual(3, count($queries), 'GET /api/account/staff-invitations must run at most 3 queries when no invitations are overdue.');
        foreach ($queries as $q) {
            $this->assertStringNotContainsStringIgnoringCase('update', $q['query']);
        }

        DB::flushQueryLog();
        $this->actingAs($owner)->getJson('/api/restaurant/staff')
            ->assertOk()
            ->assertJsonCount(2, 'data.staff');
        $ownerQueries = DB::getQueryLog();
        $this->assertLessThanOrEqual(7, count($ownerQueries), 'GET /api/restaurant/staff must run at most 7 queries when no invitations are overdue.');
        foreach ($ownerQueries as $q) {
            $this->assertStringNotContainsStringIgnoringCase('update', $q['query']);
        }

        // Now mark inviteeByEmail's invitation overdue and verify GET /api/account/staff-invitations expires it on read
        $staffId = (int) DB::table('restaurant_staff')->where('user_id', $inviteeByEmail->user_id)->value('staff_id');
        DB::table('restaurant_staff')->where('staff_id', $staffId)->update(['expires_at' => now()->subSeconds(5)]);

        $this->actingAs($inviteeByEmail)->getJson('/api/account/staff-invitations')
            ->assertOk()
            ->assertJsonPath('data.invitations.0.status', 'expired');
        $this->assertSame('expired', DB::table('restaurant_staff')->where('staff_id', $staffId)->value('staff_status'));
    }
}
