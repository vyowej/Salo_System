<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\AddressService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class LocationValidationCharacterizationTest extends TestCase
{
    use DatabaseTransactions;

    private function makeUser(string $role): User
    {
        return User::create([
            'username' => $role . '_locval_' . random_int(10000, 99999),
            'first_name' => ucfirst($role),
            'last_name' => 'LocVal',
            'email' => $role . '_locval_' . random_int(10000, 99999) . '@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createRestaurantForOwner(User $owner): int
    {
        $addressId = app(AddressService::class)->createAddress([
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
            'street' => 'Main St',
            'latitude' => 8.481000,
            'longitude' => 124.636000,
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'LocVal Kitchen ' . random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'locval_' . random_int(100, 999) . '@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
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

    private function createRiderRecord(User $riderUser): int
    {
        app(AddressService::class)->createAddress([
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
            'street' => 'Rider Base St',
        ]);
        $cityId = DB::table('cities')->where('city_name', 'Cagayan de Oro City')->value('city_id');

        return (int) DB::table('riders')->insertGetId([
            'user_id' => $riderUser->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Contact',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09170000099',
            'base_city_id' => $cityId,
            'rider_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_admin_service_area_store_and_update_validation_and_authorization(): void
    {
        $customer = $this->makeUser('customer');
        $admin = $this->makeUser('admin');

        $this->postJson('/api/admin/service-areas', [])->assertStatus(401);
        $this->actingAs($customer)->postJson('/api/admin/service-areas', [])->assertStatus(403);

        $invalidStore = $this->actingAs($admin)->postJson('/api/admin/service-areas', [
            'is_active' => 'not-bool',
            'center_latitude' => 91,
            'center_longitude' => -181,
            'notes' => str_repeat('a', 256),
            'reason' => str_repeat('b', 256),
        ]);
        $invalidStore->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['success', 'message', 'errors'])
            ->assertJsonValidationErrors([
                'province',
                'is_active',
                'center_latitude',
                'center_longitude',
                'notes',
                'reason',
            ]);

        $validStore = $this->actingAs($admin)->postJson('/api/admin/service-areas', [
            'province' => 'Bukidnon',
            'city' => null,
            'barangay' => null,
            'is_active' => true,
            'notes' => 'Province-wide test',
        ]);
        $validStore->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.service_area.province', 'Bukidnon')
            ->assertJsonPath('data.service_area.is_active', true);

        $areaId = (int) $validStore->json('data.service_area.id');

        $this->actingAs($customer)->patchJson("/api/admin/service-areas/{$areaId}", [])->assertStatus(403);

        $invalidUpdate = $this->actingAs($admin)->patchJson("/api/admin/service-areas/{$areaId}", [
            'is_active' => 'invalid',
            'center_latitude' => -91,
            'center_longitude' => 181,
            'boundary_geojson' => 123,
            'notes' => str_repeat('x', 256),
            'reason' => str_repeat('y', 256),
        ]);
        $invalidUpdate->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['success', 'message', 'errors'])
            ->assertJsonValidationErrors([
                'is_active',
                'center_latitude',
                'center_longitude',
                'boundary_geojson',
                'notes',
                'reason',
            ]);

        $this->actingAs($admin)->patchJson("/api/admin/service-areas/{$areaId}", [
            'is_active' => false,
            'reason' => 'Temporary pause',
        ])->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.service_area.is_active', false);
    }

    public function test_customer_address_store_and_update_validation_and_recipient_phone_normalization(): void
    {
        $customer = $this->makeUser('customer');

        $this->postJson('/api/customer/addresses', [])->assertStatus(401);

        $invalidStore = $this->actingAs($customer)->postJson('/api/customer/addresses', [
            'recipient_phone' => '12345',
            'postal_code' => '123',
            'latitude' => 95,
            'longitude' => 185,
            'gps_accuracy' => -1,
            'is_default' => 'yes',
        ]);
        $invalidStore->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['success', 'message', 'errors'])
            ->assertJsonValidationErrors([
                'label',
                'province',
                'city',
                'barangay',
                'street',
                'recipient_phone',
                'postal_code',
                'latitude',
                'longitude',
                'gps_accuracy',
                'is_default',
            ])
            ->assertJsonPath('errors.recipient_phone.0', 'Enter a valid mobile number, like 09171234567.');

        // Invalid +63 length stays invalid after normalization and returns custom message
        $this->actingAs($customer)->postJson('/api/customer/addresses', [
            'label' => 'Home',
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
            'street' => '123 Rizal St',
            'recipient_phone' => '+63917123456',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['recipient_phone'])
            ->assertJsonPath('errors.recipient_phone.0', 'Enter a valid mobile number, like 09171234567.');

        // Valid +63 phone with spaces/dashes normalizes to 09171234567
        $storeNormalized = $this->actingAs($customer)->postJson('/api/customer/addresses', [
            'label' => 'Home',
            'recipient_name' => 'Juan Dela Cruz',
            'recipient_phone' => '+63 917-123-4567',
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
            'street' => '123 Rizal St',
            'postal_code' => '9000',
            'is_default' => true,
        ]);
        $storeNormalized->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.address.recipient_phone', '09171234567');

        $addressId = (int) $storeNormalized->json('data.address.id');

        // Whitespace-only recipient_phone normalizes to null before validation and passes nullable rule
        $storeWhitespacePhone = $this->actingAs($customer)->postJson('/api/customer/addresses', [
            'label' => 'Alt',
            'recipient_phone' => '   ',
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
            'street' => '456 Mabini St',
        ]);
        $storeWhitespacePhone->assertStatus(201)
            ->assertJsonPath('data.address.recipient_phone', '');
        $this->assertDatabaseHas('user_addresses', [
            'user_address_id' => (int) $storeWhitespacePhone->json('data.address.id'),
            'recipient_phone' => null,
        ]);

        // Update allows partial payload (sometimes rules)
        $this->actingAs($customer)->patchJson("/api/customer/addresses/{$addressId}", [
            'label' => 'Office',
            'recipient_phone' => '+63 (918) 222-3333',
        ])->assertStatus(200)
            ->assertJsonPath('data.address.label', 'Office')
            ->assertJsonPath('data.address.recipient_phone', '09182223333');

        // Empty string recipient_phone on update normalizes to null
        $this->actingAs($customer)->patchJson("/api/customer/addresses/{$addressId}", [
            'recipient_phone' => '',
        ])->assertStatus(200)
            ->assertJsonPath('data.address.recipient_phone', '');
        $this->assertDatabaseHas('user_addresses', [
            'user_address_id' => $addressId,
            'recipient_phone' => null,
        ]);

        // Invalid partial update
        $this->actingAs($customer)->patchJson("/api/customer/addresses/{$addressId}", [
            'recipient_phone' => '08171234567',
            'postal_code' => 'ABC1',
            'latitude' => -91,
            'gps_accuracy' => 100001,
        ])->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonValidationErrors(['recipient_phone', 'postal_code', 'latitude', 'gps_accuracy'])
            ->assertJsonPath('errors.recipient_phone.0', 'Enter a valid mobile number, like 09171234567.');
    }

    public function test_restaurant_location_and_coverage_validation_and_authorization(): void
    {
        $this->patchJson('/api/restaurant/location', [])->assertStatus(401);

        $admin = $this->makeUser('admin');
        $customer = $this->makeUser('customer');
        $owner = $this->makeUser('customer');
        $restaurantId = $this->createRestaurantForOwner($owner);

        $this->actingAs($admin)->postJson('/api/admin/service-areas', [
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
            'is_active' => true,
        ])->assertStatus(201);

        $this->actingAs($customer)->patchJson('/api/restaurant/location', [])->assertStatus(403);
        $this->actingAs($customer)->putJson('/api/restaurant/coverage', [])->assertStatus(403);

        $invalidLocation = $this->actingAs($owner)->patchJson('/api/restaurant/location', [
            'restaurant_id' => 0,
            'postal_code' => '999',
            'gps_accuracy' => -5,
        ]);
        $invalidLocation->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['success', 'message', 'errors'])
            ->assertJsonValidationErrors([
                'restaurant_id',
                'province',
                'city',
                'barangay',
                'street',
                'postal_code',
                'latitude',
                'longitude',
                'gps_accuracy',
            ]);

        $this->actingAs($owner)->patchJson('/api/restaurant/location', [
            'restaurant_id' => $restaurantId,
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
            'street' => 'Mastersons Ave',
            'postal_code' => '9000',
            'latitude' => 8.4811,
            'longitude' => 124.6369,
            'gps_accuracy' => 10,
        ])->assertStatus(200)
            ->assertJsonPath('success', true);

        $invalidCoverageMissing = $this->actingAs($owner)->putJson('/api/restaurant/coverage', [
            'restaurant_id' => 0,
        ]);
        $invalidCoverageMissing->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonValidationErrors(['restaurant_id', 'areas']);

        $invalidCoverageItems = $this->actingAs($owner)->putJson('/api/restaurant/coverage', [
            'restaurant_id' => $restaurantId,
            'areas' => [
                ['barangay' => 'Carmen'],
            ],
        ]);
        $invalidCoverageItems->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonValidationErrors(['areas.0.province', 'areas.0.city']);

        $this->actingAs($owner)->putJson('/api/restaurant/coverage', [
            'restaurant_id' => $restaurantId,
            'areas' => [
                [
                    'province' => 'Misamis Oriental',
                    'city' => 'Cagayan de Oro City',
                    'barangay' => 'Carmen',
                ],
            ],
        ])->assertStatus(200)
            ->assertJsonPath('success', true);
    }

    public function test_location_lookup_validate_service_area_validation(): void
    {
        $invalid = $this->postJson('/api/locations/validate-service-area', [
            'barangay' => str_repeat('z', 101),
            'restaurant_id' => 0,
        ]);
        $invalid->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['success', 'message', 'errors'])
            ->assertJsonValidationErrors(['province', 'city', 'barangay', 'restaurant_id']);

        $valid = $this->postJson('/api/locations/validate-service-area', [
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => null,
        ]);
        $valid->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['success', 'message', 'data' => ['supported', 'reason']]);
    }

    public function test_rider_location_tracking_validation_and_authorization(): void
    {
        $customer = $this->makeUser('customer');
        $rider = $this->makeUser('customer');
        $this->createRiderRecord($rider);

        $this->postJson('/api/rider/location', [])->assertStatus(401);
        $this->actingAs($customer)->postJson('/api/rider/location', [])->assertStatus(403);

        $invalid = $this->actingAs($rider)->postJson('/api/rider/location', [
            'delivery_id' => 0,
            'accuracy_meters' => -1,
            'heading' => 361,
            'speed_mps' => -0.5,
            'recorded_at' => 'not-a-date',
        ]);
        $invalid->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['success', 'message', 'errors'])
            ->assertJsonValidationErrors([
                'delivery_id',
                'latitude',
                'longitude',
                'accuracy_meters',
                'heading',
                'speed_mps',
                'recorded_at',
            ]);

        $valid = $this->actingAs($rider)->postJson('/api/rider/location', [
            'latitude' => 8.4811,
            'longitude' => 124.6369,
            'accuracy_meters' => 12.5,
            'heading' => 180,
            'speed_mps' => 5.5,
            'recorded_at' => '2026-11-20T10:00:00Z',
        ]);
        $valid->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['success', 'message', 'data' => ['recorded']]);
    }
}
