<?php

namespace Tests\Feature;

use App\Features\Connect\Events\MessageSent;
use App\Features\Connect\Events\WaitingRequestReceived;
use App\Features\Connect\Events\WaitingRequestUpdated;
use App\Features\Connect\Jobs\ExpireWaitingRequestJob;
use App\Features\Connect\Jobs\NotifyWaitEndedJob;
use App\Features\Connect\Services\WaitingRequestService;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class SaloConnectDelivery2Test extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'sc2', string $firstName = 'Test'): User
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

    private function createRiderRecord(User $user): int
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
            'rider_status' => 'active',
            'approved_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * @return array{0: int, 1: int} [restaurantId, orderId]
     */
    private function createArrivedOrder(User $owner, User $buyer, User $rider): array
    {
        $addrId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '42 Maginhawa St',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Salo D2 Kitchen',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09172223333',
            'business_email' => 'sc_d2_'.random_int(1000, 9999).'@example.com',
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
            'idempotency_key' => 'scd2-idem-'.random_int(100000, 999999),
            'total_amount' => 229.00,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $restaurantId,
            'customer_id' => $buyer->user_id,
            'restaurant_name' => 'Salo D2 Kitchen',
            'customer_name' => $buyer->first_name.' '.$buyer->last_name,
            'order_reference' => 'SALO-D2-'.random_int(100000, 999999),
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
            'payment_reference' => 'SALO-D2PAY-'.random_int(100000, 999999),
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
        $this->actingAs($rider)->postJson("/api/rider/orders/{$orderId}/arrive")->assertOk();

        return [$restaurantId, $orderId];
    }

    public function test_messaging_persistence_and_quick_replies(): void
    {
        Event::fake([MessageSent::class]);

        $owner = $this->createUser('customer', 'mpown');
        $buyer = $this->createUser('customer', 'mpbuy');
        $rider = $this->createUser('customer', 'mprid');
        $this->createRiderRecord($rider);

        [, $orderId] = $this->createArrivedOrder($owner, $buyer, $rider);

        $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/messages", [
            'message' => '<script>alert(1)</script>On my way!',
        ])
            ->assertStatus(201)
            ->assertJsonPath('data.message.message', 'alert(1)On my way!');

        Event::assertDispatched(MessageSent::class);

        $buyerConv = $this->actingAs($buyer)->getJson("/api/orders/{$orderId}/conversation")->assertOk();
        $this->assertCount(1, $buyerConv->json('data.messages'));
        $this->assertContains("I'm coming down!", $buyerConv->json('data.quick_replies'));

        $riderConv = $this->actingAs($rider)->getJson("/api/orders/{$orderId}/conversation")->assertOk();
        $this->assertCount(1, $riderConv->json('data.messages'));
        $this->assertContains("I'm already at your location.", $riderConv->json('data.quick_replies'));
    }

    public function test_messaging_unread_counts_and_read_receipts(): void
    {
        $owner = $this->createUser('customer', 'muown');
        $buyer = $this->createUser('customer', 'mubuy');
        $rider = $this->createUser('customer', 'murid');
        $this->createRiderRecord($rider);

        [, $orderId] = $this->createArrivedOrder($owner, $buyer, $rider);

        $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/messages", ['message' => 'Msg 1'])->assertStatus(201);
        $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/messages", ['message' => 'Msg 2'])->assertStatus(201);

        $this->actingAs($rider)->getJson("/api/rider/orders/{$orderId}")
            ->assertOk()
            ->assertJsonPath('data.order.unread_messages_count', 2);

        $conv = $this->actingAs($rider)->getJson("/api/orders/{$orderId}/conversation")->assertOk();
        $this->assertNotNull($conv->json('data.messages.0.read_at'));
        $this->assertNotNull($conv->json('data.messages.1.read_at'));

        $this->actingAs($rider)->getJson("/api/rider/orders/{$orderId}")
            ->assertOk()
            ->assertJsonPath('data.order.unread_messages_count', 0);
    }

    public function test_messaging_read_only_and_phone_hidden_after_order_ends(): void
    {
        $owner = $this->createUser('customer', 'mrow');
        $buyer = $this->createUser('customer', 'mrbuy');
        $rider = $this->createUser('customer', 'mrrid');
        $this->createRiderRecord($rider);

        [, $orderId] = $this->createArrivedOrder($owner, $buyer, $rider);

        $this->actingAs($rider)->getJson("/api/rider/orders/{$orderId}")
            ->assertOk()
            ->assertJsonPath('data.order.customer_phone', '09171234567');

        $this->actingAs($rider)->postJson("/api/rider/orders/{$orderId}/call/start")->assertOk();
        $this->actingAs($buyer)->postJson("/api/customer/orders/{$orderId}/call/respond", ['action' => 'accept'])->assertOk();
        $this->actingAs($rider)->postJson("/api/rider/orders/{$orderId}/deliver", ['collected_amount' => 229.00])->assertOk();

        $this->actingAs($rider)->getJson("/api/rider/orders/{$orderId}")
            ->assertOk()
            ->assertJsonPath('data.order.customer_phone', null);

        $this->actingAs($buyer)->getJson("/api/orders/{$orderId}/conversation")
            ->assertOk()
            ->assertJsonPath('data.is_read_only', true);

        $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/messages", ['message' => 'Too late'])
            ->assertStatus(409);
    }

    public function test_messaging_rate_limit_is_enforced(): void
    {
        $owner = $this->createUser('customer', 'd2rown');
        $buyer = $this->createUser('customer', 'd2rbuy');
        $rider = $this->createUser('customer', 'd2rrid');
        $this->createRiderRecord($rider);

        [, $orderId] = $this->createArrivedOrder($owner, $buyer, $rider);

        for ($i = 1; $i <= 30; $i++) {
            $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/messages", ['message' => "Msg {$i}"])
                ->assertStatus(201);
        }

        $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/messages", ['message' => 'Msg 31'])
            ->assertStatus(429);
    }

    public function test_messaging_unauthorized_and_cross_order_access_blocked(): void
    {
        $owner = $this->createUser('customer', 'maown');
        $buyer = $this->createUser('customer', 'mabuy');
        $otherUser = $this->createUser('customer', 'maoth');
        $rider = $this->createUser('customer', 'marid');
        $otherRider = $this->createUser('customer', 'mar2');
        $this->createRiderRecord($rider);
        $this->createRiderRecord($otherRider);

        [, $orderId] = $this->createArrivedOrder($owner, $buyer, $rider);

        $this->actingAs($otherUser)->getJson("/api/orders/{$orderId}/conversation")->assertStatus(404);
        $this->actingAs($otherUser)->postJson("/api/orders/{$orderId}/messages", ['message' => 'hi'])->assertStatus(404);
        $this->actingAs($otherRider)->getJson("/api/orders/{$orderId}/conversation")->assertStatus(404);
        $this->actingAs($otherRider)->postJson("/api/orders/{$orderId}/messages", ['message' => 'hi'])->assertStatus(404);
    }

    public function test_seller_cannot_see_private_messages_or_call_logs(): void
    {
        $owner = $this->createUser('customer', 'msown');
        $buyer = $this->createUser('customer', 'msbuy');
        $rider = $this->createUser('customer', 'msrid');
        $this->createRiderRecord($rider);

        [$restaurantId, $orderId] = $this->createArrivedOrder($owner, $buyer, $rider);
        $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/messages", ['message' => 'Private msg'])->assertStatus(201);

        $sellerOrder = $this->actingAs($owner)->getJson("/api/restaurant/orders/{$orderId}?restaurant_id={$restaurantId}")
            ->assertOk()
            ->json('data.order');

        $this->assertArrayNotHasKey('messages', $sellerOrder);
        $this->assertArrayNotHasKey('call_logs', $sellerOrder);
        $this->assertArrayNotHasKey('connect', $sellerOrder);
    }

    public function test_waiting_request_second_while_pending_or_accepted_and_third_rejected(): void
    {
        Queue::fake();
        Event::fake([WaitingRequestReceived::class, WaitingRequestUpdated::class]);

        $owner = $this->createUser('customer', 'w1own');
        $buyer = $this->createUser('customer', 'w1buy');
        $rider = $this->createUser('customer', 'w1rid');
        $this->createRiderRecord($rider);

        [, $orderId] = $this->createArrivedOrder($owner, $buyer, $rider);

        $wr1Id = (int) $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/waiting-requests")
            ->assertStatus(201)
            ->json('data.waiting_request.id');

        // 2nd while pending -> 409
        $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/waiting-requests")->assertStatus(409);

        // Accept 1st -> 2nd while accepted -> 409
        $this->actingAs($rider)->patchJson("/api/waiting-requests/{$wr1Id}", ['action' => 'accept'])->assertOk();
        $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/waiting-requests")->assertStatus(409);

        // Let 1st wait finish, then 2nd succeeds, then 3rd rejected
        $this->travel(6)->minutes();
        $wr2Id = (int) $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/waiting-requests")
            ->assertStatus(201)
            ->json('data.waiting_request.id');
        $this->actingAs($rider)->patchJson("/api/waiting-requests/{$wr2Id}", ['action' => 'decline'])->assertOk();

        $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/waiting-requests")->assertStatus(409);
    }

    public function test_waiting_request_expires_after_five_minutes_without_penalty(): void
    {
        Queue::fake();

        $owner = $this->createUser('customer', 'w2own');
        $buyer = $this->createUser('customer', 'w2buy');
        $rider = $this->createUser('customer', 'w2rid');
        $this->createRiderRecord($rider);

        [, $orderId] = $this->createArrivedOrder($owner, $buyer, $rider);

        $wrId = (int) $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/waiting-requests")
            ->assertStatus(201)
            ->json('data.waiting_request.id');
        Queue::assertPushed(ExpireWaitingRequestJob::class, 1);

        $this->travel(6)->minutes();
        app(WaitingRequestService::class)->expirePendingRequest($wrId);

        $this->assertSame('expired', DB::table('waiting_requests')->where('id', $wrId)->value('status'));
        $this->assertNull(DB::table('users')->where('user_id', $buyer->user_id)->value('ordering_suspended_until'));
        $this->assertSame(0, DB::table('customer_incidents')->where('order_id', $orderId)->count());
    }

    public function test_waiting_request_accept_vs_expire_race_yields_one_outcome(): void
    {
        Queue::fake();

        $owner = $this->createUser('customer', 'w3own');
        $buyer = $this->createUser('customer', 'w3buy');
        $rider = $this->createUser('customer', 'w3rid');
        $this->createRiderRecord($rider);

        [, $orderId] = $this->createArrivedOrder($owner, $buyer, $rider);

        // Case A: expired before accept -> lazy expiry wins (409)
        $wr1Id = (int) $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/waiting-requests")
            ->assertStatus(201)
            ->json('data.waiting_request.id');
        $this->travel(6)->minutes();
        $this->actingAs($rider)->patchJson("/api/waiting-requests/{$wr1Id}", ['action' => 'accept'])->assertStatus(409);
        $this->assertSame('expired', DB::table('waiting_requests')->where('id', $wr1Id)->value('status'));

        // Case B: accepted before expiry job runs -> accept wins (job is no-op)
        $wr2Id = (int) $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/waiting-requests")
            ->assertStatus(201)
            ->json('data.waiting_request.id');
        $this->actingAs($rider)->patchJson("/api/waiting-requests/{$wr2Id}", ['action' => 'accept'])->assertOk();
        $this->travel(6)->minutes();
        app(WaitingRequestService::class)->expirePendingRequest($wr2Id);
        $this->assertSame('accepted', DB::table('waiting_requests')->where('id', $wr2Id)->value('status'));
    }

    public function test_waiting_request_only_customer_can_request_and_only_assigned_rider_can_respond(): void
    {
        $owner = $this->createUser('customer', 'w4own');
        $buyer = $this->createUser('customer', 'w4buy');
        $otherCustomer = $this->createUser('customer', 'w4oth');
        $rider = $this->createUser('customer', 'w4rid');
        $otherRider = $this->createUser('customer', 'w4r2');
        $this->createRiderRecord($rider);
        $this->createRiderRecord($otherRider);

        [, $orderId] = $this->createArrivedOrder($owner, $buyer, $rider);

        $this->actingAs($otherCustomer)->postJson("/api/orders/{$orderId}/waiting-requests")->assertStatus(404);

        $wrId = (int) $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/waiting-requests")
            ->assertStatus(201)
            ->json('data.waiting_request.id');

        $this->actingAs($otherRider)->patchJson("/api/waiting-requests/{$wrId}", ['action' => 'accept'])->assertStatus(404);
    }

    public function test_auto_cancel_blocked_during_accepted_wait_and_cancels_promptly_when_wait_ends(): void
    {
        Queue::fake();

        $owner = $this->createUser('customer', 'w5own');
        $buyer = $this->createUser('customer', 'w5buy');
        $rider = $this->createUser('customer', 'w5rid');
        $this->createRiderRecord($rider);

        [, $orderId] = $this->createArrivedOrder($owner, $buyer, $rider);

        $wrId = (int) $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/waiting-requests")
            ->assertStatus(201)
            ->json('data.waiting_request.id');
        $this->actingAs($rider)->patchJson("/api/waiting-requests/{$wrId}", ['action' => 'accept'])->assertOk();
        Queue::assertPushed(NotifyWaitEndedJob::class, 1);

        // Simulate 3 strikes and > 5 min since arrived_at while wait is still active
        DB::table('orders')->where('order_id', $orderId)->update([
            'call_attempts' => 3,
            'arrived_at' => now()->subMinutes(6),
        ]);

        $this->actingAs($buyer)->getJson("/api/customer/orders/{$orderId}")
            ->assertOk()
            ->assertJsonPath('data.order.order_status', 'arrived');

        // Advance past wait_ends_at and run NotifyWaitEndedJob handler -> cancels promptly!
        $this->travel(6)->minutes();
        app(WaitingRequestService::class)->notifyWaitEnded($wrId);

        $this->assertSame('cancelled', DB::table('orders')->where('order_id', $orderId)->value('order_status'));
        $this->assertSame('customer_unreachable', DB::table('orders')->where('order_id', $orderId)->value('cancellation_reason'));
    }

    public function test_unanswered_call_during_accepted_wait_is_not_a_strike(): void
    {
        Queue::fake();

        $owner = $this->createUser('customer', 'w6own');
        $buyer = $this->createUser('customer', 'w6buy');
        $rider = $this->createUser('customer', 'w6rid');
        $this->createRiderRecord($rider);

        [, $orderId] = $this->createArrivedOrder($owner, $buyer, $rider);

        $wrId = (int) $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/waiting-requests")
            ->assertStatus(201)
            ->json('data.waiting_request.id');
        $this->actingAs($rider)->patchJson("/api/waiting-requests/{$wrId}", ['action' => 'accept'])->assertOk();

        $this->actingAs($rider)->postJson("/api/rider/orders/{$orderId}/call/start")->assertOk();
        $this->travel(25)->seconds();

        $this->actingAs($buyer)->getJson("/api/customer/orders/{$orderId}")
            ->assertOk()
            ->assertJsonPath('data.order.call_attempts', 0);

        $call = DB::table('call_logs')->where('order_id', $orderId)->orderByDesc('id')->first();
        $this->assertSame('timed_out', $call->status);
        $this->assertEquals(0, $call->counted_as_strike);
    }

    public function test_rider_declining_wait_creates_incident_without_ban(): void
    {
        $owner = $this->createUser('customer', 'w7own');
        $buyer = $this->createUser('customer', 'w7buy');
        $rider = $this->createUser('customer', 'w7rid');
        $this->createRiderRecord($rider);

        [, $orderId] = $this->createArrivedOrder($owner, $buyer, $rider);

        $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/messages", ['message' => 'Almost there!'])->assertStatus(201);
        $wrId = (int) $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/waiting-requests")
            ->assertStatus(201)
            ->json('data.waiting_request.id');

        $this->actingAs($rider)->patchJson("/api/waiting-requests/{$wrId}", ['action' => 'decline'])
            ->assertOk()
            ->assertJsonPath('data.waiting_request.status', 'declined');

        $incident = DB::table('customer_incidents')->where('order_id', $orderId)->where('type', 'rider_declined_wait')->first();
        $this->assertNotNull($incident);
        $this->assertStringContainsString('Almost there!', (string) $incident->details);
        $this->assertNull(DB::table('users')->where('user_id', $buyer->user_id)->value('ordering_suspended_until'));
    }

    public function test_admin_can_view_connect_audit_and_lift_ordering_suspension(): void
    {
        $owner = $this->createUser('customer', 'a1own');
        $buyer = $this->createUser('customer', 'a1buy');
        $rider = $this->createUser('customer', 'a1rid');
        $admin = $this->createUser('admin', 'a1adm');
        $this->createRiderRecord($rider);

        [, $orderId] = $this->createArrivedOrder($owner, $buyer, $rider);
        $this->actingAs($buyer)->postJson("/api/orders/{$orderId}/messages", ['message' => 'Hello'])->assertStatus(201);

        DB::table('users')->where('user_id', $buyer->user_id)->update([
            'ordering_suspended_until' => now()->addHours(24),
            'suspension_reason' => 'Unreachable',
        ]);

        $this->actingAs($admin)->getJson("/api/admin/orders/{$orderId}")
            ->assertOk()
            ->assertJsonPath('data.order.connect.messages.0.message', 'Hello')
            ->assertJsonPath('data.order.connect.customer_ordering_suspended', true);

        $this->actingAs($admin)->postJson("/api/admin/users/{$buyer->user_id}/lift-suspension")
            ->assertOk()
            ->assertJsonPath('data.ordering_suspended_until', null);

        $this->assertNull(DB::table('users')->where('user_id', $buyer->user_id)->value('ordering_suspended_until'));
    }
}
