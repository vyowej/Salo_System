<?php

namespace App\Features\Connect\Services;

use App\Features\Connect\Events\CallAccepted;
use App\Features\Connect\Events\CallDeclined;
use App\Features\Connect\Events\CallTimedOut;
use App\Features\Connect\Events\IncomingCallRequested;
use App\Features\Connect\Events\OrderCancelled;
use App\Features\Connect\Events\OrderStatusUpdated;
use App\Features\Connect\Jobs\CheckOrderUnreachableCancellationJob;
use App\Features\Connect\Jobs\ResolveCallTimeoutJob;
use App\Features\Notifications\Services\NotificationService;
use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\WorkspaceAccessResolver;
use Carbon\CarbonImmutable;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class OrderConnectService
{
    public function __construct(
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
        private readonly NotificationService $notificationService,
        private readonly AuditLogService $auditLogService,
    ) {}

    /**
     * Mark an out_for_delivery order as arrived at the customer's drop-off.
     *
     * @param  array<string, mixed>  $coordinates
     * @return array<string, mixed>
     */
    public function markArrived(User $riderUser, int $orderId, Request $request, array $coordinates = []): array
    {
        $rider = $this->workspaceAccessResolver->requireActiveRider($riderUser);
        $riderId = (int) $rider->rider_id;

        DB::transaction(function () use ($riderUser, $riderId, $orderId, $request, $coordinates): void {
            $order = DB::table('orders')->where('order_id', $orderId)->lockForUpdate()->first();
            $delivery = DB::table('deliveries')->where('order_id', $orderId)->lockForUpdate()->first();

            if (! $order || ! $delivery || (int) $delivery->rider_id !== $riderId) {
                throw new NotFoundHttpException('Delivery not found.');
            }

            if ($delivery->delivery_status !== 'picked_up' || $order->order_status !== 'out_for_delivery') {
                throw new ConflictHttpException(
                    "Cannot mark arrived from delivery status '{$delivery->delivery_status}' and order status '{$order->order_status}'."
                );
            }

            // Placeholder for future real GPS geofence check (<= 50m haversine).
            $this->verifyArrivalProximity($order, $coordinates);

            $now = now();
            DB::table('orders')
                ->where('order_id', $orderId)
                ->update([
                    'order_status' => 'arrived',
                    'arrived_at' => $now,
                    'updated_at' => $now,
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $riderUser->user_id,
                action: 'rider_delivery_arrived',
                entityType: 'orders',
                entityId: $orderId,
                oldValues: ['order_status' => 'out_for_delivery'],
                newValues: ['order_status' => 'arrived', 'arrived_at' => $now->toIso8601String()],
                request: $request,
            );

            $riderFirstName = trim((string) ($riderUser->first_name ?? '')) ?: 'Your rider';
            $this->notificationService->notifyUser(
                userId: (int) $order->customer_id,
                workspace: 'customer',
                type: 'rider_arrived',
                title: "Your rider has arrived for {$order->order_reference}",
                body: "{$riderFirstName} has arrived at your drop-off location. Please keep your order page open for an incoming call.",
                relatedEntityType: 'order',
                relatedEntityId: $orderId,
            );

            $arrivedIso = OrderTimestampFormatter::toManilaIso($now);
            $serverNowIso = OrderTimestampFormatter::toManilaIso($now) ?? $now->toIso8601String();

            DB::afterCommit(static function () use ($orderId, $arrivedIso, $serverNowIso): void {
                event(new OrderStatusUpdated(
                    orderId: $orderId,
                    orderStatus: 'arrived',
                    arrivedAt: $arrivedIso,
                    serverNow: $serverNowIso,
                ));
            });
        });

        return $this->getConnectStateForOrder($orderId);
    }

    /**
     * Start an in-app call request from the assigned rider to the customer.
     *
     * @return array<string, mixed>
     */
    public function startCall(User $riderUser, int $orderId, Request $request): array
    {
        $rider = $this->workspaceAccessResolver->requireActiveRider($riderUser);
        $riderId = (int) $rider->rider_id;

        $responseSeconds = (int) config('salo.connect.call_response_seconds', 20);
        $cooldownSeconds = (int) config('salo.connect.call_cooldown_seconds', 60);
        $maxStrikes = (int) config('salo.connect.max_strikes', 3);

        DB::transaction(function () use ($riderUser, $riderId, $orderId, $request, $responseSeconds, $cooldownSeconds, $maxStrikes): void {
            $order = DB::table('orders')->where('order_id', $orderId)->lockForUpdate()->first();
            $delivery = DB::table('deliveries')->where('order_id', $orderId)->lockForUpdate()->first();

            if (! $order || ! $delivery || (int) $delivery->rider_id !== $riderId) {
                throw new NotFoundHttpException('Delivery not found.');
            }

            // Lazy-resolve any expired pending call before checking state.
            $order = $this->resolveExpiredPendingCallInTransaction($order, $request);

            if ($order->order_status === 'cancelled') {
                throw new ConflictHttpException('This order has already been cancelled.');
            }

            if ($order->order_status !== 'arrived') {
                throw new ConflictHttpException('You can only call the customer after marking arrived at the drop-off.');
            }

            if ((int) $order->call_attempts >= $maxStrikes) {
                throw new ConflictHttpException('Maximum contact attempts reached for this order.');
            }

            $existingPending = DB::table('call_logs')
                ->where('order_id', $orderId)
                ->where('status', 'pending')
                ->first();

            if ($existingPending) {
                throw new ConflictHttpException('A call request is already pending for this order.');
            }

            $now = CarbonImmutable::now();
            if ($order->last_call_resolved_at !== null && $cooldownSeconds > 0) {
                $cooldownEndsAt = CarbonImmutable::parse((string) $order->last_call_resolved_at)->addSeconds($cooldownSeconds);
                if ($now->lt($cooldownEndsAt)) {
                    $remaining = max(1, (int) $now->diffInSeconds($cooldownEndsAt, false));
                    throw new HttpResponseException(response()->json([
                        'success' => false,
                        'message' => "Please wait {$remaining} seconds before calling again.",
                        'data' => [
                            'remaining_seconds' => $remaining,
                            'cooldown_ends_at' => OrderTimestampFormatter::toManilaIso($cooldownEndsAt),
                            'server_now' => OrderTimestampFormatter::toManilaIso($now),
                        ],
                    ], 429));
                }
            }

            $lastAttemptNo = (int) (DB::table('call_logs')->where('order_id', $orderId)->max('attempt_no') ?? 0);
            $attemptNo = $lastAttemptNo + 1;
            $expiresAt = $now->addSeconds($responseSeconds);
            $customerWasOffline = $this->isCustomerOfflineOnOrderChannel($orderId, (int) $order->customer_id);

            $callLogId = (int) DB::table('call_logs')->insertGetId([
                'order_id' => $orderId,
                'rider_id' => $riderId,
                'customer_id' => (int) $order->customer_id,
                'attempt_no' => $attemptNo,
                'status' => 'pending',
                'counted_as_strike' => false,
                'customer_was_offline' => $customerWasOffline,
                'created_at' => $now->toDateTimeString(),
                'expires_at' => $expiresAt->toDateTimeString(),
                'responded_at' => null,
            ]);

            $this->auditLogService->record(
                actorUserId: (int) $riderUser->user_id,
                action: 'rider_call_started',
                entityType: 'call_logs',
                entityId: $callLogId,
                newValues: [
                    'order_id' => $orderId,
                    'attempt_no' => $attemptNo,
                    'expires_at' => $expiresAt->toIso8601String(),
                    'customer_was_offline' => $customerWasOffline,
                ],
                request: $request,
            );

            $riderFirstName = trim((string) ($riderUser->first_name ?? '')) ?: 'Your rider';
            $this->notificationService->notifyUser(
                userId: (int) $order->customer_id,
                workspace: 'customer',
                type: 'incoming_call_requested',
                title: "Your rider is calling ({$order->order_reference})",
                body: "{$riderFirstName} is waiting at your drop-off and sent an in-app call request.",
                relatedEntityType: 'order',
                relatedEntityId: $orderId,
            );

            $callPayload = $this->formatCallLog(DB::table('call_logs')->where('id', $callLogId)->first());
            $serverNowIso = OrderTimestampFormatter::toManilaIso($now) ?? $now->toIso8601String();

            DB::afterCommit(static function () use ($orderId, $callLogId, $responseSeconds, $callPayload, $serverNowIso): void {
                ResolveCallTimeoutJob::dispatch($orderId, $callLogId)->delay(now()->addSeconds($responseSeconds));
                event(new IncomingCallRequested(
                    orderId: $orderId,
                    call: $callPayload,
                    serverNow: $serverNowIso,
                ));
            });
        });

        return $this->getConnectStateForOrder($orderId);
    }

    /**
     * Customer responds to a pending incoming call request (accept or decline).
     *
     * @return array<string, mixed>
     */
    public function respondToCall(User $customerUser, int $orderId, string $action, Request $request): array
    {
        $normalizedAction = strtolower(trim($action));
        if (! in_array($normalizedAction, ['accept', 'decline'], true)) {
            abort(422, 'Action must be accept or decline.');
        }

        // First commit any expired pending call resolution outside the respond transaction
        // so a subsequent 409 rejection does not roll back the timeout state.
        DB::transaction(function () use ($customerUser, $orderId, $request): void {
            $order = DB::table('orders')->where('order_id', $orderId)->lockForUpdate()->first();
            if (! $order || (int) $order->customer_id !== (int) $customerUser->user_id) {
                throw new NotFoundHttpException('Order not found.');
            }

            $this->resolveExpiredPendingCallInTransaction($order, $request);
        });

        DB::transaction(function () use ($customerUser, $orderId, $normalizedAction, $request): void {
            $order = DB::table('orders')->where('order_id', $orderId)->lockForUpdate()->first();
            if (! $order || (int) $order->customer_id !== (int) $customerUser->user_id) {
                throw new NotFoundHttpException('Order not found.');
            }

            if ($order->order_status === 'cancelled') {
                throw new ConflictHttpException('This order has already been cancelled.');
            }

            $pendingCall = DB::table('call_logs')
                ->where('order_id', $orderId)
                ->where('status', 'pending')
                ->lockForUpdate()
                ->first();

            if (! $pendingCall) {
                throw new ConflictHttpException('No active call request to respond to.');
            }

            $now = CarbonImmutable::now();
            $expiresAt = CarbonImmutable::parse((string) $pendingCall->expires_at);
            if ($now->gte($expiresAt)) {
                $this->applyTimeoutToPendingCall($order, $pendingCall, $now, $request);
                throw new ConflictHttpException('This call request has already timed out.');
            }

            if ($normalizedAction === 'accept') {
                $affected = DB::table('call_logs')
                    ->where('id', $pendingCall->id)
                    ->where('status', 'pending')
                    ->update([
                        'status' => 'answered',
                        'counted_as_strike' => false,
                        'responded_at' => $now->toDateTimeString(),
                    ]);

                if ($affected === 0) {
                    throw new ConflictHttpException('This call request is no longer pending.');
                }

                DB::table('orders')
                    ->where('order_id', $orderId)
                    ->update([
                        'order_status' => 'customer_reached',
                        'last_call_resolved_at' => $now->toDateTimeString(),
                        'updated_at' => $now->toDateTimeString(),
                    ]);

                $this->auditLogService->record(
                    actorUserId: (int) $customerUser->user_id,
                    action: 'customer_call_accepted',
                    entityType: 'call_logs',
                    entityId: (int) $pendingCall->id,
                    oldValues: ['status' => 'pending'],
                    newValues: ['status' => 'answered', 'order_status' => 'customer_reached'],
                    request: $request,
                );

                $callPayload = $this->formatCallLog(DB::table('call_logs')->where('id', $pendingCall->id)->first());
                $serverNowIso = OrderTimestampFormatter::toManilaIso($now) ?? $now->toIso8601String();
                $arrivedIso = OrderTimestampFormatter::toManilaIso($order->arrived_at);

                DB::afterCommit(static function () use ($orderId, $callPayload, $arrivedIso, $serverNowIso): void {
                    event(new CallAccepted(
                        orderId: $orderId,
                        call: $callPayload,
                        orderStatus: 'customer_reached',
                        serverNow: $serverNowIso,
                    ));
                    event(new OrderStatusUpdated(
                        orderId: $orderId,
                        orderStatus: 'customer_reached',
                        arrivedAt: $arrivedIso,
                        serverNow: $serverNowIso,
                    ));
                });

                return;
            }

            // Decline: always counts as a strike.
            $affected = DB::table('call_logs')
                ->where('id', $pendingCall->id)
                ->where('status', 'pending')
                ->update([
                    'status' => 'declined',
                    'counted_as_strike' => true,
                    'responded_at' => $now->toDateTimeString(),
                ]);

            if ($affected === 0) {
                throw new ConflictHttpException('This call request is no longer pending.');
            }

            $newAttempts = (int) $order->call_attempts + 1;
            DB::table('orders')
                ->where('order_id', $orderId)
                ->update([
                    'call_attempts' => $newAttempts,
                    'last_call_resolved_at' => $now->toDateTimeString(),
                    'updated_at' => $now->toDateTimeString(),
                ]);

            $order = DB::table('orders')->where('order_id', $orderId)->first();
            $maxStrikes = (int) config('salo.connect.max_strikes', 3);
            $cooldownSeconds = (int) config('salo.connect.call_cooldown_seconds', 60);
            $cooldownEndsAt = $cooldownSeconds > 0
                ? OrderTimestampFormatter::toManilaIso($now->addSeconds($cooldownSeconds))
                : null;

            $this->notificationService->notifyUser(
                userId: (int) $order->customer_id,
                workspace: 'customer',
                type: 'call_strike_recorded',
                title: "Missed call attempt ({$newAttempts}/{$maxStrikes})",
                body: "You declined the rider's call for {$order->order_reference}. Strike {$newAttempts} of {$maxStrikes} recorded.",
                relatedEntityType: 'order',
                relatedEntityId: $orderId,
            );

            $this->auditLogService->record(
                actorUserId: (int) $customerUser->user_id,
                action: 'customer_call_declined',
                entityType: 'call_logs',
                entityId: (int) $pendingCall->id,
                oldValues: ['status' => 'pending'],
                newValues: ['status' => 'declined', 'call_attempts' => $newAttempts],
                request: $request,
            );

            $callPayload = $this->formatCallLog(DB::table('call_logs')->where('id', $pendingCall->id)->first());
            $serverNowIso = OrderTimestampFormatter::toManilaIso($now) ?? $now->toIso8601String();

            DB::afterCommit(static function () use ($orderId, $callPayload, $newAttempts, $maxStrikes, $cooldownEndsAt, $serverNowIso): void {
                event(new CallDeclined(
                    orderId: $orderId,
                    call: $callPayload,
                    callAttempts: $newAttempts,
                    maxStrikes: $maxStrikes,
                    cooldownEndsAt: $cooldownEndsAt,
                    serverNow: $serverNowIso,
                ));
            });

            $this->evaluateUnreachableCancellationInTransaction($order, $now, $request);
        });

        return $this->getConnectStateForOrder($orderId);
    }

    /**
     * Queue job entrypoint: resolve a specific pending call if it has reached expires_at.
     */
    public function resolveExpiredCall(int $orderId, int $callLogId): void
    {
        DB::transaction(function () use ($orderId, $callLogId): void {
            $order = DB::table('orders')->where('order_id', $orderId)->lockForUpdate()->first();
            if (! $order) {
                return;
            }

            $pendingCall = DB::table('call_logs')
                ->where('id', $callLogId)
                ->where('order_id', $orderId)
                ->where('status', 'pending')
                ->lockForUpdate()
                ->first();

            if (! $pendingCall) {
                return;
            }

            $now = CarbonImmutable::now();
            if ($now->lt(CarbonImmutable::parse((string) $pendingCall->expires_at))) {
                return;
            }

            $this->applyTimeoutToPendingCall($order, $pendingCall, $now);
        });
    }

    /**
     * Lazy check & scheduled job entrypoint: evaluate if an order with >= MAX_STRIKES
     * has passed MIN_WAIT_BEFORE_CANCEL_MINUTES and has no active accepted wait.
     */
    public function evaluateUnreachableCancellation(int $orderId): bool
    {
        return DB::transaction(function () use ($orderId): bool {
            $order = DB::table('orders')->where('order_id', $orderId)->lockForUpdate()->first();
            if (! $order) {
                return false;
            }

            $now = CarbonImmutable::now();
            if (Schema::hasTable('waiting_requests')) {
                app(WaitingRequestService::class)->expireStaleRequestsInTransaction($orderId, $now);
            }

            $order = $this->resolveExpiredPendingCallInTransaction($order);

            return $this->evaluateUnreachableCancellationInTransaction($order, $now);
        });
    }

    /**
     * Run lazy expiry & unreachable cancellation check, then return connect state for an order.
     *
     * @return array<string, mixed>
     */
    public function syncAndGetConnectState(int $orderId): array
    {
        DB::transaction(function () use ($orderId): void {
            $order = DB::table('orders')->where('order_id', $orderId)->lockForUpdate()->first();
            if (! $order) {
                return;
            }

            $now = CarbonImmutable::now();
            if (Schema::hasTable('waiting_requests')) {
                app(WaitingRequestService::class)->expireStaleRequestsInTransaction($orderId, $now);
            }

            $order = $this->resolveExpiredPendingCallInTransaction($order);
            $this->evaluateUnreachableCancellationInTransaction($order, $now);
        });

        return $this->getConnectStateForOrder($orderId);
    }

    /**
     * Build the server-authoritative connect state payload for an order.
     *
     * @return array<string, mixed>
     */
    public function getConnectStateForOrder(int $orderId): array
    {
        $order = DB::table('orders as o')
            ->leftJoin('users as cu', 'cu.user_id', '=', 'o.customer_id')
            ->where('o.order_id', $orderId)
            ->select([
                'o.order_id',
                'o.order_reference',
                'o.order_status',
                'o.arrived_at',
                'o.call_attempts',
                'o.last_call_resolved_at',
                'o.cancelled_at',
                'o.cancelled_by',
                'o.cancellation_reason',
                'cu.ordering_suspended_until',
                'cu.suspension_reason',
            ])
            ->first();

        if (! $order) {
            throw new NotFoundHttpException('Order not found.');
        }

        $now = CarbonImmutable::now();
        $maxStrikes = (int) config('salo.connect.max_strikes', 3);
        $cooldownSeconds = (int) config('salo.connect.call_cooldown_seconds', 60);
        $minWaitMinutes = (int) config('salo.connect.min_wait_before_cancel_minutes', 5);

        $pendingCallRow = DB::table('call_logs')
            ->where('order_id', $orderId)
            ->where('status', 'pending')
            ->orderByDesc('id')
            ->first();

        $cooldownEndsAt = null;
        if ($order->last_call_resolved_at !== null && $cooldownSeconds > 0) {
            $candidate = CarbonImmutable::parse((string) $order->last_call_resolved_at)->addSeconds($cooldownSeconds);
            if ($candidate->gt($now)) {
                $cooldownEndsAt = OrderTimestampFormatter::toManilaIso($candidate);
            }
        }

        $cancelAvailableAt = null;
        if ($order->arrived_at !== null) {
            $cancelAvailableAt = OrderTimestampFormatter::toManilaIso(
                CarbonImmutable::parse((string) $order->arrived_at)->addMinutes($minWaitMinutes)
            );
        }

        $activeWaitingRequest = $this->getActiveWaitingRequestSummary($orderId, $now);

        $isSuspended = $order->ordering_suspended_until !== null
            && CarbonImmutable::parse((string) $order->ordering_suspended_until)->gt($now);

        return [
            'order_id' => (int) $order->order_id,
            'order_reference' => $order->order_reference,
            'order_status' => $order->order_status,
            'arrived_at' => OrderTimestampFormatter::toManilaIso($order->arrived_at),
            'call_attempts' => (int) $order->call_attempts,
            'max_strikes' => $maxStrikes,
            'last_call_resolved_at' => OrderTimestampFormatter::toManilaIso($order->last_call_resolved_at),
            'cooldown_ends_at' => $cooldownEndsAt,
            'cancel_available_at' => $cancelAvailableAt,
            'cancelled_at' => OrderTimestampFormatter::toManilaIso($order->cancelled_at),
            'cancelled_by' => $order->cancelled_by,
            'cancel_reason' => $order->cancellation_reason,
            'cancellation_reason' => $order->cancellation_reason,
            'pending_call' => $pendingCallRow ? $this->formatCallLog($pendingCallRow) : null,
            'active_waiting_request' => $activeWaitingRequest,
            'waiting_requests_count' => Schema::hasTable('waiting_requests')
                ? (int) DB::table('waiting_requests')->where('order_id', $orderId)->count()
                : 0,
            'max_wait_requests' => (int) config('salo.connect.max_wait_requests_per_order', 2),
            'customer_ordering_suspended' => $isSuspended,
            'ordering_suspended_until' => $isSuspended ? OrderTimestampFormatter::toManilaIso($order->ordering_suspended_until) : null,
            'suspension_reason' => $isSuspended ? $order->suspension_reason : null,
            'server_now' => OrderTimestampFormatter::toManilaIso($now),
        ];
    }

    /**
     * Sweep any arrived orders that have >= MAX_STRIKES and passed MIN_WAIT_BEFORE_CANCEL_MINUTES.
     */
    public function cancelEligibleUnreachableOrders(): int
    {
        $maxStrikes = (int) config('salo.connect.max_strikes', 3);
        $minWaitMinutes = (int) config('salo.connect.min_wait_before_cancel_minutes', 5);
        $cutoff = CarbonImmutable::now()->subMinutes($minWaitMinutes)->toDateTimeString();

        $orderIds = DB::table('orders')
            ->where('order_status', 'arrived')
            ->where('call_attempts', '>=', $maxStrikes)
            ->whereNotNull('arrived_at')
            ->where('arrived_at', '<=', $cutoff)
            ->pluck('order_id')
            ->map(static fn ($id): int => (int) $id)
            ->all();

        $cancelled = 0;
        foreach ($orderIds as $orderId) {
            if ($this->evaluateUnreachableCancellation($orderId)) {
                $cancelled++;
            }
        }

        return $cancelled;
    }

    private function resolveExpiredPendingCallInTransaction(object $order, ?Request $request = null): object
    {
        $pendingCall = DB::table('call_logs')
            ->where('order_id', $order->order_id)
            ->where('status', 'pending')
            ->lockForUpdate()
            ->first();

        if (! $pendingCall) {
            return $order;
        }

        $now = CarbonImmutable::now();
        if ($now->lt(CarbonImmutable::parse((string) $pendingCall->expires_at))) {
            return $order;
        }

        $this->applyTimeoutToPendingCall($order, $pendingCall, $now, $request);

        return DB::table('orders')->where('order_id', $order->order_id)->first() ?? $order;
    }

    private function applyTimeoutToPendingCall(
        object $order,
        object $pendingCall,
        CarbonImmutable $now,
        ?Request $request = null,
    ): void {
        $orderId = (int) $order->order_id;
        $hasActiveWait = $this->hasActiveAcceptedWait($orderId, $now);
        $countsAsStrike = ! $hasActiveWait;

        $affected = DB::table('call_logs')
            ->where('id', $pendingCall->id)
            ->where('status', 'pending')
            ->update([
                'status' => 'timed_out',
                'counted_as_strike' => $countsAsStrike,
                'responded_at' => $now->toDateTimeString(),
            ]);

        if ($affected === 0) {
            return;
        }

        $newAttempts = (int) $order->call_attempts + ($countsAsStrike ? 1 : 0);
        DB::table('orders')
            ->where('order_id', $orderId)
            ->update([
                'call_attempts' => $newAttempts,
                'last_call_resolved_at' => $now->toDateTimeString(),
                'updated_at' => $now->toDateTimeString(),
            ]);

        $freshOrder = DB::table('orders')->where('order_id', $orderId)->first() ?? $order;
        $maxStrikes = (int) config('salo.connect.max_strikes', 3);
        $cooldownSeconds = (int) config('salo.connect.call_cooldown_seconds', 60);
        $cooldownEndsAt = $cooldownSeconds > 0
            ? OrderTimestampFormatter::toManilaIso($now->addSeconds($cooldownSeconds))
            : null;

        if ($countsAsStrike) {
            $this->notificationService->notifyUser(
                userId: (int) $freshOrder->customer_id,
                workspace: 'customer',
                type: 'call_strike_recorded',
                title: "Missed call attempt ({$newAttempts}/{$maxStrikes})",
                body: "You missed a call from your rider for {$freshOrder->order_reference}. Strike {$newAttempts} of {$maxStrikes} recorded.",
                relatedEntityType: 'order',
                relatedEntityId: $orderId,
            );
        }

        $this->auditLogService->record(
            actorUserId: null,
            action: 'call_request_timed_out',
            entityType: 'call_logs',
            entityId: (int) $pendingCall->id,
            oldValues: ['status' => 'pending'],
            newValues: [
                'status' => 'timed_out',
                'counted_as_strike' => $countsAsStrike,
                'call_attempts' => $newAttempts,
            ],
            request: $request,
        );

        $callPayload = $this->formatCallLog(DB::table('call_logs')->where('id', $pendingCall->id)->first());
        $serverNowIso = OrderTimestampFormatter::toManilaIso($now) ?? $now->toIso8601String();

        DB::afterCommit(static function () use ($orderId, $callPayload, $newAttempts, $maxStrikes, $cooldownEndsAt, $serverNowIso): void {
            event(new CallTimedOut(
                orderId: $orderId,
                call: $callPayload,
                callAttempts: $newAttempts,
                maxStrikes: $maxStrikes,
                cooldownEndsAt: $cooldownEndsAt,
                serverNow: $serverNowIso,
            ));
        });

        $this->evaluateUnreachableCancellationInTransaction($freshOrder, $now, $request);
    }

    private function evaluateUnreachableCancellationInTransaction(
        object $order,
        CarbonImmutable $now,
        ?Request $request = null,
    ): bool {
        if ($order->order_status !== 'arrived') {
            return false;
        }

        $maxStrikes = (int) config('salo.connect.max_strikes', 3);
        if ((int) $order->call_attempts < $maxStrikes) {
            return false;
        }

        if ($order->arrived_at === null) {
            return false;
        }

        $orderId = (int) $order->order_id;
        if ($this->hasActiveAcceptedWait($orderId, $now)) {
            return false;
        }

        $minWaitMinutes = (int) config('salo.connect.min_wait_before_cancel_minutes', 5);
        $cancelEligibleAt = CarbonImmutable::parse((string) $order->arrived_at)->addMinutes($minWaitMinutes);

        if ($now->lt($cancelEligibleAt)) {
            // Schedule a deferred check right when the minimum wait passes.
            DB::afterCommit(static function () use ($orderId, $cancelEligibleAt): void {
                CheckOrderUnreachableCancellationJob::dispatch($orderId)->delay($cancelEligibleAt);
            });

            return false;
        }

        $banHours = (int) config('salo.connect.unreachable_ordering_ban_hours', 24);
        $suspendedUntil = $now->addHours($banHours);
        $suspensionReason = "Ordering suspended for {$banHours} hours: order {$order->order_reference} was cancelled because customer was unreachable.";

        DB::table('orders')
            ->where('order_id', $orderId)
            ->update([
                'order_status' => 'cancelled',
                'cancelled_at' => $now->toDateTimeString(),
                'cancelled_by' => 'system',
                'cancellation_reason' => 'customer_unreachable',
                'updated_at' => $now->toDateTimeString(),
            ]);

        $delivery = DB::table('deliveries')->where('order_id', $orderId)->lockForUpdate()->first();
        if ($delivery && ! in_array($delivery->delivery_status, ['delivered', 'failed', 'cancelled'], true)) {
            DB::table('deliveries')
                ->where('delivery_id', $delivery->delivery_id)
                ->update([
                    'delivery_status' => 'cancelled',
                    'failure_reason' => 'customer_unreachable',
                    'updated_at' => $now->toDateTimeString(),
                ]);
        }

        DB::table('users')
            ->where('user_id', $order->customer_id)
            ->update([
                'ordering_suspended_until' => $suspendedUntil->toDateTimeString(),
                'suspension_reason' => $suspensionReason,
                'updated_at' => $now->toDateTimeString(),
            ]);

        $callLogsSummary = DB::table('call_logs')
            ->where('order_id', $orderId)
            ->orderBy('attempt_no')
            ->get(['attempt_no', 'status', 'counted_as_strike', 'customer_was_offline', 'created_at', 'responded_at'])
            ->all();

        DB::table('customer_incidents')->insert([
            'user_id' => (int) $order->customer_id,
            'order_id' => $orderId,
            'type' => 'unreachable_cancelled',
            'details' => json_encode([
                'order_reference' => $order->order_reference,
                'arrived_at' => $order->arrived_at,
                'cancelled_at' => $now->toDateTimeString(),
                'call_attempts' => (int) $order->call_attempts,
                'call_logs' => $callLogsSummary,
                'ordering_suspended_until' => $suspendedUntil->toDateTimeString(),
            ]),
            'created_at' => $now->toDateTimeString(),
        ]);

        $this->notificationService->notifyUser(
            userId: (int) $order->customer_id,
            workspace: 'customer',
            type: 'order_cancelled_unreachable',
            title: "Order {$order->order_reference} cancelled",
            body: "Your order was cancelled because you could not be reached after {$maxStrikes} attempts. Your ordering is suspended for {$banHours} hours.",
            relatedEntityType: 'order',
            relatedEntityId: $orderId,
        );

        if ($delivery && $delivery->rider_id !== null) {
            $riderUserId = DB::table('riders')->where('rider_id', $delivery->rider_id)->value('user_id');
            if ($riderUserId !== null) {
                $this->notificationService->notifyUser(
                    userId: (int) $riderUserId,
                    workspace: 'rider',
                    type: 'order_cancelled_unreachable',
                    title: "Order {$order->order_reference} cancelled",
                    body: 'Customer was unreachable after maximum attempts. You are now available for new deliveries.',
                    relatedEntityType: 'order',
                    relatedEntityId: $orderId,
                );
            }
        }

        $this->auditLogService->record(
            actorUserId: null,
            action: 'order_cancelled_customer_unreachable',
            entityType: 'orders',
            entityId: $orderId,
            oldValues: ['order_status' => 'arrived'],
            newValues: [
                'order_status' => 'cancelled',
                'cancellation_reason' => 'customer_unreachable',
                'ordering_suspended_until' => $suspendedUntil->toIso8601String(),
            ],
            request: $request,
        );

        $cancelledIso = OrderTimestampFormatter::toManilaIso($now) ?? $now->toIso8601String();
        $suspendedIso = OrderTimestampFormatter::toManilaIso($suspendedUntil);

        DB::afterCommit(static function () use ($orderId, $cancelledIso, $suspendedIso): void {
            event(new OrderCancelled(
                orderId: $orderId,
                cancelReason: 'customer_unreachable',
                cancelledAt: $cancelledIso,
                orderingSuspendedUntil: $suspendedIso,
                serverNow: $cancelledIso,
            ));
        });

        return true;
    }

    /**
     * Structure for future real GPS geofence check (<= 50 m haversine).
     * Currently a no-op because drop-off arrival is triggered by the route simulation.
     *
     * @param  array<string, mixed>  $coordinates
     */
    private function verifyArrivalProximity(object $order, array $coordinates): void
    {
        // Future geofence hook:
        // if ($order->delivery_latitude && $order->delivery_longitude && isset($coordinates['latitude'], $coordinates['longitude'])) {
        //     $distanceMeters = haversineMeters(...);
        //     if ($distanceMeters > 50) abort(422, 'You must be within 50m of the drop-off.');
        // }
    }

    /**
     * Check whether an accepted waiting request is currently active (now < wait_ends_at).
     * Returns false until the waiting_requests table is created in Delivery 2.
     */
    private function hasActiveAcceptedWait(int $orderId, CarbonImmutable $now): bool
    {
        if (! Schema::hasTable('waiting_requests')) {
            return false;
        }

        return DB::table('waiting_requests')
            ->where('order_id', $orderId)
            ->where('status', 'accepted')
            ->where('wait_ends_at', '>', $now->toDateTimeString())
            ->exists();
    }

    /**
     * @return array<string, mixed>|null
     */
    private function getActiveWaitingRequestSummary(int $orderId, CarbonImmutable $now): ?array
    {
        if (! Schema::hasTable('waiting_requests')) {
            return null;
        }

        $row = DB::table('waiting_requests')
            ->where('order_id', $orderId)
            ->whereIn('status', ['pending', 'accepted'])
            ->orderByDesc('id')
            ->first();

        if (! $row) {
            return null;
        }

        if ($row->status === 'accepted' && $row->wait_ends_at !== null && CarbonImmutable::parse((string) $row->wait_ends_at)->lte($now)) {
            return null;
        }

        return [
            'id' => (int) $row->id,
            'request_no' => (int) $row->request_no,
            'status' => $row->status,
            'requested_minutes' => (int) $row->requested_minutes,
            'requested_at' => OrderTimestampFormatter::toManilaIso($row->requested_at),
            'expires_at' => OrderTimestampFormatter::toManilaIso($row->expires_at),
            'responded_at' => OrderTimestampFormatter::toManilaIso($row->responded_at),
            'wait_ends_at' => OrderTimestampFormatter::toManilaIso($row->wait_ends_at),
        ];
    }

    /**
     * Check Reverb presence channel to determine if the customer is currently offline.
     * Returns null (unknown) if broadcasting is not reverb or Reverb HTTP API is unreachable.
     */
    private function isCustomerOfflineOnOrderChannel(int $orderId, int $customerUserId): ?bool
    {
        if (config('broadcasting.default') !== 'reverb') {
            return null;
        }

        try {
            $appId = config('broadcasting.connections.reverb.app_id');
            $key = config('broadcasting.connections.reverb.key');
            $secret = config('broadcasting.connections.reverb.secret');
            $host = config('broadcasting.connections.reverb.options.host', '127.0.0.1');
            $port = config('broadcasting.connections.reverb.options.port', 8080);
            $scheme = config('broadcasting.connections.reverb.options.scheme', 'http');

            if (! $appId || ! $key || ! $secret) {
                return null;
            }

            $path = "/apps/{$appId}/channels/presence-order.{$orderId}/users";
            $timestamp = time();
            $query = [
                'auth_key' => $key,
                'auth_timestamp' => $timestamp,
                'auth_version' => '1.0',
            ];
            ksort($query);
            $queryString = http_build_query($query);
            $signature = hash_hmac('sha256', "GET\n{$path}\n{$queryString}", (string) $secret);

            $response = Http::timeout(1)->get("{$scheme}://{$host}:{$port}{$path}?{$queryString}&auth_signature={$signature}");
            if (! $response->ok()) {
                return null;
            }

            $users = $response->json('users', []);
            if (! is_array($users)) {
                return null;
            }

            foreach ($users as $u) {
                if ((int) ($u['id'] ?? 0) === $customerUserId) {
                    return false;
                }
            }

            return true;
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function formatCallLog(object $row): array
    {
        return [
            'id' => (int) $row->id,
            'order_id' => (int) $row->order_id,
            'attempt_no' => (int) $row->attempt_no,
            'status' => $row->status,
            'counted_as_strike' => (bool) $row->counted_as_strike,
            'customer_was_offline' => $row->customer_was_offline === null ? null : (bool) $row->customer_was_offline,
            'created_at' => OrderTimestampFormatter::toManilaIso($row->created_at),
            'expires_at' => OrderTimestampFormatter::toManilaIso($row->expires_at),
            'responded_at' => OrderTimestampFormatter::toManilaIso($row->responded_at),
        ];
    }
}
