<?php

namespace Tests\Feature;

use App\Features\Payments\Providers\PaymentProviderInterface;
use App\Features\Payments\Providers\PaymentProviderResolver;
use App\Features\Payments\Providers\SandboxPaymentProvider;
use App\Features\Payments\Support\PaymentStatusMapper;
use InvalidArgumentException;
use RuntimeException;
use Tests\TestCase;

class PaymentProviderPreparationTest extends TestCase
{
    public function test_resolver_returns_sandbox_provider_and_fails_closed_for_unactivated_or_unknown_drivers(): void
    {
        $resolver = app(PaymentProviderResolver::class);

        config(['salo.payments.driver' => 'sandbox']);
        $provider = $resolver->resolve();
        $this->assertInstanceOf(PaymentProviderInterface::class, $provider);
        $this->assertInstanceOf(SandboxPaymentProvider::class, $provider);
        $this->assertSame('sandbox', $provider->name());

        config(['salo.payments.driver' => 'xendit']);
        $this->expectException(RuntimeException::class);
        $resolver->resolve();
    }

    public function test_resolver_rejects_unknown_driver(): void
    {
        $resolver = app(PaymentProviderResolver::class);

        $this->expectException(InvalidArgumentException::class);
        $resolver->resolve('unknown_gateway');
    }

    public function test_sandbox_provider_initiates_online_payment_metadata_without_fake_checkout_url(): void
    {
        $provider = app(SandboxPaymentProvider::class);

        $prepared = $provider->initiateOnlinePayment([
            'payment_reference' => 'SALO-PAY-TEST-001',
            'channel' => 'gcash',
            'amount' => '250.00',
            'currency' => 'PHP',
        ]);

        $this->assertSame('sandbox', $prepared['provider_name']);
        $this->assertNull($prepared['provider_payment_id']);
        $this->assertNull($prepared['provider_reference']);
        $this->assertNull($prepared['checkout_url']);
        $this->assertNull($prepared['expires_at']);
        $this->assertSame('requires_customer_action', $prepared['payment_status']);
        $this->assertSame('gcash', $prepared['meta']['channel']);
        $this->assertSame('sandbox', $prepared['meta']['provider']);
    }

    public function test_payment_status_mapper_maps_known_statuses_and_rejects_unknown_statuses(): void
    {
        $this->assertSame('paid', PaymentStatusMapper::mapXenditStatus('PAID'));
        $this->assertSame('paid', PaymentStatusMapper::mapXenditStatus('SETTLED'));
        $this->assertSame('paid', PaymentStatusMapper::mapXenditStatus('SUCCEEDED'));
        $this->assertSame('pending', PaymentStatusMapper::mapXenditStatus('PENDING'));
        $this->assertSame('requires_customer_action', PaymentStatusMapper::mapXenditStatus('REQUIRES_ACTION'));
        $this->assertSame('processing', PaymentStatusMapper::mapXenditStatus('PROCESSING'));
        $this->assertSame('authorized', PaymentStatusMapper::mapXenditStatus('AUTHORIZED'));
        $this->assertSame('failed', PaymentStatusMapper::mapXenditStatus('FAILED'));
        $this->assertSame('declined', PaymentStatusMapper::mapXenditStatus('DECLINED'));
        $this->assertSame('expired', PaymentStatusMapper::mapXenditStatus('EXPIRED'));
        $this->assertSame('voided', PaymentStatusMapper::mapXenditStatus('VOIDED'));
        $this->assertSame('cancelled', PaymentStatusMapper::mapXenditStatus('CANCELLED'));

        // Unknown statuses must fail closed (never map to 'paid')
        $this->assertNull(PaymentStatusMapper::mapXenditStatus('MYSTERY_STATUS'));
        $this->assertNull(PaymentStatusMapper::mapSandboxStatus('MYSTERY_STATUS'));
        $this->assertSame('paid', app(SandboxPaymentProvider::class)->mapStatus('paid'));
        $this->assertNull(app(SandboxPaymentProvider::class)->mapStatus('unknown'));
    }

    public function test_payment_and_xendit_configuration_keys_are_registered(): void
    {
        $this->assertContains('sandbox', config('salo.payments.supported_drivers'));
        $this->assertContains('xendit', config('salo.payments.supported_drivers'));
        $this->assertIsArray(config('services.xendit'));
        $this->assertArrayHasKey('secret_key', config('services.xendit'));
        $this->assertArrayHasKey('public_key', config('services.xendit'));
        $this->assertArrayHasKey('webhook_token', config('services.xendit'));
        $this->assertArrayHasKey('mode', config('services.xendit'));
        $this->assertArrayHasKey('base_url', config('services.xendit'));
        $this->assertArrayHasKey('timeout_seconds', config('services.xendit'));
    }
}
