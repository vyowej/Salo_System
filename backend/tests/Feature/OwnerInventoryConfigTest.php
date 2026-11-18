<?php

namespace Tests\Feature;

use App\Features\Restaurants\Services\OwnerInventoryService;
use App\Models\User;
use App\Support\AddressService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OwnerInventoryConfigTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'inv'): User
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

    private function createRestaurant(User $owner, string $status = 'active', ?string $deductionMode = null): int
    {
        $addrId = app(AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '100 Kitchen Ave',
        ]);

        $payload = [
            'restaurant_name' => 'Inventory Bistro '.random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171112222',
            'business_email' => 'inv_'.random_int(1000, 9999).'@example.com',
            'address_id' => $addrId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepting_orders' => 1,
            'restaurant_status' => $status,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        if ($deductionMode !== null) {
            $payload['inventory_deduction_mode'] = $deductionMode;
        }

        $restaurantId = (int) DB::table('restaurants')->insertGetId($payload);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        return $restaurantId;
    }

    private function attachStaff(int $restaurantId, User $staffUser, string $position, string $status = 'active'): void
    {
        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $staffUser->user_id,
            'staff_position' => $position,
            'staff_status' => $status,
            'joined_at' => $status === 'active' ? now() : null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_returns_default_manual_configuration_for_restaurant_with_no_saved_override(): void
    {
        $owner = $this->createUser('customer', 'owner_def');
        $restaurantId = $this->createRestaurant($owner);

        $response = $this->actingAs($owner)
            ->getJson("/api/restaurant/inventory/config?restaurant_id={$restaurantId}");

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'data' => [
                    'config' => [
                        'restaurant_id' => $restaurantId,
                        'deduction_mode' => 'manual',
                    ],
                ],
            ]);
    }

    public function test_retrieves_existing_saved_configuration(): void
    {
        $owner = $this->createUser('customer', 'owner_saved');
        $restaurantId = $this->createRestaurant($owner, 'active', 'on_completion');

        $response = $this->actingAs($owner)
            ->getJson("/api/restaurant/inventory/config?restaurant_id={$restaurantId}");

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'data' => [
                    'config' => [
                        'restaurant_id' => $restaurantId,
                        'deduction_mode' => 'on_completion',
                    ],
                ],
            ]);
    }

    public function test_owner_can_update_deduction_mode_and_change_persists_across_requests(): void
    {
        $owner = $this->createUser('customer', 'owner_upd');
        $restaurantId = $this->createRestaurant($owner);

        $updateResponse = $this->actingAs($owner)
            ->patchJson('/api/restaurant/inventory/config', [
                'restaurant_id' => $restaurantId,
                'deduction_mode' => 'on_completion',
            ]);

        $updateResponse->assertOk()
            ->assertJson([
                'success' => true,
                'data' => [
                    'config' => [
                        'restaurant_id' => $restaurantId,
                        'deduction_mode' => 'on_completion',
                    ],
                ],
            ]);

        $this->assertDatabaseHas('restaurants', [
            'restaurant_id' => $restaurantId,
            'inventory_deduction_mode' => 'on_completion',
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'actor_user_id' => $owner->user_id,
            'action' => 'inventory_config_updated',
            'entity_type' => 'restaurants',
            'entity_id' => (string) $restaurantId,
        ]);

        $fetchResponse = $this->actingAs($owner)
            ->getJson("/api/restaurant/inventory/config?restaurant_id={$restaurantId}");

        $fetchResponse->assertOk()
            ->assertJsonPath('data.config.deduction_mode', 'on_completion');

        $revertResponse = $this->actingAs($owner)
            ->patchJson('/api/restaurant/inventory/config', [
                'restaurant_id' => $restaurantId,
                'deduction_mode' => 'manual',
            ]);

        $revertResponse->assertOk()
            ->assertJsonPath('data.config.deduction_mode', 'manual');

        $this->assertDatabaseHas('restaurants', [
            'restaurant_id' => $restaurantId,
            'inventory_deduction_mode' => 'manual',
        ]);
    }

    public function test_rejects_invalid_deduction_mode(): void
    {
        $owner = $this->createUser('customer', 'owner_inv');
        $restaurantId = $this->createRestaurant($owner);

        $response = $this->actingAs($owner)
            ->patchJson('/api/restaurant/inventory/config', [
                'restaurant_id' => $restaurantId,
                'deduction_mode' => 'auto',
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['errors' => ['deduction_mode']]);

        $this->assertDatabaseHas('restaurants', [
            'restaurant_id' => $restaurantId,
            'inventory_deduction_mode' => 'manual',
        ]);
    }

    public function test_unauthenticated_and_unauthorized_users_cannot_view_or_update_other_restaurant_config(): void
    {
        $ownerA = $this->createUser('customer', 'owner_a');
        $ownerB = $this->createUser('customer', 'owner_b');
        $customer = $this->createUser('customer', 'cust');

        $restaurantA = $this->createRestaurant($ownerA, 'active', 'manual');
        $restaurantB = $this->createRestaurant($ownerB, 'active', 'on_completion');

        // Unauthenticated
        $this->getJson("/api/restaurant/inventory/config?restaurant_id={$restaurantA}")
            ->assertStatus(401);

        $this->patchJson('/api/restaurant/inventory/config', [
            'restaurant_id' => $restaurantA,
            'deduction_mode' => 'on_completion',
        ])->assertStatus(401);

        // Plain customer
        $this->actingAs($customer)
            ->getJson("/api/restaurant/inventory/config?restaurant_id={$restaurantA}")
            ->assertStatus(403);

        // Owner A cannot view or update Owner B's restaurant
        $this->actingAs($ownerA)
            ->getJson("/api/restaurant/inventory/config?restaurant_id={$restaurantB}")
            ->assertStatus(403);

        $this->actingAs($ownerA)
            ->patchJson('/api/restaurant/inventory/config', [
                'restaurant_id' => $restaurantB,
                'deduction_mode' => 'manual',
            ])
            ->assertStatus(403);

        // Nonexistent restaurant ID is rejected
        $this->actingAs($ownerA)
            ->patchJson('/api/restaurant/inventory/config', [
                'restaurant_id' => 9999999,
                'deduction_mode' => 'on_completion',
            ])
            ->assertStatus(403);

        $this->assertDatabaseHas('restaurants', [
            'restaurant_id' => $restaurantB,
            'inventory_deduction_mode' => 'on_completion',
        ]);
    }

    public function test_staff_permissions_are_respected_for_inventory_config(): void
    {
        $owner = $this->createUser('customer', 'owner_stf');
        $otherOwner = $this->createUser('customer', 'owner_oth');
        $inventoryManager = $this->createUser('customer', 'inv_mgr');
        $manager = $this->createUser('customer', 'mgr');
        $reservationStaff = $this->createUser('customer', 'res_stf');
        $invitedManager = $this->createUser('customer', 'inv_pend');

        $restaurantId = $this->createRestaurant($owner, 'active', 'manual');
        $otherRestaurantId = $this->createRestaurant($otherOwner, 'active', 'manual');

        $this->attachStaff($restaurantId, $inventoryManager, 'Inventory Manager', 'active');
        $this->attachStaff($restaurantId, $manager, 'Manager', 'active');
        $this->attachStaff($restaurantId, $reservationStaff, 'Reservation Handler', 'active');
        $this->attachStaff($restaurantId, $invitedManager, 'Inventory Manager', 'invited');

        // Active Inventory Manager can view & update their assigned restaurant
        $this->actingAs($inventoryManager)
            ->getJson("/api/restaurant/inventory/config?restaurant_id={$restaurantId}")
            ->assertOk()
            ->assertJsonPath('data.config.deduction_mode', 'manual');

        $this->actingAs($inventoryManager)
            ->patchJson('/api/restaurant/inventory/config', [
                'restaurant_id' => $restaurantId,
                'deduction_mode' => 'on_completion',
            ])
            ->assertOk()
            ->assertJsonPath('data.config.deduction_mode', 'on_completion');

        // Active Manager can view & update their assigned restaurant
        $this->actingAs($manager)
            ->patchJson('/api/restaurant/inventory/config', [
                'restaurant_id' => $restaurantId,
                'deduction_mode' => 'manual',
            ])
            ->assertOk()
            ->assertJsonPath('data.config.deduction_mode', 'manual');

        // Staff cannot access another restaurant
        $this->actingAs($inventoryManager)
            ->patchJson('/api/restaurant/inventory/config', [
                'restaurant_id' => $otherRestaurantId,
                'deduction_mode' => 'on_completion',
            ])
            ->assertStatus(403);

        // Non-inventory staff position cannot access inventory config
        $this->actingAs($reservationStaff)
            ->getJson("/api/restaurant/inventory/config?restaurant_id={$restaurantId}")
            ->assertStatus(403);

        $this->actingAs($reservationStaff)
            ->patchJson('/api/restaurant/inventory/config', [
                'restaurant_id' => $restaurantId,
                'deduction_mode' => 'on_completion',
            ])
            ->assertStatus(403);

        // Invited (not yet active) staff cannot access
        $this->actingAs($invitedManager)
            ->getJson("/api/restaurant/inventory/config?restaurant_id={$restaurantId}")
            ->assertStatus(403);
    }

    public function test_database_errors_return_consistent_json_500_response(): void
    {
        $owner = $this->createUser('customer', 'owner_err');
        $this->createRestaurant($owner);

        $mockService = $this->mock(OwnerInventoryService::class);
        $mockService->shouldReceive('updateConfig')
            ->once()
            ->andThrow(new QueryException(
                'mysql',
                'UPDATE restaurants SET inventory_deduction_mode = ?',
                ['on_completion'],
                new \RuntimeException('Simulated database failure'),
            ));

        $response = $this->actingAs($owner)
            ->patchJson('/api/restaurant/inventory/config', [
                'deduction_mode' => 'on_completion',
            ]);

        $response->assertStatus(500)
            ->assertJson([
                'success' => false,
                'message' => 'An unexpected server error occurred.',
            ]);
    }
}
