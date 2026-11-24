<?php

namespace Tests\Feature;

use App\Features\Connect\Jobs\CheckOrderUnreachableCancellationJob;
use App\Features\Connect\Jobs\ResolveCallTimeoutJob;
use App\Features\Connect\Services\OrderConnectService;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class SaloConnectCallingTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'sc', string $firstName = 'Test'): User
    {
        return User::forceCreate([
            'username' => "{$prefix}_".random_int(10000, 99999),
            'first_name' => $firstName,
            'last_name' => 'User',
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
            'approved_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * @return array{0: int, 1: int, 2: int} [restaurantId, orderId, paymentId]
     */
    private function createPickedUpOrder(User $owner, User $buyer, User $rider): array
    {
        $addrId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '42 Maginhawa St',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Salo Connect Kitchen',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09172223333',
            'business_email' => 'sc_kitchen_'.random_int(1000, 9999).'@example.com',
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

        $checkoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $buyer->user_id,
            'idempotency_key' => 'sc-idem-'.random_int(100000, 999999),
            'total_amount' => 229.00,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $restaurantId,
            'customer_id' => $buyer->user_id,
            'restaurant_name' => 'Salo Connect Kitchen',
            'customer_name' => $buyer->first_name.' '.$buyer->last_name,
            'order_reference' => 'SALO-SC-'.random_int(100000, 999999),
            'order_type' => 'delivery',
            'order_status' => 'ready',
            'delivery_recipient_name' => $buyer->first_name,
            'delivery_phone' => '09171234567',
            'delivery_address_text' => '42 Maginhawa St, Diliman, Quezon City',
            'subtotal_amount' => 180.00,
            'delivery_fee' => 49.00,
            'total_amount' => 229.00,
            'placed_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $paymentId = (int) DB::table('payments')->insertGetId([
            'checkout_id' => $checkoutId,
            'customer_id' => $buyer->user_id,
            'payment_reference' => 'SALO-SCPAY-'.random_int(100000, 999999),
            'payment_method' => 'cash',
            'payment_status' => 'pending',
            'amount' => 229.00,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('payment_allocations')->insert([
            'payment_id' => $paymentId,
            'order_id' => $orderId,
            'allocation_type' => 'order_payment',
            'amount' => 229.00,
            'created_at' => now(),
        ]);

        $this->actingAs($rider)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertOk();
        $this->actingAs($rider)->postJson("/api/rider/deliveries/{$orderId}/picked-up")->assertOk();

        return [$restaurantId, $orderId, $paymentId];
    }

    public function test_rider_cannot_call_before_arrival_and_non_assigned_rider_is_rejected(): void
    {
        $owner = $this->createUser('customer', 'sc1own');
        $buyer = $this->createUser('customer', 'sc1buy');
        $rider1 = $this->createUser('customer', 'sc1r1');
        $rider2 = $this->createUser('customer', 'sc1r2');
        $this->createRiderRecord($rider1);
        $this->createRiderRecord($rider2);

        [, $orderId] = $this->createPickedUpOrder($owner, $buyer, $rider1);

        // Cannot call while out_for_delivery
        $this->actingAs($rider1)->postJson("/api/rider/orders/{$orderId}/call/start")
            ->assertStatus(409);

        // Non-assigned rider cannot view, arrive, or call
        $this->actingAs($rider2)->getJson("/api/rider/orders/{$orderId}")->assertStatus(404);
        $this->actingAs($rider2)->postJson("/api/rider/orders/{$orderId}/arrive")->assertStatus(404);
        $this->actingAs($rider2)->postJson("/api/rider/orders/{$orderId}/call/start")->assertStatus(404);

        // Assigned rider can view and arrive
        $this->actingAs($rider1)->getJson("/api/rider/orders/{$orderId}")
            ->assertOk()
            ->assertJsonPath('data.order.order_id', $orderId);

        $this->actingAs($rider1)->postJson("/api/rider/orders/{$orderId}/arrive")
            ->assertOk()
            ->assertJsonPath('data.order_status', 'arrived');
    }

    public function test_second_call_rejected_while_pending_and_duplicate_creates_one_attempt(): void
    {
        Queue::fake();

        $owner = $this->createUser('customer', 'sc2own');
        $buyer = $this->createUser('customer', 'sc2buy');
        $rider = $this->createUser('customer', 'sc2r1');
        $this->createRiderRecord($rider);

        [, $orderId] = $this->createPickedUpOrder($owner, $buyer, $rider);
        $this->actingAs($rider)->postJson("/api/rider/orders/{$orderId}/arrive")->assertOk();

        $this->actingAs($rider)->postJson("/api/rider/orders/{$orderId}/call/start")
            ->assertOk()
            ->assertJsonPath('data.pending_call.attempt_no', 1)
            ->assertJsonPath('data.pending_call.status', 'pending');

        Queue::assertPushed(ResolveCallTimeoutJob::class, 1);

        // Second call while pending -> 409
        $this->actingAs($rider)->postJson("/api/rider/orders/{$orderId}/call/start")
            ->assertStatus(409);

        $this->assertSame(1, DB::table('call_logs')->where('order_id', $orderId)->count());
    }

    public function test_accept_call_transitions_to_customer_reached_and_allows_deliver(): void
    {
        Queue::fake();

        $owner = $this->createUser('customer', 'sc3own');
        $buyer = $this->createUser('customer', 'sc3buy');
        $rider = $this->createUser('customer', 'sc3r1');
        $this->createRiderRecord($rider);

        [, $orderId] = $this->createPickedUpOrder($owner, $buyer, $rider);
        $this->actingAs($rider)->postJson("/api/rider/orders/{$orderId}/arrive")->assertOk();
        $this->actingAs($rider)->postJson("/api/rider/orders/{$orderId}/call/start")->assertOk();

        $this->actingAs($buyer)->postJson("/api/customer/orders/{$orderId}/call/respond", ['action' => 'accept'])
            ->assertOk()
            ->assertJsonPath('data.order_status', 'customer_reached')
            ->assertJsonPath('data.call_attempts', 0)
            ->assertJsonPath('data.pending_call', null);

        $call = DB::table('call_logs')->where('order_id', $orderId)->first();
        $this->assertSame('answered', $call->status);
        $this->assertEquals(0, $call->counted_as_strike);
        $this->assertNull($call->customer_was_offline);

        // If timeout job runs after accept, accept has already won (no-op)
        $this->travel(25)->seconds();
        app(OrderConnectService::class)->resolveExpiredCall($orderId, (int) $call->id);
        $this->assertSame('answered', DB::table('call_logs')->where('id', $call->id)->value('status'));
        $this->assertSame(0, (int) DB::table('orders')->where('order_id', $orderId)->value('call_attempts'));

        // Deliver via /rider/orders/{id}/deliver succeeds
        $this->actingAs($rider)->postJson("/api/rider/orders/{$orderId}/deliver", ['collected_amount' => 229.00])
            ->assertOk()
            ->assertJsonPath('data.delivery.order_status', 'delivered');
    }

    public function test_decline_and_timeout_flows_plus_lazy_check_and_race_condition(): void
    {
        Queue::fake();

        $owner = $this->createUser('customer', 'sc4own');
        $buyer = $this->createUser('customer', 'sc4buy');
        $rider = $this->createUser('customer', 'sc4r1');
        $this->createRiderRecord($rider);

        [, $orderId] = $this->createPickedUpOrder($owner, $buyer, $rider);
        $this->actingAs($rider)->postJson("/api/rider/orders/{$orderId}/arrive")->assertOk();

        // Call 1: customer declines -> strike 1
        $this->actingAs($rider)->postJson("/api/rider/orders/{$orderId}/call/start")->assertOk();
        $this->actingAs($buyer)->postJson("/api/customer/orders/{$orderId}/call/respond", ['action' => 'decline'])
            ->assertOk()
            ->assertJsonPath('data.call_attempts', 1);

        // Cooldown enforced (429)
        $this->actingAs($rider)->postJson("/api/rider/orders/{$orderId}/call/start")
            ->assertStatus(429)
            ->assertJsonStructure(['data' => ['remaining_seconds', 'cooldown_ends_at', 'server_now']]);

        // Advance past 60s cooldown
        $this->travel(61)->seconds();

        // Call 2: expires after 20s, customer tries to accept at deadline -> lazy check wins, returns 409
        $startRes = $this->actingAs($rider)->postJson("/api/rider/orders/{$orderId}/call/start")->assertOk();
        $call2Id = (int) $startRes->json('data.pending_call.id');

        $this->travel(21)->seconds();

        $this->actingAs($buyer)->postJson("/api/customer/orders/{$orderId}/call/respond", ['action' => 'accept'])
            ->assertStatus(409);

        $call2 = DB::table('call_logs')->where('id', $call2Id)->first();
        $this->assertSame('timed_out', $call2->status);
        $this->assertEquals(1, $call2->counted_as_strike);
        $this->assertSame(2, (int) DB::table('orders')->where('order_id', $orderId)->value('call_attempts'));

        // Running the queued job afterwards is idempotent (no double strike)
        app(OrderConnectService::class)->resolveExpiredCall($orderId, $call2Id);
        $this->assertSame(2, (int) DB::table('orders')->where('order_id', $orderId)->value('call_attempts'));

        // Also verify GET lazy check resolves an expired pending call
        $this->travel(61)->seconds();
        // Reset call_attempts to 1 to test GET lazy check cleanly without hitting 3 strikes yet
        DB::table('orders')->where('order_id', $orderId)->update(['call_attempts' => 1]);
        $start3 = $this->actingAs($rider)->postJson("/api/rider/orders/{$orderId}/call/start")->assertOk();
        $call3Id = (int) $start3->json('data.pending_call.id');

        $this->travel(21)->seconds();
        $this->actingAs($buyer)->getJson("/api/customer/orders/{$orderId}")
            ->assertOk()
            ->assertJsonPath('data.order.pending_call', null)
            ->assertJsonPath('data.order.call_attempts', 2);

        $this->assertSame('timed_out', DB::table('call_logs')->where('id', $call3Id)->value('status'));
    }

    public function test_three_strikes_waits_for_min_wait_period_then_cancels_suspends_and_blocks_checkout(): void
    {
        Queue::fake();

        $owner = $this->createUser('customer', 'sc5own');
        $buyer = $this->createUser('customer', 'sc5buy');
        $rider = $this->createUser('customer', 'sc5r1');
        $this->createRiderRecord($rider);

        [$restaurantId, $orderId] = $this->createPickedUpOrder($owner, $buyer, $rider);
        $this->actingAs($rider)->postJson("/api/rider/orders/{$orderId}/arrive")->assertOk();

        // 3 declines within 3 minutes (< 5 min wait)
        for ($i = 1; $i <= 3; $i++) {
            $this->actingAs($rider)->postJson("/api/rider/orders/{$orderId}/call/start")->assertOk();
            $this->actingAs($buyer)->postJson("/api/customer/orders/{$orderId}/call/respond", ['action' => 'decline'])
                ->assertOk()
                ->assertJsonPath('data.call_attempts', $i);

            if ($i < 3) {
                $this->travel(61)->seconds();
            }
        }

        // Must NOT be cancelled yet because 5 minutes since arrived_at have not passed
        $this->assertSame('arrived', DB::table('orders')->where('order_id', $orderId)->value('order_status'));
        Queue::assertPushed(CheckOrderUnreachableCancellationJob::class);

        // Fourth call rejected after 3 strikes
        $this->travel(61)->seconds();
        $this->actingAs($rider)->postJson("/api/rider/orders/{$orderId}/call/start")
            ->assertStatus(409);

        // Travel past 5 minutes from arrived_at -> lazy check on GET cancels order
        $this->travel(4)->minutes();

        $this->actingAs($buyer)->getJson("/api/customer/orders/{$orderId}")
            ->assertOk()
            ->assertJsonPath('data.order.order_status', 'cancelled')
            ->assertJsonPath('data.order.cancelled_by', 'system')
            ->assertJsonPath('data.order.cancel_reason', 'customer_unreachable')
            ->assertJsonPath('data.order.customer_ordering_suspended', true);

        // Delivery cancelled (rider released)
        $this->assertSame('cancelled', DB::table('deliveries')->where('order_id', $orderId)->value('delivery_status'));
        $this->actingAs($rider)->getJson('/api/rider/deliveries/current')
            ->assertOk()
            ->assertJsonPath('data.delivery', null);

        // Customer incident created
        $incident = DB::table('customer_incidents')->where('order_id', $orderId)->first();
        $this->assertNotNull($incident);
        $this->assertSame('unreachable_cancelled', $incident->type);

        // Customer suspended for 24h and blocked from placing new orders
        $suspendedUser = DB::table('users')->where('user_id', $buyer->user_id)->first();
        $this->assertNotNull($suspendedUser->ordering_suspended_until);

        $this->actingAs($buyer)->postJson('/api/customer/checkout', [
            'idempotency_key' => 'blocked-checkout-1',
            'payment_method' => 'cod',
            'groups' => [
                [
                    'restaurant_id' => $restaurantId,
                    'fulfillment' => 'pickup',
                    'items' => [['menu_item_id' => 1, 'quantity' => 1]],
                ],
            ],
        ])->assertStatus(403);
    }

    public function test_cross_order_and_channel_authorization_are_enforced(): void
    {
        $owner = $this->createUser('customer', 'sc6own');
        $buyer = $this->createUser('customer', 'sc6buy');
        $otherCustomer = $this->createUser('customer', 'sc6oth');
        $rider = $this->createUser('customer', 'sc6r1');
        $otherRider = $this->createUser('customer', 'sc6r2');
        $this->createRiderRecord($rider);
        $this->createRiderRecord($otherRider);

        [, $orderId] = $this->createPickedUpOrder($owner, $buyer, $rider);

        // Other customer cannot view or respond to call
        $this->actingAs($otherCustomer)->getJson("/api/customer/orders/{$orderId}")->assertStatus(404);
        $this->actingAs($otherCustomer)->postJson("/api/customer/orders/{$orderId}/call/respond", ['action' => 'accept'])
            ->assertStatus(404);

        // Broadcast channel auth allows only customer & assigned rider
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'test-key',
            'broadcasting.connections.reverb.secret' => 'test-secret',
            'broadcasting.connections.reverb.app_id' => 'test-app',
        ]);
        \Illuminate\Support\Facades\Broadcast::forgetDrivers();
        require base_path('routes/channels.php');

        $this->actingAs($otherCustomer)->postJson('/api/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => "presence-order.{$orderId}",
        ])->assertStatus(403);

        $this->actingAs($otherRider)->postJson('/api/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => "presence-order.{$orderId}",
        ])->assertStatus(403);

        $this->actingAs($buyer)->postJson('/api/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => "presence-order.{$orderId}",
        ])->assertOk();

        $this->actingAs($rider)->postJson('/api/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => "presence-order.{$orderId}",
        ])->assertOk();
    }
}
