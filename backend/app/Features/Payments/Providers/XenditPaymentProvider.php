<?php

namespace App\Features\Payments\Providers;

use App\Features\Payments\Exceptions\XenditTimeoutException;
use App\Features\Payments\Support\PaymentStatusMapper;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use RuntimeException;

class XenditPaymentProvider implements PaymentProviderInterface
{
    private const APPROVED_TEST_BASE_URL = 'https://api.xendit.co';

    public function name(): string
    {
        return 'xendit';
    }

    /**
     * Fail closed unless explicit Xendit Test Mode configuration is verified.
     */
    public function assertTestModeReady(): void
    {
        if (strtolower(trim((string) config('salo.payments.driver', ''))) !== 'xendit') {
            throw new RuntimeException('Xendit payment driver is not active.');
        }

        if (app()->environment('production')) {
            throw new RuntimeException('Xendit Test Mode is disabled in production.');
        }

        if (strtolower(trim((string) config('services.xendit.mode', ''))) !== 'test') {
            throw new RuntimeException('Xendit must be explicitly configured in test mode.');
        }

        $baseUrl = rtrim(trim((string) config('services.xendit.base_url', '')), '/');
        if ($baseUrl !== self::APPROVED_TEST_BASE_URL) {
            throw new RuntimeException('Xendit API base URL is not an approved Test Mode endpoint.');
        }

        $secretKey = trim((string) config('services.xendit.secret_key', ''));
        if (
            $secretKey === ''
            || ! str_starts_with($secretKey, 'xnd_development_')
            || str_starts_with($secretKey, 'xnd_production_')
        ) {
            throw new RuntimeException('Xendit Test Mode secret key is missing or invalid.');
        }
    }

    /**
     * Map SALO online payment channels to Xendit Invoice v2 payment_methods.
     *
     * @return array<int, string>
     */
    public function mapChannelToXenditMethods(string $channel): array
    {
        return match (strtolower(trim($channel))) {
            'gcash' => ['GCASH'],
            'maya' => ['PAYMAYA'],
            'card' => ['CREDIT_CARD'],
            default => throw new InvalidArgumentException("Payment channel '{$channel}' is not supported by Xendit Test Mode."),
        };
    }

    public function initiateOnlinePayment(array $payload): array
    {
        $this->assertTestModeReady();

        $channel = strtolower(trim((string) ($payload['channel'] ?? '')));
        $paymentMethods = $this->mapChannelToXenditMethods($channel);

        $currency = strtoupper(trim((string) ($payload['currency'] ?? 'PHP')));
        if ($currency !== 'PHP') {
            throw new InvalidArgumentException('Only PHP currency is supported.');
        }

        $amount = round((float) ($payload['amount'] ?? 0), 2);
        if ($amount <= 0) {
            throw new InvalidArgumentException('Payment amount must be greater than zero.');
        }

        $paymentReference = trim((string) ($payload['payment_reference'] ?? ''));
        if ($paymentReference === '') {
            throw new InvalidArgumentException('Payment reference is required.');
        }

        $requestBody = [
            'external_id' => $paymentReference,
            'amount' => $amount,
            'currency' => 'PHP',
            'invoice_duration' => max(300, (int) config('salo.payments.expiry_seconds', 3600)),
            'payment_methods' => $paymentMethods,
            'description' => (string) ($payload['description'] ?? "SALO Order Payment ({$paymentReference})"),
        ];

        $payerEmail = trim((string) ($payload['payer_email'] ?? ''));
        if ($payerEmail !== '' && filter_var($payerEmail, FILTER_VALIDATE_EMAIL)) {
            $requestBody['payer_email'] = $payerEmail;
        }

        $successUrl = trim((string) config('services.xendit.success_redirect_url', ''));
        if ($successUrl !== '') {
            $requestBody['success_redirect_url'] = $successUrl;
        }

        $failureUrl = trim((string) config('services.xendit.failure_redirect_url', ''));
        if ($failureUrl !== '') {
            $requestBody['failure_redirect_url'] = $failureUrl;
        }

        $secretKey = trim((string) config('services.xendit.secret_key', ''));
        $timeout = max(3, (int) config('services.xendit.timeout_seconds', 15));

        try {
            $response = Http::withBasicAuth($secretKey, '')
                ->timeout($timeout)
                ->acceptJson()
                ->withHeaders([
                    'Idempotency-Key' => 'salo-inv-'.$paymentReference,
                ])
                ->post(self::APPROVED_TEST_BASE_URL.'/v2/invoices', $requestBody);
        } catch (ConnectionException $e) {
            throw new XenditTimeoutException('Xendit Test Mode API request timed out or connection was interrupted.', 0, $e);
        } catch (\Throwable $e) {
            throw new RuntimeException('Unable to reach Xendit Test Mode API.', 0, $e);
        }

        if (! $response->successful()) {
            throw new RuntimeException("Xendit payment initiation failed (HTTP {$response->status()}).");
        }

        $data = $response->json();
        if (! is_array($data)) {
            throw new RuntimeException('Xendit returned an invalid JSON response.');
        }

        $invoiceId = trim((string) ($data['id'] ?? ''));
        $rawInvoiceUrl = trim((string) ($data['invoice_url'] ?? ''));
        $rawStatus = strtoupper(trim((string) ($data['status'] ?? 'PENDING')));

        if ($invoiceId === '' || $rawInvoiceUrl === '') {
            throw new RuntimeException('Xendit response is missing required invoice identifiers.');
        }

        $invoiceUrl = $this->validateCheckoutUrl($rawInvoiceUrl);

        // Initiation must never mark a payment as paid synchronously.
        $mappedStatus = $this->mapStatus($rawStatus);
        if ($mappedStatus === null || $mappedStatus === 'paid') {
            $mappedStatus = 'requires_customer_action';
        }

        return [
            'provider_name' => $this->name(),
            'provider_payment_id' => $invoiceId,
            'provider_transaction_id' => null,
            'provider_reference' => $invoiceId,
            'payment_status' => $mappedStatus === 'pending' ? 'requires_customer_action' : $mappedStatus,
            'checkout_url' => $invoiceUrl,
            'expires_at' => isset($data['expiry_date']) ? (string) $data['expiry_date'] : null,
            'meta' => [
                'channel' => $channel,
                'provider' => $this->name(),
                'provider_payment_id' => $invoiceId,
                'provider_reference' => $invoiceId,
                'checkout_url' => $invoiceUrl,
                'expires_at' => isset($data['expiry_date']) ? (string) $data['expiry_date'] : null,
                'xendit_status' => $rawStatus,
            ],
        ];
    }

    public function validateCheckoutUrl(string $url): string
    {
        $trimmed = trim($url);
        if ($trimmed === '' || filter_var($trimmed, FILTER_VALIDATE_URL) === false) {
            throw new RuntimeException('Xendit returned an invalid checkout URL.');
        }

        $parts = parse_url($trimmed);
        if (! is_array($parts)) {
            throw new RuntimeException('Xendit checkout URL could not be parsed.');
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        if ($scheme !== 'https') {
            throw new RuntimeException('Xendit checkout URL must use HTTPS.');
        }

        if (isset($parts['user']) || isset($parts['pass'])) {
            throw new RuntimeException('Xendit checkout URL must not contain embedded credentials.');
        }

        $host = strtolower((string) ($parts['host'] ?? ''));
        if (
            $host === ''
            || $host === 'localhost'
            || filter_var($host, FILTER_VALIDATE_IP) !== false
            || ($host !== 'xendit.co' && ! str_ends_with($host, '.xendit.co'))
        ) {
            throw new RuntimeException('Xendit checkout URL host is not an approved Xendit domain.');
        }

        return $trimmed;
    }

    public function mapStatus(string $providerStatus): ?string
    {
        return PaymentStatusMapper::mapXenditStatus($providerStatus);
    }
}
