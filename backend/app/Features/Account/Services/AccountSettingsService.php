<?php

namespace App\Features\Account\Services;

use App\Models\User;
use App\Support\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AccountSettingsService
{
    public const DEFAULT_NOTIFICATIONS = [
        'orderUpdates' => true,
        'promotions' => false,
        'reservationReminders' => true,
        'smsNotifications' => false,
        'newOrderAlerts' => true,
        'deliveryDispatchAlerts' => true,
        'reviewAlerts' => true,
        'payoutUpdates' => true,
    ];

    public const DEFAULT_PRIVACY = [
        'shareOrderHistoryForRecommendations' => true,
        'allowRestaurantMessages' => true,
        'riderContactPrivacyAck' => true,
    ];

    public const DEFAULT_SECURITY = [
        'twoFactor' => false,
        'loginAlerts' => true,
    ];

    public const DEFAULT_APPEARANCE = [
        'theme' => 'system',
    ];

    public function __construct(
        private readonly AuditLogService $auditLogService,
    ) {}

    /**
     * Retrieve persisted user settings merged with role-neutral defaults.
     *
     * @return array<string, mixed>
     */
    public function getSettings(User $user): array
    {
        $row = DB::table('user_settings')
            ->where('user_id', $user->user_id)
            ->first();

        return $this->formatSettings($row);
    }

    /**
     * Persist user settings (notifications, privacy, security, appearance).
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function updateSettings(User $user, array $validated, Request $request): array
    {
        $current = $this->getSettings($user);

        $notifications = array_key_exists('notifications', $validated)
            ? $this->mergeBooleanMap($current['notifications'], (array) $validated['notifications'], array_keys(self::DEFAULT_NOTIFICATIONS))
            : $current['notifications'];

        $privacy = array_key_exists('privacy', $validated)
            ? $this->mergeBooleanMap($current['privacy'], (array) $validated['privacy'], array_keys(self::DEFAULT_PRIVACY))
            : $current['privacy'];

        $security = array_key_exists('security', $validated)
            ? $this->mergeBooleanMap($current['security'], (array) $validated['security'], array_keys(self::DEFAULT_SECURITY))
            : $current['security'];

        $appearance = $current['appearance'];
        if (array_key_exists('appearance', $validated) && is_array($validated['appearance'])) {
            $theme = $validated['appearance']['theme'] ?? $appearance['theme'];
            if (in_array($theme, ['light', 'dark', 'system'], true)) {
                $appearance['theme'] = $theme;
            }
        }

        $now = now();
        DB::transaction(function () use ($user, $current, $notifications, $privacy, $security, $appearance, $now, $request): void {
            DB::table('user_settings')->updateOrInsert(
                ['user_id' => $user->user_id],
                [
                    'notification_preferences' => json_encode($notifications),
                    'privacy_preferences' => json_encode($privacy),
                    'security_preferences' => json_encode($security),
                    'appearance_preferences' => json_encode($appearance),
                    'updated_at' => $now,
                ],
            );

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'account_settings_updated',
                entityType: 'users',
                entityId: (int) $user->user_id,
                oldValues: $current,
                newValues: [
                    'notifications' => $notifications,
                    'privacy' => $privacy,
                    'security' => $security,
                    'appearance' => $appearance,
                ],
                request: $request,
            );
        });

        return $this->getSettings($user);
    }

    /**
     * @param  array<string, bool>  $base
     * @param  array<string, mixed>  $incoming
     * @param  array<int, string>  $allowedKeys
     * @return array<string, bool>
     */
    private function mergeBooleanMap(array $base, array $incoming, array $allowedKeys): array
    {
        foreach ($allowedKeys as $key) {
            if (array_key_exists($key, $incoming)) {
                $base[$key] = (bool) $incoming[$key];
            }
        }

        return $base;
    }

    /**
     * @return array<string, mixed>
     */
    private function formatSettings(?object $row): array
    {
        $notifications = self::DEFAULT_NOTIFICATIONS;
        $privacy = self::DEFAULT_PRIVACY;
        $security = self::DEFAULT_SECURITY;
        $appearance = self::DEFAULT_APPEARANCE;

        if ($row !== null) {
            $notifications = array_merge($notifications, $this->decodeJson($row->notification_preferences));
            $privacy = array_merge($privacy, $this->decodeJson($row->privacy_preferences));
            $security = array_merge($security, $this->decodeJson($row->security_preferences));
            $appearance = array_merge($appearance, $this->decodeJson($row->appearance_preferences));
        }

        return [
            'notifications' => $notifications,
            'privacy' => $privacy,
            'security' => $security,
            'appearance' => $appearance,
            'updated_at' => $row?->updated_at,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeJson(mixed $value): array
    {
        if (is_array($value)) {
            return $value;
        }
        if (is_string($value) && $value !== '') {
            $decoded = json_decode($value, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        return [];
    }
}
