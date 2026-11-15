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

        $isOpen = false;

        if (! $todayClosure) {
            foreach ($operatingHours as $period) {
                if ((int) $period->is_closed === 1) {
                    continue;
                }

                $dow = (int) $period->day_of_week;
                $openTime = (string) $period->opening_time;
                $closeTime = (string) $period->closing_time;
                $closesNextDay = (int) $period->closes_next_day === 1;

                if ($dow === $todayDow) {
                    if ($closesNextDay) {
                        if ($currentTime >= $openTime) {
                            $isOpen = true;
                            break;
                        }
                    } elseif ($currentTime >= $openTime && $currentTime < $closeTime) {
                        $isOpen = true;
                        break;
                    }
                }

                if ($dow === $yesterdayDow && $closesNextDay && ! $yesterdayClosure) {
                    if ($currentTime < $closeTime) {
                        $isOpen = true;
                        break;
                    }
                }
            }
        }

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
}
