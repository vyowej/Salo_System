<?php

namespace App\Features\Admin\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class LedgerService
{
    private const DEFAULT_ACCOUNTS = [
        ['account_code' => '1010', 'account_name' => 'Cash & Bank Clearing', 'account_type' => 'asset'],
        ['account_code' => '1020', 'account_name' => 'Online Payment Provider Receivable', 'account_type' => 'asset'],
        ['account_code' => '2010', 'account_name' => 'Order Clearing Liability', 'account_type' => 'liability'],
        ['account_code' => '2020', 'account_name' => 'Restaurant Payable', 'account_type' => 'liability'],
        ['account_code' => '2030', 'account_name' => 'Rider Payable', 'account_type' => 'liability'],
        ['account_code' => '4010', 'account_name' => 'Platform Revenue', 'account_type' => 'revenue'],
        ['account_code' => '5010', 'account_name' => 'Refunds & Adjustments', 'account_type' => 'expense'],
    ];

    public function ensureDefaultAccounts(): void
    {
        $now = now();
        foreach (self::DEFAULT_ACCOUNTS as $account) {
            DB::table('ledger_accounts')->insertOrIgnore([
                'account_code' => $account['account_code'],
                'account_name' => $account['account_name'],
                'account_type' => $account['account_type'],
                'is_active' => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    /**
     * Post a balanced double-entry journal idempotently.
     *
     * @param  array<int, array{account_code: string, direction: 'debit'|'credit', amount: float|string, restaurant_id?: int|null, rider_id?: int|null, customer_user_id?: int|null}>  $lines
     */
    public function postBalancedJournal(
        string $journalType,
        string $idempotencyKey,
        string $description,
        array $lines,
        ?int $checkoutId = null,
        ?int $orderId = null,
        ?int $paymentId = null,
        ?int $postedBy = null,
        ?string $providerReference = null,
        ?int $reservationId = null,
    ): ?int {
        $existing = DB::table('ledger_journals')
            ->where('idempotency_key', $idempotencyKey)
            ->first(['journal_id']);
        if ($existing) {
            return (int) $existing->journal_id;
        }

        if (count($lines) < 2) {
            return null;
        }

        $debitCents = 0;
        $creditCents = 0;
        foreach ($lines as $line) {
            $cents = (int) round(((float) $line['amount']) * 100);
            if ($cents <= 0) {
                return null;
            }
            if ($line['direction'] === 'debit') {
                $debitCents += $cents;
            } else {
                $creditCents += $cents;
            }
        }

        if ($debitCents !== $creditCents || $debitCents <= 0) {
            return null;
        }

        $this->ensureDefaultAccounts();

        $codes = array_values(array_unique(array_column($lines, 'account_code')));
        $accountMap = DB::table('ledger_accounts')
            ->whereIn('account_code', $codes)
            ->pluck('account_id', 'account_code');

        foreach ($codes as $code) {
            if (! $accountMap->has($code)) {
                return null;
            }
        }

        $now = now();
        $reference = 'JRN-'.now()->format('Ymd').'-'.strtoupper(Str::random(6));

        $journalId = (int) DB::table('ledger_journals')->insertGetId([
            'journal_reference' => $reference,
            'journal_type' => $journalType,
            'idempotency_key' => $idempotencyKey,
            'currency' => 'PHP',
            'description' => mb_substr($description, 0, 255),
            'checkout_id' => $checkoutId,
            'order_id' => $orderId,
            'reservation_id' => $reservationId,
            'payment_id' => $paymentId,
            'provider_reference' => $providerReference,
            'posted_by' => $postedBy,
            'posted_at' => $now,
        ]);

        foreach ($lines as $line) {
            DB::table('ledger_entries')->insert([
                'journal_id' => $journalId,
                'account_id' => (int) $accountMap->get($line['account_code']),
                'direction' => $line['direction'],
                'amount' => number_format((float) $line['amount'], 2, '.', ''),
                'restaurant_id' => $line['restaurant_id'] ?? null,
                'rider_id' => $line['rider_id'] ?? null,
                'customer_user_id' => $line['customer_user_id'] ?? null,
                'created_at' => $now,
            ]);
        }

        return $journalId;
    }

    public function postOnlinePaymentConfirmed(
        int $paymentId,
        ?int $checkoutId,
        int $customerUserId,
        float $amount,
        ?string $providerReference = null,
        ?int $postedBy = null,
        ?int $reservationId = null,
    ): ?int {
        return $this->postBalancedJournal(
            journalType: 'payment',
            idempotencyKey: "payment_confirmed_{$paymentId}",
            description: $reservationId !== null
                ? "Reservation #{$reservationId} deposit payment #{$paymentId} confirmed"
                : "Online payment #{$paymentId} confirmed",
            lines: [
                [
                    'account_code' => '1020',
                    'direction' => 'debit',
                    'amount' => $amount,
                ],
                [
                    'account_code' => '2010',
                    'direction' => 'credit',
                    'amount' => $amount,
                    'customer_user_id' => $customerUserId,
                ],
            ],
            checkoutId: $checkoutId,
            paymentId: $paymentId,
            postedBy: $postedBy,
            providerReference: $providerReference,
            reservationId: $reservationId,
        );
    }

    public function postReservationRefund(
        int $refundPaymentId,
        int $reservationId,
        int $customerUserId,
        float $amount,
        ?int $postedBy = null,
    ): ?int {
        return $this->postBalancedJournal(
            journalType: 'refund',
            idempotencyKey: "reservation_refund_{$refundPaymentId}_{$reservationId}",
            description: "Reservation #{$reservationId} deposit refund #{$refundPaymentId}",
            lines: [
                [
                    'account_code' => '5010',
                    'direction' => 'debit',
                    'amount' => $amount,
                ],
                [
                    'account_code' => '1020',
                    'direction' => 'credit',
                    'amount' => $amount,
                ],
            ],
            paymentId: $refundPaymentId,
            postedBy: $postedBy,
            reservationId: $reservationId,
        );
    }

    public function postOrderRefund(
        int $refundPaymentId,
        int $orderId,
        int $checkoutId,
        int $customerUserId,
        float $amount,
        ?int $postedBy = null,
    ): ?int {
        return $this->postBalancedJournal(
            journalType: 'refund',
            idempotencyKey: "order_refund_{$refundPaymentId}_{$orderId}",
            description: "Order #{$orderId} refund #{$refundPaymentId}",
            lines: [
                [
                    'account_code' => '5010',
                    'direction' => 'debit',
                    'amount' => $amount,
                ],
                [
                    'account_code' => '1020',
                    'direction' => 'credit',
                    'amount' => $amount,
                ],
            ],
            checkoutId: $checkoutId,
            orderId: $orderId,
            paymentId: $refundPaymentId,
            postedBy: $postedBy,
        );
    }

    public function postCodRemittanceVerified(
        int $deliveryId,
        int $orderId,
        int $riderId,
        float $amount,
        int $adminUserId,
    ): ?int {
        return $this->postBalancedJournal(
            journalType: 'cod_remittance',
            idempotencyKey: "cod_remit_verified_{$deliveryId}",
            description: "COD remittance verified for delivery #{$deliveryId} (order #{$orderId})",
            lines: [
                [
                    'account_code' => '1010',
                    'direction' => 'debit',
                    'amount' => $amount,
                ],
                [
                    'account_code' => '2010',
                    'direction' => 'credit',
                    'amount' => $amount,
                    'rider_id' => $riderId,
                ],
            ],
            orderId: $orderId,
            postedBy: $adminUserId,
        );
    }
}
