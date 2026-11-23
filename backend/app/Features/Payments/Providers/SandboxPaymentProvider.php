<?php

namespace App\Features\Payments\Providers;

use App\Features\Payments\Support\PaymentStatusMapper;
use Illuminate\Support\Str;

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

    public function refundPayment(array $payload): array
    {
        return [
            'provider_name' => $this->name(),
            'provider_refund_id' => 'SBX-RFD-'.strtoupper(Str::random(8)),
            'refund_status' => 'successful',
            'meta' => [
                'provider' => $this->name(),
                'reference_id' => (string) ($payload['refund_reference'] ?? ''),
            ],
        ];
    }
}
