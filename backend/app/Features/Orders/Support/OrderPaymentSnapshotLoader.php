<?php

namespace App\Features\Orders\Support;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class OrderPaymentSnapshotLoader
{
    /**
     * Batch-load the latest order_payment snapshot for each given order_id.
     *
     * @param  array<int, int>  $orderIds
     * @return Collection<int, object>
     */
    public static function loadByOrderIds(array $orderIds): Collection
    {
        if ($orderIds === []) {
            return collect();
        }

        return DB::table('payment_allocations as pa')
            ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
            ->whereIn('pa.order_id', $orderIds)
            ->where('pa.allocation_type', 'order_payment')
            ->orderByDesc('p.payment_id')
            ->select([
                'pa.order_id',
                'p.payment_id',
                'p.payment_reference',
                'p.payment_method',
                'p.provider_name',
                'p.payment_channel',
                'p.payment_status',
                'p.amount',
                'p.checkout_url',
                'p.paid_at',
                'p.expires_at',
            ])
            ->get()
            ->unique('order_id')
            ->keyBy('order_id');
    }

    /**
     * Batch-load the latest order_refund snapshot for each given order_id.
     *
     * @param  array<int, int>  $orderIds
     * @return Collection<int, object>
     */
    public static function loadRefundsByOrderIds(array $orderIds): Collection
    {
        if ($orderIds === []) {
            return collect();
        }

        return DB::table('payment_allocations as pa')
            ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
            ->whereIn('pa.order_id', $orderIds)
            ->where('pa.allocation_type', 'order_refund')
            ->where('p.payment_type', 'refund')
            ->orderByDesc('p.payment_id')
            ->select([
                'pa.order_id',
                'p.payment_id',
                'p.payment_reference',
                'p.payment_status',
                'p.refund_status',
                'p.amount',
                'p.paid_at',
                'p.created_at',
            ])
            ->get()
            ->unique('order_id')
            ->keyBy('order_id');
    }
}
