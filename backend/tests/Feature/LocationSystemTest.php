<?php

namespace Tests\Feature;

use App\Features\Locations\Services\PsgcLocationService;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class LocationSystemTest extends TestCase
{
    use DatabaseTransactions;

    public function test_location_lookup_returns_philippine_provinces_cities_and_barangays(): void
    {
        $this->getJson('/api/locations/provinces?q=Misamis')
            ->assertStatus(200)
            ->assertJsonFragment(['name' => 'Misamis Oriental']);

        $this->getJson('/api/locations/cities?province=Misamis+Oriental&q=Cagayan')
            ->assertStatus(200)
            ->assertJsonFragment(['name' => 'Cagayan de Oro City']);

        $this->getJson('/api/locations/barangays?province=Misamis+Oriental&city=Cagayan+de+Oro+City&q=Car')
            ->assertStatus(200)
            ->assertJsonFragment(['name' => 'Carmen']);
    }

    public function test_admin_service_area_management_and_barangay_level_validation(): void
    {
        $customer = $this->makeUser('customer');
        $admin = $this->makeUser('admin');

        $this->actingAs($customer)->getJson('/api/admin/service-areas')->assertStatus(403);

        // Create barangay-level service area for Carmen, Cagayan de Oro City
        $createRes = $this->actingAs($admin)->postJson('/api/admin/service-areas', [
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
            'is_active' => true,
            'center_latitude' => 8.4811,
            'center_longitude' => 124.6369,
            'reason' => 'Launch CDO Carmen zone',
        ]);

        $createRes->assertStatus(201)
            ->assertJsonPath('data.service_area.province', 'Misamis Oriental')
            ->assertJsonPath('data.service_area.city', 'Cagayan de Oro City')
            ->assertJsonPath('data.service_area.barangay', 'Carmen')
            ->assertJsonPath('data.service_area.is_active', true);

        $areaId = $createRes->json('data.service_area.id');

        // Duplicate prevention
        $this->actingAs($admin)->postJson('/api/admin/service-areas', [
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
        ])->assertStatus(422);

        // Carmen is supported, Lapasan is NOT supported (must not treat entire city as covered)
        $this->postJson('/api/locations/validate-service-area', [
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
        ])->assertStatus(200)->assertJsonPath('data.supported', true);

        $this->postJson('/api/locations/validate-service-area', [
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Lapasan',
        ])->assertStatus(200)->assertJsonPath('data.supported', false);

        // Deactivate and verify audit log
        $this->actingAs($admin)->patchJson("/api/admin/service-areas/{$areaId}", [
            'is_active' => false,
            'reason' => 'Temporary pause',
        ])->assertStatus(200)->assertJsonPath('data.service_area.is_active', false);

        $this->postJson('/api/locations/validate-service-area', [
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
        ])->assertStatus(200)->assertJsonPath('data.supported', false);

        $this->assertDatabaseHas('audit_logs', [
            'actor_user_id' => $admin->user_id,
            'entity_type' => 'platform_service_area',
            'entity_id' => (string) $areaId,
            'action' => 'service_area.deactivated',
        ]);
    }

    public function test_customer_saved_addresses_preserve_coordinates_and_service_area_status(): void
    {
        $admin = $this->makeUser('admin');
        $customer = $this->makeUser('customer');

        $this->actingAs($admin)->postJson('/api/admin/service-areas', [
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
            'is_active' => true,
        ])->assertStatus(201);

        // Save address inside active service area
        $res1 = $this->actingAs($customer)->postJson('/api/customer/addresses', [
            'label' => 'Home',
            'recipient_name' => 'Juan Dela Cruz',
            'recipient_phone' => '09171234567',
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
            'street' => 'Vamenta Blvd',
            'house_number' => '123',
            'latitude' => 8.481234,
            'longitude' => 124.637891,
            'gps_accuracy' => 12.5,
        ]);

        $res1->assertStatus(201)
            ->assertJsonPath('data.address.is_default', true)
            ->assertJsonPath('data.address.is_service_area_supported', true)
            ->assertJsonPath('data.address.latitude', 8.481234)
            ->assertJsonPath('data.address.longitude', 124.637891);

        // Save address outside active service area (allowed to save, marked unsupported)
        $res2 = $this->actingAs($customer)->postJson('/api/customer/addresses', [
            'label' => 'Work',
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Lapasan',
            'street' => 'CM Recto Ave',
            'latitude' => 8.485111,
            'longitude' => 124.656222,
        ]);

        $res2->assertStatus(201)
            ->assertJsonPath('data.address.is_service_area_supported', false);

        $address1Id = $res1->json('data.address.id');

        // Updating street without coordinates must preserve existing coordinates
        $this->actingAs($customer)->patchJson("/api/customer/addresses/{$address1Id}", [
            'street' => 'Vamenta Blvd Corner Villarin',
        ])->assertStatus(200)
            ->assertJsonPath('data.address.latitude', 8.481234)
            ->assertJsonPath('data.address.longitude', 124.637891);
    }

    public function test_restaurant_coverage_cannot_include_unactivated_platform_areas(): void
    {
        $admin = $this->makeUser('admin');
        $owner = $this->makeUser('customer');

        $this->actingAs($admin)->postJson('/api/admin/service-areas', [
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
            'is_active' => true,
        ])->assertStatus(201);

        $restaurantId = $this->createRestaurantForOwner($owner, 'Misamis Oriental', 'Cagayan de Oro City', 'Carmen');

        // Reject Lapasan because Admin has not activated it
        $this->actingAs($owner)->putJson('/api/restaurant/coverage', [
            'restaurant_id' => $restaurantId,
            'areas' => [
                ['province' => 'Misamis Oriental', 'city' => 'Cagayan de Oro City', 'barangay' => 'Lapasan'],
            ],
        ])->assertStatus(422);

        // Accept Carmen
        $this->actingAs($owner)->putJson('/api/restaurant/coverage', [
            'restaurant_id' => $restaurantId,
            'areas' => [
                ['province' => 'Misamis Oriental', 'city' => 'Cagayan de Oro City', 'barangay' => 'Carmen'],
            ],
        ])->assertStatus(200)
            ->assertJsonCount(1, 'data.coverage');
    }

    public function test_rider_gps_tracking_and_customer_order_tracking_privacy(): void
    {
        $customer1 = $this->makeUser('customer');
        $customer2 = $this->makeUser('customer');
        $owner = $this->makeUser('customer');
        $riderUser = $this->makeUser('customer');

        $restaurantId = $this->createRestaurantForOwner($owner, 'Misamis Oriental', 'Cagayan de Oro City', 'Carmen');

        $cityId = DB::table('cities')->where('city_name', 'Cagayan de Oro City')->value('city_id');
        $riderId = (int) DB::table('riders')->insertGetId([
            'user_id' => $riderUser->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Test Contact',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09170000001',
            'base_city_id' => $cityId,
            'rider_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $checkoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $customer1->user_id,
            'idempotency_key' => 'CHK-' . random_int(100000, 999999),
            'total_amount' => 250.00,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $restaurantId,
            'customer_id' => $customer1->user_id,
            'restaurant_name' => 'CDO Kitchen',
            'customer_name' => 'Customer One',
            'order_reference' => 'ORD-' . random_int(100000, 999999),
            'order_type' => 'delivery',
            'order_status' => 'out_for_delivery',
            'delivery_address_text' => '123 Vamenta Blvd, Carmen, Cagayan de Oro City',
            'delivery_latitude' => 8.482000,
            'delivery_longitude' => 124.638000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $deliveryId = (int) DB::table('deliveries')->insertGetId([
            'order_id' => $orderId,
            'rider_id' => $riderId,
            'delivery_status' => 'picked_up',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Rider posts real GPS update
        $this->actingAs($riderUser)->postJson('/api/rider/location', [
            'delivery_id' => $deliveryId,
            'latitude' => 8.481500,
            'longitude' => 124.637200,
            'accuracy_meters' => 8.0,
        ])->assertStatus(200)->assertJsonPath('data.recorded', true);

        // Customer 1 can see tracking
        $this->actingAs($customer1)->getJson("/api/customer/orders/{$orderId}/tracking")
            ->assertStatus(200)
            ->assertJsonPath('data.dropoff.latitude', 8.482)
            ->assertJsonPath('data.rider_location.latitude', 8.4815);

        // Customer 2 cannot see Customer 1's order tracking
        $this->actingAs($customer2)->getJson("/api/customer/orders/{$orderId}/tracking")
            ->assertStatus(403);
    }

    private function makeUser(string $role): User
    {
        return User::create([
            'username' => $role . '_' . random_int(10000, 99999),
            'first_name' => ucfirst($role),
            'last_name' => 'Tester',
            'email' => $role . '_' . random_int(10000, 99999) . '@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createRestaurantForOwner(User $owner, string $province, string $city, string $barangay): int
    {
        $addressId = app(\App\Support\AddressService::class)->createAddress([
            'province' => $province,
            'city' => $city,
            'barangay' => $barangay,
            'street' => 'Main St',
            'latitude' => 8.481000,
            'longitude' => 124.636000,
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Test Kitchen ' . random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'kitchen_' . random_int(100, 999) . '@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
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

    public function test_psgc_failed_or_empty_responses_are_not_cached(): void
    {
        Cache::forget('psgc:provinces');

        Http::fake([
            '*/provinces/' => Http::sequence()
                ->push([], 500)
                ->push([['code' => '999900000', 'name' => 'Fake Recovery Province']], 200),
        ]);

        $service = new PsgcLocationService(skipExternalInTesting: false);

        // First call fails (HTTP 500) — must not cache empty array
        $first = $service->searchProvinces('Fake Recovery');
        $this->assertSame([], $first);
        $this->assertNull(Cache::get('psgc:provinces'));

        // Second call succeeds — recovers and caches non-empty response
        $second = $service->searchProvinces('Fake Recovery');
        $this->assertCount(1, $second);
        $this->assertSame('Fake Recovery Province', $second[0]['name']);
        $this->assertNotEmpty(Cache::get('psgc:provinces'));
    }

    public function test_psgc_successful_responses_are_cached_for_24_hours(): void
    {
        Cache::forget('psgc:provinces');

        Http::fake([
            '*/provinces/' => Http::sequence()
                ->push([['code' => '888800000', 'name' => 'Cached Test Province']], 200)
                ->push([], 500),
        ]);

        $service = new PsgcLocationService(skipExternalInTesting: false);

        $first = $service->searchProvinces('Cached Test');
        $this->assertCount(1, $first);
        $this->assertSame('Cached Test Province', $first[0]['name']);

        // Second call must read from 24-hour cache without hitting HTTP again
        $second = $service->searchProvinces('Cached Test');
        $this->assertCount(1, $second);
        $this->assertSame('Cached Test Province', $second[0]['name']);
        Http::assertSentCount(1);
    }
}
