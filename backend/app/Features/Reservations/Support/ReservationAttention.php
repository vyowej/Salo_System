<?php

namespace App\Features\Reservations\Support;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

class ReservationAttention
{
    public const PENDING_EXPIRING = 'pending_expiring';

    public const NO_SHOW_CANDIDATE = 'no_show_candidate';

    public const OVERDUE_SEATED = 'overdue_seated';

    /**
     * @var list<string>
     */
    public const ALL = [
        self::PENDING_EXPIRING,
        self::NO_SHOW_CANDIDATE,
        self::OVERDUE_SEATED,
    ];

    /**
     * Compute the live operational attention flag for a reservation row.
     */
    public static function compute(
        object $row,
        ?object $restaurant = null,
        ?CarbonInterface $now = null,
    ): ?string {
        $manilaNow = $now !== null
            ? CarbonImmutable::instance($now)->setTimezone('Asia/Manila')
            : CarbonImmutable::now('Asia/Manila');

        $status = (string) ($row->reservation_status ?? '');
        if ($status === '' || empty($row->reservation_start) || empty($row->reservation_end)) {
            return null;
        }

        $startCarbon = CarbonImmutable::parse((string) $row->reservation_start, 'Asia/Manila');
        $endCarbon = CarbonImmutable::parse((string) $row->reservation_end, 'Asia/Manila');

        if ($status === ReservationStatus::PENDING && ! empty($row->created_at)) {
            $expiryMinutes = max(
                5,
                (int) ($restaurant->reservation_pending_expiry_minutes
                    ?? $row->reservation_pending_expiry_minutes
                    ?? 120),
            );
            $warningMinutes = max(5, (int) config('salo.reservations.pending_expiring_warning_minutes', 30));
            $createdCarbon = CarbonImmutable::parse((string) $row->created_at, 'Asia/Manila');
            $expiresAt = $createdCarbon->addMinutes($expiryMinutes);
            $warningAt = $expiresAt->subMinutes($warningMinutes);

            if ($manilaNow->greaterThanOrEqualTo($warningAt)) {
                return self::PENDING_EXPIRING;
            }
        }

        if (in_array($status, [ReservationStatus::CONFIRMED, ReservationStatus::ARRIVED], true)) {
            $graceMinutes = max(0, (int) config('salo.reservations.no_show_grace_minutes', 15));
            if ($manilaNow->greaterThanOrEqualTo($startCarbon->addMinutes($graceMinutes))) {
                return self::NO_SHOW_CANDIDATE;
            }
        }

        if ($status === ReservationStatus::SEATED) {
            $overdueMinutes = max(0, (int) config('salo.reservations.overdue_seated_minutes', 60));
            if ($manilaNow->greaterThan($endCarbon->addMinutes($overdueMinutes))) {
                return self::OVERDUE_SEATED;
            }
        }

        return null;
    }
}
