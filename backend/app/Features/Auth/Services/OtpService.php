<?php

namespace App\Features\Auth\Services;

use App\Features\Auth\Mail\EmailOtpMail;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class OtpService
{
    public const PURPOSES = [
        'restaurant_application',
        'rider_application',
        'email_verification',
    ];

    private const MAX_HOURLY_SENDS = 10;

    private const HOURLY_DECAY_SECONDS = 3600;

    /**
     * Generate, store, and email an OTP verification code.
     *
     * @return array<string, mixed>
     */
    public function send(string $email, string $purpose, User $user, Request $request): array
    {
        $normalizedEmail = $this->normalizeEmail($email);
        $cooldownSeconds = max(10, (int) config('salo.otp.resend_cooldown_seconds', 60));
        $expirationMinutes = max(1, (int) config('salo.otp.expiration_minutes', 10));
        $length = max(4, min(8, (int) config('salo.otp.length', 6)));

        $cooldownKey = $this->cooldownKey($purpose, $normalizedEmail, $user->user_id);
        $cooldownExpiresAt = Cache::get($cooldownKey);
        if (is_int($cooldownExpiresAt) && $cooldownExpiresAt > now()->timestamp) {
            $retryAfter = $cooldownExpiresAt - now()->timestamp;
            throw new ThrottleRequestsException("Please wait {$retryAfter} seconds before requesting another code.");
        }

        $hourlyKey = "otp:hourly:{$user->user_id}|{$request->ip()}";
        if (RateLimiter::tooManyAttempts($hourlyKey, self::MAX_HOURLY_SENDS)) {
            throw new ThrottleRequestsException('Too many verification code requests. Please try again later.');
        }

        $maxNumber = (10 ** $length) - 1;
        $code = str_pad((string) random_int(0, $maxNumber), $length, '0', STR_PAD_LEFT);
        $expiresAt = now()->addMinutes($expirationMinutes);

        Cache::put($this->pendingKey($purpose, $normalizedEmail, $user->user_id), [
            'hash' => Hash::make($code),
            'attempts' => 0,
            'expires_at' => $expiresAt->timestamp,
            'user_id' => (int) $user->user_id,
        ], $expiresAt);

        // Clear any prior verified flag for this email/purpose when a new OTP is requested.
        Cache::forget($this->verifiedKey($purpose, $normalizedEmail, $user->user_id));

        Cache::put($cooldownKey, now()->addSeconds($cooldownSeconds)->timestamp, $cooldownSeconds);
        RateLimiter::hit($hourlyKey, self::HOURLY_DECAY_SECONDS);

        Mail::to($normalizedEmail)->send(new EmailOtpMail(
            otpCode: $code,
            purpose: $purpose,
            expirationMinutes: $expirationMinutes,
        ));

        DB::table('audit_logs')->insert([
            'actor_user_id' => $user->user_id,
            'action' => 'email_otp_sent',
            'entity_type' => 'users',
            'entity_id' => (string) $user->user_id,
            'new_values' => json_encode(['email' => $normalizedEmail, 'purpose' => $purpose]),
            'ip_address' => $request->ip(),
            'created_at' => now(),
        ]);

        return [
            'email' => $normalizedEmail,
            'purpose' => $purpose,
            'expires_in_seconds' => $expirationMinutes * 60,
            'cooldown_seconds' => $cooldownSeconds,
        ];
    }

    /**
     * Validate a submitted OTP code and persist verification status.
     *
     * @return array<string, mixed>
     */
    public function verify(string $email, string $purpose, string $code, User $user, Request $request): array
    {
        $normalizedEmail = $this->normalizeEmail($email);
        $maxAttempts = max(1, (int) config('salo.otp.max_attempts', 5));
        $pendingKey = $this->pendingKey($purpose, $normalizedEmail, $user->user_id);

        $record = Cache::get($pendingKey);
        if (! is_array($record) || ! isset($record['hash'], $record['expires_at'])) {
            throw ValidationException::withMessages([
                'code' => ['Verification code has expired or was not found. Please request a new code.'],
            ]);
        }

        if ((int) $record['expires_at'] < now()->timestamp) {
            Cache::forget($pendingKey);
            throw ValidationException::withMessages([
                'code' => ['Verification code has expired. Please request a new code.'],
            ]);
        }

        $attempts = (int) ($record['attempts'] ?? 0);
        if ($attempts >= $maxAttempts) {
            Cache::forget($pendingKey);
            throw new ThrottleRequestsException('Maximum verification attempts exceeded. Please request a new code.');
        }

        if (! Hash::check(trim($code), (string) $record['hash'])) {
            $attempts++;
            if ($attempts >= $maxAttempts) {
                Cache::forget($pendingKey);
                throw new ThrottleRequestsException('Maximum verification attempts exceeded. Please request a new code.');
            }

            $remainingTtl = max(1, (int) $record['expires_at'] - now()->timestamp);
            $record['attempts'] = $attempts;
            Cache::put($pendingKey, $record, $remainingTtl);

            $remainingAttempts = $maxAttempts - $attempts;
            throw ValidationException::withMessages([
                'code' => ["Invalid verification code. {$remainingAttempts} attempt(s) remaining."],
            ]);
        }

        // Single-use: invalidate immediately after successful check.
        Cache::forget($pendingKey);
        Cache::forget($this->cooldownKey($purpose, $normalizedEmail, $user->user_id));

        $verifiedAt = now();
        $verifiedTtlMinutes = max(10, (int) config('salo.otp.verified_ttl_minutes', 120));

        Cache::put($this->verifiedKey($purpose, $normalizedEmail, $user->user_id), [
            'email' => $normalizedEmail,
            'user_id' => (int) $user->user_id,
            'verified_at' => $verifiedAt->toIso8601String(),
        ], now()->addMinutes($verifiedTtlMinutes));

        if (strtolower((string) $user->email) === $normalizedEmail && $user->email_verified_at === null) {
            $user->email_verified_at = $verifiedAt;
            $user->save();
        }

        DB::table('audit_logs')->insert([
            'actor_user_id' => $user->user_id,
            'action' => 'email_otp_verified',
            'entity_type' => 'users',
            'entity_id' => (string) $user->user_id,
            'new_values' => json_encode(['email' => $normalizedEmail, 'purpose' => $purpose]),
            'ip_address' => $request->ip(),
            'created_at' => now(),
        ]);

        return [
            'email' => $normalizedEmail,
            'purpose' => $purpose,
            'verified' => true,
            'verified_at' => $verifiedAt->toIso8601String(),
        ];
    }

    /**
     * Assert that the given email was verified via OTP for this user and purpose.
     */
    public function assertVerified(string $email, string $purpose, int $userId): Carbon
    {
        $normalizedEmail = $this->normalizeEmail($email);
        $record = Cache::get($this->verifiedKey($purpose, $normalizedEmail, $userId));

        if (! is_array($record) || (int) ($record['user_id'] ?? 0) !== $userId || empty($record['verified_at'])) {
            throw ValidationException::withMessages([
                'contact_email' => ['Contact email must be verified via OTP before submitting.'],
            ]);
        }

        return Carbon::parse((string) $record['verified_at']);
    }

    public function forgetVerified(string $email, string $purpose, int $userId): void
    {
        Cache::forget($this->verifiedKey($purpose, $this->normalizeEmail($email), $userId));
    }

    private function normalizeEmail(string $email): string
    {
        return strtolower(trim($email));
    }

    private function pendingKey(string $purpose, string $email, int $userId): string
    {
        return "otp:pending:{$purpose}:{$userId}:".sha1($email);
    }

    private function cooldownKey(string $purpose, string $email, int $userId): string
    {
        return "otp:cooldown:{$purpose}:{$userId}:".sha1($email);
    }

    private function verifiedKey(string $purpose, string $email, int $userId): string
    {
        return "otp:verified:{$purpose}:{$userId}:".sha1($email);
    }
}
