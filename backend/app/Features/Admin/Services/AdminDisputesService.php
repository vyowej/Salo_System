<?php

namespace App\Features\Admin\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\RestaurantBranchService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class AdminDisputesService
{
    public function __construct(
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * List failed deliveries / order disputes for admin review.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listDisputes(array $filters = []): array
    {
        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 20)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $search = trim((string) ($filters['search'] ?? ''));

        $baseQuery = DB::table('orders as o')
            ->leftJoin('deliveries as d', 'd.order_id', '=', 'o.order_id')
            ->leftJoin('riders as ri', 'ri.rider_id', '=', 'd.rider_id')
            ->leftJoin('users as ru', 'ru.user_id', '=', 'ri.user_id')
            ->leftJoin('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->leftJoin('payment_allocations as pa', function ($join): void {
                $join->on('pa.order_id', '=', 'o.order_id')
                    ->where('pa.allocation_type', '=', 'order_payment');
            })
            ->leftJoin('payments as p', 'p.payment_id', '=', 'pa.payment_id')
            ->where(function ($q): void {
                $q->where('o.order_status', 'failed')
                    ->orWhere('d.delivery_status', 'failed');
            });

        if ($search !== '') {
            $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $search).'%';
            $baseQuery->where(function ($q) use ($like): void {
                $q->where('o.order_reference', 'like', $like)
                    ->orWhere('o.customer_name', 'like', $like)
                    ->orWhere('r.restaurant_name', 'like', $like)
                    ->orWhere('d.failure_reason', 'like', $like);
            });
        }

        $total = (int) (clone $baseQuery)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));

        $rows = $baseQuery
            ->select([
                'o.order_id',
                'o.order_reference',
                'o.order_status',
                'o.customer_id',
                'o.customer_name',
                'o.restaurant_id',
                'r.restaurant_name',
                'r.branch_name',
                'o.total_amount',
                'o.delivery_address_text',
                'd.delivery_id',
                'd.delivery_status',
                'd.rider_id',
                'ru.first_name as rider_first_name',
                'ru.last_name as rider_last_name',
                'd.failed_at',
                'd.failure_reason',
                'd.delivery_notes',
                'p.payment_method',
                'p.payment_status',
            ])
            ->orderByDesc('d.failed_at')
            ->orderByDesc('o.order_id')
            ->forPage($page, $perPage)
            ->get();

        $items = $rows->map(static function (object $row): array {
            $riderName = trim(implode(' ', array_filter([$row->rider_first_name ?? null, $row->rider_last_name ?? null])));

            return [
                'order_id' => (int) $row->order_id,
                'order_reference' => $row->order_reference,
                'order_status' => $row->order_status,
                'delivery_id' => $row->delivery_id !== null ? (int) $row->delivery_id : null,
                'delivery_status' => $row->delivery_status,
                'customer_id' => (int) $row->customer_id,
                'customer_name' => $row->customer_name,
                'restaurant_id' => (int) $row->restaurant_id,
                'restaurant_name' => RestaurantBranchService::formatDisplayName((string) $row->restaurant_name, $row->branch_name ?? null),
                'rider_id' => $row->rider_id !== null ? (int) $row->rider_id : null,
                'rider_name' => $riderName !== '' ? $riderName : null,
                'total_amount' => (float) $row->total_amount,
                'delivery_address_text' => $row->delivery_address_text,
                'failed_at' => OrderTimestampFormatter::toManilaIso($row->failed_at),
                'failure_reason' => $row->failure_reason,
                'delivery_notes' => $row->delivery_notes,
                'payment_method' => $row->payment_method === 'cash' ? 'cod' : ($row->payment_method ?? 'cod'),
                'payment_status' => $row->payment_status ?? 'pending',
            ];
        })->all();

        return [
            'items' => $items,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => $lastPage,
            ],
        ];
    }

    /**
     * Resolve a failed delivery dispute by requeuing for delivery or cancelling the order.
     *
     * @return array<string, mixed>
     */
    public function resolveDispute(
        int $orderId,
        string $action,
        ?string $notes,
        User $admin,
        Request $request,
    ): array {
        if (! in_array($action, ['requeue_for_delivery', 'cancel_order'], true)) {
            throw ValidationException::withMessages([
                'action' => ['Action must be either requeue_for_delivery or cancel_order.'],
            ]);
        }

        $trimmedNotes = $notes !== null ? trim($notes) : null;
        if ($trimmedNotes === '') {
            $trimmedNotes = null;
        }
        if ($trimmedNotes === null || mb_strlen($trimmedNotes) < 5) {
            throw ValidationException::withMessages([
                'notes' => ['Provide resolution notes (at least 5 characters).'],
            ]);
        }

        $result = DB::transaction(function () use ($orderId, $action, $trimmedNotes, $admin, $request): array {
            $order = DB::table('orders')->where('order_id', $orderId)->lockForUpdate()->first();
            $delivery = DB::table('deliveries')->where('order_id', $orderId)->lockForUpdate()->first();

            if (! $order) {
                throw new NotFoundHttpException('Order not found.');
            }

            if ($order->order_status !== 'failed' && (! $delivery || $delivery->delivery_status !== 'failed')) {
                throw new ConflictHttpException('Only failed deliveries or failed orders can be resolved here.');
            }

            $now = now();
            $oldValues = [
                'order_status' => $order->order_status,
                'delivery_status' => $delivery?->delivery_status,
            ];

            if ($action === 'requeue_for_delivery') {
                DB::table('orders')->where('order_id', $orderId)->update([
                    'order_status' => 'ready',
                    'updated_at' => $now,
                ]);

                if ($delivery) {
                    DB::table('deliveries')->where('delivery_id', $delivery->delivery_id)->update([
                        'rider_id' => null,
                        'delivery_status' => 'pending_assignment',
                        'assigned_at' => null,
                        'accepted_at' => null,
                        'picked_up_at' => null,
                        'failed_at' => null,
                        'failure_reason' => null,
                        'updated_at' => $now,
                    ]);
                }

                $newValues = ['order_status' => 'ready', 'delivery_status' => 'pending_assignment'];
                $customerTitle = "Order {$order->order_reference} re-queued for delivery";
                $customerBody = 'An administrator has re-queued your order for a new rider assignment.';
            } else {
                DB::table('orders')->where('order_id', $orderId)->update([
                    'order_status' => 'cancelled',
                    'updated_at' => $now,
                ]);

                if ($delivery) {
                    DB::table('deliveries')->where('delivery_id', $delivery->delivery_id)->update([
                        'delivery_status' => 'cancelled',
                        'updated_at' => $now,
                    ]);
                }

                $paymentIds = DB::table('payment_allocations')
                    ->where('order_id', $orderId)
                    ->where('allocation_type', 'order_payment')
                    ->pluck('payment_id')
                    ->all();

                if ($paymentIds !== []) {
                    DB::table('payments')
                        ->whereIn('payment_id', $paymentIds)
                        ->where('payment_status', 'pending')
                        ->update([
                            'payment_status' => 'cancelled',
                            'updated_at' => $now,
                        ]);
                }

                $newValues = ['order_status' => 'cancelled', 'delivery_status' => 'cancelled'];
                $customerTitle = "Order {$order->order_reference} cancelled";
                $customerBody = "Your failed delivery has been closed and cancelled: {$trimmedNotes}";
            }

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: 'admin_dispute_resolved',
                entityType: 'orders',
                entityId: $orderId,
                oldValues: $oldValues,
                newValues: array_merge($newValues, ['resolution_action' => $action]),
                reason: $trimmedNotes,
                request: $request,
            );

            $this->notificationService->notifyUser(
                userId: (int) $order->customer_id,
                workspace: 'customer',
                type: 'order_dispute_resolved',
                title: $customerTitle,
                body: $customerBody,
                relatedEntityType: 'order',
                relatedEntityId: $orderId,
            );

            $recipientIds = $this->notificationService->resolveRestaurantOrderHandlerUserIds((int) $order->restaurant_id);
            $this->notificationService->notifyUsers(
                userIds: $recipientIds,
                workspace: 'restaurant',
                type: 'order_dispute_resolved',
                title: "Dispute resolved for {$order->order_reference}",
                body: "Admin action: {$action}. Notes: {$trimmedNotes}",
                relatedEntityType: 'order',
                relatedEntityId: $orderId,
            );

            return [
                'order_id' => $orderId,
                'order_reference' => $order->order_reference,
                'action' => $action,
                'order_status' => $newValues['order_status'],
                'delivery_status' => $newValues['delivery_status'],
            ];
        });

        return $result;
    }
}
