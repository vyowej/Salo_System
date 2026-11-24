<?php

namespace App\Features\Connect\Services;

use App\Features\Connect\Events\WaitingRequestReceived;
use App\Features\Connect\Events\WaitingRequestUpdated;
use App\Features\Connect\Jobs\ExpireWaitingRequestJob;
use App\Features\Connect\Jobs\NotifyWaitEndedJob;
use App\Features\Notifications\Services\NotificationService;
use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\WorkspaceAccessResolver;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class WaitingRequestService
{
    public function __construct(
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
        private readonly NotificationService $notificationService,
        private readonly AuditLogService $auditLogService,
    ) {}

    /**
     * Customer requests an extra 5-minute waiting window after rider arrival.
     *
     * @return array<string, mixed>
     */
    public function requestWait(User $customerUser, int $orderId, Request $request): array
    {
        $waitMinutes = (int) config('salo.connect.wait_request_minutes', 5);
        $responseMinutes = (int) config('salo.connect.wait_request_rider_response_minutes', 5);
        $maxRequests = (int) config('salo.connect.max_wait_requests_per_order', 2);

        $created = DB::transaction(function () use ($customerUser, $orderId, $request, $waitMinutes, $responseMinutes, $maxRequests): array {
            $order = DB::table('orders')->where('order_id', $orderId)->lockForUpdate()->first();
            if (! $order || (int) $order->customer_id !== (int) $customerUser->user_id) {
                throw new NotFoundHttpException('Order not found.');
            }

            $delivery = DB::table('deliveries')->where('order_id', $orderId)->lockForUpdate()->first();
            if (! $delivery || $delivery->rider_id === null) {
                throw new ConflictHttpException('No rider is assigned to this order.');
            }

            $now = CarbonImmutable::now();
            $this->expireStaleRequestsInTransaction($orderId, $now, $request);

            if ($order->order_status !== 'arrived') {
                throw new ConflictHttpException('Waiting requests are only allowed after the rider has arrived.');
            }

            $active = DB::table('waiting_requests')
                ->where('order_id', $orderId)
                ->whereIn('status', ['pending', 'accepted'])
                ->lockForUpdate()
                ->first();

            if ($active) {
                if ($active->status === 'pending') {
                    throw new ConflictHttpException('A waiting request is already pending rider response.');
                }
                if ($active->status === 'accepted' && $active->wait_ends_at !== null && CarbonImmutable::parse((string) $active->wait_ends_at)->gt($now)) {
                    throw new ConflictHttpException('An accepted waiting period is already active.');
                }
            }

            $existingCount = (int) DB::table('waiting_requests')->where('order_id', $orderId)->count();
            if ($existingCount >= $maxRequests) {
                throw new ConflictHttpException("Maximum waiting requests ({$maxRequests}) reached for this order.");
            }

            $requestNo = $existingCount + 1;
            $expiresAt = $now->addMinutes($responseMinutes);

            $id = (int) DB::table('waiting_requests')->insertGetId([
                'order_id' => $orderId,
                'customer_id' => (int) $customerUser->user_id,
                'rider_id' => (int) $delivery->rider_id,
                'request_no' => $requestNo,
                'status' => 'pending',
                'requested_minutes' => $waitMinutes,
                'requested_at' => $now->toDateTimeString(),
                'expires_at' => $expiresAt->toDateTimeString(),
                'responded_at' => null,
                'wait_ends_at' => null,
            ]);

            $riderUserId = DB::table('riders')->where('rider_id', $delivery->rider_id)->value('user_id');
            if ($riderUserId !== null) {
                $this->notificationService->notifyUser(
                    userId: (int) $riderUserId,
                    workspace: 'rider',
                    type: 'waiting_request_received',
                    title: "Customer requested {$waitMinutes} min wait ({$order->order_reference})",
                    body: "Request {$requestNo} of {$maxRequests}: please accept or decline.",
                    relatedEntityType: 'order',
                    relatedEntityId: $orderId,
                );
            }

            $this->auditLogService->record(
                actorUserId: (int) $customerUser->user_id,
                action: 'customer_waiting_request_created',
                entityType: 'waiting_requests',
                entityId: $id,
                newValues: [
                    'order_id' => $orderId,
                    'request_no' => $requestNo,
                    'requested_minutes' => $waitMinutes,
                ],
                request: $request,
            );

            $formatted = $this->formatWaitingRequest(DB::table('waiting_requests')->where('id', $id)->first());
            $serverNowIso = OrderTimestampFormatter::toManilaIso($now) ?? $now->toIso8601String();

            DB::afterCommit(static function () use ($orderId, $id, $expiresAt, $formatted, $serverNowIso): void {
                ExpireWaitingRequestJob::dispatch($id)->delay($expiresAt);
                event(new WaitingRequestReceived($orderId, $formatted, $serverNowIso));
            });

            return [
                'waiting_request' => $formatted,
                'server_now' => $serverNowIso,
            ];
        });

        return $created;
    }

    /**
     * Assigned rider accepts or declines a pending waiting request.
     *
     * @return array<string, mixed>
     */
    public function respondToWaitRequest(User $riderUser, int $waitingRequestId, string $action, Request $request): array
    {
        $rider = $this->workspaceAccessResolver->requireActiveRider($riderUser);
        $riderId = (int) $rider->rider_id;
        $normalizedAction = strtolower(trim($action));

        if (! in_array($normalizedAction, ['accept', 'decline'], true)) {
            abort(422, 'Action must be accept or decline.');
        }

        // First commit any lazy expiry outside the respond transaction so 409 doesn't roll it back.
        DB::transaction(function () use ($waitingRequestId, $riderId, $request): void {
            $wr = DB::table('waiting_requests')->where('id', $waitingRequestId)->lockForUpdate()->first();
            if (! $wr || (int) $wr->rider_id !== $riderId) {
                throw new NotFoundHttpException('Waiting request not found.');
            }
            $this->expireStaleRequestsInTransaction((int) $wr->order_id, CarbonImmutable::now(), $request);
        });

        return DB::transaction(function () use ($riderUser, $riderId, $waitingRequestId, $normalizedAction, $request): array {
            $wr = DB::table('waiting_requests')->where('id', $waitingRequestId)->lockForUpdate()->first();
            if (! $wr || (int) $wr->rider_id !== $riderId) {
                throw new NotFoundHttpException('Waiting request not found.');
            }

            $order = DB::table('orders')->where('order_id', $wr->order_id)->lockForUpdate()->first();
            if (! $order || $order->order_status === 'cancelled') {
                throw new ConflictHttpException('This order is no longer active.');
            }

            if ($wr->status !== 'pending') {
                throw new ConflictHttpException("Waiting request has already been {$wr->status}.");
            }

            $now = CarbonImmutable::now();

            if ($normalizedAction === 'accept') {
                $waitEndsAt = $now->addMinutes((int) $wr->requested_minutes);
                $affected = DB::table('waiting_requests')
                    ->where('id', $waitingRequestId)
                    ->where('status', 'pending')
                    ->update([
                        'status' => 'accepted',
                        'responded_at' => $now->toDateTimeString(),
                        'wait_ends_at' => $waitEndsAt->toDateTimeString(),
                    ]);

                if ($affected === 0) {
                    throw new ConflictHttpException('Waiting request is no longer pending.');
                }

                $this->notificationService->notifyUser(
                    userId: (int) $order->customer_id,
                    workspace: 'customer',
                    type: 'waiting_request_accepted',
                    title: "Rider agreed to wait ({$order->order_reference})",
                    body: "Your rider accepted your {$wr->requested_minutes}-minute waiting request.",
                    relatedEntityType: 'order',
                    relatedEntityId: (int) $order->order_id,
                );

                $this->auditLogService->record(
                    actorUserId: (int) $riderUser->user_id,
                    action: 'rider_waiting_request_accepted',
                    entityType: 'waiting_requests',
                    entityId: $waitingRequestId,
                    oldValues: ['status' => 'pending'],
                    newValues: ['status' => 'accepted', 'wait_ends_at' => $waitEndsAt->toIso8601String()],
                    request: $request,
                );

                $formatted = $this->formatWaitingRequest(DB::table('waiting_requests')->where('id', $waitingRequestId)->first());
                $serverNowIso = OrderTimestampFormatter::toManilaIso($now) ?? $now->toIso8601String();
                $orderId = (int) $order->order_id;

                DB::afterCommit(static function () use ($orderId, $waitingRequestId, $waitEndsAt, $formatted, $serverNowIso): void {
                    NotifyWaitEndedJob::dispatch($waitingRequestId)->delay($waitEndsAt);
                    event(new WaitingRequestUpdated($orderId, $formatted, false, $serverNowIso));
                });

                return [
                    'waiting_request' => $formatted,
                    'server_now' => $serverNowIso,
                ];
            }

            // Declined by rider: record incident for admin review, NO automatic ordering ban.
            $affected = DB::table('waiting_requests')
                ->where('id', $waitingRequestId)
                ->where('status', 'pending')
                ->update([
                    'status' => 'declined',
                    'responded_at' => $now->toDateTimeString(),
                ]);

            if ($affected === 0) {
                throw new ConflictHttpException('Waiting request is no longer pending.');
            }

            $recentMessages = $this->loadRecentChatContext((int) $order->order_id);
            DB::table('customer_incidents')->insert([
                'user_id' => (int) $order->customer_id,
                'order_id' => (int) $order->order_id,
                'type' => 'rider_declined_wait',
                'details' => json_encode([
                    'waiting_request_id' => $waitingRequestId,
                    'request_no' => (int) $wr->request_no,
                    'order_reference' => $order->order_reference,
                    'declined_at' => $now->toDateTimeString(),
                    'chat_context' => $recentMessages,
                ]),
                'created_at' => $now->toDateTimeString(),
            ]);

            $this->notificationService->notifyUser(
                userId: (int) $order->customer_id,
                workspace: 'customer',
                type: 'waiting_request_declined',
                title: "Waiting request declined ({$order->order_reference})",
                body: 'Your rider could not wait longer. Normal delivery rules apply.',
                relatedEntityType: 'order',
                relatedEntityId: (int) $order->order_id,
            );

            $this->auditLogService->record(
                actorUserId: (int) $riderUser->user_id,
                action: 'rider_waiting_request_declined',
                entityType: 'waiting_requests',
                entityId: $waitingRequestId,
                oldValues: ['status' => 'pending'],
                newValues: ['status' => 'declined'],
                request: $request,
            );

            $formatted = $this->formatWaitingRequest(DB::table('waiting_requests')->where('id', $waitingRequestId)->first());
            $serverNowIso = OrderTimestampFormatter::toManilaIso($now) ?? $now->toIso8601String();
            $orderId = (int) $order->order_id;

            DB::afterCommit(static function () use ($orderId, $formatted, $serverNowIso): void {
                event(new WaitingRequestUpdated($orderId, $formatted, false, $serverNowIso));
            });

            return [
                'waiting_request' => $formatted,
                'server_now' => $serverNowIso,
            ];
        });
    }

    public function expirePendingRequest(int $waitingRequestId): void
    {
        DB::transaction(function () use ($waitingRequestId): void {
            $wr = DB::table('waiting_requests')->where('id', $waitingRequestId)->lockForUpdate()->first();
            if (! $wr || $wr->status !== 'pending') {
                return;
            }
            $this->expireStaleRequestsInTransaction((int) $wr->order_id, CarbonImmutable::now());
        });
    }

    public function notifyWaitEnded(int $waitingRequestId): void
    {
        $wr = DB::table('waiting_requests')->where('id', $waitingRequestId)->first();
        if (! $wr || $wr->status !== 'accepted' || $wr->wait_ends_at === null) {
            return;
        }

        $now = CarbonImmutable::now();
        if ($now->lt(CarbonImmutable::parse((string) $wr->wait_ends_at))) {
            return;
        }

        $serverNowIso = OrderTimestampFormatter::toManilaIso($now) ?? $now->toIso8601String();
        event(new WaitingRequestUpdated((int) $wr->order_id, $this->formatWaitingRequest($wr), true, $serverNowIso));

        // Promptly evaluate unreachable cancellation if 3+ strikes & 5+ min since arrival.
        app(OrderConnectService::class)->evaluateUnreachableCancellation((int) $wr->order_id);
    }

    public function expireStaleRequestsInTransaction(int $orderId, CarbonImmutable $now, ?Request $request = null): void
    {
        $stale = DB::table('waiting_requests')
            ->where('order_id', $orderId)
            ->where('status', 'pending')
            ->where('expires_at', '<=', $now->toDateTimeString())
            ->lockForUpdate()
            ->get();

        foreach ($stale as $row) {
            $affected = DB::table('waiting_requests')
                ->where('id', $row->id)
                ->where('status', 'pending')
                ->update([
                    'status' => 'expired',
                    'responded_at' => $now->toDateTimeString(),
                ]);

            if ($affected === 0) {
                continue;
            }

            $this->auditLogService->record(
                actorUserId: null,
                action: 'waiting_request_expired',
                entityType: 'waiting_requests',
                entityId: (int) $row->id,
                oldValues: ['status' => 'pending'],
                newValues: ['status' => 'expired'],
                request: $request,
            );

            $formatted = $this->formatWaitingRequest(DB::table('waiting_requests')->where('id', $row->id)->first());
            $serverNowIso = OrderTimestampFormatter::toManilaIso($now) ?? $now->toIso8601String();

            DB::afterCommit(static function () use ($orderId, $formatted, $serverNowIso): void {
                event(new WaitingRequestUpdated($orderId, $formatted, false, $serverNowIso));
            });
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function loadRecentChatContext(int $orderId): array
    {
        $convId = DB::table('conversations')->where('order_id', $orderId)->value('id');
        if (! $convId) {
            return [];
        }

        return DB::table('messages')
            ->where('conversation_id', $convId)
            ->orderByDesc('id')
            ->limit(10)
            ->get(['sender_id', 'message', 'created_at'])
            ->reverse()
            ->map(static fn ($m): array => [
                'sender_id' => (int) $m->sender_id,
                'message' => (string) $m->message,
                'created_at' => $m->created_at,
            ])
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function formatWaitingRequest(object $row): array
    {
        return [
            'id' => (int) $row->id,
            'order_id' => (int) $row->order_id,
            'request_no' => (int) $row->request_no,
            'status' => $row->status,
            'requested_minutes' => (int) $row->requested_minutes,
            'requested_at' => OrderTimestampFormatter::toManilaIso($row->requested_at),
            'expires_at' => OrderTimestampFormatter::toManilaIso($row->expires_at),
            'responded_at' => OrderTimestampFormatter::toManilaIso($row->responded_at),
            'wait_ends_at' => OrderTimestampFormatter::toManilaIso($row->wait_ends_at),
        ];
    }
}
