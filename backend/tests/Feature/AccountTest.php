<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class AccountTest extends TestCase
{
    use DatabaseTransactions;

    public function test_unauthenticated_account_endpoints_return_401(): void
    {
        $this->patchJson('/api/account/profile', ['first_name' => 'Test'])
            ->assertStatus(401)
            ->assertJsonPath('success', false);

        $this->putJson('/api/account/password', [
            'current_password' => 'SecretPass123!',
            'password' => 'NewSecretPass123!',
            'password_confirmation' => 'NewSecretPass123!',
        ])->assertStatus(401)->assertJsonPath('success', false);

        $this->getJson('/api/account/applications')
            ->assertStatus(401)
            ->assertJsonPath('success', false);
    }

    public function test_update_profile_updates_allowed_fields_and_returns_me_shape(): void
    {
        $user = User::create([
            'username' => 'profile_user',
            'first_name' => 'Ana',
            'middle_initial' => 'B',
            'last_name' => 'Reyes',
            'email' => 'ana@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $this->actingAs($user, 'web');

        $response = $this->patchJson('/api/account/profile', [
            'username' => 'ana.reyes',
            'first_name' => 'Ana Maria',
            'middle_initial' => 'c',
            'last_name' => 'Reyes-Cruz',
            'phone_number' => '+63 917 123 4567',
            'date_of_birth' => '1998-05-14',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.user_id', (int) $user->user_id)
            ->assertJsonPath('data.user.username', 'ana.reyes')
            ->assertJsonPath('data.user.first_name', 'Ana Maria')
            ->assertJsonPath('data.user.middle_initial', 'C')
            ->assertJsonPath('data.user.last_name', 'Reyes-Cruz')
            ->assertJsonPath('data.user.email', 'ana@example.com')
            ->assertJsonPath('data.user.phone_number', '+63 917 123 4567')
            ->assertJsonPath('data.user.date_of_birth', '1998-05-14')
            ->assertJsonPath('data.user.roles', ['customer'])
            ->assertJsonMissingPath('data.user.password_hash');

        $this->assertDatabaseHas('users', [
            'user_id' => $user->user_id,
            'username' => 'ana.reyes',
            'first_name' => 'Ana Maria',
            'middle_initial' => 'C',
            'last_name' => 'Reyes-Cruz',
            'phone_number' => '+63 917 123 4567',
            'date_of_birth' => '1998-05-14',
        ]);
    }

    public function test_update_profile_ignores_restricted_fields(): void
    {
        $originalHash = Hash::make('SecretPass123!');

        $user = User::create([
            'username' => 'restricted_user',
            'first_name' => 'Carlo',
            'last_name' => 'Mendoza',
            'email' => 'carlo@example.com',
            'password_hash' => $originalHash,
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $this->actingAs($user, 'web');

        $response = $this->patchJson('/api/account/profile', [
            'first_name' => 'Carlo Updated',
            'email' => 'hacked@example.com',
            'user_role' => 'admin',
            'account_status' => 'suspended',
            'password_hash' => 'tampered',
            'email_verified_at' => '2026-01-01 00:00:00',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.user.first_name', 'Carlo Updated')
            ->assertJsonPath('data.user.email', 'carlo@example.com')
            ->assertJsonPath('data.user.user_role', 'customer')
            ->assertJsonPath('data.user.account_status', 'active')
            ->assertJsonPath('data.user.email_verified_at', null);

        $row = DB::table('users')->where('user_id', $user->user_id)->first();
        $this->assertSame($originalHash, $row->password_hash);
    }

    public function test_update_profile_rejects_duplicate_username_and_allows_own_username(): void
    {
        User::create([
            'username' => 'taken_name',
            'first_name' => 'First',
            'last_name' => 'User',
            'email' => 'first@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $user = User::create([
            'username' => 'my_name',
            'first_name' => 'Second',
            'last_name' => 'User',
            'email' => 'second@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $this->actingAs($user, 'web');

        $this->patchJson('/api/account/profile', [
            'username' => 'taken_name',
        ])->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['errors' => ['username']]);

        $this->patchJson('/api/account/profile', [
            'username' => 'my_name',
            'first_name' => 'Second Updated',
        ])->assertStatus(200)
            ->assertJsonPath('data.user.username', 'my_name')
            ->assertJsonPath('data.user.first_name', 'Second Updated');
    }

    public function test_update_password_validates_current_password_and_rate_limits(): void
    {
        $user = User::create([
            'username' => 'pw_user',
            'first_name' => 'Liza',
            'last_name' => 'Tan',
            'email' => 'liza@example.com',
            'password_hash' => Hash::make('OldSecret123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        RateLimiter::clear('account:password:'.$user->user_id.'|127.0.0.1');

        $this->actingAs($user, 'web');

        // Same password rejected
        $this->putJson('/api/account/password', [
            'current_password' => 'OldSecret123!',
            'password' => 'OldSecret123!',
            'password_confirmation' => 'OldSecret123!',
        ])->assertStatus(422)
            ->assertJsonStructure(['errors' => ['password']]);

        // 5 wrong attempts -> 422, 6th -> 429
        for ($i = 0; $i < 5; $i++) {
            $this->putJson('/api/account/password', [
                'current_password' => 'WrongPassword!',
                'password' => 'NewSecret123!',
                'password_confirmation' => 'NewSecret123!',
            ])->assertStatus(422)
                ->assertJsonStructure(['errors' => ['current_password']]);
        }

        $this->putJson('/api/account/password', [
            'current_password' => 'WrongPassword!',
            'password' => 'NewSecret123!',
            'password_confirmation' => 'NewSecret123!',
        ])->assertStatus(429)
            ->assertJsonPath('success', false);
    }

    public function test_update_password_succeeds_regenerates_session_and_writes_audit_log(): void
    {
        $user = User::create([
            'username' => 'pw_success_user',
            'first_name' => 'Mark',
            'last_name' => 'Lim',
            'email' => 'mark@example.com',
            'password_hash' => Hash::make('OldSecret123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        RateLimiter::clear('account:password:'.$user->user_id.'|127.0.0.1');

        $this->postJson('/api/auth/login', [
            'email' => 'mark@example.com',
            'password' => 'OldSecret123!',
        ])->assertStatus(200);

        $sessionIdBefore = session()->getId();

        $this->putJson('/api/account/password', [
            'current_password' => 'OldSecret123!',
            'password' => 'BrandNewPass456!',
            'password_confirmation' => 'BrandNewPass456!',
        ])->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertNotSame($sessionIdBefore, session()->getId());

        $freshUser = DB::table('users')->where('user_id', $user->user_id)->first();
        $this->assertTrue(Hash::check('BrandNewPass456!', $freshUser->password_hash));

        $this->assertDatabaseHas('audit_logs', [
            'actor_user_id' => $user->user_id,
            'action' => 'password_changed',
            'entity_type' => 'users',
            'entity_id' => (string) $user->user_id,
        ]);

        $this->postJson('/api/auth/logout')->assertStatus(200);

        $this->postJson('/api/auth/login', [
            'email' => 'mark@example.com',
            'password' => 'OldSecret123!',
        ])->assertStatus(401);

        $this->postJson('/api/auth/login', [
            'email' => 'mark@example.com',
            'password' => 'BrandNewPass456!',
        ])->assertStatus(200);
    }

    public function test_applications_returns_nulls_when_none_exist(): void
    {
        $user = User::create([
            'username' => 'no_apps_user',
            'first_name' => 'Nora',
            'last_name' => 'Gomez',
            'email' => 'nora@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $this->actingAs($user, 'web');

        $this->getJson('/api/account/applications')
            ->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.restaurant_application', null)
            ->assertJsonPath('data.rider_application', null);
    }

    public function test_applications_returns_only_users_own_latest_applications_without_internal_fields(): void
    {
        $user = User::create([
            'username' => 'applicant_user',
            'first_name' => 'Paolo',
            'last_name' => 'Villanueva',
            'email' => 'paolo@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $otherUser = User::create([
            'username' => 'other_applicant',
            'first_name' => 'Other',
            'last_name' => 'Person',
            'email' => 'other@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $reviewer = User::create([
            'username' => 'admin_reviewer',
            'first_name' => 'Admin',
            'last_name' => 'Reviewer',
            'email' => 'reviewer@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'admin',
            'account_status' => 'active',
        ]);

        [, $cityId, , $addressId] = $this->createLocationFixture();

        $restaurantId = DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Paolo Bistro',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'paolobistro@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'pending',
        ]);

        $otherRestaurantId = DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Other Bistro',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'otherbistro@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'pending',
        ]);

        DB::table('restaurant_applications')->insert([
            'reference_number' => 'SALO-APP-20261115-0001',
            'applicant_user_id' => $user->user_id,
            'restaurant_id' => $restaurantId,
            'application_status' => 'needs_correction',
            'applicant_position' => 'business_owner',
            'legal_first_name' => 'Paolo',
            'legal_last_name' => 'Villanueva',
            'date_of_birth' => '1992-03-10',
            'contact_phone' => '09171112222',
            'contact_email' => 'paolo@example.com',
            'contact_email_verified_at' => now(),
            'declarations_accepted_at' => now(),
            'terms_version' => 'v1.0',
            'submitted_at' => now()->subDays(2),
            'reviewer_note' => 'Please upload a clearer Mayor\'s Permit.',
            'reviewed_by' => $reviewer->user_id,
            'reviewed_at' => now()->subDay(),
        ]);

        DB::table('restaurant_applications')->insert([
            'reference_number' => 'SALO-APP-20261115-0002',
            'applicant_user_id' => $otherUser->user_id,
            'restaurant_id' => $otherRestaurantId,
            'application_status' => 'approved',
            'applicant_position' => 'business_owner',
            'legal_first_name' => 'Other',
            'legal_last_name' => 'Person',
            'date_of_birth' => '1990-01-01',
            'contact_phone' => '09173334444',
            'contact_email' => 'other@example.com',
            'contact_email_verified_at' => now(),
            'declarations_accepted_at' => now(),
            'terms_version' => 'v1.0',
            'submitted_at' => now(),
            'decided_at' => now(),
        ]);

        $riderId = DB::table('riders')->insertGetId([
            'user_id' => $user->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Maria Villanueva',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09175556666',
            'base_city_id' => $cityId,
            'rider_status' => 'pending',
        ]);

        DB::table('rider_applications')->insert([
            'reference_number' => 'SALO-RIDER-20261115-0001',
            'applicant_user_id' => $user->user_id,
            'rider_id' => $riderId,
            'application_status' => 'rejected',
            'legal_first_name' => 'Paolo',
            'legal_last_name' => 'Villanueva',
            'date_of_birth' => '1992-03-10',
            'contact_phone' => '09171112222',
            'contact_email' => 'paolo@example.com',
            'contact_email_verified_at' => now(),
            'residence_address_id' => $addressId,
            'gov_id_type' => 'drivers_license',
            'gov_id_number_encrypted' => 'encrypted-test-id',
            'gov_id_is_permanent' => 1,
            'declarations_accepted_at' => now(),
            'terms_version' => 'v1.0',
            'submitted_at' => now()->subDays(5),
            'reviewer_note' => 'Expired license.',
            'reviewed_by' => $reviewer->user_id,
            'reviewed_at' => now()->subDays(4),
            'decided_at' => now()->subDays(4),
        ]);

        DB::table('rider_applications')->insert([
            'reference_number' => 'SALO-RIDER-20261115-0002',
            'applicant_user_id' => $user->user_id,
            'rider_id' => $riderId,
            'application_status' => 'under_review',
            'legal_first_name' => 'Paolo',
            'legal_last_name' => 'Villanueva',
            'date_of_birth' => '1992-03-10',
            'contact_phone' => '09171112222',
            'contact_email' => 'paolo@example.com',
            'contact_email_verified_at' => now(),
            'residence_address_id' => $addressId,
            'gov_id_type' => 'drivers_license',
            'gov_id_number_encrypted' => 'encrypted-test-id-2',
            'gov_id_is_permanent' => 1,
            'declarations_accepted_at' => now(),
            'terms_version' => 'v1.0',
            'submitted_at' => now()->subHours(2),
            'reviewer_note' => null,
            'reviewed_by' => $reviewer->user_id,
        ]);

        $this->actingAs($user, 'web');

        $response = $this->getJson('/api/account/applications');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.restaurant_application.type', 'restaurant')
            ->assertJsonPath('data.restaurant_application.status', 'needs_correction')
            ->assertJsonPath('data.restaurant_application.reviewer_note', "Please upload a clearer Mayor's Permit.")
            ->assertJsonPath('data.rider_application.type', 'rider')
            ->assertJsonPath('data.rider_application.status', 'under_review')
            ->assertJsonPath('data.rider_application.reviewer_note', null)
            ->assertJsonMissingPath('data.restaurant_application.reviewed_by')
            ->assertJsonMissingPath('data.rider_application.reviewed_by')
            ->assertJsonMissingPath('data.restaurant_application.reference_number');

        $this->assertSame(
            ['type', 'status', 'submitted_at', 'updated_at', 'reviewer_note'],
            array_keys($response->json('data.restaurant_application')),
        );
        $this->assertSame(
            ['type', 'status', 'submitted_at', 'updated_at', 'reviewer_note'],
            array_keys($response->json('data.rider_application')),
        );
    }

    /**
     * @return array{0:int,1:int,2:int,3:int}
     */
    private function createLocationFixture(): array
    {
        $provinceId = DB::table('provinces')->insertGetId([
            'province_name' => 'Metro Manila Account Test',
        ]);

        $cityId = DB::table('cities')->insertGetId([
            'province_id' => $provinceId,
            'city_name' => 'Makati Test',
        ]);

        $barangayId = DB::table('barangays')->insertGetId([
            'city_id' => $cityId,
            'barangay_name' => 'Poblacion Test',
        ]);

        $addressId = DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '456 Test St',
            'postal_code' => '1210',
        ]);

        return [$provinceId, $cityId, $barangayId, $addressId];
    }
}
