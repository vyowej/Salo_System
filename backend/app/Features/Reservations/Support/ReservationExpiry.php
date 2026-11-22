<?php

namespace App\Features\Reservations\Support;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

class ReservationExpiry
{
    private const TIMEZONE = 'Asia/Manila';

    /**
     * Compute the exact Asia/Manila expiration timestamp for a reservation, or null if not expirable.
     */
    public static function expiresAt(object $reservation, ?int $pendingExpiryMinutes = null): ?CarbonImmutable
    {
        $status = (string) ($reservation->reservation_status ?? '');
        if ($status === '' || empty($reservation->reservation_start)) {
            return null;
        }

        $startCarbon = CarbonImmutable::parse((string) $reservation->reservation_start, self::TIMEZONE)
            ->setTimezone(self::TIMEZONE);

        if ($status === ReservationStatus::PENDING) {
            if (empty($reservation->created_at)) {
                return $startCarbon;
            }
            $expiryMinutes = max(
                5,
                (int) ($pendingExpiryMinutes
                    ?? $reservation->reservation_pending_expiry_minutes
                    ?? 120),
            );
            $createdAt = CarbonImmutable::parse((string) $reservation->created_at, self::TIMEZONE)
                ->setTimezone(self::TIMEZONE);
            $windowDeadline = $createdAt->addMinutes($expiryMinutes);

            return $windowDeadline->lessThan($startCarbon) ? $windowDeadline : $startCarbon;
        }

        if ($status === ReservationStatus::AWAITING_PAYMENT) {
            $baseTime = $reservation->approved_at ?? $reservation->updated_at ?? $reservation->created_at ?? null;
            if (empty($baseTime)) {
                return $startCarbon;
            }
            $awaitingMinutes = max(15, (int) config('salo.reservations.awaiting_payment_expiry_minutes', 1440));
            $baseCarbon = CarbonImmutable::parse((string) $baseTime, self::TIMEZONE)
                ->setTimezone(self::TIMEZONE);
            $windowDeadline = $baseCarbon->addMinutes($awaitingMinutes);

            return $windowDeadline->lessThan($startCarbon) ? $windowDeadline : $startCarbon;
        }

        return null;
    }

    /**
     * Determine whether a reservation is expired at the given reference timestamp (inclusive boundary: expiresAt <= now).
     */
    public static function isExpired(
        object $reservation,
        ?CarbonInterface $now = null,
        ?int $pendingExpiryMinutes = null,
    ): bool {
        $expiresAt = self::expiresAt($reservation, $pendingExpiryMinutes);
        if ($expiresAt === null) {
            return false;
        }

        $manilaNow = $now !== null
            ? CarbonImmutable::instance($now)->setTimezone(self::TIMEZONE)
            : CarbonImmutable::now(self::TIMEZONE);

        return $expiresAt->lessThanOrEqualTo($manilaNow);
    }
}
