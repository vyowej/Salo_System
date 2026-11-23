<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminManagementTest extends TestCase
{
    use DatabaseTransactions;

    public function test_admin_can_manage_users_and_non_admin_is_forbidden(): void
    {
        $customer = User::forceCreate([
            'username' => 'cust_mgmt_'.random_int(100, 999),
            'first_name' => 'Plain',
            'last_name' => 'Customer',
            'email' => 'plaincust@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $admin = User::forceCreate([
            'username' => 'admin_mgmt_'.random_int(100, 999),
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'superadmin@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'admin',
            'account_status' => 'active',
        ]);

        $this->actingAs($customer)->getJson('/api/admin/users')->assertStatus(403);

        $createRes = $this->actingAs($admin)->postJson('/api/admin/users', [
            'username' => 'new_staff_'.random_int(100, 999),
            'first_name' => 'New',
            'last_name' => 'Account',
            'email' => 'newaccount@example.com',
            'password' => 'SecretPass123!',
            'user_role' => 'customer',
            'account_status' => 'active',
        ])->assertStatus(201);

        $createdId = $createRes->json('data.user.user_id');

        $this->actingAs($admin)->patchJson("/api/admin/users/{$createdId}", [
            'account_status' => 'suspended',
            'reason' => 'Policy review',
        ])->assertOk()
            ->assertJsonPath('data.user.account_status', 'suspended');

        $this->actingAs($admin)->getJson('/api/admin/audit-logs?entity_type=users')
            ->assertOk()
            ->assertJsonFragment(['action' => 'admin_user_updated']);
    }

    public function test_admin_can_list_filter_and_update_restaurants_and_riders(): void
    {
        $admin = User::forceCreate([
            'username' => 'admin_dir_'.random_int(100, 999),
            'first_name' => 'Dir',
            'last_name' => 'Admin',
            'email' => 'diradmin@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'admin',
            'account_status' => 'active',
        ]);

        $owner = User::forceCreate([
            'username' => 'owner_dir_'.random_int(100, 999),
            'first_name' => 'Marco',
            'last_name' => 'Reyes',
            'email' => 'marcoreyes@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $riderUser = User::forceCreate([
            'username' => 'rider_dir_'.random_int(100, 999),
            'first_name' => 'Carlo',
            'last_name' => 'Santos',
            'email' => 'carlosantos@example.com',
            'phone_number' => '+639171234567',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $addressId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'South Triangle',
            'street' => '42 Kalayaan Ave',
        ]);
        $barangay = DB::table('barangays')->first();
        $this->assertNotNull($barangay);

        $restaurantId = DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Kanto Grill Test',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '+639179998888',
            'business_email' => 'kantogrill@example.com',
            'address_id' => $addressId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 0,
            'restaurant_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        $riderId = DB::table('riders')->insertGetId([
            'user_id' => $riderUser->user_id,
            'vehicle_type' => 'motorcycle',
            'vehicle_brand' => 'Honda',
            'vehicle_model' => 'Click 125',
            'vehicle_year' => 2023,
            'vehicle_ownership' => 'personally_owned',
            'plate_number' => 'ABC1234',
            'emergency_contact_name' => 'Ana Santos',
            'emergency_contact_relationship' => 'sibling',
            'emergency_contact_phone' => '+639170001111',
            'base_city_id' => $barangay->city_id,
            'preferred_shifts' => 'lunch,dinner',
            'available_days' => 'mon,tue,wed',
            'rider_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($owner)->getJson('/api/admin/restaurants')->assertStatus(403);
        $this->actingAs($riderUser)->getJson('/api/admin/riders')->assertStatus(403);

        $this->actingAs($admin)->getJson('/api/admin/restaurants?search=Kanto%20Grill&status=active')
            ->assertOk()
            ->assertJsonPath('data.items.0.restaurant_name', 'Kanto Grill Test')
            ->assertJsonPath('data.items.0.owner_name', 'Marco Reyes')
            ->assertJsonPath('data.items.0.street', '42 Kalayaan Ave')
            ->assertJsonStructure(['data' => ['items', 'meta' => ['current_page', 'last_page', 'per_page', 'total']]]);

        $this->actingAs($admin)->patchJson("/api/admin/restaurants/{$restaurantId}/status", [
            'status' => 'suspended',
            'reason' => 'Compliance check',
        ])->assertOk()
            ->assertJsonPath('data.restaurant.restaurant_status', 'suspended');

        $this->assertDatabaseHas('restaurants', [
            'restaurant_id' => $restaurantId,
            'restaurant_status' => 'suspended',
        ]);

        $this->actingAs($admin)->getJson('/api/admin/riders?search=Carlo&status=active')
            ->assertOk()
            ->assertJsonPath('data.items.0.first_name', 'Carlo')
            ->assertJsonPath('data.items.0.vehicle_brand', 'Honda')
            ->assertJsonPath('data.items.0.preferred_shifts', 'lunch,dinner')
            ->assertJsonStructure(['data' => ['items', 'meta' => ['current_page', 'last_page', 'per_page', 'total']]]);

        $this->actingAs($admin)->patchJson("/api/admin/riders/{$riderId}/status", [
            'status' => 'suspended',
            'reason' => 'Document renewal',
        ])->assertOk()
            ->assertJsonPath('data.rider.rider_status', 'suspended');

        $this->assertDatabaseHas('riders', [
            'rider_id' => $riderId,
            'rider_status' => 'suspended',
        ]);
    }

    public function test_admin_restaurants_primary_owner_tie_breaking_filter_totals_and_query_count(): void
    {
        $admin = User::forceCreate([
            'username' => 'admin_tie_'.random_int(1000, 9999),
            'first_name' => 'Tie',
            'last_name' => 'Admin',
            'email' => 'admintie_'.random_int(1000, 9999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'admin',
            'account_status' => 'active',
        ]);

        $laterOwner = User::forceCreate([
            'username' => 'owner_later_'.random_int(1000, 9999),
            'first_name' => 'Later',
            'last_name' => 'Owner',
            'email' => 'later_owner@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $primaryOwner = User::forceCreate([
            'username' => 'owner_primary_'.random_int(1000, 9999),
            'first_name' => 'Earliest',
            'last_name' => 'Founder',
            'email' => 'earliest_founder@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $tag = 'TieRest' . random_int(1000, 9999);
        $addressId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Makati City',
            'barangay' => 'Poblacion',
            'street' => '88 Rockwell Dr',
        ]);

        $restId = DB::table('restaurants')->insertGetId([
            'restaurant_name' => "{$tag} Bistro",
            'registered_name' => "{$tag} Holdings Inc",
            'business_type' => 'restaurant',
            'ownership_structure' => 'corporation',
            'contact_phone' => '+639178887777',
            'business_email' => 'bistro@example.com',
            'address_id' => $addressId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'restaurant_status' => 'active',
            'created_at' => '2026-10-15 10:00:00',
            'updated_at' => '2026-10-15 10:00:00',
        ]);

        // Insert later owner first, earliest owner second to verify ORDER BY joined_at ASC tie-breaking
        DB::table('restaurant_owners')->insert([
            [
                'restaurant_id' => $restId,
                'user_id' => $laterOwner->user_id,
                'joined_at' => '2026-05-10 12:00:00',
            ],
            [
                'restaurant_id' => $restId,
                'user_id' => $primaryOwner->user_id,
                'joined_at' => '2026-01-15 08:30:00',
            ],
        ]);

        DB::flushQueryLog();
        DB::enableQueryLog();

        $res = $this->actingAs($admin)
            ->getJson('/api/admin/restaurants?search=' . urlencode($tag) . '&status=active')
            ->assertOk()
            ->assertJsonPath('data.meta.total', 1)
            ->assertJsonPath('data.items.0.restaurant_id', $restId)
            ->assertJsonPath('data.items.0.owner_name', 'Earliest Founder')
            ->assertJsonPath('data.items.0.owner_email', 'earliest_founder@example.com')
            ->assertJsonPath('data.items.0.zone', 'Makati City');

        $this->assertLessThanOrEqual(5, count(DB::getQueryLog()), 'GET /api/admin/restaurants must run at most 5 queries (no correlated subqueries or N+1).');
    }

    public function test_admin_users_riders_and_audit_logs_listing_filters_sorting_and_pagination(): void
    {
        $tag = 'MgmtList' . random_int(1000, 9999);

        $admin = User::forceCreate([
            'username' => "adm_{$tag}",
            'first_name' => 'Admin',
            'last_name' => $tag,
            'email' => "adm_{$tag}@example.com",
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'admin',
            'account_status' => 'active',
        ]);

        $cust = User::forceCreate([
            'username' => "cust_{$tag}",
            'first_name' => 'Customer',
            'last_name' => $tag,
            'email' => "cust_{$tag}@example.com",
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'suspended',
        ]);

        // 1. listUsers: search + role + status + pagination meta
        $this->actingAs($admin)
            ->getJson('/api/admin/users?search=' . urlencode($tag) . '&role=customer&status=suspended&direction=asc&per_page=10')
            ->assertOk()
            ->assertJsonPath('data.meta.total', 1)
            ->assertJsonPath('data.meta.per_page', 10)
            ->assertJsonPath('data.items.0.user_id', $cust->user_id)
            ->assertJsonPath('data.items.0.account_status', 'suspended');

        // 2. listRiders: search by plate_number + status + direction
        $cityId = DB::table('cities')->where('city_name', 'Quezon City')->value('city_id')
            ?? DB::table('cities')->value('city_id');
        $plate = 'PLT-' . random_int(1000, 9999);
        $riderId = (int) DB::table('riders')->insertGetId([
            'user_id' => $cust->user_id,
            'vehicle_type' => 'bicycle',
            'plate_number' => $plate,
            'emergency_contact_name' => 'Emergency',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09170000111',
            'base_city_id' => $cityId,
            'rider_status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($admin)
            ->getJson('/api/admin/riders?search=' . urlencode($plate) . '&status=pending&direction=asc')
            ->assertOk()
            ->assertJsonPath('data.meta.total', 1)
            ->assertJsonPath('data.items.0.rider_id', $riderId)
            ->assertJsonPath('data.items.0.plate_number', $plate);

        // 3. listAuditLogs: default per_page=20, entity_type + search + actor_email
        $this->actingAs($admin)->patchJson("/api/admin/users/{$cust->user_id}", [
            'account_status' => 'active',
            'reason' => "Reactivated {$tag}",
        ])->assertOk();

        $this->actingAs($admin)
            ->getJson('/api/admin/audit-logs?entity_type=users&search=' . urlencode($tag))
            ->assertOk()
            ->assertJsonPath('data.meta.per_page', 20)
            ->assertJsonPath('data.meta.total', 1)
            ->assertJsonPath('data.items.0.action', 'admin_user_updated')
            ->assertJsonPath('data.items.0.actor_email', $admin->email);
    }

    public function test_admin_cannot_demote_or_lock_out_self(): void
    {
        $admin = User::forceCreate([
            'username' => 'self_guard_admin_' . random_int(100, 999),
            'first_name' => 'Self',
            'last_name' => 'Admin',
            'email' => 'selfadmin_' . random_int(100, 999) . '@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'admin',
            'account_status' => 'active',
        ]);

        $this->actingAs($admin)->patchJson("/api/admin/users/{$admin->user_id}", [
            'user_role' => 'customer',
            'reason' => 'Self demotion attempt',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['user_role']);

        $this->actingAs($admin)->patchJson("/api/admin/users/{$admin->user_id}", [
            'account_status' => 'suspended',
            'reason' => 'Self lockout attempt',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['account_status']);

        $admin->refresh();
        $this->assertSame('admin', $admin->user_role);
        $this->assertSame('active', $admin->account_status);
    }
}
