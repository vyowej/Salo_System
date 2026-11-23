<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\AddressService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RiderOrderValidationCharacterizationTest extends TestCase
{
    use DatabaseTransactions;

    private function makeUser(string $role = 'customer'): User
    {
        return User::forceCreate([
            'username' => $role . '_roval_' . random_int(10000, 99999),
            'first_name' => ucfirst($role),
            'last_name' => 'RoVal',
            'email' => $role . '_roval_' . random_int(10000, 99999) . '@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
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
            'restaurant_name' => 'RoVal Kitchen ' . random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'roval_' . random_int(100, 999) . '@example.com',
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

    public function test_rider_profile_and_availability_validation_and_authorization(): void
    {
        $this->patchJson('/api/rider/profile', [])->assertStatus(401);
        $this->patchJson('/api/rider/availability', [])->assertStatus(401);

        $customer = $this->makeUser('customer');
        $rider = $this->makeUser('customer');
        $this->createRiderRecord($rider);

        $this->actingAs($customer)->patchJson('/api/rider/profile', [])->assertStatus(403);
        $this->actingAs($customer)->patchJson('/api/rider/availability', ['status' => 'online'])->assertStatus(403);

        // RiderController::updateProfile invalid inputs
        $invalidProfile = $this->actingAs($rider)->patchJson('/api/rider/profile', [
            'emergency_contact_name' => 123,
            'emergency_contact_relationship' => 'cousin',
            'emergency_contact_phone' => str_repeat('9', 31),
            'emergency_contact_alt_phone' => str_repeat('8', 31),
            'preferred_hubs' => str_repeat('h', 256),
            'preferred_shifts' => ['midnight'],
            'available_days' => ['monday'],
        ]);
        $invalidProfile->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['success', 'message', 'errors'])
            ->assertJsonValidationErrors([
                'emergency_contact_name',
                'emergency_contact_relationship',
                'emergency_contact_phone',
                'emergency_contact_alt_phone',
                'preferred_hubs',
                'preferred_shifts.0',
                'available_days.0',
            ]);

        // Empty payload passes (all rules are sometimes/nullable)
        $this->actingAs($rider)->patchJson('/api/rider/profile', [])
            ->assertStatus(200)
            ->assertJsonPath('success', true);

        // Valid partial update
        $this->actingAs($rider)->patchJson('/api/rider/profile', [
            'emergency_contact_name' => 'Maria Clara',
            'emergency_contact_relationship' => 'spouse_partner',
            'emergency_contact_phone' => '09171234567',
            'emergency_contact_alt_phone' => null,
            'preferred_shifts' => ['breakfast', 'dinner'],
            'available_days' => ['mon', 'fri'],
        ])->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.profile.emergency_contact_name', 'Maria Clara');

        // RiderController::updateAvailability invalid inputs
        $this->actingAs($rider)->patchJson('/api/rider/availability', [])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonValidationErrors(['status']);

        $this->actingAs($rider)->patchJson('/api/rider/availability', [
            'status' => 'busy',
        ])->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonValidationErrors(['status']);

        // Valid availability status
        $this->actingAs($rider)->patchJson('/api/rider/availability', [
            'status' => 'offline',
        ])->assertStatus(200)
            ->assertJsonPath('success', true);
    }

    public function test_rider_application_upload_document_validation_and_authorization(): void
    {
        $this->postJson('/api/rider/applications/999999/documents', [])->assertStatus(401);

        $applicant = $this->makeUser('customer');

        // Missing required fields & invalid request_id
        $this->actingAs($applicant)->postJson('/api/rider/applications/999999/documents', [
            'request_id' => 'not-an-int',
        ])->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['success', 'message', 'errors'])
            ->assertJsonValidationErrors(['document_code', 'request_id', 'file']);

        // Invalid mime type and oversized file
        $this->actingAs($applicant)->postJson('/api/rider/applications/999999/documents', [
            'document_code' => 'nbi_clearance',
            'file' => UploadedFile::fake()->create('malware.exe', 10, 'application/octet-stream'),
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['file']);

        $maxKb = max(256, (int) config('salo.uploads.max_size_kb', 5120));
        $this->actingAs($applicant)->postJson('/api/rider/applications/999999/documents', [
            'document_code' => 'nbi_clearance',
            'file' => UploadedFile::fake()->create('oversized.pdf', $maxKb + 10, 'application/pdf'),
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['file']);

        // Valid input passes validation and reaches service (404 on nonexistent application, no side effects)
        $this->actingAs($applicant)->postJson('/api/rider/applications/999999/documents', [
            'document_code' => 'nbi_clearance',
            'request_id' => null,
            'file' => UploadedFile::fake()->create('clearance.pdf', 100, 'application/pdf'),
        ])->assertStatus(404);
    }

    public function test_customer_order_cancel_validation_and_authorization(): void
    {
        $this->postJson('/api/customer/orders/999999/cancel', [])->assertStatus(401);

        $customer = $this->makeUser('customer');

        // Invalid reason (exceeds 255 chars and non-string)
        $this->actingAs($customer)->postJson('/api/customer/orders/999999/cancel', [
            'reason' => str_repeat('a', 256),
        ])->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['success', 'message', 'errors'])
            ->assertJsonValidationErrors(['reason']);

        $this->actingAs($customer)->postJson('/api/customer/orders/999999/cancel', [
            'reason' => 12345,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['reason']);

        // Valid nullable/omitted and valid string pass validation and reach service (404 on nonexistent order)
        $this->actingAs($customer)->postJson('/api/customer/orders/999999/cancel', [])
            ->assertStatus(404);

        $this->actingAs($customer)->postJson('/api/customer/orders/999999/cancel', [
            'reason' => 'Changed my mind',
        ])->assertStatus(404);
    }

    public function test_restaurant_order_reject_validation_and_authorization(): void
    {
        $this->postJson('/api/restaurant/orders/999999/reject', [])->assertStatus(401);

        $customer = $this->makeUser('customer');
        $owner = $this->makeUser('customer');
        $restaurantId = $this->createRestaurantForOwner($owner);

        $this->actingAs($customer)->postJson('/api/restaurant/orders/999999/reject', [
            'reason' => 'Out of stock',
        ])->assertStatus(403);

        // Missing required reason and invalid restaurant_id
        $this->actingAs($owner)->postJson('/api/restaurant/orders/999999/reject', [
            'restaurant_id' => 'not-an-int',
        ])->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['success', 'message', 'errors'])
            ->assertJsonValidationErrors(['restaurant_id', 'reason']);

        // Reason exceeding max:255
        $this->actingAs($owner)->postJson('/api/restaurant/orders/999999/reject', [
            'restaurant_id' => $restaurantId,
            'reason' => str_repeat('r', 256),
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['reason']);

        // Valid payload passes validation and reaches service (404 on nonexistent order)
        $this->actingAs($owner)->postJson('/api/restaurant/orders/999999/reject', [
            'restaurant_id' => $restaurantId,
            'reason' => 'Kitchen closed early',
        ])->assertStatus(404);
    }
}
