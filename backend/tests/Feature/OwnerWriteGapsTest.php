<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OwnerWriteGapsTest extends TestCase
{
    use DatabaseTransactions;

    private function createOwnerWithMenuItem(): array
    {
        $owner = User::forceCreate([
            'username' => 't07_own_'.random_int(10000, 99999),
            'first_name' => 'Owner',
            'last_name' => 'Tester',
            'email' => 't07own_'.random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $addrId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '99 Katipunan Ave',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'T07 Bistro '.random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09172223333',
            'business_email' => 't07bistro_'.random_int(1000, 9999).'@example.com',
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
            'category_name' => 'Mains',
            'sort_order' => 0,
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $itemId = (int) DB::table('menu_items')->insertGetId([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'item_name' => 'Chicken Inasal',
            'base_price' => '195.00',
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'sort_order' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$owner, $restaurantId, $itemId];
    }

    public function test_owner_can_sync_menu_item_addons_manage_closures_and_update_inventory_item(): void
    {
        [$owner, $restaurantId, $itemId] = $this->createOwnerWithMenuItem();
        $headers = ['X-Restaurant-Id' => (string) $restaurantId];

        // 1. Add-ons sync
        $this->actingAs($owner)
            ->withHeaders($headers)
            ->putJson("/api/restaurant/menu/items/{$itemId}/add-ons", [
                'groups' => [
                    [
                        'group_name' => 'Rice Upgrade',
                        'is_required' => true,
                        'minimum_selections' => 1,
                        'maximum_selections' => 1,
                        'options' => [
                            ['option_name' => 'Java Rice', 'additional_price' => 25.00, 'is_available' => true],
                            ['option_name' => 'Garlic Rice', 'additional_price' => 20.00, 'is_available' => true],
                        ],
                    ],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.item.add_on_groups.0.group_name', 'Rice Upgrade')
            ->assertJsonPath('data.item.add_on_groups.0.options.0.option_name', 'Java Rice');

        // 2. Temporary closures CRUD
        $closureRes = $this->actingAs($owner)
            ->withHeaders($headers)
            ->postJson('/api/restaurant/closures', [
                'closure_date' => '2026-12-25',
                'reason' => 'Christmas Holiday',
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.closure.closure_date', '2026-12-25');

        $closureId = (int) $closureRes->json('data.closure.id');

        $this->actingAs($owner)
            ->withHeaders($headers)
            ->getJson('/api/restaurant/closures')
            ->assertOk()
            ->assertJsonPath('data.closures.0.id', $closureId);

        $this->actingAs($owner)
            ->withHeaders($headers)
            ->deleteJson("/api/restaurant/closures/{$closureId}")
            ->assertOk();

        $this->assertDatabaseMissing('restaurant_closures', ['closure_id' => $closureId]);

        // 3. Inventory item availability update
        $this->actingAs($owner)
            ->withHeaders($headers)
            ->patchJson("/api/restaurant/inventory/items/{$itemId}", [
                'availability_status' => 'sold_out',
            ])
            ->assertOk()
            ->assertJsonPath('data.item.availability_status', 'sold_out');
    }
}
