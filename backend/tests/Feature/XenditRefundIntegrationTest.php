<?php

namespace Tests\Feature;

use App\Features\Payments\Exceptions\XenditTimeoutException;
use App\Features\Payments\Providers\XenditPaymentProvider;
use App\Features\Payments\Services\RefundService;
use App\Models\User;
use App\Support\AddressService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class XenditRefundIntegrationTest extends TestCase
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

    private function createUser(string $prefix = 'xrfd'): User
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
            'street' => '100 Xendit Refund Ave',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Xendit Refund Kitchen '.random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171112222',
            'business_email' => 'xrfd_'.random_int(1000, 9999).'@example.com',
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

        DB::table('restaurants')->where('restaurant_id', $restaurantId)->update([
            'brand_restaurant_id' => $restaurantId,
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

    private function createPublishedItem(int $restaurantId, string $name = 'Sinigang', string $price = '200.00'): int
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

    private function createPaidXenditOrder(User $customer, int $restId, int $itemId, string $invoiceId = 'inv_xrfd_001'): array
    {
        Http::fake([
            'https://api.xendit.co/v2/invoices' => Http::response([
                'id' => $invoiceId,
                'status' => 'PENDING',
                'invoice_url' => "https://checkout-staging.xendit.co/web/{$invoiceId}",
            ], 200),
        ]);

        $res = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'gcash',
                'idempotency_key' => 'idem-xrfd-'.random_int(100000, 999999),
                'groups' => [[
                    'restaurant_id' => $restId,
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $itemId, 'quantity' => 1]],
                ]],
            ])
            ->assertStatus(201);

        $payment = $res->json('data.checkout.payment');
        $orderId = (int) $res->json('data.checkout.orders.0.order_id');

        $this->withHeaders(['x-callback-token' => 'xendit_mock_webhook_token_123456'])
            ->postJson('/api/payments/xendit/webhook', [
                'id' => $invoiceId,
                'external_id' => $payment['payment_reference'],
                'status' => 'PAID',
                'amount' => $payment['amount'],
                'currency' => 'PHP',
            ])
            ->assertOk();

        return ['payment_id' => (int) $payment['payment_id'], 'order_id' => $orderId, 'invoice_id' => $invoiceId];
    }

    public function test_xendit_provider_refund_contract_and_timeout_handling(): void
    {
        $this->configureXenditTestMode();
        $provider = app(XenditPaymentProvider::class);

        Http::fake([
            'https://api.xendit.co/refunds' => Http::response([
                'id' => 'rfd_contract_001',
                'status' => 'PENDING',
                'amount' => 200,
                'currency' => 'PHP',
            ], 201),
        ]);

        $res = $provider->refundPayment([
            'refund_reference' => 'SALO-REF-CONTRACT-1',
            'provider_payment_id' => 'inv_contract_1',
            'amount' => 200.00,
            'currency' => 'PHP',
            'reason' => 'Customer cancelled',
            'idempotency_key' => 'salo-rfd-SALO-REF-CONTRACT-1',
        ]);

        $this->assertSame('xendit', $res['provider_name']);
        $this->assertSame('rfd_contract_001', $res['provider_refund_id']);
        $this->assertSame('submitted', $res['refund_status']);

        Http::assertSent(function ($request) {
            return $request->url() === 'https://api.xendit.co/refunds'
                && $request->hasHeader('idempotency-key', 'salo-rfd-SALO-REF-CONTRACT-1')
                && $request['invoice_id'] === 'inv_contract_1'
                && $request['reference_id'] === 'SALO-REF-CONTRACT-1'
                && (float) $request['amount'] === 200.0
                && $request['currency'] === 'PHP';
        });

        // Timeout throws XenditTimeoutException
        Http::fake([
            'https://api.xendit.co/refunds' => fn () => throw new ConnectionException('Timed out'),
        ]);
        $this->expectException(XenditTimeoutException::class);
        $provider->refundPayment([
            'refund_reference' => 'SALO-REF-TO-1',
            'provider_payment_id' => 'inv_contract_1',
            'amount' => 200.00,
            'currency' => 'PHP',
            'reason' => 'Cancel',
            'idempotency_key' => 'salo-rfd-SALO-REF-TO-1',
        ]);
    }

    public function test_async_pending_refund_submission_and_verified_refund_webhook_lifecycle(): void
    {
        $this->configureXenditTestMode();
        $owner = $this->createUser('xrw_own');
        $customer = $this->createUser('xrw_cust');
        $restId = $this->createRestaurant($owner);
        $itemId = $this->createPublishedItem($restId, 'Kare-Kare', '200.00');

        $ctx = $this->createPaidXenditOrder($customer, $restId, $itemId, 'inv_xrfd_async_001');

        // Customer cancels order -> creates 'requested' refund
        $this->actingAs($customer)->postJson("/api/customer/orders/{$ctx['order_id']}/cancel", ['reason' => 'Changed mind'])->assertOk();
        $refundRow = DB::table('payments')->where('related_payment_id', $ctx['payment_id'])->where('payment_type', 'refund')->first();
        $this->assertSame('requested', $refundRow->refund_status);

        // Submit to Xendit -> returns PENDING ('submitted'), NO ledger journal yet, original payment provider_payment_id preserved
        Http::fake([
            'https://api.xendit.co/refunds' => Http::response([
                'id' => 'rfd_async_001',
                'status' => 'PENDING',
                'amount' => 200,
                'currency' => 'PHP',
            ], 201),
        ]);

        $refundService = app(RefundService::class);
        $submitted = $refundService->submitRefundToProvider((int) $refundRow->payment_id, (int) $customer->user_id);
        $this->assertSame('submitted', $submitted['refund_status']);
        $this->assertSame('rfd_async_001', $submitted['provider_refund_id']);
        $this->assertSame('inv_xrfd_async_001', DB::table('payments')->where('payment_id', $ctx['payment_id'])->value('provider_payment_id'));
        $this->assertSame('rfd_async_001', DB::table('payments')->where('payment_id', $refundRow->payment_id)->value('provider_payment_id'));
        $this->assertSame(0, DB::table('ledger_journals')->where('journal_type', 'refund')->where('payment_id', $refundRow->payment_id)->count());

        // Duplicate submitRefundToProvider() returns idempotently without calling Xendit again
        $dupSubmit = $refundService->submitRefundToProvider((int) $refundRow->payment_id, (int) $customer->user_id);
        $this->assertSame('submitted', $dupSubmit['refund_status']);
        Http::assertSentCount(1);

        // Invalid refund webhooks rejected (403, 422, 404)
        $this->withHeaders(['x-callback-token' => 'wrong'])
            ->postJson('/api/payments/xendit/refund-webhook', [
                'event' => 'refund.succeeded',
                'data' => ['refund_id' => 'rfd_async_001', 'reference_id' => $refundRow->payment_reference, 'status' => 'SUCCEEDED', 'amount' => 200, 'currency' => 'PHP'],
            ])->assertStatus(403);

        $this->withHeaders(['x-callback-token' => 'xendit_mock_webhook_token_123456'])
            ->postJson('/api/payments/xendit/refund-webhook', [
                'event' => 'refund.succeeded',
                'data' => ['refund_id' => 'rfd_async_001', 'reference_id' => $refundRow->payment_reference, 'status' => 'SUCCEEDED', 'amount' => 150, 'currency' => 'PHP'],
            ])->assertStatus(422);

        $this->withHeaders(['x-callback-token' => 'xendit_mock_webhook_token_123456'])
            ->postJson('/api/payments/xendit/refund-webhook', [
                'event' => 'refund.succeeded',
                'data' => ['refund_id' => 'rfd_wrong_id', 'reference_id' => $refundRow->payment_reference, 'status' => 'SUCCEEDED', 'amount' => 200, 'currency' => 'PHP'],
            ])->assertStatus(422);

        // Valid refund.succeeded webhook confirms refund, updates original payment -> 'refunded', posts 1 balanced ledger journal
        $this->withHeaders(['x-callback-token' => 'xendit_mock_webhook_token_123456'])
            ->postJson('/api/payments/xendit/refund-webhook', [
                'event' => 'refund.succeeded',
                'data' => ['refund_id' => 'rfd_async_001', 'reference_id' => $refundRow->payment_reference, 'status' => 'SUCCEEDED', 'amount' => 200, 'currency' => 'PHP'],
            ])
            ->assertOk()
            ->assertJsonPath('data.refund.refund_status', 'successful');

        $this->assertSame('refunded', DB::table('payments')->where('payment_id', $ctx['payment_id'])->value('payment_status'));
        $this->assertSame(1, DB::table('ledger_journals')->where('journal_type', 'refund')->where('payment_id', $refundRow->payment_id)->count());
        $this->assertSame(0, DB::table('ledger_unbalanced_journals')->count());

        // Duplicate refund.succeeded & out-of-order refund.failed are idempotent and cannot overwrite successful
        $this->withHeaders(['x-callback-token' => 'xendit_mock_webhook_token_123456'])
            ->postJson('/api/payments/xendit/refund-webhook', [
                'event' => 'refund.succeeded',
                'data' => ['refund_id' => 'rfd_async_001', 'reference_id' => $refundRow->payment_reference, 'status' => 'SUCCEEDED', 'amount' => 200, 'currency' => 'PHP'],
            ])->assertOk()->assertJsonPath('data.refund.refund_status', 'successful');

        $this->withHeaders(['x-callback-token' => 'xendit_mock_webhook_token_123456'])
            ->postJson('/api/payments/xendit/refund-webhook', [
                'event' => 'refund.failed',
                'data' => ['refund_id' => 'rfd_async_001', 'reference_id' => $refundRow->payment_reference, 'status' => 'FAILED', 'amount' => 200, 'currency' => 'PHP'],
            ])->assertOk()->assertJsonPath('data.refund.refund_status', 'successful');

        $this->assertSame(1, DB::table('ledger_journals')->where('journal_type', 'refund')->where('payment_id', $refundRow->payment_id)->count());
    }

    public function test_refund_submission_timeout_retains_reservation_and_lock_contention_blocks_duplicate(): void
    {
        $this->configureXenditTestMode();
        $owner = $this->createUser('xrto_own');
        $customer = $this->createUser('xrto_cust');
        $restId = $this->createRestaurant($owner);
        $itemId = $this->createPublishedItem($restId, 'Bulalo', '300.00');

        $ctx = $this->createPaidXenditOrder($customer, $restId, $itemId, 'inv_xrfd_to_001');
        $this->actingAs($customer)->postJson("/api/customer/orders/{$ctx['order_id']}/cancel", ['reason' => 'Cancel'])->assertOk();
        $refundRow = DB::table('payments')->where('related_payment_id', $ctx['payment_id'])->where('payment_type', 'refund')->first();
        $refundId = (int) $refundRow->payment_id;

        $refundService = app(RefundService::class);

        // Lock contention returns 409
        $lock = Cache::lock("refund_submit_{$refundId}", 30);
        $this->assertTrue($lock->get());
        try {
            $this->expectException(ConflictHttpException::class);
            $refundService->submitRefundToProvider($refundId);
        } finally {
            $lock->release();
        }

        // Timeout throws 504, retains 'requested' status & reservation, posts no ledger journal
        Http::fake([
            'https://api.xendit.co/refunds' => fn () => throw new ConnectionException('Timed out'),
        ]);
        try {
            $refundService->submitRefundToProvider($refundId);
            $this->fail('Expected HttpException 504 on timeout.');
        } catch (HttpException $e) {
            $this->assertSame(504, $e->getStatusCode());
        }

        $this->assertSame('requested', DB::table('payments')->where('payment_id', $refundId)->value('refund_status'));
        $this->assertSame(0, DB::table('ledger_journals')->where('journal_type', 'refund')->where('payment_id', $refundId)->count());

        // Immediate retry is blocked (409) during uncertain cooldown
        $this->expectException(ConflictHttpException::class);
        $refundService->submitRefundToProvider($refundId);
    }
}
