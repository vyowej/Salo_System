<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\AddressService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PaymentSecurityHardeningTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'psh'): User
    {
        return User::forceCreate([
            'username' => "{$prefix}_".random_int(10000, 99999),
            'first_name' => ucfirst($prefix),
            'last_name' => 'Tester',
            'phone_number' => '+639171234567',
            'email' => "{$prefix}_".random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createRestaurant(User $owner): int
    {
        $addrId = app(AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '100 Security Ave',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Hardened Kitchen '.random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171112222',
            'business_email' => 'hardened_'.random_int(1000, 9999).'@example.com',
            'address_id' => $addrId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepting_orders' => 1,
            'inventory_deduction_mode' => 'manual',
            'restaurant_status' => 'active',
            'is_published' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        for ($day = 0; $day <= 6; $day++) {
            DB::table('operating_hours')->insert([
                'restaurant_id' => $restaurantId,
                'day_of_week' => $day,
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

    private function createPublishedItem(int $restaurantId, string $name = 'Adobo', string $price = '250.00'): int
    {
        $catId = (int) DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $restaurantId,
            'category_name' => 'Mains '.random_int(10, 99),
            'sort_order' => 1,
            'is_active' => 1,
            'draft_state' => 'clean',
            'is_published' => 1,
            'published_category_name' => 'Mains',
            'published_sort_order' => 1,
            'published_is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return (int) DB::table('menu_items')->insertGetId([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'item_name' => $name,
            'base_price' => $price,
            'low_stock_threshold' => 5,
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'sort_order' => 1,
            'draft_state' => 'clean',
            'is_published' => 1,
            'published_menu_category_id' => $catId,
            'published_item_name' => $name,
            'published_base_price' => $price,
            'published_sort_order' => 1,
            'published_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function createOnlineCheckout(User $customer, array $restaurantItems, string $method = 'gcash'): array
    {
        $groups = array_map(fn (array $pair): array => [
            'restaurant_id' => $pair['restaurant_id'],
            'fulfillment' => 'pickup',
            'items' => [['menu_item_id' => $pair['item_id'], 'quantity' => 1]],
        ], $restaurantItems);

        $res = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => $method,
                'idempotency_key' => 'idem-psh-'.random_int(100000, 999999),
                'groups' => $groups,
            ])
            ->assertStatus(201);

        return $res->json('data.checkout');
    }

    public function test_sandbox_endpoints_are_rejected_in_production_or_when_disabled(): void
    {
        $owner = $this->createUser('customer', 'prod_own');
        $customer = $this->createUser('customer', 'prod_cust');
        $restId = $this->createRestaurant($owner);
        $itemId = $this->createPublishedItem($restId);

        $checkout = $this->createOnlineCheckout($customer, [['restaurant_id' => $restId, 'item_id' => $itemId]]);
        $paymentId = (int) $checkout['payment']['payment_id'];
        $beforeJournals = DB::table('ledger_journals')->count();

        // 1. Rejected when APP_ENV is production (bypass CSRF/session middleware to assert controller/service 403 directly)
        $originalEnv = $this->app['env'];
        $this->app['env'] = 'production';
        try {
            $this->withoutMiddleware()
                ->actingAs($customer)
                ->postJson("/api/customer/payments/{$paymentId}/confirm")
                ->assertStatus(403);

            $this->withoutMiddleware()
                ->actingAs($customer)
                ->postJson("/api/customer/payments/{$paymentId}/fail")
                ->assertStatus(403);

            $this->withoutMiddleware()
                ->postJson('/api/payments/webhook', [
                    'payment_id' => $paymentId,
                    'status' => 'paid',
                ])->assertStatus(403);
        } finally {
            $this->app['env'] = $originalEnv;
        }

        // 2. Rejected when driver is not sandbox
        config(['salo.payments.driver' => 'xendit']);
        $this->actingAs($customer)
            ->postJson("/api/customer/payments/{$paymentId}/confirm")
            ->assertStatus(403);
        $this->postJson('/api/payments/webhook', [
            'payment_id' => $paymentId,
            'status' => 'paid',
        ])->assertStatus(403);

        // 3. Rejected when sandbox_enabled is false
        config(['salo.payments.driver' => 'sandbox', 'salo.payments.sandbox_enabled' => false]);
        $this->actingAs($customer)
            ->postJson("/api/customer/payments/{$paymentId}/confirm")
            ->assertStatus(403);
        $this->actingAs($customer)
            ->postJson("/api/customer/payments/{$paymentId}/fail")
            ->assertStatus(403);

        $orderId = (int) $checkout['orders'][0]['order_id'];
        $this->assertSame('requires_customer_action', DB::table('payments')->where('payment_id', $paymentId)->value('payment_status'));
        $this->assertSame($beforeJournals, DB::table('ledger_journals')->count());
        $this->assertSame(0, DB::table('notifications')->where('type', 'order_received')->where('related_entity_id', $orderId)->count());
    }

    public function test_sandbox_ownership_cod_and_invalid_state_protections(): void
    {
        $owner = $this->createUser('customer', 'own2');
        $customer = $this->createUser('customer', 'cust2');
        $otherCustomer = $this->createUser('customer', 'other2');
        $restId = $this->createRestaurant($owner);
        $itemId = $this->createPublishedItem($restId);

        $onlineCheckout = $this->createOnlineCheckout($customer, [['restaurant_id' => $restId, 'item_id' => $itemId]]);
        $paymentId = (int) $onlineCheckout['payment']['payment_id'];

        // Another customer cannot confirm or fail this payment
        $this->actingAs($otherCustomer)
            ->postJson("/api/customer/payments/{$paymentId}/confirm")
            ->assertStatus(404);
        $this->actingAs($otherCustomer)
            ->postJson("/api/customer/payments/{$paymentId}/fail")
            ->assertStatus(404);

        // Fail payment, then verify it cannot be confirmed afterwards
        $this->actingAs($customer)
            ->postJson("/api/customer/payments/{$paymentId}/fail", ['reason' => 'User cancelled'])
            ->assertOk()
            ->assertJsonPath('data.payment.payment_status', 'failed');

        $this->actingAs($customer)
            ->postJson("/api/customer/payments/{$paymentId}/confirm")
            ->assertStatus(409);

        // COD checkout cannot be confirmed via online sandbox endpoint
        $codCheckout = $this->createOnlineCheckout($customer, [['restaurant_id' => $restId, 'item_id' => $itemId]], 'cod');
        $codOrderId = (int) $codCheckout['orders'][0]['order_id'];
        $codPaymentId = (int) DB::table('payment_allocations')->where('order_id', $codOrderId)->value('payment_id');

        $this->actingAs($customer)
            ->postJson("/api/customer/payments/{$codPaymentId}/confirm")
            ->assertStatus(409);
    }

    public function test_unpaid_online_orders_cannot_enter_fulfillment_and_do_not_notify_restaurant_until_paid(): void
    {
        $owner = $this->createUser('customer', 'gate_own');
        $customer = $this->createUser('customer', 'gate_cust');
        $restId = $this->createRestaurant($owner);
        $itemId = $this->createPublishedItem($restId);

        $checkout = $this->createOnlineCheckout($customer, [['restaurant_id' => $restId, 'item_id' => $itemId]], 'maya');
        $paymentId = (int) $checkout['payment']['payment_id'];
        $orderId = (int) $checkout['orders'][0]['order_id'];

        // Unpaid online order does not trigger restaurant order_received notification
        $this->assertSame(
            0,
            DB::table('notifications')
                ->where('type', 'order_received')
                ->where('related_entity_type', 'order')
                ->where('related_entity_id', $orderId)
                ->count()
        );

        // Restaurant cannot accept unpaid online order
        $this->actingAs($owner)
            ->postJson("/api/restaurant/orders/{$orderId}/accept", [
                'restaurant_id' => $restId,
            ])
            ->assertStatus(409);

        // Confirm payment via sandbox
        $this->actingAs($customer)
            ->postJson("/api/customer/payments/{$paymentId}/confirm")
            ->assertOk()
            ->assertJsonPath('data.payment.payment_status', 'paid');

        // Restaurant receives order_received notification once
        $this->assertSame(
            1,
            DB::table('notifications')
                ->where('type', 'order_received')
                ->where('related_entity_type', 'order')
                ->where('related_entity_id', $orderId)
                ->count()
        );

        // Duplicate confirmation does not duplicate ledger journals or notifications
        $journalsAfterFirst = DB::table('ledger_journals')->where('payment_id', $paymentId)->count();
        $this->assertSame(1, $journalsAfterFirst);

        $this->actingAs($customer)
            ->postJson("/api/customer/payments/{$paymentId}/confirm")
            ->assertOk()
            ->assertJsonPath('data.payment.payment_status', 'paid');

        $this->assertSame(1, DB::table('ledger_journals')->where('payment_id', $paymentId)->count());
        $this->assertSame(
            1,
            DB::table('notifications')
                ->where('type', 'order_received')
                ->where('related_entity_type', 'order')
                ->where('related_entity_id', $orderId)
                ->count()
        );

        // Now restaurant can accept, prepare, ready, and complete the paid pickup order
        foreach (['accept' => 'accepted', 'prepare' => 'preparing', 'ready' => 'ready', 'complete' => 'completed'] as $action => $expected) {
            $this->actingAs($owner)
                ->postJson("/api/restaurant/orders/{$orderId}/{$action}", [
                    'restaurant_id' => $restId,
                ])
                ->assertOk()
                ->assertJsonPath('data.order.order_status', $expected);
        }
    }

    public function test_cod_notifications_and_transitions_remain_intact_and_multi_restaurant_confirm_notifies_each(): void
    {
        $owner1 = $this->createUser('customer', 'mr_own1');
        $owner2 = $this->createUser('customer', 'mr_own2');
        $customer = $this->createUser('customer', 'mr_cust');
        $rest1 = $this->createRestaurant($owner1);
        $rest2 = $this->createRestaurant($owner2);
        $item1 = $this->createPublishedItem($rest1, 'Sisig', '200.00');
        $item2 = $this->createPublishedItem($rest2, 'Halo-Halo', '150.00');

        // COD checkout notifies immediately and allows immediate acceptance
        $codCheckout = $this->createOnlineCheckout($customer, [['restaurant_id' => $rest1, 'item_id' => $item1]], 'cod');
        $codOrderId = (int) $codCheckout['orders'][0]['order_id'];
        $this->assertSame(
            1,
            DB::table('notifications')
                ->where('type', 'order_received')
                ->where('related_entity_id', $codOrderId)
                ->count()
        );
        $this->actingAs($owner1)
            ->postJson("/api/restaurant/orders/{$codOrderId}/accept", [
                'restaurant_id' => $rest1,
            ])
            ->assertOk()
            ->assertJsonPath('data.order.order_status', 'accepted');

        // Multi-restaurant online checkout
        $onlineCheckout = $this->createOnlineCheckout($customer, [
            ['restaurant_id' => $rest1, 'item_id' => $item1],
            ['restaurant_id' => $rest2, 'item_id' => $item2],
        ], 'card');

        $paymentId = (int) $onlineCheckout['payment']['payment_id'];
        $order1Id = (int) $onlineCheckout['orders'][0]['order_id'];
        $order2Id = (int) $onlineCheckout['orders'][1]['order_id'];

        $this->assertSame(0, DB::table('notifications')->where('type', 'order_received')->whereIn('related_entity_id', [$order1Id, $order2Id])->count());

        $this->actingAs($customer)
            ->postJson("/api/customer/payments/{$paymentId}/confirm")
            ->assertOk()
            ->assertJsonPath('data.payment.payment_status', 'paid');

        $this->assertSame('paid', DB::table('checkouts')->where('checkout_id', $onlineCheckout['checkout_id'])->value('checkout_status'));
        $this->assertSame(1, DB::table('notifications')->where('type', 'order_received')->where('related_entity_id', $order1Id)->count());
        $this->assertSame(1, DB::table('notifications')->where('type', 'order_received')->where('related_entity_id', $order2Id)->count());
    }
}
