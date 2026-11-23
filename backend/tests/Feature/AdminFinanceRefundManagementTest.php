<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\AddressService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AdminFinanceRefundManagementTest extends TestCase
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

    private function createUser(string $role = 'customer', string $prefix = 'afr'): User
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
            'street' => '100 Admin Finance Ave',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Admin Finance Kitchen '.random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171112222',
            'business_email' => 'afr_'.random_int(1000, 9999).'@example.com',
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

    private function createPublishedItem(int $restaurantId, string $name = 'Lechon', string $price = '400.00'): int
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

    public function test_non_admin_users_cannot_access_admin_finance_refund_or_event_endpoints(): void
    {
        $customer = $this->createUser('customer', 'nonadm');

        $this->getJson('/api/admin/finance/refunds')->assertStatus(401);
        $this->actingAs($customer)->getJson('/api/admin/finance/refunds')->assertStatus(403);
        $this->actingAs($customer)->getJson('/api/admin/finance/refunds/1')->assertStatus(403);
        $this->actingAs($customer)->postJson('/api/admin/finance/refunds/1/submit')->assertStatus(403);
        $this->actingAs($customer)->getJson('/api/admin/finance/events')->assertStatus(403);
    }

    public function test_admin_refund_listing_detail_submission_reconciliation_and_events(): void
    {
        $this->configureXenditTestMode();

        $admin = $this->createUser('admin', 'fin_adm');
        $owner = $this->createUser('customer', 'fin_own');
        $customer = $this->createUser('customer', 'fin_cust');
        $restId = $this->createRestaurant($owner);
        $itemId = $this->createPublishedItem($restId, 'Lechon Kawali', '400.00');

        Http::fake([
            'https://api.xendit.co/v2/invoices' => Http::response([
                'id' => 'inv_admin_fin_001',
                'status' => 'PENDING',
                'invoice_url' => 'https://checkout-staging.xendit.co/web/inv_admin_fin_001',
            ], 200),
        ]);

        $chkRes = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'gcash',
                'idempotency_key' => 'idem-afr-'.random_int(100000, 999999),
                'groups' => [[
                    'restaurant_id' => $restId,
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $itemId, 'quantity' => 1]],
                ]],
            ])
            ->assertStatus(201);

        $pay = $chkRes->json('data.checkout.payment');
        $orderId = (int) $chkRes->json('data.checkout.orders.0.order_id');

        $this->withHeaders(['x-callback-token' => 'xendit_mock_webhook_token_123456'])
            ->postJson('/api/payments/xendit/webhook', [
                'id' => 'inv_admin_fin_001',
                'external_id' => $pay['payment_reference'],
                'status' => 'PAID',
                'amount' => 400.00,
                'currency' => 'PHP',
            ])->assertOk();

        $this->actingAs($customer)->postJson("/api/customer/orders/{$orderId}/cancel", ['reason' => 'Change of plans'])->assertOk();

        $refundRow = DB::table('payments')->where('related_payment_id', $pay['payment_id'])->where('payment_type', 'refund')->first();
        $refundId = (int) $refundRow->payment_id;

        // 1. Admin lists & filters refunds
        $this->actingAs($admin)
            ->getJson("/api/admin/finance/refunds?refund_status=requested&provider=xendit&search={$refundRow->payment_reference}")
            ->assertOk()
            ->assertJsonPath('data.items.0.refund_id', $refundId)
            ->assertJsonPath('data.items.0.refund_status', 'requested')
            ->assertJsonPath('data.items.0.can_submit', true)
            ->assertJsonPath('data.items.0.original_provider_payment_id', 'inv_admin_fin_001');

        // 2. Reconciliation shows requested refund is NOT counted in confirmed_refunds_total
        $ledgerBefore = $this->actingAs($admin)
            ->getJson('/api/admin/finance/ledger')
            ->assertOk()
            ->json('data');
        $this->assertGreaterThanOrEqual(400.0, (float) $ledgerBefore['reconciliation']['requested_refunds_total']);

        // 3. Admin submits refund to Xendit (mocked PENDING -> submitted)
        Http::fake([
            'https://api.xendit.co/refunds' => Http::response([
                'id' => 'rfd_admin_001',
                'status' => 'PENDING',
                'amount' => 400,
                'currency' => 'PHP',
            ], 201),
        ]);

        $this->actingAs($admin)
            ->postJson("/api/admin/finance/refunds/{$refundId}/submit")
            ->assertOk()
            ->assertJsonPath('data.refund.refund_status', 'submitted')
            ->assertJsonPath('data.refund.provider_refund_id', 'rfd_admin_001')
            ->assertJsonPath('data.refund.can_submit', false);

        // Verify admin audit log recorded
        $this->assertTrue(
            DB::table('audit_logs')
                ->where('action', 'admin_refund_submission_triggered')
                ->where('entity_type', 'payments')
                ->where('entity_id', $refundId)
                ->exists()
        );

        // 4. Confirm via webhook -> refund becomes successful, ledger entries visible in detail
        $this->withHeaders(['x-callback-token' => 'xendit_mock_webhook_token_123456'])
            ->postJson('/api/payments/xendit/refund-webhook', [
                'event' => 'refund.succeeded',
                'data' => [
                    'refund_id' => 'rfd_admin_001',
                    'reference_id' => $refundRow->payment_reference,
                    'status' => 'SUCCEEDED',
                    'amount' => 400,
                    'currency' => 'PHP',
                ],
            ])->assertOk();

        $detailRes = $this->actingAs($admin)
            ->getJson("/api/admin/finance/refunds/{$refundId}")
            ->assertOk()
            ->assertJsonPath('data.refund.refund_status', 'successful')
            ->assertJsonPath('data.refund.ledger_journals.0.journal_type', 'refund');
        $this->assertNotEmpty($detailRes->json('data.refund.payment_events'));
        $this->assertNotEmpty($detailRes->json('data.refund.audit_logs'));

        // 5. Payment events endpoint returns sanitized events
        $this->actingAs($admin)
            ->getJson('/api/admin/finance/events?provider_name=xendit&processing_status=processed')
            ->assertOk()
            ->assertJsonStructure(['data' => ['items', 'pagination']]);
    }

    public function test_admin_refund_submit_marks_uncertain_on_timeout_and_blocks_unsafe_retry(): void
    {
        $this->configureXenditTestMode();

        $admin = $this->createUser('admin', 'fto_adm');
        $owner = $this->createUser('customer', 'fto_own');
        $customer = $this->createUser('customer', 'fto_cust');
        $restId = $this->createRestaurant($owner);
        $itemId = $this->createPublishedItem($restId, 'Sinigang', '250.00');

        Http::fake([
            'https://api.xendit.co/v2/invoices' => Http::response([
                'id' => 'inv_fto_001',
                'status' => 'PENDING',
                'invoice_url' => 'https://checkout-staging.xendit.co/web/inv_fto_001',
            ], 200),
        ]);

        $chkRes = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'maya',
                'idempotency_key' => 'idem-fto-'.random_int(100000, 999999),
                'groups' => [[
                    'restaurant_id' => $restId,
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $itemId, 'quantity' => 1]],
                ]],
            ])
            ->assertStatus(201);

        $pay = $chkRes->json('data.checkout.payment');
        $orderId = (int) $chkRes->json('data.checkout.orders.0.order_id');

        $this->withHeaders(['x-callback-token' => 'xendit_mock_webhook_token_123456'])
            ->postJson('/api/payments/xendit/webhook', [
                'id' => 'inv_fto_001',
                'external_id' => $pay['payment_reference'],
                'status' => 'PAID',
                'amount' => 250.00,
                'currency' => 'PHP',
            ])->assertOk();

        $this->actingAs($customer)->postJson("/api/customer/orders/{$orderId}/cancel")->assertOk();
        $refundId = (int) DB::table('payments')->where('related_payment_id', $pay['payment_id'])->where('payment_type', 'refund')->value('payment_id');

        Http::fake([
            'https://api.xendit.co/refunds' => fn () => throw new ConnectionException('Timed out'),
        ]);

        $this->actingAs($admin)
            ->postJson("/api/admin/finance/refunds/{$refundId}/submit")
            ->assertStatus(504);

        $this->actingAs($admin)
            ->getJson("/api/admin/finance/refunds/{$refundId}")
            ->assertOk()
            ->assertJsonPath('data.refund.submission_state', 'uncertain')
            ->assertJsonPath('data.refund.can_submit', false)
            ->assertJsonPath('data.refund.needs_manual_review', true);

        $this->actingAs($admin)
            ->postJson("/api/admin/finance/refunds/{$refundId}/submit")
            ->assertStatus(409);
    }
}
