<?php

namespace Tests\Feature;

use App\Features\Orders\Services\DeliveryFeeCalculator;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DeliveryFeeByDistanceTest extends TestCase
{
    use DatabaseTransactions;

    private function defaultSettings(): array
    {
        return [
            'base_fee_cents' => 4900,
            'base_distance_km' => 2.0,
            'per_extra_km_cents' => 1000,
            'max_fee_cents' => 15000,
        ];
    }

    /**
     * Find a destination latitude due north of ($lat, $lng) at $targetMeters.
     */
    private function coordsAtDistanceMeters(float $lat, float $lng, float $targetMeters): array
    {
        $degPerMeter = 180.0 / (M_PI * 6371000.0);

        return [$lat + ($targetMeters * $degPerMeter), $lng];
    }

    public function test_calculator_worked_examples_and_boundaries(): void
    {
        $calc = new DeliveryFeeCalculator;
        $settings = $this->defaultSettings();
        $originLat = 14.5995;
        $originLng = 120.9842;

        $cases = [
            [0.0, 4900],
            [10.0, 4900],
            [500.0, 4900],
            [1900.0, 4900],
            [2000.0, 4900],
            [2000.1, 5900],
            [2100.0, 5900],
            [3000.0, 5900],
            [3100.0, 6900],
            [5000.0, 7900],
            [12000.0, 14900],
            [14000.0, 15000],
            [25000.0, 15000],
        ];

        foreach ($cases as [$meters, $expectedCents]) {
            [$destLat, $destLng] = $this->coordsAtDistanceMeters($originLat, $originLng, $meters);
            $res = $calc->calculate($originLat, $originLng, $destLat, $destLng, $settings, 'delivery');
            $this->assertSame($expectedCents, $res['fee_cents'], "Failed for distance {$meters}m");
            $this->assertFalse($res['used_fallback']);
        }

        // Custom settings
        $custom = [
            'base_fee_cents' => 6000,
            'base_distance_km' => 3.0,
            'per_extra_km_cents' => 1500,
            'max_fee_cents' => 20000,
        ];
        [$lat45, $lng45] = $this->coordsAtDistanceMeters($originLat, $originLng, 4500.0);
        $customRes = $calc->calculate($originLat, $originLng, $lat45, $lng45, $custom, 'delivery');
        $this->assertSame(9000, $customRes['fee_cents']); // 60 + ceil(1.5)*15 = 90

        // Pickup and dine-in always 0
        $pickup = $calc->calculate($originLat, $originLng, $lat45, $lng45, $settings, 'pickup');
        $this->assertSame(0, $pickup['fee_cents']);
        $this->assertNull($pickup['distance_km']);

        $dineIn = $calc->calculate($originLat, $originLng, $lat45, $lng45, $settings, 'dine_in');
        $this->assertSame(0, $dineIn['fee_cents']);

        // Missing coordinates fallback to base fee
        $fallback = $calc->calculate(null, null, $lat45, $lng45, $settings, 'delivery');
        $this->assertSame(4900, $fallback['fee_cents']);
        $this->assertTrue($fallback['used_fallback']);
        $this->assertNull($fallback['distance_km']);
    }

    private function createUser(string $prefix = 'df'): User
    {
        return User::forceCreate([
            'username' => "{$prefix}_".random_int(10000, 99999),
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'phone_number' => '+639171234567',
            'email' => "{$prefix}_".random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);
    }

    private function seedOrderableRestaurant(float $lat, float $lng, string $name = 'Distance Grill'): array
    {
        $owner = $this->createUser('owner');
        $addrId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '42 Maginhawa St',
            'latitude' => $lat,
            'longitude' => $lng,
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => $name,
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09172223333',
            'business_email' => 'rest_'.random_int(1000, 9999).'@example.com',
            'address_id' => $addrId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepting_orders' => 1,
            'restaurant_status' => 'active',
            'is_published' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
        ]);

        // Ensure 24/7 open operating hours for all 7 days
        for ($d = 0; $d < 7; $d++) {
            DB::table('operating_hours')->insert([
                'restaurant_id' => $restaurantId,
                'day_of_week' => $d,
                'opening_time' => '00:00:00',
                'closing_time' => '23:59:59',
                'is_closed' => 0,
            ]);
        }

        $cityId = (int) DB::table('addresses as a')
            ->join('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->where('a.address_id', $addrId)
            ->value('b.city_id');

        DB::table('service_areas')->insert([
            'restaurant_id' => $restaurantId,
            'city_id' => $cityId,
            'created_at' => now(),
        ]);

        $catId = (int) DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $restaurantId,
            'category_name' => 'Mains',
            'sort_order' => 0,
            'is_active' => 1,
            'is_published' => 1,
            'published_is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $itemId = (int) DB::table('menu_items')->insertGetId([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'published_menu_category_id' => $catId,
            'item_name' => 'Chicken Inasal',
            'published_item_name' => 'Chicken Inasal',
            'base_price' => 150.00,
            'published_base_price' => 150.00,
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'is_published' => 1,
            'sort_order' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$restaurantId, $itemId];
    }

    private function createCustomerAddress(User $user, float $lat, float $lng, string $label = 'Home'): int
    {
        $addrId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '18 Katipunan Ave',
            'latitude' => $lat,
            'longitude' => $lng,
        ]);

        DB::table('user_addresses')->insert([
            'user_id' => $user->user_id,
            'address_id' => $addrId,
            'address_label' => $label,
            'is_default' => 0,
        ]);

        return $addrId;
    }

    public function test_quote_endpoint_authorization_and_calculation(): void
    {
        $customer = $this->createUser('q_cust');
        $other = $this->createUser('q_other');
        [$restId] = $this->seedOrderableRestaurant(14.6500, 121.0500);
        [$destLat, $destLng] = $this->coordsAtDistanceMeters(14.6500, 121.0500, 3500.0);
        $ownAddrId = $this->createCustomerAddress($customer, $destLat, $destLng);
        $otherAddrId = $this->createCustomerAddress($other, $destLat, $destLng);

        // Unauthenticated -> 401
        $this->postJson('/api/customer/delivery-fee/quote', [
            'restaurant_id' => $restId,
            'address_id' => $ownAddrId,
        ])->assertUnauthorized();

        // Another user's address -> 404
        $this->actingAs($customer)->postJson('/api/customer/delivery-fee/quote', [
            'restaurant_id' => $restId,
            'address_id' => $otherAddrId,
        ])->assertNotFound();

        // Invalid restaurant -> 404
        $this->actingAs($customer)->postJson('/api/customer/delivery-fee/quote', [
            'restaurant_id' => 99999999,
            'address_id' => $ownAddrId,
        ])->assertNotFound();

        // Valid quote (~3.5 km -> 49 + 20 = 69)
        $res = $this->actingAs($customer)->postJson('/api/customer/delivery-fee/quote', [
            'restaurant_id' => $restId,
            'fulfillment' => 'delivery',
            'address_id' => $ownAddrId,
        ]);
        $res->assertOk();
        $res->assertJsonPath('data.delivery_fee', 69);
        $res->assertJsonPath('data.distance_km', 3.5);

        // Pickup -> 0
        $pickup = $this->actingAs($customer)->postJson('/api/customer/delivery-fee/quote', [
            'restaurant_id' => $restId,
            'fulfillment' => 'pickup',
        ]);
        $pickup->assertOk()->assertJsonPath('data.delivery_fee', 0);
    }

    public function test_checkout_stores_distance_fee_per_group_and_preserves_old_orders(): void
    {
        $customer = $this->createUser('chk_dist');
        [$restId, $itemId] = $this->seedOrderableRestaurant(14.6500, 121.0500);
        [$lat1, $lng1] = $this->coordsAtDistanceMeters(14.6500, 121.0500, 1500.0); // 1.5 km -> 49
        [$lat2, $lng2] = $this->coordsAtDistanceMeters(14.6500, 121.0500, 5000.0); // 5.0 km -> 79
        $addr1 = $this->createCustomerAddress($customer, $lat1, $lng1, 'Near');
        $addr2 = $this->createCustomerAddress($customer, $lat2, $lng2, 'Far');

        // 409 mismatch when client sends wrong expected_total
        $mismatch = $this->actingAs($customer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'dist-mismatch-'.random_int(10000, 99999),
            'groups' => [
                [
                    'restaurant_id' => $restId,
                    'fulfillment' => 'delivery',
                    'address_id' => $addr2,
                    'expected_total' => 199.00, // wrong: 150 + 49 instead of 150 + 79
                    'items' => [['menu_item_id' => $itemId, 'quantity' => 1]],
                ],
            ],
        ]);
        $mismatch->assertStatus(409);
        $mismatch->assertJsonPath('data.groups.0.delivery_fee', 79);
        $mismatch->assertJsonPath('data.groups.0.total_amount', 229);

        // Case (c): 1 restaurant -> 2 addresses at different distances
        $ok = $this->actingAs($customer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'dist-multi-'.random_int(10000, 99999),
            'groups' => [
                [
                    'restaurant_id' => $restId,
                    'fulfillment' => 'delivery',
                    'address_id' => $addr1,
                    'expected_total' => 199.00, // 150 + 49
                    'items' => [['menu_item_id' => $itemId, 'quantity' => 1]],
                ],
                [
                    'restaurant_id' => $restId,
                    'fulfillment' => 'delivery',
                    'address_id' => $addr2,
                    'expected_total' => 229.00, // 150 + 79
                    'items' => [['menu_item_id' => $itemId, 'quantity' => 1]],
                ],
            ],
        ]);
        $ok->assertCreated();
        $orders = $ok->json('data.checkout.orders');
        $this->assertCount(2, $orders);
        $this->assertEquals(49.0, $orders[0]['delivery_fee']);
        $this->assertEquals(79.0, $orders[1]['delivery_fee']);

        // Changing platform_settings later does NOT mutate stored orders.delivery_fee
        $admin = User::forceCreate([
            'username' => 'adm_df_'.random_int(10000, 99999),
            'first_name' => 'Admin',
            'last_name' => 'User',
            'phone_number' => '+639171234568',
            'email' => 'adm_df_'.random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'admin',
            'account_status' => 'active',
        ]);
        $this->actingAs($admin)->putJson('/api/admin/config/fees', [
            'base_fee' => '65.00',
            'base_distance_km' => '2',
            'per_extra_km' => '15.00',
            'max_fee' => '200.00',
            'reason' => 'Testing historical fee preservation',
        ])->assertOk();

        $storedFee1 = (float) DB::table('orders')->where('order_id', $orders[0]['order_id'])->value('delivery_fee');
        $storedFee2 = (float) DB::table('orders')->where('order_id', $orders[1]['order_id'])->value('delivery_fee');
        $this->assertEquals(49.0, $storedFee1);
        $this->assertEquals(79.0, $storedFee2);
    }
}
