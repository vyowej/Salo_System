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
        $customer = User::create([
            'username' => 'cust_mgmt_'.random_int(100, 999),
            'first_name' => 'Plain',
            'last_name' => 'Customer',
            'email' => 'plaincust@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $admin = User::create([
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
        $admin = User::create([
            'username' => 'admin_dir_'.random_int(100, 999),
            'first_name' => 'Dir',
            'last_name' => 'Admin',
            'email' => 'diradmin@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'admin',
            'account_status' => 'active',
        ]);

        $owner = User::create([
            'username' => 'owner_dir_'.random_int(100, 999),
            'first_name' => 'Marco',
            'last_name' => 'Reyes',
            'email' => 'marcoreyes@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $riderUser = User::create([
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
}
