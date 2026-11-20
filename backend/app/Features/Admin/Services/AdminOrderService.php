<?php

namespace App\Features\Admin\Services;

use App\Features\Orders\Support\OrderPaymentSnapshotLoader;
use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Support\SqlLike;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class AdminOrderService
{
    public const ORDER_STATUSES = [
        'pending',
        'accepted',
        'preparing',
        'ready',
        'out_for_delivery',
        'delivered',
        'completed',
        'cancelled',
        'failed',
        'rejected',
    ];

    public const ORDER_TYPES = [
        'delivery',
        'pickup',
        'dine_in',
    ];

    public const PAYMENT_STATUSES = [
        'pending',
        'requires_customer_action',
        'processing',
        'authorized',
        'partially_captured',
        'paid',
        'declined',
        'failed',
        'expired',
        'voided',
        'cancelled',
        'partially_refunded',
        'refunded',
        'disputed',
        'reversed',
    ];

    /**
     * Return paginated platform-wide orders with search, filters, and aggregated item counts.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listOrders(array $filters): array
    {
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 15)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $paymentStatus = trim((string) ($filters['payment_status'] ?? ''));
        $direction = strtolower((string) ($filters['direction'] ?? 'desc')) === 'asc' ? 'asc' : 'desc';
        $hasPaymentStatusFilter = $paymentStatus !== '' && $paymentStatus !== 'all';

        $baseQuery = $this->buildOrdersBaseQuery($filters, $paymentStatus, $hasPaymentStatusFilter);
        $total = (int) (clone $baseQuery)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));

        $rows = $baseQuery
            ->leftJoin('deliveries as d', 'd.order_id', '=', 'o.order_id')
            ->select($this->selectOrderColumns($hasPaymentStatusFilter))
            ->orderBy('o.placed_at', $direction)
            ->orderBy('o.order_id', $direction)
            ->forPage($page, $perPage)
            ->get();

        $orderIds = $rows->pluck('order_id')->map(static fn ($id): int => (int) $id)->all();
        $latestPaymentsByOrder = (! $hasPaymentStatusFilter && $orderIds !== [])
            ? OrderPaymentSnapshotLoader::loadByOrderIds($orderIds)->all()
            : [];
        $itemCounts = $this->loadOrderItemCounts($orderIds);

        $items = $rows->map(function (object $row) use ($itemCounts, $hasPaymentStatusFilter, $latestPaymentsByOrder): array {
            $orderId = (int) $row->order_id;

            return $this->formatAdminOrderRow(
                $row,
                $itemCounts->get($orderId),
                $latestPaymentsByOrder[$orderId] ?? null,
                $hasPaymentStatusFilter,
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
     * @param  array<string, mixed>  $filters
     */
    private function buildOrdersBaseQuery(array $filters, string $paymentStatus, bool $hasPaymentStatusFilter): Builder
    {
        $baseQuery = DB::table('orders as o');

        if ($hasPaymentStatusFilter) {
            $latestPaymentSub = DB::table('payment_allocations as pa')
                ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
                ->where('pa.allocation_type', 'order_payment')
                ->selectRaw('pa.order_id, MAX(p.payment_id) as latest_payment_id')
                ->groupBy('pa.order_id');

            $baseQuery
                ->leftJoinSub($latestPaymentSub, 'lp', fn ($join) => $join->on('lp.order_id', '=', 'o.order_id'))
                ->leftJoin('payments as p', 'p.payment_id', '=', 'lp.latest_payment_id')
                ->whereRaw("COALESCE(p.payment_status, 'pending') = ?", [$paymentStatus]);
        }

        $search = trim((string) ($filters['search'] ?? ''));
        if ($search !== '') {
            $like = '%'.SqlLike::escape($search).'%';
            $baseQuery->where(function ($q) use ($like): void {
                $q->where('o.order_reference', 'like', $like)
                    ->orWhere('o.customer_name', 'like', $like)
                    ->orWhere('o.restaurant_name', 'like', $like);
            });
        }

        $orderStatus = trim((string) ($filters['order_status'] ?? ''));
        if ($orderStatus !== '' && $orderStatus !== 'all') {
            $baseQuery->where('o.order_status', $orderStatus);
        }

        $orderType = trim((string) ($filters['order_type'] ?? ''));
        if ($orderType !== '' && $orderType !== 'all') {
            $baseQuery->where('o.order_type', $orderType);
        }

        $this->applyDateRangeFilters(
            $baseQuery,
            trim((string) ($filters['date_from'] ?? '')),
            trim((string) ($filters['date_to'] ?? '')),
        );

        return $baseQuery;
    }

    private function applyDateRangeFilters(Builder $query, string $dateFrom, string $dateTo): void
    {
        if ($dateFrom !== '') {
            $fromDateOnly = substr($dateFrom, 0, 10);
            $query->where('o.placed_at', '>=', "{$fromDateOnly} 00:00:00");
        }

        if ($dateTo !== '') {
            $toDateOnly = substr($dateTo, 0, 10);
            $nextDayStart = CarbonImmutable::createFromFormat('Y-m-d', $toDateOnly, 'Asia/Manila')
                ->addDay()
                ->format('Y-m-d 00:00:00');
            $query->where('o.placed_at', '<', $nextDayStart);
        }
    }

    /**
     * @return list<string>
     */
    private function selectOrderColumns(bool $hasPaymentStatusFilter): array
    {
        $columns = [
            'o.order_id', 'o.checkout_id', 'o.order_reference', 'o.customer_id',
            'o.customer_name', 'o.restaurant_id', 'o.restaurant_name', 'o.order_type',
            'o.order_status', 'o.subtotal_amount', 'o.delivery_fee', 'o.total_amount',
            'o.placed_at', 'o.accepted_at', 'o.completed_at', 'o.cancelled_at',
            'o.rejected_at', 'd.delivery_status',
        ];

        if ($hasPaymentStatusFilter) {
            $columns[] = 'p.payment_method';
            $columns[] = 'p.payment_status';
            $columns[] = 'p.paid_at';
        }

        return $columns;
    }

    /**
     * @param  array<int, int>  $orderIds
     */
    private function loadOrderItemCounts(array $orderIds): Collection
    {
        if ($orderIds === []) {
            return collect();
        }

        return DB::table('order_items')
            ->whereIn('order_id', $orderIds)
            ->selectRaw('order_id, COUNT(*) as line_count, SUM(quantity) as total_qty')
            ->groupBy('order_id')
            ->get()
            ->keyBy('order_id');
    }

    /**
     * @return array<string, mixed>
     */
    private function formatAdminOrderRow(
        object $row,
        ?object $counts,
        ?object $latestPayment,
        bool $hasPaymentStatusFilter,
    ): array {
        $pMethod = $hasPaymentStatusFilter ? $row->payment_method : ($latestPayment->payment_method ?? null);
        $pStatus = $hasPaymentStatusFilter ? $row->payment_status : ($latestPayment->payment_status ?? null);
        $pPaidAt = $hasPaymentStatusFilter ? $row->paid_at : ($latestPayment->paid_at ?? null);

        return [
            'order_id' => (int) $row->order_id,
            'checkout_id' => (int) $row->checkout_id,
            'order_reference' => $row->order_reference,
            'customer_id' => (int) $row->customer_id,
            'customer_name' => $row->customer_name,
            'restaurant_id' => (int) $row->restaurant_id,
            'restaurant_name' => $row->restaurant_name,
            'order_type' => $row->order_type,
            'order_status' => $row->order_status,
            'payment_method' => $pMethod === 'cash' ? 'cod' : ($pMethod ?? 'cod'),
            'payment_status' => $pStatus ?? 'pending',
            'subtotal_amount' => (float) $row->subtotal_amount,
            'delivery_fee' => (float) $row->delivery_fee,
            'total_amount' => (float) $row->total_amount,
            'items_count' => (int) ($counts->line_count ?? 0),
            'total_quantity' => (int) ($counts->total_qty ?? 0),
            'delivery_status' => $row->delivery_status,
            'placed_at' => OrderTimestampFormatter::toManilaIso($row->placed_at),
            'paid_at' => OrderTimestampFormatter::toManilaIso($pPaidAt),
        ];
    }
}
