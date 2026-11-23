<?php

namespace Tests\Feature;

use App\Features\Payments\Providers\PaymentProviderResolver;
use App\Features\Payments\Providers\XenditPaymentProvider;
use App\Models\User;
use App\Support\AddressService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

class XenditTestModeIntegrationTest extends TestCase
{
    use DatabaseTransactions;

    private function configureXenditTestMode(): void
    {
        config([
            'salo.payments.driver' => 'xendit',
            'services.xendit.mode' => 'test',
            'services.xendit.base_url' => 'https://api.xendit.co',
            'services.xendit.secret_key' => 'xnd_development_mock_test_key_1234567890',
            'services.xendit.webhook_token' => 'xendit_mock_webhook_token_123456',
            'services.xendit.timeout_seconds' => 10,
        ]);
    }

    private function createUser(string $prefix = 'xnd'): User
    {
        return User::forceCreate([
            'username' => "{$prefix}_".random_int(10000, 99999),
            'first_name' => ucfirst($prefix),
            'last_name' => 'Tester',
            'phone_number' => '+639171234567',
            'email' => "{$prefix}_".random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);
    }

    private function createRestaurant(User $owner): int
    {
        $addrId = app(AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '100 Xendit Ave',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Xendit Kitchen '.random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171112222',
            'business_email' => 'xnd_rest_'.random_int(1000, 9999).'@example.com',
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

    private function createPublishedItem(int $restaurantId, string $name = 'Sinigang', string $price = '220.00'): int
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

    public function test_xendit_provider_resolution_enforces_test_mode_and_rejects_live_or_invalid_config(): void
    {
        $this->configureXenditTestMode();
        $resolver = app(PaymentProviderResolver::class);

        $provider = $resolver->resolve();
        $this->assertInstanceOf(XenditPaymentProvider::class, $provider);

        // Live mode rejected
        config(['services.xendit.mode' => 'live']);
        try {
            $resolver->resolve();
            $this->fail('Expected RuntimeException for live mode.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('test mode', strtolower($e->getMessage()));
        }

        // Production key rejected
        $this->configureXenditTestMode();
        config(['services.xendit.secret_key' => 'xnd_production_forbidden_key']);
        try {
            $resolver->resolve();
            $this->fail('Expected RuntimeException for production key.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('secret key', strtolower($e->getMessage()));
        }

        // Unapproved base URL rejected
        $this->configureXenditTestMode();
        config(['services.xendit.base_url' => 'https://evil.example.com']);
        try {
            $resolver->resolve();
            $this->fail('Expected RuntimeException for unapproved base URL.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('base url', strtolower($e->getMessage()));
        }

        // Unsupported channel rejected
        $this->configureXenditTestMode();
        $this->expectException(\InvalidArgumentException::class);
        $provider->mapChannelToXenditMethods('qrph');
    }

    public function test_xendit_checkout_initiation_is_idempotent_and_does_not_mark_paid_or_notify_restaurant(): void
    {
        $this->configureXenditTestMode();

        Http::fake([
            'https://api.xendit.co/v2/invoices' => Http::response([
                'id' => 'inv_test_123456',
                'external_id' => 'SALO-PAY-TEST',
                'status' => 'PENDING',
                'amount' => 220,
                'currency' => 'PHP',
                'invoice_url' => 'https://checkout-staging.xendit.co/web/inv_test_123456',
                'expiry_date' => '2026-11-23T19:00:00.000Z',
            ], 200),
        ]);

        $owner = $this->createUser('xnd_own');
        $customer = $this->createUser('xnd_cust');
        $restId = $this->createRestaurant($owner);
        $itemId = $this->createPublishedItem($restId, 'Sinigang', '220.00');

        $checkoutRes = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'gcash',
                'idempotency_key' => 'idem-xnd-'.random_int(100000, 999999),
                'groups' => [[
                    'restaurant_id' => $restId,
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $itemId, 'quantity' => 1]],
                ]],
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.checkout.payment.payment_status', 'requires_customer_action')
            ->assertJsonPath('data.checkout.payment.provider_reference', 'inv_test_123456')
            ->assertJsonPath('data.checkout.payment.checkout_url', 'https://checkout-staging.xendit.co/web/inv_test_123456');

        $paymentId = (int) $checkoutRes->json('data.checkout.payment.payment_id');
        $orderId = (int) $checkoutRes->json('data.checkout.orders.0.order_id');

        Http::assertSentCount(1);
        Http::assertSent(function ($request) {
            return $request->url() === 'https://api.xendit.co/v2/invoices'
                && $request->hasHeader('Idempotency-Key')
                && $request['payment_methods'] === ['GCASH']
                && $request['currency'] === 'PHP'
                && (float) $request['amount'] === 220.0;
        });

        // Retry initiate endpoint must NOT call Xendit again
        $this->actingAs($customer)
            ->postJson("/api/customer/payments/{$paymentId}/initiate")
            ->assertOk()
            ->assertJsonPath('data.payment.checkout_url', 'https://checkout-staging.xendit.co/web/inv_test_123456');
        Http::assertSentCount(1);

        // Sandbox /confirm must be blocked when driver is xendit
        $this->actingAs($customer)
            ->postJson("/api/customer/payments/{$paymentId}/confirm")
            ->assertStatus(403);

        // Restaurant is NOT notified and CANNOT accept unpaid order
        $this->assertSame(0, DB::table('notifications')->where('type', 'order_received')->where('related_entity_id', $orderId)->count());
        $this->actingAs($owner)
            ->postJson("/api/restaurant/orders/{$orderId}/accept", ['restaurant_id' => $restId])
            ->assertStatus(409);
    }

    public function test_xendit_webhook_verification_idempotency_and_lifecycle_integration(): void
    {
        $this->configureXenditTestMode();

        Http::fake([
            'https://api.xendit.co/v2/invoices' => Http::response([
                'id' => 'inv_test_webhook_001',
                'status' => 'PENDING',
                'invoice_url' => 'https://checkout-staging.xendit.co/web/inv_test_webhook_001',
                'expiry_date' => '2026-11-23T19:00:00.000Z',
            ], 200),
        ]);

        $owner1 = $this->createUser('xw_own1');
        $owner2 = $this->createUser('xw_own2');
        $customer = $this->createUser('xw_cust');
        $rest1 = $this->createRestaurant($owner1);
        $rest2 = $this->createRestaurant($owner2);
        $item1 = $this->createPublishedItem($rest1, 'Kare-Kare', '300.00');
        $item2 = $this->createPublishedItem($rest2, 'Buko Juice', '100.00');

        $checkoutRes = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'maya',
                'idempotency_key' => 'idem-xw-'.random_int(100000, 999999),
                'groups' => [
                    ['restaurant_id' => $rest1, 'fulfillment' => 'pickup', 'items' => [['menu_item_id' => $item1, 'quantity' => 1]]],
                    ['restaurant_id' => $rest2, 'fulfillment' => 'pickup', 'items' => [['menu_item_id' => $item2, 'quantity' => 1]]],
                ],
            ])
            ->assertStatus(201);

        $payment = $checkoutRes->json('data.checkout.payment');
        $paymentId = (int) $payment['payment_id'];
        $paymentRef = $payment['payment_reference'];
        $order1Id = (int) $checkoutRes->json('data.checkout.orders.0.order_id');
        $order2Id = (int) $checkoutRes->json('data.checkout.orders.1.order_id');

        // 1. Invalid callback token rejected (403)
        $this->withHeaders(['x-callback-token' => 'wrong_token'])
            ->postJson('/api/payments/xendit/webhook', [
                'id' => 'inv_test_webhook_001',
                'external_id' => $paymentRef,
                'status' => 'PAID',
                'amount' => 400.00,
                'currency' => 'PHP',
            ])
            ->assertStatus(403);

        // 2. Mismatched amount, currency, invoice ID, or unknown status rejected (422)
        $this->withHeaders(['x-callback-token' => 'xendit_mock_webhook_token_123456'])
            ->postJson('/api/payments/xendit/webhook', [
                'id' => 'inv_test_webhook_001',
                'external_id' => $paymentRef,
                'status' => 'PAID',
                'amount' => 100.00,
                'currency' => 'PHP',
            ])
            ->assertStatus(422);

        $this->withHeaders(['x-callback-token' => 'xendit_mock_webhook_token_123456'])
            ->postJson('/api/payments/xendit/webhook', [
                'id' => 'inv_test_webhook_001',
                'external_id' => $paymentRef,
                'status' => 'UNKNOWN_STATUS',
                'amount' => 400.00,
                'currency' => 'PHP',
            ])
            ->assertStatus(422);

        $this->assertSame('requires_customer_action', DB::table('payments')->where('payment_id', $paymentId)->value('payment_status'));

        // 3. Valid PAID webhook confirms payment, posts 1 ledger journal, notifies both restaurants once
        $this->withHeaders(['x-callback-token' => 'xendit_mock_webhook_token_123456'])
            ->postJson('/api/payments/xendit/webhook', [
                'id' => 'inv_test_webhook_001',
                'external_id' => $paymentRef,
                'status' => 'PAID',
                'amount' => 400.00,
                'currency' => 'PHP',
                'payment_channel' => 'PAYMAYA',
            ])
            ->assertOk()
            ->assertJsonPath('data.payment.payment_status', 'paid');

        $this->assertSame('paid', DB::table('checkouts')->where('checkout_id', $checkoutRes->json('data.checkout.checkout_id'))->value('checkout_status'));
        $this->assertSame(1, DB::table('ledger_journals')->where('payment_id', $paymentId)->count());
        $this->assertSame(1, DB::table('notifications')->where('type', 'order_received')->where('related_entity_id', $order1Id)->count());
        $this->assertSame(1, DB::table('notifications')->where('type', 'order_received')->where('related_entity_id', $order2Id)->count());

        // 4. Duplicate PAID & out-of-order EXPIRED webhooks are idempotent and cannot overwrite paid
        $this->withHeaders(['x-callback-token' => 'xendit_mock_webhook_token_123456'])
            ->postJson('/api/payments/xendit/webhook', [
                'id' => 'inv_test_webhook_001',
                'external_id' => $paymentRef,
                'status' => 'PAID',
                'amount' => 400.00,
                'currency' => 'PHP',
            ])
            ->assertOk()
            ->assertJsonPath('data.payment.payment_status', 'paid');

        $this->withHeaders(['x-callback-token' => 'xendit_mock_webhook_token_123456'])
            ->postJson('/api/payments/xendit/webhook', [
                'id' => 'inv_test_webhook_001',
                'external_id' => $paymentRef,
                'status' => 'EXPIRED',
                'amount' => 400.00,
                'currency' => 'PHP',
            ])
            ->assertOk()
            ->assertJsonPath('data.payment.payment_status', 'paid');

        $this->assertSame(1, DB::table('ledger_journals')->where('payment_id', $paymentId)->count());

        // 5. Restaurant can now accept order
        $this->actingAs($owner1)
            ->postJson("/api/restaurant/orders/{$order1Id}/accept", ['restaurant_id' => $rest1])
            ->assertOk()
            ->assertJsonPath('data.order.order_status', 'accepted');
    }

    public function test_xendit_expired_webhook_and_cod_preservation(): void
    {
        $this->configureXenditTestMode();

        Http::fake([
            'https://api.xendit.co/v2/invoices' => Http::response([
                'id' => 'inv_test_exp_001',
                'status' => 'PENDING',
                'invoice_url' => 'https://checkout-staging.xendit.co/web/inv_test_exp_001',
            ], 200),
        ]);

        $owner = $this->createUser('xexp_own');
        $customer = $this->createUser('xexp_cust');
        $restId = $this->createRestaurant($owner);
        $itemId = $this->createPublishedItem($restId, 'Lumpia', '150.00');

        // COD checkout works without touching Xendit
        $codRes = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'cod',
                'idempotency_key' => 'idem-xcod-'.random_int(100000, 999999),
                'groups' => [[
                    'restaurant_id' => $restId,
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $itemId, 'quantity' => 1]],
                ]],
            ])
            ->assertStatus(201);
        Http::assertNothingSent();
        $codOrderId = (int) $codRes->json('data.checkout.orders.0.order_id');
        $this->actingAs($owner)
            ->postJson("/api/restaurant/orders/{$codOrderId}/accept", ['restaurant_id' => $restId])
            ->assertOk();

        // Card checkout -> EXPIRED webhook keeps order blocked from fulfillment
        $cardRes = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'card',
                'idempotency_key' => 'idem-xexp-'.random_int(100000, 999999),
                'groups' => [[
                    'restaurant_id' => $restId,
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $itemId, 'quantity' => 1]],
                ]],
            ])
            ->assertStatus(201);

        $cardPaymentRef = $cardRes->json('data.checkout.payment.payment_reference');
        $cardOrderId = (int) $cardRes->json('data.checkout.orders.0.order_id');

        $this->withHeaders(['x-callback-token' => 'xendit_mock_webhook_token_123456'])
            ->postJson('/api/payments/xendit/webhook', [
                'id' => 'inv_test_exp_001',
                'external_id' => $cardPaymentRef,
                'status' => 'EXPIRED',
                'amount' => 150.00,
                'currency' => 'PHP',
            ])
            ->assertOk()
            ->assertJsonPath('data.payment.payment_status', 'expired');

        $this->actingAs($owner)
            ->postJson("/api/restaurant/orders/{$cardOrderId}/accept", ['restaurant_id' => $restId])
            ->assertStatus(409);
    }

    public function test_checkout_initiation_failure_is_recoverable_and_idempotent(): void
    {
        $this->configureXenditTestMode();

        $attempt = 0;
        Http::fake([
            'https://api.xendit.co/v2/invoices' => function () use (&$attempt) {
                $attempt++;
                if ($attempt === 1) {
                    return Http::response(['message' => 'Temporary upstream error'], 500);
                }

                return Http::response([
                    'id' => 'inv_retry_success_001',
                    'status' => 'PENDING',
                    'invoice_url' => 'https://checkout-staging.xendit.co/web/inv_retry_success_001',
                ], 200);
            },
        ]);

        $owner = $this->createUser('xrec_own');
        $customer = $this->createUser('xrec_cust');
        $restId = $this->createRestaurant($owner);
        $itemId = $this->createPublishedItem($restId, 'Tapsilog', '180.00');
        $idemKey = 'idem-xrec-'.random_int(100000, 999999);

        // 1. Checkout succeeds even when Xendit fails; payment has no checkout_url and initiation_state=failed
        $res1 = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'gcash',
                'idempotency_key' => $idemKey,
                'groups' => [[
                    'restaurant_id' => $restId,
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $itemId, 'quantity' => 1]],
                ]],
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.checkout.payment.payment_status', 'requires_customer_action')
            ->assertJsonPath('data.checkout.payment.provider_name', 'xendit')
            ->assertJsonPath('data.checkout.payment.initiation_state', 'failed')
            ->assertJsonPath('data.checkout.payment.checkout_url', null);

        $checkoutId = (int) $res1->json('data.checkout.checkout_id');
        $paymentId = (int) $res1->json('data.checkout.payment.payment_id');

        // 2. Idempotent checkout retry returns the same checkout & payment without duplicating orders/allocations
        $res2 = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'gcash',
                'idempotency_key' => $idemKey,
                'groups' => [[
                    'restaurant_id' => $restId,
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $itemId, 'quantity' => 1]],
                ]],
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.checkout.checkout_id', $checkoutId)
            ->assertJsonPath('data.checkout.payment.payment_id', $paymentId);

        $this->assertSame(1, DB::table('orders')->where('checkout_id', $checkoutId)->count());
        $this->assertSame(1, DB::table('payment_allocations')->where('payment_id', $paymentId)->count());
        Http::assertSentCount(1);

        // 3. Customer retries via /initiate and receives validated checkout_url
        $this->actingAs($customer)
            ->postJson("/api/customer/payments/{$paymentId}/initiate")
            ->assertOk()
            ->assertJsonPath('data.payment.initiation_state', 'ready')
            ->assertJsonPath('data.payment.checkout_url', 'https://checkout-staging.xendit.co/web/inv_retry_success_001');

        Http::assertSentCount(2);
    }

    public function test_xendit_webhook_requires_xendit_driver_and_persists_provider_identity(): void
    {
        $this->configureXenditTestMode();

        Http::fake([
            'https://api.xendit.co/v2/invoices' => Http::response([
                'id' => 'inv_drv_guard_001',
                'status' => 'PENDING',
                'invoice_url' => 'https://checkout-staging.xendit.co/web/inv_drv_guard_001',
            ], 200),
        ]);

        $owner = $this->createUser('xdg_own');
        $customer = $this->createUser('xdg_cust');
        $restId = $this->createRestaurant($owner);
        $itemId = $this->createPublishedItem($restId, 'Palabok', '190.00');

        $checkoutRes = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'gcash',
                'idempotency_key' => 'idem-xdg-'.random_int(100000, 999999),
                'groups' => [[
                    'restaurant_id' => $restId,
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $itemId, 'quantity' => 1]],
                ]],
            ])
            ->assertStatus(201);

        $paymentId = (int) $checkoutRes->json('data.checkout.payment.payment_id');
        $paymentRef = $checkoutRes->json('data.checkout.payment.payment_reference');

        // Rejected when driver is sandbox or missing
        config(['salo.payments.driver' => 'sandbox']);
        $this->withHeaders(['x-callback-token' => 'xendit_mock_webhook_token_123456'])
            ->postJson('/api/payments/xendit/webhook', [
                'id' => 'inv_drv_guard_001',
                'external_id' => $paymentRef,
                'status' => 'PAID',
                'amount' => 190.00,
                'currency' => 'PHP',
            ])
            ->assertStatus(403);

        // Rejected when webhook_token is missing
        config(['salo.payments.driver' => 'xendit', 'services.xendit.webhook_token' => '']);
        $this->withHeaders(['x-callback-token' => 'xendit_mock_webhook_token_123456'])
            ->postJson('/api/payments/xendit/webhook', [
                'id' => 'inv_drv_guard_001',
                'external_id' => $paymentRef,
                'status' => 'PAID',
                'amount' => 190.00,
                'currency' => 'PHP',
            ])
            ->assertStatus(403);

        $this->assertSame('requires_customer_action', DB::table('payments')->where('payment_id', $paymentId)->value('payment_status'));

        // Valid Xendit webhook persists provider_name & provider_reference on confirmation
        $this->configureXenditTestMode();
        $this->withHeaders(['x-callback-token' => 'xendit_mock_webhook_token_123456'])
            ->postJson('/api/payments/xendit/webhook', [
                'id' => 'inv_drv_guard_001',
                'external_id' => $paymentRef,
                'status' => 'PAID',
                'amount' => 190.00,
                'currency' => 'PHP',
            ])
            ->assertOk()
            ->assertJsonPath('data.payment.payment_status', 'paid')
            ->assertJsonPath('data.payment.provider_name', 'xendit')
            ->assertJsonPath('data.payment.provider_reference', 'inv_drv_guard_001');
    }

    public function test_concurrent_lock_and_timeout_uncertain_state_protect_initiation(): void
    {
        $this->configureXenditTestMode();

        // Checkout with timeout on initial call
        Http::fake([
            'https://api.xendit.co/v2/invoices' => function () {
                throw new ConnectionException('cURL error 28: Operation timed out');
            },
        ]);

        $owner = $this->createUser('xto_own');
        $customer = $this->createUser('xto_cust');
        $restId = $this->createRestaurant($owner);
        $itemId = $this->createPublishedItem($restId, 'Bulalo', '350.00');

        $checkoutRes = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'maya',
                'idempotency_key' => 'idem-xto-'.random_int(100000, 999999),
                'groups' => [[
                    'restaurant_id' => $restId,
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $itemId, 'quantity' => 1]],
                ]],
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.checkout.payment.payment_status', 'requires_customer_action')
            ->assertJsonPath('data.checkout.payment.initiation_state', 'uncertain');

        $paymentId = (int) $checkoutRes->json('data.checkout.payment.payment_id');

        // Immediate retry is blocked (409) while initiation_state is uncertain within cooldown
        $this->actingAs($customer)
            ->postJson("/api/customer/payments/{$paymentId}/initiate")
            ->assertStatus(409);

        // Simulate cache lock held by another concurrent worker
        $lock = Cache::lock("payment_init_{$paymentId}", 30);
        $this->assertTrue($lock->get());
        try {
            $this->actingAs($customer)
                ->postJson("/api/customer/payments/{$paymentId}/initiate")
                ->assertStatus(409);
        } finally {
            $lock->release();
        }
    }

    public function test_checkout_url_validation_rejects_unsafe_urls_and_accepts_xendit_https(): void
    {
        $provider = app(XenditPaymentProvider::class);

        $this->assertSame(
            'https://checkout.xendit.co/web/inv_123',
            $provider->validateCheckoutUrl('https://checkout.xendit.co/web/inv_123')
        );
        $this->assertSame(
            'https://checkout-staging.xendit.co/web/inv_123',
            $provider->validateCheckoutUrl('https://checkout-staging.xendit.co/web/inv_123')
        );

        $unsafeUrls = [
            'http://checkout.xendit.co/web/inv_123',
            'javascript:alert(1)',
            'https://evil.example.com/pay',
            'https://localhost/pay',
            'https://127.0.0.1/pay',
            'https://user:pass@checkout.xendit.co/web/inv_123',
            'not-a-url',
        ];

        foreach ($unsafeUrls as $badUrl) {
            try {
                $provider->validateCheckoutUrl($badUrl);
                $this->fail("Expected unsafe URL '{$badUrl}' to be rejected.");
            } catch (RuntimeException $e) {
                $this->assertNotEmpty($e->getMessage());
            }
        }
    }
}
