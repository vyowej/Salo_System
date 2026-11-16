<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\AddressService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OnboardingBackendTest extends TestCase
{
    use DatabaseTransactions;

    public function test_customer_phone_onboarding_validates_ph_mobile_and_normalizes_format(): void
    {
        $customer = $this->makeUser('customer');

        // Unauthenticated rejected
        $this->patchJson('/api/account/profile', ['phone_number' => '09171234567'])
            ->assertStatus(401);

        // Valid 09XXXXXXXXX
        $this->actingAs($customer, 'web')
            ->patchJson('/api/account/profile', ['phone_number' => '09171234567'])
            ->assertStatus(200)
            ->assertJsonPath('data.user.phone_number', '09171234567');

        // Valid +639XXXXXXXXX normalized to 09XXXXXXXXX
        $this->actingAs($customer, 'web')
            ->patchJson('/api/account/profile', ['phone_number' => '+639189876543'])
            ->assertStatus(200)
            ->assertJsonPath('data.user.phone_number', '09189876543');

        // Invalid formats rejected with exact onboarding error message
        foreach (['1234567', '08171234567', '+6391712345', '+14155552671', 'abc09171234567'] as $invalidPhone) {
            $this->actingAs($customer, 'web')
                ->patchJson('/api/account/profile', ['phone_number' => $invalidPhone])
                ->assertStatus(422)
                ->assertJsonPath('errors.phone_number.0', 'Pakilagay ang tamang numero ng cellphone (hal. 09171234567).');
        }
    }

    public function test_customer_address_onboarding_creates_default_validates_and_enforces_ownership(): void
    {
        $customer1 = $this->makeUser('customer');
        $customer2 = $this->makeUser('customer');

        // Unauthenticated denied
        $this->getJson('/api/customer/addresses')->assertStatus(401);
        $this->postJson('/api/customer/addresses', [])->assertStatus(401);

        // Missing required fields rejected
        $this->actingAs($customer1, 'web')
            ->postJson('/api/customer/addresses', [
                'label' => 'Home',
            ])
            ->assertStatus(422)
            ->assertJsonStructure(['errors' => ['province', 'city', 'barangay', 'street']]);

        // Invalid recipient_phone rejected
        $this->actingAs($customer1, 'web')
            ->postJson('/api/customer/addresses', [
                'label' => 'Home',
                'recipient_name' => 'Juan Dela Cruz',
                'recipient_phone' => '08123',
                'province' => 'Metro Manila',
                'city' => 'Quezon City',
                'barangay' => 'Diliman',
                'street' => '123 University Ave',
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.recipient_phone.0', 'Pakilagay ang tamang numero ng cellphone (hal. 09171234567).');

        // First saved address automatically becomes default and normalizes +639 phone
        $createRes = $this->actingAs($customer1, 'web')
            ->postJson('/api/customer/addresses', [
                'label' => 'Home',
                'recipient_name' => 'Juan Dela Cruz',
                'recipient_phone' => '+639171234567',
                'province' => 'Metro Manila',
                'city' => 'Quezon City',
                'barangay' => 'Diliman',
                'street' => '123 University Ave',
                'house_number' => 'Unit 2B',
                'postal_code' => '1101',
                'landmark' => 'Near Quezon Hall',
            ]);

        $createRes->assertStatus(201)
            ->assertJsonPath('data.address.is_default', true)
            ->assertJsonPath('data.address.recipient_phone', '09171234567')
            ->assertJsonPath('data.address.city', 'Quezon City');

        $addressId = $createRes->json('data.address.id');

        // Customer 2 cannot view, update, set default, or delete Customer 1's address
        $this->actingAs($customer2, 'web')
            ->getJson('/api/customer/addresses')
            ->assertStatus(200)
            ->assertJsonCount(0, 'data.addresses');

        $this->actingAs($customer2, 'web')
            ->patchJson("/api/customer/addresses/{$addressId}", ['street' => 'Hijacked St'])
            ->assertStatus(404);

        $this->actingAs($customer2, 'web')
            ->patchJson("/api/customer/addresses/{$addressId}/default")
            ->assertStatus(404);

        $this->actingAs($customer2, 'web')
            ->deleteJson("/api/customer/addresses/{$addressId}")
            ->assertStatus(404);
    }

    public function test_restaurant_setup_status_derives_real_checklist_and_enforces_owner_only_authorization(): void
    {
        $owner1 = $this->makeUser('customer');
        $owner2 = $this->makeUser('customer');
        $staffUser = $this->makeUser('customer');
        $plainCustomer = $this->makeUser('customer');
        $pendingOwner = $this->makeUser('customer');

        $addressId = app(AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '45 Maginhawa St',
            'postal_code' => '1101',
        ]);

        // Approved restaurant for owner1 (initially incomplete profile/hours/menu/tables)
        $restaurant1Id = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Salo Kusina One',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'description' => null,
            'contact_phone' => '09171234567',
            'business_email' => 'kusina1@example.com',
            'address_id' => $addressId,
            'logo_image' => null,
            'cover_image' => null,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepts_reservations' => 1,
            'accepting_orders' => 0,
            'accepting_reservations' => 1,
            'restaurant_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurant1Id,
            'user_id' => $owner1->user_id,
            'joined_at' => now(),
        ]);

        // Active staff member on restaurant1
        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $restaurant1Id,
            'user_id' => $staffUser->user_id,
            'staff_position' => 'Manager',
            'staff_status' => 'active',
            'joined_at' => now(),
        ]);

        // Approved restaurant for owner2 (delivery-only: tables not applicable)
        $restaurant2Id = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Salo Cloud Kitchen Two',
            'business_type' => 'cloud_kitchen',
            'ownership_structure' => 'sole_proprietorship',
            'description' => 'Delivery-only artisan cloud kitchen.',
            'contact_phone' => '09181234567',
            'business_email' => 'cloud2@example.com',
            'address_id' => $addressId,
            'logo_image' => 'restaurants/2/logo.png',
            'cover_image' => 'restaurants/2/cover.jpg',
            'offers_delivery' => 1,
            'offers_pickup' => 0,
            'offers_dine_in' => 0,
            'accepts_reservations' => 0,
            'accepting_orders' => 1,
            'accepting_reservations' => 0,
            'restaurant_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurant2Id,
            'user_id' => $owner2->user_id,
            'joined_at' => now(),
        ]);

        // Pending restaurant for pendingOwner
        $pendingRestId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Pending Resto',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'pending@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $pendingRestId,
            'user_id' => $pendingOwner->user_id,
            'joined_at' => now(),
        ]);

        // 1. Unauthenticated, plain customer, staff-only, and pending applicant are all denied
        $this->getJson('/api/restaurant/setup-status')->assertStatus(401);
        $this->actingAs($plainCustomer, 'web')->getJson('/api/restaurant/setup-status')->assertStatus(403);
        $this->actingAs($staffUser, 'web')->getJson('/api/restaurant/setup-status')->assertStatus(403);
        $this->actingAs($staffUser, 'web')->getJson("/api/restaurant/setup-status?restaurant_id={$restaurant1Id}")->assertStatus(403);
        $this->actingAs($pendingOwner, 'web')->getJson('/api/restaurant/setup-status')->assertStatus(403);

        // 2. Owner 1 cannot read Owner 2's restaurant setup status
        $this->actingAs($owner1, 'web')
            ->getJson("/api/restaurant/setup-status?restaurant_id={$restaurant2Id}")
            ->assertStatus(403);

        // 3. Owner 1 sees incomplete checklist items on restaurant1
        $this->actingAs($owner1, 'web')
            ->getJson("/api/restaurant/setup-status?restaurant_id={$restaurant1Id}")
            ->assertStatus(200)
            ->assertJsonPath('data.setup_status.restaurant_id', $restaurant1Id)
            ->assertJsonPath('data.setup_status.business_profile.complete', false)
            ->assertJsonPath('data.setup_status.operating_hours.complete', false)
            ->assertJsonPath('data.setup_status.menu.complete', false)
            ->assertJsonPath('data.setup_status.tables.applicable', true)
            ->assertJsonPath('data.setup_status.tables.complete', false)
            ->assertJsonPath('data.setup_status.availability_toggles.complete', false);

        // 4. Populate restaurant1 setup items and verify all derived flags become true
        DB::table('restaurants')->where('restaurant_id', $restaurant1Id)->update([
            'description' => 'Warm Filipino family kitchen.',
            'logo_image' => 'restaurants/1/logo.png',
            'cover_image' => 'restaurants/1/cover.jpg',
            'accepting_orders' => 1,
            'accepting_reservations' => 1,
        ]);

        DB::table('operating_hours')->insert([
            'restaurant_id' => $restaurant1Id,
            'day_of_week' => 1,
            'opening_time' => '09:00:00',
            'closing_time' => '21:00:00',
            'is_closed' => 0,
        ]);

        $catId = (int) DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $restaurant1Id,
            'category_name' => 'Mains',
            'is_active' => 1,
        ]);

        DB::table('menu_items')->insert([
            'restaurant_id' => $restaurant1Id,
            'menu_category_id' => $catId,
            'item_name' => 'Chicken Inasal',
            'base_price' => 185.00,
            'availability_status' => 'available',
            'approval_status' => 'approved',
        ]);

        DB::table('restaurant_tables')->insert([
            'restaurant_id' => $restaurant1Id,
            'table_name' => 'Table 1',
            'seating_capacity' => 4,
            'is_active' => 1,
        ]);

        $this->actingAs($owner1, 'web')
            ->getJson("/api/restaurant/setup-status?restaurant_id={$restaurant1Id}")
            ->assertStatus(200)
            ->assertJsonPath('data.setup_status.business_profile.complete', true)
            ->assertJsonPath('data.setup_status.operating_hours.complete', true)
            ->assertJsonPath('data.setup_status.menu.complete', true)
            ->assertJsonPath('data.setup_status.tables.applicable', true)
            ->assertJsonPath('data.setup_status.tables.complete', true)
            ->assertJsonPath('data.setup_status.availability_toggles.complete', true);

        // 5. Owner 2's delivery-only restaurant marks tables.applicable = false
        $this->actingAs($owner2, 'web')
            ->getJson('/api/restaurant/setup-status')
            ->assertStatus(200)
            ->assertJsonPath('data.setup_status.restaurant_id', $restaurant2Id)
            ->assertJsonPath('data.setup_status.business_profile.complete', true)
            ->assertJsonPath('data.setup_status.tables.applicable', false)
            ->assertJsonPath('data.setup_status.tables.complete', true)
            ->assertJsonPath('data.setup_status.availability_toggles.complete', true);
    }

    public function test_rider_dashboard_returns_own_status_and_denies_unapproved_or_other_roles(): void
    {
        $approvedRiderUser = $this->makeUser('customer');
        $pendingRiderUser = $this->makeUser('customer');
        $customerUser = $this->makeUser('customer');

        $addressId = app(AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '10 Rider St',
        ]);
        $cityId = DB::table('cities')->where('city_name', 'Quezon City')->value('city_id');

        DB::table('riders')->insert([
            'user_id' => $approvedRiderUser->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Parent One',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09171112222',
            'base_city_id' => $cityId,
            'rider_status' => 'active',
            'approved_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('riders')->insert([
            'user_id' => $pendingRiderUser->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Parent Two',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09173334444',
            'base_city_id' => $cityId,
            'rider_status' => 'pending',
            'approved_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->getJson('/api/rider/dashboard')->assertStatus(401);
        $this->actingAs($customerUser, 'web')->getJson('/api/rider/dashboard')->assertStatus(403);
        $this->actingAs($pendingRiderUser, 'web')->getJson('/api/rider/dashboard')->assertStatus(403);

        $this->actingAs($approvedRiderUser, 'web')
            ->getJson('/api/rider/dashboard')
            ->assertStatus(200)
            ->assertJsonPath('data.rider.user_id', (int) $approvedRiderUser->user_id)
            ->assertJsonPath('data.rider.rider_status', 'active')
            ->assertJsonPath('data.rider.base_city', 'Quezon City')
            ->assertJsonPath('data.stats.has_active_delivery', false);
    }

    private function makeUser(string $role): User
    {
        return User::create([
            'username' => $role.'_'.random_int(10000, 99999),
            'first_name' => ucfirst($role),
            'last_name' => 'User',
            'email' => $role.'_'.random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role === 'admin' ? 'admin' : 'customer',
            'account_status' => 'active',
        ]);
    }
}
