<?php

namespace App\Features\Payments\Services;

use App\Features\Admin\Services\LedgerService;
use App\Features\Notifications\Services\NotificationService;
use App\Support\AuditLogService;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
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
    ) {}

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
                ->where('allocation_type', 'order_refund')
                ->first();

            if (! $allocation || $allocation->order_id === null) {
                throw new ConflictHttpException('Refund allocation record is missing.');
            }

            $orderId = (int) $allocation->order_id;
            $order = DB::table('orders')->where('order_id', $orderId)->first();

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

            $allocatedOrderAmounts = DB::table('payment_allocations')
                ->where('payment_id', $originalPayment->payment_id)
                ->where('allocation_type', 'order_payment')
                ->pluck('amount');

            $totalAllocatedCents = 0;
            foreach ($allocatedOrderAmounts as $amt) {
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
}
