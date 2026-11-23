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
        $row = DB::table('platform_settings')
            ->where('setting_key', 'orders.flat_delivery_fee')
            ->first(['setting_value']);

        $raw = $row?->setting_value ?? (string) config('salo.orders.flat_delivery_fee', '49.00');

        return Money::fromCents(Money::toCents((string) $raw));
    }

    /**
     * @return array<string, mixed>
     */
    public function getFeesConfig(): array
    {
        $row = DB::table('platform_settings')
            ->where('setting_key', 'orders.flat_delivery_fee')
            ->first(['setting_value', 'updated_at']);

        $fee = $this->getFlatDeliveryFee();

        return [
            'flat_delivery_fee' => (float) $fee,
            'flat_delivery_fee_formatted' => $fee,
            'source' => $row ? 'platform_settings' : 'config_default',
            'updated_at' => $row?->updated_at,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function updateFlatDeliveryFee(User $admin, mixed $rawFee, mixed $reason, ?Request $request = null): array
    {
        $errors = [];
        $feeStr = is_scalar($rawFee) ? trim((string) $rawFee) : '';
        if ($feeStr === '' || preg_match('/^\d+(?:\.\d{1,2})?$/', $feeStr) !== 1) {
            $errors['flat_delivery_fee'] = ['Flat delivery fee must be a non-negative amount with up to 2 decimal places.'];
        } else {
            $cents = Money::toCents($feeStr);
            if ($cents < 0 || $cents > 50000) {
                $errors['flat_delivery_fee'] = ['Flat delivery fee must be between 0.00 and 500.00 PHP.'];
            }
        }

        $cleanReason = is_scalar($reason) ? trim((string) $reason) : '';
        if (mb_strlen($cleanReason) < 5 || mb_strlen($cleanReason) > 255) {
            $errors['reason'] = ['A reason between 5 and 255 characters is required.'];
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        $newFee = Money::fromCents(Money::toCents($feeStr));
        $oldFee = $this->getFlatDeliveryFee();

        DB::transaction(function () use ($admin, $oldFee, $newFee, $cleanReason, $request): void {
            DB::table('platform_settings')->updateOrInsert(
                ['setting_key' => 'orders.flat_delivery_fee'],
                [
                    'setting_value' => $newFee,
                    'value_type' => 'decimal',
                    'setting_group' => 'fees',
                    'description' => 'Flat delivery fee per delivery sub-order (PHP).',
                    'updated_by' => $admin->user_id,
                    'updated_at' => now(),
                ],
            );

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: 'platform_fees.updated',
                entityType: 'platform_settings',
                entityId: 'orders.flat_delivery_fee',
                oldValues: ['flat_delivery_fee' => $oldFee],
                newValues: ['flat_delivery_fee' => $newFee],
                reason: $cleanReason,
                request: $request,
            );
        });

        return $this->getFeesConfig();
    }
}
