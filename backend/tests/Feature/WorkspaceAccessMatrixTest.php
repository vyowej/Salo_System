<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class WorkspaceAccessMatrixTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $status = 'active', string $prefix = 'mat'): User
    {
        return User::forceCreate([
            'username' => "{$prefix}_" . random_int(10000, 99999),
            'first_name' => ucfirst($prefix),
            'last_name' => 'Matrix',
            'email' => "{$prefix}_" . random_int(10000, 99999) . '@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => $status,
        ]);
    }

    private function createAddress(): int
    {
        return app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '101 Matrix Ave',
        ]);
    }

    private function createRestaurant(User $owner, string $status = 'active', string $name = 'Matrix Resto'): int
    {
        $restId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => $name,
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234567',
            'business_email' => $owner->email,
            'address_id' => $this->createAddress(),
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'restaurant_status' => $status,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        return $restId;
    }

    private function createRider(User $user, string $riderStatus = 'active'): int
    {
        $cityId = DB::table('cities')->where('city_name', 'Quezon City')->value('city_id')
            ?? DB::table('cities')->value('city_id');

        return (int) DB::table('riders')->insertGetId([
            'user_id' => $user->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Emergency',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09170000001',
            'base_city_id' => $cityId,
            'rider_status' => $riderStatus,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_workspace_access_role_denial_matrix_before_and_after_refactor(): void
    {
        $ownerA = $this->createUser('customer', 'active', 'ownA');
        $ownerB = $this->createUser('customer', 'active', 'ownB');
        $suspendedOwner = $this->createUser('customer', 'suspended', 'suspOwn');
        $plainCustomer = $this->createUser('customer', 'active', 'cust');
        $activeRider = $this->createUser('customer', 'active', 'ridAct');
        $pendingRider = $this->createUser('customer', 'active', 'ridPend');
        $suspendedRider = $this->createUser('customer', 'suspended', 'ridSusp');

        $orderHandlerStaff = $this->createUser('customer', 'active', 'stfOrd');
        $inventoryStaff = $this->createUser('customer', 'active', 'stfInv');
        $reservationStaff = $this->createUser('customer', 'active', 'stfRes');

        $restA = $this->createRestaurant($ownerA, 'active', 'Active Matrix A');
        $this->createRestaurant($ownerB, 'active', 'Active Matrix B');
        $pendingRest = $this->createRestaurant($ownerA, 'pending', 'Pending Matrix');
        $this->createRestaurant($suspendedOwner, 'active', 'Suspended Owner Rest');

        $this->createRider($activeRider, 'active');
        $this->createRider($pendingRider, 'pending');
        $this->createRider($suspendedRider, 'active');

        DB::table('restaurant_staff')->insert([
            [
                'restaurant_id' => $restA,
                'user_id' => $orderHandlerStaff->user_id,
                'staff_position' => 'Order Handler',
                'staff_status' => 'active',
                'joined_at' => now(),
            ],
            [
                'restaurant_id' => $restA,
                'user_id' => $inventoryStaff->user_id,
                'staff_position' => 'Inventory Manager',
                'staff_status' => 'active',
                'joined_at' => now(),
            ],
            [
                'restaurant_id' => $restA,
                'user_id' => $reservationStaff->user_id,
                'staff_position' => 'Reservation Handler',
                'staff_status' => 'active',
                'joined_at' => now(),
            ],
        ]);

        // 1. Owner-only workspace endpoints (profile, menu, staff)
        $ownerOnlyEndpoints = [
            "/api/restaurant/profile?restaurant_id={$restA}",
            "/api/restaurant/menu/categories?restaurant_id={$restA}",
            "/api/restaurant/staff?restaurant_id={$restA}",
        ];

        foreach ($ownerOnlyEndpoints as $ep) {
            $this->actingAs($ownerA)->getJson($ep)->assertOk();
            $this->actingAs($plainCustomer)->getJson($ep)->assertStatus(403);
            $this->actingAs($activeRider)->getJson($ep)->assertStatus(403);
            $this->actingAs($ownerB)->getJson($ep)->assertStatus(403);
            $this->actingAs($orderHandlerStaff)->getJson($ep)->assertStatus(403);
            $this->actingAs($reservationStaff)->getJson($ep)->assertStatus(403);
            $this->actingAs($suspendedOwner)->getJson($ep)->assertStatus(403);
        }

        // Inactive restaurant denied for ownerA
        $this->actingAs($ownerA)->getJson("/api/restaurant/profile?restaurant_id={$pendingRest}")->assertStatus(403);
        $this->actingAs($ownerA)->getJson("/api/restaurant/menu/categories?restaurant_id={$pendingRest}")->assertStatus(403);

        // 2. Order-manage access (/api/restaurant/orders)
        $ordersEp = "/api/restaurant/orders?restaurant_id={$restA}";
        $this->actingAs($ownerA)->getJson($ordersEp)->assertOk();
        $this->actingAs($orderHandlerStaff)->getJson($ordersEp)->assertOk();
        $this->actingAs($plainCustomer)->getJson($ordersEp)->assertStatus(403);
        $this->actingAs($activeRider)->getJson($ordersEp)->assertStatus(403);
        $this->actingAs($ownerB)->getJson($ordersEp)->assertStatus(403);
        $this->actingAs($inventoryStaff)->getJson($ordersEp)->assertStatus(403);
        $this->actingAs($reservationStaff)->getJson($ordersEp)->assertStatus(403);
        $this->actingAs($suspendedOwner)->getJson($ordersEp)->assertStatus(403);
        $this->actingAs($ownerA)->getJson("/api/restaurant/orders?restaurant_id={$pendingRest}")->assertStatus(403);

        // 3. Inventory-manage access (/api/restaurant/inventory/config)
        $invEp = "/api/restaurant/inventory/config?restaurant_id={$restA}";
        $this->actingAs($ownerA)->getJson($invEp)->assertOk();
        $this->actingAs($inventoryStaff)->getJson($invEp)->assertOk();
        $this->actingAs($plainCustomer)->getJson($invEp)->assertStatus(403);
        $this->actingAs($activeRider)->getJson($invEp)->assertStatus(403);
        $this->actingAs($ownerB)->getJson($invEp)->assertStatus(403);
        $this->actingAs($orderHandlerStaff)->getJson($invEp)->assertStatus(403);
        $this->actingAs($reservationStaff)->getJson($invEp)->assertStatus(403);
        $this->actingAs($suspendedOwner)->getJson($invEp)->assertStatus(403);
        $this->actingAs($ownerA)->getJson("/api/restaurant/inventory/config?restaurant_id={$pendingRest}")->assertStatus(403);

        // 4. Rider access (/api/rider/deliveries/current & /api/rider/availability)
        $this->actingAs($activeRider)->getJson('/api/rider/deliveries/current')->assertOk();
        $this->actingAs($activeRider)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();

        foreach ([$plainCustomer, $ownerA, $orderHandlerStaff, $pendingRider, $suspendedRider] as $deniedForRider) {
            $this->actingAs($deniedForRider)->getJson('/api/rider/deliveries/current')->assertStatus(403);
            $this->actingAs($deniedForRider)->patchJson('/api/rider/availability', ['status' => 'online'])->assertStatus(403);
        }
    }
}
