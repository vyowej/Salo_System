<?php

namespace App\Features\Payments\Providers;

use InvalidArgumentException;
use RuntimeException;

class PaymentProviderResolver
{
    public function __construct(
        private readonly SandboxPaymentProvider $sandboxProvider,
    ) {}

    public function resolve(?string $driver = null): PaymentProviderInterface
    {
        $resolved = strtolower(trim((string) ($driver ?? config('salo.payments.driver', 'sandbox'))));

        return match ($resolved) {
            'sandbox' => $this->sandboxProvider,
            'xendit' => throw new RuntimeException('Xendit payment provider is not yet activated (Phase 3).'),
            default => throw new InvalidArgumentException("Unsupported payment driver '{$resolved}'."),
        };
    }
}
