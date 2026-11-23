<?php

namespace App\Features\Payments\Services;

use App\Features\Admin\Services\LedgerService;
use App\Features\Notifications\Services\NotificationService;
use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Features\Payments\Providers\PaymentProviderInterface;
use App\Features\Payments\Providers\PaymentProviderResolver;
use App\Models\User;
use App\Support\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
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
    ): array {
        $result = DB::transaction(function () use ($paymentId, $customer, $providerReference, $eventKey, $request): array {
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

            DB::table('payments')
                ->where('payment_id', $paymentId)
                ->update([
                    'payment_status' => 'paid',
                    'paid_at' => $now,
                    'provider_response' => json_encode($meta, JSON_UNESCAPED_SLASHES),
                    'updated_at' => $now,
                ]);

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
            DB::table('payment_events')->insertOrIgnore([
                'provider_name' => $channel,
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
            'payment_channel' => $meta['channel'] ?? ($payment->payment_method === 'cash' ? 'cod' : $payment->payment_method),
            'payment_type' => $payment->payment_type,
            'payment_status' => $payment->payment_status,
            'refund_status' => $payment->refund_status,
            'amount' => (float) $payment->amount,
            'provider_reference' => $meta['provider_reference'] ?? null,
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
