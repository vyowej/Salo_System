<?php

namespace App\Features\Reviews\Services;

use App\Models\User;
use App\Support\AuditLogService;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PlatformSettingsService
{
    public const KEYS = [
        'featured_restaurant.min_review_threshold',
        'featured_restaurant.evaluation_period_days',
        'featured_restaurant.feature_period_days',
        'featured_restaurant.week_start_day',
        'featured_restaurant.fallback_baseline_rating',
        'featured_restaurant.min_platform_reviews_for_baseline',
        'featured_restaurant.auto_selection_enabled',
        'reviews.flagged_counts_toward_rating',
    ];

    private const ALLOWED_WEEK_DAYS = [
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
    ];

    public function __construct(
        private readonly AuditLogService $auditLogService,
    ) {}

    /**
     * Load all review and featured restaurant policy settings, falling back to config/salo.php.
     *
     * @return array<string, int|float|bool|string>
     */
    public function getReviewsAndFeaturedSettings(): array
    {
        $defaults = $this->configDefaults();

        $rows = DB::table('platform_settings')
            ->whereIn('setting_key', self::KEYS)
            ->get(['setting_key', 'setting_value', 'value_type']);

        foreach ($rows as $row) {
            $defaults[$row->setting_key] = $this->castValue($row->setting_value, $row->value_type);
        }

        return $defaults;
    }

    public function flaggedCountsTowardRating(): bool
    {
        $row = DB::table('platform_settings')
            ->where('setting_key', 'reviews.flagged_counts_toward_rating')
            ->first(['setting_value', 'value_type']);

        if ($row) {
            return (bool) $this->castValue($row->setting_value, $row->value_type);
        }

        return (bool) config('salo.reviews.flagged_counts_toward_rating', false);
    }

    /**
     * Validate and persist updated policy settings (Admin only).
     *
     * @param  array<string, mixed>  $input
     * @return array<string, int|float|bool|string>
     */
    public function updateSettings(User $admin, array $input, ?Request $request = null): array
    {
        $current = $this->getReviewsAndFeaturedSettings();
        $validated = $this->validateInput($input);

        if ($validated === []) {
            return $current;
        }

        DB::transaction(function () use ($admin, $current, $validated, $request): void {
            $now = now();
            $changedOld = [];
            $changedNew = [];

            foreach ($validated as $key => $meta) {
                $oldVal = $current[$key] ?? null;
                $newVal = $meta['typed'];

                DB::table('platform_settings')->updateOrInsert(
                    ['setting_key' => $key],
                    [
                        'setting_value' => $meta['raw'],
                        'value_type' => $meta['type'],
                        'setting_group' => str_starts_with($key, 'reviews.') ? 'reviews' : 'featured_restaurant',
                        'updated_by' => $admin->user_id,
                        'updated_at' => $now,
                    ],
                );

                if ($oldVal !== $newVal) {
                    $changedOld[$key] = $oldVal;
                    $changedNew[$key] = $newVal;
                }
            }

            if ($changedNew !== []) {
                $this->auditLogService->record(
                    actorUserId: (int) $admin->user_id,
                    action: 'platform_settings.updated',
                    entityType: 'platform_settings',
                    entityId: 'reviews_featured_policy',
                    oldValues: $changedOld,
                    newValues: $changedNew,
                    reason: 'Updated reviews and featured restaurant policy settings.',
                    request: $request,
                );
            }
        });

        return $this->getReviewsAndFeaturedSettings();
    }

    /**
     * @return array<string, int|float|bool|string>
     */
    private function configDefaults(): array
    {
        return [
            'featured_restaurant.min_review_threshold' => max(1, (int) config('salo.featured_restaurant.min_review_threshold', 10)),
            'featured_restaurant.evaluation_period_days' => max(1, (int) config('salo.featured_restaurant.evaluation_period_days', 30)),
            'featured_restaurant.feature_period_days' => max(1, (int) config('salo.featured_restaurant.feature_period_days', 7)),
            'featured_restaurant.week_start_day' => strtolower((string) config('salo.featured_restaurant.week_start_day', 'monday')),
            'featured_restaurant.fallback_baseline_rating' => (float) config('salo.featured_restaurant.fallback_baseline_rating', 4.0),
            'featured_restaurant.min_platform_reviews_for_baseline' => max(1, (int) config('salo.featured_restaurant.min_platform_reviews_for_baseline', 10)),
            'featured_restaurant.auto_selection_enabled' => (bool) config('salo.featured_restaurant.auto_selection_enabled', true),
            'reviews.flagged_counts_toward_rating' => (bool) config('salo.reviews.flagged_counts_toward_rating', false),
        ];
    }

    private function castValue(string $value, string $type): int|float|bool|string
    {
        return match ($type) {
            'integer' => (int) $value,
            'decimal' => (float) $value,
            'boolean' => in_array(strtolower(trim($value)), ['1', 'true', 'yes'], true),
            default => $value,
        };
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, array{typed: int|float|bool|string, raw: string, type: string}>
     */
    private function validateInput(array $input): array
    {
        $errors = [];
        $parsed = [];

        $intRules = [
            'featured_restaurant.min_review_threshold' => [1, 1000],
            'featured_restaurant.evaluation_period_days' => [1, 365],
            'featured_restaurant.feature_period_days' => [1, 31],
            'featured_restaurant.min_platform_reviews_for_baseline' => [1, 10000],
        ];

        foreach ($intRules as $key => [$min, $max]) {
            if (array_key_exists($key, $input)) {
                $val = $input[$key];
                if (! is_numeric($val) || (int) $val != $val || (int) $val < $min || (int) $val > $max) {
                    $errors[$key] = ["Must be an integer between {$min} and {$max}."];
                } else {
                    $intVal = (int) $val;
                    $parsed[$key] = ['typed' => $intVal, 'raw' => (string) $intVal, 'type' => 'integer'];
                }
            }
        }

        if (array_key_exists('featured_restaurant.fallback_baseline_rating', $input)) {
            $val = $input['featured_restaurant.fallback_baseline_rating'];
            if (! is_numeric($val) || (float) $val < 1.0 || (float) $val > 5.0) {
                $errors['featured_restaurant.fallback_baseline_rating'] = ['Must be a decimal between 1.0 and 5.0.'];
            } else {
                $floatVal = round((float) $val, 4);
                $parsed['featured_restaurant.fallback_baseline_rating'] = [
                    'typed' => $floatVal,
                    'raw' => number_format($floatVal, 4, '.', ''),
                    'type' => 'decimal',
                ];
            }
        }

        if (array_key_exists('featured_restaurant.week_start_day', $input)) {
            $day = strtolower(trim((string) $input['featured_restaurant.week_start_day']));
            if (! in_array($day, self::ALLOWED_WEEK_DAYS, true)) {
                $errors['featured_restaurant.week_start_day'] = ['Must be a valid day of the week (monday..sunday).'];
            } else {
                $parsed['featured_restaurant.week_start_day'] = ['typed' => $day, 'raw' => $day, 'type' => 'string'];
            }
        }

        foreach (['featured_restaurant.auto_selection_enabled', 'reviews.flagged_counts_toward_rating'] as $boolKey) {
            if (array_key_exists($boolKey, $input)) {
                $rawBool = filter_var($input[$boolKey], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
                if ($rawBool === null) {
                    $errors[$boolKey] = ['Must be a boolean value.'];
                } else {
                    $parsed[$boolKey] = ['typed' => $rawBool, 'raw' => $rawBool ? '1' : '0', 'type' => 'boolean'];
                }
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        return $parsed;
    }

    public function getFlatDeliveryFee(): string
    {
        $rows = DB::table('platform_settings')
            ->whereIn('setting_key', ['orders.delivery_fee_base', 'orders.flat_delivery_fee'])
            ->pluck('setting_value', 'setting_key');

        $raw = $rows->get('orders.delivery_fee_base')
            ?? $rows->get('orders.flat_delivery_fee')
            ?? (string) config('salo.orders.delivery_fee_base', config('salo.orders.flat_delivery_fee', '49.00'));

        return Money::fromCents(Money::toCents((string) $raw));
    }

    /**
     * @return array{
     *   base_fee_cents: int,
     *   base_fee: string,
     *   base_distance_km: float,
     *   per_extra_km_cents: int,
     *   per_extra_km: string,
     *   max_fee_cents: int,
     *   max_fee: string
     * }
     */
    public function getDeliveryFeeSettings(): array
    {
        $rows = DB::table('platform_settings')
            ->whereIn('setting_key', [
                'orders.delivery_fee_base',
                'orders.flat_delivery_fee',
                'orders.delivery_fee_base_distance_km',
                'orders.delivery_fee_per_extra_km',
                'orders.delivery_fee_max',
            ])
            ->pluck('setting_value', 'setting_key');

        $baseRaw = $rows->get('orders.delivery_fee_base')
            ?? $rows->get('orders.flat_delivery_fee')
            ?? (string) config('salo.orders.delivery_fee_base', config('salo.orders.flat_delivery_fee', '49.00'));
        $baseCents = Money::toCents((string) $baseRaw);

        $distRaw = $rows->get('orders.delivery_fee_base_distance_km')
            ?? (string) config('salo.orders.delivery_fee_base_distance_km', '2.0');
        $baseDistKm = max(0.01, (float) $distRaw);

        $extraRaw = $rows->get('orders.delivery_fee_per_extra_km')
            ?? (string) config('salo.orders.delivery_fee_per_extra_km', '10.00');
        $extraCents = Money::toCents((string) $extraRaw);

        $maxRaw = $rows->get('orders.delivery_fee_max')
            ?? (string) config('salo.orders.delivery_fee_max', '150.00');
        $maxCents = max($baseCents, Money::toCents((string) $maxRaw));

        return [
            'base_fee_cents' => $baseCents,
            'base_fee' => Money::fromCents($baseCents),
            'base_distance_km' => $baseDistKm,
            'per_extra_km_cents' => $extraCents,
            'per_extra_km' => Money::fromCents($extraCents),
            'max_fee_cents' => $maxCents,
            'max_fee' => Money::fromCents($maxCents),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function getFeesConfig(): array
    {
        $rows = DB::table('platform_settings')
            ->whereIn('setting_key', [
                'orders.delivery_fee_base',
                'orders.flat_delivery_fee',
                'orders.delivery_fee_base_distance_km',
                'orders.delivery_fee_per_extra_km',
                'orders.delivery_fee_max',
            ])
            ->get(['setting_key', 'setting_value', 'updated_at']);

        $settings = $this->getDeliveryFeeSettings();
        $latestUpdated = $rows->max('updated_at');

        return [
            'flat_delivery_fee' => (float) $settings['base_fee'],
            'flat_delivery_fee_formatted' => $settings['base_fee'],
            'base_fee' => (float) $settings['base_fee'],
            'base_fee_formatted' => $settings['base_fee'],
            'base_distance_km' => (float) $settings['base_distance_km'],
            'per_extra_km' => (float) $settings['per_extra_km'],
            'per_extra_km_formatted' => $settings['per_extra_km'],
            'max_fee' => (float) $settings['max_fee'],
            'max_fee_formatted' => $settings['max_fee'],
            'source' => $rows->isNotEmpty() ? 'platform_settings' : 'config_default',
            'updated_at' => $latestUpdated,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function updateFlatDeliveryFee(User $admin, mixed $rawFee, mixed $reason, ?Request $request = null): array
    {
        return $this->updateDeliveryFeeConfig($admin, ['base_fee' => $rawFee], $reason, $request);
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function updateDeliveryFeeConfig(User $admin, array $input, mixed $reason, ?Request $request = null): array
    {
        $current = $this->getDeliveryFeeSettings();
        $errors = [];

        $rawBase = $input['base_fee'] ?? $input['flat_delivery_fee'] ?? $current['base_fee'];
        $baseStr = is_scalar($rawBase) ? trim((string) $rawBase) : '';
        $baseCents = $current['base_fee_cents'];
        if ($baseStr === '' || preg_match('/^\d+(?:\.\d{1,2})?$/', $baseStr) !== 1) {
            $errors['base_fee'] = ['Base delivery fee must be a non-negative amount with up to 2 decimal places.'];
            $errors['flat_delivery_fee'] = $errors['base_fee'];
        } else {
            $baseCents = Money::toCents($baseStr);
            if ($baseCents < 0 || $baseCents > 50000) {
                $errors['base_fee'] = ['Base delivery fee must be between 0.00 and 500.00 PHP.'];
                $errors['flat_delivery_fee'] = $errors['base_fee'];
            }
        }

        $rawDist = $input['base_distance_km'] ?? $current['base_distance_km'];
        $distStr = is_scalar($rawDist) ? trim((string) $rawDist) : '';
        $distVal = $current['base_distance_km'];
        if ($distStr === '' || ! is_numeric($distStr) || (float) $distStr <= 0 || (float) $distStr > 50) {
            $errors['base_distance_km'] = ['Base distance must be greater than 0 and at most 50 km.'];
        } else {
            $distVal = round((float) $distStr, 2);
        }

        $rawExtra = $input['per_extra_km'] ?? $current['per_extra_km'];
        $extraStr = is_scalar($rawExtra) ? trim((string) $rawExtra) : '';
        $extraCents = $current['per_extra_km_cents'];
        if ($extraStr === '' || preg_match('/^\d+(?:\.\d{1,2})?$/', $extraStr) !== 1) {
            $errors['per_extra_km'] = ['Per-extra-km fee must be a non-negative amount with up to 2 decimal places.'];
        } else {
            $extraCents = Money::toCents($extraStr);
            if ($extraCents < 0 || $extraCents > 20000) {
                $errors['per_extra_km'] = ['Per-extra-km fee must be between 0.00 and 200.00 PHP.'];
            }
        }

        $rawMax = $input['max_fee'] ?? $current['max_fee'];
        $maxStr = is_scalar($rawMax) ? trim((string) $rawMax) : '';
        $maxCents = $current['max_fee_cents'];
        if ($maxStr === '' || preg_match('/^\d+(?:\.\d{1,2})?$/', $maxStr) !== 1) {
            $errors['max_fee'] = ['Maximum delivery fee must be a non-negative amount with up to 2 decimal places.'];
        } else {
            $maxCents = Money::toCents($maxStr);
            if ($maxCents < $baseCents || $maxCents > 100000) {
                $errors['max_fee'] = ['Maximum delivery fee must be at least the base fee and at most 1,000.00 PHP.'];
            }
        }

        $cleanReason = is_scalar($reason) ? trim((string) $reason) : '';
        if (mb_strlen($cleanReason) < 5 || mb_strlen($cleanReason) > 255) {
            $errors['reason'] = ['A reason between 5 and 255 characters is required.'];
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        $newValues = [
            'base_fee' => Money::fromCents($baseCents),
            'base_distance_km' => (string) $distVal,
            'per_extra_km' => Money::fromCents($extraCents),
            'max_fee' => Money::fromCents($maxCents),
        ];

        $oldValues = [
            'base_fee' => $current['base_fee'],
            'base_distance_km' => (string) $current['base_distance_km'],
            'per_extra_km' => $current['per_extra_km'],
            'max_fee' => $current['max_fee'],
        ];

        DB::transaction(function () use ($admin, $oldValues, $newValues, $cleanReason, $request): void {
            $now = now();
            $entries = [
                'orders.delivery_fee_base' => [$newValues['base_fee'], 'decimal', 'Base delivery fee up to base distance (PHP).'],
                'orders.flat_delivery_fee' => [$newValues['base_fee'], 'decimal', 'Synced base delivery fee key (PHP).'],
                'orders.delivery_fee_base_distance_km' => [$newValues['base_distance_km'], 'decimal', 'Base delivery distance covered by base fee (km).'],
                'orders.delivery_fee_per_extra_km' => [$newValues['per_extra_km'], 'decimal', 'Additional delivery fee per extra km (PHP).'],
                'orders.delivery_fee_max' => [$newValues['max_fee'], 'decimal', 'Maximum delivery fee cap per delivery sub-order (PHP).'],
            ];

            foreach ($entries as $key => [$val, $type, $desc]) {
                DB::table('platform_settings')->updateOrInsert(
                    ['setting_key' => $key],
                    [
                        'setting_value' => $val,
                        'value_type' => $type,
                        'setting_group' => 'fees',
                        'description' => $desc,
                        'updated_by' => $admin->user_id,
                        'updated_at' => $now,
                    ],
                );
            }

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: 'platform_fees.updated',
                entityType: 'platform_settings',
                entityId: 'orders.flat_delivery_fee',
                oldValues: $oldValues + ['flat_delivery_fee' => $oldValues['base_fee']],
                newValues: $newValues + ['flat_delivery_fee' => $newValues['base_fee']],
                reason: $cleanReason,
                request: $request,
            );
        });

        return $this->getFeesConfig();
    }
}
