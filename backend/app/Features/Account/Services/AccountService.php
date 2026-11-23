<?php

namespace App\Features\Account\Services;

use App\Features\Auth\Services\AuthService;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class AccountService
{
    private const MAX_PASSWORD_ATTEMPTS = 5;

    private const PASSWORD_DECAY_SECONDS = 60;

    private const ALLOWED_PROFILE_FIELDS = [
        'username',
        'first_name',
        'middle_initial',
        'last_name',
        'phone_number',
        'date_of_birth',
    ];

    public function __construct(
        private readonly AuthService $authService,
    ) {}

    /**
     * Update only allow-listed profile fields on the authenticated user.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function updateProfile(User $user, array $validated): array
    {
        $updates = [];

        foreach (self::ALLOWED_PROFILE_FIELDS as $field) {
            if (! array_key_exists($field, $validated)) {
                continue;
            }

            $value = $validated[$field];

            if ($field === 'middle_initial') {
                $value = ($value !== null && $value !== '') ? strtoupper((string) $value) : null;
            }

            $updates[$field] = $value;
        }

        if ($updates !== []) {
            $user->forceFill($updates);
            $user->save();
        }

        return $this->authService->formatUserPayload($user->fresh());
    }

    /**
     * Change the authenticated user's password after verifying current_password.
     */
    public function updatePassword(
        User $user,
        string $currentPassword,
        string $newPassword,
        Request $request,
    ): void {
        $throttleKey = 'account:password:'.$user->user_id.'|'.$request->ip();

        if (RateLimiter::tooManyAttempts($throttleKey, self::MAX_PASSWORD_ATTEMPTS)) {
            throw new ThrottleRequestsException('Too many password change attempts. Please try again later.');
        }

        if (! Hash::check($currentPassword, $user->password_hash)) {
            RateLimiter::hit($throttleKey, self::PASSWORD_DECAY_SECONDS);

            throw ValidationException::withMessages([
                'current_password' => ['The current password is incorrect.'],
            ]);
        }

        RateLimiter::clear($throttleKey);

        $user->password_hash = Hash::make($newPassword);
        $user->save();

        \Illuminate\Support\Facades\Cache::forget("auth:must_change_password:{$user->user_id}");
        if ($request->hasSession()) {
            $request->session()->forget('must_change_password');
        }

        $settingsRow = DB::table('user_settings')->where('user_id', $user->user_id)->first(['security_preferences']);
        if ($settingsRow) {
            $secPrefs = is_string($settingsRow->security_preferences)
                ? (json_decode($settingsRow->security_preferences, true) ?: [])
                : [];
            if (! empty($secPrefs['must_change_password'])) {
                $secPrefs['must_change_password'] = false;
                DB::table('user_settings')
                    ->where('user_id', $user->user_id)
                    ->update([
                        'security_preferences' => json_encode($secPrefs),
                        'updated_at' => now(),
                    ]);
            }
        }

        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        DB::table('audit_logs')->insert([
            'actor_user_id' => $user->user_id,
            'action' => 'password_changed',
            'entity_type' => 'users',
            'entity_id' => (string) $user->user_id,
            'ip_address' => $request->ip(),
            'created_at' => now(),
        ]);
    }

    /**
     * Return the authenticated user's latest restaurant and rider applications, or null.
     *
     * @return array<string, array<string, mixed>|null>
     */
    public function getApplications(User $user): array
    {
        $restaurantApp = DB::table('restaurant_applications')
            ->where('applicant_user_id', $user->user_id)
            ->orderByDesc('submitted_at')
            ->orderByDesc('restaurant_application_id')
            ->first(['application_status', 'submitted_at', 'updated_at', 'reviewer_note']);

        $riderApp = DB::table('rider_applications')
            ->where('applicant_user_id', $user->user_id)
            ->orderByDesc('submitted_at')
            ->orderByDesc('rider_application_id')
            ->first(['application_status', 'submitted_at', 'updated_at', 'reviewer_note']);

        return [
            'restaurant_application' => $this->formatApplication($restaurantApp, 'restaurant'),
            'rider_application' => $this->formatApplication($riderApp, 'rider'),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function formatApplication(?object $row, string $type): ?array
    {
        if (! $row) {
            return null;
        }

        return [
            'type' => $type,
            'status' => $row->application_status,
            'submitted_at' => $row->submitted_at ? Carbon::parse($row->submitted_at)->toIso8601String() : null,
            'updated_at' => $row->updated_at ? Carbon::parse($row->updated_at)->toIso8601String() : null,
            'reviewer_note' => $row->reviewer_note,
        ];
    }
}
