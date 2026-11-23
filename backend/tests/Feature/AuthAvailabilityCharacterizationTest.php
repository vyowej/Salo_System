<?php

namespace Tests\Feature;

use App\Features\Auth\Mail\EmailOtpMail;
use App\Features\Auth\Services\OtpService;
use App\Features\Restaurants\Services\AvailabilityService;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class AuthAvailabilityCharacterizationTest extends TestCase
{
    use DatabaseTransactions;

    private function makeUser(string $email = null): User
    {
        $suffix = random_int(10000, 99999);

        return User::forceCreate([
            'username' => 'authav_' . $suffix,
            'first_name' => 'Auth',
            'last_name' => 'Avail',
            'email' => $email ?? "authav_{$suffix}@example.com",
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);
    }

    public function test_availability_service_handles_manila_timezone_overnight_spillover_and_closures(): void
    {
        $service = app(AvailabilityService::class);
        $restaurant = (object) [
            'accepting_orders' => 1,
            'accepts_reservations' => 1,
            'accepting_reservations' => 0,
        ];

        // Friday (dayOfWeek = 5) 22:00 - 02:00 (closes_next_day = 1)
        // Saturday (dayOfWeek = 6) 10:00 - 14:00 (closes_next_day = 0)
        $hours = collect([
            (object) [
                'day_of_week' => 5,
                'opening_time' => '22:00:00',
                'closing_time' => '02:00:00',
                'closes_next_day' => 1,
                'is_closed' => 0,
            ],
            (object) [
                'day_of_week' => 6,
                'opening_time' => '10:00:00',
                'closing_time' => '14:00:00',
                'closes_next_day' => 0,
                'is_closed' => 0,
            ],
        ]);

        // 2026-11-21 is Saturday. 01:30 Manila = 2026-11-20 17:30 UTC -> open from Friday's overnight shift
        $satEarlyUtc = Carbon::create(2026, 11, 20, 17, 30, 0, 'UTC');
        $earlyResult = $service->compute($restaurant, $hours, collect(), $satEarlyUtc);
        $this->assertTrue($earlyResult['is_open']);
        $this->assertSame('Open', $earlyResult['status_label']);
        $this->assertTrue($earlyResult['accepting_orders']);
        $this->assertFalse($earlyResult['accepting_reservations']);
        $this->assertFalse($earlyResult['not_accepting_orders']);
        $this->assertTrue($earlyResult['not_accepting_reservations']);
        $this->assertFalse($earlyResult['temporarily_unavailable']);
        $this->assertNull($earlyResult['closure_reason']);

        // Yesterday (Friday 2026-11-20) closure blocks Saturday 01:30 spillover
        $yesterdayClosure = collect([
            (object) ['closure_date' => '2026-11-20', 'reason' => 'Friday maintenance'],
        ]);
        $blockedSpillover = $service->compute($restaurant, $hours, $yesterdayClosure, $satEarlyUtc);
        $this->assertFalse($blockedSpillover['is_open']);
        $this->assertFalse($blockedSpillover['temporarily_unavailable']);

        // Same-day exact closing boundary (14:00:00 Manila) is exclusive -> Closed
        $satCloseBoundary = Carbon::create(2026, 11, 21, 14, 0, 0, AvailabilityService::TIMEZONE);
        $closedAtEnd = $service->compute($restaurant, $hours, collect(), $satCloseBoundary);
        $this->assertFalse($closedAtEnd['is_open']);
        $this->assertSame('Closed', $closedAtEnd['status_label']);

        // Today closure overrides open period
        $satOpen = Carbon::create(2026, 11, 21, 11, 0, 0, AvailabilityService::TIMEZONE);
        $todayClosure = collect([
            (object) ['closure_date' => '2026-11-21', 'reason' => 'Holiday'],
        ]);
        $closedToday = $service->compute($restaurant, $hours, $todayClosure, $satOpen);
        $this->assertFalse($closedToday['is_open']);
        $this->assertTrue($closedToday['temporarily_unavailable']);
        $this->assertSame('Holiday', $closedToday['closure_reason']);
    }

    public function test_otp_service_send_cooldown_retry_lockout_and_single_use_verification(): void
    {
        Cache::flush();
        Mail::fake();

        $user = $this->makeUser();
        $this->assertNull($user->email_verified_at);

        $otpService = app(OtpService::class);
        $request = Request::create('/api/otp/send', 'POST', [], [], [], ['REMOTE_ADDR' => '127.0.0.1']);

        // 1. Send OTP and capture code from EmailOtpMail
        $sendResult = $otpService->send('  ' . strtoupper($user->email) . '  ', 'email_verification', $user, $request);
        $this->assertSame(strtolower($user->email), $sendResult['email']);
        $this->assertSame('email_verification', $sendResult['purpose']);
        $this->assertGreaterThan(0, $sendResult['expires_in_seconds']);
        $this->assertGreaterThanOrEqual(10, $sendResult['cooldown_seconds']);

        $sentCode = null;
        Mail::assertSent(EmailOtpMail::class, function (EmailOtpMail $mail) use (&$sentCode, $user): bool {
            $sentCode = $mail->otpCode;

            return $mail->hasTo(strtolower($user->email));
        });
        $this->assertNotNull($sentCode);

        $this->assertDatabaseHas('audit_logs', [
            'actor_user_id' => $user->user_id,
            'action' => 'email_otp_sent',
        ]);

        // 2. Immediate resend hits cooldown ThrottleRequestsException
        try {
            $otpService->send($user->email, 'email_verification', $user, $request);
            $this->fail('Expected ThrottleRequestsException during cooldown.');
        } catch (ThrottleRequestsException $e) {
            $this->assertStringContainsString('Please wait', $e->getMessage());
        }

        // 3. Wrong code decrements remaining attempts
        try {
            $otpService->verify($user->email, 'email_verification', '000000' === $sentCode ? '111111' : '000000', $user, $request);
            $this->fail('Expected ValidationException for wrong OTP.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('code', $e->errors());
            $this->assertStringContainsString('attempt(s) remaining', $e->errors()['code'][0]);
        }

        // 4. Correct code verifies, marks user email_verified_at, writes audit log, and is single-use
        $verifyResult = $otpService->verify($user->email, 'email_verification', $sentCode, $user, $request);
        $this->assertTrue($verifyResult['verified']);
        $this->assertSame(strtolower($user->email), $verifyResult['email']);
        $this->assertNotNull($user->fresh()->email_verified_at);

        $this->assertDatabaseHas('audit_logs', [
            'actor_user_id' => $user->user_id,
            'action' => 'email_otp_verified',
        ]);

        // Single-use: second verify fails
        $this->expectException(ValidationException::class);
        $otpService->verify($user->email, 'email_verification', $sentCode, $user, $request);
    }
}
