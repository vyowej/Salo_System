<?php

namespace Tests\Feature;

use App\Features\Auth\Mail\EmailOtpMail;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class OtpVerificationTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    private function createCustomer(string $email = 'otpuser@example.com'): User
    {
        return User::create([
            'username' => 'otp_user_'.random_int(100, 999),
            'first_name' => 'Otp',
            'last_name' => 'Tester',
            'email' => $email,
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);
    }

    public function test_send_and_verify_otp_succeeds_and_prevents_reuse(): void
    {
        Mail::fake();
        $user = $this->createCustomer();

        $sendResponse = $this->actingAs($user)->postJson('/api/otp/send', [
            'email' => 'otpuser@example.com',
            'purpose' => 'rider_application',
        ]);

        $sendResponse->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.email', 'otpuser@example.com');

        $sentCode = null;
        Mail::assertSent(EmailOtpMail::class, function (EmailOtpMail $mail) use (&$sentCode) {
            $sentCode = $mail->otpCode;

            return $mail->hasTo('otpuser@example.com');
        });

        $this->assertNotNull($sentCode);

        $verifyResponse = $this->actingAs($user)->postJson('/api/otp/verify', [
            'email' => 'otpuser@example.com',
            'purpose' => 'rider_application',
            'code' => $sentCode,
        ]);

        $verifyResponse->assertOk()
            ->assertJsonPath('data.verified', true);

        $this->assertNotNull($user->fresh()->email_verified_at);

        // Reuse of the same OTP must be rejected.
        $reuseResponse = $this->actingAs($user)->postJson('/api/otp/verify', [
            'email' => 'otpuser@example.com',
            'purpose' => 'rider_application',
            'code' => $sentCode,
        ]);

        $reuseResponse->assertStatus(422);
    }

    public function test_resend_cooldown_and_attempt_limit_enforced(): void
    {
        Mail::fake();
        $user = $this->createCustomer('cooldown@example.com');

        $this->actingAs($user)->postJson('/api/otp/send', [
            'email' => 'cooldown@example.com',
            'purpose' => 'restaurant_application',
        ])->assertOk();

        // Immediate resend is blocked by cooldown.
        $this->actingAs($user)->postJson('/api/otp/send', [
            'email' => 'cooldown@example.com',
            'purpose' => 'restaurant_application',
        ])->assertStatus(429);

        // 5 wrong attempts invalidate the OTP.
        for ($i = 1; $i <= 4; $i++) {
            $this->actingAs($user)->postJson('/api/otp/verify', [
                'email' => 'cooldown@example.com',
                'purpose' => 'restaurant_application',
                'code' => '000000',
            ])->assertStatus(422);
        }

        $this->actingAs($user)->postJson('/api/otp/verify', [
            'email' => 'cooldown@example.com',
            'purpose' => 'restaurant_application',
            'code' => '000000',
        ])->assertStatus(429);
    }
}
