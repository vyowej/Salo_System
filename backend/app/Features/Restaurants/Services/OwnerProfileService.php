<?php

namespace App\Features\Restaurants\Services;

use App\Models\User;
use App\Support\AuditLogService;
use App\Support\FileStorageService;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OwnerProfileService
{
    public function __construct(
        private readonly FileStorageService $fileStorageService,
        private readonly AuditLogService $auditLogService,
    ) {}

    /**
     * Resolve and authorize an active restaurant owned by the given user.
     */
    public function requireActiveOwnedRestaurant(User $user, ?int $restaurantId = null): object
    {
        $query = DB::table('restaurant_owners as ro')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'ro.restaurant_id')
            ->where('ro.user_id', $user->user_id);

        if ($restaurantId !== null) {
            $query->where('ro.restaurant_id', $restaurantId);
        } else {
            $query->orderBy('ro.restaurant_id');
        }

        $restaurant = $query->select('r.*')->first();

        if (! $restaurant) {
            abort(403, 'Forbidden: you do not own this restaurant.');
        }

        if ($restaurant->restaurant_status !== 'active') {
            abort(
                403,
                "Restaurant workspace is only available for active, approved restaurants (current status: {$restaurant->restaurant_status})."
            );
        }

        return $restaurant;
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

        $updates = [
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

        DB::transaction(function () use ($targetId, $updates, $user, $oldValues, $newValues, $request): void {
            DB::table('restaurants')->where('restaurant_id', $targetId)->update($updates);

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

        $fresh = DB::table('restaurants')->where('restaurant_id', $targetId)->first();

        return $this->formatProfile($fresh);
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
        $newLogo = $oldLogo;
        $newCover = $oldCover;
        $newlyStoredPublic = [];

        try {
            if ($logoFile !== null) {
                $stored = $this->fileStorageService->storePublicImage(
                    file: $logoFile,
                    directory: "restaurants/{$targetId}",
                    fieldName: 'logo_image',
                );
                $newLogo = $stored['path'];
                $newlyStoredPublic[] = $newLogo;
            } elseif ($removeLogo) {
                $newLogo = null;
            }

            if ($coverFile !== null) {
                $stored = $this->fileStorageService->storePublicImage(
                    file: $coverFile,
                    directory: "restaurants/{$targetId}",
                    fieldName: 'cover_image',
                );
                $newCover = $stored['path'];
                $newlyStoredPublic[] = $newCover;
            } elseif ($removeCover) {
                $newCover = null;
            }

            DB::transaction(function () use ($targetId, $newLogo, $newCover, $oldLogo, $oldCover, $user, $request): void {
                DB::table('restaurants')->where('restaurant_id', $targetId)->update([
                    'logo_image' => $newLogo,
                    'cover_image' => $newCover,
                    'updated_at' => now(),
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
        } catch (\Throwable $e) {
            $this->fileStorageService->cleanupStoredPaths($newlyStoredPublic, []);
            throw $e;
        }

        // Delete replaced/removed files only if no DB record still references them
        if ($oldLogo !== null && $oldLogo !== '' && $oldLogo !== $newLogo) {
            $this->fileStorageService->deleteIfUnreferenced(
                'public',
                $oldLogo,
                fn (string $path): bool => $this->isPublicImageReferenced($path),
            );
        }

        if ($oldCover !== null && $oldCover !== '' && $oldCover !== $newCover) {
            $this->fileStorageService->deleteIfUnreferenced(
                'public',
                $oldCover,
                fn (string $path): bool => $this->isPublicImageReferenced($path),
            );
        }

        $fresh = DB::table('restaurants')->where('restaurant_id', $targetId)->first();

        return $this->formatProfile($fresh);
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

            $isClosed = (bool) ($row['is_closed'] ?? false);
            if ($isClosed) {
                $byDay[$day]['closed'] = true;
                $normalized[] = [
                    'day_of_week' => $day,
                    'opening_time' => '00:00',
                    'closing_time' => '00:00',
                    'closes_next_day' => false,
                    'is_closed' => true,
                ];
                continue;
            }

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
            $byDay[$day]['open'][] = [
                'start' => $open['minutes'],
                'end' => $endMinutes,
                'idx' => $idx,
            ];

            $normalized[] = [
                'day_of_week' => $day,
                'opening_time' => $open['hhmm'],
                'closing_time' => $close['hhmm'],
                'closes_next_day' => $closesNextDay,
                'is_closed' => false,
            ];
        }

        // Reject mixed closed + open rows on the same day, and overlapping periods
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

            // Check overnight spillover into next day
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

        return $normalized;
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
            'accepting_orders' => (bool) $row->accepting_orders,
            'accepting_reservations' => (bool) $row->accepting_reservations,
            'address' => $addr ? [
                'street' => $addr->street,
                'barangay' => $addr->barangay_name,
                'city' => $addr->city_name,
                'province' => $addr->province_name,
                'postal_code' => $addr->postal_code,
            ] : null,
        ];
    }
}
