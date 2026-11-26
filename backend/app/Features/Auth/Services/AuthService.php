<?php

namespace App\Features\Auth\Services;

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
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
        try {
            $user = User::forceCreate([
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
        } catch (QueryException $e) {
            if ((string) $e->getCode() === '23000') {
                $msg = strtolower($e->getMessage());
                if (str_contains($msg, 'uk_users_email') || str_contains($msg, 'email')) {
                    throw ValidationException::withMessages([
                        'email' => ['An account with this email already exists.'],
                    ]);
                }
                throw ValidationException::withMessages([
                    'username' => ['This username is already taken. Please choose another one.'],
                ]);
            }
            throw $e;
        }

        Auth::guard('web')->login($user);

        if ($request->hasSession()) {
            $request->session()->regenerate();
            $request->session()->put('auth_issued_at', time());
        }

        return $this->formatUserPayload($user);
    }

    /**
     * Check whether a username matches SALO format rules and is available.
     *
     * @return array{valid: bool, available: bool, message: string}
     */
    public function checkUsernameAvailability(string $rawUsername): array
    {
        $username = trim($rawUsername);
        if (preg_match('/^[a-zA-Z0-9_]{3,30}$/', $username) !== 1) {
            return [
                'valid' => false,
                'available' => false,
                'message' => 'Username must be 3–30 characters using only letters, numbers, and underscores.',
            ];
        }

        $exists = User::where('username', $username)->exists();

        return [
            'valid' => true,
            'available' => ! $exists,
            'message' => $exists
                ? 'This username is already taken. Please choose another one.'
                : 'Username is available.',
        ];
    }

    /**
     * Authenticate a user by email or unique username and password with rate limiting and status checks.
     *
     * @return array<string, mixed>
     */
    public function login(string $email, string $password, Request $request): array
    {
        $normalizedIdentifier = strtolower(trim($email));
        $throttleKey = 'auth:login:'.$normalizedIdentifier.'|'.$request->ip();

        if (RateLimiter::tooManyAttempts($throttleKey, self::MAX_LOGIN_ATTEMPTS)) {
            throw new ThrottleRequestsException('Too many login attempts. Please try again later.');
        }

        $isEmail = filter_var($normalizedIdentifier, FILTER_VALIDATE_EMAIL) !== false;
        $user = $isEmail
            ? User::where('email', $normalizedIdentifier)->first()
            : User::whereRaw('LOWER(username) = ?', [$normalizedIdentifier])->first();

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
            $request->session()->put('auth_issued_at', time());
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
     * Build the Google OAuth 2.0 authorization URL.
     */
    public function getGoogleAuthUrl(Request $request): string
    {
        $clientId = trim((string) config('services.google.client_id'));
        $clientSecret = trim((string) config('services.google.client_secret'));
        if ($clientId === '' || $clientSecret === '') {
            throw new HttpException(503, 'Google Sign-In is not configured on this server yet.');
        }

        $redirectUri = trim((string) config('services.google.redirect'))
            ?: url('/api/auth/google/callback');
        $state = Str::random(40);

        if ($request->hasSession()) {
            $request->session()->put('google_oauth_state', $state);
        }

        $query = http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'openid email profile',
            'state' => $state,
            'prompt' => 'select_account',
        ]);

        return 'https://accounts.google.com/o/oauth2/v2/auth?'.$query;
    }

    /**
     * Handle the Google OAuth 2.0 callback, authenticate the user, and return their payload.
     *
     * @return array<string, mixed>
     */
    public function handleGoogleCallback(Request $request): array
    {
        $clientId = trim((string) config('services.google.client_id'));
        $clientSecret = trim((string) config('services.google.client_secret'));
        if ($clientId === '' || $clientSecret === '') {
            throw new HttpException(503, 'Google Sign-In is not configured on this server.');
        }

        $expectedState = $request->hasSession() ? (string) $request->session()->pull('google_oauth_state', '') : '';
        $receivedState = (string) $request->query('state', '');
        if ($expectedState === '' || ! hash_equals($expectedState, $receivedState)) {
            throw new HttpException(400, 'Invalid Google authentication state. Please try again.');
        }

        $code = trim((string) $request->query('code', ''));
        if ($code === '') {
            throw new HttpException(400, 'Google authorization code is missing.');
        }

        $redirectUri = trim((string) config('services.google.redirect'))
            ?: url('/api/auth/google/callback');

        $tokenResponse = Http::asForm()->timeout(15)->post('https://oauth2.googleapis.com/token', [
            'code' => $code,
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri' => $redirectUri,
            'grant_type' => 'authorization_code',
        ]);

        $accessToken = (string) ($tokenResponse->json('access_token') ?? '');
        if (! $tokenResponse->successful() || $accessToken === '') {
            throw new HttpException(401, 'Unable to verify Google authorization token.');
        }

        $userInfo = Http::withToken($accessToken)
            ->timeout(15)
            ->get('https://openidconnect.googleapis.com/v1/userinfo');

        $googleEmail = strtolower(trim((string) ($userInfo->json('email') ?? '')));
        $emailVerified = (bool) ($userInfo->json('email_verified') ?? false);
        if (! $userInfo->successful() || $googleEmail === '' || ! $emailVerified) {
            throw new HttpException(401, 'A verified Google email address is required.');
        }

        $user = User::where('email', $googleEmail)->first();

        if (! $user) {
            $firstName = trim((string) ($userInfo->json('given_name') ?? ''));
            $lastName = trim((string) ($userInfo->json('family_name') ?? ''));
            if ($firstName === '') {
                $firstName = Str::before($googleEmail, '@');
            }
            if ($lastName === '') {
                $lastName = 'User';
            }

            if ($request->hasSession()) {
                $request->session()->put('google_pending_signup', [
                    'email' => $googleEmail,
                    'first_name' => mb_substr($firstName, 0, 100),
                    'last_name' => mb_substr($lastName, 0, 100),
                    'issued_at' => time(),
                ]);
            }

            return [
                'pending_username' => true,
                'user' => null,
            ];
        } elseif (! $user->isActiveAccount()) {
            throw new HttpException(403, 'Account is not active.');
        }

        Auth::guard('web')->login($user);

        if ($request->hasSession()) {
            $request->session()->regenerate();
            $request->session()->put('auth_issued_at', time());
        }

        return $this->formatUserPayload($user);
    }

    /**
     * @return array{email: string, first_name: string, last_name: string}
     */
    public function getPendingGoogleSignup(Request $request): array
    {
        $pending = $request->hasSession() ? $request->session()->get('google_pending_signup') : null;
        if (! is_array($pending) || empty($pending['email'])) {
            throw new HttpException(404, 'No pending Google sign-up session found. Please sign in with Google again.');
        }
        if (time() - (int) ($pending['issued_at'] ?? 0) > 900) {
            $request->session()->forget('google_pending_signup');
            throw new HttpException(410, 'Your Google sign-up session expired. Please sign in with Google again.');
        }

        return [
            'email' => (string) $pending['email'],
            'first_name' => (string) ($pending['first_name'] ?? ''),
            'last_name' => (string) ($pending['last_name'] ?? ''),
        ];
    }

    /**
     * Complete a pending Google sign-up using the user-provided username.
     *
     * @return array<string, mixed>
     */
    public function completeGoogleSignup(string $rawUsername, Request $request): array
    {
        $pending = $this->getPendingGoogleSignup($request);
        $username = trim($rawUsername);

        if (preg_match('/^[a-zA-Z0-9_]{3,30}$/', $username) !== 1) {
            throw ValidationException::withMessages([
                'username' => ['Username must be 3–30 characters using only letters, numbers, and underscores.'],
            ]);
        }

        if (User::where('username', $username)->exists()) {
            throw ValidationException::withMessages([
                'username' => ['This username is already taken. Please choose another one.'],
            ]);
        }

        $existingByEmail = User::where('email', $pending['email'])->first();
        if ($existingByEmail) {
            $request->session()->forget('google_pending_signup');
            if (! $existingByEmail->isActiveAccount()) {
                throw new HttpException(403, 'Account is not active.');
            }
            Auth::guard('web')->login($existingByEmail);
            $request->session()->regenerate();
            $request->session()->put('auth_issued_at', time());

            return $this->formatUserPayload($existingByEmail);
        }

        try {
            $user = new User([
                'username' => $username,
                'first_name' => $pending['first_name'] !== '' ? $pending['first_name'] : Str::before($pending['email'], '@'),
                'last_name' => $pending['last_name'] !== '' ? $pending['last_name'] : 'User',
                'email' => $pending['email'],
                'password_hash' => Hash::make(Str::random(32)),
            ]);
            $user->user_role = 'customer';
            $user->account_status = 'active';
            $user->email_verified_at = now();
            $user->save();
        } catch (QueryException $e) {
            if ((string) $e->getCode() === '23000') {
                throw ValidationException::withMessages([
                    'username' => ['This username is already taken. Please choose another one.'],
                ]);
            }
            throw $e;
        }

        $request->session()->forget('google_pending_signup');
        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        $request->session()->put('auth_issued_at', time());

        return $this->formatUserPayload($user);
    }

    /**
     * Format user profile and derived roles without exposing sensitive fields.
     *
     * @return array<string, mixed>
     */
    public function formatUserPayload(User $user): array
    {
        $roleContext = $user->resolveRoleContext();
        $mustChange = false;

        if ($user->user_role === 'admin' || in_array('admin', $roleContext['roles'], true)) {
            $cachedMustChange = Cache::get("auth:must_change_password:{$user->user_id}");
            if ($cachedMustChange !== null) {
                $mustChange = (bool) $cachedMustChange;
            } else {
                $settingsRow = DB::table('user_settings')
                    ->where('user_id', $user->user_id)
                    ->first(['security_preferences']);
                $secPrefs = $settingsRow && is_string($settingsRow->security_preferences)
                    ? (json_decode($settingsRow->security_preferences, true) ?: [])
                    : [];
                $mustChange = (bool) ($secPrefs['must_change_password'] ?? false);
                Cache::forever("auth:must_change_password:{$user->user_id}", $mustChange);
            }
        }

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
            'must_change_password' => $mustChange,
            'roles' => $roleContext['roles'],
            'capabilities' => $roleContext['capabilities'],
            'restaurant_ownerships' => $roleContext['restaurant_ownerships'],
            'restaurant_staff_assignments' => $roleContext['restaurant_staff_assignments'],
            'order_handler_positions' => $roleContext['order_handler_positions'],
            'rider_profile' => $roleContext['rider_profile'],
            'avatar' => $roleContext['rider_profile']['profile_photo'] ?? null,
        ];
    }
}
