<?php

namespace App\Features\Payments\Support;

final class PaymentStatusMapper
{
    /**
     * Authoritative SALO internal payment_status values.
     *
     * @var array<int, string>
     */
    public const INTERNAL_STATUSES = [
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
     * Map sandbox/internal status strings. Unknown statuses return null (fail-closed).
     */
    public static function mapSandboxStatus(string $status): ?string
    {
        $normalized = strtolower(trim($status));

        return in_array($normalized, self::INTERNAL_STATUSES, true) ? $normalized : null;
    }

    /**
     * Map future Xendit payment/invoice statuses to SALO internal payment_status.
     * Unknown statuses MUST return null and never default to 'paid'.
     */
    public static function mapXenditStatus(string $providerStatus): ?string
    {
        return match (strtoupper(trim($providerStatus))) {
            'PENDING' => 'pending',
            'REQUIRES_ACTION', 'AWAITING_CUSTOMER_ACTION' => 'requires_customer_action',
            'PROCESSING' => 'processing',
            'AUTHORIZED', 'AWAITING_CAPTURE' => 'authorized',
            'PAID', 'SETTLED', 'SUCCEEDED', 'CAPTURED' => 'paid',
            'DECLINED' => 'declined',
            'FAILED' => 'failed',
            'EXPIRED' => 'expired',
            'VOIDED' => 'voided',
            'CANCELLED', 'CANCELED' => 'cancelled',
            default => null,
        };
    }

    /**
     * Map Xendit Refund API statuses into SALO payments.refund_status enum values.
     * Unknown statuses return null (fail-closed; never mapped to 'successful').
     */
    public static function mapXenditRefundStatus(string $providerStatus): ?string
    {
        return match (strtoupper(trim($providerStatus))) {
            'SUCCEEDED' => 'successful',
            'PENDING' => 'submitted',
            'PROCESSING' => 'processing',
            'FAILED' => 'failed',
            default => null,
        };
    }
}
