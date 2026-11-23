<?php

namespace App\Features\Payments\Providers;

interface PaymentProviderInterface
{
    public function name(): string;

    /**
     * Prepare/initiate an online payment for a checkout.
     *
     * @param  array<string, mixed>  $payload
     * @return array{
     *     provider_name: string,
     *     provider_payment_id: ?string,
     *     provider_transaction_id: ?string,
     *     provider_reference: ?string,
     *     payment_status: string,
     *     checkout_url: ?string,
     *     expires_at: ?string,
     *     meta: array<string, mixed>
     * }
     */
    public function initiateOnlinePayment(array $payload): array;

    /**
     * Map a provider-reported status into an internal SALO payment_status.
     * Returns null when the provider status is unknown (fail-closed).
     */
    public function mapStatus(string $providerStatus): ?string;

    /**
     * Submit a refund request for a previously settled online payment.
     *
     * @param  array<string, mixed>  $payload
     * @return array{
     *     provider_name: string,
     *     provider_refund_id: ?string,
     *     refund_status: string,
     *     meta: array<string, mixed>
     * }
     */
    public function refundPayment(array $payload): array;
}
