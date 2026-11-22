<?php

namespace App\Features\Reservations\Support;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class ReservationStatusHistoryRecorder
{
    private const ALLOWED_ROLES = ['customer', 'restaurant', 'admin', 'system'];

    /**
     * Insert a status transition audit entry into reservation_status_history.
     */
    public function record(
        int $reservationId,
        ?string $fromStatus,
        string $toStatus,
        ?int $changedByUserId = null,
        string $changedByRole = 'system',
        ?string $note = null,
        ?CarbonInterface $createdAt = null,
    ): int {
        $normalizedTo = strtolower(trim($toStatus));
        if (! ReservationStatus::isValid($normalizedTo)) {
            throw new InvalidArgumentException("Invalid target reservation status: {$toStatus}");
        }

        $normalizedFrom = null;
        if ($fromStatus !== null && trim($fromStatus) !== '') {
            $normalizedFrom = strtolower(trim($fromStatus));
            if (! ReservationStatus::isValid($normalizedFrom)) {
                throw new InvalidArgumentException("Invalid source reservation status: {$fromStatus}");
            }
        }

        $normalizedRole = strtolower(trim($changedByRole));
        if (! in_array($normalizedRole, self::ALLOWED_ROLES, true)) {
            throw new InvalidArgumentException("Invalid changed_by_role value: {$changedByRole}");
        }

        $cleanNote = $note !== null && trim($note) !== ''
            ? mb_substr(trim($note), 0, 255)
            : null;

        $timestamp = ($createdAt !== null
            ? CarbonImmutable::instance($createdAt)->setTimezone('Asia/Manila')
            : CarbonImmutable::now('Asia/Manila')
        )->format('Y-m-d H:i:s');

        return (int) DB::table('reservation_status_history')->insertGetId([
            'reservation_id' => $reservationId,
            'from_status' => $normalizedFrom,
            'to_status' => $normalizedTo,
            'changed_by_user_id' => $changedByUserId,
            'changed_by_role' => $normalizedRole,
            'note' => $cleanNote,
            'created_at' => $timestamp,
        ]);
    }

    public static function recordTransition(
        int $reservationId,
        ?string $fromStatus,
        string $toStatus,
        ?int $changedByUserId = null,
        string $changedByRole = 'system',
        ?string $note = null,
        ?CarbonInterface $createdAt = null,
    ): int {
        return (new self())->record(
            reservationId: $reservationId,
            fromStatus: $fromStatus,
            toStatus: $toStatus,
            changedByUserId: $changedByUserId,
            changedByRole: $changedByRole,
            note: $note,
            createdAt: $createdAt,
        );
    }
}
