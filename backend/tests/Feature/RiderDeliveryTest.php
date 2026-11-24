<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RiderDeliveryTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'r9b', string $firstName = 'Rider'): User
    {
        return User::forceCreate([
            'username' => "{$prefix}_".random_int(10000, 99999),
            'first_name' => $firstName,
            'last_name' => 'Tester',
            'phone_number' => '+639171234567',
            'email' => "{$prefix}_".random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createRiderRecord(User $user, string $status = 'active'): int
    {
        $cityId = (int) (DB::table('cities')->value('city_id')
            ?? DB::table('cities')->insertGetId([
                'province_id' => DB::table('provinces')->value('province_id')
                    ?? DB::table('provinces')->insertGetId(['province_name' => 'Metro Manila']),
                'city_name' => 'Quezon City',
            ]));

        return (int) DB::table('riders')->insertGetId([
            'user_id' => $user->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Contact Person',
            'emergency_contact_relationship' => 'sibling',
            'emergency_contact_phone' => '09171112222',
            'base_city_id' => $cityId,
            'rider_status' => $status,
            'approved_at' => in_array($status, ['approved', 'active'], true) ? now() : null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function createReadyDeliveryOrder(
        User $owner,
        User $buyer,
        string $orderType = 'delivery',
        string $orderStatus = 'ready',
        string $paymentMethod = 'cash',
        string $paymentStatus = 'pending',
    ): array {
        $addrId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '42 Maginhawa St',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Maginhawa Grill',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09172223333',
            'business_email' => 'grill_'.random_int(1000, 9999).'@example.com',
            'address_id' => $addrId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepting_orders' => 1,
            'restaurant_status' => 'active',
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
            'category_name' => 'Bowls',
            'sort_order' => 0,
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $itemId = (int) DB::table('menu_items')->insertGetId([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'item_name' => 'Pork Sisig Rice',
            'base_price' => '180.00',
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'sort_order' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $checkoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $buyer->user_id,
            'idempotency_key' => 'r9b-chk-'.random_int(100000, 999999),
            'checkout_status' => 'pending',
            'total_amount' => '229.00',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $restaurantId,
            'customer_id' => $buyer->user_id,
            'restaurant_name' => 'Maginhawa Grill',
            'customer_name' => "{$buyer->first_name} {$buyer->last_name}",
            'order_reference' => 'SALO-ORD-'.random_int(100000, 999999),
            'order_type' => $orderType,
            'order_priority' => 'standard',
            'order_status' => $orderStatus,
            'delivery_recipient_name' => "{$buyer->first_name} {$buyer->last_name}",
            'delivery_phone' => '09178889999',
            'delivery_address_text' => '88 Katipunan Ave, Quezon City',
            'subtotal_amount' => '180.00',
            'delivery_fee' => $orderType === 'delivery' ? '49.00' : '0.00',
            'total_amount' => $orderType === 'delivery' ? '229.00' : '180.00',
            'placed_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('order_items')->insert([
            'order_id' => $orderId,
            'menu_item_id' => $itemId,
            'item_name' => 'Pork Sisig Rice',
            'unit_price' => '180.00',
            'quantity' => 2,
            'line_total' => '360.00',
            'created_at' => now(),
        ]);

        $paymentId = (int) DB::table('payments')->insertGetId([
            'payment_reference' => 'SALO-PAY-'.random_int(100000, 999999),
            'checkout_id' => $checkoutId,
            'customer_id' => $buyer->user_id,
            'payment_method' => $paymentMethod,
            'payment_type' => 'payment',
            'payment_status' => $paymentStatus,
            'amount' => $orderType === 'delivery' ? '229.00' : '180.00',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('payment_allocations')->insert([
            'payment_id' => $paymentId,
            'order_id' => $orderId,
            'allocation_type' => 'order_payment',
            'amount' => $orderType === 'delivery' ? '229.00' : '180.00',
            'created_at' => now(),
        ]);

        return [$restaurantId, $orderId, $paymentId];
    }

    public function test_admin_activation_rules_self_activation_block_and_generic_endpoint_guard(): void
    {
        $admin = $this->createUser('admin', 'adm');
        $nonAdmin = $this->createUser('customer', 'cust');
        $approvedUser = $this->createUser('customer', 'appr');
        $pendingUser = $this->createUser('customer', 'pend');
        $suspendedUser = $this->createUser('customer', 'susp');

        $selfRiderId = $this->createRiderRecord($admin, 'approved');
        $approvedRiderId = $this->createRiderRecord($approvedUser, 'approved');
        $pendingRiderId = $this->createRiderRecord($pendingUser, 'pending');
        $suspendedRiderId = $this->createRiderRecord($suspendedUser, 'suspended');

        // Non-admin -> 403
        $this->actingAs($nonAdmin)->postJson("/api/admin/riders/{$approvedRiderId}/activate")->assertStatus(403);

        // Self-activation -> 403
        $this->actingAs($admin)->postJson("/api/admin/riders/{$selfRiderId}/activate")->assertStatus(403);

        // Non-approved statuses -> 409
        $this->actingAs($admin)->postJson("/api/admin/riders/{$pendingRiderId}/activate")->assertStatus(409);
        $this->actingAs($admin)->postJson("/api/admin/riders/{$suspendedRiderId}/activate")->assertStatus(409);

        // Generic status endpoint cannot set active -> 422
        $this->actingAs($admin)->patchJson("/api/admin/riders/{$approvedRiderId}/status", [
            'status' => 'active',
        ])->assertStatus(422);

        // Valid activation from approved -> active + audit log
        $this->actingAs($admin)->postJson("/api/admin/riders/{$approvedRiderId}/activate")
            ->assertOk()
            ->assertJsonPath('data.rider.rider_status', 'active');

        $this->assertDatabaseHas('audit_logs', [
            'entity_type' => 'riders',
            'entity_id' => (string) $approvedRiderId,
            'actor_user_id' => $admin->user_id,
            'action' => 'admin_rider_activated',
        ]);

        // Re-activating already active -> 409
        $this->actingAs($admin)->postJson("/api/admin/riders/{$approvedRiderId}/activate")->assertStatus(409);
    }

    public function test_go_online_rules_and_cannot_go_offline_mid_delivery(): void
    {
        $owner = $this->createUser('customer', 'goown');
        $buyer = $this->createUser('customer', 'gobuy');
        $activeUser = $this->createUser('customer', 'goact');
        $approvedUser = $this->createUser('customer', 'goapp');
        $pendingUser = $this->createUser('customer', 'gopen');
        $suspendedUser = $this->createUser('customer', 'gosus');

        $this->createRiderRecord($activeUser, 'active');
        $this->createRiderRecord($approvedUser, 'approved');
        $this->createRiderRecord($pendingUser, 'pending');
        $this->createRiderRecord($suspendedUser, 'suspended');

        // Approved, pending, suspended -> 403
        $this->actingAs($approvedUser)->patchJson('/api/rider/availability', ['status' => 'online'])->assertStatus(403);
        $this->actingAs($pendingUser)->patchJson('/api/rider/availability', ['status' => 'online'])->assertStatus(403);
        $this->actingAs($suspendedUser)->patchJson('/api/rider/availability', ['status' => 'online'])->assertStatus(403);

        // Active succeeds
        $this->actingAs($activeUser)->patchJson('/api/rider/availability', ['status' => 'online'])
            ->assertOk()
            ->assertJsonPath('data.availability.is_online', true);

        // Accept delivery, then going offline -> 409
        [, $orderId] = $this->createReadyDeliveryOrder($owner, $buyer);
        $this->actingAs($activeUser)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertOk();

        $this->actingAs($activeUser)->patchJson('/api/rider/availability', ['status' => 'offline'])
            ->assertStatus(409);
    }

    public function test_available_deliveries_filters_and_hides_customer_phone(): void
    {
        $owner = $this->createUser('customer', 'avown');
        $buyer = $this->createUser('customer', 'avbuy');
        $rider = $this->createUser('customer', 'avrid');
        $otherRider = $this->createUser('customer', 'avrid2');
        $approvedRider = $this->createUser('customer', 'avapp');

        $this->createRiderRecord($rider, 'active');
        $this->createRiderRecord($otherRider, 'active');
        $this->createRiderRecord($approvedRider, 'approved');

        [, $readyDeliveryId] = $this->createReadyDeliveryOrder($owner, $buyer, 'delivery', 'ready');
        [, $pickupOrderId] = $this->createReadyDeliveryOrder($owner, $buyer, 'pickup', 'ready');
        [, $assignedOrderId] = $this->createReadyDeliveryOrder($owner, $buyer, 'delivery', 'ready');

        // Offline or approved rider -> 403
        $this->actingAs($approvedRider)->getJson('/api/rider/deliveries/available')->assertStatus(403);
        $this->actingAs($rider)->getJson('/api/rider/deliveries/available')->assertStatus(403);

        // Assign one order to otherRider
        $this->actingAs($otherRider)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();
        $this->actingAs($otherRider)->postJson("/api/rider/deliveries/{$assignedOrderId}/accept")->assertOk();

        // Online active rider sees only readyDeliveryId, without customer phone
        $this->actingAs($rider)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();
        $res = $this->actingAs($rider)->getJson('/api/rider/deliveries/available')
            ->assertOk()
            ->assertJsonCount(1, 'data.deliveries')
            ->assertJsonPath('data.deliveries.0.order_id', $readyDeliveryId);

        $first = $res->json('data.deliveries.0');
        $this->assertArrayNotHasKey('customer_phone', $first);
        $this->assertArrayNotHasKey('delivery_phone', $first);
        $this->assertNotSame($pickupOrderId, $first['order_id']);
    }

    public function test_accept_inserts_new_delivery_row_when_none_exists(): void
    {
        $owner = $this->createUser('customer', 'aiown');
        $buyer = $this->createUser('customer', 'aibuy');
        $rider = $this->createUser('customer', 'airid');
        $riderId = $this->createRiderRecord($rider, 'active');
        [, $orderId] = $this->createReadyDeliveryOrder($owner, $buyer);

        $this->assertNull(DB::table('deliveries')->where('order_id', $orderId)->first());

        $this->actingAs($rider)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$orderId}/accept")
            ->assertOk()
            ->assertJsonPath('data.delivery.order_id', $orderId)
            ->assertJsonPath('data.delivery.delivery_status', 'accepted');

        $row = DB::table('deliveries')->where('order_id', $orderId)->first();
        $this->assertNotNull($row);
        $this->assertSame($orderId, (int) $row->order_id);
        $this->assertSame($riderId, (int) $row->rider_id);
        $this->assertSame('accepted', $row->delivery_status);
        $this->assertNotNull($row->assigned_at);
        $this->assertNotNull($row->accepted_at);

        $this->assertDatabaseHas('audit_logs', [
            'entity_type' => 'deliveries',
            'entity_id' => (string) $row->delivery_id,
            'actor_user_id' => $rider->user_id,
            'action' => 'rider_delivery_accepted',
        ]);
    }

    public function test_accept_reuses_existing_unassigned_pending_assignment_delivery_row(): void
    {
        $owner = $this->createUser('customer', 'arown');
        $buyer = $this->createUser('customer', 'arbuy');
        $rider = $this->createUser('customer', 'arrid');
        $this->createRiderRecord($rider, 'active');
        [, $orderId] = $this->createReadyDeliveryOrder($owner, $buyer);

        $preDeliveryId = (int) DB::table('deliveries')->insertGetId([
            'order_id' => $orderId,
            'rider_id' => null,
            'delivery_status' => 'pending_assignment',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($rider)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$orderId}/accept")
            ->assertOk()
            ->assertJsonPath('data.delivery.delivery_id', $preDeliveryId)
            ->assertJsonPath('data.delivery.delivery_status', 'accepted');
    }

    public function test_accept_sequential_second_rider_gets_409(): void
    {
        $owner = $this->createUser('customer', 'asown');
        $buyer = $this->createUser('customer', 'asbuy');
        $rider1 = $this->createUser('customer', 'asrid1');
        $rider2 = $this->createUser('customer', 'asrid2');
        $this->createRiderRecord($rider1, 'active');
        $this->createRiderRecord($rider2, 'active');
        [, $orderId] = $this->createReadyDeliveryOrder($owner, $buyer);

        $this->actingAs($rider1)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();
        $this->actingAs($rider2)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();

        $this->actingAs($rider1)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertOk();
        $this->actingAs($rider2)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertStatus(409);
    }

    public function test_accept_rider_with_unfinished_delivery_gets_409(): void
    {
        $owner = $this->createUser('customer', 'auown');
        $buyer = $this->createUser('customer', 'aubuy');
        $rider = $this->createUser('customer', 'aurid');
        $this->createRiderRecord($rider, 'active');
        [, $order1] = $this->createReadyDeliveryOrder($owner, $buyer);
        [, $order2] = $this->createReadyDeliveryOrder($owner, $buyer);

        $this->actingAs($rider)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$order1}/accept")->assertOk();
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$order2}/accept")->assertStatus(409);
    }

    public function test_accept_self_order_gets_403(): void
    {
        $owner = $this->createUser('customer', 'asoown');
        $buyer = $this->createUser('customer', 'asobuy');
        $this->createRiderRecord($buyer, 'active');
        [, $orderId] = $this->createReadyDeliveryOrder($owner, $buyer);

        $this->actingAs($buyer)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();
        $this->actingAs($buyer)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertStatus(403);
    }

    public function test_accept_own_or_staff_restaurant_gets_403(): void
    {
        $owner = $this->createUser('customer', 'aorown');
        $staff = $this->createUser('customer', 'aorstf');
        $buyer = $this->createUser('customer', 'aorbuy');
        $this->createRiderRecord($owner, 'active');
        $this->createRiderRecord($staff, 'active');
        [$restId, $orderId] = $this->createReadyDeliveryOrder($owner, $buyer);

        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $restId,
            'user_id' => $staff->user_id,
            'staff_position' => 'Order Handler',
            'staff_status' => 'active',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($owner)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();
        $this->actingAs($staff)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();

        $this->actingAs($owner)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertStatus(403);
        $this->actingAs($staff)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertStatus(403);
    }

    public function test_picked_up_and_delivered_flow_out_of_order_409_and_other_rider_404(): void
    {
        $owner = $this->createUser('customer', 'pdown');
        $buyer = $this->createUser('customer', 'pdbuy');
        $rider1 = $this->createUser('customer', 'pdrid1', 'Pedro');
        $rider2 = $this->createUser('customer', 'pdrid2');

        $this->createRiderRecord($rider1, 'active');
        $this->createRiderRecord($rider2, 'active');
        [, $orderId] = $this->createReadyDeliveryOrder($owner, $buyer);

        $this->actingAs($rider1)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();
        $this->actingAs($rider1)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertOk();

        // Out-of-order delivered before picked-up -> 409
        $this->actingAs($rider1)->postJson("/api/rider/deliveries/{$orderId}/delivered", ['collected_amount' => 229.00])
            ->assertStatus(409);

        // Another rider -> 404
        $this->actingAs($rider2)->postJson("/api/rider/deliveries/{$orderId}/picked-up")->assertStatus(404);

        // Picked-up succeeds
        $this->actingAs($rider1)->postJson("/api/rider/deliveries/{$orderId}/picked-up")
            ->assertOk()
            ->assertJsonPath('data.delivery.delivery_status', 'picked_up')
            ->assertJsonPath('data.delivery.order_status', 'out_for_delivery');

        // Repeated picked-up -> 409
        $this->actingAs($rider1)->postJson("/api/rider/deliveries/{$orderId}/picked-up")->assertStatus(409);

        // Another rider delivered -> 404
        $this->actingAs($rider2)->postJson("/api/rider/deliveries/{$orderId}/delivered", ['collected_amount' => 229.00])
            ->assertStatus(404);

        // Delivered succeeds; orders.completed_at remains NULL
        $this->actingAs($rider1)->postJson("/api/rider/deliveries/{$orderId}/delivered", ['collected_amount' => 229.00])
            ->assertOk()
            ->assertJsonPath('data.delivery.delivery_status', 'delivered')
            ->assertJsonPath('data.delivery.order_status', 'delivered');

        $this->assertNull(DB::table('orders')->where('order_id', $orderId)->value('completed_at'));

        // Repeated delivered -> 409
        $this->actingAs($rider1)->postJson("/api/rider/deliveries/{$orderId}/delivered", ['collected_amount' => 229.00])
            ->assertStatus(409);
    }

    public function test_cod_exact_amount_marks_payment_paid_and_sets_delivery_cod_fields(): void
    {
        $owner = $this->createUser('customer', 'ceown');
        $buyer = $this->createUser('customer', 'cebuy');
        $rider = $this->createUser('customer', 'cerid');
        $this->createRiderRecord($rider, 'active');
        $this->actingAs($rider)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();

        [, $codOrderId, $codPaymentId] = $this->createReadyDeliveryOrder($owner, $buyer, 'delivery', 'ready', 'cash', 'pending');

        $beforeJournals = DB::table('ledger_journals')->count();
        $beforeEntries = DB::table('ledger_entries')->count();
        $beforeRefunds = DB::table('payments')->where('payment_type', 'refund')->count();

        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$codOrderId}/accept")->assertOk();
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$codOrderId}/picked-up")->assertOk();
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$codOrderId}/delivered", ['collected_amount' => 229.00])
            ->assertOk()
            ->assertJsonPath('data.delivery.payment_status', 'paid')
            ->assertJsonPath('data.delivery.cod_remittance_status', 'pending');

        $payment = DB::table('payments')->where('payment_id', $codPaymentId)->first();
        $delivery = DB::table('deliveries')->where('order_id', $codOrderId)->first();
        $this->assertSame('paid', $payment->payment_status);
        $this->assertNotNull($payment->paid_at);
        $this->assertSame('229.00', (string) $delivery->cod_amount_collected);
        $this->assertNotNull($delivery->cod_collected_at);
        $this->assertSame('pending', $delivery->cod_remittance_status);
        $this->assertNull($delivery->cod_remitted_at);
        $this->assertNull($delivery->cod_confirmed_by);

        $this->assertSame($beforeJournals, DB::table('ledger_journals')->count());
        $this->assertSame($beforeEntries, DB::table('ledger_entries')->count());
        $this->assertSame($beforeRefunds, DB::table('payments')->where('payment_type', 'refund')->count());
    }

    public function test_cod_wrong_amount_gets_422_and_changes_nothing(): void
    {
        $owner = $this->createUser('customer', 'cwown');
        $buyer = $this->createUser('customer', 'cwbuy');
        $rider = $this->createUser('customer', 'cwrid');
        $this->createRiderRecord($rider, 'active');
        $this->actingAs($rider)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();

        [, $orderId, $paymentId] = $this->createReadyDeliveryOrder($owner, $buyer, 'delivery', 'ready', 'cash', 'pending');
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertOk();
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$orderId}/picked-up")->assertOk();

        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$orderId}/delivered", ['collected_amount' => 200.00])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['collected_amount']);

        $this->assertSame('pending', DB::table('payments')->where('payment_id', $paymentId)->value('payment_status'));
        $this->assertSame('out_for_delivery', DB::table('orders')->where('order_id', $orderId)->value('order_status'));
        $this->assertNull(DB::table('deliveries')->where('order_id', $orderId)->value('cod_amount_collected'));
    }

    public function test_cod_missing_amount_gets_422_and_changes_nothing(): void
    {
        $owner = $this->createUser('customer', 'cmown');
        $buyer = $this->createUser('customer', 'cmbuy');
        $rider = $this->createUser('customer', 'cmrid');
        $this->createRiderRecord($rider, 'active');
        $this->actingAs($rider)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();

        [, $orderId, $paymentId] = $this->createReadyDeliveryOrder($owner, $buyer, 'delivery', 'ready', 'cash', 'pending');
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertOk();
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$orderId}/picked-up")->assertOk();

        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$orderId}/delivered", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['collected_amount']);

        $this->assertSame('pending', DB::table('payments')->where('payment_id', $paymentId)->value('payment_status'));
        $this->assertSame('out_for_delivery', DB::table('orders')->where('order_id', $orderId)->value('order_status'));
    }

    public function test_cod_zero_amount_gets_422_and_changes_nothing(): void
    {
        $owner = $this->createUser('customer', 'czown');
        $buyer = $this->createUser('customer', 'czbuy');
        $rider = $this->createUser('customer', 'czrid');
        $this->createRiderRecord($rider, 'active');
        $this->actingAs($rider)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();

        [, $orderId, $paymentId] = $this->createReadyDeliveryOrder($owner, $buyer, 'delivery', 'ready', 'cash', 'pending');
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertOk();
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$orderId}/picked-up")->assertOk();

        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$orderId}/delivered", ['collected_amount' => 0])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['collected_amount']);

        $this->assertSame('pending', DB::table('payments')->where('payment_id', $paymentId)->value('payment_status'));
        $this->assertSame('out_for_delivery', DB::table('orders')->where('order_id', $orderId)->value('order_status'));
    }

    public function test_cod_non_cash_or_already_paid_payment_is_untouched(): void
    {
        $owner = $this->createUser('customer', 'cnown');
        $buyer = $this->createUser('customer', 'cnbuy');
        $rider = $this->createUser('customer', 'cnrid');
        $this->createRiderRecord($rider, 'active');
        $this->actingAs($rider)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();

        [, $cardOrderId, $cardPaymentId] = $this->createReadyDeliveryOrder($owner, $buyer, 'delivery', 'ready', 'card', 'paid');
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$cardOrderId}/accept")->assertOk();
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$cardOrderId}/picked-up")->assertOk();
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$cardOrderId}/delivered")->assertOk();

        $payment = DB::table('payments')->where('payment_id', $cardPaymentId)->first();
        $delivery = DB::table('deliveries')->where('order_id', $cardOrderId)->first();
        $this->assertSame('paid', $payment->payment_status);
        $this->assertNull($payment->paid_at);
        $this->assertNull($delivery->cod_amount_collected);
        $this->assertSame('not_applicable', $delivery->cod_remittance_status);
    }

    public function test_customer_and_restaurant_views_show_new_statuses_rider_first_name_only_and_manila_timestamps(): void
    {
        $owner = $this->createUser('customer', 'vown');
        $buyer = $this->createUser('customer', 'vbuy');
        $rider = $this->createUser('customer', 'vrid', 'Mateo');

        $this->createRiderRecord($rider, 'active');
        [$restId, $orderId] = $this->createReadyDeliveryOrder($owner, $buyer);

        $this->actingAs($rider)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertOk();
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$orderId}/picked-up")->assertOk();
        $deliveredRes = $this->actingAs($rider)->postJson("/api/rider/deliveries/{$orderId}/delivered", ['collected_amount' => 229.00])
            ->assertOk()
            ->json('data.delivery');

        $custDetail = $this->actingAs($buyer)->getJson("/api/customer/orders/{$orderId}")
            ->assertOk()
            ->assertJsonPath('data.order.order_status', 'delivered')
            ->assertJsonPath('data.order.rider.first_name', 'Mateo')
            ->json('data.order');

        $this->assertArrayNotHasKey('last_name', $custDetail['rider']);
        $this->assertArrayNotHasKey('phone', $custDetail['rider']);

        $restDetail = $this->actingAs($owner)->getJson("/api/restaurant/orders/{$orderId}?restaurant_id={$restId}")
            ->assertOk()
            ->assertJsonPath('data.order.order_status', 'delivered')
            ->assertJsonPath('data.order.rider.first_name', 'Mateo')
            ->json('data.order');

        $manilaIsoRegex = '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/';
        foreach ([
            $deliveredRes['accepted_at'],
            $deliveredRes['picked_up_at'],
            $deliveredRes['delivered_at'],
            $deliveredRes['cod_collected_at'],
            $deliveredRes['paid_at'],
            $custDetail['delivered_at'],
            $restDetail['delivered_at'],
        ] as $ts) {
            $this->assertMatchesRegularExpression($manilaIsoRegex, (string) $ts);
        }
    }

    public function test_available_deliveries_batch_pickup_address_and_query_count_regression(): void
    {
        $owner1 = $this->createUser('customer', 'avlown1');
        $owner2 = $this->createUser('customer', 'avlown2');
        $buyer = $this->createUser('customer', 'avlbuy');
        $rider = $this->createUser('customer', 'avlrid', 'Carlos');

        $this->createRiderRecord($rider, 'active');
        [$rest1Id, $order1Id] = $this->createReadyDeliveryOrder($owner1, $buyer);
        [$rest2Id, $order2Id] = $this->createReadyDeliveryOrder($owner2, $buyer);

        $this->actingAs($rider)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();

        DB::flushQueryLog();
        DB::enableQueryLog();

        $res = $this->actingAs($rider)->getJson('/api/rider/deliveries/available')
            ->assertOk();

        $this->assertLessThanOrEqual(11, count(DB::getQueryLog()), 'GET /api/rider/deliveries/available must execute at most 11 SQL queries.');

        $deliveries = collect($res->json('data.deliveries'));
        $d1 = $deliveries->firstWhere('order_id', $order1Id);
        $d2 = $deliveries->firstWhere('order_id', $order2Id);

        $this->assertNotNull($d1);
        $this->assertNotNull($d2);
        $this->assertSame($rest1Id, $d1['restaurant_id']);
        $this->assertNotEmpty($d1['pickup_address_text']);
        $this->assertSame($rest2Id, $d2['restaurant_id']);
        $this->assertNotEmpty($d2['pickup_address_text']);
    }

    public function test_decline_hides_offer_from_declining_rider_only_and_is_idempotent(): void
    {
        $owner = $this->createUser('customer', 'decown');
        $buyer = $this->createUser('customer', 'decbuy');
        $rider1 = $this->createUser('customer', 'decrid1', 'Marco');
        $rider2 = $this->createUser('customer', 'decrid2', 'Paolo');

        $this->createRiderRecord($rider1, 'active');
        $this->createRiderRecord($rider2, 'active');
        [, $orderId] = $this->createReadyDeliveryOrder($owner, $buyer);

        $this->actingAs($rider1)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();
        $this->actingAs($rider2)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();

        // First decline succeeds and records 1 audit log
        $this->actingAs($rider1)->postJson("/api/rider/deliveries/{$orderId}/decline")
            ->assertOk()
            ->assertJsonPath('data.declined', true)
            ->assertJsonPath('data.already_declined', false);

        $this->assertSame(
            1,
            DB::table('audit_logs')
                ->where('actor_user_id', $rider1->user_id)
                ->where('action', 'rider_delivery_offer_declined')
                ->where('entity_id', $orderId)
                ->count()
        );

        // Repeated decline is idempotent and does not double-log
        $this->actingAs($rider1)->postJson("/api/rider/deliveries/{$orderId}/decline")
            ->assertOk()
            ->assertJsonPath('data.declined', true)
            ->assertJsonPath('data.already_declined', true);

        $this->assertSame(
            1,
            DB::table('audit_logs')
                ->where('actor_user_id', $rider1->user_id)
                ->where('action', 'rider_delivery_offer_declined')
                ->where('entity_id', $orderId)
                ->count()
        );

        // Declining rider does not see the order, and order status is untouched
        $this->assertSame('ready', DB::table('orders')->where('order_id', $orderId)->value('order_status'));
        $rider1Id = (int) DB::table('riders')->where('user_id', $rider1->user_id)->value('rider_id');
        $this->assertTrue(
            DB::table('rider_delivery_declines')
                ->where('rider_id', $rider1Id)
                ->where('order_id', $orderId)
                ->exists()
        );

        // Decline survives cache flush (durable DB persistence)
        \Illuminate\Support\Facades\Cache::flush();
        $this->actingAs($rider1)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();
        $this->actingAs($rider2)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();

        $r1Ids = collect($this->actingAs($rider1)->getJson('/api/rider/deliveries/available')->assertOk()->json('data.deliveries'))
            ->pluck('order_id')
            ->all();
        $this->assertNotContains($orderId, $r1Ids);

        // Another online rider still sees and can accept the order
        $r2Ids = collect($this->actingAs($rider2)->getJson('/api/rider/deliveries/available')->assertOk()->json('data.deliveries'))
            ->pluck('order_id')
            ->all();
        $this->assertContains($orderId, $r2Ids);

        $this->actingAs($rider2)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertOk();
    }

    public function test_decline_rejects_invalid_assigned_and_non_rider_requests(): void
    {
        $owner = $this->createUser('customer', 'decinvown');
        $buyer = $this->createUser('customer', 'decinvbuy');
        $nonRider = $this->createUser('customer', 'decnonrid');
        $rider1 = $this->createUser('customer', 'decinvr1');
        $rider2 = $this->createUser('customer', 'decinvr2');

        $this->createRiderRecord($rider1, 'active');
        $this->createRiderRecord($rider2, 'active');

        [, $readyOrderId] = $this->createReadyDeliveryOrder($owner, $buyer, 'delivery', 'ready');
        [, $preparingOrderId] = $this->createReadyDeliveryOrder($owner, $buyer, 'delivery', 'preparing');

        // Non-rider denied
        $this->actingAs($nonRider)->postJson("/api/rider/deliveries/{$readyOrderId}/decline")
            ->assertStatus(403);

        $this->actingAs($rider1)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();
        $this->actingAs($rider2)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();

        // Nonexistent order -> 404
        $this->actingAs($rider1)->postJson('/api/rider/deliveries/999999/decline')
            ->assertStatus(404);

        // Non-ready order -> 409
        $this->actingAs($rider1)->postJson("/api/rider/deliveries/{$preparingOrderId}/decline")
            ->assertStatus(409);

        // Already-assigned order -> 409
        $this->actingAs($rider2)->postJson("/api/rider/deliveries/{$readyOrderId}/accept")->assertOk();
        $this->actingAs($rider1)->postJson("/api/rider/deliveries/{$readyOrderId}/decline")
            ->assertStatus(409);
    }

    public function test_patch_rider_profile_updates_schedule_and_validates_input(): void
    {
        $rider = $this->createUser('customer', 'schedrid');
        $this->createRiderRecord($rider, 'active');

        $this->actingAs($rider)->patchJson('/api/rider/profile', [
            'available_days' => ['mon', 'wed', 'fri', 'sat'],
            'preferred_shifts' => ['breakfast', 'dinner'],
            'preferred_hubs' => 'Diliman, Katipunan',
        ])
            ->assertOk()
            ->assertJsonPath('data.profile.available_days', ['mon', 'wed', 'fri', 'sat'])
            ->assertJsonPath('data.profile.preferred_shifts', ['breakfast', 'dinner'])
            ->assertJsonPath('data.profile.preferred_hubs', 'Diliman, Katipunan');

        $this->actingAs($rider)->getJson('/api/rider/profile')
            ->assertOk()
            ->assertJsonPath('data.profile.available_days', ['mon', 'wed', 'fri', 'sat'])
            ->assertJsonPath('data.profile.preferred_shifts', ['breakfast', 'dinner']);

        // Invalid day and shift rejected
        $this->actingAs($rider)->patchJson('/api/rider/profile', [
            'available_days' => ['funday'],
            'preferred_shifts' => ['midnight_express'],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['available_days.0', 'preferred_shifts.0']);
    }
}
