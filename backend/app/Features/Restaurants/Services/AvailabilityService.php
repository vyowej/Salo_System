<?php

namespace App\Features\Restaurants\Services;

use Carbon\Carbon;
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
        $manilaNow = ($now ? $now->copy() : Carbon::now(self::TIMEZONE))->setTimezone(self::TIMEZONE);
        $todayDate = $manilaNow->toDateString();
        $yesterdayDate = $manilaNow->copy()->subDay()->toDateString();
        $todayDow = (int) $manilaNow->dayOfWeek; // 0 = Sunday ... 6 = Saturday
        $yesterdayDow = ($todayDow + 6) % 7;
        $currentTime = $manilaNow->format('H:i:s');

        $todayClosure = $closures->firstWhere('closure_date', $todayDate);
        $yesterdayClosure = $closures->firstWhere('closure_date', $yesterdayDate);

        $isOpen = $this->resolveIsOpen(
            $operatingHours,
            $todayClosure,
            $yesterdayClosure,
            $currentTime,
            $todayDow,
            $yesterdayDow,
        );

        $acceptingOrders = (bool) $restaurant->accepting_orders;
        $acceptingReservations = (bool) $restaurant->accepts_reservations && (bool) $restaurant->accepting_reservations;
        $temporarilyUnavailable = $todayClosure !== null;

        return [
            'is_open' => $isOpen,
            'status_label' => $isOpen ? 'Open' : 'Closed',
            'accepting_orders' => $acceptingOrders,
            'accepting_reservations' => $acceptingReservations,
            'not_accepting_orders' => ! $acceptingOrders,
            'not_accepting_reservations' => ! $acceptingReservations,
            'temporarily_unavailable' => $temporarilyUnavailable,
            'closure_reason' => $todayClosure?->reason,
        ];
    }

    /**
     * @param  Collection<int, object>  $operatingHours
     */
    private function resolveIsOpen(
        Collection $operatingHours,
        ?object $todayClosure,
        ?object $yesterdayClosure,
        string $currentTime,
        int $todayDow,
        int $yesterdayDow,
    ): bool {
        if ($todayClosure) {
            return false;
        }

        foreach ($operatingHours as $period) {
            if ($this->isPeriodOpenNow($period, $yesterdayClosure, $currentTime, $todayDow, $yesterdayDow)) {
                return true;
            }
        }

        return false;
    }

    private function isPeriodOpenNow(
        object $period,
        ?object $yesterdayClosure,
        string $currentTime,
        int $todayDow,
        int $yesterdayDow,
    ): bool {
        if ((int) $period->is_closed === 1) {
            return false;
        }

        $dow = (int) $period->day_of_week;
        $openTime = (string) $period->opening_time;
        $closeTime = (string) $period->closing_time;
        $closesNextDay = (int) $period->closes_next_day === 1;

        if ($dow === $todayDow) {
            return $closesNextDay
                ? $currentTime >= $openTime
                : ($currentTime >= $openTime && $currentTime < $closeTime);
        }

        return $dow === $yesterdayDow
            && $closesNextDay
            && ! $yesterdayClosure
            && $currentTime < $closeTime;
    }
}
