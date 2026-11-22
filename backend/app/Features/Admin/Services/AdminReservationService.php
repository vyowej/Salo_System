<?php

namespace App\Features\Admin\Services;

use App\Features\Reservations\Support\ReservationAttention;
use App\Features\Reservations\Support\ReservationFormatter;
use App\Features\Reservations\Support\ReservationStatus;
use App\Support\SqlLike;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class AdminReservationService
{
    private const TIMEZONE = 'Asia/Manila';

    /**
     * Return paginated platform-wide reservations with search, status/group/deposit/attention/restaurant/date filters,
     * and a summary independent of pagination.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listReservations(array $filters): array
    {
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 15)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $direction = strtolower((string) ($filters['direction'] ?? 'desc')) === 'asc' ? 'asc' : 'desc';
        $sort = (string) ($filters['sort'] ?? 'reservation_start');
        $manilaNow = CarbonImmutable::now(self::TIMEZONE);

        $dateFrom = trim((string) ($filters['date_from'] ?? ''));
        $dateTo = trim((string) ($filters['date_to'] ?? ''));
        if ($dateFrom === '' && $dateTo === '') {
            $dateFrom = $manilaNow->subDays(30)->format('Y-m-d');
            $dateTo = $manilaNow->addDays(30)->format('Y-m-d');
        } elseif ($dateFrom !== '' && $dateTo === '') {
            $dateTo = CarbonImmutable::createFromFormat('Y-m-d', $dateFrom, self::TIMEZONE)
                ->addDays(30)
                ->format('Y-m-d');
        } elseif ($dateFrom === '' && $dateTo !== '') {
            $dateFrom = CarbonImmutable::createFromFormat('Y-m-d', $dateTo, self::TIMEZONE)
                ->subDays(30)
                ->format('Y-m-d');
        }

        $effectiveFilters = array_merge($filters, [
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
        ]);

        $baseQuery = $this->buildBaseQuery($effectiveFilters, $manilaNow);

        $summaryRow = (clone $baseQuery)
            ->selectRaw("
                COUNT(*) as total,
                COALESCE(SUM(r.number_of_guests), 0) as total_guests,
                SUM(CASE WHEN r.reservation_status = 'pending' THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN r.reservation_status IN ('approved', 'awaiting_payment', 'confirmed', 'arrived', 'seated') THEN 1 ELSE 0 END) as active_count,
                SUM(CASE WHEN r.reservation_status = 'completed' THEN 1 ELSE 0 END) as completed_count,
                SUM(CASE WHEN r.reservation_status IN ('cancelled', 'rejected', 'expired') THEN 1 ELSE 0 END) as cancelled_count,
                SUM(CASE WHEN r.reservation_status = 'no_show' THEN 1 ELSE 0 END) as no_show_count
            ")
            ->first();

        $total = (int) ($summaryRow->total ?? 0);
        $lastPage = max(1, (int) ceil($total / $perPage));

        $sortColumn = match ($sort) {
            'created_at' => 'r.created_at',
            'party_size' => 'r.number_of_guests',
            default => 'r.reservation_start',
        };

        $rows = $baseQuery
            ->select($this->selectColumns())
            ->orderBy($sortColumn, $direction)
            ->orderBy('r.reservation_id', $direction)
            ->forPage($page, $perPage)
            ->get();

        $items = $rows->map(function (object $row) use ($manilaNow): array {
            $attention = ReservationAttention::compute($row, $row, $manilaNow);

            return ReservationFormatter::formatAdmin(
                row: $row,
                now: $manilaNow,
                cancellationCutoffMinutes: isset($row->reservation_cancellation_cutoff_minutes)
                    ? (int) $row->reservation_cancellation_cutoff_minutes
                    : null,
                attention: $attention,
            );
        })->all();

        return [
            'items' => $items,
            'meta' => [
                'current_page' => $page,
                'last_page' => $lastPage,
                'per_page' => $perPage,
                'total' => $total,
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
            ],
            'summary' => [
                'total' => $total,
                'total_guests' => (int) ($summaryRow->total_guests ?? 0),
                'pending_count' => (int) ($summaryRow->pending_count ?? 0),
                'active_count' => (int) ($summaryRow->active_count ?? 0),
                'completed_count' => (int) ($summaryRow->completed_count ?? 0),
                'cancelled_count' => (int) ($summaryRow->cancelled_count ?? 0),
                'no_show_count' => (int) ($summaryRow->no_show_count ?? 0),
            ],
        ];
    }

    /**
     * Return platform-wide reservation monitoring stats using a fixed number of grouped queries.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function getStats(array $filters): array
    {
        $manilaNow = CarbonImmutable::now(self::TIMEZONE);
        $defaultTo = $manilaNow->format('Y-m-d');
        $defaultFrom = $manilaNow->subDays(29)->format('Y-m-d');

        $dateFrom = trim((string) ($filters['date_from'] ?? '')) ?: $defaultFrom;
        $dateTo = trim((string) ($filters['date_to'] ?? '')) ?: $defaultTo;
        if ($dateFrom > $dateTo) {
            $dateFrom = $dateTo;
        }

        $restaurantId = isset($filters['restaurant_id']) && $filters['restaurant_id'] !== ''
            ? (int) $filters['restaurant_id']
            : null;

        $rangeStart = "{$dateFrom} 00:00:00";
        $rangeEndExclusive = CarbonImmutable::createFromFormat('Y-m-d', $dateTo, self::TIMEZONE)
            ->addDay()
            ->format('Y-m-d 00:00:00');

        $scopeRange = static function (Builder $query) use ($rangeStart, $rangeEndExclusive, $restaurantId): Builder {
            $query->where('r.reservation_start', '>=', $rangeStart)
                ->where('r.reservation_start', '<', $rangeEndExclusive);

            if ($restaurantId !== null && $restaurantId > 0) {
                $query->where('r.restaurant_id', $restaurantId);
            }

            return $query;
        };

        // Query 1: Totals by status, covers, and completed service fee
        $statusRows = $scopeRange(DB::table('reservations as r'))
            ->selectRaw('r.reservation_status, COUNT(*) as cnt, COALESCE(SUM(r.number_of_guests), 0) as guests, COALESCE(SUM(r.service_fee), 0) as fee_sum')
            ->groupBy('r.reservation_status')
            ->get();

        $byStatus = array_fill_keys(ReservationStatus::ALL, 0);
        $total = 0;
        $coversTotal = 0;
        $serviceFeeTotal = 0.0;

        foreach ($statusRows as $sr) {
            $st = (string) $sr->reservation_status;
            $cnt = (int) $sr->cnt;
            $guests = (int) $sr->guests;
            if (array_key_exists($st, $byStatus)) {
                $byStatus[$st] = $cnt;
            }
            $total += $cnt;
            $coversTotal += $guests;
            if ($st === ReservationStatus::COMPLETED) {
                $serviceFeeTotal = round((float) $sr->fee_sum, 2);
            }
        }

        $completed = $byStatus[ReservationStatus::COMPLETED];
        $noShow = $byStatus[ReservationStatus::NO_SHOW];
        $cancelledTotal = $byStatus[ReservationStatus::CANCELLED]
            + $byStatus[ReservationStatus::REJECTED]
            + $byStatus[ReservationStatus::EXPIRED];
        $confirmedOrLater = $byStatus[ReservationStatus::CONFIRMED]
            + $byStatus[ReservationStatus::ARRIVED]
            + $byStatus[ReservationStatus::SEATED]
            + $completed
            + $noShow;

        $averagePartySize = $total > 0 ? round($coversTotal / $total, 1) : 0.0;

        $attendanceDenominator = $completed + $noShow;
        $noShowRate = $attendanceDenominator > 0
            ? round(($noShow / $attendanceDenominator) * 100, 1)
            : 0.0;
        $cancellationRate = $total > 0
            ? round(($cancelledTotal / $total) * 100, 1)
            : 0.0;
        $completionDenominator = $completed + $noShow + $cancelledTotal;
        $completionRate = $completionDenominator > 0
            ? round(($completed / $completionDenominator) * 100, 1)
            : 0.0;
        $confirmationRate = $total > 0
            ? round(($confirmedOrLater / $total) * 100, 1)
            : 0.0;

        // Query 2: Daily breakdown (zero-filled for every calendar day in range)
        $rawDaily = $scopeRange(DB::table('reservations as r'))
            ->selectRaw("
                DATE(r.reservation_start) as day_date,
                COUNT(*) as total,
                SUM(CASE WHEN r.reservation_status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN r.reservation_status IN ('cancelled', 'no_show', 'rejected', 'expired') THEN 1 ELSE 0 END) as cancelled_or_missed,
                COALESCE(SUM(r.number_of_guests), 0) as covers
            ")
            ->groupByRaw('DATE(r.reservation_start)')
            ->get()
            ->keyBy('day_date');

        $byDay = [];
        $cursor = CarbonImmutable::createFromFormat('Y-m-d', $dateFrom, self::TIMEZONE);
        $endCursor = CarbonImmutable::createFromFormat('Y-m-d', $dateTo, self::TIMEZONE);
        while ($cursor->lessThanOrEqualTo($endCursor)) {
            $dayStr = $cursor->format('Y-m-d');
            $dayRow = $rawDaily->get($dayStr);
            $byDay[] = [
                'date' => $dayStr,
                'total' => (int) ($dayRow->total ?? 0),
                'completed' => (int) ($dayRow->completed ?? 0),
                'cancelled_or_missed' => (int) ($dayRow->cancelled_or_missed ?? 0),
                'covers' => (int) ($dayRow->covers ?? 0),
            ];
            $cursor = $cursor->addDay();
        }

        // Query 3: Cancelled by breakdown
        $cancelledByRows = $scopeRange(DB::table('reservations as r'))
            ->where('r.reservation_status', ReservationStatus::CANCELLED)
            ->selectRaw('r.cancelled_by, COUNT(*) as cnt')
            ->groupBy('r.cancelled_by')
            ->get();

        $byCancelledBy = [
            'customer' => 0,
            'restaurant' => 0,
            'admin' => 0,
            'system' => 0,
        ];
        foreach ($cancelledByRows as $cbRow) {
            $actor = (string) ($cbRow->cancelled_by ?? '');
            if (array_key_exists($actor, $byCancelledBy)) {
                $byCancelledBy[$actor] = (int) $cbRow->cnt;
            }
        }

        // Query 4: Peak start hours (Manila 0..23)
        $hourRows = $scopeRange(DB::table('reservations as r'))
            ->selectRaw('HOUR(r.reservation_start) as start_hour, COUNT(*) as cnt')
            ->groupByRaw('HOUR(r.reservation_start)')
            ->get()
            ->keyBy('start_hour');

        $byHour = [];
        for ($h = 0; $h < 24; $h++) {
            $hr = $hourRows->get($h);
            $byHour[] = [
                'hour' => $h,
                'label' => sprintf('%02d:00', $h),
                'total' => (int) ($hr->cnt ?? 0),
            ];
        }

        // Query 5: Top 5 restaurants by total volume
        $topRestaurants = $scopeRange(
            DB::table('reservations as r')->join('restaurants as rest', 'rest.restaurant_id', '=', 'r.restaurant_id'),
        )
            ->selectRaw("
                r.restaurant_id,
                rest.restaurant_name as name,
                COUNT(*) as total,
                SUM(CASE WHEN r.reservation_status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN r.reservation_status = 'no_show' THEN 1 ELSE 0 END) as no_show
            ")
            ->groupBy('r.restaurant_id', 'rest.restaurant_name')
            ->orderByDesc('total')
            ->orderBy('r.restaurant_id', 'asc')
            ->limit(5)
            ->get()
            ->map(static function (object $row): array {
                $completedCnt = (int) $row->completed;
                $noShowCnt = (int) $row->no_show;
                $denom = $completedCnt + $noShowCnt;

                return [
                    'restaurant_id' => (int) $row->restaurant_id,
                    'name' => (string) $row->name,
                    'total' => (int) $row->total,
                    'completed' => $completedCnt,
                    'no_show_rate' => $denom > 0 ? round(($noShowCnt / $denom) * 100, 1) : 0.0,
                ];
            })
            ->all();

        // Query 6: Deposits aggregate
        $depRow = $scopeRange(DB::table('reservations as r'))
            ->selectRaw("
                SUM(CASE WHEN r.deposit_amount > 0 OR r.deposit_status <> 'none' THEN 1 ELSE 0 END) as required_count,
                SUM(CASE WHEN r.deposit_status = 'paid' THEN 1 ELSE 0 END) as paid_count,
                SUM(CASE WHEN r.deposit_status = 'pending' THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN r.deposit_status = 'waived' THEN 1 ELSE 0 END) as waived_count,
                SUM(CASE WHEN r.deposit_status = 'refunded' THEN 1 ELSE 0 END) as refunded_count,
                COALESCE(SUM(CASE WHEN r.deposit_status = 'paid' THEN r.deposit_amount ELSE 0 END), 0) as total_deposit_amount_paid
            ")
            ->first();

        $deposits = [
            'required_count' => (int) ($depRow->required_count ?? 0),
            'paid_count' => (int) ($depRow->paid_count ?? 0),
            'pending_count' => (int) ($depRow->pending_count ?? 0),
            'waived_count' => (int) ($depRow->waived_count ?? 0),
            'refunded_count' => (int) ($depRow->refunded_count ?? 0),
            'total_deposit_amount_paid' => round((float) ($depRow->total_deposit_amount_paid ?? 0), 2),
        ];

        // Query 7: Global live attention counts (ignores date_from/date_to)
        $attentionCounts = $this->computeLiveAttentionCounts($manilaNow, $restaurantId);

        // Query 8: Active upcoming count
        $upcomingQuery = DB::table('reservations as r')
            ->whereIn('r.reservation_status', ReservationStatus::BLOCKING)
            ->where('r.reservation_end', '>=', $manilaNow->format('Y-m-d H:i:s'));
        if ($restaurantId !== null && $restaurantId > 0) {
            $upcomingQuery->where('r.restaurant_id', $restaurantId);
        }
        $activeUpcoming = (int) $upcomingQuery->count();

        return [
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'restaurant_id' => $restaurantId,
            'totals' => [
                'total' => $total,
                'by_status' => $byStatus,
                'completed' => $completed,
                'no_show' => $noShow,
                'cancelled_total' => $cancelledTotal,
                'covers_total' => $coversTotal,
                'average_party_size' => $averagePartySize,
            ],
            'rates' => [
                'no_show_rate' => $noShowRate,
                'cancellation_rate' => $cancellationRate,
                'completion_rate' => $completionRate,
                'confirmation_rate' => $confirmationRate,
                'definitions' => [
                    'no_show_rate' => 'no_show / (completed + no_show) * 100',
                    'cancellation_rate' => '(cancelled + rejected + expired) / total * 100',
                    'completion_rate' => 'completed / (completed + no_show + cancelled + rejected + expired) * 100',
                    'confirmation_rate' => '(confirmed + arrived + seated + completed + no_show) / total * 100',
                ],
            ],
            'by_day' => $byDay,
            'by_cancelled_by' => $byCancelledBy,
            'by_hour' => $byHour,
            'top_restaurants' => $topRestaurants,
            'deposits' => $deposits,
            'service_fee_total' => $serviceFeeTotal,
            'attention_count' => $attentionCounts['total'],
            'attention_counts' => $attentionCounts,
            'active_upcoming' => $activeUpcoming,
        ];
    }

    /**
     * Return full reservation detail with ordered status history (including actor names),
     * platform-wide customer history summary, and restaurant reservation settings.
     *
     * @return array<string, mixed>|null
     */
    public function getReservationDetail(int $reservationId): ?array
    {
        $row = DB::table('reservations as r')
            ->join('restaurants as rest', 'rest.restaurant_id', '=', 'r.restaurant_id')
            ->join('users as u', 'u.user_id', '=', 'r.customer_id')
            ->leftJoin('restaurant_tables as rt', 'rt.table_id', '=', 'r.table_id')
            ->where('r.reservation_id', $reservationId)
            ->select(array_merge($this->selectColumns(), [
                'rest.accepts_reservations',
                'rest.accepting_reservations',
                'rest.reservation_min_notice_hours',
                'rest.reservation_max_party_size',
                'rest.reservation_duration_minutes',
                'rest.reservation_max_advance_days',
                'rest.reservation_auto_confirm',
                'rest.reservation_deposit_required',
                'rest.reservation_deposit_amount',
                'rest.reservation_service_fee',
            ]))
            ->first();

        if ($row === null) {
            return null;
        }

        $manilaNow = CarbonImmutable::now(self::TIMEZONE);
        $attention = ReservationAttention::compute($row, $row, $manilaNow);

        $history = DB::table('reservation_status_history as h')
            ->leftJoin('users as actor', 'actor.user_id', '=', 'h.changed_by_user_id')
            ->where('h.reservation_id', $reservationId)
            ->select([
                'h.*',
                'actor.first_name as actor_first_name',
                'actor.last_name as actor_last_name',
            ])
            ->orderBy('h.created_at', 'asc')
            ->orderBy('h.history_id', 'asc')
            ->get()
            ->all();

        $custHistRow = DB::table('reservations')
            ->where('customer_id', (int) $row->customer_id)
            ->selectRaw("
                COUNT(*) as total_reservations,
                SUM(CASE WHEN reservation_status = 'completed' THEN 1 ELSE 0 END) as visits,
                SUM(CASE WHEN reservation_status = 'no_show' THEN 1 ELSE 0 END) as no_shows,
                SUM(CASE WHEN reservation_status = 'cancelled' THEN 1 ELSE 0 END) as cancellations
            ")
            ->first();

        $customerHistory = [
            'visits' => (int) ($custHistRow->visits ?? 0),
            'no_shows' => (int) ($custHistRow->no_shows ?? 0),
            'cancellations' => (int) ($custHistRow->cancellations ?? 0),
            'total_reservations' => (int) ($custHistRow->total_reservations ?? 0),
        ];

        $restaurantSettings = [
            'accepts_reservations' => (bool) ($row->accepts_reservations ?? false),
            'accepting_reservations' => (bool) ($row->accepting_reservations ?? false),
            'min_notice_hours' => (int) ($row->reservation_min_notice_hours ?? 2),
            'max_party_size' => (int) ($row->reservation_max_party_size ?? 8),
            'duration_minutes' => (int) ($row->reservation_duration_minutes ?? 90),
            'max_advance_days' => (int) ($row->reservation_max_advance_days ?? 30),
            'cancellation_cutoff_minutes' => (int) ($row->reservation_cancellation_cutoff_minutes ?? 120),
            'auto_confirm' => (bool) ($row->reservation_auto_confirm ?? false),
            'pending_expiry_minutes' => (int) ($row->reservation_pending_expiry_minutes ?? 120),
            'deposit_required' => (bool) ($row->reservation_deposit_required ?? false),
            'deposit_amount' => round((float) ($row->reservation_deposit_amount ?? 0), 2),
            'service_fee' => round((float) ($row->reservation_service_fee ?? 0), 2),
        ];

        return ReservationFormatter::formatAdmin(
            row: $row,
            now: $manilaNow,
            cancellationCutoffMinutes: isset($row->reservation_cancellation_cutoff_minutes)
                ? (int) $row->reservation_cancellation_cutoff_minutes
                : null,
            statusHistory: $history,
            attention: $attention,
            customerHistory: $customerHistory,
            restaurantSettings: $restaurantSettings,
        );
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    private function buildBaseQuery(array $filters, CarbonImmutable $manilaNow): Builder
    {
        $query = DB::table('reservations as r')
            ->join('restaurants as rest', 'rest.restaurant_id', '=', 'r.restaurant_id')
            ->join('users as u', 'u.user_id', '=', 'r.customer_id')
            ->leftJoin('restaurant_tables as rt', 'rt.table_id', '=', 'r.table_id');

        $search = trim((string) ($filters['search'] ?? ''));
        if ($search !== '') {
            $like = '%'.SqlLike::escape($search).'%';
            $query->where(function (Builder $q) use ($like): void {
                $q->where('r.reservation_reference', 'like', $like)
                    ->orWhere('r.contact_name', 'like', $like)
                    ->orWhere('r.contact_phone', 'like', $like)
                    ->orWhere('rest.restaurant_name', 'like', $like)
                    ->orWhere('u.email', 'like', $like)
                    ->orWhereRaw("CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) LIKE ?", [$like]);
            });
        }

        $statusRaw = trim((string) ($filters['status'] ?? ''));
        if ($statusRaw !== '' && $statusRaw !== 'all') {
            $statuses = array_values(array_filter(array_map('trim', explode(',', $statusRaw)), static fn (string $s): bool => $s !== ''));
            if (count($statuses) === 1) {
                $query->where('r.reservation_status', $statuses[0]);
            } elseif (count($statuses) > 1) {
                $query->whereIn('r.reservation_status', $statuses);
            }
        }

        $group = trim((string) ($filters['group'] ?? ''));
        if ($group === 'active') {
            $query->whereIn('r.reservation_status', [
                ReservationStatus::APPROVED,
                ReservationStatus::AWAITING_PAYMENT,
                ReservationStatus::CONFIRMED,
                ReservationStatus::ARRIVED,
                ReservationStatus::SEATED,
            ]);
        } elseif ($group === 'pending') {
            $query->where('r.reservation_status', ReservationStatus::PENDING);
        } elseif ($group === 'history') {
            $query->whereIn('r.reservation_status', ReservationStatus::TERMINAL);
        } elseif ($group === 'attention') {
            $this->applyAttentionFilter($query, 'any', $manilaNow);
        }

        $restaurantId = isset($filters['restaurant_id']) && $filters['restaurant_id'] !== ''
            ? (int) $filters['restaurant_id']
            : 0;
        if ($restaurantId > 0) {
            $query->where('r.restaurant_id', $restaurantId);
        }

        $depositStatus = trim((string) ($filters['deposit_status'] ?? ''));
        if ($depositStatus !== '' && $depositStatus !== 'all') {
            $query->where('r.deposit_status', $depositStatus);
        }

        $attention = trim((string) ($filters['attention'] ?? ''));
        if ($attention !== '' && $attention !== 'all') {
            $this->applyAttentionFilter($query, $attention, $manilaNow);
        }

        $dateFrom = trim((string) ($filters['date_from'] ?? ''));
        if ($dateFrom !== '') {
            $query->where('r.reservation_start', '>=', "{$dateFrom} 00:00:00");
        }

        $dateTo = trim((string) ($filters['date_to'] ?? ''));
        if ($dateTo !== '') {
            $nextDayStart = CarbonImmutable::createFromFormat('Y-m-d', substr($dateTo, 0, 10), self::TIMEZONE)
                ->addDay()
                ->format('Y-m-d 00:00:00');
            $query->where('r.reservation_start', '<', $nextDayStart);
        }

        return $query;
    }

    private function applyAttentionFilter(Builder $query, string $attention, CarbonImmutable $manilaNow): void
    {
        $warningMinutes = max(5, (int) config('salo.reservations.pending_expiring_warning_minutes', 30));
        $graceMinutes = max(0, (int) config('salo.reservations.no_show_grace_minutes', 15));
        $overdueMinutes = max(0, (int) config('salo.reservations.overdue_seated_minutes', 60));

        $nowStr = $manilaNow->format('Y-m-d H:i:s');
        $noShowCutoff = $manilaNow->subMinutes($graceMinutes)->format('Y-m-d H:i:s');
        $overdueCutoff = $manilaNow->subMinutes($overdueMinutes)->format('Y-m-d H:i:s');

        $applyPendingExpiring = static function (Builder $q) use ($warningMinutes, $nowStr): void {
            $q->where('r.reservation_status', ReservationStatus::PENDING)
                ->whereNotNull('r.created_at')
                ->whereRaw(
                    'TIMESTAMPADD(MINUTE, GREATEST(5, COALESCE(rest.reservation_pending_expiry_minutes, 120)) - ?, r.created_at) <= ?',
                    [$warningMinutes, $nowStr],
                );
        };

        $applyNoShowCandidate = static function (Builder $q) use ($noShowCutoff): void {
            $q->whereIn('r.reservation_status', [ReservationStatus::CONFIRMED, ReservationStatus::ARRIVED])
                ->where('r.reservation_start', '<=', $noShowCutoff);
        };

        $applyOverdueSeated = static function (Builder $q) use ($overdueCutoff): void {
            $q->where('r.reservation_status', ReservationStatus::SEATED)
                ->where('r.reservation_end', '<', $overdueCutoff);
        };

        if ($attention === ReservationAttention::PENDING_EXPIRING) {
            $applyPendingExpiring($query);
        } elseif ($attention === ReservationAttention::NO_SHOW_CANDIDATE) {
            $applyNoShowCandidate($query);
        } elseif ($attention === ReservationAttention::OVERDUE_SEATED) {
            $applyOverdueSeated($query);
        } elseif ($attention === 'any') {
            $query->where(function (Builder $q) use ($applyPendingExpiring, $applyNoShowCandidate, $applyOverdueSeated): void {
                $q->where($applyPendingExpiring)
                    ->orWhere($applyNoShowCandidate)
                    ->orWhere($applyOverdueSeated);
            });
        }
    }

    /**
     * @return array<string, int>
     */
    private function computeLiveAttentionCounts(CarbonImmutable $manilaNow, ?int $restaurantId): array
    {
        $warningMinutes = max(5, (int) config('salo.reservations.pending_expiring_warning_minutes', 30));
        $graceMinutes = max(0, (int) config('salo.reservations.no_show_grace_minutes', 15));
        $overdueMinutes = max(0, (int) config('salo.reservations.overdue_seated_minutes', 60));

        $nowStr = $manilaNow->format('Y-m-d H:i:s');
        $noShowCutoff = $manilaNow->subMinutes($graceMinutes)->format('Y-m-d H:i:s');
        $overdueCutoff = $manilaNow->subMinutes($overdueMinutes)->format('Y-m-d H:i:s');

        $row = DB::table('reservations as r')
            ->join('restaurants as rest', 'rest.restaurant_id', '=', 'r.restaurant_id')
            ->whereIn('r.reservation_status', [
                ReservationStatus::PENDING,
                ReservationStatus::CONFIRMED,
                ReservationStatus::ARRIVED,
                ReservationStatus::SEATED,
            ])
            ->when($restaurantId !== null && $restaurantId > 0, static fn (Builder $q) => $q->where('r.restaurant_id', $restaurantId))
            ->selectRaw(
                'SUM(CASE WHEN r.reservation_status = ? AND r.created_at IS NOT NULL AND TIMESTAMPADD(MINUTE, GREATEST(5, COALESCE(rest.reservation_pending_expiry_minutes, 120)) - ?, r.created_at) <= ? THEN 1 ELSE 0 END) as pending_expiring,
                 SUM(CASE WHEN r.reservation_status IN (?, ?) AND r.reservation_start <= ? THEN 1 ELSE 0 END) as no_show_candidate,
                 SUM(CASE WHEN r.reservation_status = ? AND r.reservation_end < ? THEN 1 ELSE 0 END) as overdue_seated',
                [
                    ReservationStatus::PENDING,
                    $warningMinutes,
                    $nowStr,
                    ReservationStatus::CONFIRMED,
                    ReservationStatus::ARRIVED,
                    $noShowCutoff,
                    ReservationStatus::SEATED,
                    $overdueCutoff,
                ],
            )
            ->first();

        $pendingExpiring = (int) ($row->pending_expiring ?? 0);
        $noShowCandidate = (int) ($row->no_show_candidate ?? 0);
        $overdueSeated = (int) ($row->overdue_seated ?? 0);

        return [
            ReservationAttention::PENDING_EXPIRING => $pendingExpiring,
            ReservationAttention::NO_SHOW_CANDIDATE => $noShowCandidate,
            ReservationAttention::OVERDUE_SEATED => $overdueSeated,
            'total' => $pendingExpiring + $noShowCandidate + $overdueSeated,
        ];
    }

    /**
     * @return list<string>
     */
    private function selectColumns(): array
    {
        return [
            'r.reservation_id',
            'r.reservation_reference',
            'r.customer_id',
            'r.restaurant_id',
            'r.table_id',
            'r.contact_name',
            'r.contact_phone',
            'r.reservation_start',
            'r.reservation_end',
            'r.number_of_guests',
            'r.reservation_status',
            'r.deposit_amount',
            'r.deposit_status',
            'r.service_fee',
            'r.is_fee_refundable',
            'r.cancellation_fee',
            'r.special_requests',
            'r.cancelled_by',
            'r.cancelled_at',
            'r.cancellation_reason',
            'r.rejection_reason',
            'r.rejected_at',
            'r.approved_at',
            'r.confirmed_at',
            'r.arrived_at',
            'r.seated_at',
            'r.completed_at',
            'r.expired_at',
            'r.no_show_marked_at',
            'r.no_show_marked_by',
            'r.created_at',
            'r.updated_at',
            'rest.restaurant_name',
            'rest.reservation_cancellation_cutoff_minutes',
            'rest.reservation_pending_expiry_minutes',
            'u.first_name as customer_first_name',
            'u.last_name as customer_last_name',
            'u.email as customer_email',
            'u.phone_number as customer_phone',
            'rt.table_name',
            'rt.dining_area',
            'rt.description as table_description',
            'rt.seating_capacity',
            'rt.min_party_size',
        ];
    }
}
