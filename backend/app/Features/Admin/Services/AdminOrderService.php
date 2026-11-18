<?php

namespace App\Features\Admin\Services;

use App\Features\Orders\Support\OrderTimestampFormatter;
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
        $search = trim((string) ($filters['search'] ?? ''));
        $orderStatus = trim((string) ($filters['order_status'] ?? ''));
        $orderType = trim((string) ($filters['order_type'] ?? ''));
        $paymentStatus = trim((string) ($filters['payment_status'] ?? ''));
        $dateFrom = trim((string) ($filters['date_from'] ?? ''));
        $dateTo = trim((string) ($filters['date_to'] ?? ''));
        $direction = strtolower((string) ($filters['direction'] ?? 'desc')) === 'asc' ? 'asc' : 'desc';

        $latestPaymentSub = DB::table('payment_allocations as pa')
            ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
            ->where('pa.allocation_type', 'order_payment')
            ->selectRaw('pa.order_id, MAX(p.payment_id) as latest_payment_id')
            ->groupBy('pa.order_id');

        $query = DB::table('orders as o')
            ->leftJoinSub($latestPaymentSub, 'lp', fn ($join) => $join->on('lp.order_id', '=', 'o.order_id'))
            ->leftJoin('payments as p', 'p.payment_id', '=', 'lp.latest_payment_id')
            ->leftJoin('deliveries as d', 'd.order_id', '=', 'o.order_id')
            ->select([
                'o.order_id',
                'o.checkout_id',
                'o.order_reference',
                'o.customer_id',
                'o.customer_name',
                'o.restaurant_id',
                'o.restaurant_name',
                'o.order_type',
                'o.order_status',
                'o.subtotal_amount',
                'o.delivery_fee',
                'o.total_amount',
                'o.placed_at',
                'o.accepted_at',
                'o.completed_at',
                'o.cancelled_at',
                'o.rejected_at',
                'p.payment_method',
                'p.payment_status',
                'p.paid_at',
                'd.delivery_status',
            ]);

        if ($search !== '') {
            $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $search);
            $like = "%{$escaped}%";
            $query->where(function ($q) use ($like): void {
                $q->where('o.order_reference', 'like', $like)
                    ->orWhere('o.customer_name', 'like', $like)
                    ->orWhere('o.restaurant_name', 'like', $like);
            });
        }

        if ($orderStatus !== '' && $orderStatus !== 'all') {
            $query->where('o.order_status', $orderStatus);
        }

        if ($orderType !== '' && $orderType !== 'all') {
            $query->where('o.order_type', $orderType);
        }

        if ($paymentStatus !== '' && $paymentStatus !== 'all') {
            $query->whereRaw("COALESCE(p.payment_status, 'pending') = ?", [$paymentStatus]);
        }

        if ($dateFrom !== '') {
            $query->whereDate('o.placed_at', '>=', $dateFrom);
        }

        if ($dateTo !== '') {
            $query->whereDate('o.placed_at', '<=', $dateTo);
        }

        $paginator = $query
            ->orderBy('o.placed_at', $direction)
            ->orderBy('o.order_id', $direction)
            ->paginate($perPage, ['*'], 'page', $page);

        $rows = collect($paginator->items());
        $orderIds = $rows->pluck('order_id')->map(fn ($id) => (int) $id)->all();

        $itemCounts = $orderIds === []
            ? collect()
            : DB::table('order_items')
                ->whereIn('order_id', $orderIds)
                ->selectRaw('order_id, COUNT(*) as line_count, SUM(quantity) as total_qty')
                ->groupBy('order_id')
                ->get()
                ->keyBy('order_id');

        $items = $rows->map(function (object $row) use ($itemCounts): array {
            $orderId = (int) $row->order_id;
            $counts = $itemCounts->get($orderId);

            return [
                'order_id' => $orderId,
                'checkout_id' => (int) $row->checkout_id,
                'order_reference' => $row->order_reference,
                'customer_id' => (int) $row->customer_id,
                'customer_name' => $row->customer_name,
                'restaurant_id' => (int) $row->restaurant_id,
                'restaurant_name' => $row->restaurant_name,
                'order_type' => $row->order_type,
                'order_status' => $row->order_status,
                'payment_method' => $row->payment_method === 'cash' ? 'cod' : ($row->payment_method ?? 'cod'),
                'payment_status' => $row->payment_status ?? 'pending',
                'subtotal_amount' => (float) $row->subtotal_amount,
                'delivery_fee' => (float) $row->delivery_fee,
                'total_amount' => (float) $row->total_amount,
                'items_count' => (int) ($counts->line_count ?? 0),
                'total_quantity' => (int) ($counts->total_qty ?? 0),
                'delivery_status' => $row->delivery_status,
                'placed_at' => OrderTimestampFormatter::toManilaIso($row->placed_at),
                'paid_at' => OrderTimestampFormatter::toManilaIso($row->paid_at),
            ];
        })->all();

        return [
            'items' => $items,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ];
    }
}
