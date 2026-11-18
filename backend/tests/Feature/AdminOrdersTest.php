<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminOrdersTest extends TestCase
{
    use DatabaseTransactions;

    public function test_unauthenticated_and_non_admin_users_are_rejected(): void
    {
        $this->getJson('/api/admin/orders')->assertStatus(401);

        $customer = User::create([
            'username' => 'cust_ord_'.random_int(100, 999),
            'first_name' => 'Plain',
            'last_name' => 'Customer',
            'email' => 'cust_ord_'.random_int(100, 999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $this->actingAs($customer)->getJson('/api/admin/orders')->assertStatus(403);
    }

    public function test_admin_can_list_search_filter_and_paginate_orders(): void
    {
        [$admin, $fixtures] = $this->seedOrderFixtures();

        // 1. Authorized admin retrieves orders with expected structure and values
        $res = $this->actingAs($admin)->getJson('/api/admin/orders')
            ->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'message',
                'data' => [
                    'items' => [
                        '*' => [
                            'order_id',
                            'checkout_id',
                            'order_reference',
                            'customer_id',
                            'customer_name',
                            'restaurant_id',
                            'restaurant_name',
                            'order_type',
                            'order_status',
                            'payment_method',
                            'payment_status',
                            'subtotal_amount',
                            'delivery_fee',
                            'total_amount',
                            'items_count',
                            'total_quantity',
                            'delivery_status',
                            'placed_at',
                            'paid_at',
                        ],
                    ],
                    'meta' => ['current_page', 'last_page', 'per_page', 'total'],
                ],
            ]);

        $this->assertGreaterThanOrEqual(3, $res->json('data.meta.total'));

        // 2. Search by order_reference
        $this->actingAs($admin)
            ->getJson('/api/admin/orders?search='.urlencode($fixtures['ref1']))
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.order_id', $fixtures['order1Id'])
            ->assertJsonPath('data.items.0.items_count', 1)
            ->assertJsonPath('data.items.0.total_quantity', 2);

        // 3. Search by customer_name
        $this->actingAs($admin)
            ->getJson('/api/admin/orders?search='.urlencode('Elena Reyes'))
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.order_id', $fixtures['order2Id']);

        // 4. Search by restaurant_name
        $this->actingAs($admin)
            ->getJson('/api/admin/orders?search='.urlencode('Tondo Grill'))
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.order_id', $fixtures['order3Id']);

        // 5. Filter by order_status
        $this->actingAs($admin)
            ->getJson('/api/admin/orders?order_status=completed&search='.urlencode('AdminTest'))
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.order_id', $fixtures['order2Id']);

        // 6. Filter by order_type
        $this->actingAs($admin)
            ->getJson('/api/admin/orders?order_type=pickup&search='.urlencode('AdminTest'))
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.order_id', $fixtures['order2Id']);

        // 7. Filter by payment_status
        $this->actingAs($admin)
            ->getJson('/api/admin/orders?payment_status=paid&search='.urlencode('AdminTest'))
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.order_id', $fixtures['order2Id']);

        // 8. Date-range filtering
        $this->actingAs($admin)
            ->getJson('/api/admin/orders?date_from=2026-10-05&date_to=2026-10-15&search='.urlencode('AdminTest'))
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.order_id', $fixtures['order2Id']);

        // 9. Pagination & per_page limit
        $page1 = $this->actingAs($admin)
            ->getJson('/api/admin/orders?per_page=2&page=1&search='.urlencode('AdminTest'))
            ->assertOk()
            ->assertJsonCount(2, 'data.items')
            ->assertJsonPath('data.meta.current_page', 1)
            ->assertJsonPath('data.meta.per_page', 2)
            ->assertJsonPath('data.meta.total', 3)
            ->assertJsonPath('data.meta.last_page', 2);

        $page2 = $this->actingAs($admin)
            ->getJson('/api/admin/orders?per_page=2&page=2&search='.urlencode('AdminTest'))
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.meta.current_page', 2);

        $this->assertNotSame(
            $page1->json('data.items.0.order_id'),
            $page2->json('data.items.0.order_id'),
        );

        // 10. Empty result set
        $this->actingAs($admin)
            ->getJson('/api/admin/orders?search=NoSuchOrderReference999999')
            ->assertOk()
            ->assertJsonCount(0, 'data.items')
            ->assertJsonPath('data.meta.total', 0);
    }

    public function test_invalid_query_parameters_return_422(): void
    {
        $admin = User::create([
            'username' => 'admin_ord_val_'.random_int(100, 999),
            'first_name' => 'Val',
            'last_name' => 'Admin',
            'email' => 'admin_ord_val_'.random_int(100, 999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'admin',
            'account_status' => 'active',
        ]);

        $this->actingAs($admin)->getJson('/api/admin/orders?order_status=bogus_status')->assertStatus(422);
        $this->actingAs($admin)->getJson('/api/admin/orders?order_type=drone')->assertStatus(422);
        $this->actingAs($admin)->getJson('/api/admin/orders?payment_status=magic')->assertStatus(422);
        $this->actingAs($admin)->getJson('/api/admin/orders?per_page=500')->assertStatus(422);
        $this->actingAs($admin)->getJson('/api/admin/orders?page=0')->assertStatus(422);
        $this->actingAs($admin)->getJson('/api/admin/orders?date_from=2026-10-20&date_to=2026-10-01')->assertStatus(422);
    }

    /**
     * @return array{0:User,1:array<string,mixed>}
     */
    private function seedOrderFixtures(): array
    {
        $admin = User::create([
            'username' => 'admin_ord_'.random_int(100, 999),
            'first_name' => 'Orders',
            'last_name' => 'Admin',
            'email' => 'admin_ord_'.random_int(100, 999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'admin',
            'account_status' => 'active',
        ]);

        $cust1 = User::create([
            'username' => 'cust_one_'.random_int(100, 999),
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'email' => 'cust1_'.random_int(100, 999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $cust2 = User::create([
            'username' => 'cust_two_'.random_int(100, 999),
            'first_name' => 'Elena',
            'last_name' => 'Reyes',
            'email' => 'cust2_'.random_int(100, 999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $provinceId = DB::table('provinces')->insertGetId(['province_name' => 'Metro Manila AdminTest']);
        $cityId = DB::table('cities')->insertGetId(['province_id' => $provinceId, 'city_name' => 'Manila AdminTest']);
        $barangayId = DB::table('barangays')->insertGetId(['city_id' => $cityId, 'barangay_name' => 'Ermita AdminTest']);
        $addressId = DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '100 Taft Ave',
            'postal_code' => '1000',
        ]);

        $rest1Id = DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Casa Manila AdminTest',
            'registered_name' => 'Casa Manila Corp',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'casamanila@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
        ]);

        $rest2Id = DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Tondo Grill AdminTest',
            'registered_name' => 'Tondo Grill Corp',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'tondogrill@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
        ]);

        $catId = DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $rest1Id,
            'category_name' => 'Mains',
            'sort_order' => 1,
            'is_active' => 1,
        ]);

        $menuItemId = DB::table('menu_items')->insertGetId([
            'restaurant_id' => $rest1Id,
            'menu_category_id' => $catId,
            'item_name' => 'Adobo Bowl',
            'base_price' => 150.00,
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'sort_order' => 1,
        ]);

        $checkoutId = DB::table('checkouts')->insertGetId([
            'customer_id' => $cust1->user_id,
            'idempotency_key' => 'admin-ord-test-'.random_int(10000, 99999),
            'checkout_status' => 'pending',
            'total_amount' => 700.00,
        ]);

        $ref1 = 'SALO-ADM-001-'.random_int(100, 999);
        $ref2 = 'SALO-ADM-002-'.random_int(100, 999);
        $ref3 = 'SALO-ADM-003-'.random_int(100, 999);

        $order1Id = DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $rest1Id,
            'customer_id' => $cust1->user_id,
            'restaurant_name' => 'Casa Manila AdminTest',
            'customer_name' => 'Juan Dela Cruz AdminTest',
            'order_reference' => $ref1,
            'order_type' => 'delivery',
            'order_status' => 'pending',
            'subtotal_amount' => 300.00,
            'delivery_fee' => 49.00,
            'total_amount' => 349.00,
            'placed_at' => '2026-10-01 10:00:00',
        ]);

        DB::table('order_items')->insert([
            'order_id' => $order1Id,
            'menu_item_id' => $menuItemId,
            'item_name' => 'Adobo Bowl',
            'unit_price' => 150.00,
            'quantity' => 2,
            'line_total' => 300.00,
        ]);

        $order2Id = DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $rest1Id,
            'customer_id' => $cust2->user_id,
            'restaurant_name' => 'Casa Manila AdminTest',
            'customer_name' => 'Elena Reyes AdminTest',
            'order_reference' => $ref2,
            'order_type' => 'pickup',
            'order_status' => 'completed',
            'subtotal_amount' => 200.00,
            'delivery_fee' => 0.00,
            'total_amount' => 200.00,
            'placed_at' => '2026-10-10 12:00:00',
        ]);

        $order3Id = DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $rest2Id,
            'customer_id' => $cust1->user_id,
            'restaurant_name' => 'Tondo Grill AdminTest',
            'customer_name' => 'Marco Santos AdminTest',
            'order_reference' => $ref3,
            'order_type' => 'delivery',
            'order_status' => 'cancelled',
            'subtotal_amount' => 150.00,
            'delivery_fee' => 49.00,
            'total_amount' => 199.00,
            'placed_at' => '2026-10-25 18:00:00',
        ]);

        $pay1 = DB::table('payments')->insertGetId([
            'checkout_id' => $checkoutId,
            'customer_id' => $cust1->user_id,
            'payment_method' => 'cash',
            'payment_status' => 'pending',
            'amount' => 349.00,
        ]);
        DB::table('payment_allocations')->insert([
            'payment_id' => $pay1,
            'order_id' => $order1Id,
            'allocation_type' => 'order_payment',
            'amount' => 349.00,
        ]);

        $pay2 = DB::table('payments')->insertGetId([
            'checkout_id' => $checkoutId,
            'customer_id' => $cust2->user_id,
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'amount' => 200.00,
            'paid_at' => '2026-10-10 12:15:00',
        ]);
        DB::table('payment_allocations')->insert([
            'payment_id' => $pay2,
            'order_id' => $order2Id,
            'allocation_type' => 'order_payment',
            'amount' => 200.00,
        ]);

        return [$admin, compact('order1Id', 'order2Id', 'order3Id', 'ref1', 'ref2', 'ref3')];
    }
}
