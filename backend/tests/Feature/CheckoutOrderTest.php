<?php

namespace Tests\Feature;

use App\Features\Restaurants\Services\AvailabilityService;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CheckoutOrderTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $prefix = 'cust'): User
    {
        return User::create([
            'username' => "{$prefix}_".random_int(10000, 99999),
            'first_name' => ucfirst($prefix),
            'last_name' => 'Buyer',
            'phone_number' => '+639171234567',
            'email' => "{$prefix}_".random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);
    }

    private function createPlatformAreaAndUserAddress(User $user, string $city = 'Quezon City', string $barangay = 'Diliman', bool $isDefault = true): int
    {
        $provinceId = (int) (DB::table('provinces')->where('province_name', 'Metro Manila')->value('province_id')
            ?? DB::table('provinces')->insertGetId(['province_name' => 'Metro Manila']));

        $cityId = (int) (DB::table('cities')->where('province_id', $provinceId)->where('city_name', $city)->value('city_id')
            ?? DB::table('cities')->insertGetId(['province_id' => $provinceId, 'city_name' => $city]));

        $barangayId = (int) (DB::table('barangays')->where('city_id', $cityId)->where('barangay_name', $barangay)->value('barangay_id')
            ?? DB::table('barangays')->insertGetId(['city_id' => $cityId, 'barangay_name' => $barangay]));

        DB::table('platform_service_areas')->insertOrIgnore([
            'province_id' => $provinceId,
            'city_id' => $cityId,
            'barangay_id' => null,
            'area_level' => 'city',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $addressId = (int) DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '123 Katipunan Ave',
            'postal_code' => '1101',
            'latitude' => 14.6500,
            'longitude' => 121.0700,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('user_addresses')->insert([
            'user_id' => $user->user_id,
            'address_id' => $addressId,
            'address_label' => $isDefault ? 'Home' : 'Work',
            'recipient_name' => "{$user->first_name} {$user->last_name}",
            'recipient_phone' => '+639171234567',
            'is_default' => $isDefault ? 1 : 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $addressId;
    }

    private function createOpenRestaurant(string $name, array $overrides = []): int
    {
        $addrId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '55 Maginhawa St',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId(array_merge([
            'restaurant_name' => $name,
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171112222',
            'business_email' => strtolower(str_replace(' ', '', $name)).'@example.com',
            'address_id' => $addrId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepting_orders' => 1,
            'restaurant_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));

        // Open 00:00 -> 23:59 every day in Asia/Manila so tests are deterministic at any hour
        for ($d = 0; $d <= 6; $d++) {
            DB::table('operating_hours')->insert([
                'restaurant_id' => $restaurantId,
                'day_of_week' => $d,
                'opening_time' => '00:00:00',
                'closing_time' => '23:59:00',
                'closes_next_day' => 0,
                'is_closed' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return $restaurantId;
    }

    private function createMenuItem(int $restaurantId, string $name, string $price, array $overrides = []): int
    {
        $catId = (int) (DB::table('menu_categories')->where('restaurant_id', $restaurantId)->value('menu_category_id')
            ?? DB::table('menu_categories')->insertGetId([
                'restaurant_id' => $restaurantId,
                'category_name' => 'Mains',
                'sort_order' => 0,
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]));

        return (int) DB::table('menu_items')->insertGetId(array_merge([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'item_name' => $name,
            'base_price' => $price,
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'sort_order' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));
    }

    public function test_multi_restaurant_cod_checkout_snapshots_fees_and_idempotency(): void
    {
        $buyer = $this->createUser('multi');
        $addressId = $this->createPlatformAreaAndUserAddress($buyer, 'Quezon City', 'Diliman');

        $restA = $this->createOpenRestaurant('Kusina Alpha');
        $restB = $this->createOpenRestaurant('Kape Beta');

        $itemA = $this->createMenuItem($restA, 'Pork Sisig', '12.34');
        $itemB = $this->createMenuItem($restB, 'Iced Barako', '85.50');

        $payload = [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-multi-'.random_int(100000, 999999),
            'groups' => [
                [
                    'restaurant_id' => $restA,
                    'fulfillment' => 'delivery',
                    'address_id' => $addressId,
                    'delivery_notes' => 'Gate 2',
                    'items' => [
                        // Tampered client price/total must be ignored
                        ['menu_item_id' => $itemA, 'quantity' => 3, 'unit_price' => 1.00, 'total' => 3.00],
                    ],
                ],
                [
                    'restaurant_id' => $restB,
                    'fulfillment' => 'pickup',
                    'items' => [
                        ['menu_item_id' => $itemB, 'quantity' => 2],
                    ],
                ],
            ],
        ];

        $res = $this->actingAs($buyer)->postJson('/api/customer/checkout', $payload)
            ->assertStatus(201);

        $checkout = $res->json('data.checkout');
        // Rest A: 12.34 * 3 = 37.02 + 49.00 delivery = 86.02
        // Rest B: 85.50 * 2 = 171.00 + 0.00 pickup = 171.00
        // Total = 257.02
        $this->assertEqualsWithDelta(257.02, $checkout['total_amount'], 0.001);
        $this->assertCount(2, $checkout['orders']);

        $orderA = $checkout['orders'][0];
        $orderB = $checkout['orders'][1];

        $this->assertEqualsWithDelta(37.02, $orderA['subtotal_amount'], 0.001);
        $this->assertEqualsWithDelta(49.00, $orderA['delivery_fee'], 0.001);
        $this->assertEqualsWithDelta(86.02, $orderA['total_amount'], 0.001);
        $this->assertSame('pending', $orderA['order_status']);
        $this->assertSame('cod', $orderA['payment']['method']);
        $this->assertSame('pending', $orderA['payment']['status']);
        $this->assertStringContainsString('123 Katipunan Ave', $orderA['delivery_address']['address_text']);

        $this->assertEqualsWithDelta(171.00, $orderB['subtotal_amount'], 0.001);
        $this->assertEqualsWithDelta(0.00, $orderB['delivery_fee'], 0.001);
        $this->assertEqualsWithDelta(171.00, $orderB['total_amount'], 0.001);
        $this->assertNull($orderB['delivery_address']);

        // Idempotency: same key twice creates nothing new
        $res2 = $this->actingAs($buyer)->postJson('/api/customer/checkout', $payload)->assertStatus(201);
        $this->assertSame($checkout['checkout_id'], $res2->json('data.checkout.checkout_id'));
        $this->assertSame(1, DB::table('checkouts')->where('idempotency_key', $payload['idempotency_key'])->count());

        // Later menu price change does NOT alter existing order_items snapshot
        DB::table('menu_items')->where('menu_item_id', $itemA)->update(['base_price' => '999.00']);
        $detail = $this->actingAs($buyer)->getJson("/api/customer/orders/{$orderA['order_id']}")->assertOk();
        $this->assertEqualsWithDelta(12.34, $detail->json('data.order.items.0.unit_price'), 0.001);
        $this->assertEqualsWithDelta(37.02, $detail->json('data.order.items.0.line_total'), 0.001);

        // Audit logs created
        $this->assertDatabaseHas('audit_logs', ['entity_type' => 'checkouts', 'entity_id' => (string) $checkout['checkout_id'], 'action' => 'customer_checkout_created']);
        $this->assertDatabaseHas('audit_logs', ['entity_type' => 'orders', 'entity_id' => (string) $orderA['order_id'], 'action' => 'customer_order_placed']);
    }

    public function test_all_or_nothing_rejections_and_validation_rules(): void
    {
        $buyer = $this->createUser('val');
        $otherUser = $this->createUser('other');
        $buyerAddr = $this->createPlatformAreaAndUserAddress($buyer, 'Quezon City', 'Diliman');
        $otherAddr = $this->createPlatformAreaAndUserAddress($otherUser, 'Quezon City', 'Diliman');

        $restOpen = $this->createOpenRestaurant('Open Rest');
        $validItem = $this->createMenuItem($restOpen, 'Valid Dish', '100.00');
        $soldOutItem = $this->createMenuItem($restOpen, 'Sold Out Dish', '100.00', ['availability_status' => 'sold_out']);
        $hiddenItem = $this->createMenuItem($restOpen, 'Hidden Dish', '100.00', ['availability_status' => 'hidden']);
        $unapprovedItem = $this->createMenuItem($restOpen, 'Pending Dish', '100.00', ['approval_status' => 'pending']);

        $restOther = $this->createOpenRestaurant('Other Rest');
        $otherItem = $this->createMenuItem($restOther, 'Other Dish', '50.00');

        // 1. All-or-nothing: group 0 valid, group 1 has sold_out item -> 0 checkouts/orders created
        $beforeCheckouts = DB::table('checkouts')->count();
        $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-bad-1-'.random_int(10000, 99999),
            'groups' => [
                [
                    'restaurant_id' => $restOpen,
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $validItem, 'quantity' => 1]],
                ],
                [
                    'restaurant_id' => $restOpen,
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $soldOutItem, 'quantity' => 1]],
                ],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors(['groups.1.items.0.menu_item_id']);
        $this->assertSame($beforeCheckouts, DB::table('checkouts')->count());

        // 2. Hidden, unapproved, and wrong-restaurant items
        $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-bad-2-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $restOpen,
                'fulfillment' => 'pickup',
                'items' => [
                    ['menu_item_id' => $hiddenItem, 'quantity' => 1],
                    ['menu_item_id' => $unapprovedItem, 'quantity' => 1],
                    ['menu_item_id' => $otherItem, 'quantity' => 1],
                    ['menu_item_id' => $validItem, 'quantity' => 1],
                    ['menu_item_id' => $validItem, 'quantity' => 1],
                ],
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors([
            'groups.0.items.0.menu_item_id',
            'groups.0.items.1.menu_item_id',
            'groups.0.items.2.menu_item_id',
        ]);

        // 3. Address not owned by user -> 422
        $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-bad-addr-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $restOpen,
                'fulfillment' => 'delivery',
                'address_id' => $otherAddr,
                'items' => [['menu_item_id' => $validItem, 'quantity' => 1]],
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors(['groups.0.address_id']);

        // 4. Out of restaurant coverage -> 422
        $makatiId = (int) (DB::table('cities')->where('city_name', 'Makati')->value('city_id')
            ?? DB::table('cities')->insertGetId([
                'province_id' => DB::table('provinces')->where('province_name', 'Metro Manila')->value('province_id'),
                'city_name' => 'Makati',
            ]));
        DB::table('service_areas')->insert([
            'restaurant_id' => $restOpen,
            'city_id' => $makatiId,
            'barangay_id' => null,
            'created_at' => now(),
        ]);

        $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-bad-cov-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $restOpen,
                'fulfillment' => 'delivery',
                'address_id' => $buyerAddr,
                'items' => [['menu_item_id' => $validItem, 'quantity' => 1]],
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors(['groups.0.address_id']);

        // 5. Accepting orders off & closed hours
        DB::table('restaurants')->where('restaurant_id', $restOpen)->update(['accepting_orders' => 0]);
        $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-paused-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $restOpen,
                'fulfillment' => 'pickup',
                'items' => [['menu_item_id' => $validItem, 'quantity' => 1]],
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors(['groups.0.restaurant_id']);

        // Closed hours
        DB::table('restaurants')->where('restaurant_id', $restOpen)->update(['accepting_orders' => 1]);
        DB::table('operating_hours')->where('restaurant_id', $restOpen)->update(['is_closed' => 1]);
        $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-closed-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $restOpen,
                'fulfillment' => 'pickup',
                'items' => [['menu_item_id' => $validItem, 'quantity' => 1]],
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors(['groups.0.restaurant_id']);

        // 6. Non-COD payment method -> 422
        $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'gcash',
            'idempotency_key' => 'idem-gcash-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $restOpen,
                'fulfillment' => 'pickup',
                'items' => [['menu_item_id' => $validItem, 'quantity' => 1]],
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors(['payment_method']);
    }

    public function test_customer_order_authorization_and_list_isolation(): void
    {
        $buyerA = $this->createUser('buyerA');
        $buyerB = $this->createUser('buyerB');
        $rest = $this->createOpenRestaurant('Auth Kitchen');
        $item = $this->createMenuItem($rest, 'Tapsilog', '120.00');

        // Unauthenticated -> 401
        $this->postJson('/api/customer/checkout', [])->assertStatus(401);
        $this->getJson('/api/customer/orders')->assertStatus(401);
        $this->getJson('/api/customer/orders/1')->assertStatus(401);

        $res = $this->actingAs($buyerA)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-auth-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $rest,
                'fulfillment' => 'pickup',
                'items' => [['menu_item_id' => $item, 'quantity' => 1]],
            ]],
        ])->assertStatus(201);

        $orderId = $res->json('data.checkout.orders.0.order_id');

        // Buyer A sees it in list and detail
        $this->actingAs($buyerA)->getJson('/api/customer/orders')
            ->assertOk()
            ->assertJsonCount(1, 'data.orders');
        $this->actingAs($buyerA)->getJson("/api/customer/orders/{$orderId}")->assertOk();

        // Buyer B gets empty list and 404 on Buyer A's order
        $this->actingAs($buyerB)->getJson('/api/customer/orders')
            ->assertOk()
            ->assertJsonCount(0, 'data.orders');
        $this->actingAs($buyerB)->getJson("/api/customer/orders/{$orderId}")->assertStatus(404);
    }

    public function test_expected_total_mismatch_returns_409_and_writes_nothing(): void
    {
        $buyer = $this->createUser('expmis');
        $rest = $this->createOpenRestaurant('Mismatch Kitchen');
        $item = $this->createMenuItem($rest, 'Lechon Kawali', '200.00');

        $beforeCheckouts = DB::table('checkouts')->count();
        $beforeOrders = DB::table('orders')->count();

        $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-mismatch-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $rest,
                'fulfillment' => 'pickup',
                'expected_total' => 150.00,
                'items' => [['menu_item_id' => $item, 'quantity' => 1]],
            ]],
        ])->assertStatus(409)
            ->assertJsonPath('data.groups.0.total_amount', 200);

        $this->assertSame($beforeCheckouts, DB::table('checkouts')->count());
        $this->assertSame($beforeOrders, DB::table('orders')->count());
    }

    public function test_self_order_is_blocked_for_owner_and_active_staff(): void
    {
        $owner = $this->createUser('selfown');
        $staff = $this->createUser('selfstaff');
        $rest = $this->createOpenRestaurant('Self Order Kitchen');
        $item = $this->createMenuItem($rest, 'Lechon Kawali', '200.00');

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $rest,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $rest,
            'user_id' => $staff->user_id,
            'staff_position' => 'Order Staff',
            'staff_status' => 'active',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($owner)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-self-own-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $rest,
                'fulfillment' => 'pickup',
                'items' => [['menu_item_id' => $item, 'quantity' => 1]],
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors(['groups.0.restaurant_id']);

        $this->actingAs($staff)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-self-staff-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $rest,
                'fulfillment' => 'pickup',
                'items' => [['menu_item_id' => $item, 'quantity' => 1]],
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors(['groups.0.restaurant_id']);
    }

    public function test_duplicate_idempotency_key_returns_original_for_same_user_and_409_for_other_user(): void
    {
        $buyer = $this->createUser('idem1');
        $otherBuyer = $this->createUser('idem2');
        $rest = $this->createOpenRestaurant('Idem Kitchen');
        $item = $this->createMenuItem($rest, 'Lechon Kawali', '200.00');
        $sharedKey = 'idem-shared-'.random_int(10000, 99999);

        $first = $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => $sharedKey,
            'groups' => [[
                'restaurant_id' => $rest,
                'fulfillment' => 'pickup',
                'expected_total' => 200.00,
                'items' => [['menu_item_id' => $item, 'quantity' => 1]],
            ]],
        ])->assertStatus(201);

        $sameUserRepeat = $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => $sharedKey,
            'groups' => [[
                'restaurant_id' => $rest,
                'fulfillment' => 'pickup',
                'expected_total' => 200.00,
                'items' => [['menu_item_id' => $item, 'quantity' => 1]],
            ]],
        ])->assertStatus(201);

        $this->assertSame($first->json('data.checkout.checkout_id'), $sameUserRepeat->json('data.checkout.checkout_id'));

        $this->actingAs($otherBuyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => $sharedKey,
            'groups' => [[
                'restaurant_id' => $rest,
                'fulfillment' => 'pickup',
                'items' => [['menu_item_id' => $item, 'quantity' => 1]],
            ]],
        ])->assertStatus(409);
    }

    public function test_same_restaurant_with_multiple_delivery_addresses_creates_separate_orders_and_fees(): void
    {
        $buyer = $this->createUser('multiaddr');
        $addressOne = $this->createPlatformAreaAndUserAddress($buyer, 'Quezon City', 'Diliman', true);
        $addressTwo = $this->createPlatformAreaAndUserAddress($buyer, 'Quezon City', 'Loyola Heights', false);
        $rest = $this->createOpenRestaurant('Multi Address Grill');
        $itemA = $this->createMenuItem($rest, 'Inasal', '150.00');
        $itemB = $this->createMenuItem($rest, 'Sisig', '110.00');

        $response = $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-multi-addr-'.random_int(10000, 99999),
            'groups' => [
                [
                    'restaurant_id' => $rest,
                    'fulfillment' => 'delivery',
                    'address_id' => $addressOne,
                    'expected_total' => 349.00,
                    'items' => [['menu_item_id' => $itemA, 'quantity' => 2]],
                ],
                [
                    'restaurant_id' => $rest,
                    'fulfillment' => 'delivery',
                    'address_id' => $addressTwo,
                    'expected_total' => 159.00,
                    'items' => [['menu_item_id' => $itemB, 'quantity' => 1]],
                ],
            ],
        ])->assertStatus(201);

        $checkout = $response->json('data.checkout');
        $this->assertEquals(508.00, $checkout['total_amount']);
        $this->assertCount(2, $checkout['orders']);

        $ordersByAddress = collect($checkout['orders'])->keyBy(fn (array $order) => (int) DB::table('orders')->where('order_id', $order['order_id'])->value('delivery_address_id'));

        $this->assertTrue($ordersByAddress->has($addressOne));
        $this->assertTrue($ordersByAddress->has($addressTwo));
        $this->assertEquals(49.00, $ordersByAddress[$addressOne]['delivery_fee']);
        $this->assertEquals(349.00, $ordersByAddress[$addressOne]['total_amount']);
        $this->assertEquals(49.00, $ordersByAddress[$addressTwo]['delivery_fee']);
        $this->assertEquals(159.00, $ordersByAddress[$addressTwo]['total_amount']);
    }

    public function test_delivery_checkout_requires_valid_contact_phone_while_pickup_does_not(): void
    {
        $buyerWithoutPhone = User::create([
            'username' => 'nophone_'.random_int(10000, 99999),
            'first_name' => 'No',
            'last_name' => 'Phone',
            'phone_number' => null,
            'email' => 'nophone_'.random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $addressId = $this->createPlatformAreaAndUserAddress($buyerWithoutPhone, 'Quezon City', 'Diliman', true);
        DB::table('user_addresses')
            ->where('user_id', $buyerWithoutPhone->user_id)
            ->where('address_id', $addressId)
            ->update(['recipient_phone' => null]);

        $rest = $this->createOpenRestaurant('Phone Check Resto');
        $item = $this->createMenuItem($rest, 'Adobo', '180.00');

        // Delivery without any valid contact phone -> 422
        $this->actingAs($buyerWithoutPhone)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-no-phone-deliv-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $rest,
                'fulfillment' => 'delivery',
                'address_id' => $addressId,
                'expected_total' => 229.00,
                'items' => [['menu_item_id' => $item, 'quantity' => 1]],
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors(['groups.0.address_id']);

        // Invalid phone number on user -> 422
        DB::table('users')
            ->where('user_id', $buyerWithoutPhone->user_id)
            ->update(['phone_number' => '12345']);

        $this->actingAs($buyerWithoutPhone->fresh())->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-bad-phone-deliv-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $rest,
                'fulfillment' => 'delivery',
                'address_id' => $addressId,
                'expected_total' => 229.00,
                'items' => [['menu_item_id' => $item, 'quantity' => 1]],
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors(['groups.0.address_id']);

        // Pickup without phone -> 201
        DB::table('users')
            ->where('user_id', $buyerWithoutPhone->user_id)
            ->update(['phone_number' => null]);

        $this->actingAs($buyerWithoutPhone->fresh())->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-no-phone-pickup-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $rest,
                'fulfillment' => 'pickup',
                'expected_total' => 180.00,
                'items' => [['menu_item_id' => $item, 'quantity' => 1]],
            ]],
        ])->assertStatus(201);
    }

    public function test_delivery_notes_enforce_500_character_limit_and_preserve_per_group_notes(): void
    {
        $buyer = $this->createUser('notes');
        $addressOne = $this->createPlatformAreaAndUserAddress($buyer, 'Quezon City', 'Diliman', true);
        $addressTwo = $this->createPlatformAreaAndUserAddress($buyer, 'Quezon City', 'Loyola Heights', false);
        $rest = $this->createOpenRestaurant('Notes Resto');
        $item = $this->createMenuItem($rest, 'Pancit', '150.00');

        // 501 characters -> 422
        $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-notes-501-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $rest,
                'fulfillment' => 'delivery',
                'address_id' => $addressOne,
                'delivery_notes' => str_repeat('a', 501),
                'expected_total' => 199.00,
                'items' => [['menu_item_id' => $item, 'quantity' => 1]],
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors(['groups.0.delivery_notes']);

        // 500 characters on group 0 and distinct note on group 1 -> 201
        $maxNote = str_repeat('b', 500);
        $secondNote = 'Leave at lobby reception';
        $response = $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-notes-500-'.random_int(10000, 99999),
            'groups' => [
                [
                    'restaurant_id' => $rest,
                    'fulfillment' => 'delivery',
                    'address_id' => $addressOne,
                    'delivery_notes' => $maxNote,
                    'expected_total' => 199.00,
                    'items' => [['menu_item_id' => $item, 'quantity' => 1]],
                ],
                [
                    'restaurant_id' => $rest,
                    'fulfillment' => 'delivery',
                    'address_id' => $addressTwo,
                    'delivery_notes' => $secondNote,
                    'expected_total' => 199.00,
                    'items' => [['menu_item_id' => $item, 'quantity' => 1]],
                ],
            ],
        ])->assertStatus(201);

        $orders = $response->json('data.checkout.orders');
        $this->assertCount(2, $orders);
        $this->assertSame($maxNote, DB::table('orders')->where('order_id', $orders[0]['order_id'])->value('delivery_notes'));
        $this->assertSame($secondNote, DB::table('orders')->where('order_id', $orders[1]['order_id'])->value('delivery_notes'));
    }

    public function test_paid_and_free_add_ons_validation_pricing_persistence_and_separate_lines(): void
    {
        $buyer = $this->createUser('addons');
        $addressId = $this->createPlatformAreaAndUserAddress($buyer, 'Quezon City', 'Diliman', true);
        $rest = $this->createOpenRestaurant('Addons Kitchen');
        $chickenRice = $this->createMenuItem($rest, 'Chicken Rice', '120.00');
        $otherItem = $this->createMenuItem($rest, 'Pork Chop', '150.00');

        $groupId = (int) DB::table('add_on_groups')->insertGetId([
            'menu_item_id' => $chickenRice,
            'group_name' => 'Extras',
            'is_required' => 0,
            'minimum_selections' => 0,
            'maximum_selections' => 2,
            'sort_order' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $freeChili = (int) DB::table('add_on_options')->insertGetId([
            'add_on_group_id' => $groupId,
            'option_name' => 'Chili Garlic',
            'additional_price' => '0.00',
            'is_available' => 1,
            'sort_order' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $extraEgg = (int) DB::table('add_on_options')->insertGetId([
            'add_on_group_id' => $groupId,
            'option_name' => 'Extra Egg',
            'additional_price' => '25.00',
            'is_available' => 1,
            'sort_order' => 2,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $extraCheese = (int) DB::table('add_on_options')->insertGetId([
            'add_on_group_id' => $groupId,
            'option_name' => 'Extra Cheese',
            'additional_price' => '35.00',
            'is_available' => 1,
            'sort_order' => 3,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $soldOutAddOn = (int) DB::table('add_on_options')->insertGetId([
            'add_on_group_id' => $groupId,
            'option_name' => 'Truffle Oil',
            'additional_price' => '50.00',
            'is_available' => 0,
            'sort_order' => 4,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $otherGroupId = (int) DB::table('add_on_groups')->insertGetId([
            'menu_item_id' => $otherItem,
            'group_name' => 'Sauce',
            'is_required' => 1,
            'minimum_selections' => 1,
            'maximum_selections' => 1,
            'sort_order' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $otherOption = (int) DB::table('add_on_options')->insertGetId([
            'add_on_group_id' => $otherGroupId,
            'option_name' => 'Gravy',
            'additional_price' => '15.00',
            'is_available' => 1,
            'sort_order' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // 1. Invalid add-on ID -> 422
        $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-addon-invalid-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $rest,
                'fulfillment' => 'delivery',
                'address_id' => $addressId,
                'items' => [['menu_item_id' => $chickenRice, 'quantity' => 1, 'add_on_option_ids' => [999999]]],
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors(['groups.0.items.0.add_on_option_ids']);

        // 2. Add-on belonging to another menu item -> 422
        $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-addon-wrong-item-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $rest,
                'fulfillment' => 'delivery',
                'address_id' => $addressId,
                'items' => [['menu_item_id' => $chickenRice, 'quantity' => 1, 'add_on_option_ids' => [$otherOption]]],
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors(['groups.0.items.0.add_on_option_ids']);

        // 3. Unavailable add-on -> 422
        $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-addon-unavail-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $rest,
                'fulfillment' => 'delivery',
                'address_id' => $addressId,
                'items' => [['menu_item_id' => $chickenRice, 'quantity' => 1, 'add_on_option_ids' => [$soldOutAddOn]]],
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors(['groups.0.items.0.add_on_option_ids']);

        // 4. Exceeding maximum_selections (max 2, sent 3) -> 422
        $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-addon-max-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $rest,
                'fulfillment' => 'delivery',
                'address_id' => $addressId,
                'items' => [['menu_item_id' => $chickenRice, 'quantity' => 1, 'add_on_option_ids' => [$freeChili, $extraEgg, $extraCheese]]],
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors(['groups.0.items.0.add_on_option_ids']);

        // 5. Missing required add-on group on Pork Chop -> 422
        $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-addon-req-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $rest,
                'fulfillment' => 'delivery',
                'address_id' => $addressId,
                'items' => [['menu_item_id' => $otherItem, 'quantity' => 1]],
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors(['groups.0.items.0.add_on_option_ids']);

        // 6. Client expected_total manipulation rejected with 409 using authoritative DB prices
        // Line 1: Chicken Rice (120) + Extra Egg (25) + Extra Cheese (35) = 180 * 2 = 360
        // + Delivery 49 = 409 (NOT 289)
        $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-addon-409-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $rest,
                'fulfillment' => 'delivery',
                'address_id' => $addressId,
                'expected_total' => 289.00,
                'items' => [['menu_item_id' => $chickenRice, 'quantity' => 2, 'add_on_option_ids' => [$extraEgg, $extraCheese]]],
            ]],
        ])->assertStatus(409)->assertJsonPath('data.groups.0.total_amount', 409);

        // 7. Same menu item with identical add-ons merges quantities + different add-ons stays separate lines
        // Line A: Chicken Rice (120) + Chili Garlic (0) + Extra Egg (25) = 145 * (1 + 1) = 290
        // Line B: Chicken Rice (120) + Extra Cheese (35) = 155 * 1 = 155
        // Subtotal = 445, Delivery = 49, Total = 494
        $success = $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'idem-addon-ok-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $rest,
                'fulfillment' => 'delivery',
                'address_id' => $addressId,
                'expected_total' => 494.00,
                'items' => [
                    ['menu_item_id' => $chickenRice, 'quantity' => 1, 'add_on_option_ids' => [$freeChili, $extraEgg]],
                    ['menu_item_id' => $chickenRice, 'quantity' => 1, 'add_on_option_ids' => [$extraEgg, $freeChili]],
                    ['menu_item_id' => $chickenRice, 'quantity' => 1, 'add_on_option_ids' => [$extraCheese]],
                ],
            ]],
        ])->assertStatus(201);

        $order = $success->json('data.checkout.orders.0');
        $this->assertEquals(445.00, $order['subtotal_amount']);
        $this->assertEquals(49.00, $order['delivery_fee']);
        $this->assertEquals(494.00, $order['total_amount']);
        $this->assertCount(2, $order['items']);

        $this->assertSame(2, $order['items'][0]['quantity']);
        $this->assertEquals(290.00, $order['items'][0]['line_total']);
        $this->assertCount(2, $order['items'][0]['add_ons']);

        $this->assertSame(1, $order['items'][1]['quantity']);
        $this->assertEquals(155.00, $order['items'][1]['line_total']);
        $this->assertCount(1, $order['items'][1]['add_ons']);
        $this->assertSame('Extra Cheese', $order['items'][1]['add_ons'][0]['name']);
        $this->assertEquals(35.00, $order['items'][1]['add_ons'][0]['price']);

        // 8. Mutate live add-on option name and price; order detail retains historical snapshot
        DB::table('add_on_options')
            ->where('add_on_option_id', $extraCheese)
            ->update(['option_name' => 'Imported Cheese', 'additional_price' => '99.00']);

        $detail = $this->actingAs($buyer)
            ->getJson('/api/customer/orders/'.$order['order_id'])
            ->assertStatus(200)
            ->json('data.order');

        $this->assertSame('Extra Cheese', $detail['items'][1]['add_ons'][0]['name']);
        $this->assertEquals(35.00, $detail['items'][1]['add_ons'][0]['price']);
        $this->assertEquals(155.00, $detail['items'][1]['line_total']);
    }
}
