<?php

namespace App\Features\Orders\Services;

use App\Features\Connect\Services\ConversationService;
use App\Features\Connect\Services\OrderConnectService;
use App\Features\Notifications\Services\NotificationService;
use App\Features\Orders\Support\OrderPaymentSnapshotLoader;
use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Features\Payments\Services\RefundService;
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
        private readonly NotificationService $notificationService,
        private readonly RefundService $refundService,
        private readonly OrderConnectService $connectService,
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

        $baseQuery = DB::table('orders as o')
            ->where('o.customer_id', $user->user_id)
            ->whereNull('o.reservation_id');

        if ($status !== '' && $status !== 'all') {
            $baseQuery->where('o.order_status', $status);
        }

        $total = (int) (clone $baseQuery)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));

        $rows = $baseQuery
            ->leftJoin('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->leftJoin('deliveries as d', 'd.order_id', '=', 'o.order_id')
            ->leftJoin('riders as rd', 'rd.rider_id', '=', 'd.rider_id')
            ->leftJoin('users as ru', 'ru.user_id', '=', 'rd.user_id')
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
            ])
            ->orderByDesc('o.placed_at')
            ->orderByDesc('o.order_id')
            ->forPage($page, $perPage)
            ->get();

        $orderIds = $rows->pluck('order_id')->map(fn ($id) => (int) $id)->all();

        $itemCounts = $orderIds === []
            ? collect()
            : DB::table('order_items')
                ->whereIn('order_id', $orderIds)
                ->selectRaw('order_id, COUNT(*) as line_count, SUM(quantity) as total_qty')
                ->groupBy('order_id')
                ->get()
                ->keyBy('order_id');

        $paymentsByOrder = OrderPaymentSnapshotLoader::loadByOrderIds($orderIds);

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
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => $lastPage,
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
            ->whereNull('o.reservation_id')
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

        $connectState = $this->connectService->syncAndGetConnectState($orderId);

        $rawItems = DB::table('order_items')
            ->where('order_id', $orderId)
            ->orderBy('order_item_id')
            ->get([
                'order_item_id',
                'menu_item_id',
                'item_name',
                'unit_price',
                'quantity',
                'line_total',
            ]);

        $orderItemIds = $rawItems->pluck('order_item_id')->map(fn ($id) => (int) $id)->all();
        $addOnsByOrderItem = $orderItemIds === []
            ? collect()
            : DB::table('order_item_add_ons')
                ->whereIn('order_item_id', $orderItemIds)
                ->orderBy('order_item_add_on_id')
                ->get([
                    'order_item_add_on_id',
                    'order_item_id',
                    'add_on_option_id',
                    'group_name',
                    'option_name',
                    'additional_price',
                ])
                ->groupBy('order_item_id');

        $items = $rawItems
            ->map(fn ($item) => [
                'order_item_id' => (int) $item->order_item_id,
                'menu_item_id' => $item->menu_item_id !== null ? (int) $item->menu_item_id : null,
                'item_name' => $item->item_name,
                'unit_price' => (float) $item->unit_price,
                'quantity' => (int) $item->quantity,
                'line_total' => (float) $item->line_total,
                'add_ons' => $addOnsByOrderItem->get($item->order_item_id, collect())
                    ->map(fn ($ao) => [
                        'id' => $ao->add_on_option_id !== null ? (int) $ao->add_on_option_id : null,
                        'add_on_option_id' => $ao->add_on_option_id !== null ? (int) $ao->add_on_option_id : null,
                        'group_name' => $ao->group_name,
                        'name' => $ao->option_name,
                        'option_name' => $ao->option_name,
                        'price' => (float) $ao->additional_price,
                        'additional_price' => (float) $ao->additional_price,
                    ])
                    ->values()
                    ->all(),
            ])
            ->values()
            ->all();

        $payment = OrderPaymentSnapshotLoader::loadByOrderIds([$orderId])->get($orderId);
        $refund = OrderPaymentSnapshotLoader::loadRefundsByOrderIds([$orderId])->get($orderId);

        return [
            'order_id' => (int) $row->order_id,
            'checkout_id' => (int) $row->checkout_id,
            'order_reference' => $row->order_reference,
            'restaurant_id' => (int) $row->restaurant_id,
            'restaurant_name' => $row->restaurant_name,
            'restaurant_logo_url' => $this->fileStorageService->publicUrl($row->logo_image),
            'customer_name' => $row->customer_name,
            'fulfillment' => $row->order_type,
            'order_status' => $connectState['order_status'] ?? $row->order_status,
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
                'provider_name' => $payment?->provider_name,
                'payment_channel' => $payment?->payment_channel,
                'status' => $payment?->payment_status ?? 'pending',
                'amount' => $payment ? (float) $payment->amount : (float) $row->total_amount,
                'checkout_url' => $payment?->checkout_url,
                'expires_at' => OrderTimestampFormatter::toManilaIso($payment?->expires_at),
                'paid_at' => OrderTimestampFormatter::toManilaIso($payment?->paid_at),
                'refund' => $refund ? [
                    'payment_id' => (int) $refund->payment_id,
                    'payment_reference' => $refund->payment_reference,
                    'status' => $refund->refund_status ?? $refund->payment_status,
                    'amount' => (float) $refund->amount,
                    'paid_at' => OrderTimestampFormatter::toManilaIso($refund->paid_at),
                    'created_at' => OrderTimestampFormatter::toManilaIso($refund->created_at),
                ] : null,
            ],
            'items' => $items,
            'accepted_at' => OrderTimestampFormatter::toManilaIso($row->accepted_at),
            'delivered_at' => OrderTimestampFormatter::toManilaIso($row->delivered_at),
            'completed_at' => OrderTimestampFormatter::toManilaIso($row->completed_at),
            'cancelled_at' => $connectState['cancelled_at'] ?? OrderTimestampFormatter::toManilaIso($row->cancelled_at),
            'cancelled_by' => $connectState['cancelled_by'] ?? $row->cancelled_by,
            'cancellation_reason' => $connectState['cancellation_reason'] ?? $row->cancellation_reason,
            'cancel_reason' => $connectState['cancel_reason'] ?? $row->cancellation_reason,
            'arrived_at' => $connectState['arrived_at'],
            'call_attempts' => $connectState['call_attempts'],
            'max_strikes' => $connectState['max_strikes'],
            'last_call_resolved_at' => $connectState['last_call_resolved_at'],
            'cooldown_ends_at' => $connectState['cooldown_ends_at'],
            'cancel_available_at' => $connectState['cancel_available_at'],
            'pending_call' => $connectState['pending_call'],
            'active_waiting_request' => $connectState['active_waiting_request'],
            'waiting_requests_count' => $connectState['waiting_requests_count'],
            'max_wait_requests' => $connectState['max_wait_requests'],
            'unread_messages_count' => app(ConversationService::class)->countUnreadForUser($orderId, (int) $user->user_id),
            'customer_ordering_suspended' => $connectState['customer_ordering_suspended'],
            'ordering_suspended_until' => $connectState['ordering_suspended_until'],
            'suspension_reason' => $connectState['suspension_reason'],
            'server_now' => $connectState['server_now'],
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
                ->whereNull('reservation_id')
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
            } else {
                $refund = $this->refundService->refundOrderIfPaid(
                    orderId: $orderId,
                    actorUserId: (int) $user->user_id,
                    reason: $cleanReason ?? 'Customer cancelled order',
                    request: $request,
                );
                if ($refund !== null) {
                    $newAuditValues['refund_reference'] = $refund['payment_reference'];
                }
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

            $this->notificationService->notifyUser(
                userId: (int) $user->user_id,
                workspace: 'customer',
                type: 'order_cancelled',
                title: "Order {$order->order_reference} cancelled",
                body: "Your order {$order->order_reference} at {$order->restaurant_name} has been cancelled.",
                relatedEntityType: 'order',
                relatedEntityId: $orderId,
            );

            $handlerIds = $this->notificationService->resolveRestaurantOrderHandlerUserIds((int) $order->restaurant_id);
            $customerFirstName = trim((string) ($user->first_name ?? '')) ?: 'A customer';
            $this->notificationService->notifyUsers(
                userIds: $handlerIds,
                workspace: 'restaurant',
                type: 'order_cancelled_by_customer',
                title: "Order {$order->order_reference} cancelled",
                body: "{$customerFirstName} cancelled pending order {$order->order_reference}.",
                relatedEntityType: 'order',
                relatedEntityId: $orderId,
            );
        });

        return $this->getOrderDetail($user, $orderId);
    }
}
