<?php

namespace App\Features\Reservations\Services;

use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Features\Reservations\Support\ReservationExpiry;
use App\Features\Reservations\Support\ReservationStatus;
use App\Features\Restaurants\Services\AvailabilityService;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ReservationAvailabilityService
{
    public const TIMEZONE = 'Asia/Manila';

    public const REASON_RESTAURANT_UNAVAILABLE = 'RESTAURANT_UNAVAILABLE';
    public const REASON_RESERVATIONS_NOT_OFFERED = 'RESERVATIONS_NOT_OFFERED';
    public const REASON_NOT_ACCEPTING = 'NOT_ACCEPTING';
    public const REASON_NO_TABLES = 'NO_TABLES';
    public const REASON_PARTY_TOO_LARGE = 'PARTY_TOO_LARGE';
    public const REASON_PAST_TIME = 'PAST_TIME';
    public const REASON_TOO_SOON = 'TOO_SOON';
    public const REASON_TOO_FAR_AHEAD = 'TOO_FAR_AHEAD';
    public const REASON_CLOSED = 'CLOSED';
    public const REASON_FULLY_BOOKED = 'FULLY_BOOKED';
    public const REASON_NO_FIT = 'NO_FIT';

    public function __construct(
        private readonly AvailabilityService $availabilityService,
    ) {}

    /**
     * Load restaurant reservation policy settings and active table capacity summary.
     *
     * @param  Collection<int, object>|null  $activeTables
     * @return array<string, mixed>
     */
    public function getBookingSettings(
        int $restaurantId,
        ?object $restaurantRow = null,
        ?Collection $activeTables = null,
    ): array {
        $restaurant = $restaurantRow ?? DB::table('restaurants')
            ->where('restaurant_id', $restaurantId)
            ->first([
                'restaurant_id',
                'restaurant_name',
                'offers_dine_in',
                'accepts_reservations',
                'accepting_orders',
                'accepting_reservations',
                'restaurant_status',
                'is_published',
                'reservation_min_notice_hours',
                'reservation_max_party_size',
                'reservation_notes',
                'reservation_duration_minutes',
                'reservation_max_advance_days',
                'reservation_cancellation_cutoff_minutes',
                'reservation_auto_confirm',
                'reservation_pending_expiry_minutes',
                'reservation_deposit_required',
                'reservation_deposit_amount',
                'reservation_service_fee',
            ]);

        if (! $restaurant) {
            throw new NotFoundHttpException('Restaurant not found.');
        }

        $tables = $activeTables ?? $this->loadActiveTables($restaurantId);

        $activeTableCount = $tables->count();
        $largestTableCapacity = $activeTableCount > 0
            ? (int) $tables->max(static fn (object $t): int => (int) $t->seating_capacity)
            : 0;
        $smallestMinPartySize = $activeTableCount > 0
            ? (int) $tables->min(static fn (object $t): int => max(1, (int) ($t->min_party_size ?? 1)))
            : 1;

        $diningAreasMap = [];
        foreach ($tables as $t) {
            if ($t->dining_area !== null && trim((string) $t->dining_area) !== '') {
                $clean = trim((string) $t->dining_area);
                $key = mb_strtolower($clean);
                if (! isset($diningAreasMap[$key])) {
                    $diningAreasMap[$key] = $clean;
                }
            }
        }
        $diningAreas = array_values($diningAreasMap);
        natcasesort($diningAreas);
        $diningAreas = array_values($diningAreas);

        $defaultDuration = max(30, (int) config('salo.reservations.default_duration_minutes', 90));
        $slotInterval = max(15, (int) config('salo.reservations.slot_interval_minutes', 30));
        $turnoverBuffer = max(0, (int) config('salo.reservations.turnover_buffer_minutes', 0));

        $maxPartySetting = max(1, (int) ($restaurant->reservation_max_party_size ?? 8));
        $effectiveMaxParty = $activeTableCount > 0
            ? min($maxPartySetting, $largestTableCapacity)
            : $maxPartySetting;

        $isPublished = ! property_exists($restaurant, 'is_published') || (bool) $restaurant->is_published;
        $isActiveStatus = ((string) ($restaurant->restaurant_status ?? '')) === 'active';
        $acceptsReservations = (bool) ($restaurant->accepts_reservations ?? false);
        $acceptingReservations = (bool) ($restaurant->accepting_reservations ?? false);

        return [
            'restaurant_id' => (int) $restaurant->restaurant_id,
            'restaurant_name' => (string) $restaurant->restaurant_name,
            'offers_dine_in' => (bool) ($restaurant->offers_dine_in ?? false),
            'accepts_reservations' => $acceptsReservations,
            'accepting_reservations' => $acceptingReservations,
            'restaurant_status' => (string) ($restaurant->restaurant_status ?? 'pending'),
            'is_published' => $isPublished,
            'can_reserve' => $isActiveStatus
                && $isPublished
                && $acceptsReservations
                && $acceptingReservations
                && $activeTableCount > 0,
            'reservation_min_notice_hours' => max(0, (int) ($restaurant->reservation_min_notice_hours ?? 2)),
            'reservation_max_party_size' => $maxPartySetting,
            'effective_max_party_size' => $effectiveMaxParty,
            'smallest_min_party_size' => $smallestMinPartySize,
            'reservation_notes' => $restaurant->reservation_notes !== null && trim((string) $restaurant->reservation_notes) !== ''
                ? (string) $restaurant->reservation_notes
                : null,
            'reservation_duration_minutes' => max(30, (int) ($restaurant->reservation_duration_minutes ?? $defaultDuration)),
            'reservation_max_advance_days' => max(1, (int) ($restaurant->reservation_max_advance_days ?? 30)),
            'reservation_cancellation_cutoff_minutes' => max(0, (int) ($restaurant->reservation_cancellation_cutoff_minutes ?? 120)),
            'reservation_auto_confirm' => (bool) ($restaurant->reservation_auto_confirm ?? false),
            'reservation_pending_expiry_minutes' => max(5, (int) ($restaurant->reservation_pending_expiry_minutes ?? 120)),
            'reservation_deposit_required' => (bool) ($restaurant->reservation_deposit_required ?? false),
            'reservation_deposit_amount' => number_format((float) ($restaurant->reservation_deposit_amount ?? 0), 2, '.', ''),
            'reservation_service_fee' => number_format((float) ($restaurant->reservation_service_fee ?? 0), 2, '.', ''),
            'slot_interval_minutes' => $slotInterval,
            'turnover_buffer_minutes' => $turnoverBuffer,
            'dining_areas' => $diningAreas,
            'active_table_count' => $activeTableCount,
            'largest_table_capacity' => $largestTableCapacity,
        ];
    }

    /**
     * Build public reservation info payload for GET /api/restaurants/{id}/reservation-info.
     * Throws 404 if the restaurant does not exist or is not active/published.
     *
     * @return array<string, mixed>
     */
    public function getPublicReservationInfo(int $restaurantId, ?CarbonInterface $now = null): array
    {
        $restaurant = $this->requirePublicActiveRestaurant($restaurantId);
        $tables = $this->loadActiveTables($restaurantId);
        $settings = $this->getBookingSettings($restaurantId, $restaurant, $tables);

        $manilaNow = $this->toManilaImmutable($now);
        $todayStr = $manilaNow->format('Y-m-d');
        $yesterdayStr = $manilaNow->subDay()->format('Y-m-d');

        $hours = DB::table('operating_hours')
            ->where('restaurant_id', $restaurantId)
            ->orderBy('day_of_week')
            ->orderBy('opening_time')
            ->get();

        $closures = DB::table('restaurant_closures')
            ->where('restaurant_id', $restaurantId)
            ->whereIn('closure_date', [$todayStr, $yesterdayStr])
            ->get();

        $restaurantForAvail = clone $restaurant;
        $restaurantForAvail->active_tables_count = $settings['active_table_count'];

        $liveAvailability = $this->availabilityService->compute(
            $restaurantForAvail,
            $hours,
            $closures,
            Carbon::instance($manilaNow),
        );

        $reason = $this->checkRestaurantAndTablePreconditions($settings);

        return [
            'restaurant_id' => $settings['restaurant_id'],
            'restaurant_name' => $settings['restaurant_name'],
            'bookable' => $reason === null,
            'can_reserve' => $settings['can_reserve'],
            'reason_code' => $reason['code'] ?? null,
            'message' => $reason['message'] ?? 'Restaurant accepts table reservations.',
            'offers_dine_in' => $settings['offers_dine_in'],
            'accepts_reservations' => $settings['accepts_reservations'],
            'accepting_reservations' => $settings['accepting_reservations'],
            'is_open' => $liveAvailability['is_open'],
            'status_label' => $liveAvailability['status_label'],
            'temporarily_unavailable' => $liveAvailability['temporarily_unavailable'],
            'closure_reason' => $liveAvailability['closure_reason'],
            'reservation_min_notice_hours' => $settings['reservation_min_notice_hours'],
            'reservation_max_party_size' => $settings['reservation_max_party_size'],
            'effective_max_party_size' => $settings['effective_max_party_size'],
            'smallest_min_party_size' => $settings['smallest_min_party_size'],
            'reservation_notes' => $settings['reservation_notes'],
            'reservation_duration_minutes' => $settings['reservation_duration_minutes'],
            'reservation_max_advance_days' => $settings['reservation_max_advance_days'],
            'reservation_cancellation_cutoff_minutes' => $settings['reservation_cancellation_cutoff_minutes'],
            'reservation_auto_confirm' => $settings['reservation_auto_confirm'],
            'reservation_deposit_required' => $settings['reservation_deposit_required'],
            'reservation_deposit_amount' => $settings['reservation_deposit_amount'],
            'reservation_service_fee' => $settings['reservation_service_fee'],
            'slot_interval_minutes' => $settings['slot_interval_minutes'],
            'dining_areas' => $settings['dining_areas'],
            'active_table_count' => $settings['active_table_count'],
            'largest_table_capacity' => $settings['largest_table_capacity'],
        ];
    }

    /**
     * Resolve operating periods [start CarbonImmutable, end CarbonImmutable] for a calendar date in Asia/Manila,
     * reusing AvailabilityService::resolveOperatingScheduleForDate().
     *
     * @param  int|Collection<int, object>|array<int, object>  $restaurantOrHours
     * @param  Collection<int, object>|array<int, object>|null  $closures
     * @return array{is_closed: bool, closure_reason: ?string, periods: array<int, array{start: CarbonImmutable, end: CarbonImmutable, opening_time: string, closing_time: string, closes_next_day: bool}>}
     */
    public function getOperatingPeriodsForDate(
        int|Collection|array $restaurantOrHours,
        CarbonInterface|string $date,
        Collection|array|null $closures = null,
    ): array {
        $targetDay = $this->parseManilaDate($date);
        $dateStr = $targetDay->format('Y-m-d');

        if (is_int($restaurantOrHours)) {
            $restaurantId = $restaurantOrHours;
            $hours = DB::table('operating_hours')
                ->where('restaurant_id', $restaurantId)
                ->where('day_of_week', (int) $targetDay->dayOfWeek)
                ->orderBy('opening_time')
                ->get();

            $closureRows = $closures ?? DB::table('restaurant_closures')
                ->where('restaurant_id', $restaurantId)
                ->where('closure_date', $dateStr)
                ->get(['closure_date', 'reason']);

            return $this->availabilityService->resolveOperatingScheduleForDate($hours, $closureRows, $targetDay);
        }

        return $this->availabilityService->resolveOperatingScheduleForDate(
            $restaurantOrHours,
            $closures ?? collect(),
            $targetDay,
        );
    }

    /**
     * Validate whether a booking window [start, end] and party size satisfy all restaurant policies,
     * notice/advance limits, and operating hours / closure rules.
     *
     * Returns null when valid, or ['code' => string, 'message' => string] when invalid.
     *
     * @param  array<string, mixed>  $settings
     * @param  array{is_closed: bool, closure_reason: ?string, periods: array<int, array{start: CarbonImmutable, end: CarbonImmutable}>}|null  $scheduleForDate
     * @return array{code: string, message: string}|null
     */
    public function validateBookingWindow(
        array $settings,
        CarbonInterface $start,
        CarbonInterface $end,
        int $partySize,
        ?CarbonInterface $now = null,
        ?array $scheduleForDate = null,
    ): ?array {
        // 1–4. Restaurant active/published, offers reservations, accepting toggle, active tables
        $precondition = $this->checkRestaurantAndTablePreconditions($settings);
        if ($precondition !== null) {
            return $precondition;
        }

        // 5. Party size bounds
        $partyError = $this->checkPartySizeBounds($settings, $partySize);
        if ($partyError !== null) {
            return $partyError;
        }

        $manilaNow = $this->toManilaImmutable($now);
        $manilaStart = $this->toManilaImmutable($start);
        $manilaEnd = $this->toManilaImmutable($end);

        // 6. Start in the past
        if ($manilaStart->lessThan($manilaNow)) {
            return [
                'code' => self::REASON_PAST_TIME,
                'message' => 'The selected reservation time has already passed.',
            ];
        }

        // 7. Minimum notice hours
        $minNoticeHours = max(0, (int) ($settings['reservation_min_notice_hours'] ?? 0));
        if ($minNoticeHours > 0 && $manilaStart->lessThan($manilaNow->addHours($minNoticeHours))) {
            return [
                'code' => self::REASON_TOO_SOON,
                'message' => "Reservations require at least {$minNoticeHours} hour(s) advance notice.",
            ];
        }

        // Resolve schedule for the start date (and previous day's overnight schedule if applicable)
        $restaurantId = (int) ($settings['restaurant_id'] ?? 0);
        $startDay = $manilaStart->startOfDay();
        $primarySchedule = $scheduleForDate ?? $this->getOperatingPeriodsForDate($restaurantId, $startDay);

        $fitsPrimaryPeriod = $this->windowFitsAnyPeriod($manilaStart, $manilaEnd, $primarySchedule['periods']);
        $effectiveServiceDay = $startDay;

        if (! $fitsPrimaryPeriod && $scheduleForDate === null && $restaurantId > 0) {
            $prevDay = $startDay->subDay();
            $prevSchedule = $this->getOperatingPeriodsForDate($restaurantId, $prevDay);
            if (! $prevSchedule['is_closed'] && $this->windowFitsAnyPeriod($manilaStart, $manilaEnd, $prevSchedule['periods'])) {
                $fitsPrimaryPeriod = true;
                $effectiveServiceDay = $prevDay;
                $primarySchedule = $prevSchedule;
            }
        }

        // 8. Max advance days
        $maxAdvanceDays = max(1, (int) ($settings['reservation_max_advance_days'] ?? 30));
        $latestAllowedDay = $manilaNow->startOfDay()->addDays($maxAdvanceDays);
        if ($effectiveServiceDay->greaterThan($latestAllowedDay)) {
            return [
                'code' => self::REASON_TOO_FAR_AHEAD,
                'message' => "Reservations can only be booked up to {$maxAdvanceDays} day(s) in advance.",
            ];
        }

        // 9. Operating hours and closure check
        if ($manilaEnd->lessThanOrEqualTo($manilaStart) || $primarySchedule['is_closed'] || ! $fitsPrimaryPeriod) {
            $closureReason = $primarySchedule['closure_reason'] ?? null;
            $message = $closureReason !== null && $closureReason !== ''
                ? "The restaurant is closed on this date ({$closureReason})."
                : 'The selected time is outside the restaurant\'s operating hours.';

            return [
                'code' => self::REASON_CLOSED,
                'message' => $message,
            ];
        }

        return null;
    }

    /**
     * Generate candidate reservation start/end slots for a calendar date in Asia/Manila.
     *
     * @param  array<string, mixed>  $settings
     * @param  array{is_closed: bool, closure_reason: ?string, periods: array<int, array{start: CarbonImmutable, end: CarbonImmutable}>}|null  $schedule
     * @return array<int, array{start: CarbonImmutable, end: CarbonImmutable, start_iso: string, end_iso: string, time: string, time_label: string}>
     */
    public function generateSlots(
        array $settings,
        CarbonInterface|string $date,
        ?array $schedule = null,
        ?int $durationMinutes = null,
    ): array {
        $targetDay = $this->parseManilaDate($date);
        $resolvedSchedule = $schedule ?? $this->getOperatingPeriodsForDate((int) ($settings['restaurant_id'] ?? 0), $targetDay);

        if ($resolvedSchedule['is_closed'] || $resolvedSchedule['periods'] === []) {
            return [];
        }

        $duration = max(
            15,
            (int) ($durationMinutes ?? $settings['reservation_duration_minutes'] ?? config('salo.reservations.default_duration_minutes', 90))
        );
        $step = max(
            15,
            (int) ($settings['slot_interval_minutes'] ?? config('salo.reservations.slot_interval_minutes', 30))
        );

        $slots = [];
        $seenStarts = [];
        $maxSlotsPerDay = 96;

        foreach ($resolvedSchedule['periods'] as $period) {
            /** @var CarbonImmutable $cursor */
            $cursor = $period['start'];
            /** @var CarbonImmutable $periodEnd */
            $periodEnd = $period['end'];
            $maxEnd = $cursor->addHours(24);
            if ($periodEnd->greaterThan($maxEnd)) {
                $periodEnd = $maxEnd;
            }

            while ($cursor->addMinutes($duration)->lessThanOrEqualTo($periodEnd)) {
                if (count($slots) >= $maxSlotsPerDay) {
                    break 2;
                }

                $startKey = $cursor->format('Y-m-d H:i');
                if (! isset($seenStarts[$startKey])) {
                    $seenStarts[$startKey] = true;
                    $slotEnd = $cursor->addMinutes($duration);

                    $slots[] = [
                        'start' => $cursor,
                        'end' => $slotEnd,
                        'start_iso' => OrderTimestampFormatter::toManilaIso($cursor) ?? $cursor->toIso8601String(),
                        'end_iso' => OrderTimestampFormatter::toManilaIso($slotEnd) ?? $slotEnd->toIso8601String(),
                        'time' => $cursor->format('H:i'),
                        'time_label' => $cursor->format('g:i A'),
                    ];
                }

                $cursor = $cursor->addMinutes($step);
            }
        }

        return $slots;
    }

    /**
     * Compute full slot-by-slot availability and day summary for a calendar date in Asia/Manila.
     * Executes ONE query for tables and ONE query for blocking reservations overlapping the date window.
     *
     * @return array<string, mixed>
     */
    public function getAvailabilityForDate(
        int $restaurantId,
        CarbonInterface|string $date,
        int $partySize,
        ?string $diningArea = null,
        ?int $durationMinutes = null,
        ?CarbonInterface $now = null,
        bool $requirePublicRestaurant = false,
    ): array {
        $restaurant = $requirePublicRestaurant
            ? $this->requirePublicActiveRestaurant($restaurantId)
            : null;

        $activeTables = $this->loadActiveTables($restaurantId);
        $settings = $this->getBookingSettings($restaurantId, $restaurant, $activeTables);

        $manilaNow = $this->toManilaImmutable($now);
        $targetDay = $this->parseManilaDate($date);
        $dateStr = $targetDay->format('Y-m-d');
        $cleanArea = $diningArea !== null && trim($diningArea) !== '' ? trim($diningArea) : null;
        $effectiveDuration = max(
            15,
            (int) ($durationMinutes ?? $settings['reservation_duration_minutes'])
        );

        $schedule = $this->getOperatingPeriodsForDate($restaurantId, $targetDay);
        $preconditionError = $this->checkRestaurantAndTablePreconditions($settings)
            ?? $this->checkPartySizeBounds($settings, $partySize);

        // Date-level window bounds
        $maxAdvanceDays = (int) $settings['reservation_max_advance_days'];
        $latestAllowedDay = $manilaNow->startOfDay()->addDays($maxAdvanceDays);
        $isDateBeforeToday = $targetDay->lessThan($manilaNow->startOfDay());
        $isDateTooFarAhead = $targetDay->greaterThan($latestAllowedDay);

        if ($schedule['is_closed']) {
            $closureReason = $schedule['closure_reason'];
            $closedMsg = $closureReason !== null && $closureReason !== ''
                ? "The restaurant is closed on {$dateStr} ({$closureReason})."
                : 'The restaurant is closed on the selected date.';

            $dayError = $preconditionError ?? ($isDateBeforeToday
                ? ['code' => self::REASON_PAST_TIME, 'message' => 'The selected date has already passed.']
                : ($isDateTooFarAhead
                    ? ['code' => self::REASON_TOO_FAR_AHEAD, 'message' => "Reservations can only be booked up to {$maxAdvanceDays} day(s) in advance."]
                    : ['code' => self::REASON_CLOSED, 'message' => $closedMsg]));

            return [
                'restaurant_id' => $restaurantId,
                'date' => $dateStr,
                'party_size' => $partySize,
                'dining_area' => $cleanArea,
                'duration_minutes' => $effectiveDuration,
                'bookable' => false,
                'is_closed' => true,
                'closure_reason' => $closureReason,
                'total_slots' => 0,
                'available_slots' => 0,
                'first_available_slot' => null,
                'reason_code' => $dayError['code'],
                'message' => $dayError['message'],
                'slots' => [],
            ];
        }

        $candidateSlots = $this->generateSlots($settings, $targetDay, $schedule, $effectiveDuration);
        if ($candidateSlots === []) {
            $error = $preconditionError ?? [
                'code' => self::REASON_CLOSED,
                'message' => 'No reservation time slots fit within the restaurant\'s operating hours on this date.',
            ];

            return [
                'restaurant_id' => $restaurantId,
                'date' => $dateStr,
                'party_size' => $partySize,
                'dining_area' => $cleanArea,
                'duration_minutes' => $effectiveDuration,
                'bookable' => false,
                'is_closed' => true,
                'closure_reason' => null,
                'total_slots' => 0,
                'available_slots' => 0,
                'first_available_slot' => null,
                'reason_code' => $error['code'],
                'message' => $error['message'],
                'slots' => [],
            ];
        }

        $fittingTables = $this->filterCandidateTables($activeTables, $partySize, $cleanArea);

        $windowStart = $candidateSlots[0]['start'];
        $windowEnd = $candidateSlots[count($candidateSlots) - 1]['end'];

        $blockingReservations = ($preconditionError === null && ! $isDateBeforeToday && ! $isDateTooFarAhead && $fittingTables->isNotEmpty())
            ? $this->loadBlockingReservationsInWindow(
                restaurantId: $restaurantId,
                windowStart: $windowStart,
                windowEnd: $windowEnd,
                pendingExpiryMinutes: (int) $settings['reservation_pending_expiry_minutes'],
                turnoverBufferMinutes: (int) $settings['turnover_buffer_minutes'],
                manilaNow: $manilaNow,
            )
            : collect();

        $minNoticeHours = (int) $settings['reservation_min_notice_hours'];
        $noticeThreshold = $manilaNow->addHours($minNoticeHours);
        $bufferMinutes = (int) $settings['turnover_buffer_minutes'];

        $formattedSlots = [];
        $availableSlotsCount = 0;
        $firstAvailableSlot = null;
        $slotReasonCounts = [];

        foreach ($candidateSlots as $slot) {
            /** @var CarbonImmutable $slotStart */
            $slotStart = $slot['start'];
            /** @var CarbonImmutable $slotEnd */
            $slotEnd = $slot['end'];

            $slotReason = null;
            $availableTablesForSlot = [];

            if ($preconditionError !== null) {
                $slotReason = $preconditionError['code'];
            } elseif ($isDateTooFarAhead) {
                $slotReason = self::REASON_TOO_FAR_AHEAD;
            } elseif ($slotStart->lessThan($manilaNow)) {
                $slotReason = self::REASON_PAST_TIME;
            } elseif ($minNoticeHours > 0 && $slotStart->lessThan($noticeThreshold)) {
                $slotReason = self::REASON_TOO_SOON;
            } elseif ($fittingTables->isEmpty()) {
                $slotReason = self::REASON_NO_FIT;
            } else {
                $freeTables = $this->filterUnbookedTablesForWindow(
                    $fittingTables,
                    $blockingReservations,
                    $slotStart,
                    $slotEnd,
                    $bufferMinutes,
                );

                if ($freeTables->isEmpty()) {
                    $slotReason = self::REASON_FULLY_BOOKED;
                } else {
                    $availableTablesForSlot = $freeTables->all();
                }
            }

            $availableCount = count($availableTablesForSlot);
            $isAvailable = $availableCount > 0 && $slotReason === null;

            $areasForSlot = [];
            foreach ($availableTablesForSlot as $t) {
                if ($t->dining_area !== null && trim((string) $t->dining_area) !== '') {
                    $areaLabel = trim((string) $t->dining_area);
                    $areasForSlot[mb_strtolower($areaLabel)] = $areaLabel;
                }
            }
            $areasList = array_values($areasForSlot);
            natcasesort($areasList);
            $areasList = array_values($areasList);

            if ($isAvailable) {
                $availableSlotsCount++;
                if ($firstAvailableSlot === null) {
                    $firstAvailableSlot = $slot['start_iso'];
                }
            } elseif ($slotReason !== null) {
                $slotReasonCounts[$slotReason] = ($slotReasonCounts[$slotReason] ?? 0) + 1;
            }

            $formattedSlots[] = [
                'start' => $slot['start_iso'],
                'end' => $slot['end_iso'],
                'time' => $slot['time'],
                'time_label' => $slot['time_label'],
                'available' => $isAvailable,
                'available_table_count' => $availableCount,
                'reason_code' => $slotReason,
                'dining_areas_available' => $areasList,
            ];
        }

        $dayReasonCode = null;
        $dayMessage = 'Available reservation times retrieved.';

        if ($availableSlotsCount === 0) {
            if ($preconditionError !== null) {
                $dayReasonCode = $preconditionError['code'];
                $dayMessage = $preconditionError['message'];
            } elseif ($isDateTooFarAhead) {
                $dayReasonCode = self::REASON_TOO_FAR_AHEAD;
                $dayMessage = "Reservations can only be booked up to {$maxAdvanceDays} day(s) in advance.";
            } elseif ($isDateBeforeToday) {
                $dayReasonCode = self::REASON_PAST_TIME;
                $dayMessage = 'The selected date has already passed.';
            } elseif (isset($slotReasonCounts[self::REASON_FULLY_BOOKED])) {
                $dayReasonCode = self::REASON_FULLY_BOOKED;
                $dayMessage = 'All reservation slots for this date are currently fully booked.';
            } elseif (isset($slotReasonCounts[self::REASON_NO_FIT])) {
                $dayReasonCode = self::REASON_NO_FIT;
                $dayMessage = 'No active tables match the requested party size and dining area.';
            } elseif (isset($slotReasonCounts[self::REASON_TOO_SOON])) {
                $dayReasonCode = self::REASON_TOO_SOON;
                $dayMessage = "Remaining times today are within the {$minNoticeHours}-hour minimum notice period.";
            } else {
                $dayReasonCode = self::REASON_PAST_TIME;
                $dayMessage = 'All reservation times for today have already passed.';
            }
        }

        return [
            'restaurant_id' => $restaurantId,
            'date' => $dateStr,
            'party_size' => $partySize,
            'dining_area' => $cleanArea,
            'duration_minutes' => $effectiveDuration,
            'bookable' => $availableSlotsCount > 0,
            'is_closed' => false,
            'closure_reason' => null,
            'total_slots' => count($formattedSlots),
            'available_slots' => $availableSlotsCount,
            'first_available_slot' => $firstAvailableSlot,
            'reason_code' => $dayReasonCode,
            'message' => $dayMessage,
            'slots' => $formattedSlots,
        ];
    }

    /**
     * Return all candidate tables that fit the party size and have no overlapping blocking reservation.
     * Supports SELECT ... FOR UPDATE row locking, reservation self-exclusion, and single-table verification
     * for Phase 4 (customer booking) and Phase 5 (owner table assignment).
     *
     * @return Collection<int, object>
     */
    public function getAvailableTables(
        int $restaurantId,
        CarbonInterface $start,
        CarbonInterface $end,
        int $partySize,
        ?string $diningArea = null,
        ?int $excludeReservationId = null,
        bool $lockForUpdate = false,
        ?int $onlyTableId = null,
        ?CarbonInterface $now = null,
        ?int $pendingExpiryMinutes = null,
    ): Collection {
        $manilaNow = $this->toManilaImmutable($now);
        $manilaStart = $this->toManilaImmutable($start);
        $manilaEnd = $this->toManilaImmutable($end);

        $resolvedPendingExpiryMinutes = $pendingExpiryMinutes !== null
            ? max(5, $pendingExpiryMinutes)
            : max(
                5,
                (int) (DB::table('restaurants')
                    ->where('restaurant_id', $restaurantId)
                    ->value('reservation_pending_expiry_minutes') ?? 120)
            );
        $turnoverBufferMinutes = max(0, (int) config('salo.reservations.turnover_buffer_minutes', 0));

        $tableQuery = DB::table('restaurant_tables')
            ->where('restaurant_id', $restaurantId)
            ->where('is_active', 1)
            ->where('min_party_size', '<=', $partySize)
            ->where('seating_capacity', '>=', $partySize);

        if ($diningArea !== null && trim($diningArea) !== '') {
            $tableQuery->whereRaw('LOWER(dining_area) = ?', [mb_strtolower(trim($diningArea))]);
        }

        if ($onlyTableId !== null) {
            $tableQuery->where('table_id', $onlyTableId);
        }

        // Lock in deterministic ascending table_id order to prevent deadlocks
        if ($lockForUpdate) {
            $tableQuery->orderBy('table_id', 'asc')->lockForUpdate();
        } else {
            $tableQuery
                ->orderBy('seating_capacity', 'asc')
                ->orderBy('dining_area', 'asc')
                ->orderBy('table_name', 'asc')
                ->orderBy('table_id', 'asc');
        }

        $candidateTables = $tableQuery->get([
            'table_id',
            'restaurant_id',
            'table_name',
            'dining_area',
            'description',
            'seating_capacity',
            'min_party_size',
            'is_active',
        ]);

        if ($candidateTables->isEmpty()) {
            return collect();
        }

        $candidateIds = $candidateTables->pluck('table_id')->map(static fn ($id): int => (int) $id)->all();
        $effectiveOverlapStart = $manilaStart->subMinutes($turnoverBufferMinutes)->format('Y-m-d H:i:s');
        $endStr = $manilaEnd->format('Y-m-d H:i:s');

        $overlapQuery = DB::table('reservations')
            ->where('restaurant_id', $restaurantId)
            ->whereIn('table_id', $candidateIds)
            ->whereIn('reservation_status', ReservationStatus::BLOCKING)
            ->where('reservation_start', '<', $endStr)
            ->where('reservation_end', '>', $effectiveOverlapStart);

        if ($excludeReservationId !== null) {
            $overlapQuery->where('reservation_id', '!=', $excludeReservationId);
        }

        if ($lockForUpdate) {
            $overlapQuery->lockForUpdate();
        }

        $bookedTableIds = $overlapQuery
            ->get([
                'table_id',
                'reservation_status',
                'reservation_start',
                'created_at',
                'approved_at',
                'updated_at',
            ])
            ->reject(static fn (object $row): bool => ReservationExpiry::isExpired($row, $manilaNow, $resolvedPendingExpiryMinutes))
            ->pluck('table_id')
            ->map(static fn ($id): int => (int) $id)
            ->flip()
            ->all();

        $available = $candidateTables
            ->reject(static fn (object $table): bool => isset($bookedTableIds[(int) $table->table_id]));

        if ($lockForUpdate) {
            $available = $available->sort(static function (object $a, object $b): int {
                return [(int) $a->seating_capacity, (string) ($a->dining_area ?? ''), (string) $a->table_name, (int) $a->table_id]
                    <=> [(int) $b->seating_capacity, (string) ($b->dining_area ?? ''), (string) $b->table_name, (int) $b->table_id];
            });
        }

        return $available->values();
    }

    /**
     * When a requested slot is full or unavailable, return up to config('salo.reservations.suggested_slot_window')
     * nearest available slots on the same service date.
     *
     * @param  array<string, mixed>|null  $dayAvailability
     * @return array<int, array<string, mixed>>
     */
    public function suggestAlternativeSlots(
        int $restaurantId,
        CarbonInterface|string $requestedStart,
        int $partySize,
        ?string $diningArea = null,
        ?int $durationMinutes = null,
        ?CarbonInterface $now = null,
        ?array $dayAvailability = null,
    ): array {
        $manilaRequested = $this->toManilaImmutable($requestedStart);
        $resolvedDay = $dayAvailability ?? $this->getAvailabilityForDate(
            restaurantId: $restaurantId,
            date: $manilaRequested->startOfDay(),
            partySize: $partySize,
            diningArea: $diningArea,
            durationMinutes: $durationMinutes,
            now: $now,
        );

        $slots = $resolvedDay['slots'] ?? [];
        if (! is_array($slots) || $slots === []) {
            return [];
        }

        $windowLimit = max(1, (int) config('salo.reservations.suggested_slot_window', 3));
        $requestedIso = OrderTimestampFormatter::toManilaIso($manilaRequested);

        $candidates = [];
        foreach ($slots as $slot) {
            if (empty($slot['available']) || (int) ($slot['available_table_count'] ?? 0) <= 0) {
                continue;
            }
            if ($slot['start'] === $requestedIso) {
                continue;
            }

            $slotStart = CarbonImmutable::parse((string) $slot['start'])->setTimezone(self::TIMEZONE);
            $diffMinutes = abs((int) $manilaRequested->diffInMinutes($slotStart, false));
            if ($diffMinutes === 0) {
                continue;
            }

            $candidates[] = [
                'diff_minutes' => $diffMinutes,
                'timestamp' => $slotStart->getTimestamp(),
                'payload' => [
                    'start' => $slot['start'],
                    'end' => $slot['end'],
                    'time' => $slot['time'],
                    'time_label' => $slot['time_label'],
                    'available_table_count' => (int) $slot['available_table_count'],
                    'dining_areas_available' => $slot['dining_areas_available'] ?? [],
                ],
            ];
        }

        usort($candidates, static function (array $a, array $b): int {
            if ($a['diff_minutes'] !== $b['diff_minutes']) {
                return $a['diff_minutes'] <=> $b['diff_minutes'];
            }

            return $a['timestamp'] <=> $b['timestamp'];
        });

        return array_values(array_map(
            static fn (array $item): array => $item['payload'],
            array_slice($candidates, 0, $windowLimit),
        ));
    }

    /**
     * Evaluate a specific slot for GET /api/restaurants/{id}/reservation-availability/tables,
     * returning validation result, best-fit available tables, and suggested alternative slots when none are free.
     *
     * @return array<string, mixed>
     */
    public function getSlotTablesOverview(
        int $restaurantId,
        CarbonInterface|string $start,
        int $partySize,
        ?string $diningArea = null,
        ?int $durationMinutes = null,
        ?CarbonInterface $now = null,
        bool $requirePublicRestaurant = false,
    ): array {
        $restaurant = $requirePublicRestaurant
            ? $this->requirePublicActiveRestaurant($restaurantId)
            : null;

        $activeTables = $this->loadActiveTables($restaurantId);
        $settings = $this->getBookingSettings($restaurantId, $restaurant, $activeTables);

        $manilaNow = $this->toManilaImmutable($now);
        $manilaStart = $this->toManilaImmutable($start);
        $duration = max(15, (int) ($durationMinutes ?? $settings['reservation_duration_minutes']));
        $manilaEnd = $manilaStart->addMinutes($duration);
        $cleanArea = $diningArea !== null && trim($diningArea) !== '' ? trim($diningArea) : null;

        $validationError = $this->validateBookingWindow(
            settings: $settings,
            start: $manilaStart,
            end: $manilaEnd,
            partySize: $partySize,
            now: $manilaNow,
        );

        if ($validationError !== null) {
            $alternatives = in_array($validationError['code'], [self::REASON_TOO_SOON, self::REASON_PAST_TIME], true)
                ? $this->suggestAlternativeSlots($restaurantId, $manilaStart, $partySize, $cleanArea, $duration, $manilaNow)
                : [];

            return [
                'restaurant_id' => $restaurantId,
                'start' => OrderTimestampFormatter::toManilaIso($manilaStart),
                'end' => OrderTimestampFormatter::toManilaIso($manilaEnd),
                'party_size' => $partySize,
                'dining_area' => $cleanArea,
                'duration_minutes' => $duration,
                'bookable' => false,
                'reason_code' => $validationError['code'],
                'message' => $validationError['message'],
                'available_tables' => [],
                'suggested_alternatives' => $alternatives,
            ];
        }

        $fittingTables = $this->filterCandidateTables($activeTables, $partySize, $cleanArea);
        if ($fittingTables->isEmpty()) {
            return [
                'restaurant_id' => $restaurantId,
                'start' => OrderTimestampFormatter::toManilaIso($manilaStart),
                'end' => OrderTimestampFormatter::toManilaIso($manilaEnd),
                'party_size' => $partySize,
                'dining_area' => $cleanArea,
                'duration_minutes' => $duration,
                'bookable' => false,
                'reason_code' => self::REASON_NO_FIT,
                'message' => 'No active tables match the requested party size and dining area.',
                'available_tables' => [],
                'suggested_alternatives' => $this->suggestAlternativeSlots(
                    $restaurantId,
                    $manilaStart,
                    $partySize,
                    $cleanArea,
                    $duration,
                    $manilaNow,
                ),
            ];
        }

        $availableTables = $this->getAvailableTables(
            restaurantId: $restaurantId,
            start: $manilaStart,
            end: $manilaEnd,
            partySize: $partySize,
            diningArea: $cleanArea,
            excludeReservationId: null,
            lockForUpdate: false,
            onlyTableId: null,
            now: $manilaNow,
        );

        if ($availableTables->isEmpty()) {
            return [
                'restaurant_id' => $restaurantId,
                'start' => OrderTimestampFormatter::toManilaIso($manilaStart),
                'end' => OrderTimestampFormatter::toManilaIso($manilaEnd),
                'party_size' => $partySize,
                'dining_area' => $cleanArea,
                'duration_minutes' => $duration,
                'bookable' => false,
                'reason_code' => self::REASON_FULLY_BOOKED,
                'message' => 'All suitable tables are already reserved for this time slot.',
                'available_tables' => [],
                'suggested_alternatives' => $this->suggestAlternativeSlots(
                    $restaurantId,
                    $manilaStart,
                    $partySize,
                    $cleanArea,
                    $duration,
                    $manilaNow,
                ),
            ];
        }

        return [
            'restaurant_id' => $restaurantId,
            'start' => OrderTimestampFormatter::toManilaIso($manilaStart),
            'end' => OrderTimestampFormatter::toManilaIso($manilaEnd),
            'party_size' => $partySize,
            'dining_area' => $cleanArea,
            'duration_minutes' => $duration,
            'bookable' => true,
            'reason_code' => null,
            'message' => 'Available tables retrieved.',
            'available_tables' => $availableTables->map(static fn (object $table): array => [
                'table_id' => (int) $table->table_id,
                'table_name' => (string) $table->table_name,
                'seating_capacity' => (int) $table->seating_capacity,
                'min_party_size' => (int) ($table->min_party_size ?? 1),
                'dining_area' => $table->dining_area,
                'description' => $table->description,
            ])->values()->all(),
            'suggested_alternatives' => [],
        ];
    }

    /**
     * Compute calendar month availability overview ('YYYY-MM') using ONE tables query and ONE reservations query.
     *
     * @return array<string, mixed>
     */
    public function getMonthOverview(
        int $restaurantId,
        string $month,
        int $partySize,
        ?CarbonInterface $now = null,
        bool $requirePublicRestaurant = false,
    ): array {
        $restaurant = $requirePublicRestaurant
            ? $this->requirePublicActiveRestaurant($restaurantId)
            : null;

        $activeTables = $this->loadActiveTables($restaurantId);
        $settings = $this->getBookingSettings($restaurantId, $restaurant, $activeTables);

        $manilaNow = $this->toManilaImmutable($now);
        $monthStart = CarbonImmutable::parse($month . '-01 00:00:00', self::TIMEZONE)->startOfMonth();
        $monthEnd = $monthStart->endOfMonth()->startOfDay();
        $daysInMonth = (int) $monthStart->daysInMonth;

        $operatingHours = DB::table('operating_hours')
            ->where('restaurant_id', $restaurantId)
            ->orderBy('day_of_week')
            ->orderBy('opening_time')
            ->get();

        $closures = DB::table('restaurant_closures')
            ->where('restaurant_id', $restaurantId)
            ->whereBetween('closure_date', [
                $monthStart->format('Y-m-d'),
                $monthEnd->addDay()->format('Y-m-d'),
            ])
            ->get(['closure_date', 'reason']);

        $preconditionError = $this->checkRestaurantAndTablePreconditions($settings)
            ?? $this->checkPartySizeBounds($settings, $partySize);

        $fittingTables = $this->filterCandidateTables($activeTables, $partySize, null);
        $todayDay = $manilaNow->startOfDay();
        $maxAdvanceDays = (int) $settings['reservation_max_advance_days'];
        $latestAllowedDay = $todayDay->addDays($maxAdvanceDays);
        $minNoticeHours = (int) $settings['reservation_min_notice_hours'];
        $noticeThreshold = $manilaNow->addHours($minNoticeHours);
        $bufferMinutes = (int) $settings['turnover_buffer_minutes'];

        // Cap the reservation query range to the intersection of the requested month and the bookable window
        $queryRangeStart = $monthStart->greaterThan($todayDay) ? $monthStart : $todayDay;
        $queryRangeEnd = $monthEnd->lessThan($latestAllowedDay) ? $monthEnd : $latestAllowedDay;

        $blockingReservations = ($preconditionError === null && $fittingTables->isNotEmpty() && $queryRangeStart->lessThanOrEqualTo($queryRangeEnd))
            ? $this->loadBlockingReservationsInWindow(
                restaurantId: $restaurantId,
                windowStart: $queryRangeStart->startOfDay(),
                windowEnd: $queryRangeEnd->addDays(2)->startOfDay(),
                pendingExpiryMinutes: (int) $settings['reservation_pending_expiry_minutes'],
                turnoverBufferMinutes: $bufferMinutes,
                manilaNow: $manilaNow,
            )
            : collect();

        $days = [];
        for ($d = 0; $d < $daysInMonth; $d++) {
            $day = $monthStart->addDays($d);
            $dateStr = $day->format('Y-m-d');

            if ($preconditionError !== null) {
                $days[] = [
                    'date' => $dateStr,
                    'status' => 'unavailable',
                    'available_slots' => 0,
                    'total_slots' => 0,
                    'reason_code' => $preconditionError['code'],
                ];
                continue;
            }

            if ($day->lessThan($todayDay)) {
                $days[] = [
                    'date' => $dateStr,
                    'status' => 'unavailable',
                    'available_slots' => 0,
                    'total_slots' => 0,
                    'reason_code' => self::REASON_PAST_TIME,
                ];
                continue;
            }

            if ($day->greaterThan($latestAllowedDay)) {
                $days[] = [
                    'date' => $dateStr,
                    'status' => 'unavailable',
                    'available_slots' => 0,
                    'total_slots' => 0,
                    'reason_code' => self::REASON_TOO_FAR_AHEAD,
                ];
                continue;
            }

            $schedule = $this->availabilityService->resolveOperatingScheduleForDate($operatingHours, $closures, $day);
            if ($schedule['is_closed']) {
                $days[] = [
                    'date' => $dateStr,
                    'status' => 'closed',
                    'available_slots' => 0,
                    'total_slots' => 0,
                    'reason_code' => self::REASON_CLOSED,
                ];
                continue;
            }

            $slots = $this->generateSlots($settings, $day, $schedule);
            $totalSlots = count($slots);

            if ($totalSlots === 0) {
                $days[] = [
                    'date' => $dateStr,
                    'status' => 'closed',
                    'available_slots' => 0,
                    'total_slots' => 0,
                    'reason_code' => self::REASON_CLOSED,
                ];
                continue;
            }

            $eligibleTimeSlots = 0;
            $pastCount = 0;
            $tooSoonCount = 0;
            $availableSlots = 0;

            foreach ($slots as $slot) {
                /** @var CarbonImmutable $slotStart */
                $slotStart = $slot['start'];
                /** @var CarbonImmutable $slotEnd */
                $slotEnd = $slot['end'];

                if ($slotStart->lessThan($manilaNow)) {
                    $pastCount++;
                    continue;
                }

                if ($minNoticeHours > 0 && $slotStart->lessThan($noticeThreshold)) {
                    $tooSoonCount++;
                    continue;
                }

                $eligibleTimeSlots++;

                if ($fittingTables->isEmpty()) {
                    continue;
                }

                $freeTables = $this->filterUnbookedTablesForWindow(
                    $fittingTables,
                    $blockingReservations,
                    $slotStart,
                    $slotEnd,
                    $bufferMinutes,
                );

                if ($freeTables->isNotEmpty()) {
                    $availableSlots++;
                }
            }

            if ($eligibleTimeSlots === 0) {
                $days[] = [
                    'date' => $dateStr,
                    'status' => 'unavailable',
                    'available_slots' => 0,
                    'total_slots' => $totalSlots,
                    'reason_code' => $tooSoonCount > 0 ? self::REASON_TOO_SOON : self::REASON_PAST_TIME,
                ];
                continue;
            }

            if ($fittingTables->isEmpty()) {
                $days[] = [
                    'date' => $dateStr,
                    'status' => 'full',
                    'available_slots' => 0,
                    'total_slots' => $totalSlots,
                    'reason_code' => self::REASON_NO_FIT,
                ];
                continue;
            }

            if ($availableSlots === 0) {
                $days[] = [
                    'date' => $dateStr,
                    'status' => 'full',
                    'available_slots' => 0,
                    'total_slots' => $totalSlots,
                    'reason_code' => self::REASON_FULLY_BOOKED,
                ];
                continue;
            }

            $status = ($availableSlots * 4 <= $totalSlots) ? 'limited' : 'available';

            $days[] = [
                'date' => $dateStr,
                'status' => $status,
                'available_slots' => $availableSlots,
                'total_slots' => $totalSlots,
                'reason_code' => null,
            ];
        }

        $hasBookableDay = collect($days)->contains(
            static fn (array $d): bool => in_array($d['status'], ['available', 'limited'], true)
        );

        return [
            'restaurant_id' => $restaurantId,
            'month' => $monthStart->format('Y-m'),
            'party_size' => $partySize,
            'bookable' => $preconditionError === null && $hasBookableDay,
            'reason_code' => $preconditionError['code'] ?? null,
            'message' => $preconditionError['message'] ?? 'Monthly reservation availability retrieved.',
            'days' => $days,
        ];
    }

    /**
     * Require that the restaurant exists, is active, and is published for public endpoints.
     * Throws 404 NotFoundHttpException otherwise.
     */
    public function requirePublicActiveRestaurant(int $restaurantId): object
    {
        $restaurant = DB::table('restaurants')
            ->where('restaurant_id', $restaurantId)
            ->where('restaurant_status', 'active')
            ->where('is_published', 1)
            ->first([
                'restaurant_id',
                'restaurant_name',
                'offers_dine_in',
                'accepts_reservations',
                'accepting_orders',
                'accepting_reservations',
                'restaurant_status',
                'is_published',
                'reservation_min_notice_hours',
                'reservation_max_party_size',
                'reservation_notes',
                'reservation_duration_minutes',
                'reservation_max_advance_days',
                'reservation_cancellation_cutoff_minutes',
                'reservation_auto_confirm',
                'reservation_pending_expiry_minutes',
                'reservation_deposit_required',
                'reservation_deposit_amount',
                'reservation_service_fee',
            ]);

        if (! $restaurant) {
            throw new NotFoundHttpException('Restaurant not found.');
        }

        return $restaurant;
    }

    /**
     * @param  array<string, mixed>  $settings
     * @return array{code: string, message: string}|null
     */
    private function checkRestaurantAndTablePreconditions(array $settings): ?array
    {
        if (($settings['restaurant_status'] ?? '') !== 'active' || empty($settings['is_published'])) {
            return [
                'code' => self::REASON_RESTAURANT_UNAVAILABLE,
                'message' => 'This restaurant is currently unavailable for reservations.',
            ];
        }

        if (empty($settings['accepts_reservations'])) {
            return [
                'code' => self::REASON_RESERVATIONS_NOT_OFFERED,
                'message' => 'This restaurant does not offer table reservations.',
            ];
        }

        if (empty($settings['accepting_reservations'])) {
            return [
                'code' => self::REASON_NOT_ACCEPTING,
                'message' => 'This restaurant is temporarily not accepting new reservations.',
            ];
        }

        if ((int) ($settings['active_table_count'] ?? 0) <= 0) {
            return [
                'code' => self::REASON_NO_TABLES,
                'message' => 'No active dining tables are currently configured for this restaurant.',
            ];
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $settings
     * @return array{code: string, message: string}|null
     */
    private function checkPartySizeBounds(array $settings, int $partySize): ?array
    {
        if ($partySize < 1) {
            return [
                'code' => self::REASON_PARTY_TOO_LARGE,
                'message' => 'Party size must be at least 1 guest.',
            ];
        }

        $maxSetting = (int) ($settings['reservation_max_party_size'] ?? 8);
        $largestTable = (int) ($settings['largest_table_capacity'] ?? 0);
        $effectiveMax = min($maxSetting, $largestTable);

        if ($partySize > $maxSetting || $partySize > $largestTable) {
            return [
                'code' => self::REASON_PARTY_TOO_LARGE,
                'message' => "This restaurant can accommodate up to {$effectiveMax} guests per reservation.",
            ];
        }

        return null;
    }

    /**
     * @return Collection<int, object>
     */
    private function loadActiveTables(int $restaurantId): Collection
    {
        return DB::table('restaurant_tables')
            ->where('restaurant_id', $restaurantId)
            ->where('is_active', 1)
            ->orderBy('seating_capacity', 'asc')
            ->orderBy('dining_area', 'asc')
            ->orderBy('table_name', 'asc')
            ->orderBy('table_id', 'asc')
            ->get([
                'table_id',
                'restaurant_id',
                'table_name',
                'dining_area',
                'description',
                'seating_capacity',
                'min_party_size',
                'is_active',
            ]);
    }

    /**
     * @param  Collection<int, object>  $activeTables
     * @return Collection<int, object>
     */
    private function filterCandidateTables(Collection $activeTables, int $partySize, ?string $diningArea): Collection
    {
        $normalizedArea = $diningArea !== null && trim($diningArea) !== ''
            ? mb_strtolower(trim($diningArea))
            : null;

        return $activeTables
            ->filter(static function (object $table) use ($partySize, $normalizedArea): bool {
                $minParty = max(1, (int) ($table->min_party_size ?? 1));
                $capacity = (int) $table->seating_capacity;

                if ($partySize < $minParty || $partySize > $capacity) {
                    return false;
                }

                if ($normalizedArea !== null) {
                    $tableArea = $table->dining_area !== null ? mb_strtolower(trim((string) $table->dining_area)) : '';
                    if ($tableArea !== $normalizedArea) {
                        return false;
                    }
                }

                return true;
            })
            ->values();
    }

    /**
     * Load all non-stale blocking reservations overlapping [windowStart, windowEnd] in ONE query.
     *
     * @return Collection<int, object>
     */
    private function loadBlockingReservationsInWindow(
        int $restaurantId,
        CarbonImmutable $windowStart,
        CarbonImmutable $windowEnd,
        int $pendingExpiryMinutes,
        int $turnoverBufferMinutes,
        CarbonImmutable $manilaNow,
    ): Collection {
        $effectiveStartStr = $windowStart->subMinutes($turnoverBufferMinutes)->format('Y-m-d H:i:s');
        $endStr = $windowEnd->format('Y-m-d H:i:s');

        return DB::table('reservations')
            ->where('restaurant_id', $restaurantId)
            ->whereNotNull('table_id')
            ->whereIn('reservation_status', ReservationStatus::BLOCKING)
            ->where('reservation_start', '<', $endStr)
            ->where('reservation_end', '>', $effectiveStartStr)
            ->get([
                'reservation_id',
                'table_id',
                'reservation_start',
                'reservation_end',
                'reservation_status',
                'created_at',
                'approved_at',
                'updated_at',
            ])
            ->reject(static fn (object $res): bool => ReservationExpiry::isExpired($res, $manilaNow, $pendingExpiryMinutes))
            ->map(static function (object $res): object {
                $res->start_carbon = CarbonImmutable::parse((string) $res->reservation_start, self::TIMEZONE);
                $res->end_carbon = CarbonImmutable::parse((string) $res->reservation_end, self::TIMEZONE);

                return $res;
            });
    }

    /**
     * @param  Collection<int, object>  $candidateTables
     * @param  Collection<int, object>  $blockingReservations
     * @return Collection<int, object>
     */
    private function filterUnbookedTablesForWindow(
        Collection $candidateTables,
        Collection $blockingReservations,
        CarbonImmutable $slotStart,
        CarbonImmutable $slotEnd,
        int $bufferMinutes,
    ): Collection {
        if ($blockingReservations->isEmpty()) {
            return $candidateTables;
        }

        $effectiveStart = $slotStart->subMinutes($bufferMinutes);

        $bookedTableIds = [];
        foreach ($blockingReservations as $res) {
            /** @var CarbonImmutable $resStart */
            $resStart = $res->start_carbon;
            /** @var CarbonImmutable $resEnd */
            $resEnd = $res->end_carbon;

            if ($resStart->lessThan($slotEnd) && $resEnd->greaterThan($effectiveStart)) {
                $bookedTableIds[(int) $res->table_id] = true;
            }
        }

        if ($bookedTableIds === []) {
            return $candidateTables;
        }

        return $candidateTables
            ->reject(static fn (object $table): bool => isset($bookedTableIds[(int) $table->table_id]))
            ->values();
    }

    /**
     * @param  array<int, array{start: CarbonImmutable, end: CarbonImmutable}>  $periods
     */
    private function windowFitsAnyPeriod(CarbonImmutable $start, CarbonImmutable $end, array $periods): bool
    {
        foreach ($periods as $period) {
            if ($start->greaterThanOrEqualTo($period['start']) && $end->lessThanOrEqualTo($period['end'])) {
                return true;
            }
        }

        return false;
    }

    private function toManilaImmutable(CarbonInterface|string|null $value): CarbonImmutable
    {
        if ($value === null || $value === '') {
            return CarbonImmutable::now(self::TIMEZONE);
        }

        if ($value instanceof CarbonInterface) {
            return CarbonImmutable::instance($value)->setTimezone(self::TIMEZONE);
        }

        return CarbonImmutable::parse((string) $value, self::TIMEZONE)->setTimezone(self::TIMEZONE);
    }

    private function parseManilaDate(CarbonInterface|string $date): CarbonImmutable
    {
        if ($date instanceof CarbonInterface) {
            return CarbonImmutable::instance($date)->setTimezone(self::TIMEZONE)->startOfDay();
        }

        return CarbonImmutable::parse((string) $date, self::TIMEZONE)->setTimezone(self::TIMEZONE)->startOfDay();
    }
}
