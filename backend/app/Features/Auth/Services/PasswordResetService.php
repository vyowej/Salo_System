<?php

namespace App\Features\Auth\Services;

use App\Features\Auth\Mail\PasswordResetMail;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

class PasswordResetService
{
    private const MAX_RESET_ATTEMPTS = 5;

    private const RESET_DECAY_SECONDS = 60;

    private const TOKEN_EXPIRY_MINUTES = 60;

    /**
     * Handle a password reset request without account enumeration or leaking mail errors.
     */
    public function requestReset(string $email, Request $request): void
    {
        $normalizedEmail = strtolower(trim($email));
        $throttleKey = 'auth:password-reset-request:'.$normalizedEmail.'|'.$request->ip();

        if (RateLimiter::tooManyAttempts($throttleKey, self::MAX_RESET_ATTEMPTS)) {
            throw new ThrottleRequestsException('Too many password reset attempts. Please try again later.');
        }

        RateLimiter::hit($throttleKey, self::RESET_DECAY_SECONDS);

        $user = User::where('email', $normalizedEmail)->first();

        if (! $user || ! $user->isActiveAccount()) {
            return;
        }

        $plainToken = $this->createTokenForUser($user, self::TOKEN_EXPIRY_MINUTES);

        try {
            Mail::to($user->email)->send(new PasswordResetMail(
                user: $user,
                plainToken: $plainToken,
                expiryMinutes: self::TOKEN_EXPIRY_MINUTES,
            ));
        } catch (\Throwable) {
            Log::error('Password reset email delivery failed.', [
                'user_id' => (int) $user->user_id,
            ]);
        }
    }

    /**
     * Create a hashed single-use token in password_reset_tokens (UTC expires_at).
     * Never exposed in API responses.
     */
    public function createTokenForUser(User $user, int $ttlMinutes = self::TOKEN_EXPIRY_MINUTES): string
    {
        $plainToken = Str::random(64);
        $nowUtc = Carbon::now('UTC');

        DB::transaction(function () use ($user, $plainToken, $nowUtc, $ttlMinutes): void {
            DB::table('password_reset_tokens')
                ->where('user_id', $user->user_id)
                ->whereNull('used_at')
                ->update(['used_at' => now()]);

            DB::table('password_reset_tokens')->insert([
                'user_id' => $user->user_id,
                'token_hash' => Hash::make($plainToken),
                'expires_at' => $nowUtc->copy()->addMinutes($ttlMinutes)->toDateTimeString(),
                'used_at' => null,
                'created_at' => now(),
            ]);
        });

        return $plainToken;
    }

    /**
     * Confirm a password reset token (single-use, unexpired, active account).
     */
    public function confirmReset(string $email, string $plainToken, string $newPassword, Request $request): void
    {
        $normalizedEmail = strtolower(trim($email));
        $throttleKey = 'auth:password-reset-confirm:'.$normalizedEmail.'|'.$request->ip();

        if (RateLimiter::tooManyAttempts($throttleKey, self::MAX_RESET_ATTEMPTS)) {
            throw new ThrottleRequestsException('Too many password reset attempts. Please try again later.');
        }

        $user = User::where('email', $normalizedEmail)->first();

        if (! $user || ! $user->isActiveAccount()) {
            RateLimiter::hit($throttleKey, self::RESET_DECAY_SECONDS);
            throw new HttpException(400, 'Invalid or expired password reset token.');
        }

        $nowUtcString = Carbon::now('UTC')->toDateTimeString();

        $candidates = DB::table('password_reset_tokens')
            ->where('user_id', $user->user_id)
            ->whereNull('used_at')
            ->where('expires_at', '>', $nowUtcString)
            ->orderByDesc('reset_token_id')
            ->get();

        $matchedToken = null;
        foreach ($candidates as $candidate) {
            if (Hash::check($plainToken, $candidate->token_hash)) {
                $matchedToken = $candidate;
                break;
            }
        }

        if (! $matchedToken) {
            RateLimiter::hit($throttleKey, self::RESET_DECAY_SECONDS);
            throw new HttpException(400, 'Invalid or expired password reset token.');
        }

        DB::transaction(function () use ($user, $matchedToken, $newPassword): void {
            $updated = DB::table('password_reset_tokens')
                ->where('reset_token_id', $matchedToken->reset_token_id)
                ->whereNull('used_at')
                ->update(['used_at' => now()]);

            if ($updated !== 1) {
                throw new HttpException(400, 'Invalid or expired password reset token.');
            }

            $user->forceFill([
                'password_hash' => Hash::make($newPassword),
            ])->save();
        });

        RateLimiter::clear($throttleKey);
    }
}
