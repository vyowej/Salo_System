<?php

namespace App\Features\Payments\Services;

use App\Features\Admin\Services\LedgerService;
use App\Features\Notifications\Services\NotificationService;
use App\Support\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RefundService
{
    public function __construct(
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
        private readonly LedgerService $ledgerService,
    ) {}

    /**
     * Issue a refund for a single order if it was paid via an online payment method.
     * Safe and idempotent to call inside an existing DB::transaction().
     *
     * @return array<string, mixed>|null
     */
    public function refundOrderIfPaid(
        int $orderId,
        int $actorUserId,
        string $reason,
        ?Request $request = null,
    ): ?array {
        $order = DB::table('orders')->where('order_id', $orderId)->first();
        if (! $order || (float) $order->total_amount <= 0) {
            return null;
        }

        // Check if an order_refund allocation already exists for this order.
        $existingRefund = DB::table('payment_allocations as pa')
            ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
            ->where('pa.order_id', $orderId)
            ->where('pa.allocation_type', 'order_refund')
            ->where('p.payment_type', 'refund')
            ->first(['p.*']);

        if ($existingRefund) {
            return [
                'refund_payment_id' => (int) $existingRefund->payment_id,
                'payment_reference' => $existingRefund->payment_reference,
                'refund_status' => $existingRefund->refund_status,
                'amount' => (float) $existingRefund->amount,
            ];
        }

        // Find the original order payment.
        $originalPayment = DB::table('payment_allocations as pa')
            ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
            ->where('pa.order_id', $orderId)
            ->where('pa.allocation_type', 'order_payment')
            ->where('p.payment_type', 'payment')
            ->lockForUpdate()
            ->first(['p.*']);

        if (! $originalPayment || $originalPayment->payment_method === 'cash') {
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

        $refundAmount = number_format((float) $order->total_amount, 2, '.', '');
        $refundRef = 'SALO-REF-'.now()->format('Ymd').'-'.strtoupper(Str::random(6));
        $meta = [
            'reason' => mb_substr($reason, 0, 255),
            'original_payment_reference' => $originalPayment->payment_reference,
            'order_reference' => $order->order_reference,
        ];

        $refundPaymentId = (int) DB::table('payments')->insertGetId([
            'payment_reference' => $refundRef,
            'checkout_id' => $originalPayment->checkout_id,
            'customer_id' => $originalPayment->customer_id,
            'payment_method' => $originalPayment->payment_method,
            'payment_type' => 'refund',
            'payment_status' => 'pending',
            'refund_status' => 'successful',
            'amount' => $refundAmount,
            'related_payment_id' => $originalPayment->payment_id,
            'provider_response' => json_encode($meta, JSON_UNESCAPED_SLASHES),
            'paid_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('payment_allocations')->insert([
            'payment_id' => $refundPaymentId,
            'order_id' => $orderId,
            'allocation_type' => 'order_refund',
            'amount' => $refundAmount,
            'created_at' => $now,
        ]);

        // Determine if original payment is now fully refunded or partially refunded.
        $totalAllocatedPaid = (float) DB::table('payment_allocations')
            ->where('payment_id', $originalPayment->payment_id)
            ->where('allocation_type', 'order_payment')
            ->sum('amount');
        $totalRefunded = (float) DB::table('payment_allocations as pa')
            ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
            ->where('p.related_payment_id', $originalPayment->payment_id)
            ->where('p.payment_type', 'refund')
            ->sum('pa.amount');

        $nextOriginalStatus = $totalRefunded + 0.009 >= min((float) $originalPayment->amount, $totalAllocatedPaid)
            ? 'refunded'
            : 'partially_refunded';

        DB::table('payments')
            ->where('payment_id', $originalPayment->payment_id)
            ->update([
                'payment_status' => $nextOriginalStatus,
                'updated_at' => $now,
            ]);

        $this->ledgerService->postOrderRefund(
            refundPaymentId: $refundPaymentId,
            orderId: $orderId,
            checkoutId: (int) $order->checkout_id,
            customerUserId: (int) $order->customer_id,
            amount: (float) $refundAmount,
            postedBy: $actorUserId,
        );

        $this->auditLogService->record(
            actorUserId: $actorUserId,
            action: 'order_payment_refunded',
            entityType: 'payments',
            entityId: $refundPaymentId,
            oldValues: ['payment_status' => $originalPayment->payment_status],
            newValues: [
                'refund_reference' => $refundRef,
                'refund_status' => 'successful',
                'amount' => $refundAmount,
                'original_payment_status' => $nextOriginalStatus,
            ],
            reason: $reason,
            request: $request,
        );

        $this->notificationService->notifyUser(
            userId: (int) $order->customer_id,
            workspace: 'customer',
            type: 'payment_refunded',
            title: "Refund processed for {$order->order_reference}",
            body: 'PHP '.number_format((float) $refundAmount, 2)." has been refunded ({$refundRef}).",
            relatedEntityType: 'order',
            relatedEntityId: $orderId,
        );

        return [
            'refund_payment_id' => $refundPaymentId,
            'payment_reference' => $refundRef,
            'refund_status' => 'successful',
            'amount' => (float) $refundAmount,
        ];
    }
}
