<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RestaurantOrderHandlingTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'u'): User
    {
        return User::create([
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

    private function createRestaurantWithOrder(User $owner, User $buyer, string $status = 'active'): array
    {
        $addrId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '100 Kitchen Ave',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Order Handling Bistro',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171112222',
            'business_email' => 'bistro_'.random_int(1000, 9999).'@example.com',
            'address_id' => $addrId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepting_orders' => 1,
            'restaurant_status' => $status,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        $catId = (int) DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $restaurantId,
            'category_name' => 'Mains',
            'sort_order' => 0,
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $itemId = (int) DB::table('menu_items')->insertGetId([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'item_name' => 'Beef Kare-Kare',
            'base_price' => '320.00',
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'sort_order' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $checkoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $buyer->user_id,
            'idempotency_key' => 'test-ord-'.random_int(100000, 999999),
            'checkout_status' => 'pending',
            'total_amount' => '320.00',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $restaurantId,
            'customer_id' => $buyer->user_id,
            'restaurant_name' => 'Order Handling Bistro',
            'customer_name' => "{$buyer->first_name} {$buyer->last_name}",
            'order_reference' => 'SALO-ORD-'.random_int(100000, 999999),
            'order_type' => 'pickup',
            'order_priority' => 'standard',
            'order_status' => 'pending',
            'subtotal_amount' => '320.00',
            'delivery_fee' => '0.00',
            'total_amount' => '320.00',
            'placed_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('order_items')->insert([
            'order_id' => $orderId,
            'menu_item_id' => $itemId,
            'item_name' => 'Beef Kare-Kare',
            'unit_price' => '320.00',
            'quantity' => 1,
            'line_total' => '320.00',
            'created_at' => now(),
        ]);

        $paymentId = (int) DB::table('payments')->insertGetId([
            'payment_reference' => 'SALO-PAY-'.random_int(100000, 999999),
            'checkout_id' => $checkoutId,
            'customer_id' => $buyer->user_id,
            'payment_method' => 'cash',
            'payment_type' => 'payment',
            'payment_status' => 'pending',
            'amount' => '320.00',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('payment_allocations')->insert([
            'payment_id' => $paymentId,
            'order_id' => $orderId,
            'allocation_type' => 'order_payment',
            'amount' => '320.00',
            'created_at' => now(),
        ]);

        return [$restaurantId, $orderId, $paymentId];
    }

    private function createAdditionalOrderForRestaurant(int $restaurantId, User $buyer, string $paymentMethod = 'cash', string $paymentStatus = 'pending'): array
    {
        $checkoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $buyer->user_id,
            'idempotency_key' => 'test-ord-'.random_int(100000, 999999),
            'checkout_status' => 'pending',
            'total_amount' => '320.00',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $restaurantId,
            'customer_id' => $buyer->user_id,
            'restaurant_name' => 'Order Handling Bistro',
            'customer_name' => "{$buyer->first_name} {$buyer->last_name}",
            'order_reference' => 'SALO-ORD-'.random_int(100000, 999999),
            'order_type' => 'pickup',
            'order_priority' => 'standard',
            'order_status' => 'pending',
            'subtotal_amount' => '320.00',
            'delivery_fee' => '0.00',
            'total_amount' => '320.00',
            'placed_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $paymentId = (int) DB::table('payments')->insertGetId([
            'payment_reference' => 'SALO-PAY-'.random_int(100000, 999999),
            'checkout_id' => $checkoutId,
            'customer_id' => $buyer->user_id,
            'payment_method' => $paymentMethod,
            'payment_type' => 'payment',
            'payment_status' => $paymentStatus,
            'amount' => '320.00',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('payment_allocations')->insert([
            'payment_id' => $paymentId,
            'order_id' => $orderId,
            'allocation_type' => 'order_payment',
            'amount' => '320.00',
            'created_at' => now(),
        ]);

        return [$orderId, $paymentId];
    }

    public function test_valid_order_transitions_succeed_and_record_actor_audit_logs(): void
    {
        $owner = $this->createUser('customer', 'ordown');
        $buyer = $this->createUser('customer', 'ordbuy');
        [$restId, $orderId, $paymentId] = $this->createRestaurantWithOrder($owner, $buyer);
        [$rejectOrderId] = $this->createAdditionalOrderForRestaurant($restId, $buyer);

        $this->actingAs($owner)->getJson("/api/restaurant/orders?restaurant_id={$restId}")
            ->assertOk()
            ->assertJsonCount(2, 'data.orders');

        $this->actingAs($owner)->getJson("/api/restaurant/orders/{$orderId}?restaurant_id={$restId}")
            ->assertOk()
            ->assertJsonPath('data.order.customer_name', 'Ordbuy Tester')
            ->assertJsonPath('data.order.payment.status', 'pending');

        // pending -> accepted -> preparing -> ready
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/accept", ['restaurant_id' => $restId])
            ->assertOk()
            ->assertJsonPath('data.order.order_status', 'accepted');
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/prepare", ['restaurant_id' => $restId])
            ->assertOk()
            ->assertJsonPath('data.order.order_status', 'preparing');
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/ready", ['restaurant_id' => $restId])
            ->assertOk()
            ->assertJsonPath('data.order.order_status', 'ready');

        // pending -> rejected
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$rejectOrderId}/reject", [
            'restaurant_id' => $restId,
            'reason' => 'Closing soon',
        ])->assertOk()->assertJsonPath('data.order.order_status', 'rejected');

        // Non-rejected COD payment remains pending
        $this->assertSame('pending', DB::table('payments')->where('payment_id', $paymentId)->value('payment_status'));

        foreach (['restaurant_order_accepted', 'restaurant_order_preparing', 'restaurant_order_ready'] as $action) {
            $this->assertDatabaseHas('audit_logs', [
                'entity_type' => 'orders',
                'entity_id' => (string) $orderId,
                'actor_user_id' => $owner->user_id,
                'action' => $action,
            ]);
        }

        $this->assertDatabaseHas('audit_logs', [
            'entity_type' => 'orders',
            'entity_id' => (string) $rejectOrderId,
            'actor_user_id' => $owner->user_id,
            'action' => 'restaurant_order_rejected',
        ]);
    }

    public function test_all_invalid_order_transitions_return_409(): void
    {
        $owner = $this->createUser('customer', 'invown');
        $buyer = $this->createUser('customer', 'invbuy');
        [$restId, $orderId] = $this->createRestaurantWithOrder($owner, $buyer);
        [$rejOrderId] = $this->createAdditionalOrderForRestaurant($restId, $buyer);

        // From pending: prepare and ready are invalid
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/prepare", ['restaurant_id' => $restId])->assertStatus(409);
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/ready", ['restaurant_id' => $restId])->assertStatus(409);

        // Move to accepted: accept, reject, and ready are invalid
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/accept", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/accept", ['restaurant_id' => $restId])->assertStatus(409);
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/reject", ['restaurant_id' => $restId, 'reason' => 'Late'])->assertStatus(409);
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/ready", ['restaurant_id' => $restId])->assertStatus(409);

        // Move to preparing: accept, reject, and prepare are invalid
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/prepare", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/accept", ['restaurant_id' => $restId])->assertStatus(409);
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/reject", ['restaurant_id' => $restId, 'reason' => 'Late'])->assertStatus(409);
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/prepare", ['restaurant_id' => $restId])->assertStatus(409);

        // Move to ready: all 4 actions are invalid
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/ready", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/accept", ['restaurant_id' => $restId])->assertStatus(409);
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/reject", ['restaurant_id' => $restId, 'reason' => 'Late'])->assertStatus(409);
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/prepare", ['restaurant_id' => $restId])->assertStatus(409);
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/ready", ['restaurant_id' => $restId])->assertStatus(409);

        // Rejected is terminal: all 4 actions are invalid
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$rejOrderId}/reject", ['restaurant_id' => $restId, 'reason' => 'Out'])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$rejOrderId}/accept", ['restaurant_id' => $restId])->assertStatus(409);
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$rejOrderId}/reject", ['restaurant_id' => $restId, 'reason' => 'Again'])->assertStatus(409);
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$rejOrderId}/prepare", ['restaurant_id' => $restId])->assertStatus(409);
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$rejOrderId}/ready", ['restaurant_id' => $restId])->assertStatus(409);
    }

    public function test_sequential_double_accept_returns_409(): void
    {
        $owner = $this->createUser('customer', 'dbl');
        $buyer = $this->createUser('customer', 'dblb');
        [$restId, $orderId] = $this->createRestaurantWithOrder($owner, $buyer);

        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/accept", ['restaurant_id' => $restId])
            ->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/accept", ['restaurant_id' => $restId])
            ->assertStatus(409);
    }

    public function test_reject_without_reason_returns_422(): void
    {
        $owner = $this->createUser('customer', 'nr');
        $buyer = $this->createUser('customer', 'nrb');
        [$restId, $orderId] = $this->createRestaurantWithOrder($owner, $buyer);

        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/reject", [
            'restaurant_id' => $restId,
            'reason' => '',
        ])->assertStatus(422)->assertJsonValidationErrors(['reason']);
    }

    public function test_rejected_cod_order_cancels_pending_cash_payment_and_audits_payment_status(): void
    {
        $owner = $this->createUser('customer', 'rejown');
        $buyer = $this->createUser('customer', 'rejbuy');
        [$restId, $orderId, $paymentId] = $this->createRestaurantWithOrder($owner, $buyer);
        [$paidOrderId, $paidPaymentId] = $this->createAdditionalOrderForRestaurant($restId, $buyer, 'cash', 'paid');

        $beforeRefundRows = DB::table('payments')->where('payment_type', 'refund')->count();

        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/reject", [
            'restaurant_id' => $restId,
            'reason' => 'Kitchen ran out of ingredients.',
        ])->assertOk()
            ->assertJsonPath('data.order.order_status', 'rejected')
            ->assertJsonPath('data.order.rejection_reason', 'Kitchen ran out of ingredients.')
            ->assertJsonPath('data.order.payment.status', 'cancelled');

        $this->assertSame('cancelled', DB::table('payments')->where('payment_id', $paymentId)->value('payment_status'));
        $this->assertSame($beforeRefundRows, DB::table('payments')->where('payment_type', 'refund')->count());

        $audit = DB::table('audit_logs')
            ->where('entity_type', 'orders')
            ->where('entity_id', (string) $orderId)
            ->where('action', 'restaurant_order_rejected')
            ->first();
        $this->assertNotNull($audit);
        $this->assertSame('pending', json_decode((string) $audit->old_values, true)['payment_status'] ?? null);
        $this->assertSame('cancelled', json_decode((string) $audit->new_values, true)['payment_status'] ?? null);

        // Never touch a payment that is not pending
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$paidOrderId}/reject", [
            'restaurant_id' => $restId,
            'reason' => 'Closed',
        ])->assertOk();
        $this->assertSame('paid', DB::table('payments')->where('payment_id', $paidPaymentId)->value('payment_status'));

        // Customer sees rejected status, rejection_reason, and cancelled payment status
        $this->actingAs($buyer)->getJson("/api/customer/orders/{$orderId}")
            ->assertOk()
            ->assertJsonPath('data.order.order_status', 'rejected')
            ->assertJsonPath('data.order.rejection_reason', 'Kitchen ran out of ingredients.')
            ->assertJsonPath('data.order.payment.status', 'cancelled');
    }

    public function test_cross_restaurant_order_access_returns_404_and_non_owner_returns_403(): void
    {
        $ownerA = $this->createUser('customer', 'ownA');
        $ownerB = $this->createUser('customer', 'ownB');
        $buyer = $this->createUser('customer', 'buy');
        $pendingOwner = $this->createUser('customer', 'pend');

        [$restA, $orderA] = $this->createRestaurantWithOrder($ownerA, $buyer, 'active');
        [$restB] = $this->createRestaurantWithOrder($ownerB, $buyer, 'active');
        [$restPend, $orderPend] = $this->createRestaurantWithOrder($pendingOwner, $buyer, 'pending');

        $this->getJson('/api/restaurant/orders')->assertStatus(401);
        $this->actingAs($buyer)->getJson('/api/restaurant/orders')->assertStatus(403);
        $this->actingAs($pendingOwner)->getJson("/api/restaurant/orders?restaurant_id={$restPend}")->assertStatus(403);
        $this->actingAs($pendingOwner)->postJson("/api/restaurant/orders/{$orderPend}/accept", ['restaurant_id' => $restPend])->assertStatus(403);

        $this->actingAs($ownerB)->getJson("/api/restaurant/orders/{$orderA}?restaurant_id={$restB}")->assertStatus(404);
        $this->actingAs($ownerB)->postJson("/api/restaurant/orders/{$orderA}/accept", ['restaurant_id' => $restB])->assertStatus(404);
        $this->actingAs($ownerB)->getJson("/api/restaurant/orders?restaurant_id={$restA}")->assertStatus(403);
    }

    public function test_order_permissions_follow_restaurant_hierarchy_and_position_config(): void
    {
        $ownerA = $this->createUser('customer', 'hownA');
        $ownerB = $this->createUser('customer', 'hownB');
        $buyer = $this->createUser('customer', 'hbuy');

        $manager = $this->createUser('customer', 'hmgr');
        $orderHandler = $this->createUser('customer', 'hord');
        $orderStaff = $this->createUser('customer', 'hostf');
        $reservationStaff = $this->createUser('customer', 'hres');
        $inactiveManager = $this->createUser('customer', 'hinact');

        [$restA, $order1] = $this->createRestaurantWithOrder($ownerA, $buyer, 'active');
        [$order2] = $this->createAdditionalOrderForRestaurant($restA, $buyer);
        [$order3] = $this->createAdditionalOrderForRestaurant($restA, $buyer);
        [$restB, $orderB] = $this->createRestaurantWithOrder($ownerB, $buyer, 'active');

        $insertStaff = static function (int $restaurantId, User $staffUser, string $position, string $status): void {
            DB::table('restaurant_staff')->insert([
                'restaurant_id' => $restaurantId,
                'user_id' => $staffUser->user_id,
                'staff_position' => $position,
                'staff_status' => $status,
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        };

        $insertStaff($restA, $manager, '  manager ', 'active');
        $insertStaff($restA, $orderHandler, 'Order Handler', 'active');
        $insertStaff($restA, $orderStaff, 'Order Staff', 'active');
        $insertStaff($restA, $reservationStaff, 'Reservation Handler', 'active');
        $insertStaff($restA, $inactiveManager, 'Manager', 'inactive');

        // Manager can handle orders and writes own actor_user_id
        $this->actingAs($manager)->postJson("/api/restaurant/orders/{$order1}/accept", ['restaurant_id' => $restA])->assertOk();
        $this->actingAs($orderHandler)->postJson("/api/restaurant/orders/{$order1}/prepare", ['restaurant_id' => $restA])->assertOk();
        $this->actingAs($orderStaff)->postJson("/api/restaurant/orders/{$order1}/ready", ['restaurant_id' => $restA])->assertOk();
        $this->actingAs($manager)->postJson("/api/restaurant/orders/{$order2}/reject", ['restaurant_id' => $restA, 'reason' => 'Full'])->assertOk();
        $this->actingAs($ownerA)->postJson("/api/restaurant/orders/{$order3}/accept", ['restaurant_id' => $restA])->assertOk();

        $this->assertDatabaseHas('audit_logs', ['entity_type' => 'orders', 'entity_id' => (string) $order1, 'action' => 'restaurant_order_accepted', 'actor_user_id' => $manager->user_id]);
        $this->assertDatabaseHas('audit_logs', ['entity_type' => 'orders', 'entity_id' => (string) $order1, 'action' => 'restaurant_order_preparing', 'actor_user_id' => $orderHandler->user_id]);
        $this->assertDatabaseHas('audit_logs', ['entity_type' => 'orders', 'entity_id' => (string) $order1, 'action' => 'restaurant_order_ready', 'actor_user_id' => $orderStaff->user_id]);
        $this->assertDatabaseHas('audit_logs', ['entity_type' => 'orders', 'entity_id' => (string) $order2, 'action' => 'restaurant_order_rejected', 'actor_user_id' => $manager->user_id]);

        // Reservation Handler and inactive staff get 403 on every restaurant order endpoint
        foreach ([$reservationStaff, $inactiveManager] as $deniedUser) {
            $this->actingAs($deniedUser)->getJson("/api/restaurant/orders?restaurant_id={$restA}")->assertStatus(403);
            $this->actingAs($deniedUser)->getJson("/api/restaurant/orders/{$order3}?restaurant_id={$restA}")->assertStatus(403);
            $this->actingAs($deniedUser)->postJson("/api/restaurant/orders/{$order3}/prepare", ['restaurant_id' => $restA])->assertStatus(403);
        }

        // Manager of restaurant A trying to view or act on restaurant B's order is denied
        $this->actingAs($manager)->getJson("/api/restaurant/orders/{$orderB}")->assertStatus(404);
        $this->actingAs($manager)->postJson("/api/restaurant/orders/{$orderB}/accept")->assertStatus(404);
        $this->actingAs($manager)->getJson("/api/restaurant/orders/{$orderB}?restaurant_id={$restB}")->assertStatus(403);
        $this->actingAs($manager)->postJson("/api/restaurant/orders/{$orderB}/accept", ['restaurant_id' => $restB])->assertStatus(403);
    }

    private function createDeliveryOrderForRestaurant(int $restaurantId, User $buyer): array
    {
        $checkoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $buyer->user_id,
            'idempotency_key' => 'test-deliv-'.random_int(100000, 999999),
            'checkout_status' => 'pending',
            'total_amount' => '369.00',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $restaurantId,
            'customer_id' => $buyer->user_id,
            'restaurant_name' => 'Order Handling Bistro',
            'customer_name' => "{$buyer->first_name} {$buyer->last_name}",
            'order_reference' => 'SALO-ORD-'.random_int(100000, 999999),
            'order_type' => 'delivery',
            'order_priority' => 'standard',
            'order_status' => 'ready',
            'delivery_recipient_name' => "{$buyer->first_name} {$buyer->last_name}",
            'delivery_phone' => '09171234567',
            'delivery_address_text' => '123 Katipunan Ave, Quezon City',
            'subtotal_amount' => '320.00',
            'delivery_fee' => '49.00',
            'total_amount' => '369.00',
            'placed_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $paymentId = (int) DB::table('payments')->insertGetId([
            'payment_reference' => 'SALO-PAY-'.random_int(100000, 999999),
            'checkout_id' => $checkoutId,
            'customer_id' => $buyer->user_id,
            'payment_method' => 'cash',
            'payment_type' => 'payment',
            'payment_status' => 'pending',
            'amount' => '369.00',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('payment_allocations')->insert([
            'payment_id' => $paymentId,
            'order_id' => $orderId,
            'allocation_type' => 'order_payment',
            'amount' => '369.00',
            'created_at' => now(),
        ]);

        return [$orderId, $paymentId];
    }

    public function test_complete_pickup_order_succeeds_marks_payment_paid_and_writes_audit_log(): void
    {
        $owner = $this->createUser('customer', 'cmpown');
        $buyer = $this->createUser('customer', 'cmpbuy');
        [$restId, $orderId, $paymentId] = $this->createRestaurantWithOrder($owner, $buyer);

        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/accept", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/prepare", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/ready", ['restaurant_id' => $restId])->assertOk();

        $res = $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/complete", ['restaurant_id' => $restId])
            ->assertOk()
            ->assertJsonPath('data.order.order_status', 'completed')
            ->assertJsonPath('data.order.payment.status', 'paid');

        $this->assertNotNull($res->json('data.order.completed_at'));
        $this->assertSame($res->json('data.order.completed_at'), $res->json('data.order.payment.paid_at'));

        $paymentRow = DB::table('payments')->where('payment_id', $paymentId)->first();
        $this->assertSame('paid', $paymentRow->payment_status);
        $this->assertNotNull($paymentRow->paid_at);

        $orderRow = DB::table('orders')->where('order_id', $orderId)->first();
        $this->assertSame((string) $orderRow->completed_at, (string) $paymentRow->paid_at);

        $audit = DB::table('audit_logs')
            ->where('entity_type', 'orders')
            ->where('entity_id', (string) $orderId)
            ->where('action', 'restaurant_order_completed')
            ->first();
        $this->assertNotNull($audit);
        $this->assertSame($owner->user_id, (int) $audit->actor_user_id);
        $this->assertSame('ready', json_decode((string) $audit->old_values, true)['order_status'] ?? null);
        $this->assertSame('completed', json_decode((string) $audit->new_values, true)['order_status'] ?? null);
        $this->assertSame('pending', json_decode((string) $audit->old_values, true)['payment_status'] ?? null);
        $this->assertSame('paid', json_decode((string) $audit->new_values, true)['payment_status'] ?? null);
    }

    public function test_complete_returns_409_for_delivery_non_ready_completed_rejected_and_cancelled(): void
    {
        $owner = $this->createUser('customer', 'c409own');
        $buyer = $this->createUser('customer', 'c409buy');
        [$restId, $pendingId] = $this->createRestaurantWithOrder($owner, $buyer);
        [$deliveryReadyId] = $this->createDeliveryOrderForRestaurant($restId, $buyer);
        [$completedId] = $this->createAdditionalOrderForRestaurant($restId, $buyer);
        [$rejectedId] = $this->createAdditionalOrderForRestaurant($restId, $buyer);
        [$cancelledId] = $this->createAdditionalOrderForRestaurant($restId, $buyer);

        // Delivery ready -> 409
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$deliveryReadyId}/complete", ['restaurant_id' => $restId])
            ->assertStatus(409);

        // Non-ready (pending) -> 409
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$pendingId}/complete", ['restaurant_id' => $restId])
            ->assertStatus(409);

        // Already completed -> 409
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$completedId}/accept", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$completedId}/prepare", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$completedId}/ready", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$completedId}/complete", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$completedId}/complete", ['restaurant_id' => $restId])
            ->assertStatus(409);

        // Rejected -> 409
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$rejectedId}/reject", ['restaurant_id' => $restId, 'reason' => 'Closed'])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$rejectedId}/complete", ['restaurant_id' => $restId])
            ->assertStatus(409);

        // Cancelled -> 409
        $this->actingAs($buyer)->postJson("/api/customer/orders/{$cancelledId}/cancel")->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$cancelledId}/complete", ['restaurant_id' => $restId])
            ->assertStatus(409);
    }

    public function test_complete_returns_403_for_disallowed_or_inactive_staff_and_404_for_other_restaurant(): void
    {
        $ownerA = $this->createUser('customer', 'cpermA');
        $ownerB = $this->createUser('customer', 'cpermB');
        $buyer = $this->createUser('customer', 'cpermbuy');
        $reservationStaff = $this->createUser('customer', 'cresstf');
        $inactiveHandler = $this->createUser('customer', 'cinact');

        [$restA, $orderA] = $this->createRestaurantWithOrder($ownerA, $buyer);
        [$restB] = $this->createRestaurantWithOrder($ownerB, $buyer);

        $this->actingAs($ownerA)->postJson("/api/restaurant/orders/{$orderA}/accept", ['restaurant_id' => $restA])->assertOk();
        $this->actingAs($ownerA)->postJson("/api/restaurant/orders/{$orderA}/prepare", ['restaurant_id' => $restA])->assertOk();
        $this->actingAs($ownerA)->postJson("/api/restaurant/orders/{$orderA}/ready", ['restaurant_id' => $restA])->assertOk();

        DB::table('restaurant_staff')->insert([
            [
                'restaurant_id' => $restA,
                'user_id' => $reservationStaff->user_id,
                'staff_position' => 'Reservation Handler',
                'staff_status' => 'active',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'restaurant_id' => $restA,
                'user_id' => $inactiveHandler->user_id,
                'staff_position' => 'Order Handler',
                'staff_status' => 'inactive',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $this->actingAs($reservationStaff)->postJson("/api/restaurant/orders/{$orderA}/complete", ['restaurant_id' => $restA])
            ->assertStatus(403);
        $this->actingAs($inactiveHandler)->postJson("/api/restaurant/orders/{$orderA}/complete", ['restaurant_id' => $restA])
            ->assertStatus(403);
        $this->actingAs($ownerB)->postJson("/api/restaurant/orders/{$orderA}/complete", ['restaurant_id' => $restB])
            ->assertStatus(404);
    }

    public function test_complete_only_changes_pending_cash_payment(): void
    {
        $owner = $this->createUser('customer', 'cpayown');
        $buyer = $this->createUser('customer', 'cpaybuy');
        [$restId] = $this->createRestaurantWithOrder($owner, $buyer);
        [$paidOrderId, $paidPaymentId] = $this->createAdditionalOrderForRestaurant($restId, $buyer, 'cash', 'paid');

        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$paidOrderId}/accept", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$paidOrderId}/prepare", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$paidOrderId}/ready", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$paidOrderId}/complete", ['restaurant_id' => $restId])->assertOk();

        $payment = DB::table('payments')->where('payment_id', $paidPaymentId)->first();
        $this->assertSame('paid', $payment->payment_status);
        $this->assertNull($payment->paid_at);
    }

    public function test_customer_cancel_pending_order_cancels_payment_and_writes_audit_log(): void
    {
        $owner = $this->createUser('customer', 'ccown');
        $buyer = $this->createUser('customer', 'ccbuy');
        [$restId, $orderId, $paymentId] = $this->createRestaurantWithOrder($owner, $buyer);

        $beforeRefunds = DB::table('payments')->where('payment_type', 'refund')->count();

        $res = $this->actingAs($buyer)->postJson("/api/customer/orders/{$orderId}/cancel", [
            'reason' => 'Ordered by mistake',
        ])->assertOk()
            ->assertJsonPath('data.order.order_status', 'cancelled')
            ->assertJsonPath('data.order.cancelled_by', 'customer')
            ->assertJsonPath('data.order.cancellation_reason', 'Ordered by mistake')
            ->assertJsonPath('data.order.payment.status', 'cancelled');

        $this->assertNotNull($res->json('data.order.cancelled_at'));
        $this->assertSame('cancelled', DB::table('payments')->where('payment_id', $paymentId)->value('payment_status'));
        $this->assertSame($beforeRefunds, DB::table('payments')->where('payment_type', 'refund')->count());

        $audit = DB::table('audit_logs')
            ->where('entity_type', 'orders')
            ->where('entity_id', (string) $orderId)
            ->where('action', 'customer_order_cancelled')
            ->first();
        $this->assertNotNull($audit);
        $this->assertSame($buyer->user_id, (int) $audit->actor_user_id);
        $this->assertSame('pending', json_decode((string) $audit->old_values, true)['order_status'] ?? null);
        $this->assertSame('cancelled', json_decode((string) $audit->new_values, true)['order_status'] ?? null);
        $this->assertSame('pending', json_decode((string) $audit->old_values, true)['payment_status'] ?? null);
        $this->assertSame('cancelled', json_decode((string) $audit->new_values, true)['payment_status'] ?? null);
    }

    public function test_customer_cancel_returns_409_after_accepted_rejected_or_completed_and_404_for_other_customer(): void
    {
        $owner = $this->createUser('customer', 'cc409own');
        $buyerA = $this->createUser('customer', 'cc409A');
        $buyerB = $this->createUser('customer', 'cc409B');
        [$restId, $acceptedId] = $this->createRestaurantWithOrder($owner, $buyerA);
        [$rejectedId] = $this->createAdditionalOrderForRestaurant($restId, $buyerA);
        [$completedId] = $this->createAdditionalOrderForRestaurant($restId, $buyerA);
        [$otherOrderId] = $this->createAdditionalOrderForRestaurant($restId, $buyerA);

        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$acceptedId}/accept", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($buyerA)->postJson("/api/customer/orders/{$acceptedId}/cancel")->assertStatus(409);

        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$rejectedId}/reject", ['restaurant_id' => $restId, 'reason' => 'No stock'])->assertOk();
        $this->actingAs($buyerA)->postJson("/api/customer/orders/{$rejectedId}/cancel")->assertStatus(409);

        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$completedId}/accept", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$completedId}/prepare", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$completedId}/ready", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$completedId}/complete", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($buyerA)->postJson("/api/customer/orders/{$completedId}/cancel")->assertStatus(409);

        $this->actingAs($buyerB)->postJson("/api/customer/orders/{$otherOrderId}/cancel")->assertStatus(404);
    }

    public function test_restaurant_accept_or_reject_on_cancelled_order_returns_409(): void
    {
        $owner = $this->createUser('customer', 'rconown');
        $buyer = $this->createUser('customer', 'rconbuy');
        [$restId, $orderId] = $this->createRestaurantWithOrder($owner, $buyer);

        $this->actingAs($buyer)->postJson("/api/customer/orders/{$orderId}/cancel")->assertOk();

        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/accept", ['restaurant_id' => $restId])
            ->assertStatus(409);
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/reject", ['restaurant_id' => $restId, 'reason' => 'Too late'])
            ->assertStatus(409);
    }

    public function test_order_and_payment_timestamps_are_consistent_asia_manila_format(): void
    {
        $owner = $this->createUser('customer', 'tzown');
        $buyer = $this->createUser('customer', 'tzbuy');
        [$restId, $completedId] = $this->createRestaurantWithOrder($owner, $buyer);
        [$rejectedId] = $this->createAdditionalOrderForRestaurant($restId, $buyer);
        [$cancelledId] = $this->createAdditionalOrderForRestaurant($restId, $buyer);

        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$completedId}/accept", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$completedId}/prepare", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$completedId}/ready", ['restaurant_id' => $restId])->assertOk();
        $completed = $this->actingAs($owner)->postJson("/api/restaurant/orders/{$completedId}/complete", ['restaurant_id' => $restId])
            ->assertOk()
            ->json('data.order');

        $rejected = $this->actingAs($owner)->postJson("/api/restaurant/orders/{$rejectedId}/reject", ['restaurant_id' => $restId, 'reason' => 'Closed'])
            ->assertOk()
            ->json('data.order');

        $cancelled = $this->actingAs($buyer)->postJson("/api/customer/orders/{$cancelledId}/cancel")
            ->assertOk()
            ->json('data.order');

        $manilaIsoRegex = '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/';
        foreach ([
            $completed['placed_at'],
            $completed['accepted_at'],
            $completed['completed_at'],
            $completed['payment']['paid_at'],
            $rejected['rejected_at'],
            $cancelled['cancelled_at'],
        ] as $ts) {
            $this->assertMatchesRegularExpression($manilaIsoRegex, (string) $ts);
        }
    }

    public function test_customer_and_restaurant_orders_list_status_filter_totals_and_query_counts(): void
    {
        $owner = $this->createUser('customer', 'perfownord');
        $buyer = $this->createUser('customer', 'perfbuyord');
        [$restId, $order1Id] = $this->createRestaurantWithOrder($owner, $buyer);
        [$order2Id] = $this->createAdditionalOrderForRestaurant($restId, $buyer);
        [$order3Id] = $this->createAdditionalOrderForRestaurant($restId, $buyer);

        // Move order2Id to accepted and order3Id to cancelled
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$order2Id}/accept", ['restaurant_id' => $restId])->assertOk();
        $this->actingAs($buyer)->postJson("/api/customer/orders/{$order3Id}/cancel")->assertOk();

        // Customer list unfiltered and filtered by status
        DB::flushQueryLog();
        DB::enableQueryLog();
        $custAll = $this->actingAs($buyer)->getJson('/api/customer/orders')
            ->assertOk()
            ->assertJsonPath('data.pagination.total', 3);
        $this->assertLessThanOrEqual(6, count(DB::getQueryLog()), 'GET /api/customer/orders must execute at most 6 SQL queries.');
        $this->assertCount(3, $custAll->json('data.orders'));

        DB::flushQueryLog();
        $this->actingAs($buyer)->getJson('/api/customer/orders?status=accepted')
            ->assertOk()
            ->assertJsonPath('data.pagination.total', 1)
            ->assertJsonPath('data.orders.0.order_id', $order2Id);
        $this->assertLessThanOrEqual(6, count(DB::getQueryLog()));

        // Restaurant list unfiltered and filtered by status
        DB::flushQueryLog();
        $restAll = $this->actingAs($owner)->getJson("/api/restaurant/orders?restaurant_id={$restId}")
            ->assertOk()
            ->assertJsonPath('data.pagination.total', 3);
        $this->assertLessThanOrEqual(10, count(DB::getQueryLog()), 'GET /api/restaurant/orders must execute at most 10 SQL queries.');
        $this->assertCount(3, $restAll->json('data.orders'));

        DB::flushQueryLog();
        $this->actingAs($owner)->getJson("/api/restaurant/orders?restaurant_id={$restId}&status=cancelled")
            ->assertOk()
            ->assertJsonPath('data.pagination.total', 1)
            ->assertJsonPath('data.orders.0.order_id', $order3Id);
        $this->assertLessThanOrEqual(10, count(DB::getQueryLog()));
    }
}
