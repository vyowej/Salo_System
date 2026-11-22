<?php

namespace App\Features\Reservations\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Reservations\Support\ReservationExpiry;
use App\Features\Reservations\Support\ReservationStatus;
use App\Features\Reservations\Support\ReservationStatusHistoryRecorder;
use App\Support\AuditLogService;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class ReservationExpiryService
{
    private const TIMEZONE = 'Asia/Manila';

    public function __construct(
        private readonly ReservationStatusHistoryRecorder $historyRecorder,
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * Expire due pending and awaiting_payment reservations in isolated per-row transactions.
     *
     * @return array{examined: int, expired: int, skipped: int, failed: int, dry_run: bool, ids: list<int>}
     */
    public function expireDue(
        ?CarbonInterface $now = null,
        ?int $restaurantId = null,
        ?int $reservationId = null,
        bool $dryRun = false,
        ?int $limit = null,
    ): array {
        $manilaNow = $this->toManilaImmutable($now);
        $nowStr = $manilaNow->format('Y-m-d H:i:s');
        $batchSize = max(10, (int) config('salo.reservations.expiry_command_batch_size', 200));
        $awaitingMinutes = max(15, (int) config('salo.reservations.awaiting_payment_expiry_minutes', 1440));

        // SQL superset pre-filter: all pending older than 5m (min expiry) or start<=now,
        // plus awaiting_payment older than awaitingMinutes or start<=now.
        $minPendingCutoff = $manilaNow->subMinutes(5)->format('Y-m-d H:i:s');
        $awaitingCutoff = $manilaNow->subMinutes($awaitingMinutes)->format('Y-m-d H:i:s');

        $query = DB::table('reservations as res')
            ->join('restaurants as rest', 'rest.restaurant_id', '=', 'res.restaurant_id')
            ->whereIn('res.reservation_status', [ReservationStatus::PENDING, ReservationStatus::AWAITING_PAYMENT])
            ->when($restaurantId !== null && $restaurantId > 0, static fn ($q) => $q->where('res.restaurant_id', $restaurantId))
            ->when($reservationId !== null && $reservationId > 0, static fn ($q) => $q->where('res.reservation_id', $reservationId))
            ->when($reservationId === null, static function ($q) use ($nowStr, $minPendingCutoff, $awaitingCutoff): void {
                $q->where(static function ($sub) use ($nowStr, $minPendingCutoff, $awaitingCutoff): void {
                    $sub->where('res.reservation_start', '<=', $nowStr)
                        ->orWhere(static function ($p) use ($minPendingCutoff): void {
                            $p->where('res.reservation_status', ReservationStatus::PENDING)
                                ->where('res.created_at', '<=', $minPendingCutoff);
                        })
                        ->orWhere(static function ($a) use ($awaitingCutoff): void {
                            $a->where('res.reservation_status', ReservationStatus::AWAITING_PAYMENT)
                                ->whereRaw('COALESCE(res.approved_at, res.updated_at, res.created_at) <= ?', [$awaitingCutoff]);
                        });
                });
            })
            ->select([
                'res.reservation_id',
                'res.reservation_status',
                'res.reservation_start',
                'res.created_at',
                'res.approved_at',
                'res.updated_at',
                'rest.reservation_pending_expiry_minutes',
            ])
            ->orderBy('res.reservation_id');

        $examined = 0;
        $expired = 0;
        $skipped = 0;
        $failed = 0;
        $ids = [];

        $candidates = $query->get();
        foreach ($candidates->chunk($batchSize) as $chunk) {
            foreach ($chunk as $candidate) {
                if ($limit !== null && $limit > 0 && $expired >= $limit) {
                    break 2;
                }

                $examined++;
                $pendingMins = max(5, (int) ($candidate->reservation_pending_expiry_minutes ?? 120));
                if (! ReservationExpiry::isExpired($candidate, $manilaNow, $pendingMins)) {
                    $skipped++;
                    continue;
                }

                $targetId = (int) $candidate->reservation_id;
                if ($dryRun) {
                    $expired++;
                    $ids[] = $targetId;
                    continue;
                }

                try {
                    $outcome = $this->expireSingleReservation($targetId, $manilaNow);
                    if ($outcome === 'expired') {
                        $expired++;
                        $ids[] = $targetId;
                    } else {
                        $skipped++;
                    }
                } catch (Throwable $e) {
                    $failed++;
                    Log::error('Failed to expire reservation', [
                        'reservation_id' => $targetId,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        }

        return [
            'examined' => $examined,
            'expired' => $expired,
            'skipped' => $skipped,
            'failed' => $failed,
            'dry_run' => $dryRun,
            'ids' => $ids,
        ];
    }

    /**
     * Expire a single reservation inside its own locked transaction, re-checking status and expiry.
     */
    public function expireSingleReservation(int $reservationId, ?CarbonInterface $now = null): string
    {
        $manilaNow = $this->toManilaImmutable($now);
        $nowStr = $manilaNow->format('Y-m-d H:i:s');

        return DB::transaction(function () use ($reservationId, $manilaNow, $nowStr): string {
            $row = DB::table('reservations as res')
                ->join('restaurants as rest', 'rest.restaurant_id', '=', 'res.restaurant_id')
                ->where('res.reservation_id', $reservationId)
                ->select([
                    'res.*',
                    'rest.restaurant_name',
                    'rest.reservation_pending_expiry_minutes',
                ])
                ->lockForUpdate()
                ->first();

            if (! $row) {
                return 'skipped';
            }

            $fromStatus = (string) $row->reservation_status;
            if (! in_array($fromStatus, [ReservationStatus::PENDING, ReservationStatus::AWAITING_PAYMENT], true)) {
                return 'skipped';
            }

            $pendingMins = max(5, (int) ($row->reservation_pending_expiry_minutes ?? 120));
            if (! ReservationExpiry::isExpired($row, $manilaNow, $pendingMins)) {
                return 'skipped';
            }

            DB::table('reservations')
                ->where('reservation_id', $reservationId)
                ->update([
                    'reservation_status' => ReservationStatus::EXPIRED,
                    'expired_at' => $nowStr,
                    'updated_at' => $nowStr,
                ]);

            $note = $fromStatus === ReservationStatus::AWAITING_PAYMENT
                ? 'Deposit not received in time'
                : 'Not confirmed in time';

            $this->historyRecorder->record(
                reservationId: $reservationId,
                fromStatus: $fromStatus,
                toStatus: ReservationStatus::EXPIRED,
                changedByUserId: null,
                changedByRole: 'system',
                note: $note,
                createdAt: $manilaNow,
            );

            $this->auditLogService->record(
                actorUserId: null,
                action: 'system_reservation_expired',
                entityType: 'reservations',
                entityId: $reservationId,
                oldValues: [
                    'reservation_status' => $fromStatus,
                    'expired_at' => $row->expired_at,
                ],
                newValues: [
                    'reservation_status' => ReservationStatus::EXPIRED,
                    'expired_at' => $nowStr,
                    'note' => $note,
                ],
            );

            $ref = $row->reservation_reference ?: ('#' . $reservationId);
            $startCarbon = CarbonImmutable::parse((string) $row->reservation_start, self::TIMEZONE);
            $when = $startCarbon->format('M j, Y \a\t g:i A');

            $this->notificationService->notifyUser(
                userId: (int) $row->customer_id,
                workspace: 'customer',
                type: 'reservation_expired',
                title: 'Reservation request expired',
                body: "Your reservation {$ref} at {$row->restaurant_name} for {$when} expired ({$note}). You can book another available time anytime.",
                relatedEntityType: 'reservation',
                relatedEntityId: $reservationId,
            );

            if ($fromStatus === ReservationStatus::AWAITING_PAYMENT) {
                $handlerIds = $this->notificationService->resolveRestaurantReservationHandlerUserIds((int) $row->restaurant_id);
                if ($handlerIds !== []) {
                    $this->notificationService->notifyUsers(
                        userIds: $handlerIds,
                        workspace: 'restaurant',
                        type: 'reservation_expired',
                        title: "Unpaid Reservation Expired ({$ref})",
                        body: "Reservation {$ref} was released because the deposit wasn't received in time.",
                        relatedEntityType: 'reservation',
                        relatedEntityId: $reservationId,
                    );
                }
            }

            return 'expired';
        });
    }

    /**
     * Send one-time expiry warnings to restaurant handlers for pending reservations inside the warning window.
     *
     * @return array{examined: int, warned: int, skipped: int, failed: int, dry_run: bool, ids: list<int>}
     */
    public function sendExpiryWarnings(
        ?CarbonInterface $now = null,
        ?int $restaurantId = null,
        bool $dryRun = false,
        ?int $limit = null,
    ): array {
        $manilaNow = $this->toManilaImmutable($now);
        $warningMinutes = max(5, (int) config('salo.reservations.pending_expiring_warning_minutes', 30));
        $batchSize = max(10, (int) config('salo.reservations.expiry_command_batch_size', 200));

        $candidates = DB::table('reservations as res')
            ->join('restaurants as rest', 'rest.restaurant_id', '=', 'res.restaurant_id')
            ->where('res.reservation_status', ReservationStatus::PENDING)
            ->whereNull('res.expiry_warning_sent_at')
            ->whereNotNull('res.created_at')
            ->when($restaurantId !== null && $restaurantId > 0, static fn ($q) => $q->where('res.restaurant_id', $restaurantId))
            ->select([
                'res.reservation_id',
                'res.restaurant_id',
                'res.reservation_status',
                'res.reservation_start',
                'res.created_at',
                'rest.reservation_pending_expiry_minutes',
            ])
            ->orderBy('res.reservation_id')
            ->get();

        $examined = 0;
        $warned = 0;
        $skipped = 0;
        $failed = 0;
        $ids = [];

        foreach ($candidates->chunk($batchSize) as $chunk) {
            foreach ($chunk as $candidate) {
                if ($limit !== null && $limit > 0 && $warned >= $limit) {
                    break 2;
                }

                $examined++;
                $pendingMins = max(5, (int) ($candidate->reservation_pending_expiry_minutes ?? 120));
                $expiresAt = ReservationExpiry::expiresAt($candidate, $pendingMins);

                if ($expiresAt === null || $expiresAt->lessThanOrEqualTo($manilaNow)) {
                    $skipped++;
                    continue;
                }

                $warningAt = $expiresAt->subMinutes($warningMinutes);
                $createdAt = CarbonImmutable::parse((string) $candidate->created_at, self::TIMEZONE);

                // Skip bookings created inside the warning window (warning would be immediate noise)
                if ($createdAt->greaterThan($warningAt) || $manilaNow->lessThan($warningAt)) {
                    $skipped++;
                    continue;
                }

                $targetId = (int) $candidate->reservation_id;
                if ($dryRun) {
                    $warned++;
                    $ids[] = $targetId;
                    continue;
                }

                try {
                    $sent = $this->sendSingleExpiryWarning($targetId, $manilaNow, $warningMinutes);
                    if ($sent) {
                        $warned++;
                        $ids[] = $targetId;
                    } else {
                        $skipped++;
                    }
                } catch (Throwable $e) {
                    $failed++;
                    Log::error('Failed to send reservation expiry warning', [
                        'reservation_id' => $targetId,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        }

        return [
            'examined' => $examined,
            'warned' => $warned,
            'skipped' => $skipped,
            'failed' => $failed,
            'dry_run' => $dryRun,
            'ids' => $ids,
        ];
    }

    private function sendSingleExpiryWarning(int $reservationId, CarbonImmutable $manilaNow, int $warningMinutes): bool
    {
        $nowStr = $manilaNow->format('Y-m-d H:i:s');

        return DB::transaction(function () use ($reservationId, $manilaNow, $nowStr, $warningMinutes): bool {
            $row = DB::table('reservations as res')
                ->join('restaurants as rest', 'rest.restaurant_id', '=', 'res.restaurant_id')
                ->where('res.reservation_id', $reservationId)
                ->select([
                    'res.*',
                    'rest.reservation_pending_expiry_minutes',
                ])
                ->lockForUpdate()
                ->first();

            if (! $row || $row->reservation_status !== ReservationStatus::PENDING || $row->expiry_warning_sent_at !== null) {
                return false;
            }

            $pendingMins = max(5, (int) ($row->reservation_pending_expiry_minutes ?? 120));
            $expiresAt = ReservationExpiry::expiresAt($row, $pendingMins);
            if ($expiresAt === null || $expiresAt->lessThanOrEqualTo($manilaNow)) {
                return false;
            }

            $warningAt = $expiresAt->subMinutes($warningMinutes);
            $createdAt = CarbonImmutable::parse((string) $row->created_at, self::TIMEZONE);
            if ($createdAt->greaterThan($warningAt) || $manilaNow->lessThan($warningAt)) {
                return false;
            }

            DB::table('reservations')
                ->where('reservation_id', $reservationId)
                ->update([
                    'expiry_warning_sent_at' => $nowStr,
                    'updated_at' => $nowStr,
                ]);

            $minutesLeft = max(1, (int) ceil($manilaNow->diffInSeconds($expiresAt) / 60));
            $ref = $row->reservation_reference ?: ('#' . $reservationId);
            $handlerIds = $this->notificationService->resolveRestaurantReservationHandlerUserIds((int) $row->restaurant_id);

            if ($handlerIds !== []) {
                $this->notificationService->notifyUsers(
                    userIds: $handlerIds,
                    workspace: 'restaurant',
                    type: 'reservation_expiring_soon',
                    title: "Reservation Expiring Soon ({$ref})",
                    body: "Reservation {$ref} expires in {$minutesLeft} minutes — approve or reject it.",
                    relatedEntityType: 'reservation',
                    relatedEntityId: $reservationId,
                );
            }

            return true;
        });
    }

    private function toManilaImmutable(?CarbonInterface $now): CarbonImmutable
    {
        return $now !== null
            ? CarbonImmutable::instance($now)->setTimezone(self::TIMEZONE)
            : CarbonImmutable::now(self::TIMEZONE);
    }
}
