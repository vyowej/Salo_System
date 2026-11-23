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
        return User::forceCreate([
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

    public function test_locations_overview_service_areas_mixed_case_and_query_counts(): void
    {
        $admin = $this->makeUser('admin');
        $owner = $this->makeUser('customer');
        $customer = $this->makeUser('customer');
        $riderUser = $this->makeUser('customer');

        // Create service area with boundary_geojson
        $geojson = ['type' => 'Polygon', 'coordinates' => [[[124.63, 8.48], [124.64, 8.48], [124.64, 8.49], [124.63, 8.48]]]];
        $this->actingAs($admin)->postJson('/api/admin/service-areas', [
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
            'is_active' => true,
            'center_latitude' => 8.4811,
            'center_longitude' => 124.6369,
            'boundary_geojson' => json_encode($geojson),
            'reason' => 'Carmen polygon zone',
        ])->assertStatus(201);

        $this->actingAs($admin)->postJson('/api/admin/service-areas', [
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Lapasan',
            'is_active' => true,
            'center_latitude' => 8.4850,
            'center_longitude' => 124.6560,
            'reason' => 'Lapasan zone',
        ])->assertStatus(201);

        // Mixed-case lookup in local fallback (testing skips external HTTP by default)
        $this->getJson('/api/locations/cities?province=' . urlencode('mIsAmIs oRiEnTaL'))
            ->assertOk()
            ->assertJsonFragment(['name' => 'Cagayan de Oro City']);

        $this->getJson('/api/locations/barangays?province=' . urlencode('mIsAmIs oRiEnTaL') . '&city=' . urlencode('cAgAyAn dE oRo cItY'))
            ->assertOk()
            ->assertJsonFragment(['name' => 'Carmen']);

        // Mixed-case service area validation after LOWER() removal
        $this->postJson('/api/locations/validate-service-area', [
            'province' => 'mIsAmIs oRiEnTaL',
            'city' => 'cAgAyAn dE oRo cItY',
            'barangay' => 'cArMeN',
        ])->assertOk()->assertJsonPath('data.supported', true);

        // Create restaurant with 2 coverage areas and verify GET /api/restaurant/location query count
        $restaurantId = $this->createRestaurantForOwner($owner, 'Misamis Oriental', 'Cagayan de Oro City', 'Carmen');
        $this->actingAs($owner)->putJson('/api/restaurant/coverage', [
            'restaurant_id' => $restaurantId,
            'areas' => [
                ['province' => 'Misamis Oriental', 'city' => 'Cagayan de Oro City', 'barangay' => 'Carmen'],
                ['province' => 'Misamis Oriental', 'city' => 'Cagayan de Oro City', 'barangay' => 'Lapasan'],
            ],
        ])->assertOk();

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($owner)->getJson("/api/restaurant/location?restaurant_id={$restaurantId}")
            ->assertOk()
            ->assertJsonPath('data.coverage.0.platform_active', true)
            ->assertJsonPath('data.coverage.1.platform_active', true);
        $this->assertLessThanOrEqual(12, count(DB::getQueryLog()), 'GET /api/restaurant/location must not run N+1 platform validation queries.');

        // Create 2 customer addresses and verify GET /api/customer/addresses query count (<= 4)
        $this->actingAs($customer)->postJson('/api/customer/addresses', [
            'label' => 'Home',
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
            'street' => '1st St',
        ])->assertStatus(201);
        $this->actingAs($customer)->postJson('/api/customer/addresses', [
            'label' => 'Office',
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Lapasan',
            'street' => '2nd St',
        ])->assertStatus(201);

        DB::flushQueryLog();
        $this->actingAs($customer)->getJson('/api/customer/addresses')
            ->assertOk()
            ->assertJsonCount(2, 'data.addresses')
            ->assertJsonPath('data.addresses.0.is_service_area_supported', true)
            ->assertJsonPath('data.addresses.1.is_service_area_supported', true);
        $this->assertLessThanOrEqual(4, count(DB::getQueryLog()), 'GET /api/customer/addresses must execute at most 4 queries.');

        // Verify GET /api/admin/service-areas and GET /api/locations/active-service-areas query counts & restaurant_count/boundary_geojson
        DB::flushQueryLog();
        $adminSaRes = $this->actingAs($admin)->getJson('/api/admin/service-areas')->assertOk();
        $this->assertLessThanOrEqual(5, count(DB::getQueryLog()), 'GET /api/admin/service-areas must execute at most 5 queries.');
        $carmenRow = collect($adminSaRes->json('data.service_areas'))->firstWhere('barangay', 'Carmen');
        $this->assertNotNull($carmenRow);
        $this->assertSame(1, $carmenRow['restaurant_count']);
        $this->assertSame(json_encode($geojson), $carmenRow['boundary_geojson']);

        DB::flushQueryLog();
        $this->getJson('/api/locations/active-service-areas')->assertOk();
        $this->assertLessThanOrEqual(4, count(DB::getQueryLog()), 'GET /api/locations/active-service-areas must execute at most 4 queries (no N+1).');

        // Seed active delivery with 2 rider GPS points (older vs newer) and verify GET /api/admin/locations/overview
        $cityId = DB::table('cities')->where('city_name', 'Cagayan de Oro City')->value('city_id');
        $riderId = (int) DB::table('riders')->insertGetId([
            'user_id' => $riderUser->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Contact',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09170000099',
            'base_city_id' => $cityId,
            'rider_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $checkoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $customer->user_id,
            'idempotency_key' => 'CHK-OVW-' . random_int(100000, 999999),
            'total_amount' => 300.00,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $restaurantId,
            'customer_id' => $customer->user_id,
            'restaurant_name' => 'Overview Kitchen',
            'customer_name' => 'Overview Customer',
            'order_reference' => 'ORD-OVW-' . random_int(100000, 999999),
            'order_type' => 'delivery',
            'order_status' => 'out_for_delivery',
            'delivery_address_text' => 'Carmen, CDO',
            'delivery_latitude' => 8.482000,
            'delivery_longitude' => 124.638000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $deliveryId = (int) DB::table('deliveries')->insertGetId([
            'order_id' => $orderId,
            'rider_id' => $riderId,
            'delivery_status' => 'in_transit',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('rider_locations')->insert([
            [
                'rider_id' => $riderId,
                'delivery_id' => $deliveryId,
                'latitude' => 8.470000,
                'longitude' => 124.620000,
                'accuracy_meters' => 15.0,
                'recorded_at' => '2026-10-10 10:00:00',
            ],
            [
                'rider_id' => $riderId,
                'delivery_id' => $deliveryId,
                'latitude' => 8.481900,
                'longitude' => 124.637900,
                'accuracy_meters' => 5.5,
                'recorded_at' => '2026-10-10 10:05:00',
            ],
        ]);

        DB::flushQueryLog();
        $overviewRes = $this->actingAs($admin)->getJson('/api/admin/locations/overview')->assertOk();
        $this->assertLessThanOrEqual(8, count(DB::getQueryLog()), 'GET /api/admin/locations/overview must execute at most 8 queries.');

        $activeDeliv = collect($overviewRes->json('data.active_deliveries'))->firstWhere('delivery_id', $deliveryId);
        $this->assertNotNull($activeDeliv);
        $this->assertSame(8.4819, $activeDeliv['rider_location']['latitude']);
        $this->assertSame(124.6379, $activeDeliv['rider_location']['longitude']);
        $this->assertSame(5.5, $activeDeliv['rider_location']['accuracy_meters']);
        $this->assertSame('2026-10-10 10:05:00', $activeDeliv['rider_location']['recorded_at']);
    }

    public function test_locations_overview_restaurants_and_active_deliveries_without_gps_shape(): void
    {
        $admin = $this->makeUser('admin');
        $customer = $this->makeUser('customer');
        $tag = 'OvwShape' . random_int(1000, 9999);

        $addrApprovedId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
            'street' => '88 Hayes St',
            'latitude' => 8.481000,
            'longitude' => 124.636000,
        ]);

        $addrPendingId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Lapasan',
            'street' => '99 Pending St',
        ]);

        $approvedRestId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => "{$tag} Approved",
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => "appr_{$tag}@example.com",
            'address_id' => $addrApprovedId,
            'restaurant_status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $pendingRestId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => "{$tag} Pending",
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => "pend_{$tag}@example.com",
            'address_id' => $addrPendingId,
            'restaurant_status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $checkoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $customer->user_id,
            'idempotency_key' => "CHK-{$tag}-" . random_int(100, 999),
            'total_amount' => 250.00,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $approvedRestId,
            'customer_id' => $customer->user_id,
            'restaurant_name' => "{$tag} Approved",
            'customer_name' => 'Shape Customer',
            'order_reference' => "ORD-{$tag}-" . random_int(100, 999),
            'order_type' => 'delivery',
            'order_status' => 'ready',
            'delivery_address_text' => 'Carmen, CDO',
            'delivery_latitude' => 8.482000,
            'delivery_longitude' => 124.638000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $acceptedDeliveryId = (int) DB::table('deliveries')->insertGetId([
            'order_id' => $orderId,
            'rider_id' => null,
            'delivery_status' => 'accepted',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::flushQueryLog();
        DB::enableQueryLog();
        $res = $this->actingAs($admin)->getJson('/api/admin/locations/overview')
            ->assertOk()
            ->assertJsonStructure([
                'data' => ['service_areas', 'restaurants', 'active_deliveries'],
            ]);
        $this->assertLessThanOrEqual(8, count(DB::getQueryLog()));

        $restaurants = collect($res->json('data.restaurants'));
        $apprRow = $restaurants->firstWhere('restaurant_id', $approvedRestId);
        $this->assertNotNull($apprRow);
        $this->assertSame('approved', $apprRow['status']);
        $this->assertSame('88 Hayes St, Brgy. Carmen, Cagayan de Oro City, Misamis Oriental', $apprRow['address']);
        $this->assertSame(8.481, $apprRow['latitude']);
        $this->assertSame(124.636, $apprRow['longitude']);
        $this->assertNull($restaurants->firstWhere('restaurant_id', $pendingRestId));

        $delivRow = collect($res->json('data.active_deliveries'))->firstWhere('delivery_id', $acceptedDeliveryId);
        $this->assertNotNull($delivRow);
        $this->assertSame('accepted', $delivRow['delivery_status']);
        $this->assertNull($delivRow['rider_name']);
        $this->assertNull($delivRow['rider_location']);
    }
}
