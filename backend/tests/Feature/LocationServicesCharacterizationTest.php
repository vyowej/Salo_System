<?php

namespace Tests\Feature;

use App\Features\Locations\Services\RestaurantLocationService;
use App\Features\Locations\Services\RiderTrackingService;
use App\Features\Locations\Services\ServiceAreaValidationService;
use App\Models\User;
use App\Support\AddressService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class LocationServicesCharacterizationTest extends TestCase
{
    use DatabaseTransactions;

    private function makeUser(string $role = 'customer'): User
    {
        return User::forceCreate([
            'username' => $role . '_locsvc_' . random_int(10000, 99999),
            'first_name' => ucfirst($role),
            'last_name' => 'LocSvc',
            'email' => $role . '_locsvc_' . random_int(10000, 99999) . '@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createRestaurantForOwner(User $owner, int $offersDelivery = 1): int
    {
        $addressId = app(AddressService::class)->createAddress([
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
            'street' => 'Main St',
            'latitude' => 8.481000,
            'longitude' => 124.636000,
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'LocSvc Kitchen ' . random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'locsvc_' . random_int(100, 999) . '@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
            'is_published' => 1,
            'offers_delivery' => $offersDelivery,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

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

        DB::table('menu_items')->insert([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'item_name' => 'LocSvc Dish',
            'base_price' => '100.00',
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'sort_order' => 1,
            'draft_state' => 'clean',
            'is_published' => 1,
            'published_menu_category_id' => $catId,
            'published_item_name' => 'LocSvc Dish',
            'published_base_price' => '100.00',
            'published_sort_order' => 1,
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        return $restaurantId;
    }

    private function activatePlatformArea(string $province, ?string $city, ?string $barangay, User $admin): int
    {
        $res = $this->actingAs($admin)->postJson('/api/admin/service-areas', [
            'province' => $province,
            'city' => $city,
            'barangay' => $barangay,
            'is_active' => true,
        ])->assertStatus(201);

        return (int) $res->json('data.service_area.id');
    }

    public function test_service_area_validation_service_precedence_and_restaurant_checks(): void
    {
        $admin = $this->makeUser('admin');
        $owner = $this->makeUser('customer');
        $service = app(ServiceAreaValidationService::class);

        // Blank province/city
        $blank = $service->checkPlatformSupport('', 'Cagayan de Oro City');
        $this->assertFalse($blank['supported']);
        $this->assertFalse($blank['platform_supported']);
        $this->assertNull($blank['matched_level']);
        $this->assertNull($blank['matched_area_id']);

        // Activate province-wide, city-wide, and barangay-level areas in Misamis Oriental
        $provinceAreaId = $this->activatePlatformArea('Misamis Oriental', null, null, $admin);
        $cityAreaId = $this->activatePlatformArea('Misamis Oriental', 'Cagayan de Oro City', null, $admin);
        $barangayAreaId = $this->activatePlatformArea('Misamis Oriental', 'Cagayan de Oro City', 'Carmen', $admin);

        // Barangay takes precedence over city and province
        $brgyMatch = $service->checkPlatformSupport('Misamis Oriental', 'Cagayan de Oro City', 'Carmen');
        $this->assertTrue($brgyMatch['supported']);
        $this->assertSame('barangay', $brgyMatch['matched_level']);
        $this->assertSame($barangayAreaId, $brgyMatch['matched_area_id']);

        // City takes precedence over province when barangay isn't matched
        $cityMatch = $service->checkPlatformSupport('Misamis Oriental', 'Cagayan de Oro City', 'Lapasan');
        $this->assertTrue($cityMatch['supported']);
        $this->assertSame('city', $cityMatch['matched_level']);
        $this->assertSame($cityAreaId, $cityMatch['matched_area_id']);

        // Province-wide fallback for another city in the same province
        $provMatch = $service->checkPlatformSupport('Misamis Oriental', 'El Salvador City', null);
        $this->assertTrue($provMatch['supported']);
        $this->assertSame('province', $provMatch['matched_level']);
        $this->assertSame($provinceAreaId, $provMatch['matched_area_id']);

        // Preloaded active areas filter case-insensitively by province
        $preloaded = $service->loadActiveAreasForProvinces(['Misamis Oriental']);
        $preloadedMatch = $service->checkPlatformSupport('misamis oriental', 'cagayan de oro city', 'carmen', $preloaded);
        $this->assertSame($barangayAreaId, $preloadedMatch['matched_area_id']);

        // Restaurant checks: nonexistent restaurant
        $missingRest = $service->checkRestaurantSupport(999999, 'Misamis Oriental', 'Cagayan de Oro City', 'Carmen');
        $this->assertFalse($missingRest['supported']);
        $this->assertTrue($missingRest['platform_supported']);
        $this->assertFalse($missingRest['restaurant_configured']);
        $this->assertSame('Restaurant not found.', $missingRest['reason']);

        // Restaurant with offers_delivery = 0
        $noDeliveryId = $this->createRestaurantForOwner($owner, offersDelivery: 0);
        $noDelivery = $service->checkRestaurantSupport($noDeliveryId, 'Misamis Oriental', 'Cagayan de Oro City', 'Carmen');
        $this->assertFalse($noDelivery['supported']);
        $this->assertTrue($noDelivery['platform_supported']);
        $this->assertFalse($noDelivery['restaurant_supported']);
        $this->assertTrue($noDelivery['restaurant_configured']);

        // Restaurant with offers_delivery = 1 and empty service_areas (unconfigured -> inherits platform support)
        $deliveryRestId = $this->createRestaurantForOwner($owner, offersDelivery: 1);
        $unconfigured = $service->checkRestaurantSupport($deliveryRestId, 'Misamis Oriental', 'Cagayan de Oro City', 'Carmen');
        $this->assertTrue($unconfigured['supported']);
        $this->assertFalse($unconfigured['restaurant_configured']);

        // Configure restaurant coverage to Carmen only -> Carmen supported, Lapasan rejected
        app(RestaurantLocationService::class)->updateCoverage($owner, $deliveryRestId, [
            ['province' => 'Misamis Oriental', 'city' => 'Cagayan de Oro City', 'barangay' => 'Carmen'],
        ]);
        $covered = $service->checkRestaurantSupport($deliveryRestId, 'Misamis Oriental', 'Cagayan de Oro City', 'Carmen');
        $this->assertTrue($covered['supported']);
        $this->assertTrue($covered['restaurant_configured']);

        $uncovered = $service->checkRestaurantSupport($deliveryRestId, 'Misamis Oriental', 'Cagayan de Oro City', 'Lapasan');
        $this->assertFalse($uncovered['supported']);
        $this->assertTrue($uncovered['platform_supported']);
        $this->assertFalse($uncovered['restaurant_supported']);
        $this->assertTrue($uncovered['restaurant_configured']);

        // Region name from Nominatim (e.g. "Zamboanga Peninsula") matches PSGC province ("Zamboanga del Sur") for city-level areas
        $zdsProvinceId = (int) DB::table('provinces')->insertGetId([
            'province_name' => 'Zamboanga del Sur',
            'created_at' => now(),
        ]);
        $zamboCityId = (int) DB::table('cities')->insertGetId([
            'province_id' => $zdsProvinceId,
            'city_name' => 'Zamboanga City',
            'created_at' => now(),
        ]);
        DB::table('platform_service_areas')->insert([
            'province_id' => $zdsProvinceId,
            'city_id' => $zamboCityId,
            'barangay_id' => null,
            'area_level' => 'city',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $zamboSupport = $service->checkPlatformSupport('Zamboanga Peninsula', 'Zamboanga City', 'Pasonanca');
        $this->assertTrue($zamboSupport['platform_supported']);
        $this->assertSame('city', $zamboSupport['matched_level']);
    }

    public function test_rider_tracking_service_deduplication_stale_detection_and_access(): void
    {
        $customer = $this->makeUser('customer');
        $otherCustomer = $this->makeUser('customer');
        $admin = $this->makeUser('admin');
        $owner = $this->makeUser('customer');
        $riderUser = $this->makeUser('customer');
        $tracking = app(RiderTrackingService::class);

        $restaurantId = $this->createRestaurantForOwner($owner);
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
            'idempotency_key' => 'CHK-TRK-' . random_int(100000, 999999),
            'total_amount' => 250.00,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $restaurantId,
            'customer_id' => $customer->user_id,
            'restaurant_name' => 'LocSvc Kitchen',
            'customer_name' => 'Customer Tester',
            'order_reference' => 'ORD-TRK-' . random_int(100000, 999999),
            'order_type' => 'delivery',
            'order_status' => 'out_for_delivery',
            'delivery_address_text' => 'Carmen, CDO',
            'delivery_recipient_name' => 'Customer',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $deliveryId = (int) DB::table('deliveries')->insertGetId([
            'order_id' => $orderId,
            'rider_id' => $riderId,
            'delivery_status' => 'in_transit',
            'assigned_at' => now(),
            'accepted_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Newer point first (300s ago -> stale > 120s), then older point (600s ago -> ignored as out-of-order)
        $newerTime = now()->subSeconds(300)->toIso8601String();
        $olderTime = now()->subSeconds(600)->toIso8601String();

        $recorded = $tracking->recordLocation($riderUser, [
            'delivery_id' => $deliveryId,
            'latitude' => 8.4811,
            'longitude' => 124.6369,
            'accuracy_meters' => 10,
            'recorded_at' => $newerTime,
        ]);
        $this->assertTrue($recorded['recorded']);

        $ignored = $tracking->recordLocation($riderUser, [
            'delivery_id' => $deliveryId,
            'latitude' => 8.4800,
            'longitude' => 124.6350,
            'recorded_at' => $olderTime,
        ]);
        $this->assertFalse($ignored['recorded']);
        $this->assertSame('Ignored out-of-order GPS update.', $ignored['reason']);

        // Customer owns order and sees stale GPS
        $custView = $tracking->getOrderTracking($orderId, $customer, isAdmin: false);
        $this->assertSame($orderId, $custView['order_id']);
        $this->assertNotNull($custView['rider_location']);
        $this->assertTrue($custView['rider_location']['is_stale']);

        // Admin can view any order
        $adminView = $tracking->getOrderTracking($orderId, $admin, isAdmin: true);
        $this->assertSame($orderId, $adminView['order_id']);

        // Other customer gets 403
        try {
            $tracking->getOrderTracking($orderId, $otherCustomer, isAdmin: false);
            $this->fail('Expected 403 for unrelated customer.');
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
        }

        // Delivered delivery stops recording
        DB::table('deliveries')->where('delivery_id', $deliveryId)->update(['delivery_status' => 'delivered']);
        $stopped = $tracking->recordLocation($riderUser, [
            'delivery_id' => $deliveryId,
            'latitude' => 8.4820,
            'longitude' => 124.6370,
        ]);
        $this->assertFalse($stopped['recorded']);
        $this->assertSame('Tracking stopped because delivery is no longer active.', $stopped['reason']);
    }

    public function test_restaurant_location_service_deduplicates_coverage_and_preserves_shape(): void
    {
        $admin = $this->makeUser('admin');
        $owner = $this->makeUser('customer');
        $restaurantId = $this->createRestaurantForOwner($owner);
        $this->activatePlatformArea('Misamis Oriental', 'Cagayan de Oro City', 'Carmen', $admin);

        $service = app(RestaurantLocationService::class);

        // Duplicate entries are deduplicated cleanly
        $updated = $service->updateCoverage($owner, $restaurantId, [
            ['province' => 'Misamis Oriental', 'city' => 'Cagayan de Oro City', 'barangay' => 'Carmen'],
            ['province' => 'Misamis Oriental', 'city' => 'Cagayan de Oro City', 'barangay' => 'Carmen'],
        ]);

        $this->assertSame($restaurantId, $updated['restaurant_id']);
        $this->assertCount(1, $updated['coverage']);
        $this->assertTrue($updated['coverage'][0]['platform_active']);
        $this->assertArrayHasKey('location', $updated);
        $this->assertArrayHasKey('available_platform_areas', $updated);

        // Unactivated area throws ValidationException on areas.0
        $this->expectException(ValidationException::class);
        $service->updateCoverage($owner, $restaurantId, [
            ['province' => 'Misamis Oriental', 'city' => 'Cagayan de Oro City', 'barangay' => 'Lapasan'],
        ]);
    }
}
