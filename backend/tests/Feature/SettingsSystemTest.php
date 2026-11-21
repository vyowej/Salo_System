<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SettingsSystemTest extends TestCase
{
    private function seedLocation(): array
    {
        $suffix = (string) mt_rand(100000, 999999);
        $provinceId = (int) DB::table('provinces')->insertGetId([
            'province_name' => 'Test Province '.$suffix,
        ]);
        $cityId = (int) DB::table('cities')->insertGetId([
            'province_id' => $provinceId,
            'city_name' => 'Test City '.$suffix,
        ]);
        $barangayId = (int) DB::table('barangays')->insertGetId([
            'city_id' => $cityId,
            'barangay_name' => 'Test Brgy '.$suffix,
        ]);
        $addressId = (int) DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '123 Test St',
            'postal_code' => '1000',
        ]);

        return compact('provinceId', 'cityId', 'barangayId', 'addressId');
    }

    private function createUser(string $role = 'customer', string $status = 'active'): User
    {
        $suffix = uniqid();

        return User::create([
            'username' => 'user_'.$suffix,
            'first_name' => 'Test',
            'last_name' => 'User',
            'email' => "user_{$suffix}@example.com",
            'password_hash' => Hash::make('Password123!'),
            'phone_number' => '09171234567',
            'user_role' => $role,
            'account_status' => $status,
        ]);
    }

    public function test_account_settings_and_contact_numbers_persist_in_database(): void
    {
        $user = $this->createUser();

        $this->actingAs($user)
            ->getJson('/api/account/settings')
            ->assertOk()
            ->assertJsonPath('data.settings.notifications.orderUpdates', true);

        $this->actingAs($user)
            ->putJson('/api/account/settings', [
                'notifications' => ['promotions' => true, 'smsNotifications' => true],
                'privacy' => ['shareOrderHistoryForRecommendations' => false],
                'security' => ['twoFactor' => true],
            ])
            ->assertOk()
            ->assertJsonPath('data.settings.notifications.promotions', true)
            ->assertJsonPath('data.settings.privacy.shareOrderHistoryForRecommendations', false)
            ->assertJsonPath('data.settings.security.twoFactor', true);

        $this->actingAs($user)
            ->getJson('/api/account/contact-numbers')
            ->assertOk()
            ->assertJsonCount(1, 'data.contact_numbers');

        $created = $this->actingAs($user)
            ->postJson('/api/account/contact-numbers', [
                'label' => 'Work',
                'phone_number' => '+639181234567',
                'is_default' => true,
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.contact_number.phone_number', '09181234567')
            ->assertJsonPath('data.contact_number.is_default', true);

        $contactId = $created->json('data.contact_number.contact_id');

        $this->assertDatabaseHas('users', [
            'user_id' => $user->user_id,
            'phone_number' => '09181234567',
        ]);

        $this->actingAs($user)
            ->deleteJson("/api/account/contact-numbers/{$contactId}")
            ->assertOk();
    }

    public function test_restaurant_settings_and_admin_approved_change_request_workflow(): void
    {
        Storage::fake('local');
        $loc = $this->seedLocation();
        $owner = $this->createUser('customer');
        $admin = $this->createUser('admin');
        $otherUser = $this->createUser('customer');

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Original Bistro',
            'registered_name' => 'Original Bistro Corp',
            'business_type' => 'restaurant',
            'ownership_structure' => 'corporation',
            'business_email' => 'bistro@example.com',
            'address_id' => $loc['addressId'],
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'restaurant_status' => 'active',
        ]);
        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
        ]);

        // Operational settings update
        $this->actingAs($owner)
            ->patchJson('/api/restaurant/settings', [
                'restaurant_id' => $restaurantId,
                'accepts_reservations' => true,
                'reservation_max_party_size' => 12,
                'inventory_deduction_mode' => 'on_completion',
            ])
            ->assertOk()
            ->assertJsonPath('data.profile.accepts_reservations', true)
            ->assertJsonPath('data.profile.reservation_max_party_size', 12)
            ->assertJsonPath('data.profile.inventory_deduction_mode', 'on_completion');

        // Unauthorized user cannot submit change request
        $this->actingAs($otherUser)
            ->postJson('/api/restaurant/change-requests', [
                'restaurant_id' => $restaurantId,
                'restaurant_name' => 'Hacked Name',
            ])
            ->assertStatus(403);

        // Submit sensitive change request with document
        $submitRes = $this->actingAs($owner)
            ->post('/api/restaurant/change-requests', [
                'restaurant_id' => $restaurantId,
                'restaurant_name' => 'Updated Bistro Name',
                'business_type' => 'cafe',
                'reason' => 'Rebranded to cafe',
                'documents' => [UploadedFile::fake()->createWithContent('dti.pdf', "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF")],
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.request.status', 'pending');

        $requestId = $submitRes->json('data.request.request_id');

        // Live record MUST NOT be overwritten before admin approval
        $this->assertDatabaseHas('restaurants', [
            'restaurant_id' => $restaurantId,
            'restaurant_name' => 'Original Bistro',
            'business_type' => 'restaurant',
        ]);

        // Admin approves
        $this->actingAs($admin)
            ->postJson("/api/admin/change-requests/{$requestId}/decision", [
                'decision' => 'approve',
                'review_note' => 'Verified DTI document.',
            ])
            ->assertOk()
            ->assertJsonPath('data.request.status', 'approved');

        // Now live record IS updated
        $this->assertDatabaseHas('restaurants', [
            'restaurant_id' => $restaurantId,
            'restaurant_name' => 'Updated Bistro Name',
            'business_type' => 'cafe',
        ]);
    }

    public function test_rider_change_request_and_account_lifecycle_safeguards(): void
    {
        $loc = $this->seedLocation();
        $riderUser = $this->createUser('customer');
        $admin = $this->createUser('admin');
        $customer = $this->createUser('customer');

        $riderId = (int) DB::table('riders')->insertGetId([
            'user_id' => $riderUser->user_id,
            'vehicle_type' => 'motorcycle',
            'vehicle_brand' => 'Honda',
            'vehicle_model' => 'Click 125i',
            'vehicle_year' => 2022,
            'plate_number' => 'ABC123',
            'vehicle_ownership' => 'personally_owned',
            'emergency_contact_name' => 'Jane Doe',
            'emergency_contact_relationship' => 'sibling',
            'emergency_contact_phone' => '09171112222',
            'base_city_id' => $loc['cityId'],
            'rider_status' => 'active',
        ]);

        // Submit vehicle change request
        $res = $this->actingAs($riderUser)
            ->postJson('/api/rider/change-requests', [
                'plate_number' => 'XYZ999',
                'vehicle_year' => 2024,
                'reason' => 'New plate issued',
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.request.status', 'pending');

        $reqId = $res->json('data.request.request_id');

        // Live rider record untouched while pending
        $this->assertDatabaseHas('riders', [
            'rider_id' => $riderId,
            'plate_number' => 'ABC123',
        ]);

        // Create active delivery to verify deactivation safeguard
        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Safe Eats',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'safe@example.com',
            'address_id' => $loc['addressId'],
            'restaurant_status' => 'active',
        ]);
        $checkoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $customer->user_id,
            'total_amount' => 200.00,
        ]);
        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'customer_id' => $customer->user_id,
            'restaurant_id' => $restaurantId,
            'restaurant_name' => 'Safe Eats',
            'customer_name' => 'Test User',
            'order_reference' => 'ORD-'.uniqid(),
            'order_type' => 'delivery',
            'order_status' => 'out_for_delivery',
            'subtotal_amount' => 150.00,
            'delivery_fee' => 50.00,
            'total_amount' => 200.00,
        ]);
        DB::table('deliveries')->insert([
            'order_id' => $orderId,
            'rider_id' => $riderId,
            'delivery_status' => 'picked_up',
        ]);

        // Deactivation blocked while active delivery exists
        $this->actingAs($riderUser)
            ->postJson('/api/account/deactivate', ['reason' => 'Break'])
            ->assertStatus(409);

        // Complete delivery -> deactivation succeeds
        DB::table('deliveries')->where('order_id', $orderId)->update(['delivery_status' => 'delivered']);

        $this->actingAs($riderUser)
            ->postJson('/api/account/deactivate', ['reason' => 'Taking a break'])
            ->assertOk()
            ->assertJsonPath('data.account_status', 'inactive');

        // Login blocked while inactive
        $this->postJson('/api/auth/login', [
            'email' => $riderUser->email,
            'password' => 'Password123!',
        ])->assertStatus(403);

        // Reactivation request submitted -> admin approves -> login works again
        $reactRes = $this->postJson('/api/auth/reactivation-request', [
            'email' => $riderUser->email,
            'password' => 'Password123!',
            'reason' => 'Ready to return',
        ])->assertStatus(201);

        $lifecycleId = $reactRes->json('data.request.lifecycle_request_id');

        $this->actingAs($admin)
            ->postJson("/api/admin/lifecycle-requests/{$lifecycleId}/decision", [
                'decision' => 'approve',
                'review_note' => 'Welcome back',
            ])
            ->assertOk();

        $this->postJson('/api/auth/login', [
            'email' => $riderUser->email,
            'password' => 'Password123!',
        ])->assertOk();

        // Admin approves original rider vehicle change request
        $this->actingAs($admin)
            ->postJson("/api/admin/change-requests/{$reqId}/decision", [
                'decision' => 'approve',
            ])
            ->assertOk();

        $this->assertDatabaseHas('riders', [
            'rider_id' => $riderId,
            'plate_number' => 'XYZ999',
        ]);
    }
}
