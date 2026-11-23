<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RestaurantValidationCharacterizationTest extends TestCase
{
    use DatabaseTransactions;

    private function createOwnerWithActiveRestaurant(): array
    {
        $owner = User::forceCreate([
            'username' => 'valown_' . random_int(10000, 99999),
            'first_name' => 'Val',
            'last_name' => 'Owner',
            'email' => 'valown_' . random_int(10000, 99999) . '@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $addressId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '15 Validation St',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Validation Bistro',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234567',
            'business_email' => $owner->email,
            'address_id' => $addressId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'restaurant_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        return [$owner, $restaurantId];
    }

    public function test_invalid_payloads_return_exact_422_validation_error_structures(): void
    {
        [$owner, $restId] = $this->createOwnerWithActiveRestaurant();

        // OwnerInventoryController
        $this->actingAs($owner)->getJson('/api/restaurant/inventory/config?restaurant_id=0')
            ->assertStatus(422)->assertJsonPath('success', false)->assertJsonValidationErrors(['restaurant_id']);
        $this->actingAs($owner)->patchJson('/api/restaurant/inventory/config', ['deduction_mode' => 'invalid'])
            ->assertStatus(422)->assertJsonPath('success', false)->assertJsonValidationErrors(['deduction_mode']);

        // OwnerProfileController
        $this->actingAs($owner)->patchJson('/api/restaurant/profile', ['business_email' => 'not-an-email'])
            ->assertStatus(422)->assertJsonPath('success', false)->assertJsonValidationErrors(['business_email']);
        $this->actingAs($owner)->post('/api/restaurant/profile/media', [
            'logo_image' => UploadedFile::fake()->create('doc.txt', 10, 'text/plain'),
        ], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonPath('success', false)->assertJsonValidationErrors(['logo_image']);
        $this->actingAs($owner)->patchJson('/api/restaurant/accepting-status', ['accepting_orders' => 'not-bool'])
            ->assertStatus(422)->assertJsonPath('success', false)->assertJsonValidationErrors(['accepting_orders']);
        $this->actingAs($owner)->putJson('/api/restaurant/operating-hours', ['operating_hours' => []])
            ->assertStatus(422)->assertJsonPath('success', false)->assertJsonValidationErrors(['operating_hours']);

        // OwnerMenuController
        $this->actingAs($owner)->postJson('/api/restaurant/menu/categories', ['category_name' => ''])
            ->assertStatus(422)->assertJsonPath('success', false)->assertJsonValidationErrors(['category_name']);
        $this->actingAs($owner)->patchJson('/api/restaurant/menu/categories/1', ['sort_order' => -1])
            ->assertStatus(422)->assertJsonPath('success', false)->assertJsonValidationErrors(['sort_order']);
        $this->actingAs($owner)->putJson('/api/restaurant/menu/categories/reorder', ['ordered_ids' => []])
            ->assertStatus(422)->assertJsonPath('success', false)->assertJsonValidationErrors(['ordered_ids']);
        $this->actingAs($owner)->postJson('/api/restaurant/menu/items', ['base_price' => '-5'])
            ->assertStatus(422)->assertJsonPath('success', false)->assertJsonValidationErrors(['menu_category_id', 'item_name', 'base_price']);
        $this->actingAs($owner)->patchJson('/api/restaurant/menu/items/1', ['base_price' => '12.345'])
            ->assertStatus(422)->assertJsonPath('success', false)->assertJsonValidationErrors(['base_price']);
        $this->actingAs($owner)->patchJson('/api/restaurant/menu/items/1/availability', ['availability_status' => 'bogus'])
            ->assertStatus(422)->assertJsonPath('success', false)->assertJsonValidationErrors(['availability_status']);

        // StaffInvitationController
        $this->actingAs($owner)->postJson('/api/restaurant/staff/invitations', ['email' => 'bad-email'])
            ->assertStatus(422)->assertJsonPath('success', false)->assertJsonValidationErrors(['email', 'staff_position']);

        // RestaurantApplicationController::uploadDocument
        $this->actingAs($owner)->post('/api/restaurant/applications/1/documents', [], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonPath('success', false)->assertJsonValidationErrors(['document_code', 'file']);
    }
}
