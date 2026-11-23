<?php

namespace App\Features\Riders\Services;

use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\RestaurantBranchService;
use App\Support\WorkspaceAccessResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RiderFinanceService
{
    public function __construct(
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
        private readonly AuditLogService $auditLogService,
    ) {}

    /**
     * Return the active rider's delivery earnings and COD remittance summary + ledger rows.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function getFinanceSummary(User $user, array $filters = []): array
    {
        $rider = $this->workspaceAccessResolver->requireActiveRider($user);
        $riderId = (int) $rider->rider_id;

        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 20)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $statusFilter = trim((string) ($filters['remittance_status'] ?? ''));

        $agg = DB::table('deliveries as d')
            ->join('orders as o', 'o.order_id', '=', 'd.order_id')
            ->where('d.rider_id', $riderId)
            ->where('d.delivery_status', 'delivered')
            ->selectRaw("
                COUNT(*) as total_deliveries_completed,
                COALESCE(SUM(CASE WHEN d.rider_compensation > 0 THEN d.rider_compensation ELSE o.delivery_fee END), 0) as total_delivery_earnings,
                COALESCE(SUM(CASE WHEN d.cod_remittance_status = 'pending' THEN COALESCE(d.cod_amount_collected, 0) ELSE 0 END), 0) as cod_pending_amount,
                SUM(CASE WHEN d.cod_remittance_status = 'pending' THEN 1 ELSE 0 END) as cod_pending_count,
                COALESCE(SUM(CASE WHEN d.cod_remittance_status = 'submitted' THEN COALESCE(d.cod_amount_collected, 0) ELSE 0 END), 0) as cod_submitted_amount,
                SUM(CASE WHEN d.cod_remittance_status = 'submitted' THEN 1 ELSE 0 END) as cod_submitted_count,
                COALESCE(SUM(CASE WHEN d.cod_remittance_status = 'confirmed' THEN COALESCE(d.cod_amount_collected, 0) ELSE 0 END), 0) as cod_confirmed_amount,
                SUM(CASE WHEN d.cod_remittance_status = 'confirmed' THEN 1 ELSE 0 END) as cod_confirmed_count,
                COALESCE(SUM(CASE WHEN d.cod_remittance_status = 'discrepancy' THEN COALESCE(d.cod_amount_collected, 0) ELSE 0 END), 0) as cod_discrepancy_amount,
                SUM(CASE WHEN d.cod_remittance_status = 'discrepancy' THEN 1 ELSE 0 END) as cod_discrepancy_count
            ")
            ->first();

        $rowsQuery = DB::table('deliveries as d')
            ->join('orders as o', 'o.order_id', '=', 'd.order_id')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->where('d.rider_id', $riderId)
            ->where('d.delivery_status', 'delivered');

        if ($statusFilter !== '' && $statusFilter !== 'all') {
            $rowsQuery->where('d.cod_remittance_status', $statusFilter);
        }

        $total = (int) (clone $rowsQuery)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));

        $rows = $rowsQuery
            ->select([
                'd.delivery_id',
                'd.order_id',
                'o.order_reference',
                'r.restaurant_name',
                'r.branch_name',
                'd.rider_compensation',
                'o.delivery_fee',
                'o.total_amount',
                'd.cod_amount_collected',
                'd.cod_collected_at',
                'd.cod_remittance_status',
                'd.cod_remitted_at',
                'd.delivered_at',
            ])
            ->orderByDesc('d.delivered_at')
            ->orderByDesc('d.delivery_id')
            ->forPage($page, $perPage)
            ->get();

        $deliveries = $rows->map(static function (object $row): array {
            $earning = (float) $row->rider_compensation > 0
                ? (float) $row->rider_compensation
                : (float) $row->delivery_fee;

            return [
                'delivery_id' => (int) $row->delivery_id,
                'order_id' => (int) $row->order_id,
                'order_reference' => $row->order_reference,
                'restaurant_name' => RestaurantBranchService::formatDisplayName((string) $row->restaurant_name, $row->branch_name ?? null),
                'order_total' => (float) $row->total_amount,
                'rider_earning' => round($earning, 2),
                'cod_amount_collected' => $row->cod_amount_collected !== null ? (float) $row->cod_amount_collected : 0.0,
                'cod_collected_at' => OrderTimestampFormatter::toManilaIso($row->cod_collected_at),
                'cod_remittance_status' => (string) $row->cod_remittance_status,
                'cod_remitted_at' => OrderTimestampFormatter::toManilaIso($row->cod_remitted_at),
                'delivered_at' => OrderTimestampFormatter::toManilaIso($row->delivered_at),
            ];
        })->all();

        return [
            'summary' => [
                'total_deliveries_completed' => (int) ($agg->total_deliveries_completed ?? 0),
                'total_delivery_earnings' => round((float) ($agg->total_delivery_earnings ?? 0), 2),
                'cod_pending_amount' => round((float) ($agg->cod_pending_amount ?? 0), 2),
                'cod_pending_count' => (int) ($agg->cod_pending_count ?? 0),
                'cod_submitted_amount' => round((float) ($agg->cod_submitted_amount ?? 0), 2),
                'cod_submitted_count' => (int) ($agg->cod_submitted_count ?? 0),
                'cod_confirmed_amount' => round((float) ($agg->cod_confirmed_amount ?? 0), 2),
                'cod_confirmed_count' => (int) ($agg->cod_confirmed_count ?? 0),
                'cod_discrepancy_amount' => round((float) ($agg->cod_discrepancy_amount ?? 0), 2),
                'cod_discrepancy_count' => (int) ($agg->cod_discrepancy_count ?? 0),
            ],
            'deliveries' => $deliveries,
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => $lastPage,
            ],
        ];
    }

    /**
     * Submit one or more pending/discrepancy COD deliveries for admin remittance verification.
     *
     * @param  array<int, mixed>  $deliveryIds
     * @return array<string, mixed>
     */
    public function submitCodRemittance(
        User $user,
        array $deliveryIds,
        ?string $notes,
        Request $request,
    ): array {
        $rider = $this->workspaceAccessResolver->requireActiveRider($user);
        $riderId = (int) $rider->rider_id;

        $ids = array_values(array_unique(array_filter(
            array_map(static fn ($id) => is_numeric($id) ? (int) $id : 0, $deliveryIds),
            static fn (int $id) => $id > 0,
        )));

        if ($ids === []) {
            throw ValidationException::withMessages([
                'delivery_ids' => ['Select at least one COD delivery to submit for remittance.'],
            ]);
        }

        $trimmedNotes = $notes !== null ? trim($notes) : null;
        if ($trimmedNotes === '') {
            $trimmedNotes = null;
        }
        if ($trimmedNotes !== null && mb_strlen($trimmedNotes) > 500) {
            throw ValidationException::withMessages([
                'notes' => ['Remittance notes must not exceed 500 characters.'],
            ]);
        }

        $result = DB::transaction(function () use ($user, $riderId, $ids, $trimmedNotes, $request): array {
            $rows = DB::table('deliveries')
                ->where('rider_id', $riderId)
                ->whereIn('delivery_id', $ids)
                ->lockForUpdate()
                ->get();

            if ($rows->count() !== count($ids)) {
                throw ValidationException::withMessages([
                    'delivery_ids' => ['One or more selected deliveries were not found for your rider account.'],
                ]);
            }

            $totalAmount = 0.0;
            foreach ($rows as $row) {
                if ($row->delivery_status !== 'delivered' || ! in_array($row->cod_remittance_status, ['pending', 'discrepancy'], true)) {
                    throw ValidationException::withMessages([
                        'delivery_ids' => ["Delivery #{$row->delivery_id} is not eligible for COD remittance submission."],
                    ]);
                }
                $totalAmount += (float) ($row->cod_amount_collected ?? 0);
            }

            $now = now();
            DB::table('deliveries')
                ->where('rider_id', $riderId)
                ->whereIn('delivery_id', $ids)
                ->update([
                    'cod_remittance_status' => 'submitted',
                    'cod_remitted_at' => $now,
                    'updated_at' => $now,
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'rider_cod_remittance_submitted',
                entityType: 'deliveries',
                entityId: (int) $ids[0],
                oldValues: ['cod_remittance_status' => 'pending_or_discrepancy'],
                newValues: [
                    'cod_remittance_status' => 'submitted',
                    'delivery_ids' => $ids,
                    'submitted_amount' => round($totalAmount, 2),
                ],
                reason: $trimmedNotes,
                request: $request,
            );

            return [
                'submitted_count' => count($ids),
                'submitted_amount' => round($totalAmount, 2),
                'delivery_ids' => $ids,
            ];
        });

        return [
            'submission' => $result,
            'finance' => $this->getFinanceSummary($user),
        ];
    }
}
