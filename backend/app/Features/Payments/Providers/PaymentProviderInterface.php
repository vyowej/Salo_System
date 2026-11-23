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
}
