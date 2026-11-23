<?php

namespace App\Features\Admin\Services;

use App\Models\User;
use App\Support\AuditLogService;
use App\Support\Money;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AdminReportService
{
    private const TIMEZONE = 'Asia/Manila';
    private const MAX_RANGE_DAYS = 90;

    public function __construct(
        private readonly AuditLogService $auditLogService,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return array{from: string, to: string, start: string, end_exclusive: string}
     */
    public function resolveDateRange(array $filters): array
    {
        $now = CarbonImmutable::now(self::TIMEZONE);
        $fromRaw = trim((string) ($filters['from'] ?? ''));
        $toRaw = trim((string) ($filters['to'] ?? ''));

        if ($fromRaw === '' && $toRaw === '') {
            $from = $now->subDays(29);
            $to = $now;
        } elseif ($fromRaw !== '' && $toRaw === '') {
            $from = CarbonImmutable::createFromFormat('Y-m-d', $fromRaw, self::TIMEZONE);
            $to = $from->addDays(29);
        } elseif ($fromRaw === '' && $toRaw !== '') {
            $to = CarbonImmutable::createFromFormat('Y-m-d', $toRaw, self::TIMEZONE);
            $from = $to->subDays(29);
        } else {
            $from = CarbonImmutable::createFromFormat('Y-m-d', $fromRaw, self::TIMEZONE);
            $to = CarbonImmutable::createFromFormat('Y-m-d', $toRaw, self::TIMEZONE);
        }

        if (! $from || ! $to) {
            throw ValidationException::withMessages([
                'from' => ['Dates must be valid YYYY-MM-DD values.'],
            ]);
        }

        if ($from->greaterThan($to)) {
            throw ValidationException::withMessages([
                'to' => ['End date must be on or after start date.'],
            ]);
        }

        if ($from->diffInDays($to) > self::MAX_RANGE_DAYS) {
            throw ValidationException::withMessages([
                'to' => ['Date range cannot exceed '.self::MAX_RANGE_DAYS.' days.'],
            ]);
        }

        return [
            'from' => $from->format('Y-m-d'),
            'to' => $to->format('Y-m-d'),
            'start' => $from->format('Y-m-d 00:00:00'),
            'end_exclusive' => $to->addDay()->format('Y-m-d 00:00:00'),
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function getSummary(array $filters): array
    {
        $range = $this->resolveDateRange($filters);

        $orders = DB::table('orders')
            ->where('placed_at', '>=', $range['start'])
            ->where('placed_at', '<', $range['end_exclusive'])
            ->get(['order_id', 'restaurant_id', 'order_status', 'subtotal_amount', 'delivery_fee', 'total_amount']);

        $totalOrders = $orders->count();
        $completedOrders = 0;
        $cancelledOrders = 0;
        $gmvCents = 0;
        $completedGmvCents = 0;
        $deliveryFeeCents = 0;
        $byRestaurant = [];

        foreach ($orders as $o) {
            $st = (string) $o->order_status;
            $subCents = Money::toCents((string) $o->subtotal_amount);
            $feeCents = Money::toCents((string) $o->delivery_fee);
            $totCents = Money::toCents((string) $o->total_amount);

            $gmvCents += $totCents;
            $deliveryFeeCents += $feeCents;
            if (in_array($st, ['delivered', 'completed'], true)) {
                $completedOrders++;
                $completedGmvCents += $totCents;
            } elseif (in_array($st, ['cancelled', 'rejected', 'failed'], true)) {
                $cancelledOrders++;
            }

            $rid = (int) $o->restaurant_id;
            if (! isset($byRestaurant[$rid])) {
                $byRestaurant[$rid] = ['orders' => 0, 'gmv_cents' => 0, 'subtotal_cents' => 0];
            }
            $byRestaurant[$rid]['orders']++;
            $byRestaurant[$rid]['gmv_cents'] += $totCents;
            $byRestaurant[$rid]['subtotal_cents'] += $subCents;
        }

        $restaurantNames = $byRestaurant === []
            ? collect()
            : DB::table('restaurants')
                ->whereIn('restaurant_id', array_keys($byRestaurant))
                ->pluck('restaurant_name', 'restaurant_id');

        uasort($byRestaurant, static fn (array $a, array $b): int => $b['gmv_cents'] <=> $a['gmv_cents']);
        $topRestaurants = [];
        foreach (array_slice($byRestaurant, 0, 10, true) as $rid => $agg) {
            $topRestaurants[] = [
                'restaurant_id' => $rid,
                'restaurant_name' => (string) ($restaurantNames->get($rid) ?? "Restaurant #{$rid}"),
                'orders_count' => $agg['orders'],
                'gmv' => Money::fromCents($agg['gmv_cents']),
            ];
        }

        $reservations = DB::table('reservations')
            ->where('reservation_start', '>=', $range['start'])
            ->where('reservation_start', '<', $range['end_exclusive'])
            ->get(['reservation_status', 'deposit_status', 'deposit_amount']);

        $resTotal = $reservations->count();
        $resCompleted = 0;
        $depositPaidCents = 0;
        $depositRefundedCents = 0;

        foreach ($reservations as $r) {
            if ((string) $r->reservation_status === 'completed') {
                $resCompleted++;
            }
            if ((string) $r->deposit_status === 'paid') {
                $depositPaidCents += Money::toCents((string) ($r->deposit_amount ?? '0.00'));
            } elseif ((string) $r->deposit_status === 'refunded') {
                $depositRefundedCents += Money::toCents((string) ($r->deposit_amount ?? '0.00'));
            }
        }

        $refunds = DB::table('payments')
            ->where('payment_type', 'refund')
            ->where('created_at', '>=', $range['start'])
            ->where('created_at', '<', $range['end_exclusive'])
            ->get(['payment_status', 'amount']);

        $refundsTotalCents = 0;
        $refundsConfirmedCents = 0;
        foreach ($refunds as $rf) {
            $amt = Money::toCents((string) $rf->amount);
            $refundsTotalCents += $amt;
            if ((string) $rf->payment_status === 'refunded') {
                $refundsConfirmedCents += $amt;
            }
        }

        return [
            'range' => ['from' => $range['from'], 'to' => $range['to']],
            'orders' => [
                'total' => $totalOrders,
                'completed' => $completedOrders,
                'cancelled_or_failed' => $cancelledOrders,
                'gmv' => Money::fromCents($gmvCents),
                'completed_gmv' => Money::fromCents($completedGmvCents),
                'delivery_fees' => Money::fromCents($deliveryFeeCents),
            ],
            'reservations' => [
                'total' => $resTotal,
                'completed' => $resCompleted,
                'deposits_held' => Money::fromCents($depositPaidCents),
                'deposits_refunded' => Money::fromCents($depositRefundedCents),
            ],
            'refunds' => [
                'count' => $refunds->count(),
                'requested_total' => Money::fromCents($refundsTotalCents),
                'confirmed_total' => Money::fromCents($refundsConfirmedCents),
            ],
            'top_restaurants' => $topRestaurants,
        ];
    }

    /**
     * Build sanitized CSV content (minimal personal data, formula-injection safe) and audit-log the export.
     *
     * @param  array<string, mixed>  $filters
     * @return array{filename: string, csv: string, row_count: int}
     */
    public function exportCsv(string $type, array $filters, User $admin, Request $request): array
    {
        if (! in_array($type, ['orders', 'reservations', 'finance'], true)) {
            throw ValidationException::withMessages([
                'type' => ['Export type must be orders, reservations, or finance.'],
            ]);
        }

        $range = $this->resolveDateRange($filters);
        $rows = [];

        if ($type === 'orders') {
            $headers = ['Order Reference', 'Restaurant', 'Customer', 'Order Type', 'Status', 'Subtotal', 'Delivery Fee', 'Total', 'Placed At'];
            $data = DB::table('orders as o')
                ->join('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
                ->join('users as u', 'u.user_id', '=', 'o.customer_id')
                ->where('o.placed_at', '>=', $range['start'])
                ->where('o.placed_at', '<', $range['end_exclusive'])
                ->orderBy('o.order_id')
                ->get([
                    'o.order_reference',
                    'r.restaurant_name',
                    DB::raw("TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) as customer_name"),
                    'o.order_type',
                    'o.order_status',
                    'o.subtotal_amount',
                    'o.delivery_fee',
                    'o.total_amount',
                    'o.placed_at',
                ]);
            foreach ($data as $d) {
                $rows[] = [
                    $d->order_reference,
                    $d->restaurant_name,
                    $d->customer_name,
                    $d->order_type,
                    $d->order_status,
                    Money::fromCents(Money::toCents((string) $d->subtotal_amount)),
                    Money::fromCents(Money::toCents((string) $d->delivery_fee)),
                    Money::fromCents(Money::toCents((string) $d->total_amount)),
                    (string) $d->placed_at,
                ];
            }
        } elseif ($type === 'reservations') {
            $headers = ['Reservation Reference', 'Restaurant', 'Customer', 'Party Size', 'Status', 'Deposit Status', 'Deposit Amount', 'Service Fee', 'Reservation Start'];
            $data = DB::table('reservations as r')
                ->join('restaurants as rest', 'rest.restaurant_id', '=', 'r.restaurant_id')
                ->join('users as u', 'u.user_id', '=', 'r.customer_id')
                ->where('r.reservation_start', '>=', $range['start'])
                ->where('r.reservation_start', '<', $range['end_exclusive'])
                ->orderBy('r.reservation_id')
                ->get([
                    'r.reservation_reference',
                    'rest.restaurant_name',
                    DB::raw("TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) as customer_name"),
                    'r.number_of_guests',
                    'r.reservation_status',
                    'r.deposit_status',
                    'r.deposit_amount',
                    'r.service_fee',
                    'r.reservation_start',
                ]);
            foreach ($data as $d) {
                $rows[] = [
                    $d->reservation_reference,
                    $d->restaurant_name,
                    $d->customer_name,
                    (string) $d->number_of_guests,
                    $d->reservation_status,
                    $d->deposit_status,
                    Money::fromCents(Money::toCents((string) ($d->deposit_amount ?? '0.00'))),
                    Money::fromCents(Money::toCents((string) ($d->service_fee ?? '0.00'))),
                    (string) $d->reservation_start,
                ];
            }
        } else {
            $headers = ['Payment Reference', 'Type', 'Method', 'Channel', 'Status', 'Amount', 'Created At'];
            $data = DB::table('payments')
                ->where('created_at', '>=', $range['start'])
                ->where('created_at', '<', $range['end_exclusive'])
                ->orderBy('payment_id')
                ->get([
                    'payment_reference',
                    'payment_type',
                    'payment_method',
                    'payment_channel',
                    'payment_status',
                    'amount',
                    'created_at',
                ]);
            foreach ($data as $d) {
                $rows[] = [
                    $d->payment_reference,
                    $d->payment_type,
                    $d->payment_method,
                    (string) ($d->payment_channel ?? ''),
                    $d->payment_status,
                    Money::fromCents(Money::toCents((string) $d->amount)),
                    (string) $d->created_at,
                ];
            }
        }

        $csvLines = [$this->formatCsvRow($headers)];
        foreach ($rows as $row) {
            $csvLines[] = $this->formatCsvRow($row);
        }

        $this->auditLogService->record(
            actorUserId: (int) $admin->user_id,
            action: 'admin_report.exported',
            entityType: 'reports',
            entityId: $type,
            newValues: [
                'type' => $type,
                'from' => $range['from'],
                'to' => $range['to'],
                'row_count' => count($rows),
            ],
            reason: "Exported {$type} CSV ({$range['from']} to {$range['to']})",
            request: $request,
        );

        return [
            'filename' => "salo-{$type}-{$range['from']}-to-{$range['to']}.csv",
            'csv' => implode("\r\n", $csvLines)."\r\n",
            'row_count' => count($rows),
        ];
    }

    /**
     * @param  array<int, mixed>  $fields
     */
    private function formatCsvRow(array $fields): string
    {
        $escaped = array_map(function (mixed $value): string {
            $str = (string) ($value ?? '');
            if ($str !== '' && in_array($str[0], ['=', '+', '-', '@', "\t", "\r"], true)) {
                $str = "'".$str;
            }

            return '"'.str_replace('"', '""', $str).'"';
        }, $fields);

        return implode(',', $escaped);
    }
}
