<?php

namespace App\Features\Orders\Services;

use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\FileStorageService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class CustomerOrderService
{
    public function __construct(
        private readonly FileStorageService $fileStorageService,
        private readonly AuditLogService $auditLogService,
    ) {}

    /**
     * Return paginated orders for the authenticated customer, newest first.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listOrders(User $user, array $filters = []): array
    {
        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 15)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $status = trim((string) ($filters['status'] ?? ''));

        $query = DB::table('orders as o')
            ->leftJoin('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->leftJoin('deliveries as d', 'd.order_id', '=', 'o.order_id')
            ->leftJoin('riders as rd', 'rd.rider_id', '=', 'd.rider_id')
            ->leftJoin('users as ru', 'ru.user_id', '=', 'rd.user_id')
            ->where('o.customer_id', $user->user_id)
            ->select([
                'o.order_id',
                'o.checkout_id',
                'o.restaurant_id',
                'o.restaurant_name',
                'o.order_reference',
                'o.order_type',
                'o.order_status',
                'o.subtotal_amount',
                'o.delivery_fee',
                'o.total_amount',
                'o.delivery_address_text',
                'o.accepted_at',
                'o.completed_at',
                'o.cancelled_at',
                'o.cancelled_by',
                'o.cancellation_reason',
                'o.rejection_reason',
                'o.rejected_at',
                'o.placed_at',
                'd.delivered_at',
                'ru.first_name as rider_first_name',
                'r.logo_image',
            ]);

        if ($status !== '' && $status !== 'all') {
            $query->where('o.order_status', $status);
        }

        $paginator = $query
            ->orderByDesc('o.placed_at')
            ->orderByDesc('o.order_id')
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

        $paymentsByOrder = $this->loadPaymentsByOrder($orderIds);

        $orders = $rows->map(function (object $row) use ($itemCounts, $paymentsByOrder): array {
            $orderId = (int) $row->order_id;
            $counts = $itemCounts->get($orderId);
            $payment = $paymentsByOrder->get($orderId);

            return [
                'order_id' => $orderId,
                'checkout_id' => (int) $row->checkout_id,
                'order_reference' => $row->order_reference,
                'restaurant_id' => (int) $row->restaurant_id,
                'restaurant_name' => $row->restaurant_name,
                'restaurant_logo_url' => $this->fileStorageService->publicUrl($row->logo_image),
                'fulfillment' => $row->order_type,
                'order_status' => $row->order_status,
                'subtotal_amount' => (float) $row->subtotal_amount,
                'delivery_fee' => (float) $row->delivery_fee,
                'total_amount' => (float) $row->total_amount,
                'delivery_address_text' => $row->delivery_address_text,
                'items_count' => (int) ($counts->line_count ?? 0),
                'total_quantity' => (int) ($counts->total_qty ?? 0),
                'payment_method' => $payment?->payment_method === 'cash' ? 'cod' : ($payment?->payment_method ?? 'cod'),
                'payment_status' => $payment?->payment_status ?? 'pending',
                'paid_at' => OrderTimestampFormatter::toManilaIso($payment?->paid_at),
                'accepted_at' => OrderTimestampFormatter::toManilaIso($row->accepted_at),
                'delivered_at' => OrderTimestampFormatter::toManilaIso($row->delivered_at),
                'completed_at' => OrderTimestampFormatter::toManilaIso($row->completed_at),
                'cancelled_at' => OrderTimestampFormatter::toManilaIso($row->cancelled_at),
                'cancelled_by' => $row->cancelled_by,
                'cancellation_reason' => $row->cancellation_reason,
                'rejection_reason' => $row->rejection_reason,
                'rejected_at' => OrderTimestampFormatter::toManilaIso($row->rejected_at),
                'placed_at' => OrderTimestampFormatter::toManilaIso($row->placed_at),
                'rider' => $row->rider_first_name ? ['first_name' => $row->rider_first_name] : null,
            ];
        })->all();

        return [
            'orders' => $orders,
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ];
    }

    /**
     * Return full order detail for the authenticated customer.
     * Returns 404 if the order does not exist or belongs to another customer.
     *
     * @return array<string, mixed>
     */
    public function getOrderDetail(User $user, int $orderId): array
    {
        $row = DB::table('orders as o')
            ->leftJoin('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->leftJoin('deliveries as d', 'd.order_id', '=', 'o.order_id')
            ->leftJoin('riders as rd', 'rd.rider_id', '=', 'd.rider_id')
            ->leftJoin('users as ru', 'ru.user_id', '=', 'rd.user_id')
            ->where('o.order_id', $orderId)
            ->where('o.customer_id', $user->user_id)
            ->select([
                'o.*',
                'd.delivered_at',
                'ru.first_name as rider_first_name',
                'r.logo_image',
            ])
            ->first();

        if (! $row) {
            throw new NotFoundHttpException('Order not found.');
        }

        $items = DB::table('order_items')
            ->where('order_id', $orderId)
            ->orderBy('order_item_id')
            ->get([
                'order_item_id',
                'menu_item_id',
                'item_name',
                'unit_price',
                'quantity',
                'line_total',
            ])
            ->map(fn ($item) => [
                'order_item_id' => (int) $item->order_item_id,
                'menu_item_id' => $item->menu_item_id !== null ? (int) $item->menu_item_id : null,
                'item_name' => $item->item_name,
                'unit_price' => (float) $item->unit_price,
                'quantity' => (int) $item->quantity,
                'line_total' => (float) $item->line_total,
            ])
            ->values()
            ->all();

        $payment = $this->loadPaymentsByOrder([$orderId])->get($orderId);

        return [
            'order_id' => (int) $row->order_id,
            'checkout_id' => (int) $row->checkout_id,
            'order_reference' => $row->order_reference,
            'restaurant_id' => (int) $row->restaurant_id,
            'restaurant_name' => $row->restaurant_name,
            'restaurant_logo_url' => $this->fileStorageService->publicUrl($row->logo_image),
            'customer_name' => $row->customer_name,
            'fulfillment' => $row->order_type,
            'order_status' => $row->order_status,
            'subtotal_amount' => (float) $row->subtotal_amount,
            'delivery_fee' => (float) $row->delivery_fee,
            'total_amount' => (float) $row->total_amount,
            'delivery_address' => $row->order_type === 'delivery' ? [
                'address_id' => $row->delivery_address_id !== null ? (int) $row->delivery_address_id : null,
                'recipient_name' => $row->delivery_recipient_name,
                'phone' => $row->delivery_phone,
                'address_text' => $row->delivery_address_text,
                'latitude' => $row->delivery_latitude !== null ? (float) $row->delivery_latitude : null,
                'longitude' => $row->delivery_longitude !== null ? (float) $row->delivery_longitude : null,
                'notes' => $row->delivery_notes,
            ] : null,
            'payment' => [
                'payment_id' => $payment ? (int) $payment->payment_id : null,
                'payment_reference' => $payment?->payment_reference,
                'method' => $payment?->payment_method === 'cash' ? 'cod' : ($payment?->payment_method ?? 'cod'),
                'status' => $payment?->payment_status ?? 'pending',
                'amount' => $payment ? (float) $payment->amount : (float) $row->total_amount,
                'paid_at' => OrderTimestampFormatter::toManilaIso($payment?->paid_at),
            ],
            'items' => $items,
            'accepted_at' => OrderTimestampFormatter::toManilaIso($row->accepted_at),
            'delivered_at' => OrderTimestampFormatter::toManilaIso($row->delivered_at),
            'completed_at' => OrderTimestampFormatter::toManilaIso($row->completed_at),
            'cancelled_at' => OrderTimestampFormatter::toManilaIso($row->cancelled_at),
            'cancelled_by' => $row->cancelled_by,
            'cancellation_reason' => $row->cancellation_reason,
            'rejection_reason' => $row->rejection_reason,
            'rejected_at' => OrderTimestampFormatter::toManilaIso($row->rejected_at),
            'placed_at' => OrderTimestampFormatter::toManilaIso($row->placed_at),
            'rider' => $row->rider_first_name ? ['first_name' => $row->rider_first_name] : null,
        ];
    }

    /**
     * Cancel a customer's own pending order and cancel its pending COD payment.
     *
     * @return array<string, mixed>
     */
    public function cancelOrder(User $user, int $orderId, ?string $reason, Request $request): array
    {
        $cleanReason = $reason !== null && trim($reason) !== ''
            ? mb_substr(trim($reason), 0, 255)
            : null;

        DB::transaction(function () use ($user, $orderId, $cleanReason, $request): void {
            $order = DB::table('orders')
                ->where('order_id', $orderId)
                ->where('customer_id', $user->user_id)
                ->lockForUpdate()
                ->first();

            if (! $order) {
                throw new NotFoundHttpException('Order not found.');
            }

            $currentStatus = (string) $order->order_status;
            if ($currentStatus !== 'pending') {
                throw new ConflictHttpException(
                    "Only pending orders can be cancelled (current status: {$currentStatus})."
                );
            }

            $now = now();
            DB::table('orders')
                ->where('order_id', $orderId)
                ->update([
                    'order_status' => 'cancelled',
                    'cancelled_at' => $now,
                    'cancelled_by' => 'customer',
                    'cancellation_reason' => $cleanReason,
                    'updated_at' => $now,
                ]);

            $oldAuditValues = ['order_status' => $currentStatus];
            $newAuditValues = ['order_status' => 'cancelled'];

            $codPayment = DB::table('payment_allocations as pa')
                ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
                ->where('pa.order_id', $orderId)
                ->where('pa.allocation_type', 'order_payment')
                ->where('p.payment_method', 'cash')
                ->where('p.payment_status', 'pending')
                ->lockForUpdate()
                ->select(['p.payment_id', 'p.payment_status'])
                ->first();

            if ($codPayment) {
                DB::table('payments')
                    ->where('payment_id', $codPayment->payment_id)
                    ->where('payment_method', 'cash')
                    ->where('payment_status', 'pending')
                    ->update([
                        'payment_status' => 'cancelled',
                        'updated_at' => $now,
                    ]);

                $oldAuditValues['payment_status'] = (string) $codPayment->payment_status;
                $newAuditValues['payment_status'] = 'cancelled';
            }

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'customer_order_cancelled',
                entityType: 'orders',
                entityId: $orderId,
                oldValues: $oldAuditValues,
                newValues: $newAuditValues,
                reason: $cleanReason,
                request: $request,
            );
        });

        return $this->getOrderDetail($user, $orderId);
    }

    /**
     * @param  array<int, int>  $orderIds
     */
    private function loadPaymentsByOrder(array $orderIds)
    {
        if ($orderIds === []) {
            return collect();
        }

        return DB::table('payment_allocations as pa')
            ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
            ->whereIn('pa.order_id', $orderIds)
            ->where('pa.allocation_type', 'order_payment')
            ->select([
                'pa.order_id',
                'p.payment_id',
                'p.payment_reference',
                'p.payment_method',
                'p.payment_status',
                'p.amount',
                'p.paid_at',
            ])
            ->get()
            ->keyBy('order_id');
    }
}
