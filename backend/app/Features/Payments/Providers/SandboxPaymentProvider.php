<?php

namespace App\Features\Payments\Providers;

use App\Features\Payments\Support\PaymentStatusMapper;

class SandboxPaymentProvider implements PaymentProviderInterface
{
    public function name(): string
    {
        return 'sandbox';
    }

    public function initiateOnlinePayment(array $payload): array
    {
        $channel = strtolower(trim((string) ($payload['channel'] ?? 'other')));

        return [
            'provider_name' => $this->name(),
            'provider_payment_id' => null,
            'provider_transaction_id' => null,
            'provider_reference' => null,
            'payment_status' => 'requires_customer_action',
            'checkout_url' => null,
            'expires_at' => null,
            'meta' => [
                'channel' => $channel,
                'provider' => $this->name(),
            ],
        ];
    }

    public function mapStatus(string $providerStatus): ?string
    {
        return PaymentStatusMapper::mapSandboxStatus($providerStatus);
    }
}
