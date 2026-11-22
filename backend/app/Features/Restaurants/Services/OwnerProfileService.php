<?php

namespace App\Features\Restaurants\Services;

use App\Models\User;
use App\Support\AuditLogService;
use App\Support\FileStorageService;
use App\Support\WorkspaceAccessResolver;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OwnerProfileService
{
    public function __construct(
        private readonly FileStorageService $fileStorageService,
        private readonly AuditLogService $auditLogService,
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
    ) {}

    /**
     * Resolve and authorize an active restaurant owned by the given user.
     */
    public function requireActiveOwnedRestaurant(User $user, ?int $restaurantId = null): object
    {
        return $this->workspaceAccessResolver->requireActiveOwnedRestaurant($user, $restaurantId);
    }

    /**
     * @return array<string, mixed>
     */
    public function getProfile(User $user, ?int $restaurantId = null): array
    {
        $restaurant = $this->requireActiveOwnedRestaurant($user, $restaurantId);

        return $this->formatProfile($restaurant);
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function updateProfile(User $user, array $validated, ?int $restaurantId, Request $request): array
    {
        $restaurant = $this->requireActiveOwnedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $offersDelivery = array_key_exists('offers_delivery', $validated)
            ? (bool) $validated['offers_delivery']
            : (bool) $restaurant->offers_delivery;
        $offersPickup = array_key_exists('offers_pickup', $validated)
            ? (bool) $validated['offers_pickup']
            : (bool) $restaurant->offers_pickup;

        if (! $offersDelivery && ! $offersPickup) {
            throw ValidationException::withMessages([
                'offers_delivery' => ['At least one ordering service (delivery or pickup) must remain enabled.'],
            ]);
        }

        $updates = $this->buildProfileUpdates($validated, $restaurant, $offersDelivery, $offersPickup);
        $this->persistProfileUpdate($targetId, $restaurant, $updates, $user, $request);

        return $this->formatProfile(DB::table('restaurants')->where('restaurant_id', $targetId)->first());
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function buildProfileUpdates(array $validated, object $restaurant, bool $offersDelivery, bool $offersPickup): array
    {
        return [
            'description' => array_key_exists('description', $validated)
                ? ($validated['description'] !== null ? trim((string) $validated['description']) : null)
                : $restaurant->description,
            'contact_phone' => array_key_exists('contact_phone', $validated)
                ? trim((string) $validated['contact_phone'])
                : $restaurant->contact_phone,
            'business_email' => array_key_exists('business_email', $validated)
                ? strtolower(trim((string) $validated['business_email']))
                : $restaurant->business_email,
            'offers_delivery' => $offersDelivery ? 1 : 0,
            'offers_pickup' => $offersPickup ? 1 : 0,
            'updated_at' => now(),
        ];
    }

    /**
     * @param  array<string, mixed>  $updates
     */
    private function persistProfileUpdate(int $targetId, object $restaurant, array $updates, User $user, Request $request): void
    {
        $oldValues = [
            'description' => $restaurant->description,
            'contact_phone' => $restaurant->contact_phone,
            'business_email' => $restaurant->business_email,
            'offers_delivery' => (bool) $restaurant->offers_delivery,
            'offers_pickup' => (bool) $restaurant->offers_pickup,
        ];
        $newValues = [
            'description' => $updates['description'],
            'contact_phone' => $updates['contact_phone'],
            'business_email' => $updates['business_email'],
            'offers_delivery' => (bool) $updates['offers_delivery'],
            'offers_pickup' => (bool) $updates['offers_pickup'],
        ];

        DB::transaction(function () use ($targetId, $restaurant, $updates, $user, $oldValues, $newValues, $request): void {
            DB::table('restaurants')->where('restaurant_id', $targetId)->update($updates);

            if (array_key_exists('description', $updates) && $updates['description'] !== $restaurant->description) {
                $brandId = (int) ($restaurant->brand_restaurant_id ?: ($restaurant->parent_restaurant_id ?: $targetId));
                DB::table('restaurants')
                    ->where('brand_restaurant_id', $brandId)
                    ->where('restaurant_id', '!=', $targetId)
                    ->update([
                        'description' => $updates['description'],
                        'updated_at' => $updates['updated_at'],
                    ]);
            }

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_profile_updated',
                entityType: 'restaurants',
                entityId: $targetId,
                oldValues: $oldValues,
                newValues: $newValues,
                request: $request,
            );
        });
    }

    /**
     * Upload/replace or remove logo_image / cover_image safely.
     *
     * @return array<string, mixed>
     */
    public function updateMedia(
        User $user,
        ?int $restaurantId,
        ?UploadedFile $logoFile,
        ?UploadedFile $coverFile,
        bool $removeLogo,
        bool $removeCover,
        Request $request,
    ): array {
        $restaurant = $this->requireActiveOwnedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;
        $oldLogo = $restaurant->logo_image;
        $oldCover = $restaurant->cover_image;
        $newlyStoredPublic = [];

        try {
            $newLogo = $this->resolveUpdatedImagePath($logoFile, $removeLogo, $oldLogo, $targetId, 'logo_image', $newlyStoredPublic);
            $newCover = $this->resolveUpdatedImagePath($coverFile, $removeCover, $oldCover, $targetId, 'cover_image', $newlyStoredPublic);
            $this->persistBrandingUpdate($targetId, $oldLogo, $oldCover, $newLogo, $newCover, $user, $request);
        } catch (\Throwable $e) {
            $this->fileStorageService->cleanupStoredPaths($newlyStoredPublic, []);
            throw $e;
        }

        $this->deleteUnreferencedImageIfReplaced($oldLogo, $newLogo);
        $this->deleteUnreferencedImageIfReplaced($oldCover, $newCover);

        return $this->formatProfile(DB::table('restaurants')->where('restaurant_id', $targetId)->first());
    }

    /**
     * @param  array<int, string>  $newlyStoredPublic
     */
    private function resolveUpdatedImagePath(
        ?UploadedFile $file,
        bool $remove,
        ?string $existingPath,
        int $restaurantId,
        string $fieldName,
        array &$newlyStoredPublic,
    ): ?string {
        if ($file !== null) {
            $path = $this->fileStorageService->storePublicImage(
                file: $file,
                directory: "restaurants/{$restaurantId}",
                fieldName: $fieldName,
            )['path'];
            $newlyStoredPublic[] = $path;

            return $path;
        }

        return $remove ? null : $existingPath;
    }

    private function persistBrandingUpdate(
        int $targetId,
        ?string $oldLogo,
        ?string $oldCover,
        ?string $newLogo,
        ?string $newCover,
        User $user,
        Request $request,
    ): void {
        DB::transaction(function () use ($targetId, $newLogo, $newCover, $oldLogo, $oldCover, $user, $request): void {
            $restaurant = DB::table('restaurants')
                ->where('restaurant_id', $targetId)
                ->first(['restaurant_id', 'parent_restaurant_id', 'brand_restaurant_id']);
            $brandId = $restaurant
                ? (int) ($restaurant->brand_restaurant_id ?: ($restaurant->parent_restaurant_id ?: $targetId))
                : $targetId;
            $now = now();

            DB::table('restaurants')
                ->where(function ($query) use ($brandId, $targetId): void {
                    $query->where('brand_restaurant_id', $brandId)
                        ->orWhere('restaurant_id', $targetId);
                })
                ->update([
                    'logo_image' => $newLogo,
                    'cover_image' => $newCover,
                    'updated_at' => $now,
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_branding_updated',
                entityType: 'restaurants',
                entityId: $targetId,
                oldValues: ['logo_image' => $oldLogo, 'cover_image' => $oldCover],
                newValues: ['logo_image' => $newLogo, 'cover_image' => $newCover],
                request: $request,
            );
        });
    }

    private function deleteUnreferencedImageIfReplaced(?string $oldPath, ?string $newPath): void
    {
        if ($oldPath !== null && $oldPath !== '' && $oldPath !== $newPath) {
            $this->fileStorageService->deleteIfUnreferenced(
                'public',
                $oldPath,
                fn (string $path): bool => $this->isPublicImageReferenced($path),
            );
        }
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function updateAcceptingStatus(User $user, array $validated, ?int $restaurantId, Request $request): array
    {
        $restaurant = $this->requireActiveOwnedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $acceptingOrders = array_key_exists('accepting_orders', $validated)
            ? (bool) $validated['accepting_orders']
            : (bool) $restaurant->accepting_orders;
        $acceptingReservations = array_key_exists('accepting_reservations', $validated)
            ? (bool) $validated['accepting_reservations']
            : (bool) $restaurant->accepting_reservations;

        DB::transaction(function () use ($targetId, $restaurant, $acceptingOrders, $acceptingReservations, $user, $request): void {
            DB::table('restaurants')->where('restaurant_id', $targetId)->update([
                'accepting_orders' => $acceptingOrders ? 1 : 0,
                'accepting_reservations' => $acceptingReservations ? 1 : 0,
                'updated_at' => now(),
            ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_accepting_toggles_updated',
                entityType: 'restaurants',
                entityId: $targetId,
                oldValues: [
                    'accepting_orders' => (bool) $restaurant->accepting_orders,
                    'accepting_reservations' => (bool) $restaurant->accepting_reservations,
                ],
                newValues: [
                    'accepting_orders' => $acceptingOrders,
                    'accepting_reservations' => $acceptingReservations,
                ],
                request: $request,
            );
        });

        $fresh = DB::table('restaurants')->where('restaurant_id', $targetId)->first();

        return $this->formatProfile($fresh);
    }

    /**
     * @return array<string, mixed>
     */
    public function getOperatingHours(User $user, ?int $restaurantId = null): array
    {
        $restaurant = $this->requireActiveOwnedRestaurant($user, $restaurantId);

        $rows = DB::table('operating_hours')
            ->where('restaurant_id', $restaurant->restaurant_id)
            ->orderBy('day_of_week')
            ->orderBy('opening_time')
            ->get([
                'operating_hour_id',
                'day_of_week',
                'opening_time',
                'closing_time',
                'closes_next_day',
                'is_closed',
            ])
            ->map(fn ($row) => [
                'id' => (int) $row->operating_hour_id,
                'day_of_week' => (int) $row->day_of_week,
                'opening_time' => substr((string) $row->opening_time, 0, 5),
                'closing_time' => substr((string) $row->closing_time, 0, 5),
                'closes_next_day' => (bool) $row->closes_next_day,
                'is_closed' => (bool) $row->is_closed,
            ])
            ->values()
            ->all();

        return [
            'restaurant_id' => (int) $restaurant->restaurant_id,
            'operating_hours' => $rows,
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @return array<string, mixed>
     */
    public function updateOperatingHours(User $user, array $rows, ?int $restaurantId, Request $request): array
    {
        $restaurant = $this->requireActiveOwnedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $normalized = $this->validateAndNormalizeHours($rows);

        $previous = DB::table('operating_hours')
            ->where('restaurant_id', $targetId)
            ->orderBy('day_of_week')
            ->orderBy('opening_time')
            ->get(['day_of_week', 'opening_time', 'closing_time', 'closes_next_day', 'is_closed'])
            ->toArray();

        DB::transaction(function () use ($targetId, $normalized, $previous, $user, $request): void {
            DB::table('operating_hours')->where('restaurant_id', $targetId)->delete();

            $now = now();
            foreach ($normalized as $entry) {
                DB::table('operating_hours')->insert([
                    'restaurant_id' => $targetId,
                    'day_of_week' => $entry['day_of_week'],
                    'opening_time' => $entry['opening_time'].':00',
                    'closing_time' => $entry['closing_time'].':00',
                    'closes_next_day' => $entry['closes_next_day'] ? 1 : 0,
                    'is_closed' => $entry['is_closed'] ? 1 : 0,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_operating_hours_updated',
                entityType: 'restaurants',
                entityId: $targetId,
                oldValues: ['count' => count($previous)],
                newValues: ['count' => count($normalized)],
                request: $request,
            );
        });

        return $this->getOperatingHours($user, $targetId);
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @return array<int, array<string, mixed>>
     */
    private function validateAndNormalizeHours(array $rows): array
    {
        $byDay = [];
        $normalized = [];

        foreach ($rows as $idx => $row) {
            $day = (int) ($row['day_of_week'] ?? -1);
            if ($day < 0 || $day > 6) {
                throw ValidationException::withMessages([
                    "operating_hours.{$idx}.day_of_week" => ['Day of week must be between 0 (Sunday) and 6 (Saturday).'],
                ]);
            }

            if ((bool) ($row['is_closed'] ?? false)) {
                $byDay[$day]['closed'] = true;
                $normalized[] = [
                    'day_of_week' => $day, 'opening_time' => '00:00', 'closing_time' => '00:00',
                    'closes_next_day' => false, 'is_closed' => true,
                ];
                continue;
            }

            [$period, $entry] = $this->normalizeOpenHourRow($row, $idx, $day);
            $byDay[$day]['open'][] = $period;
            $normalized[] = $entry;
        }

        $this->assertNoOverlappingHours($byDay);

        return $normalized;
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array{0: array{start: int, end: int, idx: int}, 1: array<string, mixed>}
     */
    private function normalizeOpenHourRow(array $row, int $idx, int $day): array
    {
        $open = $this->parseTimeMinutes((string) ($row['opening_time'] ?? ''), "operating_hours.{$idx}.opening_time");
        $close = $this->parseTimeMinutes((string) ($row['closing_time'] ?? ''), "operating_hours.{$idx}.closing_time");
        $closesNextDay = (bool) ($row['closes_next_day'] ?? ($close['minutes'] <= $open['minutes']));

        if ($open['minutes'] === $close['minutes']) {
            throw ValidationException::withMessages([
                "operating_hours.{$idx}.closing_time" => ['Closing time must differ from opening time.'],
            ]);
        }
        if (! $closesNextDay && $close['minutes'] <= $open['minutes']) {
            throw ValidationException::withMessages([
                "operating_hours.{$idx}.closing_time" => ['Closing time must be after opening time unless marked as overnight.'],
            ]);
        }

        $endMinutes = $closesNextDay ? $close['minutes'] + 1440 : $close['minutes'];

        return [
            ['start' => $open['minutes'], 'end' => $endMinutes, 'idx' => $idx],
            [
                'day_of_week' => $day, 'opening_time' => $open['hhmm'], 'closing_time' => $close['hhmm'],
                'closes_next_day' => $closesNextDay, 'is_closed' => false,
            ],
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $byDay
     */
    private function assertNoOverlappingHours(array $byDay): void
    {
        foreach ($byDay as $day => $info) {
            if (! empty($info['closed']) && ! empty($info['open'])) {
                throw ValidationException::withMessages([
                    'operating_hours' => ["Day {$day} cannot be both closed and have open periods."],
                ]);
            }

            $periods = $info['open'] ?? [];
            usort($periods, fn ($a, $b) => $a['start'] <=> $b['start']);
            for ($i = 1; $i < count($periods); $i++) {
                if ($periods[$i]['start'] < $periods[$i - 1]['end']) {
                    throw ValidationException::withMessages([
                        "operating_hours.{$periods[$i]['idx']}.opening_time" => ["Operating hours overlap on day {$day}."],
                    ]);
                }
            }

            $nextDay = ($day + 1) % 7;
            $nextPeriods = $byDay[$nextDay]['open'] ?? [];
            foreach ($periods as $p) {
                if ($p['end'] > 1440) {
                    $spillover = $p['end'] - 1440;
                    foreach ($nextPeriods as $np) {
                        if ($np['start'] < $spillover) {
                            throw ValidationException::withMessages([
                                "operating_hours.{$np['idx']}.opening_time" => ["Overnight hours from day {$day} overlap with day {$nextDay}."],
                            ]);
                        }
                    }
                }
            }
        }
    }

    /**
     * @return array{minutes: int, hhmm: string}
     */
    private function parseTimeMinutes(string $raw, string $field): array
    {
        if (preg_match('/^(\d{2}):(\d{2})(?::\d{2})?$/', trim($raw), $m) !== 1) {
            throw ValidationException::withMessages([
                $field => ['Time must be in HH:MM format.'],
            ]);
        }

        $h = (int) $m[1];
        $min = (int) $m[2];
        if ($h < 0 || $h > 23 || $min < 0 || $min > 59) {
            throw ValidationException::withMessages([
                $field => ['Invalid time value.'],
            ]);
        }

        return [
            'minutes' => ($h * 60) + $min,
            'hhmm' => sprintf('%02d:%02d', $h, $min),
        ];
    }

    private function isPublicImageReferenced(string $relativePath): bool
    {
        $prefixed = '/storage/'.ltrim($relativePath, '/');

        return DB::table('restaurants')
            ->whereIn('logo_image', [$relativePath, $prefixed])
            ->orWhereIn('cover_image', [$relativePath, $prefixed])
            ->exists();
    }

    /**
     * @return array<string, mixed>
     */
    private function formatProfile(object $row): array
    {
        $addr = DB::table('addresses as a')
            ->join('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->join('cities as c', 'c.city_id', '=', 'b.city_id')
            ->join('provinces as p', 'p.province_id', '=', 'c.province_id')
            ->where('a.address_id', $row->address_id)
            ->first(['a.street', 'a.postal_code', 'b.barangay_name', 'c.city_name', 'p.province_name']);

        return [
            'restaurant_id' => (int) $row->restaurant_id,
            'restaurant_name' => $row->restaurant_name,
            'registered_name' => $row->registered_name,
            'business_type' => $row->business_type,
            'ownership_structure' => $row->ownership_structure,
            'restaurant_status' => $row->restaurant_status,
            'description' => $row->description,
            'contact_phone' => $row->contact_phone,
            'business_email' => $row->business_email,
            'logo_image' => $this->fileStorageService->publicUrl($row->logo_image),
            'cover_image' => $this->fileStorageService->publicUrl($row->cover_image),
            'offers_delivery' => (bool) $row->offers_delivery,
            'offers_pickup' => (bool) $row->offers_pickup,
            'offers_dine_in' => (bool) ($row->offers_dine_in ?? true),
            'accepts_reservations' => (bool) ($row->accepts_reservations ?? false),
            'accepting_orders' => (bool) $row->accepting_orders,
            'accepting_reservations' => (bool) $row->accepting_reservations,
            'inventory_deduction_mode' => $row->inventory_deduction_mode ?? 'manual',
            'delivery_radius' => $row->delivery_radius !== null ? (float) $row->delivery_radius : null,
            'reservation_min_notice_hours' => (int) ($row->reservation_min_notice_hours ?? 2),
            'reservation_max_party_size' => (int) ($row->reservation_max_party_size ?? 8),
            'reservation_notes' => $row->reservation_notes,
            'reservation_duration_minutes' => (int) ($row->reservation_duration_minutes ?? 90),
            'reservation_max_advance_days' => (int) ($row->reservation_max_advance_days ?? 30),
            'reservation_cancellation_cutoff_minutes' => (int) ($row->reservation_cancellation_cutoff_minutes ?? 120),
            'reservation_auto_confirm' => (bool) ($row->reservation_auto_confirm ?? false),
            'reservation_pending_expiry_minutes' => (int) ($row->reservation_pending_expiry_minutes ?? 120),
            'reservation_deposit_required' => (bool) ($row->reservation_deposit_required ?? false),
            'reservation_deposit_amount' => round((float) ($row->reservation_deposit_amount ?? 0), 2),
            'reservation_service_fee' => round((float) ($row->reservation_service_fee ?? 0), 2),
            'address' => $addr ? [
                'street' => $addr->street,
                'barangay' => $addr->barangay_name,
                'city' => $addr->city_name,
                'province' => $addr->province_name,
                'postal_code' => $addr->postal_code,
            ] : null,
        ];
    }

    /**
     * Retrieve operational settings + payout summary for the active owned restaurant.
     *
     * @return array<string, mixed>
     */
    public function getSettings(User $user, ?int $restaurantId = null): array
    {
        $restaurant = $this->requireActiveOwnedRestaurant($user, $restaurantId);
        $payout = DB::table('payout_accounts')
            ->where('restaurant_id', $restaurant->restaurant_id)
            ->first();

        return [
            'profile' => $this->formatProfile($restaurant),
            'payout_account' => $payout ? [
                'provider' => $payout->provider,
                'account_type' => $payout->account_type,
                'account_holder_name' => $payout->account_holder_name,
                'has_account_number' => ! empty($payout->account_number_encrypted),
                'updated_at' => $payout->updated_at,
            ] : null,
        ];
    }

    /**
     * Update non-verification operational restaurant settings.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function updateSettings(User $user, array $validated, ?int $restaurantId, Request $request): array
    {
        $restaurant = $this->requireActiveOwnedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $offersDelivery = array_key_exists('offers_delivery', $validated)
            ? (bool) $validated['offers_delivery']
            : (bool) $restaurant->offers_delivery;
        $offersPickup = array_key_exists('offers_pickup', $validated)
            ? (bool) $validated['offers_pickup']
            : (bool) $restaurant->offers_pickup;
        $offersDineIn = array_key_exists('offers_dine_in', $validated)
            ? (bool) $validated['offers_dine_in']
            : (bool) $restaurant->offers_dine_in;

        if (! $offersDelivery && ! $offersPickup && ! $offersDineIn) {
            throw ValidationException::withMessages([
                'offers_delivery' => ['At least one service (delivery, pickup, or dine-in) must remain enabled.'],
            ]);
        }

        $minNoticeHours = array_key_exists('reservation_min_notice_hours', $validated)
            ? (int) $validated['reservation_min_notice_hours']
            : (int) ($restaurant->reservation_min_notice_hours ?? 2);
        $maxAdvanceDays = array_key_exists('reservation_max_advance_days', $validated)
            ? (int) $validated['reservation_max_advance_days']
            : (int) ($restaurant->reservation_max_advance_days ?? 30);
        $autoConfirm = array_key_exists('reservation_auto_confirm', $validated)
            ? (bool) $validated['reservation_auto_confirm']
            : (bool) ($restaurant->reservation_auto_confirm ?? false);
        $depositRequired = array_key_exists('reservation_deposit_required', $validated)
            ? (bool) $validated['reservation_deposit_required']
            : (bool) ($restaurant->reservation_deposit_required ?? false);
        $depositAmount = array_key_exists('reservation_deposit_amount', $validated)
            ? round((float) $validated['reservation_deposit_amount'], 2)
            : round((float) ($restaurant->reservation_deposit_amount ?? 0), 2);
        $serviceFee = array_key_exists('reservation_service_fee', $validated)
            ? round((float) $validated['reservation_service_fee'], 2)
            : round((float) ($restaurant->reservation_service_fee ?? 0), 2);

        $crossErrors = [];
        if ($depositRequired && $depositAmount <= 0) {
            $crossErrors['reservation_deposit_amount'] = ['A deposit amount greater than 0 is required when deposits are enabled.'];
        }
        if ($depositRequired && $autoConfirm) {
            $crossErrors['reservation_auto_confirm'] = ['Auto-confirm cannot be enabled when a deposit is required because a deposit must be received before confirming.'];
        }
        if ($minNoticeHours > ($maxAdvanceDays * 24)) {
            $crossErrors['reservation_min_notice_hours'] = ['Minimum notice hours cannot exceed the maximum booking window (max advance days × 24).'];
        }
        if ($crossErrors !== []) {
            throw ValidationException::withMessages($crossErrors);
        }

        $updates = [
            'offers_delivery' => $offersDelivery ? 1 : 0,
            'offers_pickup' => $offersPickup ? 1 : 0,
            'offers_dine_in' => $offersDineIn ? 1 : 0,
            'accepts_reservations' => array_key_exists('accepts_reservations', $validated)
                ? ((bool) $validated['accepts_reservations'] ? 1 : 0)
                : (int) $restaurant->accepts_reservations,
            'accepting_orders' => array_key_exists('accepting_orders', $validated)
                ? ((bool) $validated['accepting_orders'] ? 1 : 0)
                : (int) $restaurant->accepting_orders,
            'accepting_reservations' => array_key_exists('accepting_reservations', $validated)
                ? ((bool) $validated['accepting_reservations'] ? 1 : 0)
                : (int) $restaurant->accepting_reservations,
            'inventory_deduction_mode' => array_key_exists('inventory_deduction_mode', $validated)
                ? (string) $validated['inventory_deduction_mode']
                : $restaurant->inventory_deduction_mode,
            'delivery_radius' => array_key_exists('delivery_radius', $validated)
                ? ($validated['delivery_radius'] !== null ? (float) $validated['delivery_radius'] : null)
                : $restaurant->delivery_radius,
            'reservation_min_notice_hours' => $minNoticeHours,
            'reservation_max_party_size' => array_key_exists('reservation_max_party_size', $validated)
                ? (int) $validated['reservation_max_party_size']
                : (int) $restaurant->reservation_max_party_size,
            'reservation_notes' => array_key_exists('reservation_notes', $validated)
                ? ($validated['reservation_notes'] !== null ? trim((string) $validated['reservation_notes']) : null)
                : $restaurant->reservation_notes,
            'reservation_duration_minutes' => array_key_exists('reservation_duration_minutes', $validated)
                ? (int) $validated['reservation_duration_minutes']
                : (int) ($restaurant->reservation_duration_minutes ?? 90),
            'reservation_max_advance_days' => $maxAdvanceDays,
            'reservation_cancellation_cutoff_minutes' => array_key_exists('reservation_cancellation_cutoff_minutes', $validated)
                ? (int) $validated['reservation_cancellation_cutoff_minutes']
                : (int) ($restaurant->reservation_cancellation_cutoff_minutes ?? 120),
            'reservation_auto_confirm' => $autoConfirm ? 1 : 0,
            'reservation_pending_expiry_minutes' => array_key_exists('reservation_pending_expiry_minutes', $validated)
                ? (int) $validated['reservation_pending_expiry_minutes']
                : (int) ($restaurant->reservation_pending_expiry_minutes ?? 120),
            'reservation_deposit_required' => $depositRequired ? 1 : 0,
            'reservation_deposit_amount' => number_format($depositAmount, 2, '.', ''),
            'reservation_service_fee' => number_format($serviceFee, 2, '.', ''),
            'updated_at' => now(),
        ];

        $oldValues = [
            'offers_delivery' => (bool) $restaurant->offers_delivery,
            'offers_pickup' => (bool) $restaurant->offers_pickup,
            'offers_dine_in' => (bool) $restaurant->offers_dine_in,
            'accepts_reservations' => (bool) $restaurant->accepts_reservations,
            'accepting_orders' => (bool) $restaurant->accepting_orders,
            'accepting_reservations' => (bool) $restaurant->accepting_reservations,
            'inventory_deduction_mode' => $restaurant->inventory_deduction_mode,
            'delivery_radius' => $restaurant->delivery_radius !== null ? (float) $restaurant->delivery_radius : null,
            'reservation_min_notice_hours' => (int) ($restaurant->reservation_min_notice_hours ?? 2),
            'reservation_max_party_size' => (int) ($restaurant->reservation_max_party_size ?? 8),
            'reservation_notes' => $restaurant->reservation_notes,
            'reservation_duration_minutes' => (int) ($restaurant->reservation_duration_minutes ?? 90),
            'reservation_max_advance_days' => (int) ($restaurant->reservation_max_advance_days ?? 30),
            'reservation_cancellation_cutoff_minutes' => (int) ($restaurant->reservation_cancellation_cutoff_minutes ?? 120),
            'reservation_auto_confirm' => (bool) ($restaurant->reservation_auto_confirm ?? false),
            'reservation_pending_expiry_minutes' => (int) ($restaurant->reservation_pending_expiry_minutes ?? 120),
            'reservation_deposit_required' => (bool) ($restaurant->reservation_deposit_required ?? false),
            'reservation_deposit_amount' => round((float) ($restaurant->reservation_deposit_amount ?? 0), 2),
            'reservation_service_fee' => round((float) ($restaurant->reservation_service_fee ?? 0), 2),
        ];

        DB::transaction(function () use ($targetId, $oldValues, $updates, $user, $request): void {
            DB::table('restaurants')->where('restaurant_id', $targetId)->update($updates);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_settings_updated',
                entityType: 'restaurants',
                entityId: $targetId,
                oldValues: $oldValues,
                newValues: $updates,
                request: $request,
            );
        });

        return $this->getSettings($user, $targetId);
    }
}
