<?php

namespace Tests\Feature;

use App\Features\Notifications\Services\NotificationService;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class NotificationsTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'ntf', string $firstName = 'Test'): User
    {
        return User::forceCreate([
            'username' => "{$prefix}_" . random_int(10000, 99999),
            'first_name' => $firstName,
            'last_name' => 'User',
            'phone_number' => '+639171234567',
            'email' => "{$prefix}_" . random_int(10000, 99999) . '@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createActiveRestaurant(User $owner, string $name = 'Salo Kitchen'): int
    {
        $addrId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '101 Katipunan Ave',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => $name,
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'biz_' . random_int(1000, 9999) . '@example.com',
            'contact_phone' => '09171234567',
            'address_id' => $addrId,
            'restaurant_status' => 'active',
            'accepting_orders' => 1,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        return $restaurantId;
    }

    private function createOrder(int $restaurantId, string $restaurantName, User $customer, string $orderType = 'pickup', string $status = 'pending'): int
    {
        $checkoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $customer->user_id,
            'idempotency_key' => 'idem_' . uniqid('', true),
            'checkout_status' => 'pending',
            'total_amount' => '150.00',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $restaurantId,
            'customer_id' => $customer->user_id,
            'restaurant_name' => $restaurantName,
            'customer_name' => $customer->first_name . ' ' . $customer->last_name,
            'order_reference' => 'SALO-ORD-' . random_int(100000, 999999),
            'order_type' => $orderType,
            'order_priority' => 'standard',
            'order_status' => $status,
            'subtotal_amount' => '150.00',
            'delivery_fee' => '0.00',
            'total_amount' => '150.00',
            'placed_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $paymentId = (int) DB::table('payments')->insertGetId([
            'payment_reference' => 'SALO-PAY-' . random_int(100000, 999999),
            'checkout_id' => $checkoutId,
            'customer_id' => $customer->user_id,
            'payment_method' => 'cash',
            'payment_type' => 'payment',
            'payment_status' => 'pending',
            'amount' => '150.00',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('payment_allocations')->insert([
            'payment_id' => $paymentId,
            'order_id' => $orderId,
            'allocation_type' => 'order_payment',
            'amount' => '150.00',
            'created_at' => now(),
        ]);

        return $orderId;
    }

    public function test_unauthenticated_requests_return_401(): void
    {
        $this->getJson('/api/notifications')->assertStatus(401);
        $this->getJson('/api/notifications/unread-count')->assertStatus(401);
        $this->postJson('/api/notifications/1/read')->assertStatus(401);
        $this->postJson('/api/notifications/read-all')->assertStatus(401);
    }

    public function test_own_only_access_404_on_others_workspace_filter_unread_counts_and_pagination(): void
    {
        $userA = $this->createUser('customer', 'na');
        $userB = $this->createUser('customer', 'nb');

        /** @var NotificationService $service */
        $service = app(NotificationService::class);

        $n1 = $service->notifyUser($userA->user_id, 'customer', 'order_accepted', 'Accepted', 'Order accepted', 'order', 10);
        $n2 = $service->notifyUser($userA->user_id, 'restaurant', 'order_received', 'New order', 'New order received', 'order', 11);
        $n3 = $service->notifyUser($userA->user_id, 'rider', 'rider_activated', 'Activated', 'Rider activated', 'rider', 12);
        $nB = $service->notifyUser($userB->user_id, 'customer', 'order_accepted', 'Other', 'Other user notif', 'order', 13);

        // User A cannot see or mark User B's notification
        $this->actingAs($userA)->postJson("/api/notifications/{$nB}/read")->assertStatus(404);

        // Unread counts per workspace
        $this->actingAs($userA)
            ->getJson('/api/notifications/unread-count')
            ->assertOk()
            ->assertJsonPath('data.total', 3)
            ->assertJsonPath('data.by_workspace.customer', 1)
            ->assertJsonPath('data.by_workspace.restaurant', 1)
            ->assertJsonPath('data.by_workspace.rider', 1)
            ->assertJsonPath('data.by_workspace.admin', 0);

        // Workspace filter
        $this->actingAs($userA)
            ->getJson('/api/notifications?workspace=restaurant')
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.notification_id', $n2);

        // Pagination
        $this->actingAs($userA)
            ->getJson('/api/notifications?per_page=2&page=1')
            ->assertOk()
            ->assertJsonCount(2, 'data.items')
            ->assertJsonPath('data.pagination.total', 3)
            ->assertJsonPath('data.pagination.last_page', 2);

        // Mark one read
        $this->actingAs($userA)
            ->postJson("/api/notifications/{$n1}/read")
            ->assertOk()
            ->assertJsonPath('data.is_read', true);

        // unread_only=1 excludes read notification
        $this->actingAs($userA)
            ->getJson('/api/notifications?unread_only=1')
            ->assertOk()
            ->assertJsonCount(2, 'data.items');

        // read-all scoped to rider workspace
        $this->actingAs($userA)
            ->postJson('/api/notifications/read-all', ['workspace' => 'rider'])
            ->assertOk()
            ->assertJsonPath('data.updated_count', 1);

        $this->actingAs($userA)
            ->getJson('/api/notifications/unread-count')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.by_workspace.restaurant', 1)
            ->assertJsonPath('data.by_workspace.rider', 0);

        // read-all without workspace marks remaining unread
        $this->actingAs($userA)
            ->postJson('/api/notifications/read-all')
            ->assertOk()
            ->assertJsonPath('data.updated_count', 1);

        $this->assertNotNull(DB::table('notifications')->where('notification_id', $n3)->value('read_at'));
    }

    public function test_restaurant_order_transitions_notify_customer_once_per_valid_transition_and_not_on_invalid(): void
    {
        $owner = $this->createUser('customer', 'own', 'Maria');
        $customer = $this->createUser('customer', 'cus', 'Juan');
        $restaurantId = $this->createActiveRestaurant($owner, 'Manila Bistro');
        $orderId = $this->createOrder($restaurantId, 'Manila Bistro', $customer, 'pickup', 'pending');

        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/accept")->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/accept")->assertStatus(409); // invalid double accept
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/prepare")->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/ready")->assertOk();
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$orderId}/complete")->assertOk();

        $customerTypes = DB::table('notifications')
            ->where('user_id', $customer->user_id)
            ->where('workspace', 'customer')
            ->orderBy('notification_id')
            ->pluck('type')
            ->all();

        $this->assertSame([
            'order_accepted',
            'order_preparing',
            'order_ready',
            'order_completed',
        ], $customerTypes);

        // Reject flow includes reason
        $order2Id = $this->createOrder($restaurantId, 'Manila Bistro', $customer, 'pickup', 'pending');
        $this->actingAs($owner)->postJson("/api/restaurant/orders/{$order2Id}/reject", [
            'reason' => 'Out of stock',
        ])->assertOk();

        $rejectedNotif = DB::table('notifications')
            ->where('user_id', $customer->user_id)
            ->where('related_entity_id', $order2Id)
            ->where('type', 'order_rejected')
            ->first();

        $this->assertNotNull($rejectedNotif);
        $this->assertStringContainsString('Out of stock', $rejectedNotif->body);
    }

    public function test_customer_cancel_notifies_customer_and_only_handler_staff_and_owner(): void
    {
        $owner = $this->createUser('customer', 'owc', 'Elena');
        $handlerStaff = $this->createUser('customer', 'stf1', 'Carlo');
        $nonHandlerStaff = $this->createUser('customer', 'stf2', 'Ana');
        $inactiveStaff = $this->createUser('customer', 'stf3', 'Leo');
        $customer = $this->createUser('customer', 'cusc', 'Pedro');

        $restaurantId = $this->createActiveRestaurant($owner, 'Baguio Cafe');

        DB::table('restaurant_staff')->insert([
            [
                'restaurant_id' => $restaurantId,
                'user_id' => $handlerStaff->user_id,
                'invited_by' => $owner->user_id,
                'staff_position' => 'Order Handler',
                'staff_status' => 'active',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'restaurant_id' => $restaurantId,
                'user_id' => $nonHandlerStaff->user_id,
                'invited_by' => $owner->user_id,
                'staff_position' => 'Inventory Manager',
                'staff_status' => 'active',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'restaurant_id' => $restaurantId,
                'user_id' => $inactiveStaff->user_id,
                'invited_by' => $owner->user_id,
                'staff_position' => 'Order Handler',
                'staff_status' => 'inactive',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $orderId = $this->createOrder($restaurantId, 'Baguio Cafe', $customer, 'pickup', 'pending');

        $this->actingAs($customer)->postJson("/api/customer/orders/{$orderId}/cancel", [
            'reason' => 'Changed my mind',
        ])->assertOk();

        $this->assertSame(1, DB::table('notifications')->where('user_id', $customer->user_id)->where('type', 'order_cancelled')->count());
        $this->assertSame(1, DB::table('notifications')->where('user_id', $owner->user_id)->where('workspace', 'restaurant')->where('type', 'order_cancelled_by_customer')->count());
        $this->assertSame(1, DB::table('notifications')->where('user_id', $handlerStaff->user_id)->where('workspace', 'restaurant')->where('type', 'order_cancelled_by_customer')->count());
        $this->assertSame(0, DB::table('notifications')->where('user_id', $nonHandlerStaff->user_id)->count());
        $this->assertSame(0, DB::table('notifications')->where('user_id', $inactiveStaff->user_id)->count());
    }

    public function test_rider_delivery_events_notify_customer_with_first_name_only(): void
    {
        $owner = $this->createUser('customer', 'owr', 'Owner');
        $customer = $this->createUser('customer', 'cusr', 'Buyer');
        $riderUser = $this->createUser('customer', 'rdr', 'Marco');
        $restaurantId = $this->createActiveRestaurant($owner, 'Cebu Grill');
        $orderId = $this->createOrder($restaurantId, 'Cebu Grill', $customer, 'delivery', 'ready');

        $cityId = (int) DB::table('cities')->value('city_id');
        $riderId = (int) DB::table('riders')->insertGetId([
            'user_id' => $riderUser->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Jane',
            'emergency_contact_relationship' => 'sibling',
            'emergency_contact_phone' => '09171112222',
            'base_city_id' => $cityId,
            'rider_status' => 'active',
            'approved_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('deliveries')->insert([
            'order_id' => $orderId,
            'rider_id' => $riderId,
            'delivery_status' => 'accepted',
            'assigned_at' => now(),
            'accepted_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($riderUser)->postJson("/api/rider/deliveries/{$orderId}/picked-up")->assertOk();
        $this->actingAs($riderUser)->postJson("/api/rider/orders/{$orderId}/arrive")->assertOk();
        $this->actingAs($riderUser)->postJson("/api/rider/orders/{$orderId}/call/start")->assertOk();
        $this->actingAs($customer)->postJson("/api/customer/orders/{$orderId}/call/respond", ['action' => 'accept'])->assertOk();
        $this->actingAs($riderUser)->postJson("/api/rider/deliveries/{$orderId}/delivered", [
            'collected_amount' => 150.00,
        ])->assertOk();

        $outNotif = DB::table('notifications')
            ->where('user_id', $customer->user_id)
            ->where('type', 'order_out_for_delivery')
            ->first();
        $delivNotif = DB::table('notifications')
            ->where('user_id', $customer->user_id)
            ->where('type', 'order_delivered')
            ->first();

        $this->assertNotNull($outNotif);
        $this->assertNotNull($delivNotif);
        $this->assertStringContainsString('Marco', $outNotif->body);
        $this->assertStringNotContainsString('User', $outNotif->body);
    }

    public function test_application_review_and_rider_activation_route_to_correct_workspaces_and_exclude_acting_admin(): void
    {
        $adminActor = $this->createUser('admin', 'adma', 'AdminOne');
        $otherAdmin = $this->createUser('admin', 'admb', 'AdminTwo');
        $applicant = $this->createUser('customer', 'appu', 'Liza');

        $cityId = (int) DB::table('cities')->value('city_id');
        $riderId = (int) DB::table('riders')->insertGetId([
            'user_id' => $applicant->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Contact',
            'emergency_contact_relationship' => 'sibling',
            'emergency_contact_phone' => '09171112222',
            'base_city_id' => $cityId,
            'rider_status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $addrId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '123 Rider St',
        ]);

        $appId = (int) DB::table('rider_applications')->insertGetId([
            'applicant_user_id' => $applicant->user_id,
            'rider_id' => $riderId,
            'reference_number' => 'SALO-RID-' . random_int(10000, 99999),
            'legal_first_name' => 'Liza',
            'legal_last_name' => 'User',
            'date_of_birth' => '1995-05-01',
            'contact_email' => $applicant->email,
            'contact_email_verified_at' => now(),
            'contact_phone' => '09171234567',
            'residence_address_id' => $addrId,
            'gov_id_type' => 'philid',
            'gov_id_number_encrypted' => 'enc_dummy',
            'gov_id_is_permanent' => 1,
            'declarations_accepted_at' => now(),
            'terms_version' => '1.0',
            'application_status' => 'submitted',
            'submitted_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Move to under_review -> customer workspace
        $this->actingAs($adminActor)->postJson("/api/admin/applications/rider/{$appId}/decision", [
            'decision' => 'under_review',
        ])->assertOk();

        // Request additional document -> customer workspace
        $this->actingAs($adminActor)->postJson("/api/admin/applications/rider/{$appId}/document-requests", [
            'document_name' => 'Driver License',
            'reason' => 'Blurry photo',
        ])->assertCreated();

        // Verify applicant got both in customer workspace
        $this->assertSame(1, DB::table('notifications')->where('user_id', $applicant->user_id)->where('workspace', 'customer')->where('type', 'rider_application_under_review')->count());
        $reqNotif = DB::table('notifications')->where('user_id', $applicant->user_id)->where('workspace', 'customer')->where('type', 'rider_application_additional_documents_required')->first();
        $this->assertNotNull($reqNotif);
        $this->assertStringContainsString('Driver License', $reqNotif->body);

        // Move back to under_review and approve -> rider workspace
        DB::table('rider_applications')->where('rider_application_id', $appId)->update(['application_status' => 'under_review']);
        $this->actingAs($adminActor)->postJson("/api/admin/applications/rider/{$appId}/decision", [
            'decision' => 'approve',
        ])->assertOk();

        $this->assertSame(1, DB::table('notifications')->where('user_id', $applicant->user_id)->where('workspace', 'rider')->where('type', 'rider_application_approved')->count());

        // Activate rider -> rider workspace
        $this->actingAs($adminActor)->postJson("/api/admin/riders/{$riderId}/activate")->assertOk();
        $this->assertSame(1, DB::table('notifications')->where('user_id', $applicant->user_id)->where('workspace', 'rider')->where('type', 'rider_activated')->count());

        // Acting admin was not notified about their own actions
        $this->assertSame(0, DB::table('notifications')->where('user_id', $adminActor->user_id)->count());
        $this->assertSame(0, DB::table('notifications')->where('user_id', $otherAdmin->user_id)->count());
    }

    public function test_notification_is_rolled_back_when_transaction_fails(): void
    {
        $user = $this->createUser('customer', 'rb');
        /** @var NotificationService $service */
        $service = app(NotificationService::class);

        try {
            DB::transaction(function () use ($service, $user): void {
                $service->notifyUser($user->user_id, 'customer', 'test_rb', 'Rollback', 'Should not persist');
                throw new \RuntimeException('Simulated failure');
            });
        } catch (\RuntimeException) {
            // expected
        }

        $this->assertSame(0, DB::table('notifications')->where('user_id', $user->user_id)->where('type', 'test_rb')->count());
    }

    public function test_delivery_assignment_notifies_customer_and_restaurant_handlers_with_privacy_and_duplicate_guards(): void
    {
        $owner = $this->createUser('customer', 'owda', 'Elena');
        $handlerStaff = $this->createUser('customer', 'stda1', 'Carlo');
        $nonHandlerStaff = $this->createUser('customer', 'stda2', 'Ana');
        $customer = $this->createUser('customer', 'cuda', 'Pedro');
        $riderUser = $this->createUser('customer', 'rdda1', 'Marco');
        $otherRiderUser = $this->createUser('customer', 'rdda2', 'Lucas');

        $restaurantId = $this->createActiveRestaurant($owner, 'Pasig Kitchen');

        DB::table('restaurant_staff')->insert([
            [
                'restaurant_id' => $restaurantId,
                'user_id' => $handlerStaff->user_id,
                'invited_by' => $owner->user_id,
                'staff_position' => 'Order Handler',
                'staff_status' => 'active',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'restaurant_id' => $restaurantId,
                'user_id' => $nonHandlerStaff->user_id,
                'invited_by' => $owner->user_id,
                'staff_position' => 'Inventory Manager',
                'staff_status' => 'active',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $cityId = (int) DB::table('cities')->value('city_id');
        $riderId = (int) DB::table('riders')->insertGetId([
            'user_id' => $riderUser->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Jane',
            'emergency_contact_relationship' => 'sibling',
            'emergency_contact_phone' => '09171112222',
            'base_city_id' => $cityId,
            'rider_status' => 'active',
            'approved_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $otherRiderId = (int) DB::table('riders')->insertGetId([
            'user_id' => $otherRiderUser->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'John',
            'emergency_contact_relationship' => 'sibling',
            'emergency_contact_phone' => '09171113333',
            'base_city_id' => $cityId,
            'rider_status' => 'active',
            'approved_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $orderId = $this->createOrder($restaurantId, 'Pasig Kitchen', $customer, 'delivery', 'ready');

        // Offline rider cannot accept -> 403 and zero notifications
        $this->actingAs($riderUser)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertStatus(403);
        $this->assertSame(0, DB::table('notifications')->where('type', 'delivery_rider_assigned')->count());

        // Non-rider customer cannot accept -> 403 and zero notifications
        $this->actingAs($customer)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertStatus(403);
        $this->assertSame(0, DB::table('notifications')->where('type', 'delivery_rider_assigned')->count());

        // Put both riders online via Cache
        Cache::forever("rider:availability:{$riderId}", ['status' => 'online', 'is_online' => true]);
        Cache::forever("rider:availability:{$otherRiderId}", ['status' => 'online', 'is_online' => true]);

        // Successful accept
        $this->actingAs($riderUser)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertOk();

        // Duplicate accept by second rider -> 409, no duplicate notifications
        $this->actingAs($otherRiderUser)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertStatus(409);

        $custNotif = DB::table('notifications')
            ->where('user_id', $customer->user_id)
            ->where('workspace', 'customer')
            ->where('type', 'delivery_rider_assigned')
            ->get();
        $this->assertCount(1, $custNotif);
        $this->assertSame('order', $custNotif[0]->related_entity_type);
        $this->assertSame($orderId, (int) $custNotif[0]->related_entity_id);
        $this->assertStringContainsString('Marco', $custNotif[0]->body);
        $this->assertStringNotContainsString('+639171234567', $custNotif[0]->body);
        $this->assertStringNotContainsString('User', $custNotif[0]->body);

        $this->assertSame(1, DB::table('notifications')->where('user_id', $owner->user_id)->where('workspace', 'restaurant')->where('type', 'delivery_rider_assigned')->count());
        $this->assertSame(1, DB::table('notifications')->where('user_id', $handlerStaff->user_id)->where('workspace', 'restaurant')->where('type', 'delivery_rider_assigned')->count());
        $this->assertSame(0, DB::table('notifications')->where('user_id', $nonHandlerStaff->user_id)->count());

        // Not-ready order cannot be accepted -> 409, no notifications
        $pendingOrderId = $this->createOrder($restaurantId, 'Pasig Kitchen', $customer, 'delivery', 'pending');
        $this->actingAs($otherRiderUser)->postJson("/api/rider/deliveries/{$pendingOrderId}/accept")->assertStatus(409);
        $this->assertSame(0, DB::table('notifications')->where('related_entity_id', $pendingOrderId)->where('type', 'delivery_rider_assigned')->count());
    }
}
