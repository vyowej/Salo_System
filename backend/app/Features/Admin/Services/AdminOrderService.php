<?php

namespace App\Features\Admin\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Orders\Support\OrderPaymentSnapshotLoader;
use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Features\Payments\Services\RefundService;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\SqlLike;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class AdminOrderService
{
    private const CANCELLABLE_STATUSES = [
        'pending',
        'accepted',
        'preparing',
        'ready',
        'out_for_delivery',
    ];

    public function __construct(
        private readonly RefundService $refundService,
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
    ) {}
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

    /**
     * Return safe admin detail for a single order (line items, add-ons, payment/refund summary, delivery).
     *
     * @return array<string, mixed>
     */
    public function getOrderDetail(int $orderId): array
    {
        $row = DB::table('orders as o')
            ->join('users as u', 'u.user_id', '=', 'o.customer_id')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->leftJoin('deliveries as d', 'd.order_id', '=', 'o.order_id')
            ->leftJoin('riders as ri', 'ri.rider_id', '=', 'd.rider_id')
            ->leftJoin('users as riu', 'riu.user_id', '=', 'ri.user_id')
            ->where('o.order_id', $orderId)
            ->first([
                'o.order_id',
                'o.checkout_id',
                'o.order_reference',
                'o.customer_id',
                'o.restaurant_id',
                'o.order_type',
                'o.order_status',
                'o.subtotal_amount',
                'o.delivery_fee',
                'o.total_amount',
                'o.placed_at',
                'o.accepted_at',
                'd.delivered_at',
                'o.completed_at',
                'o.cancelled_at',
                'o.cancelled_by',
                'o.cancellation_reason',
                'o.rejection_reason',
                'o.rejected_at',
                DB::raw("TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) as customer_name"),
                'r.restaurant_name',
                'd.delivery_id',
                'd.delivery_status',
                'd.rider_id',
                DB::raw("TRIM(CONCAT(COALESCE(riu.first_name, ''), ' ', COALESCE(riu.last_name, ''))) as rider_name"),
            ]);

        if (! $row) {
            throw new NotFoundHttpException('Order not found.');
        }

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

        $orderItemIds = $rawItems->pluck('order_item_id')->map(static fn ($id): int => (int) $id)->all();
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

        $items = $rawItems->map(static fn (object $item): array => [
            'order_item_id' => (int) $item->order_item_id,
            'menu_item_id' => $item->menu_item_id !== null ? (int) $item->menu_item_id : null,
            'item_name' => $item->item_name,
            'unit_price' => (float) $item->unit_price,
            'quantity' => (int) $item->quantity,
            'line_total' => (float) $item->line_total,
            'add_ons' => $addOnsByOrderItem->get($item->order_item_id, collect())->map(static fn (object $ao): array => [
                'group_name' => $ao->group_name,
                'option_name' => $ao->option_name,
                'additional_price' => (float) $ao->additional_price,
            ])->values()->all(),
        ])->values()->all();

        $payments = DB::table('payment_allocations as pa')
            ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
            ->where('pa.order_id', $orderId)
            ->orderBy('p.payment_id')
            ->get([
                'p.payment_id',
                'p.payment_reference',
                'p.payment_type',
                'p.payment_method',
                'p.payment_channel',
                'p.payment_status',
                'pa.allocation_type',
                'pa.amount',
                'p.paid_at',
                'p.updated_at',
                'p.created_at',
            ]);

        $latestPayment = OrderPaymentSnapshotLoader::loadByOrderIds([$orderId])->get($orderId);
        $pMethod = $latestPayment->payment_method ?? 'cash';

        return [
            'order_id' => (int) $row->order_id,
            'checkout_id' => (int) $row->checkout_id,
            'order_reference' => $row->order_reference,
            'order_type' => $row->order_type,
            'order_status' => $row->order_status,
            'can_admin_cancel' => in_array((string) $row->order_status, self::CANCELLABLE_STATUSES, true),
            'customer' => [
                'user_id' => (int) $row->customer_id,
                'name' => $row->customer_name,
            ],
            'restaurant' => [
                'restaurant_id' => (int) $row->restaurant_id,
                'restaurant_name' => $row->restaurant_name,
            ],
            'delivery' => $row->delivery_id !== null ? [
                'delivery_id' => (int) $row->delivery_id,
                'delivery_status' => $row->delivery_status,
                'rider_id' => $row->rider_id !== null ? (int) $row->rider_id : null,
                'rider_name' => $row->rider_name !== '' ? $row->rider_name : null,
            ] : null,
            'payment_method' => $pMethod === 'cash' ? 'cod' : $pMethod,
            'payment_status' => $latestPayment->payment_status ?? 'pending',
            'subtotal_amount' => (float) $row->subtotal_amount,
            'delivery_fee' => (float) $row->delivery_fee,
            'total_amount' => (float) $row->total_amount,
            'items' => $items,
            'payments' => $payments->map(static fn (object $p): array => [
                'payment_id' => (int) $p->payment_id,
                'payment_reference' => $p->payment_reference,
                'payment_type' => $p->payment_type,
                'payment_method' => $p->payment_method === 'cash' ? 'cod' : $p->payment_method,
                'payment_channel' => $p->payment_channel,
                'payment_status' => $p->payment_status,
                'allocation_type' => $p->allocation_type,
                'amount' => (float) $p->amount,
                'paid_at' => OrderTimestampFormatter::toManilaIso($p->paid_at),
                'refunded_at' => $p->payment_status === 'refunded' ? OrderTimestampFormatter::toManilaIso($p->updated_at) : null,
                'refund_reason' => null,
                'created_at' => OrderTimestampFormatter::toManilaIso($p->created_at),
            ])->values()->all(),
            'placed_at' => OrderTimestampFormatter::toManilaIso($row->placed_at),
            'accepted_at' => OrderTimestampFormatter::toManilaIso($row->accepted_at),
            'delivered_at' => OrderTimestampFormatter::toManilaIso($row->delivered_at),
            'completed_at' => OrderTimestampFormatter::toManilaIso($row->completed_at),
            'cancelled_at' => OrderTimestampFormatter::toManilaIso($row->cancelled_at),
            'cancelled_by' => $row->cancelled_by,
            'cancellation_reason' => $row->cancellation_reason,
            'rejection_reason' => $row->rejection_reason,
            'rejected_at' => OrderTimestampFormatter::toManilaIso($row->rejected_at),
        ];
    }

    /**
     * Admin force-cancel an active order (idempotent, triggers RefundService for paid online orders).
     *
     * @return array<string, mixed>
     */
    public function cancelOrder(
        int $orderId,
        string $reason,
        ?string $idempotencyKey,
        User $admin,
        Request $request,
    ): array {
        $cleanReason = mb_substr(trim($reason), 0, 255);
        $cleanIdem = $idempotencyKey !== null && trim($idempotencyKey) !== ''
            ? trim($idempotencyKey)
            : null;

        $outcome = DB::transaction(function () use ($orderId, $cleanReason, $cleanIdem, $admin, $request): array {
            $order = DB::table('orders')->where('order_id', $orderId)->lockForUpdate()->first();
            if (! $order) {
                throw new NotFoundHttpException('Order not found.');
            }

            $currentStatus = (string) $order->order_status;
            if ($currentStatus === 'cancelled' && (string) ($order->cancelled_by ?? '') === 'admin' && $cleanIdem !== null) {
                $existingLog = DB::table('audit_logs')
                    ->where('entity_type', 'orders')
                    ->where('entity_id', (string) $orderId)
                    ->where('action', 'order_cancelled_by_admin')
                    ->orderByDesc('log_id')
                    ->first(['new_values']);

                $newVals = $existingLog && is_string($existingLog->new_values)
                    ? json_decode($existingLog->new_values, true)
                    : [];
                if (($newVals['idempotency_key'] ?? null) === $cleanIdem) {
                    return ['already_cancelled' => true, 'refund' => null, 'order' => $order];
                }
            }

            if (! in_array($currentStatus, self::CANCELLABLE_STATUSES, true)) {
                $hint = $currentStatus === 'delivered'
                    ? ' Delivered orders must be resolved through Disputes rather than cancellation.'
                    : '';
                throw new ConflictHttpException("Order cannot be cancelled from status '{$currentStatus}'.{$hint}");
            }

            $now = now();
            DB::table('orders')
                ->where('order_id', $orderId)
                ->update([
                    'order_status' => 'cancelled',
                    'cancelled_at' => $now,
                    'cancelled_by' => 'admin',
                    'cancellation_reason' => $cleanReason,
                    'updated_at' => $now,
                ]);

            // Void any open delivery row if not already terminal
            DB::table('deliveries')
                ->where('order_id', $orderId)
                ->whereNotIn('delivery_status', ['delivered', 'failed', 'cancelled'])
                ->update([
                    'delivery_status' => 'cancelled',
                    'updated_at' => $now,
                ]);

            // Cancel unpaid pending payments for this sub-order (if not shared or single-order)
            $refund = $this->refundService->refundOrderIfPaid(
                orderId: $orderId,
                actorUserId: (int) $admin->user_id,
                reason: "Admin force-cancel: {$cleanReason}",
                request: $request,
            );

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: 'order_cancelled_by_admin',
                entityType: 'orders',
                entityId: (string) $orderId,
                oldValues: ['order_status' => $currentStatus],
                newValues: [
                    'order_status' => 'cancelled',
                    'cancelled_by' => 'admin',
                    'cancellation_reason' => $cleanReason,
                    'idempotency_key' => $cleanIdem,
                    'refund_id' => $refund['refund_id'] ?? null,
                ],
                reason: $cleanReason,
                request: $request,
            );

            return ['already_cancelled' => false, 'refund' => $refund, 'order' => $order];
        });

        if (! $outcome['already_cancelled']) {
            $order = $outcome['order'];
            $refundNote = $outcome['refund'] ? ' A refund has been initiated for the online payment.' : '';

            $this->notificationService->notifyUser(
                userId: (int) $order->customer_id,
                workspace: 'customer',
                type: 'order_cancelled',
                title: "Order {$order->order_reference} cancelled by admin",
                body: "Reason: {$cleanReason}.{$refundNote}",
                relatedEntityType: 'order',
                relatedEntityId: $orderId,
            );

            $handlerIds = $this->notificationService->resolveRestaurantOrderHandlerUserIds((int) $order->restaurant_id);
            if ($handlerIds !== []) {
                $this->notificationService->notifyUsers(
                    userIds: $handlerIds,
                    workspace: 'restaurant',
                    type: 'order_cancelled',
                    title: "Order {$order->order_reference} cancelled by admin",
                    body: "Reason: {$cleanReason}.",
                    relatedEntityType: 'order',
                    relatedEntityId: $orderId,
                );
            }
        }

        return [
            'order' => $this->getOrderDetail($orderId),
            'already_cancelled' => $outcome['already_cancelled'],
            'refund' => $outcome['refund'],
        ];
    }
}
