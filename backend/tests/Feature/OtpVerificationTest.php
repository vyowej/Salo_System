<?php

namespace Tests\Feature;

use App\Features\Auth\Mail\EmailOtpMail;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
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
        return User::forceCreate([
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

    public function test_otp_audit_logs_avoid_duplicates_and_omit_fake_value_changes(): void
    {
        Mail::fake();
        $user = $this->createCustomer('auditcheck@example.com');

        // 1. Single send creates exactly 1 email_otp_sent log without old/new values or OTP code.
        $this->actingAs($user)->postJson('/api/otp/send', [
            'email' => 'auditcheck@example.com',
            'purpose' => 'rider_application',
        ])->assertOk();

        $sentCode = null;
        Mail::assertSent(EmailOtpMail::class, function (EmailOtpMail $mail) use (&$sentCode) {
            $sentCode = $mail->otpCode;

            return true;
        });

        $logs = DB::table('audit_logs')
            ->where('actor_user_id', $user->user_id)
            ->where('action', 'email_otp_sent')
            ->get();

        $this->assertCount(1, $logs);
        $this->assertNull($logs[0]->old_values);
        $this->assertNull($logs[0]->new_values);
        $this->assertStringContainsString('rider_application', (string) $logs[0]->reason);
        $this->assertStringNotContainsString((string) $sentCode, (string) $logs[0]->reason);

        // 2. Concurrent lock held blocks duplicate send & prevents duplicate audit log.
        $lockKey = 'otp:send-lock:rider_application:'.$user->user_id.':'.sha1('auditcheck@example.com');
        $heldLock = Cache::lock($lockKey, 10);
        $this->assertTrue($heldLock->get());
        try {
            $this->actingAs($user)->postJson('/api/otp/send', [
                'email' => 'auditcheck@example.com',
                'purpose' => 'rider_application',
            ])->assertStatus(429);
        } finally {
            $heldLock->release();
        }

        $this->assertSame(
            1,
            DB::table('audit_logs')
                ->where('actor_user_id', $user->user_id)
                ->where('action', 'email_otp_sent')
                ->count(),
        );

        // 3. Legitimate resend after cooldown expires logs a second distinct audit record.
        Cache::forget('otp:cooldown:rider_application:'.$user->user_id.':'.sha1('auditcheck@example.com'));
        $this->actingAs($user)->postJson('/api/otp/send', [
            'email' => 'auditcheck@example.com',
            'purpose' => 'rider_application',
        ])->assertOk();

        $this->assertSame(
            2,
            DB::table('audit_logs')
                ->where('actor_user_id', $user->user_id)
                ->where('action', 'email_otp_sent')
                ->count(),
        );
    }

    public function test_otp_verify_audit_logs_only_record_real_email_verified_at_changes(): void
    {
        Mail::fake();
        $user = $this->createCustomer('verifyaudit@example.com');

        // 1. Account email starts unverified -> verify records real old/new email_verified_at change.
        $this->actingAs($user)->postJson('/api/otp/send', [
            'email' => 'verifyaudit@example.com',
            'purpose' => 'rider_application',
        ])->assertOk();

        $firstCode = null;
        Mail::assertSent(EmailOtpMail::class, function (EmailOtpMail $mail) use (&$firstCode) {
            $firstCode = $mail->otpCode;

            return true;
        });

        $this->actingAs($user)->postJson('/api/otp/verify', [
            'email' => 'verifyaudit@example.com',
            'purpose' => 'rider_application',
            'code' => $firstCode,
        ])->assertOk();

        $firstVerifyLog = DB::table('audit_logs')
            ->where('actor_user_id', $user->user_id)
            ->where('action', 'email_otp_verified')
            ->orderByDesc('log_id')
            ->first();

        $this->assertNotNull($firstVerifyLog);
        $this->assertSame(['email_verified_at' => null], json_decode((string) $firstVerifyLog->old_values, true));
        $newDecoded = json_decode((string) $firstVerifyLog->new_values, true);
        $this->assertIsArray($newDecoded);
        $this->assertNotEmpty($newDecoded['email_verified_at'] ?? null);
        $this->assertStringNotContainsString((string) $firstCode, (string) $firstVerifyLog->reason);

        // 2. Verifying a separate contact email does not modify users.email_verified_at -> no fake old/new values.
        Mail::fake();
        $this->actingAs($user)->postJson('/api/otp/send', [
            'email' => 'altcontact@example.com',
            'purpose' => 'restaurant_application',
        ])->assertOk();

        $secondCode = null;
        Mail::assertSent(EmailOtpMail::class, function (EmailOtpMail $mail) use (&$secondCode) {
            $secondCode = $mail->otpCode;

            return true;
        });

        $this->actingAs($user)->postJson('/api/otp/verify', [
            'email' => 'altcontact@example.com',
            'purpose' => 'restaurant_application',
            'code' => $secondCode,
        ])->assertOk();

        $secondVerifyLog = DB::table('audit_logs')
            ->where('actor_user_id', $user->user_id)
            ->where('action', 'email_otp_verified')
            ->orderByDesc('log_id')
            ->first();

        $this->assertNotNull($secondVerifyLog);
        $this->assertNull($secondVerifyLog->old_values);
        $this->assertNull($secondVerifyLog->new_values);
        $this->assertStringContainsString('restaurant_application', (string) $secondVerifyLog->reason);
        $this->assertStringNotContainsString((string) $secondCode, (string) $secondVerifyLog->reason);
    }
}
