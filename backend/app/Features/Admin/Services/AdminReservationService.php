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
     * Return paginated platform-wide reservations with search, status, restaurant, attention, and date filters.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listReservations(array $filters): array
    {
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 15)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $direction = strtolower((string) ($filters['direction'] ?? 'desc')) === 'asc' ? 'asc' : 'desc';
        $manilaNow = CarbonImmutable::now(self::TIMEZONE);

        $baseQuery = $this->buildBaseQuery($filters, $manilaNow);
        $total = (int) (clone $baseQuery)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));

        $rows = $baseQuery
            ->select($this->selectColumns())
            ->orderBy('r.reservation_start', $direction)
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
            ],
        ];
    }

    /**
     * Return platform-wide reservation monitoring stats, daily trend, top restaurants, and live attention counts.
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

        $rangeQuery = DB::table('reservations as r')
            ->where('r.reservation_start', '>=', $rangeStart)
            ->where('r.reservation_start', '<', $rangeEndExclusive);

        if ($restaurantId !== null && $restaurantId > 0) {
            $rangeQuery->where('r.restaurant_id', $restaurantId);
        }

        $statusRows = (clone $rangeQuery)
            ->selectRaw('r.reservation_status, COUNT(*) as cnt, COALESCE(SUM(r.number_of_guests), 0) as guests')
            ->groupBy('r.reservation_status')
            ->get();

        $statusCounts = array_fill_keys(ReservationStatus::ALL, 0);
        $totalReservations = 0;
        $totalGuests = 0;
        $completedGuests = 0;

        foreach ($statusRows as $sr) {
            $st = (string) $sr->reservation_status;
            $cnt = (int) $sr->cnt;
            $guests = (int) $sr->guests;
            if (array_key_exists($st, $statusCounts)) {
                $statusCounts[$st] = $cnt;
            }
            $totalReservations += $cnt;
            if (! in_array($st, [ReservationStatus::CANCELLED, ReservationStatus::REJECTED, ReservationStatus::EXPIRED], true)) {
                $totalGuests += $guests;
            }
            if ($st === ReservationStatus::COMPLETED) {
                $completedGuests += $guests;
            }
        }

        $completedCount = $statusCounts[ReservationStatus::COMPLETED];
        $noShowCount = $statusCounts[ReservationStatus::NO_SHOW];
        $cancelledCount = $statusCounts[ReservationStatus::CANCELLED];

        $finalizedForAttendance = $completedCount + $noShowCount;
        $noShowRate = $finalizedForAttendance > 0
            ? round(($noShowCount / $finalizedForAttendance) * 100, 1)
            : 0.0;
        $cancellationRate = $totalReservations > 0
            ? round(($cancelledCount / $totalReservations) * 100, 1)
            : 0.0;
        $completionRate = $totalReservations > 0
            ? round(($completedCount / $totalReservations) * 100, 1)
            : 0.0;

        // Live active upcoming count across blocking statuses
        $upcomingQuery = DB::table('reservations as r')
            ->whereIn('r.reservation_status', ReservationStatus::BLOCKING)
            ->where('r.reservation_end', '>=', $manilaNow->format('Y-m-d H:i:s'));
        if ($restaurantId !== null && $restaurantId > 0) {
            $upcomingQuery->where('r.restaurant_id', $restaurantId);
        }
        $activeUpcoming = (int) $upcomingQuery->count();

        // Live attention counts
        $attentionCounts = $this->computeLiveAttentionCounts($manilaNow, $restaurantId);

        // Daily trend
        $dailyRows = (clone $rangeQuery)
            ->selectRaw("
                DATE(r.reservation_start) as day_date,
                COUNT(*) as total,
                SUM(CASE WHEN r.reservation_status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN r.reservation_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                SUM(CASE WHEN r.reservation_status = 'no_show' THEN 1 ELSE 0 END) as no_show
            ")
            ->groupByRaw('DATE(r.reservation_start)')
            ->orderBy('day_date', 'asc')
            ->get()
            ->map(static fn (object $row): array => [
                'date' => (string) $row->day_date,
                'total' => (int) $row->total,
                'completed' => (int) $row->completed,
                'cancelled' => (int) $row->cancelled,
                'no_show' => (int) $row->no_show,
            ])
            ->all();

        // Top restaurants in range
        $topRestaurants = DB::table('reservations as r')
            ->join('restaurants as rest', 'rest.restaurant_id', '=', 'r.restaurant_id')
            ->where('r.reservation_start', '>=', $rangeStart)
            ->where('r.reservation_start', '<', $rangeEndExclusive)
            ->when($restaurantId !== null && $restaurantId > 0, static fn (Builder $q) => $q->where('r.restaurant_id', $restaurantId))
            ->selectRaw("
                r.restaurant_id,
                rest.restaurant_name,
                COUNT(*) as total_reservations,
                SUM(CASE WHEN r.reservation_status = 'completed' THEN 1 ELSE 0 END) as completed_count,
                SUM(CASE WHEN r.reservation_status = 'no_show' THEN 1 ELSE 0 END) as no_show_count,
                SUM(CASE WHEN r.reservation_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count
            ")
            ->groupBy('r.restaurant_id', 'rest.restaurant_name')
            ->orderByDesc('total_reservations')
            ->limit(5)
            ->get()
            ->map(static fn (object $row): array => [
                'restaurant_id' => (int) $row->restaurant_id,
                'restaurant_name' => (string) $row->restaurant_name,
                'total_reservations' => (int) $row->total_reservations,
                'completed_count' => (int) $row->completed_count,
                'no_show_count' => (int) $row->no_show_count,
                'cancelled_count' => (int) $row->cancelled_count,
            ])
            ->all();

        return [
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'restaurant_id' => $restaurantId,
            'total_reservations' => $totalReservations,
            'active_upcoming' => $activeUpcoming,
            'total_guests' => $totalGuests,
            'completed_guests' => $completedGuests,
            'no_show_rate' => $noShowRate,
            'cancellation_rate' => $cancellationRate,
            'completion_rate' => $completionRate,
            'status_counts' => $statusCounts,
            'attention_counts' => $attentionCounts,
            'daily_trend' => $dailyRows,
            'top_restaurants' => $topRestaurants,
        ];
    }

    /**
     * Return full reservation detail with status history for admin inspection.
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
            ->select($this->selectColumns())
            ->first();

        if ($row === null) {
            return null;
        }

        $manilaNow = CarbonImmutable::now(self::TIMEZONE);
        $attention = ReservationAttention::compute($row, $row, $manilaNow);

        $history = DB::table('reservation_status_history')
            ->where('reservation_id', $reservationId)
            ->orderBy('created_at', 'asc')
            ->orderBy('history_id', 'asc')
            ->get()
            ->all();

        return ReservationFormatter::formatAdmin(
            row: $row,
            now: $manilaNow,
            cancellationCutoffMinutes: isset($row->reservation_cancellation_cutoff_minutes)
                ? (int) $row->reservation_cancellation_cutoff_minutes
                : null,
            statusHistory: $history,
            attention: $attention,
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
                    ->orWhere('rest.restaurant_name', 'like', $like)
                    ->orWhere('u.email', 'like', $like)
                    ->orWhereRaw("CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) LIKE ?", [$like]);
            });
        }

        $status = trim((string) ($filters['status'] ?? ''));
        if ($status !== '' && $status !== 'all') {
            $query->where('r.reservation_status', $status);
        }

        $restaurantId = isset($filters['restaurant_id']) && $filters['restaurant_id'] !== ''
            ? (int) $filters['restaurant_id']
            : 0;
        if ($restaurantId > 0) {
            $query->where('r.restaurant_id', $restaurantId);
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
