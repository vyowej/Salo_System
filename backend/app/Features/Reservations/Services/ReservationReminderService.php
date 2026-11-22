<?php

namespace App\Features\Reservations\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Reservations\Support\ReservationStatus;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class ReservationReminderService
{
    private const TIMEZONE = 'Asia/Manila';

    public function __construct(
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * Send one-time upcoming reservation reminders to customers inside the lead window.
     *
     * @return array{examined: int, sent: int, skipped: int, failed: int, dry_run: bool, ids: list<int>}
     */
    public function sendDue(
        ?CarbonInterface $now = null,
        ?int $restaurantId = null,
        bool $dryRun = false,
    ): array {
        $manilaNow = $now !== null
            ? CarbonImmutable::instance($now)->setTimezone(self::TIMEZONE)
            : CarbonImmutable::now(self::TIMEZONE);

        $leadMinutes = max(15, (int) config('salo.reservations.reminder_lead_minutes', 120));
        $nowStr = $manilaNow->format('Y-m-d H:i:s');
        $leadEndStr = $manilaNow->addMinutes($leadMinutes)->format('Y-m-d H:i:s');

        $candidates = DB::table('reservations as res')
            ->where('res.reservation_status', ReservationStatus::CONFIRMED)
            ->whereNull('res.reminder_sent_at')
            ->where('res.reservation_start', '>', $nowStr)
            ->where('res.reservation_start', '<=', $leadEndStr)
            ->when($restaurantId !== null && $restaurantId > 0, static fn ($q) => $q->where('res.restaurant_id', $restaurantId))
            ->select([
                'res.reservation_id',
                'res.reservation_start',
                'res.created_at',
            ])
            ->orderBy('res.reservation_start')
            ->get();

        $examined = 0;
        $sent = 0;
        $skipped = 0;
        $failed = 0;
        $ids = [];

        foreach ($candidates as $candidate) {
            $examined++;
            $startCarbon = CarbonImmutable::parse((string) $candidate->reservation_start, self::TIMEZONE);
            $createdAt = CarbonImmutable::parse((string) $candidate->created_at, self::TIMEZONE);

            // Skip bookings created inside the reminder lead window
            if ($createdAt->greaterThan($startCarbon->subMinutes($leadMinutes))) {
                $skipped++;
                continue;
            }

            $targetId = (int) $candidate->reservation_id;
            if ($dryRun) {
                $sent++;
                $ids[] = $targetId;
                continue;
            }

            try {
                if ($this->sendSingleReminder($targetId, $manilaNow, $leadMinutes)) {
                    $sent++;
                    $ids[] = $targetId;
                } else {
                    $skipped++;
                }
            } catch (Throwable $e) {
                $failed++;
                Log::error('Failed to send reservation reminder', [
                    'reservation_id' => $targetId,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return [
            'examined' => $examined,
            'sent' => $sent,
            'skipped' => $skipped,
            'failed' => $failed,
            'dry_run' => $dryRun,
            'ids' => $ids,
        ];
    }

    private function sendSingleReminder(int $reservationId, CarbonImmutable $manilaNow, int $leadMinutes): bool
    {
        $nowStr = $manilaNow->format('Y-m-d H:i:s');

        return DB::transaction(function () use ($reservationId, $manilaNow, $nowStr, $leadMinutes): bool {
            $row = DB::table('reservations as res')
                ->join('restaurants as rest', 'rest.restaurant_id', '=', 'res.restaurant_id')
                ->leftJoin('restaurant_tables as rt', 'rt.table_id', '=', 'res.table_id')
                ->where('res.reservation_id', $reservationId)
                ->select([
                    'res.*',
                    'rest.restaurant_name',
                    'rt.dining_area',
                ])
                ->lockForUpdate()
                ->first();

            if (! $row || $row->reservation_status !== ReservationStatus::CONFIRMED || $row->reminder_sent_at !== null) {
                return false;
            }

            $startCarbon = CarbonImmutable::parse((string) $row->reservation_start, self::TIMEZONE);
            $createdAt = CarbonImmutable::parse((string) $row->created_at, self::TIMEZONE);

            if (
                $startCarbon->lessThanOrEqualTo($manilaNow)
                || $startCarbon->greaterThan($manilaNow->addMinutes($leadMinutes))
                || $createdAt->greaterThan($startCarbon->subMinutes($leadMinutes))
            ) {
                return false;
            }

            DB::table('reservations')
                ->where('reservation_id', $reservationId)
                ->update([
                    'reminder_sent_at' => $nowStr,
                    'updated_at' => $nowStr,
                ]);

            $ref = $row->reservation_reference ?: ('#' . $reservationId);
            $timeStr = $startCarbon->format('g:i A');
            $areaSuffix = ! empty($row->dining_area) ? " ({$row->dining_area})" : '';

            $this->notificationService->notifyUser(
                userId: (int) $row->customer_id,
                workspace: 'customer',
                type: 'reservation_reminder',
                title: 'Your table is coming up',
                body: "Reminder: your table for {$row->number_of_guests} at {$row->restaurant_name}{$areaSuffix} is at {$timeStr} (Ref: {$ref}).",
                relatedEntityType: 'reservation',
                relatedEntityId: $reservationId,
            );

            return true;
        });
    }
}
