<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\AddressService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MenuPublishWorkflowTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'pub'): User
    {
        return User::create([
            'username' => "{$prefix}_".random_int(10000, 99999),
            'first_name' => ucfirst($prefix),
            'last_name' => 'Tester',
            'email' => "{$prefix}_".random_int(10000, 99999).'@example.com',
            'phone' => '0917'.random_int(1000000, 9999999),
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createOwnedRestaurant(User $owner, array $overrides = []): int
    {
        $addressId = app(AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '101 Katipunan Ave',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId(array_merge([
            'restaurant_name' => 'Publish Test Kitchen '.random_int(100, 999),
            'registered_name' => 'Publish Test Kitchen Corp',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'description' => 'Freshly cooked dishes.',
            'contact_phone' => '09171234567',
            'business_email' => 'publish_'.random_int(1000, 9999).'@example.com',
            'address_id' => $addressId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 0,
            'accepting_orders' => 1,
            'restaurant_status' => 'active',
            'is_published' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        return $restaurantId;
    }

    private function addAllWeekOpenHours(int $restaurantId): void
    {
        for ($d = 0; $d <= 6; $d++) {
            DB::table('operating_hours')->insert([
                'restaurant_id' => $restaurantId,
                'day_of_week' => $d,
                'opening_time' => '00:00:00',
                'closing_time' => '23:59:00',
                'closes_next_day' => 0,
                'is_closed' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function createCustomerDeliveryAddress(User $customer): int
    {
        $addressId = app(AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '22 Maginhawa St',
        ]);

        DB::table('user_addresses')->insert([
            'user_id' => $customer->user_id,
            'address_id' => $addressId,
            'address_label' => 'Home',
            'is_default' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('user_contact_numbers')->insert([
            'user_id' => $customer->user_id,
            'label' => 'Personal',
            'phone_number' => '09171234567',
            'is_default' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $provinceId = (int) (DB::table('provinces')->where('province_name', 'Metro Manila')->value('province_id')
            ?? DB::table('provinces')->insertGetId(['province_name' => 'Metro Manila']));
        $cityId = (int) (DB::table('cities')->where('province_id', $provinceId)->where('city_name', 'Quezon City')->value('city_id')
            ?? DB::table('cities')->insertGetId(['province_id' => $provinceId, 'city_name' => 'Quezon City']));

        DB::table('platform_service_areas')->insertOrIgnore([
            'province_id' => $provinceId,
            'city_id' => $cityId,
            'barangay_id' => null,
            'area_level' => 'city',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $addressId;
    }

    public function test_unpublished_restaurant_is_hidden_from_customer_endpoints_and_checkout(): void
    {
        DB::table('restaurants')->where('restaurant_status', 'active')->update(['restaurant_status' => 'inactive']);

        $owner = $this->createUser('customer', 'owner');
        $customer = $this->createUser('customer', 'cust');
        $custAddr = $this->createCustomerDeliveryAddress($customer);

        $restId = $this->createOwnedRestaurant($owner);
        $this->addAllWeekOpenHours($restId);

        $cat = $this->actingAs($owner)->postJson('/api/restaurant/menu/categories', [
            'restaurant_id' => $restId,
            'category_name' => 'Mains',
        ])->assertStatus(201)->json('data.category');

        $item = $this->actingAs($owner)->postJson('/api/restaurant/menu/items', [
            'restaurant_id' => $restId,
            'menu_category_id' => $cat['id'],
            'item_name' => 'Draft Adobo',
            'base_price' => '150.00',
        ])->assertStatus(201)->json('data.item');

        $this->assertSame('new', $item['publish_state']);
        $this->assertFalse($item['is_published']);

        // Hidden from all public endpoints
        $this->getJson('/api/restaurants')->assertOk()->assertJsonCount(0, 'data.restaurants');
        $this->getJson("/api/restaurants/{$restId}")->assertStatus(404);
        $this->getJson("/api/restaurants/{$restId}/menu")->assertStatus(404);
        $this->getJson("/api/restaurants/{$restId}/reviews")->assertStatus(404);

        // Checkout is blocked
        $this->actingAs($customer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'unpub-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $restId,
                'fulfillment' => 'delivery',
                'address_id' => $custAddr,
                'items' => [['menu_item_id' => $item['id'], 'quantity' => 1]],
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors(['groups.0.restaurant_id']);
    }

    public function test_publish_blockers_prevent_publishing_incomplete_restaurants(): void
    {
        $owner = $this->createUser('customer', 'block');
        $restId = $this->createOwnedRestaurant($owner, ['description' => null]);

        // Missing description, hours, and menu
        $this->actingAs($owner)->postJson('/api/restaurant/menu/publish', ['restaurant_id' => $restId])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['publish']);

        // Fix profile & hours, add category with only a hidden item -> still blocked
        DB::table('restaurants')->where('restaurant_id', $restId)->update(['description' => 'Now complete']);
        $this->addAllWeekOpenHours($restId);
        $cat = $this->actingAs($owner)->postJson('/api/restaurant/menu/categories', [
            'restaurant_id' => $restId,
            'category_name' => 'Mains',
        ])->assertStatus(201)->json('data.category');

        $this->actingAs($owner)->postJson('/api/restaurant/menu/items', [
            'restaurant_id' => $restId,
            'menu_category_id' => $cat['id'],
            'item_name' => 'Hidden Only',
            'base_price' => '100.00',
            'availability_status' => 'hidden',
        ])->assertStatus(201);

        $status = $this->actingAs($owner)->getJson("/api/restaurant/menu/publish-status?restaurant_id={$restId}")
            ->assertOk()
            ->json('data.publish_status');

        $this->assertFalse($status['can_publish']);
        $this->assertNotEmpty($status['blockers']);
    }

    public function test_draft_edits_deletes_and_new_items_do_not_leak_before_publish(): void
    {
        DB::table('restaurants')->where('restaurant_status', 'active')->update(['restaurant_status' => 'inactive']);

        $owner = $this->createUser('customer', 'flow');
        $customer = $this->createUser('customer', 'buyer');
        $custAddr = $this->createCustomerDeliveryAddress($customer);

        $restId = $this->createOwnedRestaurant($owner);
        $this->addAllWeekOpenHours($restId);

        $cat = $this->actingAs($owner)->postJson('/api/restaurant/menu/categories', [
            'restaurant_id' => $restId,
            'category_name' => 'Rice Bowls',
        ])->assertStatus(201)->json('data.category');

        $item1 = $this->actingAs($owner)->postJson('/api/restaurant/menu/items', [
            'restaurant_id' => $restId,
            'menu_category_id' => $cat['id'],
            'item_name' => 'Tapsilog',
            'base_price' => '120.00',
        ])->assertStatus(201)->json('data.item');

        // Publish first version
        $this->actingAs($owner)->postJson('/api/restaurant/menu/publish', ['restaurant_id' => $restId])
            ->assertOk()
            ->assertJsonPath('data.changed', true)
            ->assertJsonPath('data.publish_status.is_published', true)
            ->assertJsonPath('data.publish_status.pending_changes.total', 0);

        $this->getJson('/api/restaurants')->assertOk()->assertJsonCount(1, 'data.restaurants');
        $this->getJson("/api/restaurants/{$restId}/menu")
            ->assertOk()
            ->assertJsonPath('data.categories.0.items.0.name', 'Tapsilog')
            ->assertJsonPath('data.categories.0.items.0.price', 120);

        // Edit item1 price & name -> customers STILL see Tapsilog @ 120
        $edited = $this->actingAs($owner)->patchJson("/api/restaurant/menu/items/{$item1['id']}", [
            'restaurant_id' => $restId,
            'item_name' => 'Special Tapsilog',
            'base_price' => '145.00',
        ])->assertOk()->json('data.item');

        $this->assertSame('modified', $edited['publish_state']);
        $this->assertSame(120, $edited['published']['price']);

        // Add item2 -> customers do NOT see item2 yet
        $item2 = $this->actingAs($owner)->postJson('/api/restaurant/menu/items', [
            'restaurant_id' => $restId,
            'menu_category_id' => $cat['id'],
            'item_name' => 'Bangsilog',
            'base_price' => '130.00',
        ])->assertStatus(201)->json('data.item');

        $this->getJson("/api/restaurants/{$restId}/menu")
            ->assertOk()
            ->assertJsonCount(1, 'data.categories.0.items')
            ->assertJsonPath('data.categories.0.items.0.name', 'Tapsilog')
            ->assertJsonPath('data.categories.0.items.0.price', 120);

        // Checkout with item2 (unpublished) fails; checkout with item1 uses published price 120.00
        $this->actingAs($customer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'draft-item2-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $restId,
                'fulfillment' => 'delivery',
                'address_id' => $custAddr,
                'items' => [['menu_item_id' => $item2['id'], 'quantity' => 1]],
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors(['groups.0.items.0.menu_item_id']);

        $orderRes = $this->actingAs($customer)->postJson('/api/customer/checkout', [
            'payment_method' => 'cod',
            'idempotency_key' => 'pub-item1-'.random_int(10000, 99999),
            'groups' => [[
                'restaurant_id' => $restId,
                'fulfillment' => 'delivery',
                'address_id' => $custAddr,
                'items' => [['menu_item_id' => $item1['id'], 'quantity' => 1]],
            ]],
        ])->assertStatus(201);
        $this->assertSame(
            '120.00',
            DB::table('orders')->where('restaurant_id', $restId)->orderByDesc('order_id')->value('subtotal_amount'),
        );

        // Publish changes -> Special Tapsilog @ 145 and Bangsilog @ 130 go live together
        $this->actingAs($owner)->postJson('/api/restaurant/menu/publish', ['restaurant_id' => $restId])
            ->assertOk()
            ->assertJsonPath('data.changed', true);

        $this->getJson("/api/restaurants/{$restId}/menu")
            ->assertOk()
            ->assertJsonCount(2, 'data.categories.0.items')
            ->assertJsonPath('data.categories.0.items.0.name', 'Special Tapsilog')
            ->assertJsonPath('data.categories.0.items.0.price', 145)
            ->assertJsonPath('data.categories.0.items.1.name', 'Bangsilog');

        // Idempotent publish with no changes
        $this->actingAs($owner)->postJson('/api/restaurant/menu/publish', ['restaurant_id' => $restId])
            ->assertOk()
            ->assertJsonPath('data.changed', false);
    }

    public function test_availability_applies_immediately_and_hiding_last_item_hides_restaurant(): void
    {
        DB::table('restaurants')->where('restaurant_status', 'active')->update(['restaurant_status' => 'inactive']);

        $owner = $this->createUser('customer', 'avail');
        $restId = $this->createOwnedRestaurant($owner);
        $this->addAllWeekOpenHours($restId);

        $cat = $this->actingAs($owner)->postJson('/api/restaurant/menu/categories', [
            'restaurant_id' => $restId,
            'category_name' => 'Drinks',
        ])->assertStatus(201)->json('data.category');

        $item = $this->actingAs($owner)->postJson('/api/restaurant/menu/items', [
            'restaurant_id' => $restId,
            'menu_category_id' => $cat['id'],
            'item_name' => 'Barako Coffee',
            'base_price' => '90.00',
        ])->assertStatus(201)->json('data.item');

        $this->actingAs($owner)->postJson('/api/restaurant/menu/publish', ['restaurant_id' => $restId])->assertOk();
        $this->getJson('/api/restaurants')->assertOk()->assertJsonCount(1, 'data.restaurants');

        // Toggle sold_out -> immediate, no pending change
        $toggled = $this->actingAs($owner)->patchJson("/api/restaurant/menu/items/{$item['id']}/availability", [
            'restaurant_id' => $restId,
            'availability_status' => 'sold_out',
        ])->assertOk()->json('data.item');

        $this->assertSame('published', $toggled['publish_state']);
        $this->getJson("/api/restaurants/{$restId}/menu")
            ->assertOk()
            ->assertJsonPath('data.categories.0.items.0.availability_status', 'sold_out');

        // Toggle hidden on the ONLY item -> restaurant disappears from customer list & details
        $this->actingAs($owner)->patchJson("/api/restaurant/menu/items/{$item['id']}/availability", [
            'restaurant_id' => $restId,
            'availability_status' => 'hidden',
        ])->assertOk();

        $this->getJson('/api/restaurants')->assertOk()->assertJsonCount(0, 'data.restaurants');
        $this->getJson("/api/restaurants/{$restId}")->assertStatus(404);

        // Unhide -> restaurant reappears immediately
        $this->actingAs($owner)->patchJson("/api/restaurant/menu/items/{$item['id']}/availability", [
            'restaurant_id' => $restId,
            'availability_status' => 'available',
        ])->assertOk();

        $this->getJson('/api/restaurants')->assertOk()->assertJsonCount(1, 'data.restaurants');
    }

    public function test_unpublish_discard_changes_and_preview(): void
    {
        DB::table('restaurants')->where('restaurant_status', 'active')->update(['restaurant_status' => 'inactive']);

        $owner = $this->createUser('customer', 'disc');
        $restId = $this->createOwnedRestaurant($owner);
        $this->addAllWeekOpenHours($restId);

        $cat = $this->actingAs($owner)->postJson('/api/restaurant/menu/categories', [
            'restaurant_id' => $restId,
            'category_name' => 'Mains',
        ])->assertStatus(201)->json('data.category');

        $item = $this->actingAs($owner)->postJson('/api/restaurant/menu/items', [
            'restaurant_id' => $restId,
            'menu_category_id' => $cat['id'],
            'item_name' => 'Sinigang',
            'base_price' => '250.00',
        ])->assertStatus(201)->json('data.item');

        // Preview works before publish
        $this->actingAs($owner)->getJson("/api/restaurant/menu/preview?restaurant_id={$restId}")
            ->assertOk()
            ->assertJsonPath('data.is_preview', true)
            ->assertJsonPath('data.categories.0.items.0.name', 'Sinigang');

        // Publish
        $this->actingAs($owner)->postJson('/api/restaurant/menu/publish', ['restaurant_id' => $restId])->assertOk();

        // Edit Sinigang, add new item, mark nothing deleted -> discard reverts all
        $this->actingAs($owner)->patchJson("/api/restaurant/menu/items/{$item['id']}", [
            'restaurant_id' => $restId,
            'item_name' => 'Sinigang Edited',
            'base_price' => '300.00',
        ])->assertOk();

        $this->actingAs($owner)->postJson('/api/restaurant/menu/items', [
            'restaurant_id' => $restId,
            'menu_category_id' => $cat['id'],
            'item_name' => 'Temp New Dish',
            'base_price' => '99.00',
        ])->assertStatus(201);

        $this->actingAs($owner)->postJson('/api/restaurant/menu/discard-changes', ['restaurant_id' => $restId])
            ->assertOk()
            ->assertJsonPath('data.publish_status.pending_changes.total', 0);

        $itemsAfterDiscard = $this->actingAs($owner)->getJson("/api/restaurant/menu/items?restaurant_id={$restId}")
            ->assertOk()
            ->json('data.items');
        $this->assertCount(1, $itemsAfterDiscard);
        $this->assertSame('Sinigang', $itemsAfterDiscard[0]['name']);

        // Unpublish hides restaurant
        $this->actingAs($owner)->postJson('/api/restaurant/menu/unpublish', [
            'restaurant_id' => $restId,
            'reason' => 'Kitchen renovation',
        ])->assertOk()->assertJsonPath('data.publish_status.is_published', false);

        $this->getJson('/api/restaurants')->assertOk()->assertJsonCount(0, 'data.restaurants');
        $this->getJson("/api/restaurants/{$restId}")->assertStatus(404);
    }

    public function test_manager_can_publish_while_other_staff_and_non_owners_are_forbidden(): void
    {
        $owner = $this->createUser('customer', 'own');
        $manager = $this->createUser('customer', 'mgr');
        $orderStaff = $this->createUser('customer', 'ord');
        $stranger = $this->createUser('customer', 'str');

        $restId = $this->createOwnedRestaurant($owner);
        $this->addAllWeekOpenHours($restId);

        $cat = $this->actingAs($owner)->postJson('/api/restaurant/menu/categories', [
            'restaurant_id' => $restId,
            'category_name' => 'Meals',
        ])->assertStatus(201)->json('data.category');

        $this->actingAs($owner)->postJson('/api/restaurant/menu/items', [
            'restaurant_id' => $restId,
            'menu_category_id' => $cat['id'],
            'item_name' => 'Sisig',
            'base_price' => '180.00',
        ])->assertStatus(201);

        DB::table('restaurant_staff')->insert([
            [
                'restaurant_id' => $restId,
                'user_id' => $manager->user_id,
                'staff_position' => 'Manager',
                'staff_status' => 'active',
                'joined_at' => now(),
            ],
            [
                'restaurant_id' => $restId,
                'user_id' => $orderStaff->user_id,
                'staff_position' => 'Order Handler',
                'staff_status' => 'active',
                'joined_at' => now(),
            ],
        ]);

        // Order Handler cannot publish
        $this->actingAs($orderStaff)->postJson('/api/restaurant/menu/publish', ['restaurant_id' => $restId])
            ->assertStatus(403);

        // Stranger cannot publish
        $this->actingAs($stranger)->postJson('/api/restaurant/menu/publish', ['restaurant_id' => $restId])
            ->assertStatus(403);

        // Manager CAN check status, preview, publish, and unpublish
        $this->actingAs($manager)->getJson("/api/restaurant/menu/publish-status?restaurant_id={$restId}")
            ->assertOk();
        $this->actingAs($manager)->getJson("/api/restaurant/menu/preview?restaurant_id={$restId}")
            ->assertOk();
        $this->actingAs($manager)->postJson('/api/restaurant/menu/publish', ['restaurant_id' => $restId])
            ->assertOk()
            ->assertJsonPath('data.publish_status.is_published', true);
        $this->actingAs($manager)->postJson('/api/restaurant/menu/unpublish', ['restaurant_id' => $restId])
            ->assertOk()
            ->assertJsonPath('data.publish_status.is_published', false);
    }
}
