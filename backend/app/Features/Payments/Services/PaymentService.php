<?php

namespace App\Features\Payments\Services;

use App\Features\Admin\Services\LedgerService;
use App\Features\Notifications\Services\NotificationService;
use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Features\Payments\Exceptions\XenditTimeoutException;
use App\Features\Payments\Providers\PaymentProviderInterface;
use App\Features\Payments\Providers\PaymentProviderResolver;
use App\Features\Payments\Support\PaymentStatusMapper;
use App\Models\User;
use App\Support\AuditLogService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class PaymentService
{
    public function __construct(
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
        private readonly LedgerService $ledgerService,
        private readonly PaymentProviderResolver $providerResolver,
    ) {}

    public function activeProvider(): PaymentProviderInterface
    {
        return $this->providerResolver->resolve();
    }

    /**
     * Prepare provider-specific initiation metadata for an online checkout payment.
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
    public function prepareOnlinePaymentPayload(array $payload): array
    {
        return $this->activeProvider()->initiateOnlinePayment($payload);
    }

    public static function mapChannelToDbMethod(string $channel): string
    {
        return match (strtolower(trim($channel))) {
            'cod', 'cash' => 'cash',
            'gcash', 'maya', 'e_wallet' => 'e_wallet',
            'card' => 'card',
            'online_banking' => 'online_banking',
            default => 'other',
        };
    }

    public function assertSandboxEndpointAllowed(): void
    {
        $driver = strtolower(trim((string) config('salo.payments.driver', '')));
        $sandboxEnabled = (bool) config('salo.payments.sandbox_enabled', false);
        $allowedEnvs = config('salo.payments.sandbox_allowed_environments', ['local', 'testing']);

        if (
            $driver !== 'sandbox'
            || ! $sandboxEnabled
            || ! is_array($allowedEnvs)
            || ! app()->environment($allowedEnvs)
        ) {
            throw new AccessDeniedHttpException('Sandbox payment endpoints are disabled in this environment.');
        }
    }

    public function getCustomerPayment(User $user, int $paymentId): array
    {
        $payment = DB::table('payments')
            ->where('payment_id', $paymentId)
            ->where('customer_id', $user->user_id)
            ->first();

        if (! $payment) {
            throw new NotFoundHttpException('Payment not found.');
        }

        return $this->formatPayment($payment);
    }

    /**
     * Confirm an online payment (sandbox / customer completion or webhook).
     *
     * @return array<string, mixed>
     */
    public function confirmOnlinePayment(
        int $paymentId,
        ?User $customer = null,
        ?string $providerReference = null,
        ?string $eventKey = null,
        ?Request $request = null,
        ?string $providerName = null,
    ): array {
        $result = DB::transaction(function () use ($paymentId, $customer, $providerReference, $eventKey, $request, $providerName): array {
            $query = DB::table('payments')->where('payment_id', $paymentId)->lockForUpdate();
            if ($customer !== null) {
                $query->where('customer_id', $customer->user_id);
            }
            $payment = $query->first();

            if (! $payment) {
                throw new NotFoundHttpException('Payment not found.');
            }

            if ($payment->payment_type !== 'payment' || $payment->payment_method === 'cash') {
                throw new ConflictHttpException('Only online payments can be confirmed via this endpoint.');
            }

            if ($payment->payment_status === 'paid') {
                return $this->formatPayment($payment);
            }

            if (! in_array($payment->payment_status, ['pending', 'requires_customer_action', 'processing', 'authorized'], true)) {
                throw new ConflictHttpException("Payment cannot be confirmed from status '{$payment->payment_status}'.");
            }

            $now = now();
            $meta = $this->decodeMeta($payment->provider_response);
            $channel = (string) ($meta['channel'] ?? $payment->payment_method);
            $resolvedRef = $providerReference ?: ('SBX-'.strtoupper(Str::random(10)));
            $meta['provider_reference'] = $resolvedRef;
            $meta['confirmed_at'] = $now->toIso8601String();
            if ($providerName !== null) {
                $meta['provider'] = $providerName;
                $meta['provider_payment_id'] = $resolvedRef;
                $meta['initiation_state'] = 'confirmed';
            }

            $paymentUpdates = [
                'payment_status' => 'paid',
                'paid_at' => $now,
                'provider_response' => json_encode($meta, JSON_UNESCAPED_SLASHES),
                'updated_at' => $now,
            ];

            if ($providerName !== null) {
                if (Schema::hasColumn('payments', 'provider_name')) {
                    $paymentUpdates['provider_name'] = $providerName;
                }
                if (Schema::hasColumn('payments', 'provider_payment_id')) {
                    $paymentUpdates['provider_payment_id'] = $resolvedRef;
                }
            }

            DB::table('payments')
                ->where('payment_id', $paymentId)
                ->update($paymentUpdates);

            if ($payment->checkout_id !== null) {
                DB::table('checkouts')
                    ->where('checkout_id', $payment->checkout_id)
                    ->where('checkout_status', 'pending')
                    ->update([
                        'checkout_status' => 'paid',
                        'updated_at' => $now,
                    ]);
            }

            $resolvedEventKey = $eventKey ?: "confirm_{$paymentId}";
            $eventProviderName = str_starts_with($resolvedEventKey, 'xendit_') ? 'xendit' : $channel;
            DB::table('payment_events')->insertOrIgnore([
                'provider_name' => $eventProviderName,
                'event_key' => $resolvedEventKey,
                'payment_id' => $paymentId,
                'payload' => json_encode(['status' => 'paid', 'provider_reference' => $resolvedRef]),
                'processing_status' => 'processed',
                'processed_at' => $now,
                'created_at' => $now,
            ]);

            if ($payment->checkout_id !== null) {
                $this->ledgerService->postOnlinePaymentConfirmed(
                    paymentId: $paymentId,
                    checkoutId: (int) $payment->checkout_id,
                    customerUserId: (int) $payment->customer_id,
                    amount: (float) $payment->amount,
                    providerReference: $resolvedRef,
                    postedBy: $customer?->user_id ? (int) $customer->user_id : null,
                );
            }

            $this->auditLogService->record(
                actorUserId: $customer?->user_id ? (int) $customer->user_id : (int) $payment->customer_id,
                action: 'online_payment_confirmed',
                entityType: 'payments',
                entityId: $paymentId,
                oldValues: ['payment_status' => $payment->payment_status],
                newValues: ['payment_status' => 'paid', 'provider_reference' => $resolvedRef],
                request: $request,
            );

            $this->notificationService->notifyUser(
                userId: (int) $payment->customer_id,
                workspace: 'customer',
                type: 'payment_confirmed',
                title: 'Payment confirmed',
                body: "Your {$channel} payment ({$payment->payment_reference}) of PHP ".number_format((float) $payment->amount, 2).' has been confirmed.',
                relatedEntityType: 'payment',
                relatedEntityId: $paymentId,
            );

            $this->notifyRestaurantsOfPaidOnlineOrders($paymentId, (int) $payment->customer_id);

            $fresh = DB::table('payments')->where('payment_id', $paymentId)->first();

            return $this->formatPayment($fresh);
        });

        return $result;
    }

    /**
     * Mark an online payment as failed.
     *
     * @return array<string, mixed>
     */
    public function failOnlinePayment(
        int $paymentId,
        ?User $customer = null,
        ?string $reason = null,
        ?string $eventKey = null,
        ?Request $request = null,
    ): array {
        return DB::transaction(function () use ($paymentId, $customer, $reason, $eventKey, $request): array {
            $query = DB::table('payments')->where('payment_id', $paymentId)->lockForUpdate();
            if ($customer !== null) {
                $query->where('customer_id', $customer->user_id);
            }
            $payment = $query->first();

            if (! $payment) {
                throw new NotFoundHttpException('Payment not found.');
            }

            if ($payment->payment_type !== 'payment' || $payment->payment_method === 'cash') {
                throw new ConflictHttpException('Only online payments can be marked failed via this endpoint.');
            }

            if ($payment->payment_status === 'failed') {
                return $this->formatPayment($payment);
            }

            if (! in_array($payment->payment_status, ['pending', 'requires_customer_action', 'processing', 'authorized'], true)) {
                throw new ConflictHttpException("Payment cannot be marked failed from status '{$payment->payment_status}'.");
            }

            $now = now();
            $meta = $this->decodeMeta($payment->provider_response);
            $channel = (string) ($meta['channel'] ?? $payment->payment_method);
            $meta['failure_reason'] = $reason ?: 'Customer cancelled or payment declined.';

            DB::table('payments')
                ->where('payment_id', $paymentId)
                ->update([
                    'payment_status' => 'failed',
                    'provider_response' => json_encode($meta, JSON_UNESCAPED_SLASHES),
                    'updated_at' => $now,
                ]);

            $resolvedEventKey = $eventKey ?: "fail_{$paymentId}";
            DB::table('payment_events')->insertOrIgnore([
                'provider_name' => $channel,
                'event_key' => $resolvedEventKey,
                'payment_id' => $paymentId,
                'payload' => json_encode(['status' => 'failed', 'reason' => $meta['failure_reason']]),
                'processing_status' => 'processed',
                'processed_at' => $now,
                'created_at' => $now,
            ]);

            $this->auditLogService->record(
                actorUserId: $customer?->user_id ? (int) $customer->user_id : (int) $payment->customer_id,
                action: 'online_payment_failed',
                entityType: 'payments',
                entityId: $paymentId,
                oldValues: ['payment_status' => $payment->payment_status],
                newValues: ['payment_status' => 'failed'],
                reason: $meta['failure_reason'],
                request: $request,
            );

            $fresh = DB::table('payments')->where('payment_id', $paymentId)->first();

            return $this->formatPayment($fresh);
        });
    }

    /**
     * Initiate a provider payment (e.g. Xendit Test Mode) for an existing SALO online payment record.
     * Protected by an atomic per-payment cache lock, short DB state checks, and safe timeout tracking.
     *
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    public function initiateProviderPayment(int $paymentId, array $context = [], ?User $customer = null): array
    {
        $lock = Cache::lock("payment_init_{$paymentId}", 30);
        if (! $lock->get()) {
            throw new ConflictHttpException('Payment initiation is already in progress. Please wait and try again.');
        }

        try {
            $precheck = DB::transaction(function () use ($paymentId, $customer): array {
                $query = DB::table('payments')->where('payment_id', $paymentId)->lockForUpdate();
                if ($customer !== null) {
                    $query->where('customer_id', $customer->user_id);
                }
                $payment = $query->first();

                if (! $payment) {
                    throw new NotFoundHttpException('Payment not found.');
                }

                if ($payment->payment_type !== 'payment' || $payment->payment_method === 'cash') {
                    throw new ConflictHttpException('Only online payments can be initiated with an online provider.');
                }

                $meta = $this->decodeMeta($payment->provider_response ?? null);
                $existingUrl = $payment->checkout_url ?? ($meta['checkout_url'] ?? null);
                $existingProviderId = $payment->provider_payment_id ?? ($meta['provider_payment_id'] ?? null);

                if ($existingUrl && $existingProviderId) {
                    return ['already_ready' => true, 'formatted' => $this->formatPayment($payment)];
                }

                if (! in_array($payment->payment_status, ['pending', 'requires_customer_action'], true)) {
                    throw new ConflictHttpException("Payment cannot be initiated from status '{$payment->payment_status}'.");
                }

                if (($meta['initiation_state'] ?? null) === 'uncertain' && ! empty($meta['initiation_attempted_at'])) {
                    $attemptedAt = Carbon::parse((string) $meta['initiation_attempted_at']);
                    if ($attemptedAt->diffInSeconds(now()) < 60) {
                        throw new ConflictHttpException(
                            'Previous payment initiation timed out and its status is uncertain. Please refresh payment status or wait a minute before retrying.'
                        );
                    }
                }

                return [
                    'already_ready' => false,
                    'payment' => $payment,
                    'meta' => $meta,
                ];
            });

            if ($precheck['already_ready']) {
                return $precheck['formatted'];
            }

            $payment = $precheck['payment'];
            $meta = $precheck['meta'];
            $provider = $this->activeProvider();
            $channel = (string) ($payment->payment_channel ?? $meta['channel'] ?? $payment->payment_method);

            try {
                $initiated = $provider->initiateOnlinePayment([
                    'payment_id' => (int) $payment->payment_id,
                    'payment_reference' => $payment->payment_reference,
                    'checkout_id' => $payment->checkout_id !== null ? (int) $payment->checkout_id : null,
                    'customer_id' => (int) $payment->customer_id,
                    'channel' => $channel,
                    'amount' => (float) $payment->amount,
                    'currency' => 'PHP',
                    'payer_email' => $context['payer_email'] ?? null,
                ]);
            } catch (XenditTimeoutException $e) {
                $this->recordInitiationOutcome($paymentId, 'uncertain', $payment->payment_reference);
                throw new HttpException(504, 'Payment initiation timed out; outcome is uncertain. Please refresh payment status before retrying.', $e);
            } catch (\Throwable $e) {
                $this->recordInitiationOutcome($paymentId, 'failed', $payment->payment_reference);
                throw $e;
            }

            return DB::transaction(function () use ($paymentId, $initiated): array {
                $locked = DB::table('payments')->where('payment_id', $paymentId)->lockForUpdate()->first();
                if (! $locked) {
                    throw new NotFoundHttpException('Payment not found.');
                }

                $lockedMeta = $this->decodeMeta($locked->provider_response ?? null);
                $alreadyUrl = $locked->checkout_url ?? ($lockedMeta['checkout_url'] ?? null);
                $alreadyId = $locked->provider_payment_id ?? ($lockedMeta['provider_payment_id'] ?? null);
                if ($alreadyUrl && $alreadyId) {
                    return $this->formatPayment($locked);
                }

                if (! in_array($locked->payment_status, ['pending', 'requires_customer_action'], true)) {
                    return $this->formatPayment($locked);
                }

                $now = now();
                $mergedMeta = array_merge($lockedMeta, $initiated['meta'], [
                    'initiation_state' => 'ready',
                    'initiation_idempotency_key' => 'salo-inv-'.$locked->payment_reference,
                ]);
                $updates = [
                    'payment_status' => $initiated['payment_status'],
                    'provider_response' => json_encode($mergedMeta, JSON_UNESCAPED_SLASHES),
                    'updated_at' => $now,
                ];

                if (Schema::hasColumn('payments', 'provider_name')) {
                    $updates['provider_name'] = $initiated['provider_name'];
                }
                if (Schema::hasColumn('payments', 'payment_channel')) {
                    $updates['payment_channel'] = $lockedMeta['channel'] ?? ($initiated['meta']['channel'] ?? null);
                }
                if (Schema::hasColumn('payments', 'provider_payment_id')) {
                    $updates['provider_payment_id'] = $initiated['provider_payment_id'];
                }
                if (Schema::hasColumn('payments', 'checkout_url')) {
                    $updates['checkout_url'] = $initiated['checkout_url'];
                }
                if (Schema::hasColumn('payments', 'expires_at') && $initiated['expires_at']) {
                    $updates['expires_at'] = Carbon::parse($initiated['expires_at'])->utc();
                }

                DB::table('payments')->where('payment_id', $paymentId)->update($updates);

                $fresh = DB::table('payments')->where('payment_id', $paymentId)->first();

                return $this->formatPayment($fresh);
            });
        } finally {
            $lock->release();
        }
    }

    private function recordInitiationOutcome(int $paymentId, string $state, string $paymentReference): void
    {
        DB::transaction(function () use ($paymentId, $state, $paymentReference): void {
            $locked = DB::table('payments')->where('payment_id', $paymentId)->lockForUpdate()->first();
            if (! $locked || ! in_array($locked->payment_status, ['pending', 'requires_customer_action'], true)) {
                return;
            }

            $meta = $this->decodeMeta($locked->provider_response ?? null);
            $meta['initiation_state'] = $state;
            $meta['initiation_attempted_at'] = now()->toIso8601String();
            $meta['initiation_idempotency_key'] = 'salo-inv-'.$paymentReference;

            DB::table('payments')->where('payment_id', $paymentId)->update([
                'provider_response' => json_encode($meta, JSON_UNESCAPED_SLASHES),
                'updated_at' => now(),
            ]);
        });
    }

    /**
     * Handle a verified Xendit Test Mode invoice webhook callback.
     *
     * @return array<string, mixed>
     */
    public function handleXenditWebhook(Request $request): array
    {
        if (
            strtolower(trim((string) config('salo.payments.driver', ''))) !== 'xendit'
            || app()->environment('production')
            || strtolower(trim((string) config('services.xendit.mode', ''))) !== 'test'
        ) {
            throw new AccessDeniedHttpException('Xendit Test Mode webhook is disabled in this environment.');
        }

        $expectedToken = trim((string) config('services.xendit.webhook_token', ''));
        $providedToken = trim((string) $request->header('x-callback-token', ''));

        if ($expectedToken === '' || $providedToken === '' || ! hash_equals($expectedToken, $providedToken)) {
            throw new AccessDeniedHttpException('Invalid Xendit callback verification token.');
        }

        $validated = $request->validate([
            'id' => ['required', 'string', 'max:120'],
            'external_id' => ['required', 'string', 'max:100'],
            'status' => ['required', 'string', 'max:50'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'currency' => ['required', 'string', 'size:3'],
            'payment_method' => ['nullable', 'string', 'max:50'],
            'payment_channel' => ['nullable', 'string', 'max:50'],
        ]);

        $rawStatus = strtoupper(trim((string) $validated['status']));
        $mappedStatus = PaymentStatusMapper::mapXenditStatus($rawStatus);
        if ($mappedStatus === null) {
            throw ValidationException::withMessages([
                'status' => ['Unsupported Xendit payment status.'],
            ]);
        }

        $invoiceId = trim((string) $validated['id']);
        $externalId = trim((string) $validated['external_id']);
        $currency = strtoupper(trim((string) $validated['currency']));
        $callbackAmountCents = (int) round(((float) $validated['amount']) * 100);
        $eventKey = "xendit_{$invoiceId}_{$rawStatus}";

        if ($currency !== 'PHP') {
            throw ValidationException::withMessages([
                'currency' => ['Unsupported callback currency.'],
            ]);
        }

        $confirmedPaymentId = DB::transaction(function () use ($externalId, $invoiceId, $callbackAmountCents, $mappedStatus, $rawStatus, $eventKey, $validated, $request): int|array {
            $locked = DB::table('payments')->where('payment_reference', $externalId)->lockForUpdate()->first();
            if (! $locked) {
                throw new NotFoundHttpException('Payment not found for external_id.');
            }

            if ($locked->payment_type !== 'payment' || $locked->payment_method === 'cash') {
                throw new ConflictHttpException('Webhook target is not an online payment.');
            }

            $lockedMeta = $this->decodeMeta($locked->provider_response ?? null);
            $storedProvider = $locked->provider_name ?? ($lockedMeta['provider'] ?? null);
            if ($storedProvider !== null && $storedProvider !== '' && $storedProvider !== 'xendit') {
                throw new ConflictHttpException('Webhook target does not belong to the Xendit provider.');
            }

            $expectedAmountCents = (int) round(((float) $locked->amount) * 100);
            if ($callbackAmountCents !== $expectedAmountCents) {
                throw ValidationException::withMessages([
                    'amount' => ['Callback amount does not match payment amount.'],
                ]);
            }

            $storedProviderId = $locked->provider_payment_id ?? ($lockedMeta['provider_payment_id'] ?? null);
            if ($storedProviderId !== null && $storedProviderId !== '' && $storedProviderId !== $invoiceId) {
                throw ValidationException::withMessages([
                    'id' => ['Callback invoice ID does not match stored provider payment ID.'],
                ]);
            }

            if ($mappedStatus === 'paid') {
                return (int) $locked->payment_id;
            }

            $now = now();
            $safeEventPayload = json_encode([
                'status' => $rawStatus,
                'mapped_status' => $mappedStatus,
                'provider_payment_id' => $invoiceId,
                'external_id' => $locked->payment_reference,
                'payment_channel' => $validated['payment_channel'] ?? ($validated['payment_method'] ?? null),
            ], JSON_UNESCAPED_SLASHES);

            // Never overwrite an already-paid, refunded, or terminal payment with a failure/expired callback.
            if (in_array($locked->payment_status, ['paid', 'partially_refunded', 'refunded', 'cancelled'], true) || $locked->payment_status === $mappedStatus) {
                DB::table('payment_events')->insertOrIgnore([
                    'provider_name' => 'xendit',
                    'event_key' => $eventKey,
                    'payment_id' => (int) $locked->payment_id,
                    'payload' => $safeEventPayload,
                    'processing_status' => 'ignored',
                    'processed_at' => $now,
                    'created_at' => $now,
                ]);

                return $this->formatPayment($locked);
            }

            if (in_array($mappedStatus, ['failed', 'declined', 'expired', 'voided', 'cancelled'], true)
                && in_array($locked->payment_status, ['pending', 'requires_customer_action', 'processing', 'authorized'], true)) {
                $lockedMeta['provider'] = 'xendit';
                $lockedMeta['provider_payment_id'] = $invoiceId;
                $lockedMeta['provider_reference'] = $invoiceId;
                $lockedMeta['xendit_status'] = $rawStatus;

                $updates = [
                    'payment_status' => $mappedStatus,
                    'provider_response' => json_encode($lockedMeta, JSON_UNESCAPED_SLASHES),
                    'updated_at' => $now,
                ];
                if (Schema::hasColumn('payments', 'provider_name')) {
                    $updates['provider_name'] = 'xendit';
                }
                if (Schema::hasColumn('payments', 'provider_payment_id')) {
                    $updates['provider_payment_id'] = $invoiceId;
                }

                DB::table('payments')
                    ->where('payment_id', $locked->payment_id)
                    ->update($updates);

                $this->auditLogService->record(
                    actorUserId: (int) $locked->customer_id,
                    action: "xendit_payment_{$mappedStatus}",
                    entityType: 'payments',
                    entityId: (int) $locked->payment_id,
                    oldValues: ['payment_status' => $locked->payment_status],
                    newValues: ['payment_status' => $mappedStatus, 'provider_reference' => $invoiceId],
                    request: $request,
                );
            }

            DB::table('payment_events')->insertOrIgnore([
                'provider_name' => 'xendit',
                'event_key' => $eventKey,
                'payment_id' => (int) $locked->payment_id,
                'payload' => $safeEventPayload,
                'processing_status' => 'processed',
                'processed_at' => $now,
                'created_at' => $now,
            ]);

            $fresh = DB::table('payments')->where('payment_id', $locked->payment_id)->first();

            return $this->formatPayment($fresh);
        });

        if (is_array($confirmedPaymentId)) {
            return $confirmedPaymentId;
        }

        return $this->confirmOnlinePayment(
            paymentId: $confirmedPaymentId,
            customer: null,
            providerReference: $invoiceId,
            eventKey: $eventKey,
            request: $request,
            providerName: 'xendit',
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function formatPayment(object $payment): array
    {
        $meta = $this->decodeMeta($payment->provider_response ?? null);

        return [
            'payment_id' => (int) $payment->payment_id,
            'payment_reference' => $payment->payment_reference,
            'checkout_id' => $payment->checkout_id !== null ? (int) $payment->checkout_id : null,
            'payment_method' => $payment->payment_method,
            'payment_channel' => $payment->payment_channel ?? $meta['channel'] ?? ($payment->payment_method === 'cash' ? 'cod' : $payment->payment_method),
            'provider_name' => $payment->provider_name ?? ($meta['provider'] ?? null),
            'payment_type' => $payment->payment_type,
            'payment_status' => $payment->payment_status,
            'initiation_state' => $meta['initiation_state'] ?? null,
            'refund_status' => $payment->refund_status,
            'amount' => (float) $payment->amount,
            'provider_reference' => $payment->provider_payment_id ?? ($meta['provider_reference'] ?? null),
            'checkout_url' => $payment->checkout_url ?? ($meta['checkout_url'] ?? null),
            'expires_at' => OrderTimestampFormatter::toManilaIso($payment->expires_at ?? ($meta['expires_at'] ?? null)),
            'paid_at' => OrderTimestampFormatter::toManilaIso($payment->paid_at),
            'created_at' => OrderTimestampFormatter::toManilaIso($payment->created_at),
        ];
    }

    private function notifyRestaurantsOfPaidOnlineOrders(int $paymentId, int $customerId): void
    {
        $orders = DB::table('payment_allocations as pa')
            ->join('orders as o', 'o.order_id', '=', 'pa.order_id')
            ->where('pa.payment_id', $paymentId)
            ->where('pa.allocation_type', 'order_payment')
            ->whereNotIn('o.order_status', ['cancelled', 'rejected', 'failed'])
            ->select([
                'o.order_id',
                'o.restaurant_id',
                'o.restaurant_name',
                'o.order_reference',
                'o.order_type',
            ])
            ->get();

        if ($orders->isEmpty()) {
            return;
        }

        $firstName = trim((string) (DB::table('users')->where('user_id', $customerId)->value('first_name') ?? '')) ?: 'A customer';

        foreach ($orders as $order) {
            $alreadyNotified = DB::table('notifications')
                ->where('type', 'order_received')
                ->where('related_entity_type', 'order')
                ->where('related_entity_id', $order->order_id)
                ->exists();

            if ($alreadyNotified) {
                continue;
            }

            $recipientIds = $this->notificationService->resolveRestaurantOrderHandlerUserIds((int) $order->restaurant_id);
            if ($recipientIds === []) {
                continue;
            }

            $this->notificationService->notifyUsers(
                userIds: $recipientIds,
                workspace: 'restaurant',
                type: 'order_received',
                title: "New order {$order->order_reference}",
                body: "{$firstName} placed a {$order->order_type} order ({$order->order_reference}) at {$order->restaurant_name}.",
                relatedEntityType: 'order',
                relatedEntityId: (int) $order->order_id,
            );
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeMeta(?string $raw): array
    {
        if (! $raw) {
            return [];
        }
        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : [];
    }
}
