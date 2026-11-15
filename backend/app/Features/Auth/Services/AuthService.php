<?php

namespace App\Features\Auth\Services;

use App\Models\User;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpKernel\Exception\HttpException;

class AuthService
{
    private const MAX_LOGIN_ATTEMPTS = 5;

    private const LOGIN_DECAY_SECONDS = 60;

    /**
     * Register a new customer account (never accepts role or status from input).
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function register(array $validated, Request $request): array
    {
        $user = User::create([
            'username' => trim((string) $validated['username']),
            'first_name' => trim((string) $validated['first_name']),
            'middle_initial' => isset($validated['middle_initial']) && $validated['middle_initial'] !== ''
                ? strtoupper(trim((string) $validated['middle_initial']))
                : null,
            'last_name' => trim((string) $validated['last_name']),
            'email' => strtolower(trim((string) $validated['email'])),
            'password_hash' => Hash::make((string) $validated['password']),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        Auth::guard('web')->login($user);

        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        return $this->formatUserPayload($user);
    }

    /**
     * Authenticate a user by email and password with rate limiting and status checks.
     *
     * @return array<string, mixed>
     */
    public function login(string $email, string $password, Request $request): array
    {
        $normalizedEmail = strtolower(trim($email));
        $throttleKey = 'auth:login:'.$normalizedEmail.'|'.$request->ip();

        if (RateLimiter::tooManyAttempts($throttleKey, self::MAX_LOGIN_ATTEMPTS)) {
            throw new ThrottleRequestsException('Too many login attempts. Please try again later.');
        }

        $user = User::where('email', $normalizedEmail)->first();

        if (! $user || ! Hash::check($password, $user->password_hash)) {
            RateLimiter::hit($throttleKey, self::LOGIN_DECAY_SECONDS);
            throw new HttpException(401, 'Invalid credentials.');
        }

        if (! $user->isActiveAccount()) {
            RateLimiter::hit($throttleKey, self::LOGIN_DECAY_SECONDS);
            throw new HttpException(403, 'Account is not active.');
        }

        RateLimiter::clear($throttleKey);

        Auth::guard('web')->login($user);

        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        return $this->formatUserPayload($user);
    }

    public function logout(Request $request): void
    {
        Auth::guard('web')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }
    }

    /**
     * Format user profile and derived roles without exposing sensitive fields.
     *
     * @return array<string, mixed>
     */
    public function formatUserPayload(User $user): array
    {
        $roleContext = $user->resolveRoleContext();

        return [
            'user_id' => (int) $user->user_id,
            'username' => $user->username,
            'first_name' => $user->first_name,
            'middle_initial' => $user->middle_initial,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'phone_number' => $user->phone_number,
            'date_of_birth' => $user->date_of_birth?->format('Y-m-d'),
            'user_role' => $user->user_role,
            'account_status' => $user->account_status,
            'email_verified_at' => $user->email_verified_at?->toIso8601String(),
            'roles' => $roleContext['roles'],
            'capabilities' => $roleContext['capabilities'],
            'restaurant_ownerships' => $roleContext['restaurant_ownerships'],
            'restaurant_staff_assignments' => $roleContext['restaurant_staff_assignments'],
            'rider_profile' => $roleContext['rider_profile'],
        ];
    }
}
