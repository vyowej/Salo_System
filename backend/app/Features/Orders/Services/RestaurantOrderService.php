<?php

namespace App\Features\Orders\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Orders\Support\OrderPaymentSnapshotLoader;
use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Features\Payments\Services\RefundService;
use App\Features\Restaurants\Services\OwnerInventoryService;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\WorkspaceAccessResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class RestaurantOrderService
{
    private const ALLOWED_TRANSITIONS = [
        'pending' => ['accepted', 'rejected'],
        'accepted' => ['preparing'],
        'preparing' => ['ready'],
        'ready' => ['completed'],
    ];

    private const ACTION_TO_STATUS = [
        'accept' => 'accepted',
        'reject' => 'rejected',
        'prepare' => 'preparing',
        'ready' => 'ready',
        'complete' => 'completed',
    ];

    public function __construct(
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
        private readonly OwnerInventoryService $ownerInventoryService,
        private readonly RefundService $refundService,
    ) {}

    public function requireActiveAuthorizedRestaurant(User $user, ?int $restaurantId = null): object
    {
        return $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForOrders($user, $restaurantId);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listOrders(User $user, array $filters = []): array
    {
        $restaurantId = isset($filters['restaurant_id']) && is_numeric($filters['restaurant_id'])
            ? (int) $filters['restaurant_id']
            : null;
        $restaurant = $this->requireActiveAuthorizedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 15)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $status = trim((string) ($filters['status'] ?? ''));

        $baseQuery = DB::table('orders as o')
            ->where('o.restaurant_id', $targetId);

        if ($status !== '' && $status !== 'all') {
            $baseQuery->where('o.order_status', $status);
        }

        $total = (int) (clone $baseQuery)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));

        $rows = $baseQuery
            ->leftJoin('users as cu', 'cu.user_id', '=', 'o.customer_id')
            ->leftJoin('deliveries as d', 'd.order_id', '=', 'o.order_id')
            ->leftJoin('riders as rd', 'rd.rider_id', '=', 'd.rider_id')
            ->leftJoin('users as ru', 'ru.user_id', '=', 'rd.user_id')
            ->select([
                'o.order_id',
                'o.order_reference',
                'o.order_type',
                'o.order_status',
                'o.customer_name',
                'o.delivery_phone',
                'o.delivery_address_text',
                'o.delivery_notes',
                'o.subtotal_amount',
                'o.delivery_fee',
                'o.total_amount',
                'o.rejection_reason',
                'o.accepted_at',
                'o.completed_at',
                'o.cancelled_at',
                'o.cancelled_by',
                'o.cancellation_reason',
                'o.rejected_at',
                'o.placed_at',
                'd.delivered_at',
                'ru.first_name as rider_first_name',
                'cu.phone_number as customer_phone',
            ])
            ->orderByDesc('o.placed_at')
            ->orderByDesc('o.order_id')
            ->forPage($page, $perPage)
            ->get();

        $orderIds = $rows->pluck('order_id')->map(fn ($id) => (int) $id)->all();

        $itemsByOrder = $orderIds === []
            ? collect()
            : DB::table('order_items')
                ->whereIn('order_id', $orderIds)
                ->orderBy('order_item_id')
                ->get(['order_item_id', 'order_id', 'menu_item_id', 'item_name', 'unit_price', 'quantity', 'line_total'])
                ->groupBy('order_id');

        $paymentsByOrder = OrderPaymentSnapshotLoader::loadByOrderIds($orderIds);

        $orders = $rows->map(function (object $row) use ($itemsByOrder, $paymentsByOrder): array {
            $orderId = (int) $row->order_id;
            $payment = $paymentsByOrder->get($orderId);
            $items = $itemsByOrder->get($orderId, collect())->map(fn ($it) => [
                'order_item_id' => (int) $it->order_item_id,
                'menu_item_id' => $it->menu_item_id !== null ? (int) $it->menu_item_id : null,
                'item_name' => $it->item_name,
                'unit_price' => (float) $it->unit_price,
                'quantity' => (int) $it->quantity,
                'line_total' => (float) $it->line_total,
            ])->values()->all();

            return [
                'order_id' => $orderId,
                'order_reference' => $row->order_reference,
                'fulfillment' => $row->order_type,
                'order_status' => $row->order_status,
                'customer_name' => $row->customer_name,
                'customer_phone' => $row->delivery_phone ?: $row->customer_phone,
                'delivery_address_text' => $row->delivery_address_text,
                'delivery_notes' => $row->delivery_notes,
                'subtotal_amount' => (float) $row->subtotal_amount,
                'delivery_fee' => (float) $row->delivery_fee,
                'total_amount' => (float) $row->total_amount,
                'payment_method' => $payment?->payment_method === 'cash' ? 'cod' : ($payment?->payment_method ?? 'cod'),
                'payment_status' => $payment?->payment_status ?? 'pending',
                'paid_at' => OrderTimestampFormatter::toManilaIso($payment?->paid_at),
                'rejection_reason' => $row->rejection_reason,
                'accepted_at' => OrderTimestampFormatter::toManilaIso($row->accepted_at),
                'delivered_at' => OrderTimestampFormatter::toManilaIso($row->delivered_at),
                'completed_at' => OrderTimestampFormatter::toManilaIso($row->completed_at),
                'cancelled_at' => OrderTimestampFormatter::toManilaIso($row->cancelled_at),
                'cancelled_by' => $row->cancelled_by,
                'cancellation_reason' => $row->cancellation_reason,
                'rejected_at' => OrderTimestampFormatter::toManilaIso($row->rejected_at),
                'placed_at' => OrderTimestampFormatter::toManilaIso($row->placed_at),
                'rider' => $row->rider_first_name ? ['first_name' => $row->rider_first_name] : null,
                'items' => $items,
            ];
        })->all();

        return [
            'restaurant_id' => $targetId,
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
     * @return array<string, mixed>
     */
    public function getOrderDetail(User $user, int $orderId, ?int $restaurantId = null): array
    {
        $restaurant = $this->requireActiveAuthorizedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $row = DB::table('orders as o')
            ->leftJoin('users as cu', 'cu.user_id', '=', 'o.customer_id')
            ->leftJoin('deliveries as d', 'd.order_id', '=', 'o.order_id')
            ->leftJoin('riders as rd', 'rd.rider_id', '=', 'd.rider_id')
            ->leftJoin('users as ru', 'ru.user_id', '=', 'rd.user_id')
            ->where('o.order_id', $orderId)
            ->where('o.restaurant_id', $targetId)
            ->select(['o.*', 'd.delivered_at', 'ru.first_name as rider_first_name', 'cu.phone_number as customer_phone'])
            ->first();

        if (! $row) {
            throw new NotFoundHttpException('Order not found.');
        }

        $items = DB::table('order_items')
            ->where('order_id', $orderId)
            ->orderBy('order_item_id')
            ->get(['order_item_id', 'menu_item_id', 'item_name', 'unit_price', 'quantity', 'line_total'])
            ->map(fn ($it) => [
                'order_item_id' => (int) $it->order_item_id,
                'menu_item_id' => $it->menu_item_id !== null ? (int) $it->menu_item_id : null,
                'item_name' => $it->item_name,
                'unit_price' => (float) $it->unit_price,
                'quantity' => (int) $it->quantity,
                'line_total' => (float) $it->line_total,
            ])
            ->values()
            ->all();

        $payment = OrderPaymentSnapshotLoader::loadByOrderIds([$orderId])->get($orderId);

        return [
            'order_id' => (int) $row->order_id,
            'order_reference' => $row->order_reference,
            'restaurant_id' => (int) $row->restaurant_id,
            'fulfillment' => $row->order_type,
            'order_status' => $row->order_status,
            'customer_name' => $row->customer_name,
            'customer_phone' => $row->delivery_phone ?: $row->customer_phone,
            'delivery_address' => $row->order_type === 'delivery' ? [
                'recipient_name' => $row->delivery_recipient_name,
                'phone' => $row->delivery_phone,
                'address_text' => $row->delivery_address_text,
                'notes' => $row->delivery_notes,
            ] : null,
            'subtotal_amount' => (float) $row->subtotal_amount,
            'delivery_fee' => (float) $row->delivery_fee,
            'total_amount' => (float) $row->total_amount,
            'payment' => [
                'method' => $payment?->payment_method === 'cash' ? 'cod' : ($payment?->payment_method ?? 'cod'),
                'status' => $payment?->payment_status ?? 'pending',
                'amount' => $payment ? (float) $payment->amount : (float) $row->total_amount,
                'paid_at' => OrderTimestampFormatter::toManilaIso($payment?->paid_at),
            ],
            'rejection_reason' => $row->rejection_reason,
            'accepted_at' => OrderTimestampFormatter::toManilaIso($row->accepted_at),
            'delivered_at' => OrderTimestampFormatter::toManilaIso($row->delivered_at),
            'completed_at' => OrderTimestampFormatter::toManilaIso($row->completed_at),
            'cancelled_at' => OrderTimestampFormatter::toManilaIso($row->cancelled_at),
            'cancelled_by' => $row->cancelled_by,
            'cancellation_reason' => $row->cancellation_reason,
            'rejected_at' => OrderTimestampFormatter::toManilaIso($row->rejected_at),
            'placed_at' => OrderTimestampFormatter::toManilaIso($row->placed_at),
            'rider' => $row->rider_first_name ? ['first_name' => $row->rider_first_name] : null,
            'items' => $items,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function transitionStatus(
        User $user,
        int $orderId,
        string $action,
        ?string $reason,
        ?int $restaurantId,
        Request $request,
    ): array {
        $nextStatus = self::ACTION_TO_STATUS[$action] ?? null;
        if ($nextStatus === null) {
            throw ValidationException::withMessages(['action' => ['Unsupported order action.']]);
        }

        $cleanReason = $reason !== null ? trim($reason) : null;
        if ($nextStatus === 'rejected' && ($cleanReason === null || $cleanReason === '')) {
            throw ValidationException::withMessages([
                'reason' => ['A rejection reason is required when rejecting an order.'],
            ]);
        }

        $restaurant = $this->requireActiveAuthorizedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        DB::transaction(function () use ($orderId, $targetId, $nextStatus, $cleanReason, $user, $request): void {
            $order = DB::table('orders')
                ->where('order_id', $orderId)
                ->where('restaurant_id', $targetId)
                ->lockForUpdate()
                ->first();

            if (! $order) {
                throw new NotFoundHttpException('Order not found.');
            }

            $currentStatus = (string) $order->order_status;
            $allowedNext = self::ALLOWED_TRANSITIONS[$currentStatus] ?? [];

            if (! in_array($nextStatus, $allowedNext, true)) {
                throw new ConflictHttpException(
                    "Invalid order status transition from '{$currentStatus}' to '{$nextStatus}'."
                );
            }

            if ($nextStatus === 'completed' && $order->order_type !== 'pickup') {
                throw new ConflictHttpException('Only pickup orders can be completed by the restaurant.');
            }

            $now = now();
            $updates = [
                'order_status' => $nextStatus,
                'updated_at' => $now,
            ];
            $oldAuditValues = ['order_status' => $currentStatus];
            $newAuditValues = ['order_status' => $nextStatus];

            if ($nextStatus === 'accepted') {
                $updates['accepted_at'] = $now;
            } elseif ($nextStatus === 'rejected') {
                $updates['rejection_reason'] = mb_substr((string) $cleanReason, 0, 255);
                $updates['rejected_at'] = $now->format('Y-m-d H:i:s');

                $codPayment = $this->findPendingCashPaymentForOrder($orderId);
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
                        reason: $cleanReason ?? 'Restaurant rejected order',
                        request: $request,
                    );
                    if ($refund !== null) {
                        $newAuditValues['refund_reference'] = $refund['payment_reference'];
                    }
                }
            } elseif ($nextStatus === 'completed') {
                $updates['completed_at'] = $now;

                $codPayment = $this->findPendingCashPaymentForOrder($orderId);
                if ($codPayment) {
                    DB::table('payments')
                        ->where('payment_id', $codPayment->payment_id)
                        ->where('payment_method', 'cash')
                        ->where('payment_status', 'pending')
                        ->update([
                            'payment_status' => 'paid',
                            'paid_at' => $now,
                            'updated_at' => $now,
                        ]);

                    $oldAuditValues['payment_status'] = (string) $codPayment->payment_status;
                    $newAuditValues['payment_status'] = 'paid';
                }
            }

            DB::table('orders')->where('order_id', $orderId)->update($updates);

            if ($nextStatus === 'completed') {
                $this->ownerInventoryService->deductStockForOrderIfConfigured($orderId, (int) $user->user_id);
            }

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: "restaurant_order_{$nextStatus}",
                entityType: 'orders',
                entityId: $orderId,
                oldValues: $oldAuditValues,
                newValues: $newAuditValues,
                reason: $cleanReason,
                request: $request,
            );

            $this->notifyCustomerForOrderTransition($order, $nextStatus, $cleanReason);
        });

        return $this->getOrderDetail($user, $orderId, $targetId);
    }

    private function findPendingCashPaymentForOrder(int $orderId): ?object
    {
        return DB::table('payment_allocations as pa')
            ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
            ->where('pa.order_id', $orderId)
            ->where('pa.allocation_type', 'order_payment')
            ->where('p.payment_method', 'cash')
            ->where('p.payment_status', 'pending')
            ->lockForUpdate()
            ->select(['p.payment_id', 'p.payment_status'])
            ->first();
    }

    private function notifyCustomerForOrderTransition(object $order, string $nextStatus, ?string $reason): void
    {
        $ref = (string) $order->order_reference;
        $restaurantName = (string) $order->restaurant_name;

        [$type, $title, $body] = match ($nextStatus) {
            'accepted' => [
                'order_accepted',
                "Order {$ref} accepted",
                "{$restaurantName} accepted your order.",
            ],
            'rejected' => [
                'order_rejected',
                "Order {$ref} rejected",
                "{$restaurantName} rejected your order. Reason: {$reason}",
            ],
            'preparing' => [
                'order_preparing',
                "Order {$ref} is being prepared",
                "{$restaurantName} is now preparing your order.",
            ],
            'ready' => [
                'order_ready',
                $order->order_type === 'pickup'
                    ? "Order {$ref} is ready for pickup"
                    : "Order {$ref} is ready for dispatch",
                $order->order_type === 'pickup'
                    ? "Your order from {$restaurantName} is ready for pickup."
                    : "Your order from {$restaurantName} is ready and waiting for a rider.",
            ],
            'completed' => [
                'order_completed',
                "Order {$ref} completed",
                "Your pickup order from {$restaurantName} is completed.",
            ],
            default => [null, null, null],
        };

        if ($type !== null) {
            $this->notificationService->notifyUser(
                userId: (int) $order->customer_id,
                workspace: 'customer',
                type: $type,
                title: $title,
                body: $body,
                relatedEntityType: 'order',
                relatedEntityId: (int) $order->order_id,
            );
        }
    }
}
