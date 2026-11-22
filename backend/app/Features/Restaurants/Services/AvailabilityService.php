<?php

namespace App\Features\Restaurants\Services;

use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

class AvailabilityService
{
    public const TIMEZONE = 'Asia/Manila';

    /**
     * Compute real-time restaurant availability in Asia/Manila from operating hours,
     * closures, and restaurant pause toggles.
     *
     * @param  Collection<int, object>  $operatingHours
     * @param  Collection<int, object>  $closures
     * @return array<string, mixed>
     */
    public function compute(object $restaurant, Collection $operatingHours, Collection $closures, ?Carbon $now = null): array
    {
        $manilaNow = CarbonImmutable::instance(
            ($now ? $now->copy() : Carbon::now(self::TIMEZONE))->setTimezone(self::TIMEZONE)
        );
        $todayDate = $manilaNow->toDateString();
        $yesterdayDate = $manilaNow->subDay()->toDateString();

        $todayClosure = $closures->firstWhere('closure_date', $todayDate);
        $todaySchedule = $this->resolveOperatingScheduleForDate($operatingHours, $closures, $todayDate);
        $yesterdaySchedule = $this->resolveOperatingScheduleForDate($operatingHours, $closures, $yesterdayDate);

        $isOpen = false;
        if ($todayClosure === null) {
            foreach (array_merge($todaySchedule['periods'], $yesterdaySchedule['periods']) as $period) {
                if ($manilaNow->greaterThanOrEqualTo($period['start']) && $manilaNow->lessThan($period['end'])) {
                    $isOpen = true;
                    break;
                }
            }
        }

        $acceptingOrders = (bool) $restaurant->accepting_orders;
        $acceptingReservations = (bool) $restaurant->accepts_reservations && (bool) $restaurant->accepting_reservations;
        $temporarilyUnavailable = $todayClosure !== null;

        $result = [
            'is_open' => $isOpen,
            'status_label' => $isOpen ? 'Open' : 'Closed',
            'accepting_orders' => $acceptingOrders,
            'accepting_reservations' => $acceptingReservations,
            'not_accepting_orders' => ! $acceptingOrders,
            'not_accepting_reservations' => ! $acceptingReservations,
            'temporarily_unavailable' => $temporarilyUnavailable,
            'closure_reason' => $todayClosure?->reason,
        ];

        if (property_exists($restaurant, 'active_tables_count') || property_exists($restaurant, 'has_active_tables')) {
            $activeTablesCount = (int) ($restaurant->active_tables_count ?? ($restaurant->has_active_tables ?? 0));
            $result['can_reserve'] = $acceptingReservations && $activeTablesCount > 0;
        }

        return $result;
    }

    /**
     * Resolve concrete operating periods [start => CarbonImmutable, end => CarbonImmutable]
     * originating on the given calendar date in Asia/Manila, accounting for split shifts,
     * closes_next_day = 1, is_closed = 1, and restaurant_closures.
     *
     * @param  Collection<int, object>|array<int, object>  $operatingHours
     * @param  Collection<int, object>|array<int, object>  $closures
     * @return array{is_closed: bool, closure_reason: ?string, periods: array<int, array{start: CarbonImmutable, end: CarbonImmutable, opening_time: string, closing_time: string, closes_next_day: bool}>}
     */
    public function resolveOperatingScheduleForDate(
        Collection|array $operatingHours,
        Collection|array $closures,
        CarbonInterface|string $date,
    ): array {
        $hoursCollection = $operatingHours instanceof Collection ? $operatingHours : collect($operatingHours);
        $closuresCollection = $closures instanceof Collection ? $closures : collect($closures);

        $targetDay = ($date instanceof CarbonInterface
            ? CarbonImmutable::instance($date)->setTimezone(self::TIMEZONE)
            : CarbonImmutable::parse((string) $date, self::TIMEZONE)
        )->startOfDay();

        $dateStr = $targetDay->format('Y-m-d');
        $dow = (int) $targetDay->dayOfWeek;

        $closure = $closuresCollection->first(
            static fn (object $item): bool => (string) ($item->closure_date ?? '') === $dateStr
        );

        if ($closure !== null) {
            return [
                'is_closed' => true,
                'closure_reason' => isset($closure->reason) && trim((string) $closure->reason) !== ''
                    ? trim((string) $closure->reason)
                    : null,
                'periods' => [],
            ];
        }

        $matchingRows = $hoursCollection
            ->filter(static fn (object $row): bool => (int) ($row->day_of_week ?? -1) === $dow && (int) ($row->is_closed ?? 0) === 0)
            ->sortBy(static fn (object $row): string => (string) ($row->opening_time ?? '00:00:00'))
            ->values();

        if ($matchingRows->isEmpty()) {
            return [
                'is_closed' => true,
                'closure_reason' => null,
                'periods' => [],
            ];
        }

        $periods = [];
        foreach ($matchingRows as $row) {
            $openTime = (string) $row->opening_time;
            $closeTime = (string) $row->closing_time;
            $closesNextDay = (int) ($row->closes_next_day ?? 0) === 1;

            $start = CarbonImmutable::parse("{$dateStr} {$openTime}", self::TIMEZONE);
            $endBase = CarbonImmutable::parse("{$dateStr} {$closeTime}", self::TIMEZONE);
            $end = ($closesNextDay || $endBase->lessThanOrEqualTo($start))
                ? $endBase->addDay()
                : $endBase;

            $periods[] = [
                'start' => $start,
                'end' => $end,
                'opening_time' => $openTime,
                'closing_time' => $closeTime,
                'closes_next_day' => $closesNextDay,
            ];
        }

        return [
            'is_closed' => false,
            'closure_reason' => null,
            'periods' => $periods,
        ];
    }
}
