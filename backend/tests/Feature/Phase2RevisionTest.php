<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\AddressFormatter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class Phase2RevisionTest extends TestCase
{
    use DatabaseTransactions;

    public function test_password_policy_applies_to_register_and_change_password(): void
    {
        $suffix = random_int(10000, 99999);
        $username = "p2user_{$suffix}";
        $email = "p2user_{$suffix}@example.com";

        // Rejects weak / common / username-containing passwords on register
        $this->postJson('/api/auth/register', [
            'username' => $username,
            'first_name' => 'Test',
            'last_name' => 'User',
            'email' => $email,
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])->assertStatus(422)->assertJsonValidationErrors('password');

        $this->postJson('/api/auth/register', [
            'username' => $username,
            'first_name' => 'Test',
            'last_name' => 'User',
            'email' => $email,
            'password' => "{$username}A1!",
            'password_confirmation' => "{$username}A1!",
        ])->assertStatus(422)->assertJsonValidationErrors('password');

        // Accepts strong password
        $this->postJson('/api/auth/register', [
            'username' => $username,
            'first_name' => 'Test',
            'last_name' => 'User',
            'email' => $email,
            'password' => 'SaloStrong#2026',
            'password_confirmation' => 'SaloStrong#2026',
        ])->assertCreated();

        $user = User::where('username', $username)->firstOrFail();

        // Change password enforces the same policy
        $this->actingAs($user)->putJson('/api/account/password', [
            'current_password' => 'SaloStrong#2026',
            'password' => 'weakpass',
            'password_confirmation' => 'weakpass',
        ])->assertStatus(422)->assertJsonValidationErrors('password');

        $this->actingAs($user)->putJson('/api/account/password', [
            'current_password' => 'SaloStrong#2026',
            'password' => 'NewSalo#2027',
            'password_confirmation' => 'NewSalo#2027',
        ])->assertOk();
    }

    public function test_username_availability_and_google_signup_require_user_typed_username(): void
    {
        $suffix = random_int(10000, 99999);
        $takenUsername = "taken_{$suffix}";

        DB::table('users')->insert([
            'username' => $takenUsername,
            'first_name' => 'Taken',
            'last_name' => 'User',
            'email' => "taken_{$suffix}@example.com",
            'password_hash' => Hash::make('SaloStrong#2026'),
            'user_role' => 'customer',
            'account_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->getJson("/api/auth/username-available?username={$takenUsername}")
            ->assertOk()
            ->assertJsonPath('data.valid', true)
            ->assertJsonPath('data.available', false);

        $this->getJson('/api/auth/username-available?username=bad name!')
            ->assertOk()
            ->assertJsonPath('data.valid', false)
            ->assertJsonPath('data.available', false);

        $freeUsername = "free_user_{$suffix}";
        $this->getJson("/api/auth/username-available?username={$freeUsername}")
            ->assertOk()
            ->assertJsonPath('data.valid', true)
            ->assertJsonPath('data.available', true);

        // Mock Google OAuth callback for a NEW email
        Config::set('services.google.client_id', 'test-client-id');
        Config::set('services.google.client_secret', 'test-client-secret');
        Config::set('services.google.redirect', 'http://localhost:8000/api/auth/google/callback');

        $newGoogleEmail = "google_new_{$suffix}@example.com";
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'fake-token'], 200),
            'https://openidconnect.googleapis.com/v1/userinfo' => Http::response([
                'email' => $newGoogleEmail,
                'email_verified' => true,
                'given_name' => 'Maria',
                'family_name' => 'Clara',
            ], 200),
        ]);

        $callbackRes = $this->withSession(['google_oauth_state' => 'state-123'])
            ->get('/api/auth/google/callback?state=state-123&code=code-abc');

        $callbackRes->assertRedirect();
        $this->assertStringContainsString('/google-complete', (string) $callbackRes->headers->get('Location'));
        $this->assertNull(User::where('email', $newGoogleEmail)->first(), 'User must NOT be auto-created before typing username');

        $this->getJson('/api/auth/google/pending')
            ->assertOk()
            ->assertJsonPath('data.pending.email', $newGoogleEmail);

        // Taken username rejected
        $this->postJson('/api/auth/google/complete', ['username' => $takenUsername])
            ->assertStatus(422)
            ->assertJsonValidationErrors('username');

        // Valid typed username completes signup
        $this->postJson('/api/auth/google/complete', ['username' => $freeUsername])
            ->assertCreated()
            ->assertJsonPath('data.user.username', $freeUsername);

        $this->assertNotNull(User::where('email', $newGoogleEmail)->where('username', $freeUsername)->first());
    }

    public function test_address_formatter_handles_new_and_legacy_records(): void
    {
        $newFormatted = AddressFormatter::format([
            'street' => '123 Rizal Street',
            'barangay' => 'Carmen',
            'city' => 'Cagayan de Oro City',
            'province' => 'Misamis Oriental',
            'postal_code' => '9000',
        ]);
        $this->assertSame(
            '123 Rizal Street, Brgy. Carmen, Cagayan de Oro City, Misamis Oriental 9000',
            $newFormatted,
        );

        $legacyFormatted = AddressFormatter::format((object) [
            'house_number' => '123',
            'building_name' => 'Rizal Bldg',
            'street' => 'Rizal Street',
            'barangay_name' => 'Carmen',
            'city_name' => 'Cagayan de Oro City',
            'province_name' => 'Misamis Oriental',
            'postal_code' => '9000',
        ]);
        $this->assertSame(
            '123 Rizal Bldg Rizal Street, Brgy. Carmen, Cagayan de Oro City, Misamis Oriental 9000',
            $legacyFormatted,
        );
    }
}
