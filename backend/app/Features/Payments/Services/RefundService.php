<?php

namespace App\Features\Payments\Services;

use App\Features\Admin\Services\LedgerService;
use App\Features\Notifications\Services\NotificationService;
use App\Features\Payments\Exceptions\XenditTimeoutException;
use App\Features\Payments\Providers\PaymentProviderResolver;
use App\Features\Payments\Support\PaymentStatusMapper;
use App\Support\AuditLogService;
use App\Support\Money;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class RefundService
{
    public const RESERVED_OR_SUCCESSFUL_STATUSES = [
        'requested',
        'approved',
        'submitted',
        'processing',
        'successful',
        'manual',
    ];

    public function __construct(
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
        private readonly LedgerService $ledgerService,
        private readonly PaymentProviderResolver $providerResolver,
    ) {}

    /**
     * Request a full refund for a reservation deposit if it was paid via an online payment method.
     * Safe and idempotent to call inside an existing DB::transaction().
     *
     * Does NOT mark deposit_status = 'refunded' or post a refund ledger journal until
     * confirmed by confirmRefundSucceeded().
     *
     * @return array<string, mixed>|null
     */
    public function refundReservationDepositIfPaid(
        int $reservationId,
        int $actorUserId,
        string $reason,
        ?Request $request = null,
    ): ?array {
        $reservation = DB::table('reservations')
            ->where('reservation_id', $reservationId)
            ->lockForUpdate()
            ->first();

        if (! $reservation) {
            return null;
        }

        $resAllocation = DB::table('payment_allocations as pa')
            ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
            ->where('pa.reservation_id', $reservationId)
            ->where('pa.allocation_type', 'reservation_payment')
            ->where('p.payment_type', 'payment')
            ->orderByDesc('p.payment_id')
            ->first(['pa.amount as allocated_amount', 'p.payment_id']);

        if (! $resAllocation) {
            return null;
        }

        $originalPayment = DB::table('payments')
            ->where('payment_id', $resAllocation->payment_id)
            ->lockForUpdate()
            ->first();

        if (
            ! $originalPayment
            || $originalPayment->payment_method === 'cash'
            || $originalPayment->payment_type !== 'payment'
            || ! in_array((string) $originalPayment->payment_status, ['paid', 'partially_refunded'], true)
        ) {
            return null;
        }

        $collectedCents = Money::parseStrictCents((string) $originalPayment->amount);
        if ($collectedCents <= 0) {
            return null;
        }

        $existingRefundAmounts = DB::table('payments')
            ->where('related_payment_id', $originalPayment->payment_id)
            ->where('payment_type', 'refund')
            ->whereIn('refund_status', self::RESERVED_OR_SUCCESSFUL_STATUSES)
            ->lockForUpdate()
            ->pluck('amount');

        $alreadyReservedCents = 0;
        foreach ($existingRefundAmounts as $amt) {
            $parsed = Money::parseStrictCents((string) $amt);
            if ($parsed > 0) {
                $alreadyReservedCents += $parsed;
            }
        }

        $remainingCents = $collectedCents - $alreadyReservedCents;
        if ($remainingCents <= 0) {
            return null;
        }

        $now = now();
        $refundAmountStr = Money::fromCents($remainingCents);
        $refundRef = 'RESRFD-'.now()->format('Ymd').'-'.strtoupper(Str::random(8));
        $cleanReason = mb_substr(trim($reason), 0, 255);

        $refundRow = [
            'payment_reference' => $refundRef,
            'checkout_id' => null,
            'customer_id' => (int) $originalPayment->customer_id,
            'payment_method' => $originalPayment->payment_method,
            'payment_type' => 'refund',
            'payment_status' => 'pending',
            'refund_status' => 'requested',
            'amount' => $refundAmountStr,
            'related_payment_id' => (int) $originalPayment->payment_id,
            'provider_response' => json_encode([
                'reason' => $cleanReason,
                'reservation_id' => $reservationId,
                'reservation_reference' => $reservation->reservation_reference,
                'channel' => $originalPayment->payment_channel ?? null,
            ], JSON_UNESCAPED_SLASHES),
            'created_at' => $now,
            'updated_at' => $now,
        ];

        if (Schema::hasColumn('payments', 'provider_name')) {
            $refundRow['provider_name'] = $originalPayment->provider_name ?? null;
        }
        if (Schema::hasColumn('payments', 'payment_channel')) {
            $refundRow['payment_channel'] = $originalPayment->payment_channel ?? null;
        }

        $refundPaymentId = (int) DB::table('payments')->insertGetId($refundRow);

        DB::table('payment_allocations')->insert([
            'payment_id' => $refundPaymentId,
            'order_id' => null,
            'reservation_id' => $reservationId,
            'allocation_type' => 'reservation_refund',
            'amount' => $refundAmountStr,
            'created_at' => $now,
        ]);

        $this->auditLogService->record(
            actorUserId: $actorUserId,
            action: 'reservation_refund_requested',
            entityType: 'payments',
            entityId: $refundPaymentId,
            oldValues: null,
            newValues: [
                'refund_reference' => $refundRef,
                'reservation_id' => $reservationId,
                'amount' => $refundAmountStr,
                'refund_status' => 'requested',
            ],
            reason: $cleanReason,
            request: $request,
        );

        return [
            'refund_payment_id' => $refundPaymentId,
            'payment_reference' => $refundRef,
            'refund_status' => 'requested',
            'amount' => (float) $refundAmountStr,
        ];
    }

    /**
     * Request a refund for a single order if it was paid via an online payment method.
     * Safe and idempotent to call inside an existing DB::transaction().
     *
     * Does NOT mark the refund successful or post a refund ledger journal until
     * confirmed by confirmRefundSucceeded() (Phase 4.3 provider integration).
     *
     * @return array<string, mixed>|null
     */
    public function refundOrderIfPaid(
        int $orderId,
        int $actorUserId,
        string $reason,
        ?Request $request = null,
    ): ?array {
        $order = DB::table('orders')->where('order_id', $orderId)->lockForUpdate()->first();
        if (! $order) {
            return null;
        }

        $orderTotalCents = Money::parseStrictCents((string) $order->total_amount);
        if ($orderTotalCents <= 0) {
            return null;
        }

        // Find the original order payment allocation & lock the original payment row first.
        $orderAllocation = DB::table('payment_allocations as pa')
            ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
            ->where('pa.order_id', $orderId)
            ->where('pa.allocation_type', 'order_payment')
            ->where('p.payment_type', 'payment')
            ->orderByDesc('p.payment_id')
            ->first(['pa.amount as allocated_amount', 'p.payment_id']);

        if (! $orderAllocation) {
            return null;
        }

        $originalPayment = DB::table('payments')
            ->where('payment_id', $orderAllocation->payment_id)
            ->lockForUpdate()
            ->first();

        if (! $originalPayment || $originalPayment->payment_method === 'cash' || $originalPayment->payment_type !== 'payment') {
            return null;
        }

        $now = now();

        // If the online payment was never paid (still pending/requires_customer_action), void/cancel it instead of refunding.
        if (in_array($originalPayment->payment_status, ['pending', 'requires_customer_action', 'processing', 'authorized'], true)) {
            $allOrderIdsForPayment = DB::table('payment_allocations')
                ->where('payment_id', $originalPayment->payment_id)
                ->where('allocation_type', 'order_payment')
                ->pluck('order_id')
                ->filter()
                ->all();

            $activeSiblings = DB::table('orders')
                ->whereIn('order_id', $allOrderIdsForPayment)
                ->whereNotIn('order_status', ['cancelled', 'rejected', 'failed'])
                ->count();

            if ($activeSiblings === 0) {
                DB::table('payments')
                    ->where('payment_id', $originalPayment->payment_id)
                    ->update([
                        'payment_status' => 'cancelled',
                        'updated_at' => $now,
                    ]);
            }

            return null;
        }

        if (! in_array($originalPayment->payment_status, ['paid', 'partially_refunded'], true)) {
            return null;
        }

        // Idempotency: return existing non-failed refund for this order without creating duplicates.
        $existingRefund = DB::table('payment_allocations as pa')
            ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
            ->where('pa.order_id', $orderId)
            ->where('pa.allocation_type', 'order_refund')
            ->where('p.payment_type', 'refund')
            ->where('p.refund_status', '!=', 'failed')
            ->orderByDesc('p.payment_id')
            ->first(['p.*']);

        if ($existingRefund) {
            return [
                'refund_payment_id' => (int) $existingRefund->payment_id,
                'payment_reference' => $existingRefund->payment_reference,
                'refund_status' => $existingRefund->refund_status,
                'amount' => (float) $existingRefund->amount,
            ];
        }

        $allocatedCents = Money::parseStrictCents((string) $orderAllocation->allocated_amount);
        if ($allocatedCents <= 0) {
            return null;
        }

        $refundCents = min($orderTotalCents, $allocatedCents);
        $originalAmountCents = Money::parseStrictCents((string) $originalPayment->amount);
        if ($originalAmountCents <= 0 || $refundCents <= 0) {
            return null;
        }

        // Enforce over-refund & reservation cap using integer centavos.
        $reservedOrSuccessfulRows = DB::table('payments')
            ->where('related_payment_id', $originalPayment->payment_id)
            ->where('payment_type', 'refund')
            ->whereIn('refund_status', self::RESERVED_OR_SUCCESSFUL_STATUSES)
            ->lockForUpdate()
            ->pluck('amount');

        $alreadyReservedCents = 0;
        foreach ($reservedOrSuccessfulRows as $amt) {
            $parsed = Money::parseStrictCents((string) $amt);
            if ($parsed > 0) {
                $alreadyReservedCents += $parsed;
            }
        }

        $remainingRefundableCents = $originalAmountCents - $alreadyReservedCents;
        if ($refundCents > $remainingRefundableCents) {
            throw new ConflictHttpException('Refund amount exceeds remaining refundable payment balance.');
        }

        $refundAmount = Money::fromCents($refundCents);
        $refundRef = 'SALO-REF-'.now()->format('Ymd').'-'.strtoupper(Str::random(6));
        $originalMeta = json_decode((string) ($originalPayment->provider_response ?? ''), true);
        $originalMeta = is_array($originalMeta) ? $originalMeta : [];

        $meta = [
            'reason' => mb_substr(trim($reason) !== '' ? trim($reason) : 'Order cancelled', 0, 255),
            'original_payment_reference' => $originalPayment->payment_reference,
            'order_reference' => $order->order_reference,
            'provider' => $originalPayment->provider_name ?? ($originalMeta['provider'] ?? null),
            'refund_idempotency_key' => 'salo-rfd-'.$refundRef,
        ];

        $insertData = [
            'payment_reference' => $refundRef,
            'checkout_id' => $originalPayment->checkout_id,
            'customer_id' => $originalPayment->customer_id,
            'payment_method' => $originalPayment->payment_method,
            'payment_type' => 'refund',
            'payment_status' => 'pending',
            'refund_status' => 'requested',
            'amount' => $refundAmount,
            'related_payment_id' => $originalPayment->payment_id,
            'provider_response' => json_encode($meta, JSON_UNESCAPED_SLASHES),
            'paid_at' => null,
            'created_at' => $now,
            'updated_at' => $now,
        ];

        if (Schema::hasColumn('payments', 'provider_name')) {
            $insertData['provider_name'] = $originalPayment->provider_name ?? ($originalMeta['provider'] ?? null);
        }
        if (Schema::hasColumn('payments', 'payment_channel')) {
            $insertData['payment_channel'] = $originalPayment->payment_channel ?? ($originalMeta['channel'] ?? null);
        }

        $refundPaymentId = (int) DB::table('payments')->insertGetId($insertData);

        DB::table('payment_allocations')->insert([
            'payment_id' => $refundPaymentId,
            'order_id' => $orderId,
            'allocation_type' => 'order_refund',
            'amount' => $refundAmount,
            'created_at' => $now,
        ]);

        $this->auditLogService->record(
            actorUserId: $actorUserId,
            action: 'order_refund_requested',
            entityType: 'payments',
            entityId: $refundPaymentId,
            oldValues: ['payment_status' => $originalPayment->payment_status],
            newValues: [
                'refund_reference' => $refundRef,
                'refund_status' => 'requested',
                'amount' => $refundAmount,
            ],
            reason: $reason,
            request: $request,
        );

        $this->notificationService->notifyUser(
            userId: (int) $order->customer_id,
            workspace: 'customer',
            type: 'payment_refund_requested',
            title: "Refund requested for {$order->order_reference}",
            body: 'A refund request of PHP '.number_format((float) $refundAmount, 2)." ({$refundRef}) has been recorded and is awaiting processing.",
            relatedEntityType: 'order',
            relatedEntityId: $orderId,
        );

        return [
            'refund_payment_id' => $refundPaymentId,
            'payment_reference' => $refundRef,
            'refund_status' => 'requested',
            'amount' => (float) $refundAmount,
        ];
    }

    /**
     * Domain-level confirmation of a completed refund (for Phase 4.3 provider confirmation).
     * Atomically transitions refund_status -> 'successful', updates original payment status,
     * posts the idempotent refund ledger journal, and records audit + customer notification.
     *
     * @return array<string, mixed>
     */
    public function confirmRefundSucceeded(
        int $refundPaymentId,
        ?string $providerRefundId = null,
        ?int $actorUserId = null,
        ?Request $request = null,
    ): array {
        return DB::transaction(function () use ($refundPaymentId, $providerRefundId, $actorUserId, $request): array {
            $refund = DB::table('payments')
                ->where('payment_id', $refundPaymentId)
                ->where('payment_type', 'refund')
                ->lockForUpdate()
                ->first();

            if (! $refund) {
                throw new NotFoundHttpException('Refund record not found.');
            }

            if ($refund->refund_status === 'successful') {
                return [
                    'refund_payment_id' => (int) $refund->payment_id,
                    'payment_reference' => $refund->payment_reference,
                    'refund_status' => 'successful',
                    'amount' => (float) $refund->amount,
                ];
            }

            if (! in_array($refund->refund_status, ['requested', 'approved', 'submitted', 'processing', 'manual'], true)) {
                throw new ConflictHttpException("Refund cannot be confirmed from status '{$refund->refund_status}'.");
            }

            $originalPayment = DB::table('payments')
                ->where('payment_id', $refund->related_payment_id)
                ->lockForUpdate()
                ->first();

            if (! $originalPayment) {
                throw new NotFoundHttpException('Original payment record not found.');
            }

            $allocation = DB::table('payment_allocations')
                ->where('payment_id', $refundPaymentId)
                ->whereIn('allocation_type', ['order_refund', 'reservation_refund'])
                ->first();

            if (! $allocation || ($allocation->order_id === null && $allocation->reservation_id === null)) {
                throw new ConflictHttpException('Refund allocation record is missing.');
            }

            $isReservationRefund = $allocation->allocation_type === 'reservation_refund' && $allocation->reservation_id !== null;
            $orderId = $allocation->order_id !== null ? (int) $allocation->order_id : null;
            $reservationId = $allocation->reservation_id !== null ? (int) $allocation->reservation_id : null;
            $order = $orderId !== null ? DB::table('orders')->where('order_id', $orderId)->first() : null;
            $reservation = $reservationId !== null ? DB::table('reservations')->where('reservation_id', $reservationId)->lockForUpdate()->first() : null;

            $now = now();
            $meta = json_decode((string) ($refund->provider_response ?? ''), true);
            $meta = is_array($meta) ? $meta : [];
            if ($providerRefundId !== null && trim($providerRefundId) !== '') {
                $meta['provider_refund_id'] = trim($providerRefundId);
            }
            $meta['confirmed_at'] = $now->toIso8601String();

            $refundUpdates = [
                'refund_status' => 'successful',
                'paid_at' => $now,
                'provider_response' => json_encode($meta, JSON_UNESCAPED_SLASHES),
                'updated_at' => $now,
            ];

            if ($providerRefundId !== null && trim($providerRefundId) !== '' && Schema::hasColumn('payments', 'provider_payment_id')) {
                $refundUpdates['provider_payment_id'] = trim($providerRefundId);
            }

            DB::table('payments')->where('payment_id', $refundPaymentId)->update($refundUpdates);

            // Recompute original payment status based ONLY on confirmed successful refunds.
            $successfulRefundRows = DB::table('payments')
                ->where('related_payment_id', $originalPayment->payment_id)
                ->where('payment_type', 'refund')
                ->where('refund_status', 'successful')
                ->pluck('amount');

            $totalSuccessfulCents = 0;
            foreach ($successfulRefundRows as $amt) {
                $parsed = Money::parseStrictCents((string) $amt);
                if ($parsed > 0) {
                    $totalSuccessfulCents += $parsed;
                }
            }

            $allocatedAmounts = DB::table('payment_allocations')
                ->where('payment_id', $originalPayment->payment_id)
                ->where('allocation_type', $isReservationRefund ? 'reservation_payment' : 'order_payment')
                ->pluck('amount');

            $totalAllocatedCents = 0;
            foreach ($allocatedAmounts as $amt) {
                $parsed = Money::parseStrictCents((string) $amt);
                if ($parsed > 0) {
                    $totalAllocatedCents += $parsed;
                }
            }

            $originalCents = Money::parseStrictCents((string) $originalPayment->amount);
            $refundableCapCents = min($originalCents, $totalAllocatedCents > 0 ? $totalAllocatedCents : $originalCents);
            $nextOriginalStatus = $totalSuccessfulCents >= $refundableCapCents ? 'refunded' : 'partially_refunded';

            DB::table('payments')
                ->where('payment_id', $originalPayment->payment_id)
                ->update([
                    'payment_status' => $nextOriginalStatus,
                    'updated_at' => $now,
                ]);

            if ($isReservationRefund && $reservationId !== null) {
                DB::table('reservations')
                    ->where('reservation_id', $reservationId)
                    ->update([
                        'deposit_status' => 'refunded',
                        'updated_at' => $now,
                    ]);

                $this->ledgerService->postReservationRefund(
                    refundPaymentId: $refundPaymentId,
                    reservationId: $reservationId,
                    customerUserId: (int) $refund->customer_id,
                    amount: (float) $refund->amount,
                    postedBy: $actorUserId,
                );

                $this->auditLogService->record(
                    actorUserId: $actorUserId ?? (int) $refund->customer_id,
                    action: 'reservation_deposit_refunded',
                    entityType: 'payments',
                    entityId: $refundPaymentId,
                    oldValues: ['refund_status' => $refund->refund_status, 'original_payment_status' => $originalPayment->payment_status],
                    newValues: [
                        'refund_reference' => $refund->payment_reference,
                        'refund_status' => 'successful',
                        'reservation_id' => $reservationId,
                        'deposit_status' => 'refunded',
                        'amount' => (string) $refund->amount,
                        'original_payment_status' => $nextOriginalStatus,
                    ],
                    request: $request,
                );

                $resRef = $reservation?->reservation_reference ?? ($meta['reservation_reference'] ?? "#{$reservationId}");
                $this->notificationService->notifyUser(
                    userId: (int) $refund->customer_id,
                    workspace: 'customer',
                    type: 'reservation_deposit_refunded',
                    title: "Deposit refunded for {$resRef}",
                    body: 'PHP '.number_format((float) $refund->amount, 2)." has been refunded ({$refund->payment_reference}).",
                    relatedEntityType: 'reservation',
                    relatedEntityId: $reservationId,
                );
            } else {
                $this->ledgerService->postOrderRefund(
                    refundPaymentId: $refundPaymentId,
                    orderId: $orderId,
                    checkoutId: (int) ($order?->checkout_id ?? $refund->checkout_id),
                    customerUserId: (int) $refund->customer_id,
                    amount: (float) $refund->amount,
                    postedBy: $actorUserId,
                );

                $this->auditLogService->record(
                    actorUserId: $actorUserId ?? (int) $refund->customer_id,
                    action: 'order_payment_refunded',
                    entityType: 'payments',
                    entityId: $refundPaymentId,
                    oldValues: ['refund_status' => $refund->refund_status, 'original_payment_status' => $originalPayment->payment_status],
                    newValues: [
                        'refund_reference' => $refund->payment_reference,
                        'refund_status' => 'successful',
                        'amount' => (string) $refund->amount,
                        'original_payment_status' => $nextOriginalStatus,
                    ],
                    request: $request,
                );

                $alreadyNotified = DB::table('notifications')
                    ->where('type', 'payment_refunded')
                    ->where('related_entity_type', 'order')
                    ->where('related_entity_id', $orderId)
                    ->exists();

                if (! $alreadyNotified) {
                    $orderRef = $order?->order_reference ?? ($meta['order_reference'] ?? "#{$orderId}");
                    $this->notificationService->notifyUser(
                        userId: (int) $refund->customer_id,
                        workspace: 'customer',
                        type: 'payment_refunded',
                        title: "Refund processed for {$orderRef}",
                        body: 'PHP '.number_format((float) $refund->amount, 2)." has been refunded ({$refund->payment_reference}).",
                        relatedEntityType: 'order',
                        relatedEntityId: $orderId,
                    );
                }
            }

            return [
                'refund_payment_id' => $refundPaymentId,
                'payment_reference' => $refund->payment_reference,
                'refund_status' => 'successful',
                'amount' => (float) $refund->amount,
            ];
        });
    }

    /**
     * Mark a non-successful refund as failed, releasing its reserved refundable amount
     * without posting any ledger reversal or altering the original payment's paid status.
     *
     * @return array<string, mixed>
     */
    public function markRefundFailed(
        int $refundPaymentId,
        string $reason,
        ?int $actorUserId = null,
        ?Request $request = null,
    ): array {
        return DB::transaction(function () use ($refundPaymentId, $reason, $actorUserId, $request): array {
            $refund = DB::table('payments')
                ->where('payment_id', $refundPaymentId)
                ->where('payment_type', 'refund')
                ->lockForUpdate()
                ->first();

            if (! $refund) {
                throw new NotFoundHttpException('Refund record not found.');
            }

            if ($refund->refund_status === 'failed') {
                return [
                    'refund_payment_id' => (int) $refund->payment_id,
                    'payment_reference' => $refund->payment_reference,
                    'refund_status' => 'failed',
                    'amount' => (float) $refund->amount,
                ];
            }

            if ($refund->refund_status === 'successful') {
                throw new ConflictHttpException('Successful refunds cannot be marked failed.');
            }

            $now = now();
            $meta = json_decode((string) ($refund->provider_response ?? ''), true);
            $meta = is_array($meta) ? $meta : [];
            $meta['failure_reason'] = mb_substr(trim($reason) !== '' ? trim($reason) : 'Refund processing failed.', 0, 255);
            $meta['failed_at'] = $now->toIso8601String();

            DB::table('payments')
                ->where('payment_id', $refundPaymentId)
                ->update([
                    'refund_status' => 'failed',
                    'provider_response' => json_encode($meta, JSON_UNESCAPED_SLASHES),
                    'updated_at' => $now,
                ]);

            $this->auditLogService->record(
                actorUserId: $actorUserId ?? (int) $refund->customer_id,
                action: 'order_refund_failed',
                entityType: 'payments',
                entityId: $refundPaymentId,
                oldValues: ['refund_status' => $refund->refund_status],
                newValues: ['refund_status' => 'failed'],
                reason: $meta['failure_reason'],
                request: $request,
            );

            return [
                'refund_payment_id' => $refundPaymentId,
                'payment_reference' => $refund->payment_reference,
                'refund_status' => 'failed',
                'amount' => (float) $refund->amount,
            ];
        });
    }

    /**
     * Submit an existing requested refund to the active payment provider (outside DB locks).
     *
     * @return array<string, mixed>
     */
    public function submitRefundToProvider(
        int $refundPaymentId,
        ?int $actorUserId = null,
        ?Request $request = null,
    ): array {
        $lock = Cache::lock("refund_submit_{$refundPaymentId}", 30);
        if (! $lock->get()) {
            throw new ConflictHttpException('Refund submission is already in progress. Please wait and try again.');
        }

        try {
            $precheck = DB::transaction(function () use ($refundPaymentId): array {
                $refund = DB::table('payments')
                    ->where('payment_id', $refundPaymentId)
                    ->where('payment_type', 'refund')
                    ->lockForUpdate()
                    ->first();

                if (! $refund) {
                    throw new NotFoundHttpException('Refund record not found.');
                }

                if ($refund->refund_status === 'successful') {
                    return [
                        'done' => true,
                        'result' => [
                            'refund_payment_id' => (int) $refund->payment_id,
                            'payment_reference' => $refund->payment_reference,
                            'refund_status' => 'successful',
                            'amount' => (float) $refund->amount,
                        ],
                    ];
                }

                if ($refund->refund_status === 'failed') {
                    throw new ConflictHttpException('Failed refunds cannot be resubmitted.');
                }

                $refundMeta = json_decode((string) ($refund->provider_response ?? ''), true);
                $refundMeta = is_array($refundMeta) ? $refundMeta : [];
                $existingProviderRefundId = $refund->provider_payment_id ?? ($refundMeta['provider_refund_id'] ?? null);

                if (in_array($refund->refund_status, ['submitted', 'processing'], true) && ! empty($existingProviderRefundId)) {
                    return [
                        'done' => true,
                        'result' => [
                            'refund_payment_id' => (int) $refund->payment_id,
                            'payment_reference' => $refund->payment_reference,
                            'refund_status' => $refund->refund_status,
                            'provider_refund_id' => $existingProviderRefundId,
                            'amount' => (float) $refund->amount,
                        ],
                    ];
                }

                if (($refundMeta['refund_submission_state'] ?? null) === 'uncertain' && ! empty($refundMeta['refund_attempted_at'])) {
                    $attemptedAt = Carbon::parse((string) $refundMeta['refund_attempted_at']);
                    if ($attemptedAt->diffInSeconds(now()) < 60) {
                        throw new ConflictHttpException(
                            'Previous refund submission timed out and its outcome is uncertain. Please wait or reconcile before retrying.'
                        );
                    }
                }

                $originalPayment = DB::table('payments')
                    ->where('payment_id', $refund->related_payment_id)
                    ->lockForUpdate()
                    ->first();

                if (! $originalPayment || $originalPayment->payment_method === 'cash') {
                    throw new ConflictHttpException('Original payment is not eligible for online provider refund.');
                }

                $origMeta = json_decode((string) ($originalPayment->provider_response ?? ''), true);
                $origMeta = is_array($origMeta) ? $origMeta : [];
                $providerPaymentId = (string) ($originalPayment->provider_payment_id ?? $origMeta['provider_payment_id'] ?? $origMeta['provider_reference'] ?? '');

                $idempotencyKey = (string) ($refundMeta['refund_idempotency_key'] ?? ('salo-rfd-'.$refund->payment_reference));
                $refundMeta['refund_idempotency_key'] = $idempotencyKey;
                DB::table('payments')->where('payment_id', $refundPaymentId)->update([
                    'provider_response' => json_encode($refundMeta, JSON_UNESCAPED_SLASHES),
                    'updated_at' => now(),
                ]);

                return [
                    'done' => false,
                    'refund' => $refund,
                    'refund_meta' => $refundMeta,
                    'provider_payment_id' => $providerPaymentId,
                    'idempotency_key' => $idempotencyKey,
                ];
            });

            if ($precheck['done']) {
                return $precheck['result'];
            }

            $refund = $precheck['refund'];
            $refundMeta = $precheck['refund_meta'];
            $provider = $this->providerResolver->resolve();

            try {
                $providerResult = $provider->refundPayment([
                    'refund_payment_id' => $refundPaymentId,
                    'refund_reference' => $refund->payment_reference,
                    'provider_payment_id' => $precheck['provider_payment_id'],
                    'amount' => (float) $refund->amount,
                    'currency' => 'PHP',
                    'reason' => (string) ($refundMeta['reason'] ?? 'REQUESTED_BY_CUSTOMER'),
                    'idempotency_key' => $precheck['idempotency_key'],
                ]);
            } catch (XenditTimeoutException $e) {
                $this->recordRefundSubmissionOutcome($refundPaymentId, 'uncertain');
                throw new HttpException(504, 'Refund submission timed out; outcome is uncertain. Reservation retained.', $e);
            } catch (\Throwable $e) {
                $this->markRefundFailed($refundPaymentId, $e->getMessage(), $actorUserId, $request);
                throw $e;
            }

            $mappedStatus = $providerResult['refund_status'];
            $providerRefundId = $providerResult['provider_refund_id'] ?? null;

            if ($mappedStatus === 'successful') {
                return $this->confirmRefundSucceeded($refundPaymentId, $providerRefundId, $actorUserId, $request);
            }

            if ($mappedStatus === 'failed') {
                return $this->markRefundFailed($refundPaymentId, 'Provider rejected refund.', $actorUserId, $request);
            }

            // Asynchronous non-successful state ('submitted' or 'processing'): persist provider_refund_id, retain reservation, NO ledger journal.
            return DB::transaction(function () use ($refundPaymentId, $providerResult, $mappedStatus, $providerRefundId): array {
                $locked = DB::table('payments')->where('payment_id', $refundPaymentId)->lockForUpdate()->first();
                if (! $locked) {
                    throw new NotFoundHttpException('Refund record not found.');
                }

                if ($locked->refund_status === 'successful') {
                    return [
                        'refund_payment_id' => $refundPaymentId,
                        'payment_reference' => $locked->payment_reference,
                        'refund_status' => 'successful',
                        'amount' => (float) $locked->amount,
                    ];
                }

                $now = now();
                $meta = json_decode((string) ($locked->provider_response ?? ''), true);
                $meta = is_array($meta) ? $meta : [];
                $merged = array_merge($meta, $providerResult['meta'], ['refund_submission_state' => $mappedStatus]);

                $updates = [
                    'refund_status' => $mappedStatus,
                    'provider_response' => json_encode($merged, JSON_UNESCAPED_SLASHES),
                    'updated_at' => $now,
                ];
                if (Schema::hasColumn('payments', 'provider_name')) {
                    $updates['provider_name'] = $providerResult['provider_name'];
                }
                if ($providerRefundId !== null && Schema::hasColumn('payments', 'provider_payment_id')) {
                    $updates['provider_payment_id'] = $providerRefundId;
                }

                DB::table('payments')->where('payment_id', $refundPaymentId)->update($updates);

                return [
                    'refund_payment_id' => $refundPaymentId,
                    'payment_reference' => $locked->payment_reference,
                    'refund_status' => $mappedStatus,
                    'provider_refund_id' => $providerRefundId,
                    'amount' => (float) $locked->amount,
                ];
            });
        } finally {
            $lock->release();
        }
    }

    private function recordRefundSubmissionOutcome(int $refundPaymentId, string $state): void
    {
        DB::transaction(function () use ($refundPaymentId, $state): void {
            $locked = DB::table('payments')->where('payment_id', $refundPaymentId)->lockForUpdate()->first();
            if (! $locked || $locked->refund_status === 'successful' || $locked->refund_status === 'failed') {
                return;
            }

            $meta = json_decode((string) ($locked->provider_response ?? ''), true);
            $meta = is_array($meta) ? $meta : [];
            $meta['refund_submission_state'] = $state;
            $meta['refund_attempted_at'] = now()->toIso8601String();

            DB::table('payments')->where('payment_id', $refundPaymentId)->update([
                'provider_response' => json_encode($meta, JSON_UNESCAPED_SLASHES),
                'updated_at' => now(),
            ]);
        });
    }

    /**
     * Handle verified Xendit refund webhooks (refund.succeeded, refund.failed, refund.pending).
     *
     * @return array<string, mixed>
     */
    public function handleXenditRefundWebhook(Request $request): array
    {
        if (
            strtolower(trim((string) config('salo.payments.driver', ''))) !== 'xendit'
            || app()->environment('production')
            || strtolower(trim((string) config('services.xendit.mode', ''))) !== 'test'
        ) {
            throw new AccessDeniedHttpException('Xendit Test Mode refund webhook is disabled in this environment.');
        }

        $expectedToken = trim((string) config('services.xendit.webhook_token', ''));
        $providedToken = trim((string) $request->header('x-callback-token', ''));
        if ($expectedToken === '' || $providedToken === '' || ! hash_equals($expectedToken, $providedToken)) {
            throw new AccessDeniedHttpException('Invalid Xendit callback verification token.');
        }

        $validated = $request->validate([
            'event' => ['required', 'string', 'in:refund.succeeded,refund.failed,refund.pending'],
            'data' => ['required', 'array'],
            'data.refund_id' => ['nullable', 'string', 'max:120'],
            'data.id' => ['nullable', 'string', 'max:120'],
            'data.reference_id' => ['required', 'string', 'max:100'],
            'data.status' => ['required', 'string', 'max:50'],
            'data.amount' => ['required', 'numeric', 'gt:0'],
            'data.currency' => ['required', 'string', 'size:3'],
        ]);

        $data = $validated['data'];
        $providerRefundId = trim((string) ($data['refund_id'] ?? $data['id'] ?? ''));
        if ($providerRefundId === '') {
            throw ValidationException::withMessages([
                'data.refund_id' => ['Provider refund ID is required.'],
            ]);
        }

        $rawStatus = strtoupper(trim((string) $data['status']));
        $mappedStatus = PaymentStatusMapper::mapXenditRefundStatus($rawStatus);
        if ($mappedStatus === null) {
            throw ValidationException::withMessages([
                'data.status' => ['Unsupported Xendit refund status.'],
            ]);
        }

        $currency = strtoupper(trim((string) $data['currency']));
        if ($currency !== 'PHP') {
            throw ValidationException::withMessages([
                'data.currency' => ['Unsupported refund currency.'],
            ]);
        }

        $referenceId = trim((string) $data['reference_id']);
        $callbackAmountCents = Money::parseStrictCents(number_format((float) $data['amount'], 2, '.', ''));
        $eventKey = "xendit_rfd_{$providerRefundId}_{$rawStatus}";

        $outcome = DB::transaction(function () use ($referenceId, $providerRefundId, $callbackAmountCents, $mappedStatus, $rawStatus, $eventKey, $validated): array {
            $refund = DB::table('payments')
                ->where('payment_reference', $referenceId)
                ->where('payment_type', 'refund')
                ->lockForUpdate()
                ->first();

            if (! $refund) {
                throw new NotFoundHttpException('Refund record not found for reference_id.');
            }

            if ($refund->payment_method === 'cash') {
                throw new ConflictHttpException('COD payments cannot be processed via Xendit refund webhook.');
            }

            $meta = json_decode((string) ($refund->provider_response ?? ''), true);
            $meta = is_array($meta) ? $meta : [];
            $storedProvider = $refund->provider_name ?? ($meta['provider'] ?? null);
            if ($storedProvider !== null && $storedProvider !== '' && $storedProvider !== 'xendit') {
                throw new ConflictHttpException('Refund does not belong to Xendit provider.');
            }

            $expectedCents = Money::parseStrictCents((string) $refund->amount);
            if ($callbackAmountCents !== $expectedCents) {
                throw ValidationException::withMessages([
                    'data.amount' => ['Callback refund amount does not match stored refund amount.'],
                ]);
            }

            $storedRefundId = $refund->provider_payment_id ?? ($meta['provider_refund_id'] ?? null);
            if ($storedRefundId !== null && $storedRefundId !== '' && $storedRefundId !== $providerRefundId) {
                throw ValidationException::withMessages([
                    'data.refund_id' => ['Callback refund ID does not match stored provider refund ID.'],
                ]);
            }

            $now = now();
            $safePayload = json_encode([
                'event' => $validated['event'],
                'status' => $rawStatus,
                'mapped_status' => $mappedStatus,
                'provider_refund_id' => $providerRefundId,
                'reference_id' => $referenceId,
            ], JSON_UNESCAPED_SLASHES);

            // Terminal protection: never overwrite successful refund with failed/pending.
            if ($refund->refund_status === 'successful' || $refund->refund_status === $mappedStatus) {
                DB::table('payment_events')->insertOrIgnore([
                    'provider_name' => 'xendit',
                    'event_key' => $eventKey,
                    'payment_id' => (int) $refund->payment_id,
                    'payload' => $safePayload,
                    'processing_status' => 'ignored',
                    'processed_at' => $now,
                    'created_at' => $now,
                ]);

                return [
                    'action' => 'none',
                    'result' => [
                        'refund_payment_id' => (int) $refund->payment_id,
                        'payment_reference' => $refund->payment_reference,
                        'refund_status' => $refund->refund_status,
                        'amount' => (float) $refund->amount,
                    ],
                ];
            }

            DB::table('payment_events')->insertOrIgnore([
                'provider_name' => 'xendit',
                'event_key' => $eventKey,
                'payment_id' => (int) $refund->payment_id,
                'payload' => $safePayload,
                'processing_status' => 'processed',
                'processed_at' => $now,
                'created_at' => $now,
            ]);

            if ($mappedStatus === 'successful') {
                return ['action' => 'confirm', 'refund_payment_id' => (int) $refund->payment_id];
            }

            if ($mappedStatus === 'failed') {
                return ['action' => 'fail', 'refund_payment_id' => (int) $refund->payment_id];
            }

            if ($refund->refund_status === 'requested') {
                $meta['provider'] = 'xendit';
                $meta['provider_refund_id'] = $providerRefundId;
                $updates = [
                    'refund_status' => $mappedStatus,
                    'provider_response' => json_encode($meta, JSON_UNESCAPED_SLASHES),
                    'updated_at' => $now,
                ];
                if (Schema::hasColumn('payments', 'provider_name')) {
                    $updates['provider_name'] = 'xendit';
                }
                if (Schema::hasColumn('payments', 'provider_payment_id')) {
                    $updates['provider_payment_id'] = $providerRefundId;
                }
                DB::table('payments')->where('payment_id', $refund->payment_id)->update($updates);
            }

            return [
                'action' => 'none',
                'result' => [
                    'refund_payment_id' => (int) $refund->payment_id,
                    'payment_reference' => $refund->payment_reference,
                    'refund_status' => $refund->refund_status === 'requested' ? $mappedStatus : $refund->refund_status,
                    'amount' => (float) $refund->amount,
                ],
            ];
        });

        if ($outcome['action'] === 'confirm') {
            return $this->confirmRefundSucceeded($outcome['refund_payment_id'], $providerRefundId, null, $request);
        }

        if ($outcome['action'] === 'fail') {
            return $this->markRefundFailed($outcome['refund_payment_id'], 'Xendit refund failed webhook.', null, $request);
        }

        return $outcome['result'];
    }
}
