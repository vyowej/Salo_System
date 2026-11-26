<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ReceiptPhase5Test extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $prefix = 'rcp'): User
    {
        return User::forceCreate([
            'username' => "{$prefix}_".random_int(10000, 99999),
            'first_name' => 'Ana',
            'last_name' => 'Santos',
            'phone_number' => '+639171234567',
            'email' => "{$prefix}_".random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);
    }

    private function createOrderFixture(string $orderType = 'delivery', string $orderStatus = 'delivered'): array
    {
        $owner = $this->createUser('owner');
        $otherOwner = $this->createUser('other_owner');
        $customer = $this->createUser('buyer');
        $otherCustomer = $this->createUser('other_buyer');
        $riderUser = $this->createUser('rider');
        $otherRiderUser = $this->createUser('other_rider');

        $cityId = (int) (DB::table('cities')->value('city_id')
            ?? DB::table('cities')->insertGetId([
                'province_id' => DB::table('provinces')->value('province_id')
                    ?? DB::table('provinces')->insertGetId(['province_name' => 'Metro Manila']),
                'city_name' => 'Quezon City',
            ]));

        $riderId = (int) DB::table('riders')->insertGetId([
            'user_id' => $riderUser->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Contact',
            'emergency_contact_relationship' => 'sibling',
            'emergency_contact_phone' => '09171112222',
            'base_city_id' => $cityId,
            'rider_status' => 'active',
            'approved_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('riders')->insert([
            'user_id' => $otherRiderUser->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Contact 2',
            'emergency_contact_relationship' => 'sibling',
            'emergency_contact_phone' => '09171112223',
            'base_city_id' => $cityId,
            'rider_status' => 'active',
            'approved_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

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
        ]);

        $catId = (int) DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $restaurantId,
            'category_name' => 'Mains',
            'sort_order' => 0,
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $menuItemId = (int) DB::table('menu_items')->insertGetId([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'item_name' => 'Original Pork Sisig',
            'base_price' => 150.00,
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'sort_order' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $checkoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $customer->user_id,
            'idempotency_key' => 'rcp-chk-'.random_int(100000, 999999),
            'checkout_status' => 'pending',
            'total_amount' => $orderType === 'delivery' ? 349.00 : 300.00,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $deliveryFee = $orderType === 'delivery' ? 49.00 : 0.00;
        $totalAmount = 300.00 + $deliveryFee;

        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'order_reference' => 'ORD-RCP-'.random_int(10000, 99999),
            'customer_id' => $customer->user_id,
            'customer_name' => 'Ana Santos',
            'restaurant_id' => $restaurantId,
            'order_type' => $orderType,
            'order_status' => $orderStatus,
            'restaurant_name' => 'Maginhawa Grill',
            'delivery_address_text' => $orderType === 'delivery' ? '18 Katipunan Ave, Brgy. Loyola Heights, Quezon City, Metro Manila' : null,
            'subtotal_amount' => 300.00,
            'delivery_fee' => $deliveryFee,
            'total_amount' => $totalAmount,
            'placed_at' => now()->subMinutes(30),
            'completed_at' => $orderType !== 'delivery' && $orderStatus === 'completed' ? now() : null,
            'rejection_reason' => $orderStatus === 'rejected' ? 'Out of stock' : null,
            'rejected_at' => $orderStatus === 'rejected' ? now() : null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('order_items')->insert([
            'order_id' => $orderId,
            'menu_item_id' => $menuItemId,
            'item_name' => 'Original Pork Sisig',
            'unit_price' => 150.00,
            'quantity' => 2,
            'line_total' => 300.00,
        ]);

        $paymentId = (int) DB::table('payments')->insertGetId([
            'checkout_id' => $checkoutId,
            'customer_id' => $customer->user_id,
            'payment_method' => 'cash',
            'payment_status' => $orderStatus === 'delivered' || $orderStatus === 'completed' ? 'paid' : 'pending',
            'amount' => $totalAmount,
            'paid_at' => $orderStatus === 'delivered' || $orderStatus === 'completed' ? now() : null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('payment_allocations')->insert([
            'payment_id' => $paymentId,
            'order_id' => $orderId,
            'allocation_type' => 'order_payment',
            'amount' => $totalAmount,
            'created_at' => now(),
        ]);

        if ($orderType === 'delivery') {
            DB::table('deliveries')->insert([
                'order_id' => $orderId,
                'rider_id' => $riderId,
                'delivery_status' => $orderStatus === 'delivered' ? 'delivered' : 'accepted',
                'cod_amount_collected' => $orderStatus === 'delivered' ? $totalAmount : null,
                'cod_remittance_status' => 'pending',
                'delivered_at' => $orderStatus === 'delivered' ? now() : null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return compact(
            'orderId',
            'menuItemId',
            'restaurantId',
            'owner',
            'otherOwner',
            'customer',
            'otherCustomer',
            'riderUser',
            'otherRiderUser',
        );
    }

    public function test_receipt_authorization_and_snapshot_prices_for_all_roles(): void
    {
        $f = $this->createOrderFixture('delivery', 'delivered');

        // Mutate live menu item name and price AFTER purchase -> receipt MUST still show snapshot!
        DB::table('menu_items')
            ->where('menu_item_id', $f['menuItemId'])
            ->update(['item_name' => 'Renamed Sisig', 'base_price' => 999.00]);

        // Customer (owner) -> 200
        $custRes = $this->actingAs($f['customer'])->getJson("/api/customer/orders/{$f['orderId']}/receipt");
        $custRes->assertOk();
        $custRes->assertJsonPath('data.receipt.subtotal_amount', 300);
        $custRes->assertJsonPath('data.receipt.delivery_fee', 49);
        $custRes->assertJsonPath('data.receipt.total_amount', 349);
        $custRes->assertJsonPath('data.receipt.items.0.item_name', 'Original Pork Sisig');
        $custRes->assertJsonPath('data.receipt.items.0.unit_price', 150);
        $custRes->assertJsonPath('data.receipt.payment_status_label', 'Paid in cash');

        // Other customer -> 404
        $this->actingAs($f['otherCustomer'])->getJson("/api/customer/orders/{$f['orderId']}/receipt")->assertNotFound();

        // Restaurant owner -> 200
        $restRes = $this->actingAs($f['owner'])
            ->withHeader('X-Restaurant-Id', (string) $f['restaurantId'])
            ->getJson("/api/restaurant/orders/{$f['orderId']}/receipt");
        $restRes->assertOk();
        $restRes->assertJsonPath('data.receipt.total_amount', 349);
        $restRes->assertJsonPath('data.receipt.items.0.item_name', 'Original Pork Sisig');

        // Unauthorized restaurant user -> 403
        $this->actingAs($f['otherOwner'])->getJson("/api/restaurant/orders/{$f['orderId']}/receipt")->assertForbidden();

        // Assigned rider -> 200
        $riderRes = $this->actingAs($f['riderUser'])->getJson("/api/rider/deliveries/{$f['orderId']}/receipt");
        $riderRes->assertOk();
        $riderRes->assertJsonPath('data.receipt.delivery_fee', 49);
        $riderRes->assertJsonPath('data.receipt.cod_amount_collected', 349);
        $this->assertArrayNotHasKey('items', $riderRes->json('data.receipt'));

        // Other rider -> 404
        $this->actingAs($f['otherRiderUser'])->getJson("/api/rider/deliveries/{$f['orderId']}/receipt")->assertNotFound();
    }

    public function test_receipt_is_blocked_for_non_final_and_cancelled_or_rejected_orders(): void
    {
        $preparing = $this->createOrderFixture('delivery', 'preparing');
        $this->actingAs($preparing['customer'])
            ->getJson("/api/customer/orders/{$preparing['orderId']}/receipt")
            ->assertStatus(409);

        $cancelled = $this->createOrderFixture('pickup', 'cancelled');
        $this->actingAs($cancelled['customer'])
            ->getJson("/api/customer/orders/{$cancelled['orderId']}/receipt")
            ->assertStatus(409);

        $rejected = $this->createOrderFixture('pickup', 'rejected');
        $this->actingAs($rejected['owner'])
            ->withHeader('X-Restaurant-Id', (string) $rejected['restaurantId'])
            ->getJson("/api/restaurant/orders/{$rejected['orderId']}/receipt")
            ->assertStatus(409);

        $completedPickup = $this->createOrderFixture('pickup', 'completed');
        $this->actingAs($completedPickup['customer'])
            ->getJson("/api/customer/orders/{$completedPickup['orderId']}/receipt")
            ->assertOk()
            ->assertJsonPath('data.receipt.delivery_fee', 0)
            ->assertJsonPath('data.receipt.total_amount', 300);
    }
}
