<?php

namespace Tests\Feature;

use App\Features\Restaurants\Services\AvailabilityService;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CustomerContactNumbersTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', ?string $phone = null): User
    {
        $suffix = random_int(100000, 999999);

        return User::create([
            'username' => "{$role}_{$suffix}",
            'first_name' => ucfirst($role),
            'last_name' => 'Tester',
            'phone_number' => $phone,
            'email' => "{$role}_{$suffix}@example.com",
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function seedCheckoutFixtures(User $customer, int $restaurantCount = 1): array
    {
        $provinceId = (int) (DB::table('provinces')->where('province_name', 'Metro Manila')->value('province_id')
            ?? DB::table('provinces')->insertGetId(['province_name' => 'Metro Manila']));
        $cityId = (int) (DB::table('cities')->where('province_id', $provinceId)->where('city_name', 'Quezon City')->value('city_id')
            ?? DB::table('cities')->insertGetId(['province_id' => $provinceId, 'city_name' => 'Quezon City']));
        $barangayId = (int) (DB::table('barangays')->where('city_id', $cityId)->where('barangay_name', 'Diliman')->value('barangay_id')
            ?? DB::table('barangays')->insertGetId(['city_id' => $cityId, 'barangay_name' => 'Diliman']));

        DB::table('platform_service_areas')->insertOrIgnore([
            'province_id' => $provinceId,
            'city_id' => $cityId,
            'barangay_id' => null,
            'area_level' => 'city',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $addressId = (int) DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '456 Commonwealth Ave',
            'postal_code' => '1101',
            'latitude' => 14.6500,
            'longitude' => 121.0700,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('user_addresses')->insert([
            'user_id' => $customer->user_id,
            'address_id' => $addressId,
            'address_label' => 'Home',
            'is_default' => 1,
            'created_at' => now(),
        ]);

        $restaurants = [];
        for ($i = 0; $i < $restaurantCount; $i++) {
            $restAddrId = (int) DB::table('addresses')->insertGetId([
                'barangay_id' => $barangayId,
                'street' => "78{$i} Restaurant St",
                'postal_code' => '1101',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $restaurantId = (int) DB::table('restaurants')->insertGetId([
                'restaurant_name' => 'Contact Test Kitchen '.$i.' '.random_int(100, 999),
                'registered_name' => 'Contact Test Kitchen Corp '.$i,
                'business_type' => 'restaurant',
                'ownership_structure' => 'corporation',
                'business_email' => 'kitchen'.random_int(1000, 9999).'@example.com',
                'address_id' => $restAddrId,
                'offers_delivery' => 1,
                'offers_pickup' => 1,
                'offers_dine_in' => 0,
                'accepting_orders' => 1,
                'restaurant_status' => 'active',
                'is_published' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $dayOfWeek = Carbon::now(AvailabilityService::TIMEZONE)->dayOfWeek;
            DB::table('operating_hours')->insert([
                'restaurant_id' => $restaurantId,
                'day_of_week' => $dayOfWeek,
                'opening_time' => '00:00:00',
                'closing_time' => '23:59:00',
                'closes_next_day' => 0,
                'is_closed' => 0,
            ]);

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
            ]);

            $menuItemId = (int) DB::table('menu_items')->insertGetId([
                'restaurant_id' => $restaurantId,
                'menu_category_id' => $catId,
                'item_name' => 'Chicken Inasal '.$i,
                'base_price' => '180.00',
                'availability_status' => 'available',
                'approval_status' => 'approved',
                'draft_state' => 'clean',
                'is_published' => 1,
                'published_menu_category_id' => $catId,
                'published_item_name' => 'Chicken Inasal '.$i,
                'published_base_price' => '180.00',
                'published_sort_order' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $restaurants[] = [
                'restaurant_id' => $restaurantId,
                'menu_item_id' => $menuItemId,
            ];
        }

        return [
            'city_id' => $cityId,
            'address_id' => $addressId,
            'restaurants' => $restaurants,
        ];
    }

    public function test_unauthenticated_requests_are_rejected(): void
    {
        $this->getJson('/api/account/contact-numbers')->assertStatus(401);
        $this->postJson('/api/account/contact-numbers', [
            'label' => 'Personal',
            'phone_number' => '09171234567',
        ])->assertStatus(401);
        $this->patchJson('/api/account/contact-numbers/1', ['label' => 'Work'])->assertStatus(401);
        $this->patchJson('/api/account/contact-numbers/1/default')->assertStatus(401);
        $this->deleteJson('/api/account/contact-numbers/1')->assertStatus(401);
    }

    public function test_crud_validation_duplicate_limit_and_default_reassignment(): void
    {
        $user = $this->createUser('customer', null);

        // Empty collection initially
        $this->actingAs($user)
            ->getJson('/api/account/contact-numbers')
            ->assertOk()
            ->assertJsonCount(0, 'data.contact_numbers');

        // Invalid phone & empty label validation
        $this->actingAs($user)
            ->postJson('/api/account/contact-numbers', [
                'label' => '',
                'phone_number' => '08171234567',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['label', 'phone_number']);

        // Add first contact (auto-becomes default, normalizes +63)
        $first = $this->actingAs($user)
            ->postJson('/api/account/contact-numbers', [
                'label' => 'Personal',
                'phone_number' => '+63 917-123-4567',
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.contact_number.phone_number', '09171234567')
            ->assertJsonPath('data.contact_number.is_default', true);
        $firstId = (int) $first->json('data.contact_number.id');

        // Duplicate prevention (even with different formatting)
        $this->actingAs($user)
            ->postJson('/api/account/contact-numbers', [
                'label' => 'Work',
                'phone_number' => '09171234567',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone_number']);

        // Add second contact with custom label
        $second = $this->actingAs($user)
            ->postJson('/api/account/contact-numbers', [
                'label' => 'Office Reception',
                'phone_number' => '09181234567',
                'is_default' => false,
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.contact_number.label', 'Office Reception')
            ->assertJsonPath('data.contact_number.is_default', false);
        $secondId = (int) $second->json('data.contact_number.id');

        // Set second as default
        $this->actingAs($user)
            ->patchJson("/api/account/contact-numbers/{$secondId}/default")
            ->assertOk()
            ->assertJsonPath('data.contact_number.is_default', true);

        $this->assertDatabaseHas('user_contact_numbers', [
            'contact_id' => $firstId,
            'is_default' => 0,
        ]);
        $this->assertDatabaseHas('user_contact_numbers', [
            'contact_id' => $secondId,
            'is_default' => 1,
        ]);

        // Edit first contact
        $this->actingAs($user)
            ->patchJson("/api/account/contact-numbers/{$firstId}", [
                'label' => 'Backup',
                'phone_number' => '+639191234567',
            ])
            ->assertOk()
            ->assertJsonPath('data.contact_number.label', 'Backup')
            ->assertJsonPath('data.contact_number.phone_number', '09191234567');

        // Delete default (secondId) -> firstId is promoted to default
        $this->actingAs($user)
            ->deleteJson("/api/account/contact-numbers/{$secondId}")
            ->assertOk();

        $this->assertDatabaseHas('user_contact_numbers', [
            'contact_id' => $firstId,
            'is_default' => 1,
        ]);

        // Add 9 more to reach max 10, then 11th is rejected
        for ($i = 1; $i <= 9; $i++) {
            $this->actingAs($user)
                ->postJson('/api/account/contact-numbers', [
                    'label' => 'Other',
                    'phone_number' => '0920000000'.$i,
                ])
                ->assertStatus(201);
        }

        $this->actingAs($user)
            ->postJson('/api/account/contact-numbers', [
                'label' => 'Other',
                'phone_number' => '09210000001',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone_number']);
    }

    public function test_ownership_idor_and_account_switching_isolation(): void
    {
        $customerA = $this->createUser('customer', null);
        $customerB = $this->createUser('customer', null);
        $rider = $this->createUser('customer', '09179999999');
        $cityId = (int) (DB::table('cities')->value('city_id') ?: 1);
        DB::table('riders')->insert([
            'user_id' => $rider->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Contact Person',
            'emergency_contact_relationship' => 'sibling',
            'emergency_contact_phone' => '09171112222',
            'base_city_id' => $cityId,
            'rider_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $contactA = $this->actingAs($customerA)
            ->postJson('/api/account/contact-numbers', [
                'label' => 'Personal',
                'phone_number' => '09171112222',
            ])
            ->assertStatus(201)
            ->json('data.contact_number.id');

        $contactB = $this->actingAs($customerB)
            ->postJson('/api/account/contact-numbers', [
                'label' => 'Work',
                'phone_number' => '09183334444',
            ])
            ->assertStatus(201)
            ->json('data.contact_number.id');

        // Customer B cannot edit, set-default, or delete Customer A's contact
        $this->actingAs($customerB)
            ->patchJson("/api/account/contact-numbers/{$contactA}", ['label' => 'Hacked'])
            ->assertStatus(404);
        $this->actingAs($customerB)
            ->patchJson("/api/account/contact-numbers/{$contactA}/default")
            ->assertStatus(404);
        $this->actingAs($customerB)
            ->deleteJson("/api/account/contact-numbers/{$contactA}")
            ->assertStatus(404);

        // Switching accounts returns only the authenticated user's contacts
        $this->actingAs($customerB)
            ->getJson('/api/account/contact-numbers')
            ->assertOk()
            ->assertJsonCount(1, 'data.contact_numbers')
            ->assertJsonPath('data.contact_numbers.0.id', $contactB);

        $this->actingAs($rider)
            ->getJson('/api/account/contact-numbers')
            ->assertOk()
            ->assertJsonCount(1, 'data.contact_numbers')
            ->assertJsonPath('data.contact_numbers.0.phone_number', '09179999999');

        $this->actingAs($customerA)
            ->getJson('/api/account/contact-numbers')
            ->assertOk()
            ->assertJsonCount(1, 'data.contact_numbers')
            ->assertJsonPath('data.contact_numbers.0.id', $contactA);
    }

    public function test_checkout_snapshot_multi_restaurant_and_rider_access(): void
    {
        $customer = $this->createUser('customer', '09171111111');
        $otherCustomer = $this->createUser('customer', '09172222222');
        $fixtures = $this->seedCheckoutFixtures($customer, 2);

        $defaultContact = $this->actingAs($customer)
            ->postJson('/api/account/contact-numbers', [
                'label' => 'Personal',
                'phone_number' => '09171111111',
                'is_default' => true,
            ])
            ->assertStatus(201)
            ->json('data.contact_number');

        $workContact = $this->actingAs($customer)
            ->postJson('/api/account/contact-numbers', [
                'label' => 'Work',
                'phone_number' => '09185556666',
                'is_default' => false,
            ])
            ->assertStatus(201)
            ->json('data.contact_number');

        $otherContactId = $this->actingAs($otherCustomer)
            ->postJson('/api/account/contact-numbers', [
                'label' => 'Personal',
                'phone_number' => '09172222222',
            ])
            ->assertStatus(201)
            ->json('data.contact_number.id');

        $buildGroups = fn () => array_map(fn ($r) => [
            'restaurant_id' => $r['restaurant_id'],
            'fulfillment' => 'delivery',
            'address_id' => $fixtures['address_id'],
            'items' => [
                ['menu_item_id' => $r['menu_item_id'], 'quantity' => 1],
            ],
        ], $fixtures['restaurants']);

        // Reject another customer's contact_number_id
        $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'cod',
                'idempotency_key' => 'idor-contact-'.random_int(10000, 99999),
                'contact_number_id' => $otherContactId,
                'groups' => $buildGroups(),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['contact_number_id']);

        // Place multi-restaurant order using non-default workContact
        $checkoutRes = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'payment_method' => 'cod',
                'idempotency_key' => 'multi-contact-'.random_int(10000, 99999),
                'contact_number_id' => $workContact['id'],
                'groups' => $buildGroups(),
            ])
            ->assertStatus(201);

        $orders = $checkoutRes->json('data.checkout.orders');
        $this->assertCount(2, $orders);

        foreach ($orders as $ord) {
            $this->assertDatabaseHas('orders', [
                'order_id' => $ord['order_id'],
                'delivery_phone' => '09185556666',
            ]);
        }

        // Edit and delete the saved contact number -> historical snapshot on orders remains unchanged
        $this->actingAs($customer)
            ->patchJson("/api/account/contact-numbers/{$workContact['id']}", [
                'phone_number' => '09189998888',
            ])
            ->assertOk();
        $this->actingAs($customer)
            ->deleteJson("/api/account/contact-numbers/{$workContact['id']}")
            ->assertOk();

        foreach ($orders as $ord) {
            $this->assertDatabaseHas('orders', [
                'order_id' => $ord['order_id'],
                'delivery_phone' => '09185556666',
            ]);
        }

        // Rider assigned to order #1 retrieves the historical delivery_phone (not defaultContact)
        $order1Id = (int) $orders[0]['order_id'];
        DB::table('orders')->where('order_id', $order1Id)->update(['order_status' => 'ready']);

        $riderUser = $this->createUser('customer', '09170001111');
        $riderId = (int) DB::table('riders')->insertGetId([
            'user_id' => $riderUser->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Contact Person',
            'emergency_contact_relationship' => 'sibling',
            'emergency_contact_phone' => '09171112222',
            'base_city_id' => $fixtures['city_id'],
            'rider_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->actingAs($riderUser)
            ->patchJson('/api/rider/availability', ['status' => 'online'])
            ->assertOk();

        $otherRiderUser = $this->createUser('customer', '09170002222');
        DB::table('riders')->insert([
            'user_id' => $otherRiderUser->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Contact Person',
            'emergency_contact_relationship' => 'sibling',
            'emergency_contact_phone' => '09171112222',
            'base_city_id' => $fixtures['city_id'],
            'rider_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->actingAs($otherRiderUser)
            ->patchJson('/api/rider/availability', ['status' => 'online'])
            ->assertOk();

        $this->actingAs($riderUser)
            ->postJson("/api/rider/deliveries/{$order1Id}/accept")
            ->assertOk()
            ->assertJsonPath('data.delivery.customer_phone', '09185556666');

        $this->actingAs($riderUser)
            ->getJson('/api/rider/deliveries/current')
            ->assertOk()
            ->assertJsonPath('data.delivery.customer_phone', '09185556666');

        // Unassigned rider cannot see the accepted delivery or its contact number
        $this->actingAs($otherRiderUser)
            ->getJson('/api/rider/deliveries/current')
            ->assertOk()
            ->assertJsonPath('data.delivery', null);

        $this->assertSame('09171111111', $defaultContact['phone_number']);
        $this->assertGreaterThan(0, $riderId);
    }
}
