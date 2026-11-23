<?php

namespace App\Features\Admin\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Features\Payments\Services\RefundService;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\Money;
use App\Support\RestaurantBranchService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class AdminFinanceService
{
    public function __construct(
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
        private readonly LedgerService $ledgerService,
        private readonly RefundService $refundService,
    ) {}

    /**
     * Summarize posted double-entry ledger journals, online payments, refunds, and reconciliation metrics.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function ledgerOverview(array $filters = []): array
    {
        $totalJournals = (int) DB::table('ledger_journals')->count();
        $unbalancedCount = (int) DB::table('ledger_unbalanced_journals')->count();

        $onlinePaymentsCents = 0;
        foreach (DB::table('payments')
            ->where('payment_type', 'payment')
            ->where('payment_method', '<>', 'cash')
            ->whereIn('payment_status', ['paid', 'partially_refunded', 'refunded'])
            ->pluck('amount') as $amt) {
            $onlinePaymentsCents += max(0, Money::parseStrictCents((string) $amt));
        }

        $pendingOnlineCents = 0;
        foreach (DB::table('payments')
            ->where('payment_type', 'payment')
            ->where('payment_method', '<>', 'cash')
            ->whereIn('payment_status', ['pending', 'requires_customer_action', 'processing', 'authorized'])
            ->pluck('amount') as $amt) {
            $pendingOnlineCents += max(0, Money::parseStrictCents((string) $amt));
        }

        $refundRows = DB::table('payments')
            ->where('payment_type', 'refund')
            ->get(['payment_id', 'refund_status', 'amount', 'provider_response']);

        $confirmedRefundsCents = 0;
        $confirmedRefundsCount = 0;
        $requestedRefundsCents = 0;
        $requestedRefundsCount = 0;
        $submittedRefundsCents = 0;
        $submittedRefundsCount = 0;
        $failedRefundsCents = 0;
        $failedRefundsCount = 0;
        $manualRefundsCents = 0;
        $manualRefundsCount = 0;
        $uncertainRefundsCount = 0;

        foreach ($refundRows as $row) {
            $cents = max(0, Money::parseStrictCents((string) $row->amount));
            $meta = $this->decodeMeta($row->provider_response ?? null);
            if (($meta['refund_submission_state'] ?? null) === 'uncertain') {
                $uncertainRefundsCount++;
            }

            switch ($row->refund_status) {
                case 'successful':
                    $confirmedRefundsCents += $cents;
                    $confirmedRefundsCount++;
                    break;
                case 'requested':
                    $requestedRefundsCents += $cents;
                    $requestedRefundsCount++;
                    break;
                case 'approved':
                case 'submitted':
                case 'processing':
                    $submittedRefundsCents += $cents;
                    $submittedRefundsCount++;
                    break;
                case 'failed':
                    $failedRefundsCents += $cents;
                    $failedRefundsCount++;
                    break;
                case 'manual':
                    $manualRefundsCents += $cents;
                    $manualRefundsCount++;
                    break;
            }
        }

        // Detect successful refunds missing a refund ledger journal.
        $mismatchedRefundLedgerCount = (int) DB::table('payments as p')
            ->leftJoin('ledger_journals as j', function ($join): void {
                $join->on('j.payment_id', '=', 'p.payment_id')
                    ->where('j.journal_type', '=', 'refund');
            })
            ->where('p.payment_type', 'refund')
            ->where('p.refund_status', 'successful')
            ->whereNull('j.journal_id')
            ->count();

        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 15)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $journalType = trim((string) ($filters['journal_type'] ?? ''));
        $search = trim((string) ($filters['search'] ?? ''));
        $dateFrom = trim((string) ($filters['date_from'] ?? ''));
        $dateTo = trim((string) ($filters['date_to'] ?? ''));

        $journalQuery = DB::table('ledger_journals as j');
        if ($journalType !== '' && $journalType !== 'all') {
            $journalQuery->where('j.journal_type', $journalType);
        }
        if ($search !== '') {
            $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $search).'%';
            $journalQuery->where(function ($q) use ($like, $search): void {
                $q->where('j.journal_reference', 'like', $like)
                    ->orWhere('j.description', 'like', $like)
                    ->orWhere('j.provider_reference', 'like', $like);
                if (ctype_digit($search)) {
                    $q->orWhere('j.payment_id', (int) $search)
                        ->orWhere('j.order_id', (int) $search);
                }
            });
        }
        if ($dateFrom !== '') {
            $journalQuery->whereDate('j.posted_at', '>=', $dateFrom);
        }
        if ($dateTo !== '') {
            $journalQuery->whereDate('j.posted_at', '<=', $dateTo);
        }

        $filteredTotal = (int) (clone $journalQuery)->count();
        $lastPage = max(1, (int) ceil($filteredTotal / $perPage));
        $journalRows = $journalQuery
            ->orderByDesc('j.journal_id')
            ->forPage($page, $perPage)
            ->get([
                'j.journal_id',
                'j.journal_reference',
                'j.journal_type',
                'j.description',
                'j.order_id',
                'j.payment_id',
                'j.provider_reference',
                'j.posted_at',
            ]);

        $journalIds = $journalRows->pluck('journal_id')->all();
        $entryTotals = $journalIds === []
            ? collect()
            : DB::table('ledger_entries')
                ->whereIn('journal_id', $journalIds)
                ->selectRaw("journal_id, COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END), 0) as debit_total, COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END), 0) as credit_total")
                ->groupBy('journal_id')
                ->get()
                ->keyBy('journal_id');

        $recentJournals = $journalRows->map(static function (object $j) use ($entryTotals): array {
            $totals = $entryTotals->get($j->journal_id);

            return [
                'journal_id' => (int) $j->journal_id,
                'journal_reference' => $j->journal_reference,
                'journal_type' => $j->journal_type,
                'description' => $j->description,
                'order_id' => $j->order_id !== null ? (int) $j->order_id : null,
                'payment_id' => $j->payment_id !== null ? (int) $j->payment_id : null,
                'provider_reference' => $j->provider_reference,
                'debit_total' => $totals ? (float) $totals->debit_total : 0.0,
                'credit_total' => $totals ? (float) $totals->credit_total : 0.0,
                'posted_at' => OrderTimestampFormatter::toManilaIso($j->posted_at),
            ];
        })->all();

        $onlinePaymentsTotal = (float) Money::fromCents($onlinePaymentsCents);
        $refundsTotal = (float) Money::fromCents($confirmedRefundsCents);

        return [
            'summary' => [
                'total_journals' => $totalJournals,
                'unbalanced_count' => $unbalancedCount,
                'online_payments_total' => round($onlinePaymentsTotal, 2),
                'refunds_total' => round($refundsTotal, 2),
            ],
            'reconciliation' => [
                'gross_online_payments' => round($onlinePaymentsTotal, 2),
                'pending_online_payments' => (float) Money::fromCents($pendingOnlineCents),
                'confirmed_refunds_total' => round($refundsTotal, 2),
                'confirmed_refunds_count' => $confirmedRefundsCount,
                'requested_refunds_total' => (float) Money::fromCents($requestedRefundsCents),
                'requested_refunds_count' => $requestedRefundsCount,
                'submitted_refunds_total' => (float) Money::fromCents($submittedRefundsCents),
                'submitted_refunds_count' => $submittedRefundsCount,
                'failed_refunds_total' => (float) Money::fromCents($failedRefundsCents),
                'failed_refunds_count' => $failedRefundsCount,
                'manual_refunds_total' => (float) Money::fromCents($manualRefundsCents),
                'manual_refunds_count' => $manualRefundsCount,
                'uncertain_refunds_count' => $uncertainRefundsCount,
                'net_online_payments' => (float) Money::fromCents(max(0, $onlinePaymentsCents - $confirmedRefundsCents)),
                'mismatched_refund_ledger_count' => $mismatchedRefundLedgerCount,
            ],
            'recent_journals' => $recentJournals,
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $filteredTotal,
                'last_page' => $lastPage,
            ],
        ];
    }

    /**
     * List COD remittance records and platform COD summary for admin verification.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listCodRemittances(array $filters = []): array
    {
        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 20)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $statusFilter = trim((string) ($filters['remittance_status'] ?? ''));
        $search = trim((string) ($filters['search'] ?? ''));

        $agg = DB::table('deliveries as d')
            ->where('d.delivery_status', 'delivered')
            ->where('d.cod_remittance_status', '!=', 'not_applicable')
            ->selectRaw("
                COALESCE(SUM(CASE WHEN d.cod_remittance_status = 'pending' THEN COALESCE(d.cod_amount_collected, 0) ELSE 0 END), 0) as pending_amount,
                SUM(CASE WHEN d.cod_remittance_status = 'pending' THEN 1 ELSE 0 END) as pending_count,
                COALESCE(SUM(CASE WHEN d.cod_remittance_status = 'submitted' THEN COALESCE(d.cod_amount_collected, 0) ELSE 0 END), 0) as submitted_amount,
                SUM(CASE WHEN d.cod_remittance_status = 'submitted' THEN 1 ELSE 0 END) as submitted_count,
                COALESCE(SUM(CASE WHEN d.cod_remittance_status = 'confirmed' THEN COALESCE(d.cod_amount_collected, 0) ELSE 0 END), 0) as confirmed_amount,
                SUM(CASE WHEN d.cod_remittance_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_count,
                COALESCE(SUM(CASE WHEN d.cod_remittance_status = 'discrepancy' THEN COALESCE(d.cod_amount_collected, 0) ELSE 0 END), 0) as discrepancy_amount,
                SUM(CASE WHEN d.cod_remittance_status = 'discrepancy' THEN 1 ELSE 0 END) as discrepancy_count
            ")
            ->first();

        $baseQuery = DB::table('deliveries as d')
            ->join('orders as o', 'o.order_id', '=', 'd.order_id')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->leftJoin('riders as ri', 'ri.rider_id', '=', 'd.rider_id')
            ->leftJoin('users as ru', 'ru.user_id', '=', 'ri.user_id')
            ->where('d.delivery_status', 'delivered')
            ->where('d.cod_remittance_status', '!=', 'not_applicable');

        if ($statusFilter !== '' && $statusFilter !== 'all') {
            $baseQuery->where('d.cod_remittance_status', $statusFilter);
        }

        if ($search !== '') {
            $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $search).'%';
            $baseQuery->where(function ($q) use ($like): void {
                $q->where('o.order_reference', 'like', $like)
                    ->orWhere('r.restaurant_name', 'like', $like)
                    ->orWhere('ru.first_name', 'like', $like)
                    ->orWhere('ru.last_name', 'like', $like);
            });
        }

        $total = (int) (clone $baseQuery)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));

        $rows = $baseQuery
            ->select([
                'd.delivery_id',
                'd.order_id',
                'o.order_reference',
                'r.restaurant_name',
                'r.branch_name',
                'd.rider_id',
                'ru.first_name as rider_first_name',
                'ru.last_name as rider_last_name',
                'ru.email as rider_email',
                'd.cod_amount_collected',
                'd.cod_collected_at',
                'd.cod_remittance_status',
                'd.cod_remitted_at',
                'd.cod_confirmed_by',
                'd.delivered_at',
            ])
            ->orderByRaw("FIELD(d.cod_remittance_status, 'submitted', 'discrepancy', 'pending', 'confirmed')")
            ->orderByDesc('d.cod_collected_at')
            ->orderByDesc('d.delivery_id')
            ->forPage($page, $perPage)
            ->get();

        $items = $rows->map(static function (object $row): array {
            $riderName = trim(implode(' ', array_filter([$row->rider_first_name ?? null, $row->rider_last_name ?? null])));

            return [
                'delivery_id' => (int) $row->delivery_id,
                'order_id' => (int) $row->order_id,
                'order_reference' => $row->order_reference,
                'restaurant_name' => RestaurantBranchService::formatDisplayName((string) $row->restaurant_name, $row->branch_name ?? null),
                'rider_id' => $row->rider_id !== null ? (int) $row->rider_id : null,
                'rider_name' => $riderName !== '' ? $riderName : ($row->rider_email ?? 'Rider'),
                'cod_amount_collected' => $row->cod_amount_collected !== null ? (float) $row->cod_amount_collected : 0.0,
                'cod_collected_at' => OrderTimestampFormatter::toManilaIso($row->cod_collected_at),
                'cod_remittance_status' => (string) $row->cod_remittance_status,
                'cod_remitted_at' => OrderTimestampFormatter::toManilaIso($row->cod_remitted_at),
                'cod_confirmed_by' => $row->cod_confirmed_by !== null ? (int) $row->cod_confirmed_by : null,
                'delivered_at' => OrderTimestampFormatter::toManilaIso($row->delivered_at),
            ];
        })->all();

        return [
            'summary' => [
                'pending_amount' => round((float) ($agg->pending_amount ?? 0), 2),
                'pending_count' => (int) ($agg->pending_count ?? 0),
                'submitted_amount' => round((float) ($agg->submitted_amount ?? 0), 2),
                'submitted_count' => (int) ($agg->submitted_count ?? 0),
                'confirmed_amount' => round((float) ($agg->confirmed_amount ?? 0), 2),
                'confirmed_count' => (int) ($agg->confirmed_count ?? 0),
                'discrepancy_amount' => round((float) ($agg->discrepancy_amount ?? 0), 2),
                'discrepancy_count' => (int) ($agg->discrepancy_count ?? 0),
            ],
            'items' => $items,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => $lastPage,
            ],
        ];
    }

    /**
     * Confirm or flag discrepancy on a rider's COD remittance.
     *
     * @return array<string, mixed>
     */
    public function verifyCodRemittance(
        int $deliveryId,
        string $action,
        ?string $notes,
        User $admin,
        Request $request,
    ): array {
        if (! in_array($action, ['confirm', 'flag_discrepancy'], true)) {
            throw ValidationException::withMessages([
                'action' => ['Action must be either confirm or flag_discrepancy.'],
            ]);
        }

        $trimmedNotes = $notes !== null ? trim($notes) : null;
        if ($trimmedNotes === '') {
            $trimmedNotes = null;
        }
        if ($action === 'flag_discrepancy' && ($trimmedNotes === null || mb_strlen($trimmedNotes) < 5)) {
            throw ValidationException::withMessages([
                'notes' => ['Provide a discrepancy explanation (at least 5 characters).'],
            ]);
        }

        return DB::transaction(function () use ($deliveryId, $action, $trimmedNotes, $admin, $request): array {
            $delivery = DB::table('deliveries')
                ->where('delivery_id', $deliveryId)
                ->lockForUpdate()
                ->first();

            if (! $delivery) {
                throw new NotFoundHttpException('Delivery not found.');
            }

            if ($delivery->delivery_status !== 'delivered' || $delivery->cod_remittance_status === 'not_applicable') {
                throw new ConflictHttpException('This delivery does not have a COD remittance record.');
            }

            if ($delivery->cod_remittance_status === 'confirmed') {
                throw new ConflictHttpException('COD remittance for this delivery has already been confirmed.');
            }

            $oldStatus = (string) $delivery->cod_remittance_status;
            $newStatus = $action === 'confirm' ? 'confirmed' : 'discrepancy';
            $now = now();

            DB::table('deliveries')
                ->where('delivery_id', $deliveryId)
                ->update([
                    'cod_remittance_status' => $newStatus,
                    'cod_confirmed_by' => (int) $admin->user_id,
                    'cod_remitted_at' => $delivery->cod_remitted_at ?? $now,
                    'updated_at' => $now,
                ]);

            if ($newStatus === 'confirmed' && (float) ($delivery->cod_collected_amount ?? 0) > 0 && $delivery->rider_id) {
                $this->ledgerService->postCodRemittanceVerified(
                    deliveryId: $deliveryId,
                    orderId: (int) $delivery->order_id,
                    riderId: (int) $delivery->rider_id,
                    amount: (float) $delivery->cod_collected_amount,
                    adminUserId: (int) $admin->user_id,
                );
            }

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: 'admin_cod_remittance_verified',
                entityType: 'deliveries',
                entityId: $deliveryId,
                oldValues: ['cod_remittance_status' => $oldStatus],
                newValues: ['cod_remittance_status' => $newStatus, 'cod_confirmed_by' => (int) $admin->user_id],
                reason: $trimmedNotes,
                request: $request,
            );

            $order = DB::table('orders')->where('order_id', $delivery->order_id)->first(['order_reference']);
            $riderUserId = $delivery->rider_id
                ? DB::table('riders')->where('rider_id', $delivery->rider_id)->value('user_id')
                : null;

            if ($riderUserId) {
                $ref = $order?->order_reference ?? "#{$delivery->order_id}";
                $this->notificationService->notifyUser(
                    userId: (int) $riderUserId,
                    workspace: 'rider',
                    type: $newStatus === 'confirmed' ? 'cod_remittance_confirmed' : 'cod_remittance_discrepancy',
                    title: $newStatus === 'confirmed'
                        ? "COD remittance confirmed for {$ref}"
                        : "COD remittance discrepancy flagged for {$ref}",
                    body: $newStatus === 'confirmed'
                        ? 'An administrator verified your COD cash remittance.'
                        : "Discrepancy noted: {$trimmedNotes}",
                    relatedEntityType: 'delivery',
                    relatedEntityId: $deliveryId,
                );
            }

            return [
                'delivery_id' => $deliveryId,
                'cod_remittance_status' => $newStatus,
                'cod_confirmed_by' => (int) $admin->user_id,
            ];
        });
    }

    /**
     * List refund payment records with filtering, sorting, and pagination.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listRefunds(array $filters = []): array
    {
        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 20)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $status = trim((string) ($filters['refund_status'] ?? ''));
        $provider = trim((string) ($filters['provider'] ?? ''));
        $dateFrom = trim((string) ($filters['date_from'] ?? ''));
        $dateTo = trim((string) ($filters['date_to'] ?? ''));
        $minAmount = isset($filters['min_amount']) && is_numeric($filters['min_amount']) ? (float) $filters['min_amount'] : null;
        $maxAmount = isset($filters['max_amount']) && is_numeric($filters['max_amount']) ? (float) $filters['max_amount'] : null;
        $search = trim((string) ($filters['search'] ?? ''));
        $sortBy = trim((string) ($filters['sort_by'] ?? 'created_at'));
        $sortDir = strtolower(trim((string) ($filters['sort_dir'] ?? 'desc'))) === 'asc' ? 'asc' : 'desc';

        $hasProviderName = Schema::hasColumn('payments', 'provider_name');
        $hasProviderPaymentId = Schema::hasColumn('payments', 'provider_payment_id');

        $baseQuery = DB::table('payments as r')
            ->leftJoin('payments as orig', 'orig.payment_id', '=', 'r.related_payment_id')
            ->leftJoin('payment_allocations as pa', function ($join): void {
                $join->on('pa.payment_id', '=', 'r.payment_id')
                    ->where('pa.allocation_type', '=', 'order_refund');
            })
            ->leftJoin('orders as o', 'o.order_id', '=', 'pa.order_id')
            ->leftJoin('restaurants as rest', 'rest.restaurant_id', '=', 'o.restaurant_id')
            ->leftJoin('users as cu', 'cu.user_id', '=', 'r.customer_id')
            ->where('r.payment_type', 'refund');

        if ($status !== '' && $status !== 'all') {
            $baseQuery->where('r.refund_status', $status);
        }

        if ($provider !== '' && $provider !== 'all') {
            if ($hasProviderName) {
                $baseQuery->where(function ($q) use ($provider): void {
                    $q->where('r.provider_name', $provider)
                        ->orWhere('r.provider_response', 'like', '%"provider":"'.$provider.'"%');
                });
            } else {
                $baseQuery->where('r.provider_response', 'like', '%"provider":"'.$provider.'"%');
            }
        }

        if ($dateFrom !== '') {
            $baseQuery->whereDate('r.created_at', '>=', $dateFrom);
        }
        if ($dateTo !== '') {
            $baseQuery->whereDate('r.created_at', '<=', $dateTo);
        }
        if ($minAmount !== null) {
            $baseQuery->where('r.amount', '>=', number_format($minAmount, 2, '.', ''));
        }
        if ($maxAmount !== null) {
            $baseQuery->where('r.amount', '<=', number_format($maxAmount, 2, '.', ''));
        }

        if ($search !== '') {
            $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $search).'%';
            $baseQuery->where(function ($q) use ($like, $search, $hasProviderPaymentId): void {
                $q->where('r.payment_reference', 'like', $like)
                    ->orWhere('orig.payment_reference', 'like', $like)
                    ->orWhere('o.order_reference', 'like', $like)
                    ->orWhere('o.restaurant_name', 'like', $like)
                    ->orWhere('cu.first_name', 'like', $like)
                    ->orWhere('cu.last_name', 'like', $like)
                    ->orWhere('cu.email', 'like', $like);
                if ($hasProviderPaymentId) {
                    $q->orWhere('r.provider_payment_id', 'like', $like)
                        ->orWhere('orig.provider_payment_id', 'like', $like);
                }
                if (ctype_digit($search)) {
                    $id = (int) $search;
                    $q->orWhere('r.payment_id', $id)
                        ->orWhere('r.related_payment_id', $id)
                        ->orWhere('r.checkout_id', $id)
                        ->orWhere('o.order_id', $id);
                }
            });
        }

        $total = (int) (clone $baseQuery)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));

        $sortColumn = match ($sortBy) {
            'amount' => 'r.amount',
            'refund_status' => 'r.refund_status',
            'paid_at' => 'r.paid_at',
            default => 'r.payment_id',
        };

        $select = [
            'r.payment_id',
            'r.payment_reference',
            'r.checkout_id',
            'r.customer_id',
            'r.payment_method',
            'r.payment_status',
            'r.refund_status',
            'r.amount',
            'r.related_payment_id',
            'r.provider_response',
            'r.paid_at',
            'r.created_at',
            'r.updated_at',
            'orig.payment_reference as orig_reference',
            'orig.payment_status as orig_status',
            'orig.provider_response as orig_provider_response',
            'o.order_id',
            'o.order_reference',
            'o.order_status',
            'o.restaurant_id',
            'o.restaurant_name',
            'rest.branch_name',
            'cu.first_name as customer_first_name',
            'cu.last_name as customer_last_name',
            'cu.email as customer_email',
        ];

        if ($hasProviderName) {
            $select[] = 'r.provider_name';
            $select[] = 'orig.provider_name as orig_provider_name';
        }
        if ($hasProviderPaymentId) {
            $select[] = 'r.provider_payment_id';
            $select[] = 'orig.provider_payment_id as orig_provider_payment_id';
        }

        $rows = $baseQuery
            ->orderBy($sortColumn, $sortDir)
            ->forPage($page, $perPage)
            ->get($select);

        return [
            'items' => $rows->map(fn (object $row): array => $this->formatRefundRow($row))->all(),
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => $lastPage,
            ],
        ];
    }

    /**
     * Get full sanitized detail for a single refund record, including ledger, events, and audit logs.
     *
     * @return array<string, mixed>
     */
    public function getRefundDetail(int $refundId): array
    {
        $hasProviderName = Schema::hasColumn('payments', 'provider_name');
        $hasProviderPaymentId = Schema::hasColumn('payments', 'provider_payment_id');

        $select = [
            'r.payment_id',
            'r.payment_reference',
            'r.checkout_id',
            'r.customer_id',
            'r.payment_method',
            'r.payment_status',
            'r.refund_status',
            'r.amount',
            'r.related_payment_id',
            'r.provider_response',
            'r.paid_at',
            'r.created_at',
            'r.updated_at',
            'orig.payment_reference as orig_reference',
            'orig.payment_status as orig_status',
            'orig.provider_response as orig_provider_response',
            'o.order_id',
            'o.order_reference',
            'o.order_status',
            'o.restaurant_id',
            'o.restaurant_name',
            'rest.branch_name',
            'cu.first_name as customer_first_name',
            'cu.last_name as customer_last_name',
            'cu.email as customer_email',
        ];
        if ($hasProviderName) {
            $select[] = 'r.provider_name';
            $select[] = 'orig.provider_name as orig_provider_name';
        }
        if ($hasProviderPaymentId) {
            $select[] = 'r.provider_payment_id';
            $select[] = 'orig.provider_payment_id as orig_provider_payment_id';
        }

        $row = DB::table('payments as r')
            ->leftJoin('payments as orig', 'orig.payment_id', '=', 'r.related_payment_id')
            ->leftJoin('payment_allocations as pa', function ($join): void {
                $join->on('pa.payment_id', '=', 'r.payment_id')
                    ->where('pa.allocation_type', '=', 'order_refund');
            })
            ->leftJoin('orders as o', 'o.order_id', '=', 'pa.order_id')
            ->leftJoin('restaurants as rest', 'rest.restaurant_id', '=', 'o.restaurant_id')
            ->leftJoin('users as cu', 'cu.user_id', '=', 'r.customer_id')
            ->where('r.payment_type', 'refund')
            ->where('r.payment_id', $refundId)
            ->first($select);

        if (! $row) {
            throw new NotFoundHttpException('Refund record not found.');
        }

        $formatted = $this->formatRefundRow($row);

        $journals = DB::table('ledger_journals')
            ->where('payment_id', $refundId)
            ->orderByDesc('journal_id')
            ->get(['journal_id', 'journal_reference', 'journal_type', 'description', 'posted_at']);

        $journalIds = $journals->pluck('journal_id')->all();
        $entriesByJournal = $journalIds === []
            ? collect()
            : DB::table('ledger_entries as e')
                ->join('ledger_accounts as a', 'a.account_id', '=', 'e.account_id')
                ->whereIn('e.journal_id', $journalIds)
                ->get(['e.journal_id', 'a.account_code', 'a.account_name', 'e.direction', 'e.amount'])
                ->groupBy('journal_id');

        $formatted['ledger_journals'] = $journals->map(static function (object $j) use ($entriesByJournal): array {
            $entries = ($entriesByJournal->get($j->journal_id) ?? collect())->map(static fn (object $e): array => [
                'account_code' => $e->account_code,
                'account_name' => $e->account_name,
                'direction' => $e->direction,
                'amount' => (float) $e->amount,
            ])->all();

            return [
                'journal_id' => (int) $j->journal_id,
                'journal_reference' => $j->journal_reference,
                'journal_type' => $j->journal_type,
                'description' => $j->description,
                'posted_at' => OrderTimestampFormatter::toManilaIso($j->posted_at),
                'entries' => $entries,
            ];
        })->all();

        $formatted['payment_events'] = DB::table('payment_events')
            ->whereIn('payment_id', array_filter([$refundId, $row->related_payment_id ? (int) $row->related_payment_id : null]))
            ->orderByDesc('event_id')
            ->limit(20)
            ->get(['event_id', 'provider_name', 'event_key', 'payment_id', 'processing_status', 'processed_at', 'error_message', 'created_at'])
            ->map(static fn (object $ev): array => [
                'event_id' => (int) $ev->event_id,
                'provider_name' => $ev->provider_name,
                'event_key' => $ev->event_key,
                'payment_id' => $ev->payment_id !== null ? (int) $ev->payment_id : null,
                'processing_status' => $ev->processing_status,
                'processed_at' => OrderTimestampFormatter::toManilaIso($ev->processed_at),
                'error_message' => $ev->error_message,
                'created_at' => OrderTimestampFormatter::toManilaIso($ev->created_at),
            ])
            ->all();

        $formatted['audit_logs'] = DB::table('audit_logs as al')
            ->leftJoin('users as u', 'u.user_id', '=', 'al.actor_user_id')
            ->where('al.entity_type', 'payments')
            ->where('al.entity_id', $refundId)
            ->orderByDesc('al.log_id')
            ->limit(20)
            ->get(['al.log_id', 'al.action', 'al.reason', 'al.old_values', 'al.new_values', 'al.created_at', 'u.first_name', 'u.last_name'])
            ->map(static fn (object $log): array => [
                'log_id' => (int) $log->log_id,
                'action' => $log->action,
                'reason' => $log->reason,
                'actor_name' => trim(($log->first_name ?? '').' '.($log->last_name ?? '')) ?: 'System',
                'created_at' => OrderTimestampFormatter::toManilaIso($log->created_at),
            ])
            ->all();

        return $formatted;
    }

    /**
     * Trigger provider refund submission safely via RefundService (never marks successful without provider confirmation).
     *
     * @return array<string, mixed>
     */
    public function submitRefund(int $refundId, User $admin, Request $request): array
    {
        $this->auditLogService->record(
            actorUserId: (int) $admin->user_id,
            action: 'admin_refund_submission_triggered',
            entityType: 'payments',
            entityId: $refundId,
            newValues: ['admin_user_id' => (int) $admin->user_id],
            request: $request,
        );

        $this->refundService->submitRefundToProvider(
            refundPaymentId: $refundId,
            actorUserId: (int) $admin->user_id,
            request: $request,
        );

        return $this->getRefundDetail($refundId);
    }

    /**
     * List read-only sanitized payment_events for admin reconciliation visibility.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listPaymentEvents(array $filters = []): array
    {
        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 20)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $provider = trim((string) ($filters['provider_name'] ?? ''));
        $status = trim((string) ($filters['processing_status'] ?? ''));
        $search = trim((string) ($filters['search'] ?? ''));

        $baseQuery = DB::table('payment_events as pe')
            ->leftJoin('payments as p', 'p.payment_id', '=', 'pe.payment_id');

        if ($provider !== '' && $provider !== 'all') {
            $baseQuery->where('pe.provider_name', $provider);
        }
        if ($status !== '' && $status !== 'all') {
            $baseQuery->where('pe.processing_status', $status);
        }
        if ($search !== '') {
            $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $search).'%';
            $baseQuery->where(function ($q) use ($like, $search): void {
                $q->where('pe.event_key', 'like', $like)
                    ->orWhere('p.payment_reference', 'like', $like);
                if (ctype_digit($search)) {
                    $q->orWhere('pe.payment_id', (int) $search);
                }
            });
        }

        $total = (int) (clone $baseQuery)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));

        $rows = $baseQuery
            ->orderByDesc('pe.event_id')
            ->forPage($page, $perPage)
            ->get([
                'pe.event_id',
                'pe.provider_name',
                'pe.event_key',
                'pe.payment_id',
                'pe.processing_status',
                'pe.processed_at',
                'pe.error_message',
                'pe.created_at',
                'p.payment_reference',
                'p.payment_type',
            ]);

        return [
            'items' => $rows->map(static fn (object $ev): array => [
                'event_id' => (int) $ev->event_id,
                'provider_name' => $ev->provider_name,
                'event_key' => $ev->event_key,
                'payment_id' => $ev->payment_id !== null ? (int) $ev->payment_id : null,
                'payment_reference' => $ev->payment_reference,
                'payment_type' => $ev->payment_type,
                'processing_status' => $ev->processing_status,
                'processed_at' => OrderTimestampFormatter::toManilaIso($ev->processed_at),
                'error_message' => $ev->error_message,
                'created_at' => OrderTimestampFormatter::toManilaIso($ev->created_at),
            ])->all(),
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => $lastPage,
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function formatRefundRow(object $row): array
    {
        $meta = $this->decodeMeta($row->provider_response ?? null);
        $origMeta = $this->decodeMeta($row->orig_provider_response ?? null);

        $provider = $row->provider_name ?? $meta['provider'] ?? $row->orig_provider_name ?? ($origMeta['provider'] ?? null);
        $providerRefundId = $row->provider_payment_id ?? ($meta['provider_refund_id'] ?? null);
        $origProviderPaymentId = $row->orig_provider_payment_id ?? $origMeta['provider_payment_id'] ?? ($origMeta['provider_reference'] ?? null);
        $submissionState = $meta['refund_submission_state'] ?? null;

        $activeDriver = strtolower(trim((string) config('salo.payments.driver', 'sandbox')));
        $canSubmit = $row->refund_status === 'requested'
            && $submissionState !== 'uncertain'
            && ($provider === null || $provider === '' || $provider === $activeDriver);

        $needsManualReview = $row->refund_status === 'manual'
            || $submissionState === 'uncertain'
            || $row->refund_status === 'failed';

        $customerName = trim(($row->customer_first_name ?? '').' '.($row->customer_last_name ?? '')) ?: 'Customer';

        return [
            'refund_id' => (int) $row->payment_id,
            'refund_reference' => $row->payment_reference,
            'refund_status' => $row->refund_status,
            'amount' => (float) $row->amount,
            'currency' => 'PHP',
            'provider_name' => $provider,
            'provider_refund_id' => $providerRefundId,
            'provider_refund_status' => $meta['xendit_refund_status'] ?? null,
            'submission_state' => $submissionState,
            'submission_attempted_at' => OrderTimestampFormatter::toManilaIso($meta['refund_attempted_at'] ?? null),
            'failure_reason' => $meta['failure_reason'] ?? null,
            'reason' => $meta['reason'] ?? null,
            'original_payment_id' => $row->related_payment_id !== null ? (int) $row->related_payment_id : null,
            'original_payment_reference' => $row->orig_reference ?? ($meta['original_payment_reference'] ?? null),
            'original_payment_status' => $row->orig_status,
            'original_provider_payment_id' => $origProviderPaymentId,
            'checkout_id' => $row->checkout_id !== null ? (int) $row->checkout_id : null,
            'order_id' => $row->order_id !== null ? (int) $row->order_id : null,
            'order_reference' => $row->order_reference ?? ($meta['order_reference'] ?? null),
            'order_status' => $row->order_status,
            'restaurant_id' => $row->restaurant_id !== null ? (int) $row->restaurant_id : null,
            'restaurant_name' => $row->restaurant_name
                ? RestaurantBranchService::formatDisplayName((string) $row->restaurant_name, $row->branch_name ?? null)
                : null,
            'customer_id' => (int) $row->customer_id,
            'customer_name' => $customerName,
            'customer_email' => $row->customer_email,
            'can_submit' => $canSubmit,
            'needs_manual_review' => $needsManualReview,
            'paid_at' => OrderTimestampFormatter::toManilaIso($row->paid_at),
            'created_at' => OrderTimestampFormatter::toManilaIso($row->created_at),
            'updated_at' => OrderTimestampFormatter::toManilaIso($row->updated_at),
        ];
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
