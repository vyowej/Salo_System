<?php

namespace App\Features\Payments\Providers;

use InvalidArgumentException;
use RuntimeException;

class PaymentProviderResolver
{
    public function __construct(
        private readonly SandboxPaymentProvider $sandboxProvider,
        private readonly XenditPaymentProvider $xenditProvider,
    ) {}

    public function resolve(?string $driver = null): PaymentProviderInterface
    {
        $resolved = strtolower(trim((string) ($driver ?? config('salo.payments.driver', 'sandbox'))));

        return match ($resolved) {
            'sandbox' => $this->sandboxProvider,
            'xendit' => $this->resolveXenditProvider(),
            default => throw new InvalidArgumentException("Unsupported payment driver '{$resolved}'."),
        };
    }

    private function resolveXenditProvider(): XenditPaymentProvider
    {
        $this->xenditProvider->assertTestModeReady();

        return $this->xenditProvider;
    }
}
