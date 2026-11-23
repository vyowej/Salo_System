<?php

namespace Tests\Feature;

use App\Features\Payments\Services\RefundService;
use App\Models\User;
use App\Support\AddressService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Tests\TestCase;

class RefundDomainHardeningTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $prefix = 'rfh'): User
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
            'street' => '100 Refund Ave',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Refund Kitchen '.random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171112222',
            'business_email' => 'rfh_'.random_int(1000, 9999).'@example.com',
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

    private function createPublishedItem(int $restaurantId, string $name, string $price): int
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

    public function test_multi_restaurant_partial_and_full_refund_lifecycle_and_accounting(): void
    {
        $owner1 = $this->createUser('rf_own1');
        $owner2 = $this->createUser('rf_own2');
        $customer = $this->createUser('rf_cust');
        $rest1 = $this->createRestaurant($owner1);
        $rest2 = $this->createRestaurant($owner2);
        $item1 = $this->createPublishedItem($rest1, 'Sisig', '300.00');
        $item2 = $this->createPublishedItem($rest2, 'Halo-Halo', '200.00');

        $checkoutRes = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'gcash',
                'idempotency_key' => 'idem-rfh-'.random_int(100000, 999999),
                'groups' => [
                    ['restaurant_id' => $rest1, 'fulfillment' => 'pickup', 'items' => [['menu_item_id' => $item1, 'quantity' => 1]]],
                    ['restaurant_id' => $rest2, 'fulfillment' => 'pickup', 'items' => [['menu_item_id' => $item2, 'quantity' => 1]]],
                ],
            ])
            ->assertStatus(201);

        $paymentId = (int) $checkoutRes->json('data.checkout.payment.payment_id');
        $order1Id = (int) $checkoutRes->json('data.checkout.orders.0.order_id');
        $order2Id = (int) $checkoutRes->json('data.checkout.orders.1.order_id');

        $this->actingAs($customer)->postJson("/api/customer/payments/{$paymentId}/confirm")->assertOk();

        // 1. Customer cancels Order 1 -> refund is 'requested', NOT 'successful'; no refund ledger journal yet
        $this->actingAs($customer)
            ->postJson("/api/customer/orders/{$order1Id}/cancel", ['reason' => 'Too slow'])
            ->assertOk()
            ->assertJsonPath('data.order.order_status', 'cancelled');

        $refund1 = DB::table('payments')
            ->where('related_payment_id', $paymentId)
            ->where('payment_type', 'refund')
            ->first();
        $this->assertNotNull($refund1);
        $this->assertSame('requested', $refund1->refund_status);
        $this->assertSame('300.00', (string) $refund1->amount);
        $this->assertNull($refund1->paid_at);
        $this->assertSame('paid', DB::table('payments')->where('payment_id', $paymentId)->value('payment_status'));
        $this->assertSame(0, DB::table('ledger_journals')->where('journal_type', 'refund')->where('payment_id', $refund1->payment_id)->count());
        $this->assertSame(0, DB::table('notifications')->where('type', 'payment_refunded')->where('related_entity_id', $order1Id)->count());
        $this->assertSame(1, DB::table('notifications')->where('type', 'payment_refund_requested')->where('related_entity_id', $order1Id)->count());

        // 2. Duplicate refundOrderIfPaid() call for Order 1 is idempotent
        $refundService = app(RefundService::class);
        $dupRequest = DB::transaction(fn () => $refundService->refundOrderIfPaid($order1Id, (int) $customer->user_id, 'Duplicate'));
        $this->assertSame((int) $refund1->payment_id, $dupRequest['refund_payment_id']);
        $this->assertSame(1, DB::table('payments')->where('related_payment_id', $paymentId)->where('payment_type', 'refund')->count());

        // 3. Confirm refund 1 -> original payment becomes 'partially_refunded', balanced refund ledger posted once
        $refundService->confirmRefundSucceeded((int) $refund1->payment_id, 'rfd_part_1', (int) $owner1->user_id);
        $this->assertSame('partially_refunded', DB::table('payments')->where('payment_id', $paymentId)->value('payment_status'));
        $this->assertSame(1, DB::table('ledger_journals')->where('journal_type', 'refund')->where('payment_id', $refund1->payment_id)->count());
        $this->assertSame(1, DB::table('notifications')->where('type', 'payment_refunded')->where('related_entity_id', $order1Id)->count());

        // Duplicate confirmRefundSucceeded() is idempotent
        $refundService->confirmRefundSucceeded((int) $refund1->payment_id, 'rfd_part_1', (int) $owner1->user_id);
        $this->assertSame(1, DB::table('ledger_journals')->where('journal_type', 'refund')->where('payment_id', $refund1->payment_id)->count());
        $this->assertSame(1, DB::table('notifications')->where('type', 'payment_refunded')->where('related_entity_id', $order1Id)->count());

        // 4. Restaurant 2 rejects Order 2 -> creates requested refund for 200.00, then confirm -> 'refunded'
        $this->actingAs($owner2)
            ->postJson("/api/restaurant/orders/{$order2Id}/reject", ['restaurant_id' => $rest2, 'reason' => 'Out of stock'])
            ->assertOk()
            ->assertJsonPath('data.order.order_status', 'rejected');

        $refund2 = DB::table('payments')
            ->where('related_payment_id', $paymentId)
            ->where('payment_type', 'refund')
            ->where('payment_id', '!=', $refund1->payment_id)
            ->first();
        $this->assertNotNull($refund2);
        $this->assertSame('requested', $refund2->refund_status);
        $this->assertSame('200.00', (string) $refund2->amount);

        $refundService->confirmRefundSucceeded((int) $refund2->payment_id, 'rfd_part_2', (int) $owner2->user_id);
        $this->assertSame('refunded', DB::table('payments')->where('payment_id', $paymentId)->value('payment_status'));
        $this->assertSame(0, DB::table('ledger_unbalanced_journals')->count());
    }

    public function test_failed_refund_releases_reservation_posts_no_ledger_and_over_refund_is_blocked(): void
    {
        $owner = $this->createUser('rf_fail_own');
        $customer = $this->createUser('rf_fail_cust');
        $restId = $this->createRestaurant($owner);
        $itemId = $this->createPublishedItem($restId, 'Adobo', '250.00');

        $checkoutRes = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'maya',
                'idempotency_key' => 'idem-rff-'.random_int(100000, 999999),
                'groups' => [['restaurant_id' => $restId, 'fulfillment' => 'pickup', 'items' => [['menu_item_id' => $itemId, 'quantity' => 1]]]],
            ])
            ->assertStatus(201);

        $paymentId = (int) $checkoutRes->json('data.checkout.payment.payment_id');
        $orderId = (int) $checkoutRes->json('data.checkout.orders.0.order_id');
        $this->actingAs($customer)->postJson("/api/customer/payments/{$paymentId}/confirm")->assertOk();

        $this->actingAs($customer)
            ->postJson("/api/customer/orders/{$orderId}/cancel", ['reason' => 'Cancel test'])
            ->assertOk();

        $refundRow = DB::table('payments')->where('related_payment_id', $paymentId)->where('payment_type', 'refund')->first();
        $refundService = app(RefundService::class);

        // Mark refund failed -> no ledger journal, original payment stays 'paid'
        $refundService->markRefundFailed((int) $refundRow->payment_id, 'Upstream timeout', (int) $customer->user_id);
        $this->assertSame('failed', DB::table('payments')->where('payment_id', $refundRow->payment_id)->value('refund_status'));
        $this->assertSame('paid', DB::table('payments')->where('payment_id', $paymentId)->value('payment_status'));
        $this->assertSame(0, DB::table('ledger_journals')->where('journal_type', 'refund')->where('payment_id', $refundRow->payment_id)->count());

        // Failed refund cannot be confirmed
        try {
            $refundService->confirmRefundSucceeded((int) $refundRow->payment_id);
            $this->fail('Expected ConflictHttpException when confirming failed refund.');
        } catch (ConflictHttpException $e) {
            $this->assertStringContainsString('failed', strtolower($e->getMessage()));
        }

        // Because failed refund released its reservation, retry refundOrderIfPaid() can create a new requested refund
        $retryRefund = DB::transaction(fn () => $refundService->refundOrderIfPaid($orderId, (int) $customer->user_id, 'Retry refund'));
        $this->assertNotNull($retryRefund);
        $this->assertSame('requested', $retryRefund['refund_status']);

        // Over-refund cap: while 250.00 is reserved ('requested') on a 250.00 payment, another 100.00 order sharing the payment is blocked
        $fakeOrderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutRes->json('data.checkout.checkout_id'),
            'restaurant_id' => $restId,
            'customer_id' => $customer->user_id,
            'restaurant_name' => 'Refund Kitchen',
            'customer_name' => 'Tester',
            'order_reference' => 'SALO-ORD-OVR-'.random_int(1000, 9999),
            'order_type' => 'pickup',
            'order_status' => 'cancelled',
            'subtotal_amount' => '100.00',
            'total_amount' => '100.00',
            'placed_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('payment_allocations')->insert([
            'payment_id' => $paymentId,
            'order_id' => $fakeOrderId,
            'allocation_type' => 'order_payment',
            'amount' => '100.00',
            'created_at' => now(),
        ]);

        try {
            DB::transaction(fn () => $refundService->refundOrderIfPaid($fakeOrderId, (int) $customer->user_id, 'Over-refund attempt'));
            $this->fail('Expected ConflictHttpException for over-refund.');
        } catch (ConflictHttpException $e) {
            $this->assertStringContainsString('exceeds', strtolower($e->getMessage()));
        }

        // Confirm retry refund -> successful, cannot be marked failed afterwards
        $refundService->confirmRefundSucceeded((int) $retryRefund['refund_payment_id'], 'rfd_ok');
        try {
            $refundService->markRefundFailed((int) $retryRefund['refund_payment_id'], 'Late fail');
            $this->fail('Expected ConflictHttpException when failing successful refund.');
        } catch (ConflictHttpException $e) {
            $this->assertStringContainsString('successful', strtolower($e->getMessage()));
        }
    }

    public function test_unpaid_online_and_cod_orders_do_not_create_refund_records(): void
    {
        $owner = $this->createUser('rf_no_own');
        $customer = $this->createUser('rf_no_cust');
        $restId = $this->createRestaurant($owner);
        $itemId = $this->createPublishedItem($restId, 'Pancit', '150.00');

        // Unpaid online order -> cancel voids payment instead of creating refund
        $onlineRes = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'card',
                'idempotency_key' => 'idem-rfu-'.random_int(100000, 999999),
                'groups' => [['restaurant_id' => $restId, 'fulfillment' => 'pickup', 'items' => [['menu_item_id' => $itemId, 'quantity' => 1]]]],
            ])
            ->assertStatus(201);
        $onlinePayId = (int) $onlineRes->json('data.checkout.payment.payment_id');
        $onlineOrdId = (int) $onlineRes->json('data.checkout.orders.0.order_id');

        $this->actingAs($customer)->postJson("/api/customer/orders/{$onlineOrdId}/cancel")->assertOk();
        $this->assertSame('cancelled', DB::table('payments')->where('payment_id', $onlinePayId)->value('payment_status'));
        $this->assertSame(0, DB::table('payments')->where('related_payment_id', $onlinePayId)->where('payment_type', 'refund')->count());

        // COD order -> cancel cancels pending cash payment without refund
        $codRes = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'cod',
                'idempotency_key' => 'idem-rfc-'.random_int(100000, 999999),
                'groups' => [['restaurant_id' => $restId, 'fulfillment' => 'pickup', 'items' => [['menu_item_id' => $itemId, 'quantity' => 1]]]],
            ])
            ->assertStatus(201);
        $codOrdId = (int) $codRes->json('data.checkout.orders.0.order_id');
        $this->actingAs($customer)->postJson("/api/customer/orders/{$codOrdId}/cancel")->assertOk();
        $this->assertSame(0, DB::table('payment_allocations')->where('order_id', $codOrdId)->where('allocation_type', 'order_refund')->count());
    }
}
