<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\AddressService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OrderingCompletionTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'ord'): User
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

    private function createRestaurant(User $owner, string $deductionMode = 'manual'): int
    {
        $addrId = app(AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '100 Kitchen Ave',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Complete Kitchen '.random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171112222',
            'business_email' => 'rest_'.random_int(1000, 9999).'@example.com',
            'address_id' => $addrId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepting_orders' => 1,
            'inventory_deduction_mode' => $deductionMode,
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

    private function createPublishedItem(int $restaurantId, string $name = 'Adobo', string $price = '150.00', ?int $stock = null): int
    {
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
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return (int) DB::table('menu_items')->insertGetId([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'item_name' => $name,
            'base_price' => $price,
            'stock_quantity' => $stock,
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

    public function test_inventory_stock_validation_and_auto_deduction_on_completion(): void
    {
        $owner = $this->createUser('customer', 'invown');
        $customer = $this->createUser('customer', 'invcust');
        $restId = $this->createRestaurant($owner, 'on_completion');
        $itemId = $this->createPublishedItem($restId, 'Lechon Kawali', '200.00', 4);

        // 1. Update stock to 0 -> auto marks sold_out; restock to 3 -> restores available
        $this->actingAs($owner)
            ->patchJson("/api/restaurant/inventory/items/{$itemId}", ['stock_quantity' => 0])
            ->assertOk()
            ->assertJsonPath('data.item.availability_status', 'sold_out');

        $this->actingAs($owner)
            ->patchJson("/api/restaurant/inventory/items/{$itemId}", ['stock_quantity' => 3, 'low_stock_threshold' => 2])
            ->assertOk()
            ->assertJsonPath('data.item.availability_status', 'available')
            ->assertJsonPath('data.item.stock_quantity', 3);

        // 2. Customer tries to order qty 5 when stock is 3 -> 422
        $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'cod',
                'idempotency_key' => 'idem-stock-over-'.random_int(10000, 99999),
                'groups' => [[
                    'restaurant_id' => $restId,
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $itemId, 'quantity' => 5]],
                ]],
            ])
            ->assertStatus(422);

        // 3. Customer orders qty 2 -> succeeds, stock stays 3 until completion
        $checkoutRes = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'cod',
                'idempotency_key' => 'idem-stock-ok-'.random_int(10000, 99999),
                'groups' => [[
                    'restaurant_id' => $restId,
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $itemId, 'quantity' => 2]],
                ]],
            ])
            ->assertStatus(201);

        $orderId = (int) $checkoutRes->json('data.checkout.orders.0.order_id');

        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/accept")->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/prepare")->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/ready")->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/complete")->assertOk();

        $itemRow = DB::table('menu_items')->where('menu_item_id', $itemId)->first();
        $this->assertSame(1, (int) $itemRow->stock_quantity);
        $this->assertNotNull(DB::table('orders')->where('order_id', $orderId)->value('inventory_deducted_at'));
    }

    public function test_owner_promo_crud_and_checkout_promo_redemption(): void
    {
        $owner = $this->createUser('customer', 'prmown');
        $customer = $this->createUser('customer', 'prmcust');
        $restId = $this->createRestaurant($owner);
        $itemId = $this->createPublishedItem($restId, 'Sisig', '250.00');

        $code = 'OWNER'.random_int(100, 999);
        $createRes = $this->actingAs($owner)
            ->postJson('/api/restaurant/promos', [
                'promo_code' => $code,
                'promo_name' => 'Owner 20% Off',
                'discount_type' => 'percentage',
                'discount_value' => 20,
                'minimum_order_amount' => 100,
                'starts_at' => now()->subHour()->toDateTimeString(),
                'ends_at' => now()->addDays(7)->toDateTimeString(),
                'usage_limit' => 5,
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.promo.promo_code', $code)
            ->assertJsonPath('data.promo.funding_source', 'restaurant');

        $promoId = (int) $createRes->json('data.promo.promo_id');

        $this->actingAs($owner)
            ->getJson('/api/restaurant/promos')
            ->assertOk()
            ->assertJsonPath('data.items.0.promo_code', $code);

        // Checkout with promo code (2 * 250 = 500, 20% off = 100, net = 400)
        $checkoutRes = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'cod',
                'promo_code' => $code,
                'idempotency_key' => 'idem-promo-'.random_int(10000, 99999),
                'groups' => [[
                    'restaurant_id' => $restId,
                    'fulfillment' => 'pickup',
                    'expected_total' => 400.00,
                    'items' => [['menu_item_id' => $itemId, 'quantity' => 2]],
                ]],
            ])
            ->assertStatus(201);

        $orderId = (int) $checkoutRes->json('data.checkout.orders.0.order_id');
        $orderRow = DB::table('orders')->where('order_id', $orderId)->first();
        $this->assertSame($promoId, (int) $orderRow->promo_id);
        $this->assertSame('100.00', (string) $orderRow->discount_amount);
        $this->assertSame('100.00', (string) $orderRow->restaurant_discount_amount);
        $this->assertSame('400.00', (string) $orderRow->total_amount);

        $this->assertSame(1, (int) DB::table('promos')->where('promo_id', $promoId)->value('used_count'));
    }

    public function test_online_gcash_checkout_confirm_cancel_refund_and_sales_ledger(): void
    {
        $admin = $this->createUser('admin', 'payadm');
        $owner = $this->createUser('customer', 'payown');
        $customer = $this->createUser('customer', 'paycust');
        $restId = $this->createRestaurant($owner);
        $itemId = $this->createPublishedItem($restId, 'Kare-Kare', '300.00');

        // 1. Online GCash checkout
        $checkoutRes = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'gcash',
                'idempotency_key' => 'idem-gcash-'.random_int(10000, 99999),
                'groups' => [[
                    'restaurant_id' => $restId,
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => $itemId, 'quantity' => 1]],
                ]],
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.checkout.payment_method', 'gcash')
            ->assertJsonPath('data.checkout.payment.payment_status', 'requires_customer_action');

        $paymentId = (int) $checkoutRes->json('data.checkout.payment.payment_id');
        $orderId = (int) $checkoutRes->json('data.checkout.orders.0.order_id');

        // 2. Confirm online payment
        $this->actingAs($customer)
            ->postJson("/api/customer/payments/{$paymentId}/confirm")
            ->assertOk()
            ->assertJsonPath('data.payment.payment_status', 'paid');

        // 3. Cancel paid pending order -> creates requested refund (not prematurely successful or ledger-posted)
        $this->actingAs($customer)
            ->postJson("/api/customer/orders/{$orderId}/cancel", ['reason' => 'Changed mind'])
            ->assertOk()
            ->assertJsonPath('data.order.order_status', 'cancelled');

        $originalPayment = DB::table('payments')->where('payment_id', $paymentId)->first();
        $this->assertSame('paid', $originalPayment->payment_status);

        $refundRow = DB::table('payments')
            ->where('related_payment_id', $paymentId)
            ->where('payment_type', 'refund')
            ->first();
        $this->assertNotNull($refundRow);
        $this->assertSame('requested', $refundRow->refund_status);
        $this->assertSame('300.00', (string) $refundRow->amount);
        $this->assertSame(0, DB::table('ledger_journals')->where('journal_type', 'refund')->where('payment_id', $refundRow->payment_id)->count());

        // Confirm refund via domain method -> marks original payment refunded & posts balanced ledger
        app(\App\Features\Payments\Services\RefundService::class)->confirmRefundSucceeded((int) $refundRow->payment_id, 'rfd_test_1', (int) $admin->user_id);
        $this->assertSame('refunded', DB::table('payments')->where('payment_id', $paymentId)->value('payment_status'));
        $this->assertSame(1, DB::table('ledger_journals')->where('journal_type', 'refund')->where('payment_id', $refundRow->payment_id)->count());

        // 4. Verify Admin Ledger & Owner Sales Report
        $this->actingAs($admin)
            ->getJson('/api/admin/finance/ledger')
            ->assertOk()
            ->assertJsonPath('data.summary.unbalanced_count', 0);

        $this->actingAs($owner)
            ->getJson('/api/restaurant/reports/sales')
            ->assertOk()
            ->assertJsonPath('data.summary.orders_count', 1)
            ->assertJsonPath('data.summary.cancelled_count', 1);
    }
}
