<?php

namespace App\Features\Admin\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\RestaurantBranchService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class AdminFinanceService
{
    public function __construct(
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
    ) {}

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
}
