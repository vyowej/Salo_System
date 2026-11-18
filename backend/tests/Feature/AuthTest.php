<?php

namespace Tests\Feature;

use App\Features\Auth\Mail\PasswordResetMail;
use App\Features\Auth\Services\PasswordResetService;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        RateLimiter::clear('auth:login:test@example.com|127.0.0.1');
    }

    public function test_register_valid_creates_customer_and_logs_in(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'username' => 'juan_delacruz',
            'first_name' => 'Juan',
            'middle_initial' => 'M',
            'last_name' => 'Dela Cruz',
            'email' => 'Juan@Example.com',
            'password' => 'SecretPass123!',
            'password_confirmation' => 'SecretPass123!',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.username', 'juan_delacruz')
            ->assertJsonPath('data.user.email', 'juan@example.com')
            ->assertJsonPath('data.user.user_role', 'customer')
            ->assertJsonPath('data.user.account_status', 'active')
            ->assertJsonPath('data.user.roles', ['customer'])
            ->assertJsonMissingPath('data.user.password_hash');

        $userRow = DB::table('users')->where('email', 'juan@example.com')->first();
        $this->assertNotNull($userRow);
        $this->assertNotSame('SecretPass123!', $userRow->password_hash);
        $this->assertTrue(Hash::check('SecretPass123!', $userRow->password_hash));
        $this->assertAuthenticated();
    }

    public function test_register_invalid_and_duplicate_rejected(): void
    {
        User::create([
            'username' => 'existing_user',
            'first_name' => 'Maria',
            'last_name' => 'Santos',
            'email' => 'maria@example.com',
            'password_hash' => Hash::make('Password123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $duplicate = $this->postJson('/api/auth/register', [
            'username' => 'existing_user',
            'first_name' => 'Maria',
            'last_name' => 'Santos',
            'email' => 'maria@example.com',
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
        ]);

        $duplicate->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['success', 'message', 'errors' => ['username', 'email']])
            ->assertJsonMissing(['trace', 'exception']);

        $invalid = $this->postJson('/api/auth/register', [
            'username' => 'ab',
            'first_name' => '',
            'last_name' => '',
            'email' => 'not-an-email',
            'password' => 'short',
            'password_confirmation' => 'mismatch',
        ]);

        $invalid->assertStatus(422)
            ->assertJsonStructure(['errors' => ['username', 'first_name', 'last_name', 'email', 'password']]);
    }

    public function test_register_middle_initial_validation_and_normalization(): void
    {
        // 1. Valid lowercase single letter -> uppercased and stored
        $validResponse = $this->postJson('/api/auth/register', [
            'username' => 'mi_valid_user',
            'first_name' => 'Cassidy',
            'middle_initial' => 'd',
            'last_name' => 'Santos',
            'email' => 'mi_valid@example.com',
            'password' => 'SecretPass123!',
            'password_confirmation' => 'SecretPass123!',
        ]);

        $validResponse->assertStatus(201)
            ->assertJsonPath('data.user.first_name', 'Cassidy')
            ->assertJsonPath('data.user.middle_initial', 'D')
            ->assertJsonPath('data.user.last_name', 'Santos');

        $this->assertDatabaseHas('users', [
            'username' => 'mi_valid_user',
            'middle_initial' => 'D',
        ]);

        // 2. Empty string / null -> allowed and stored as null
        $emptyResponse = $this->postJson('/api/auth/register', [
            'username' => 'mi_empty_user',
            'first_name' => 'Mateo',
            'middle_initial' => '',
            'last_name' => 'Reyes',
            'email' => 'mi_empty@example.com',
            'password' => 'SecretPass123!',
            'password_confirmation' => 'SecretPass123!',
        ]);

        $emptyResponse->assertStatus(201)
            ->assertJsonPath('data.user.middle_initial', null);

        $this->assertDatabaseHas('users', [
            'username' => 'mi_empty_user',
            'middle_initial' => null,
        ]);

        // 3. Two characters -> rejected (422)
        $twoCharResponse = $this->postJson('/api/auth/register', [
            'username' => 'mi_twochar_user',
            'first_name' => 'Elena',
            'middle_initial' => 'AB',
            'last_name' => 'Cruz',
            'email' => 'mi_twochar@example.com',
            'password' => 'SecretPass123!',
            'password_confirmation' => 'SecretPass123!',
        ]);

        $twoCharResponse->assertStatus(422)
            ->assertJsonStructure(['errors' => ['middle_initial']]);

        // 4. Digit -> rejected (422)
        $digitResponse = $this->postJson('/api/auth/register', [
            'username' => 'mi_digit_user',
            'first_name' => 'Marco',
            'middle_initial' => '7',
            'last_name' => 'Lim',
            'email' => 'mi_digit@example.com',
            'password' => 'SecretPass123!',
            'password_confirmation' => 'SecretPass123!',
        ]);

        $digitResponse->assertStatus(422)
            ->assertJsonStructure(['errors' => ['middle_initial']]);
    }

    public function test_register_cannot_self_assign_admin_role(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'username' => 'sneaky_user',
            'first_name' => 'Sneaky',
            'last_name' => 'User',
            'email' => 'sneaky@example.com',
            'password' => 'SecretPass123!',
            'password_confirmation' => 'SecretPass123!',
            'user_role' => 'admin',
            'role' => 'admin',
            'account_status' => 'suspended',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.user.user_role', 'customer')
            ->assertJsonPath('data.user.capabilities.is_admin', false);

        $this->assertDatabaseHas('users', [
            'username' => 'sneaky_user',
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);
    }

    public function test_login_success_regenerates_session_and_failure_returns_generic_401(): void
    {
        User::create([
            'username' => 'login_user',
            'first_name' => 'Ana',
            'last_name' => 'Reyes',
            'email' => 'ana@example.com',
            'password_hash' => Hash::make('CorrectHorse123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        // Wrong password and non-existent email return the exact same 401 message
        $wrongPass = $this->postJson('/api/auth/login', [
            'email' => 'ana@example.com',
            'password' => 'WrongPassword!',
        ]);
        $unknownEmail = $this->postJson('/api/auth/login', [
            'email' => 'nobody@example.com',
            'password' => 'WrongPassword!',
        ]);

        $wrongPass->assertStatus(401)->assertJsonPath('message', 'Invalid credentials.');
        $unknownEmail->assertStatus(401)->assertJsonPath('message', 'Invalid credentials.');

        $this->startSession();
        $oldSessionId = session()->getId();

        $success = $this->postJson('/api/auth/login', [
            'email' => 'ana@example.com',
            'password' => 'CorrectHorse123!',
        ]);

        $success->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.username', 'login_user')
            ->assertJsonMissingPath('data.user.password_hash');

        $this->assertNotSame($oldSessionId, session()->getId());
    }

    public function test_login_rate_limiting_blocks_after_max_attempts(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', [
                'email' => 'ratelimit@example.com',
                'password' => 'WrongPass123!',
            ])->assertStatus(401);
        }

        $this->postJson('/api/auth/login', [
            'email' => 'ratelimit@example.com',
            'password' => 'WrongPass123!',
        ])->assertStatus(429)
            ->assertJsonPath('success', false);
    }

    public function test_logout_invalidates_session(): void
    {
        $user = User::create([
            'username' => 'logout_user',
            'first_name' => 'Carlo',
            'last_name' => 'Diaz',
            'email' => 'carlo@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $this->actingAs($user, 'web');
        $this->getJson('/api/auth/me')->assertStatus(200);

        $this->postJson('/api/auth/logout')
            ->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertGuest('web');
        $this->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_me_returns_user_and_all_derived_roles(): void
    {
        $user = User::create([
            'username' => 'multi_role_user',
            'first_name' => 'Elena',
            'last_name' => 'Cruz',
            'email' => 'elena@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        [, $cityId, , $addressId] = $this->createLocationFixture();

        $ownedRestaurantId = DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Elena Kitchen',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'kitchen@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
        ]);

        $staffRestaurantId = DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Bistro Manila',
            'business_type' => 'cafe',
            'ownership_structure' => 'corporation',
            'business_email' => 'bistro@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $ownedRestaurantId,
            'user_id' => $user->user_id,
        ]);

        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $staffRestaurantId,
            'user_id' => $user->user_id,
            'staff_position' => 'Order Manager',
            'staff_status' => 'active',
            'joined_at' => now(),
        ]);

        DB::table('riders')->insert([
            'user_id' => $user->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Pedro Cruz',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09171234567',
            'base_city_id' => $cityId,
            'rider_status' => 'active',
            'approved_at' => now(),
        ]);

        $this->actingAs($user, 'web');

        $response = $this->getJson('/api/auth/me');

        $response->assertStatus(200)
            ->assertJsonPath('data.user.roles', ['customer', 'owner', 'staff', 'rider'])
            ->assertJsonPath('data.user.capabilities.is_customer', true)
            ->assertJsonPath('data.user.capabilities.is_admin', false)
            ->assertJsonPath('data.user.capabilities.is_restaurant_owner', true)
            ->assertJsonPath('data.user.capabilities.is_restaurant_staff', true)
            ->assertJsonPath('data.user.capabilities.is_rider', true)
            ->assertJsonPath('data.user.restaurant_ownerships.0.restaurant_name', 'Elena Kitchen')
            ->assertJsonPath('data.user.restaurant_staff_assignments.0.staff_position', 'Order Manager')
            ->assertJsonPath('data.user.rider_profile.vehicle_type', 'bicycle')
            ->assertJsonMissingPath('data.user.password_hash');
    }

    public function test_csrf_required_on_state_changing_post_requests(): void
    {
        $csrfResponse = $this->getJson('/api/auth/csrf');
        $csrfResponse->assertStatus(200)
            ->assertJsonStructure(['success', 'message', 'data' => ['csrf_token']])
            ->assertCookie('XSRF-TOKEN');

        $token = $csrfResponse->json('data.csrf_token');

        User::create([
            'username' => 'csrf_user',
            'first_name' => 'Csrf',
            'last_name' => 'Tester',
            'email' => 'csrf@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $previousEnv = $this->app['env'];
        try {
            // Set env to 'local' so PreventRequestForgery does not skip verification via runningUnitTests()
            $this->app['env'] = 'local';

            $withoutCsrf = $this->postJson('/api/auth/login', [
                'email' => 'csrf@example.com',
                'password' => 'SecretPass123!',
            ]);
            $withoutCsrf->assertStatus(419)
                ->assertJsonPath('success', false)
                ->assertJsonPath('message', 'CSRF token mismatch.');

            $withCsrf = $this->withHeader('X-CSRF-TOKEN', $token)
                ->postJson('/api/auth/login', [
                    'email' => 'csrf@example.com',
                    'password' => 'SecretPass123!',
                ]);
            $withCsrf->assertStatus(200)
                ->assertJsonPath('success', true);
        } finally {
            $this->app['env'] = $previousEnv;
        }
    }

    public function test_suspended_or_inactive_account_blocked_on_login_and_authenticated_requests(): void
    {
        foreach (['suspended', 'inactive', 'pending'] as $blockedStatus) {
            User::create([
                'username' => "user_{$blockedStatus}",
                'first_name' => 'Blocked',
                'last_name' => ucfirst($blockedStatus),
                'email' => "{$blockedStatus}@example.com",
                'password_hash' => Hash::make('SecretPass123!'),
                'user_role' => 'customer',
                'account_status' => $blockedStatus,
            ]);

            $this->postJson('/api/auth/login', [
                'email' => "{$blockedStatus}@example.com",
                'password' => 'SecretPass123!',
            ])->assertStatus(403)
                ->assertJsonPath('message', 'Account is not active.');
        }

        // Already-authenticated user suspended mid-session is immediately rejected
        $activeUser = User::create([
            'username' => 'mid_session_user',
            'first_name' => 'Active',
            'last_name' => 'User',
            'email' => 'midsession@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $this->actingAs($activeUser, 'web');
        $this->getJson('/api/auth/me')->assertStatus(200);

        DB::table('users')
            ->where('user_id', $activeUser->user_id)
            ->update(['account_status' => 'suspended']);

        $this->getJson('/api/auth/me')
            ->assertStatus(403)
            ->assertJsonPath('message', 'Account is not active.');

        $this->assertGuest('web');
    }

    public function test_role_middleware_permits_and_denies_each_role(): void
    {
        $customer = User::create([
            'username' => 'only_customer',
            'first_name' => 'Cust',
            'last_name' => 'Omer',
            'email' => 'cust@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $admin = User::create([
            'username' => 'only_admin',
            'first_name' => 'Ad',
            'last_name' => 'Min',
            'email' => 'admin@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'admin',
            'account_status' => 'active',
        ]);

        $owner = User::create([
            'username' => 'only_owner',
            'first_name' => 'Own',
            'last_name' => 'Er',
            'email' => 'owner@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $staff = User::create([
            'username' => 'only_staff',
            'first_name' => 'Sta',
            'last_name' => 'Ff',
            'email' => 'staff@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $rider = User::create([
            'username' => 'only_rider',
            'first_name' => 'Ri',
            'last_name' => 'Der',
            'email' => 'rider@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        [, $cityId, , $addressId] = $this->createLocationFixture();

        $restaurantId = DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Role Test Resto',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'roletest@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
        ]);

        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $staff->user_id,
            'staff_position' => 'Cashier',
            'staff_status' => 'active',
            'joined_at' => now(),
        ]);

        DB::table('riders')->insert([
            'user_id' => $rider->user_id,
            'vehicle_type' => 'walking',
            'emergency_contact_name' => 'Contact',
            'emergency_contact_relationship' => 'sibling',
            'emergency_contact_phone' => '09180000000',
            'base_city_id' => $cityId,
            'rider_status' => 'active',
            'approved_at' => now(),
        ]);

        // Customer: permitted on customer, denied on admin/owner/staff/rider
        $this->actingAs($customer, 'web');
        $this->getJson('/api/test/role-check/customer')->assertStatus(200);
        $this->getJson('/api/test/role-check/admin')->assertStatus(403);
        $this->getJson('/api/test/role-check/owner')->assertStatus(403);
        $this->getJson('/api/test/role-check/staff')->assertStatus(403);
        $this->getJson('/api/test/role-check/rider')->assertStatus(403);

        // Admin: permitted on admin (and customer), denied on owner/staff/rider
        $this->actingAs($admin, 'web');
        $this->getJson('/api/test/role-check/admin')->assertStatus(200);
        $this->getJson('/api/test/role-check/owner')->assertStatus(403);
        $this->getJson('/api/test/role-check/staff')->assertStatus(403);
        $this->getJson('/api/test/role-check/rider')->assertStatus(403);

        // Owner: permitted on owner, denied on admin/staff/rider
        $this->actingAs($owner, 'web');
        $this->getJson('/api/test/role-check/owner')->assertStatus(200);
        $this->getJson('/api/test/role-check/admin')->assertStatus(403);
        $this->getJson('/api/test/role-check/staff')->assertStatus(403);
        $this->getJson('/api/test/role-check/rider')->assertStatus(403);

        // Staff: permitted on staff, denied on admin/owner/rider
        $this->actingAs($staff, 'web');
        $this->getJson('/api/test/role-check/staff')->assertStatus(200);
        $this->getJson('/api/test/role-check/admin')->assertStatus(403);
        $this->getJson('/api/test/role-check/owner')->assertStatus(403);
        $this->getJson('/api/test/role-check/rider')->assertStatus(403);

        // Rider: permitted on rider, denied on admin/owner/staff
        $this->actingAs($rider, 'web');
        $this->getJson('/api/test/role-check/rider')->assertStatus(200);
        $this->getJson('/api/test/role-check/admin')->assertStatus(403);
        $this->getJson('/api/test/role-check/owner')->assertStatus(403);
        $this->getJson('/api/test/role-check/staff')->assertStatus(403);
    }

    public function test_password_reset_token_hashed_single_use_and_expiry_rules(): void
    {
        Mail::fake();

        $user = User::create([
            'username' => 'reset_user',
            'first_name' => 'Rosa',
            'last_name' => 'Lim',
            'email' => 'rosa@example.com',
            'password_hash' => Hash::make('OldPassword123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        // 1. Unknown email: nothing sent, generic 200 response
        $forgotUnknown = $this->postJson('/api/auth/password/forgot', ['email' => 'unknown@example.com']);
        $forgotUnknown->assertStatus(200)->assertJsonPath('data', null);
        Mail::assertNothingSent();

        // 2. Existing active user: email sent, identical generic 200 response, no token in API response
        $forgotExisting = $this->postJson('/api/auth/password/forgot', ['email' => 'rosa@example.com']);
        $forgotExisting->assertStatus(200)->assertJsonPath('data', null);
        $this->assertSame($forgotUnknown->json(), $forgotExisting->json());

        $extractedPlainToken = null;
        Mail::assertSent(PasswordResetMail::class, function (PasswordResetMail $mail) use ($user, &$extractedPlainToken): bool {
            if (! $mail->hasTo($user->email)) {
                return false;
            }

            $parsedQuery = [];
            parse_str((string) parse_url($mail->resetUrl, PHP_URL_QUERY), $parsedQuery);
            $extractedPlainToken = $parsedQuery['token'] ?? null;

            $renderedText = $mail->render();

            return is_string($extractedPlainToken)
                && strlen($extractedPlainToken) === 64
                && ($parsedQuery['email'] ?? null) === $user->email
                && str_starts_with($mail->resetUrl, 'http://localhost:5173/reset-password?')
                && str_contains($renderedText, $mail->resetUrl)
                && str_contains($renderedText, '60 minutes');
        });

        $this->assertNotNull($extractedPlainToken);

        // Token in DB is hashed and matches the plain token extracted from the email link
        $storedToken = DB::table('password_reset_tokens')->where('user_id', $user->user_id)->first();
        $this->assertNotNull($storedToken);
        $this->assertNotSame($extractedPlainToken, $storedToken->token_hash);
        $this->assertStringStartsWith('$2y$', $storedToken->token_hash);
        $this->assertTrue(Hash::check($extractedPlainToken, $storedToken->token_hash));

        // 3. Valid reset using the token from the email link succeeds
        $this->postJson('/api/auth/password/reset', [
            'email' => 'rosa@example.com',
            'token' => $extractedPlainToken,
            'password' => 'NewPassword456!',
            'password_confirmation' => 'NewPassword456!',
        ])->assertStatus(200);

        $this->assertTrue(Hash::check('NewPassword456!', $user->fresh()->password_hash));

        // 4. Reusing the same token fails (single-use)
        $this->postJson('/api/auth/password/reset', [
            'email' => 'rosa@example.com',
            'token' => $extractedPlainToken,
            'password' => 'AnotherPass789!',
            'password_confirmation' => 'AnotherPass789!',
        ])->assertStatus(400)
            ->assertJsonPath('message', 'Invalid or expired password reset token.');

        // 5. Expired token fails
        $service = app(PasswordResetService::class);
        $expiredToken = $service->createTokenForUser($user);
        DB::table('password_reset_tokens')
            ->where('user_id', $user->user_id)
            ->update(['expires_at' => Carbon::now('UTC')->subMinutes(5)->toDateTimeString()]);

        $this->postJson('/api/auth/password/reset', [
            'email' => 'rosa@example.com',
            'token' => $expiredToken,
            'password' => 'ExpiredPass789!',
            'password_confirmation' => 'ExpiredPass789!',
        ])->assertStatus(400)
            ->assertJsonPath('message', 'Invalid or expired password reset token.');
    }

    public function test_bootstrap_admin_command_creates_first_admin_and_refuses_second_run(): void
    {
        $this->artisan('salo:bootstrap-admin')
            ->expectsQuestion('First name', 'System')
            ->expectsQuestion('Last name', 'Administrator')
            ->expectsQuestion('Username', 'superadmin')
            ->expectsQuestion('Email address', 'superadmin@salo.local')
            ->expectsQuestion('Password (minimum 8 characters)', 'StrongAdminPass123!')
            ->expectsQuestion('Confirm password', 'StrongAdminPass123!')
            ->assertExitCode(0);

        $admin = User::where('username', 'superadmin')->first();
        $this->assertNotNull($admin);
        $this->assertSame('admin', $admin->user_role);
        $this->assertSame('active', $admin->account_status);
        $this->assertNotNull($admin->email_verified_at);
        $this->assertTrue(Hash::check('StrongAdminPass123!', $admin->password_hash));

        $this->assertDatabaseHas('audit_logs', [
            'actor_user_id' => null,
            'action' => 'bootstrap_admin',
            'entity_type' => 'user',
            'entity_id' => (string) $admin->user_id,
        ]);

        // Second run must refuse immediately when an admin already exists
        $this->artisan('salo:bootstrap-admin')
            ->expectsOutputToContain('Bootstrap aborted: an administrator account already exists.')
            ->assertExitCode(1);
    }

    /**
     * @return array{0:int,1:int,2:int,3:int}
     */
    private function createLocationFixture(): array
    {
        $provinceId = DB::table('provinces')->insertGetId([
            'province_name' => 'Metro Manila Test',
        ]);

        $cityId = DB::table('cities')->insertGetId([
            'province_id' => $provinceId,
            'city_name' => 'Quezon City Test',
        ]);

        $barangayId = DB::table('barangays')->insertGetId([
            'city_id' => $cityId,
            'barangay_name' => 'Diliman Test',
        ]);

        $addressId = DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '123 Test Ave',
            'postal_code' => '1101',
        ]);

        return [$provinceId, $cityId, $barangayId, $addressId];
    }
}
