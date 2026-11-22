<?php

namespace App\Features\Reservations\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Reservations\Support\ReservationAttention;
use App\Features\Reservations\Support\ReservationBookingException;
use App\Features\Reservations\Support\ReservationFormatter;
use App\Features\Reservations\Support\ReservationStatus;
use App\Features\Reservations\Support\ReservationStatusHistoryRecorder;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\SqlLike;
use App\Support\WorkspaceAccessResolver;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class OwnerReservationService
{
    private const TIMEZONE = 'Asia/Manila';

    public function __construct(
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
        private readonly ReservationAvailabilityService $availabilityService,
        private readonly ReservationStatusHistoryRecorder $historyRecorder,
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * List reservations for the authorized restaurant with date/range/status/group/table/area/search filters,
     * summary metrics for the range, pending_total_upcoming badge count, guest_history, allowed_actions, and attention flags.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function list(
        User $user,
        array $filters = [],
        ?int $restaurantId = null,
        ?CarbonInterface $now = null,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForReservations(
            $user,
            $restaurantId,
            'reservations.view',
        );
        $targetRestaurantId = (int) $restaurant->restaurant_id;
        $manilaNow = $this->toManilaImmutable($now);
        $todayStr = $manilaNow->format('Y-m-d');

        $dateFrom = isset($filters['date_from']) && is_string($filters['date_from']) && trim($filters['date_from']) !== ''
            ? trim($filters['date_from'])
            : null;
        $dateTo = isset($filters['date_to']) && is_string($filters['date_to']) && trim($filters['date_to']) !== ''
            ? trim($filters['date_to'])
            : null;
        $singleDate = isset($filters['date']) && is_string($filters['date']) && trim($filters['date']) !== ''
            ? trim($filters['date'])
            : null;

        if ($dateFrom === null && $dateTo === null) {
            $effectiveDate = $singleDate ?? $todayStr;
            $rangeStartStr = $effectiveDate . ' 00:00:00';
            $rangeEndStr = $effectiveDate . ' 23:59:59';
        } else {
            $rangeStartStr = ($dateFrom ?? $dateTo ?? $todayStr) . ' 00:00:00';
            $rangeEndStr = ($dateTo ?? $dateFrom ?? $todayStr) . ' 23:59:59';
        }

        $summary = $this->computeSummaryForRange($targetRestaurantId, $rangeStartStr, $rangeEndStr, $manilaNow);

        $query = $this->baseOwnerReservationQuery($targetRestaurantId)
            ->where('res.reservation_start', '>=', $rangeStartStr)
            ->where('res.reservation_start', '<=', $rangeEndStr);

        $group = isset($filters['group']) && is_string($filters['group']) && trim($filters['group']) !== ''
            ? strtolower(trim($filters['group']))
            : 'all';

        if ($group === 'active') {
            $query->whereIn('res.reservation_status', ReservationStatus::BLOCKING);
        } elseif ($group === 'pending') {
            $query->where('res.reservation_status', ReservationStatus::PENDING);
        } elseif ($group === 'history') {
            $query->whereIn('res.reservation_status', ReservationStatus::TERMINAL);
        }

        if (isset($filters['status']) && is_string($filters['status']) && trim($filters['status']) !== '') {
            $statuses = array_values(array_filter(array_map(
                static fn (string $s): string => strtolower(trim($s)),
                explode(',', $filters['status']),
            )));
            if ($statuses !== [] && ! in_array('all', $statuses, true)) {
                $query->whereIn('res.reservation_status', $statuses);
            }
        }

        if (isset($filters['table_id']) && (int) $filters['table_id'] > 0) {
            $query->where('res.table_id', (int) $filters['table_id']);
        }

        if (isset($filters['dining_area']) && is_string($filters['dining_area']) && trim($filters['dining_area']) !== '') {
            $cleanArea = mb_strtolower(trim($filters['dining_area']));
            if ($cleanArea !== 'all') {
                $query->whereRaw('LOWER(rt.dining_area) = ?', [$cleanArea]);
            }
        }

        if (isset($filters['search']) && is_string($filters['search']) && trim($filters['search']) !== '') {
            $pattern = '%' . SqlLike::escape(trim($filters['search'])) . '%';
            $query->where(static function (Builder $sub) use ($pattern): void {
                $sub->where('res.reservation_reference', 'like', $pattern)
                    ->orWhere('res.contact_name', 'like', $pattern)
                    ->orWhere('res.contact_phone', 'like', $pattern)
                    ->orWhere('u.email', 'like', $pattern)
                    ->orWhere('u.first_name', 'like', $pattern)
                    ->orWhere('u.last_name', 'like', $pattern);
            });
        }

        $sort = isset($filters['sort']) && is_string($filters['sort']) && trim($filters['sort']) !== ''
            ? strtolower(trim($filters['sort']))
            : 'time_asc';

        if ($sort === 'time_desc') {
            $query->orderBy('res.reservation_start', 'desc')->orderBy('res.reservation_id', 'desc');
        } elseif ($sort === 'created_desc') {
            $query->orderBy('res.created_at', 'desc')->orderBy('res.reservation_id', 'desc');
        } else {
            $query->orderBy('res.reservation_start', 'asc')->orderBy('res.reservation_id', 'asc');
        }

        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 20)));
        $page = max(1, (int) ($filters['page'] ?? 1));

        $paginator = $query->paginate($perPage, ['*'], 'page', $page);
        $rows = collect($paginator->items());

        $customerIds = $rows->pluck('customer_id')->map(static fn ($id): int => (int) $id)->unique()->values()->all();
        $guestHistories = $this->loadGuestHistories($targetRestaurantId, $customerIds);
        $permissions = $this->resolveUserPermissionsForRestaurant($user, $targetRestaurantId);

        $items = $rows->map(function (object $row) use ($restaurant, $guestHistories, $permissions, $manilaNow): array {
            $custId = (int) $row->customer_id;
            $history = $guestHistories[$custId] ?? ['visits' => 0, 'no_shows' => 0, 'cancellations' => 0];

            return $this->formatOwnerRow($row, $restaurant, $history, $permissions, $manilaNow);
        })->values()->all();

        return [
            'items' => $items,
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
            'summary' => $summary,
        ];
    }

    /**
     * Monthly calendar summary using ONE grouped SQL query.
     *
     * @return array<string, mixed>
     */
    public function calendar(
        User $user,
        string $month,
        ?int $restaurantId = null,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForReservations(
            $user,
            $restaurantId,
            'reservations.view',
        );
        $targetRestaurantId = (int) $restaurant->restaurant_id;

        $monthStart = CarbonImmutable::parse($month . '-01 00:00:00', self::TIMEZONE)->startOfMonth();
        $monthEnd = $monthStart->endOfMonth()->endOfDay();
        $daysInMonth = (int) $monthStart->daysInMonth;

        $grouped = DB::table('reservations')
            ->where('restaurant_id', $targetRestaurantId)
            ->whereBetween('reservation_start', [
                $monthStart->format('Y-m-d H:i:s'),
                $monthEnd->format('Y-m-d H:i:s'),
            ])
            ->groupByRaw('DATE(reservation_start)')
            ->selectRaw(
                "DATE(reservation_start) AS res_date,
                COUNT(*) AS total,
                SUM(CASE WHEN reservation_status = 'pending' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN reservation_status IN ('approved', 'awaiting_payment', 'confirmed') THEN 1 ELSE 0 END) AS confirmed,
                SUM(CASE WHEN reservation_status IN ('arrived', 'seated') THEN 1 ELSE 0 END) AS in_house,
                SUM(CASE WHEN reservation_status = 'completed' THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN reservation_status IN ('cancelled', 'rejected', 'expired', 'no_show') THEN 1 ELSE 0 END) AS cancelled_or_missed,
                COALESCE(SUM(CASE WHEN reservation_status IN ('pending', 'approved', 'awaiting_payment', 'confirmed', 'arrived', 'seated') THEN number_of_guests ELSE 0 END), 0) AS covers"
            )
            ->get()
            ->keyBy('res_date');

        $days = [];
        for ($d = 0; $d < $daysInMonth; $d++) {
            $dateStr = $monthStart->addDays($d)->format('Y-m-d');
            $agg = $grouped->get($dateStr);

            $days[] = [
                'date' => $dateStr,
                'total' => (int) ($agg->total ?? 0),
                'pending' => (int) ($agg->pending ?? 0),
                'confirmed' => (int) ($agg->confirmed ?? 0),
                'in_house' => (int) ($agg->in_house ?? 0),
                'completed' => (int) ($agg->completed ?? 0),
                'cancelled_or_missed' => (int) ($agg->cancelled_or_missed ?? 0),
                'covers' => (int) ($agg->covers ?? 0),
            ];
        }

        return [
            'restaurant_id' => $targetRestaurantId,
            'month' => $monthStart->format('Y-m'),
            'days' => $days,
        ];
    }

    /**
     * Get single reservation detail for owner/staff workspace including status_history and restaurant settings.
     *
     * @return array<string, mixed>
     */
    public function getDetail(
        User $user,
        int $reservationId,
        ?int $restaurantId = null,
        ?CarbonInterface $now = null,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForReservations(
            $user,
            $restaurantId,
            'reservations.view',
        );

        return $this->loadOwnerFormattedDetail($user, $restaurant, $reservationId, $now);
    }

    public function approve(
        User $user,
        int $reservationId,
        ?string $note,
        ?int $restaurantId,
        Request $request,
        ?CarbonInterface $now = null,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForReservations(
            $user,
            $restaurantId,
            'reservations.approve',
        );
        $targetRestaurantId = (int) $restaurant->restaurant_id;
        $manilaNow = $this->toManilaImmutable($now);

        $depositRequired = (bool) ($restaurant->reservation_deposit_required ?? false);

        return DB::transaction(function () use (
            $user,
            $restaurant,
            $targetRestaurantId,
            $reservationId,
            $note,
            $request,
            $manilaNow,
            $depositRequired,
        ): array {
            $row = DB::table('reservations')
                ->where('reservation_id', $reservationId)
                ->where('restaurant_id', $targetRestaurantId)
                ->lockForUpdate()
                ->first();

            if (! $row) {
                throw new NotFoundHttpException('Reservation not found.');
            }

            $currentStatus = (string) $row->reservation_status;
            $requiresDepositPayment = $depositRequired
                && (float) ($row->deposit_amount ?? 0) > 0
                && (string) ($row->deposit_status ?? 'none') === 'pending';

            $targetStatus = $requiresDepositPayment
                ? ReservationStatus::AWAITING_PAYMENT
                : ReservationStatus::CONFIRMED;

            // Idempotent when already in target state (or already confirmed)
            if (
                $currentStatus === $targetStatus
                || ($currentStatus === ReservationStatus::CONFIRMED && $targetStatus === ReservationStatus::CONFIRMED)
            ) {
                return $this->loadOwnerFormattedDetail($user, $restaurant, $reservationId, $manilaNow);
            }

            if (! ReservationStatus::canTransition($currentStatus, $targetStatus)) {
                throw $this->invalidTransitionException($currentStatus, $targetStatus);
            }

            $startCarbon = CarbonImmutable::parse((string) $row->reservation_start, self::TIMEZONE);
            $endCarbon = CarbonImmutable::parse((string) $row->reservation_end, self::TIMEZONE);

            if ($startCarbon->lessThanOrEqualTo($manilaNow)) {
                throw new ReservationBookingException(
                    errorCode: 'RESERVATION_PASSED',
                    message: 'Cannot approve this reservation because its scheduled start time has already passed.',
                    statusCode: 409,
                );
            }

            $assignedTableId = $row->table_id !== null ? (int) $row->table_id : null;
            if ($assignedTableId === null) {
                throw new ReservationBookingException(
                    errorCode: 'TABLE_UNAVAILABLE',
                    message: 'No table is assigned to this reservation. Please assign an active table before approving.',
                    statusCode: 409,
                );
            }

            $tableRow = DB::table('restaurant_tables')
                ->where('table_id', $assignedTableId)
                ->where('restaurant_id', $targetRestaurantId)
                ->lockForUpdate()
                ->first();

            $partySize = (int) $row->number_of_guests;
            if (
                ! $tableRow
                || (int) $tableRow->is_active !== 1
                || $partySize < max(1, (int) ($tableRow->min_party_size ?? 1))
                || $partySize > (int) $tableRow->seating_capacity
            ) {
                throw new ReservationBookingException(
                    errorCode: 'TABLE_UNAVAILABLE',
                    message: 'The assigned table is archived or no longer fits this party size. Please reassign a table first.',
                    statusCode: 409,
                );
            }

            // Re-check availability excluding this reservation (a stale pending may have freed/lost its hold)
            $available = $this->availabilityService->getAvailableTables(
                restaurantId: $targetRestaurantId,
                start: $startCarbon,
                end: $endCarbon,
                partySize: $partySize,
                diningArea: null,
                excludeReservationId: $reservationId,
                lockForUpdate: true,
                onlyTableId: $assignedTableId,
                now: $manilaNow,
            );

            if ($available->isEmpty()) {
                throw new ReservationBookingException(
                    errorCode: 'SLOT_TAKEN',
                    message: "Table {$tableRow->table_name} was booked by another reservation for this time slot. Please reassign a different table first.",
                    statusCode: 409,
                );
            }

            $nowStr = $manilaNow->format('Y-m-d H:i:s');
            $updateFields = [
                'reservation_status' => $targetStatus,
                'approved_at' => $nowStr,
                'updated_at' => $nowStr,
            ];
            if ($targetStatus === ReservationStatus::CONFIRMED) {
                $updateFields['confirmed_at'] = $nowStr;
            }

            DB::table('reservations')
                ->where('reservation_id', $reservationId)
                ->where('restaurant_id', $targetRestaurantId)
                ->update($updateFields);

            $defaultNote = $targetStatus === ReservationStatus::AWAITING_PAYMENT
                ? 'Reservation approved; awaiting deposit settlement.'
                : 'Reservation approved and confirmed.';

            $this->recordSideEffects(
                reservationId: $reservationId,
                row: $row,
                restaurant: $restaurant,
                actor: $user,
                action: 'approve',
                fromStatus: $currentStatus,
                toStatus: $targetStatus,
                oldValues: ['reservation_status' => $currentStatus],
                newValues: $updateFields,
                note: $note ?? $defaultNote,
                auditReason: $note,
                request: $request,
                manilaNow: $manilaNow,
                notificationSpec: $targetStatus === ReservationStatus::AWAITING_PAYMENT
                    ? [
                        'type' => 'reservation_awaiting_payment',
                        'title' => "Reservation Approved — Deposit Required ({$row->reservation_reference})",
                        'body' => "Your request at {$restaurant->restaurant_name} for {$startCarbon->format('M j, Y \a\t g:i A')} is approved — please settle your ₱" . number_format((float) $row->deposit_amount, 2) . ' deposit directly with the restaurant to secure your table.',
                    ]
                    : [
                        'type' => 'reservation_confirmed',
                        'title' => "Reservation Confirmed ({$row->reservation_reference})",
                        'body' => "Your table at {$restaurant->restaurant_name} for {$row->number_of_guests} guest(s) on {$startCarbon->format('M j, Y \a\t g:i A')} is confirmed!",
                    ],
            );

            return $this->loadOwnerFormattedDetail($user, $restaurant, $reservationId, $manilaNow);
        });
    }

    public function reject(
        User $user,
        int $reservationId,
        string $reason,
        ?int $restaurantId,
        Request $request,
        ?CarbonInterface $now = null,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForReservations(
            $user,
            $restaurantId,
            'reservations.reject',
        );
        $cleanReason = mb_substr(trim($reason), 0, 255);

        return $this->transition(
            restaurant: $restaurant,
            reservationId: $reservationId,
            action: 'reject',
            toStatus: ReservationStatus::REJECTED,
            extraFields: static fn (object $row, CarbonImmutable $manilaNow): array => [
                'rejection_reason' => $cleanReason,
                'rejected_at' => $manilaNow->format('Y-m-d H:i:s'),
            ],
            note: $cleanReason,
            actor: $user,
            request: $request,
            checks: static function (): void {},
            notificationFactory: static function (object $row, object $rest, CarbonImmutable $start) use ($cleanReason): array {
                $ref = $row->reservation_reference ?: ('#' . $row->reservation_id);

                return [
                    'type' => 'reservation_rejected',
                    'title' => "Reservation Declined ({$ref})",
                    'body' => "Your reservation request at {$rest->restaurant_name} for {$start->format('M j, Y \a\t g:i A')} was declined. Reason: {$cleanReason}",
                ];
            },
            now: $now,
        );
    }

    public function confirmDeposit(
        User $user,
        int $reservationId,
        ?string $note,
        ?int $restaurantId,
        Request $request,
        ?CarbonInterface $now = null,
    ): array {
        return $this->updateDeposit(
            user: $user,
            reservationId: $reservationId,
            targetDepositStatus: 'paid',
            note: $note ?? 'Deposit settled and reservation confirmed.',
            restaurantId: $restaurantId,
            request: $request,
            now: $now,
            requireAwaitingPayment: true,
        );
    }

    public function updateDeposit(
        User $user,
        int $reservationId,
        string $targetDepositStatus,
        ?string $note,
        ?int $restaurantId,
        Request $request,
        ?CarbonInterface $now = null,
        bool $requireAwaitingPayment = false,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForReservations(
            $user,
            $restaurantId,
            'reservations.updateStatus',
        );
        $targetRestaurantId = (int) $restaurant->restaurant_id;
        $manilaNow = $this->toManilaImmutable($now);

        DB::transaction(function () use (
            $restaurant,
            $targetRestaurantId,
            $reservationId,
            $targetDepositStatus,
            $note,
            $user,
            $request,
            $manilaNow,
            $requireAwaitingPayment,
        ): void {
            $row = DB::table('reservations')
                ->where('reservation_id', $reservationId)
                ->where('restaurant_id', $targetRestaurantId)
                ->lockForUpdate()
                ->first();

            if (! $row) {
                throw new NotFoundHttpException('Reservation not found.');
            }

            $depositAmount = (float) ($row->deposit_amount ?? 0);
            $currentDepositStatus = (string) ($row->deposit_status ?? 'none');
            $currentStatus = (string) $row->reservation_status;

            if ($depositAmount <= 0 || $currentDepositStatus === 'none') {
                throw new ReservationBookingException(
                    errorCode: 'NO_DEPOSIT',
                    message: 'This reservation does not have a deposit.',
                    statusCode: 409,
                );
            }

            if ($requireAwaitingPayment && $currentStatus !== ReservationStatus::AWAITING_PAYMENT) {
                if ($currentStatus === ReservationStatus::CONFIRMED && $currentDepositStatus === 'paid') {
                    return;
                }
                throw new ReservationBookingException(
                    errorCode: 'INVALID_TRANSITION',
                    message: "Cannot confirm deposit while reservation is {$currentStatus}.",
                    statusCode: 409,
                );
            }

            // Idempotent when target deposit_status matches current
            if ($targetDepositStatus === $currentDepositStatus) {
                return;
            }

            $allowedTargets = config("salo.reservations.deposit_transitions.{$currentDepositStatus}", []);
            if (! is_array($allowedTargets) || ! in_array($targetDepositStatus, $allowedTargets, true)) {
                throw new ReservationBookingException(
                    errorCode: 'INVALID_DEPOSIT_TRANSITION',
                    message: "Cannot change deposit status from {$currentDepositStatus} to {$targetDepositStatus}.",
                    statusCode: 409,
                );
            }

            $nowStr = $manilaNow->format('Y-m-d H:i:s');
            $movesToConfirmed = $currentStatus === ReservationStatus::AWAITING_PAYMENT
                && in_array($targetDepositStatus, ['paid', 'waived'], true);
            $newStatus = $movesToConfirmed ? ReservationStatus::CONFIRMED : $currentStatus;

            $updates = [
                'deposit_status' => $targetDepositStatus,
                'updated_at' => $nowStr,
            ];

            if ($movesToConfirmed) {
                $updates['reservation_status'] = ReservationStatus::CONFIRMED;
                $updates['confirmed_at'] = $nowStr;
            }

            DB::table('reservations')
                ->where('reservation_id', $reservationId)
                ->where('restaurant_id', $targetRestaurantId)
                ->update($updates);

            $cleanNote = $note !== null && trim($note) !== '' ? mb_substr(trim($note), 0, 255) : null;
            $historyNote = $cleanNote ?? match ($targetDepositStatus) {
                'paid' => $movesToConfirmed ? 'Deposit settled and reservation confirmed.' : 'Deposit marked as received.',
                'waived' => $movesToConfirmed ? 'Deposit waived and reservation confirmed.' : 'Deposit waived by restaurant.',
                'refunded' => 'Deposit marked as refunded by restaurant.',
                default => "Deposit status updated to {$targetDepositStatus}.",
            };

            $this->historyRecorder->record(
                reservationId: $reservationId,
                fromStatus: $currentStatus,
                toStatus: $newStatus,
                changedByUserId: (int) $user->user_id,
                changedByRole: 'restaurant',
                note: $historyNote,
                createdAt: $manilaNow,
            );

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: "restaurant_reservation_deposit_{$targetDepositStatus}",
                entityType: 'reservations',
                entityId: $reservationId,
                oldValues: [
                    'deposit_status' => $currentDepositStatus,
                    'reservation_status' => $currentStatus,
                ],
                newValues: [
                    'deposit_status' => $targetDepositStatus,
                    'reservation_status' => $newStatus,
                    'note' => $cleanNote,
                ],
                request: $request,
            );

            $ref = $row->reservation_reference ?: ('#' . $reservationId);
            $startCarbon = CarbonImmutable::parse((string) $row->reservation_start, self::TIMEZONE);
            $formattedAmount = number_format($depositAmount, 2);

            if ($movesToConfirmed) {
                $notifType = 'reservation_confirmed';
                $notifTitle = "Deposit Confirmed — Table Secured ({$ref})";
                $notifBody = $targetDepositStatus === 'waived'
                    ? "Your deposit was waived and your table at {$restaurant->restaurant_name} for {$startCarbon->format('M j, Y \a\t g:i A')} is confirmed!"
                    : "Your deposit has been recorded and your table at {$restaurant->restaurant_name} for {$startCarbon->format('M j, Y \a\t g:i A')} is confirmed!";
            } elseif ($targetDepositStatus === 'paid') {
                $notifType = 'reservation_deposit_received';
                $notifTitle = "Deposit Received ({$ref})";
                $notifBody = "Your deposit of ₱{$formattedAmount} for {$restaurant->restaurant_name} ({$ref}) was marked as received.";
            } elseif ($targetDepositStatus === 'waived') {
                $notifType = 'reservation_deposit_waived';
                $notifTitle = "Deposit Waived ({$ref})";
                $notifBody = "Your deposit was waived by {$restaurant->restaurant_name} for reservation {$ref}.";
            } else {
                $notifType = 'reservation_deposit_refunded';
                $notifTitle = "Deposit Refunded ({$ref})";
                $notifBody = "Your deposit of ₱{$formattedAmount} was marked as refunded by the restaurant ({$restaurant->restaurant_name}, {$ref}).";
            }

            $this->notificationService->notifyUser(
                userId: (int) $row->customer_id,
                workspace: 'customer',
                type: $notifType,
                title: $notifTitle,
                body: $notifBody,
                relatedEntityType: 'reservation',
                relatedEntityId: $reservationId,
            );
        });

        return $this->getDetail($user, $reservationId, $restaurantId, $manilaNow);
    }

    public function markArrived(
        User $user,
        int $reservationId,
        ?string $note,
        ?int $restaurantId,
        Request $request,
        ?CarbonInterface $now = null,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForReservations(
            $user,
            $restaurantId,
            'reservations.manageArrival',
        );

        return $this->transition(
            restaurant: $restaurant,
            reservationId: $reservationId,
            action: 'arrived',
            toStatus: ReservationStatus::ARRIVED,
            extraFields: static fn (object $row, CarbonImmutable $manilaNow): array => [
                'arrived_at' => $manilaNow->format('Y-m-d H:i:s'),
            ],
            note: $note ?? 'Guest arrived at restaurant.',
            actor: $user,
            request: $request,
            checks: function (object $row, CarbonImmutable $manilaNow): void {
                $this->assertWithinArrivalSeatingWindow($row, $manilaNow);
            },
            notificationFactory: null,
            now: $now,
        );
    }

    public function seat(
        User $user,
        int $reservationId,
        ?int $tableId,
        ?string $note,
        ?int $restaurantId,
        Request $request,
        ?CarbonInterface $now = null,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForReservations(
            $user,
            $restaurantId,
            'reservations.updateStatus',
        );
        $targetRestaurantId = (int) $restaurant->restaurant_id;

        $resolvedTableName = null;

        return $this->transition(
            restaurant: $restaurant,
            reservationId: $reservationId,
            action: 'seat',
            toStatus: ReservationStatus::SEATED,
            extraFields: static function (object $row, CarbonImmutable $manilaNow) use ($tableId): array {
                $nowStr = $manilaNow->format('Y-m-d H:i:s');
                $fields = [
                    'seated_at' => $nowStr,
                    'arrived_at' => $row->arrived_at ?? $nowStr,
                ];
                if ($tableId !== null) {
                    $fields['table_id'] = $tableId;
                }

                return $fields;
            },
            note: function (object $row) use (&$resolvedTableName, $note): string {
                if ($note !== null && trim($note) !== '') {
                    return trim($note);
                }

                return $resolvedTableName !== null
                    ? "Seated at Table {$resolvedTableName}."
                    : 'Guest seated at assigned table.';
            },
            actor: $user,
            request: $request,
            checks: function (object $row, CarbonImmutable $manilaNow) use ($targetRestaurantId, $tableId, &$resolvedTableName): void {
                $this->assertWithinArrivalSeatingWindow($row, $manilaNow);

                $effectiveTableId = $tableId ?? ($row->table_id !== null ? (int) $row->table_id : null);
                if ($effectiveTableId === null) {
                    throw new ReservationBookingException(
                        errorCode: 'TABLE_UNAVAILABLE',
                        message: 'An active table must be assigned before seating the guest.',
                        statusCode: 409,
                    );
                }

                $tableRow = DB::table('restaurant_tables')
                    ->where('table_id', $effectiveTableId)
                    ->where('restaurant_id', $targetRestaurantId)
                    ->lockForUpdate()
                    ->first();

                if (! $tableRow) {
                    if ($tableId !== null) {
                        throw new NotFoundHttpException('Table not found.');
                    }
                    throw new ReservationBookingException(
                        errorCode: 'TABLE_UNAVAILABLE',
                        message: 'The assigned table no longer exists. Please select an active table.',
                        statusCode: 409,
                    );
                }

                $partySize = (int) $row->number_of_guests;
                if (
                    (int) $tableRow->is_active !== 1
                    || $partySize < max(1, (int) ($tableRow->min_party_size ?? 1))
                    || $partySize > (int) $tableRow->seating_capacity
                ) {
                    throw new ReservationBookingException(
                        errorCode: 'TABLE_UNAVAILABLE',
                        message: "Table {$tableRow->table_name} is archived or cannot accommodate {$partySize} guest(s).",
                        statusCode: 409,
                    );
                }

                $startCarbon = CarbonImmutable::parse((string) $row->reservation_start, self::TIMEZONE);
                $endCarbon = CarbonImmutable::parse((string) $row->reservation_end, self::TIMEZONE);

                $available = $this->availabilityService->getAvailableTables(
                    restaurantId: $targetRestaurantId,
                    start: $startCarbon,
                    end: $endCarbon,
                    partySize: $partySize,
                    diningArea: null,
                    excludeReservationId: (int) $row->reservation_id,
                    lockForUpdate: true,
                    onlyTableId: $effectiveTableId,
                    now: $manilaNow,
                );

                if ($available->isEmpty()) {
                    throw new ReservationBookingException(
                        errorCode: 'SLOT_TAKEN',
                        message: "Table {$tableRow->table_name} is currently occupied or reserved by another booking.",
                        statusCode: 409,
                    );
                }

                $resolvedTableName = (string) $tableRow->table_name;
            },
            notificationFactory: null,
            now: $now,
        );
    }

    public function complete(
        User $user,
        int $reservationId,
        ?string $note,
        ?int $restaurantId,
        Request $request,
        ?CarbonInterface $now = null,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForReservations(
            $user,
            $restaurantId,
            'reservations.updateStatus',
        );

        return $this->transition(
            restaurant: $restaurant,
            reservationId: $reservationId,
            action: 'complete',
            toStatus: ReservationStatus::COMPLETED,
            extraFields: static fn (object $row, CarbonImmutable $manilaNow): array => [
                'completed_at' => $manilaNow->format('Y-m-d H:i:s'),
            ],
            note: $note ?? 'Reservation completed.',
            actor: $user,
            request: $request,
            checks: static function (): void {},
            notificationFactory: static function (object $row, object $rest): array {
                $ref = $row->reservation_reference ?: ('#' . $row->reservation_id);

                return [
                    'type' => 'reservation_completed',
                    'title' => "Thanks for Dining With Us ({$ref})",
                    'body' => "Your dining reservation at {$rest->restaurant_name} is marked completed. We hope to see you again soon!",
                ];
            },
            now: $now,
        );
    }

    public function markNoShow(
        User $user,
        int $reservationId,
        ?string $note,
        ?int $restaurantId,
        Request $request,
        ?CarbonInterface $now = null,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForReservations(
            $user,
            $restaurantId,
            'reservations.manageArrival',
        );
        $graceMinutes = max(0, (int) config('salo.reservations.no_show_grace_minutes', 15));

        return $this->transition(
            restaurant: $restaurant,
            reservationId: $reservationId,
            action: 'no_show',
            toStatus: ReservationStatus::NO_SHOW,
            extraFields: static fn (object $row, CarbonImmutable $manilaNow, User $actor): array => [
                // DB constraint chk_reservations_no_show requires BOTH columns in the same UPDATE
                'no_show_marked_at' => $manilaNow->format('Y-m-d H:i:s'),
                'no_show_marked_by' => (int) $actor->user_id,
            ],
            note: $note ?? 'Guest marked as no-show after grace period.',
            actor: $user,
            request: $request,
            checks: static function (object $row, CarbonImmutable $manilaNow) use ($graceMinutes): void {
                $startCarbon = CarbonImmutable::parse((string) $row->reservation_start, self::TIMEZONE);
                $earliestNoShow = $startCarbon->addMinutes($graceMinutes);

                if ($manilaNow->lessThan($earliestNoShow)) {
                    throw new ReservationBookingException(
                        errorCode: 'NO_SHOW_TOO_EARLY',
                        message: "Cannot mark as no-show until after the {$graceMinutes}-minute grace period ({$earliestNoShow->format('M j, Y g:i A')}).",
                        statusCode: 409,
                    );
                }
            },
            notificationFactory: static function (object $row, object $rest, CarbonImmutable $start): array {
                $ref = $row->reservation_reference ?: ('#' . $row->reservation_id);

                return [
                    'type' => 'reservation_no_show',
                    'title' => "Reservation Marked No-Show ({$ref})",
                    'body' => "Your reservation at {$rest->restaurant_name} for {$start->format('M j, Y \a\t g:i A')} was marked as a no-show after the grace period.",
                ];
            },
            now: $now,
        );
    }

    public function cancel(
        User $user,
        int $reservationId,
        string $reason,
        ?int $restaurantId,
        Request $request,
        ?CarbonInterface $now = null,
        bool $refundDeposit = false,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForReservations(
            $user,
            $restaurantId,
            'reservations.updateStatus',
        );
        $cleanReason = mb_substr(trim($reason), 0, 255);

        return $this->transition(
            restaurant: $restaurant,
            reservationId: $reservationId,
            action: 'cancel',
            toStatus: ReservationStatus::CANCELLED,
            extraFields: static function (object $row, CarbonImmutable $manilaNow) use ($cleanReason, $refundDeposit): array {
                $fields = [
                    'cancelled_by' => 'restaurant',
                    'cancelled_at' => $manilaNow->format('Y-m-d H:i:s'),
                    'cancellation_reason' => $cleanReason,
                    'cancellation_fee' => '0.00',
                ];

                if ($refundDeposit && ((string) ($row->deposit_status ?? 'none')) === 'paid') {
                    $fields['deposit_status'] = 'refunded';
                }

                return $fields;
            },
            note: $cleanReason,
            actor: $user,
            request: $request,
            checks: static function (): void {},
            notificationFactory: static function (object $row, object $rest, CarbonImmutable $start) use ($cleanReason, $refundDeposit): array {
                $ref = $row->reservation_reference ?: ('#' . $row->reservation_id);
                $refundNote = ($refundDeposit && ((string) ($row->deposit_status ?? 'none')) === 'paid')
                    ? ' Your deposit of ₱'.number_format((float) ($row->deposit_amount ?? 0), 2).' was marked as refunded.'
                    : '';

                return [
                    'type' => 'reservation_cancelled_by_restaurant',
                    'title' => "Reservation Cancelled by Restaurant ({$ref})",
                    'body' => "Your reservation at {$rest->restaurant_name} for {$start->format('M j, Y \a\t g:i A')} was cancelled by the restaurant. Reason: {$cleanReason}{$refundNote}",
                ];
            },
            now: $now,
        );
    }

    public function assignTable(
        User $user,
        int $reservationId,
        int $tableId,
        ?int $restaurantId,
        Request $request,
        ?CarbonInterface $now = null,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForReservations(
            $user,
            $restaurantId,
            'reservations.assignTables',
        );
        $targetRestaurantId = (int) $restaurant->restaurant_id;
        $manilaNow = $this->toManilaImmutable($now);

        return DB::transaction(function () use (
            $user,
            $restaurant,
            $targetRestaurantId,
            $reservationId,
            $tableId,
            $request,
            $manilaNow,
        ): array {
            $row = DB::table('reservations')
                ->where('reservation_id', $reservationId)
                ->where('restaurant_id', $targetRestaurantId)
                ->lockForUpdate()
                ->first();

            if (! $row) {
                throw new NotFoundHttpException('Reservation not found.');
            }

            $currentStatus = (string) $row->reservation_status;
            $reassignableStatuses = [
                ReservationStatus::PENDING,
                ReservationStatus::APPROVED,
                ReservationStatus::AWAITING_PAYMENT,
                ReservationStatus::CONFIRMED,
                ReservationStatus::ARRIVED,
            ];

            if (! in_array($currentStatus, $reassignableStatuses, true)) {
                throw new ReservationBookingException(
                    errorCode: 'INVALID_TRANSITION',
                    message: "Cannot reassign table while reservation is {$currentStatus}.",
                    statusCode: 409,
                );
            }

            $oldTableId = $row->table_id !== null ? (int) $row->table_id : null;
            if ($oldTableId === $tableId) {
                return $this->loadOwnerFormattedDetail($user, $restaurant, $reservationId, $manilaNow);
            }

            $newTable = DB::table('restaurant_tables')
                ->where('table_id', $tableId)
                ->where('restaurant_id', $targetRestaurantId)
                ->lockForUpdate()
                ->first();

            if (! $newTable) {
                throw new NotFoundHttpException('Table not found.');
            }

            $partySize = (int) $row->number_of_guests;
            if (
                (int) $newTable->is_active !== 1
                || $partySize < max(1, (int) ($newTable->min_party_size ?? 1))
                || $partySize > (int) $newTable->seating_capacity
            ) {
                throw new ReservationBookingException(
                    errorCode: 'TABLE_UNAVAILABLE',
                    message: "Table {$newTable->table_name} is archived or cannot accommodate {$partySize} guest(s).",
                    statusCode: 409,
                );
            }

            $startCarbon = CarbonImmutable::parse((string) $row->reservation_start, self::TIMEZONE);
            $endCarbon = CarbonImmutable::parse((string) $row->reservation_end, self::TIMEZONE);

            $available = $this->availabilityService->getAvailableTables(
                restaurantId: $targetRestaurantId,
                start: $startCarbon,
                end: $endCarbon,
                partySize: $partySize,
                diningArea: null,
                excludeReservationId: $reservationId,
                lockForUpdate: true,
                onlyTableId: $tableId,
                now: $manilaNow,
            );

            if ($available->isEmpty()) {
                throw new ReservationBookingException(
                    errorCode: 'SLOT_TAKEN',
                    message: "Table {$newTable->table_name} already has an overlapping reservation for this time slot.",
                    statusCode: 409,
                );
            }

            $oldTable = $oldTableId !== null
                ? DB::table('restaurant_tables')
                    ->where('table_id', $oldTableId)
                    ->where('restaurant_id', $targetRestaurantId)
                    ->first(['table_name', 'dining_area'])
                : null;

            $oldLabel = $oldTable?->table_name ?? 'Unassigned';
            $nowStr = $manilaNow->format('Y-m-d H:i:s');

            DB::table('reservations')
                ->where('reservation_id', $reservationId)
                ->where('restaurant_id', $targetRestaurantId)
                ->update([
                    'table_id' => $tableId,
                    'updated_at' => $nowStr,
                ]);

            $historyNote = "Table changed from {$oldLabel} to {$newTable->table_name}.";

            $this->historyRecorder->record(
                reservationId: $reservationId,
                fromStatus: $currentStatus,
                toStatus: $currentStatus,
                changedByUserId: (int) $user->user_id,
                changedByRole: 'restaurant',
                note: $historyNote,
                createdAt: $manilaNow,
            );

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'restaurant_reservation_table_changed',
                entityType: 'reservations',
                entityId: $reservationId,
                oldValues: ['table_id' => $oldTableId],
                newValues: ['table_id' => $tableId],
                reason: $historyNote,
                request: $request,
            );

            // Notify customer ONLY when dining_area differs
            $oldArea = mb_strtolower(trim((string) ($oldTable?->dining_area ?? '')));
            $newArea = mb_strtolower(trim((string) ($newTable->dining_area ?? '')));
            if ($oldArea !== $newArea) {
                $ref = $row->reservation_reference ?: ('#' . $reservationId);
                $areaLabel = $newTable->dining_area ?: 'General Dining';

                $this->notificationService->notifyUser(
                    userId: (int) $row->customer_id,
                    workspace: 'customer',
                    type: 'reservation_table_changed',
                    title: "Seating Area Updated ({$ref})",
                    body: "Your reservation at {$restaurant->restaurant_name} on {$startCarbon->format('M j, Y \a\t g:i A')} has been moved to Table {$newTable->table_name} ({$areaLabel}).",
                    relatedEntityType: 'reservation',
                    relatedEntityId: $reservationId,
                );
            }

            return $this->loadOwnerFormattedDetail($user, $restaurant, $reservationId, $manilaNow);
        });
    }

    /**
     * Shared atomic transition engine used by reject, confirm-deposit, arrived, seat, complete, no-show, and cancel.
     *
     * @param  callable|array<string, mixed>  $extraFields
     * @param  callable|string|null  $note
     * @param  callable(object, CarbonImmutable, User): void  $checks
     * @param  callable(object, object, CarbonImmutable): array{type: string, title: string, body: string}|null  $notificationFactory
     * @return array<string, mixed>
     */
    private function transition(
        object $restaurant,
        int $reservationId,
        string $action,
        string $toStatus,
        callable|array $extraFields,
        callable|string|null $note,
        User $actor,
        Request $request,
        callable $checks,
        ?callable $notificationFactory = null,
        ?CarbonInterface $now = null,
    ): array {
        $targetRestaurantId = (int) $restaurant->restaurant_id;
        $manilaNow = $this->toManilaImmutable($now);

        return DB::transaction(function () use (
            $restaurant,
            $targetRestaurantId,
            $reservationId,
            $action,
            $toStatus,
            $extraFields,
            $note,
            $actor,
            $request,
            $checks,
            $notificationFactory,
            $manilaNow,
        ): array {
            $row = DB::table('reservations')
                ->where('reservation_id', $reservationId)
                ->where('restaurant_id', $targetRestaurantId)
                ->lockForUpdate()
                ->first();

            if (! $row) {
                throw new NotFoundHttpException('Reservation not found.');
            }

            $currentStatus = (string) $row->reservation_status;
            if ($currentStatus === $toStatus) {
                return $this->loadOwnerFormattedDetail($actor, $restaurant, $reservationId, $manilaNow);
            }

            if (! ReservationStatus::canTransition($currentStatus, $toStatus)) {
                throw $this->invalidTransitionException($currentStatus, $toStatus);
            }

            $checks($row, $manilaNow, $actor);

            $computedExtra = is_callable($extraFields)
                ? $extraFields($row, $manilaNow, $actor)
                : $extraFields;

            $nowStr = $manilaNow->format('Y-m-d H:i:s');
            $updatePayload = array_merge($computedExtra, [
                'reservation_status' => $toStatus,
                'updated_at' => $nowStr,
            ]);

            DB::table('reservations')
                ->where('reservation_id', $reservationId)
                ->where('restaurant_id', $targetRestaurantId)
                ->update($updatePayload);

            $resolvedNote = is_callable($note) ? $note($row) : $note;
            $startCarbon = CarbonImmutable::parse((string) $row->reservation_start, self::TIMEZONE);
            $notificationSpec = $notificationFactory !== null
                ? $notificationFactory($row, $restaurant, $startCarbon)
                : null;

            $this->recordSideEffects(
                reservationId: $reservationId,
                row: $row,
                restaurant: $restaurant,
                actor: $actor,
                action: $action,
                fromStatus: $currentStatus,
                toStatus: $toStatus,
                oldValues: ['reservation_status' => $currentStatus],
                newValues: $updatePayload,
                note: $resolvedNote,
                auditReason: $resolvedNote,
                request: $request,
                manilaNow: $manilaNow,
                notificationSpec: $notificationSpec,
            );

            return $this->loadOwnerFormattedDetail($actor, $restaurant, $reservationId, $manilaNow);
        });
    }

    /**
     * @param  array<string, mixed>  $oldValues
     * @param  array<string, mixed>  $newValues
     * @param  array{type: string, title: string, body: string}|null  $notificationSpec
     */
    private function recordSideEffects(
        int $reservationId,
        object $row,
        object $restaurant,
        User $actor,
        string $action,
        string $fromStatus,
        string $toStatus,
        array $oldValues,
        array $newValues,
        ?string $note,
        ?string $auditReason,
        Request $request,
        CarbonImmutable $manilaNow,
        ?array $notificationSpec = null,
    ): void {
        $this->historyRecorder->record(
            reservationId: $reservationId,
            fromStatus: $fromStatus,
            toStatus: $toStatus,
            changedByUserId: (int) $actor->user_id,
            changedByRole: 'restaurant',
            note: $note,
            createdAt: $manilaNow,
        );

        $this->auditLogService->record(
            actorUserId: (int) $actor->user_id,
            action: "restaurant_reservation_{$action}",
            entityType: 'reservations',
            entityId: $reservationId,
            oldValues: $oldValues,
            newValues: $newValues,
            reason: $auditReason,
            request: $request,
        );

        if ($notificationSpec !== null) {
            $this->notificationService->notifyUser(
                userId: (int) $row->customer_id,
                workspace: 'customer',
                type: $notificationSpec['type'],
                title: $notificationSpec['title'],
                body: $notificationSpec['body'],
                relatedEntityType: 'reservation',
                relatedEntityId: $reservationId,
            );
        }
    }

    private function assertWithinArrivalSeatingWindow(object $row, CarbonImmutable $manilaNow): void
    {
        $earlyMinutes = max(0, (int) config('salo.reservations.seating_early_minutes', 60));
        $startCarbon = CarbonImmutable::parse((string) $row->reservation_start, self::TIMEZONE);
        $endCarbon = CarbonImmutable::parse((string) $row->reservation_end, self::TIMEZONE);
        $earliestAllowed = $startCarbon->subMinutes($earlyMinutes);

        if ($manilaNow->lessThan($earliestAllowed)) {
            throw new ReservationBookingException(
                errorCode: 'TOO_EARLY',
                message: "Guest cannot be marked arrived or seated more than {$earlyMinutes} minutes before reservation start (earliest: {$earliestAllowed->format('M j, Y g:i A')}).",
                statusCode: 409,
            );
        }

        if ($manilaNow->greaterThan($endCarbon)) {
            throw new ReservationBookingException(
                errorCode: 'RESERVATION_ENDED',
                message: 'This reservation window has already ended.',
                statusCode: 409,
            );
        }
    }

    private function invalidTransitionException(string $fromStatus, string $toStatus): ReservationBookingException
    {
        if (ReservationStatus::isTerminal($fromStatus)) {
            $message = "This reservation is already {$fromStatus} and can no longer be changed.";
        } else {
            $message = "Cannot change reservation from '{$fromStatus}' to '{$toStatus}'.";
        }

        return new ReservationBookingException(
            errorCode: 'INVALID_TRANSITION',
            message: $message,
            statusCode: 409,
        );
    }

    /**
     * @return array<string, int>
     */
    private function computeSummaryForRange(
        int $restaurantId,
        string $rangeStartStr,
        string $rangeEndStr,
        CarbonImmutable $manilaNow,
    ): array {
        $nowStr = $manilaNow->format('Y-m-d H:i:s');

        $agg = DB::table('reservations')
            ->where('restaurant_id', $restaurantId)
            ->whereBetween('reservation_start', [$rangeStartStr, $rangeEndStr])
            ->selectRaw(
                "COUNT(*) AS total,
                SUM(CASE WHEN reservation_status = 'pending' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN reservation_status IN ('approved', 'awaiting_payment', 'confirmed') THEN 1 ELSE 0 END) AS confirmed,
                SUM(CASE WHEN reservation_status = 'awaiting_payment' THEN 1 ELSE 0 END) AS awaiting_payment,
                SUM(CASE WHEN reservation_status IN ('arrived', 'seated') THEN 1 ELSE 0 END) AS in_house,
                SUM(CASE WHEN reservation_status = 'completed' THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN reservation_status IN ('cancelled', 'rejected', 'expired', 'no_show') THEN 1 ELSE 0 END) AS cancelled_or_missed,
                COALESCE(SUM(CASE WHEN reservation_status IN ('pending', 'approved', 'awaiting_payment', 'confirmed', 'arrived', 'seated') THEN number_of_guests ELSE 0 END), 0) AS expected_covers"
            )
            ->first();

        $pendingTotalUpcoming = DB::table('reservations')
            ->where('restaurant_id', $restaurantId)
            ->where('reservation_status', ReservationStatus::PENDING)
            ->where('reservation_end', '>=', $nowStr)
            ->count();

        return [
            'total' => (int) ($agg->total ?? 0),
            'pending' => (int) ($agg->pending ?? 0),
            'confirmed' => (int) ($agg->confirmed ?? 0),
            'awaiting_payment' => (int) ($agg->awaiting_payment ?? 0),
            'in_house' => (int) ($agg->in_house ?? 0),
            'completed' => (int) ($agg->completed ?? 0),
            'cancelled_or_missed' => (int) ($agg->cancelled_or_missed ?? 0),
            'expected_covers' => (int) ($agg->expected_covers ?? 0),
            'pending_total_upcoming' => $pendingTotalUpcoming,
        ];
    }

    /**
     * @param  array<int, int>  $customerIds
     * @return array<int, array{visits: int, no_shows: int, cancellations: int}>
     */
    private function loadGuestHistories(int $restaurantId, array $customerIds): array
    {
        if ($customerIds === []) {
            return [];
        }

        $rows = DB::table('reservations')
            ->where('restaurant_id', $restaurantId)
            ->whereIn('customer_id', $customerIds)
            ->groupBy('customer_id')
            ->selectRaw(
                "customer_id,
                SUM(CASE WHEN reservation_status = 'completed' THEN 1 ELSE 0 END) AS visits,
                SUM(CASE WHEN reservation_status = 'no_show' THEN 1 ELSE 0 END) AS no_shows,
                SUM(CASE WHEN reservation_status = 'cancelled' THEN 1 ELSE 0 END) AS cancellations"
            )
            ->get();

        $map = [];
        foreach ($rows as $row) {
            $map[(int) $row->customer_id] = [
                'visits' => (int) ($row->visits ?? 0),
                'no_shows' => (int) ($row->no_shows ?? 0),
                'cancellations' => (int) ($row->cancellations ?? 0),
            ];
        }

        return $map;
    }

    /**
     * @return array<string, mixed>
     */
    private function loadOwnerFormattedDetail(
        User $user,
        object $restaurant,
        int $reservationId,
        ?CarbonInterface $now = null,
    ): array {
        $targetRestaurantId = (int) $restaurant->restaurant_id;
        $manilaNow = $this->toManilaImmutable($now);

        $row = $this->baseOwnerReservationQuery($targetRestaurantId)
            ->where('res.reservation_id', $reservationId)
            ->first();

        if (! $row) {
            throw new NotFoundHttpException('Reservation not found.');
        }

        $historyRows = DB::table('reservation_status_history')
            ->where('reservation_id', $reservationId)
            ->orderBy('created_at', 'asc')
            ->orderBy('history_id', 'asc')
            ->get()
            ->all();

        $guestHistories = $this->loadGuestHistories($targetRestaurantId, [(int) $row->customer_id]);
        $guestHistory = $guestHistories[(int) $row->customer_id] ?? ['visits' => 0, 'no_shows' => 0, 'cancellations' => 0];
        $permissions = $this->resolveUserPermissionsForRestaurant($user, $targetRestaurantId);

        $formatted = $this->formatOwnerRow(
            row: $row,
            restaurant: $restaurant,
            guestHistory: $guestHistory,
            permissions: $permissions,
            manilaNow: $manilaNow,
            statusHistory: $historyRows,
        );

        $formatted['restaurant_settings'] = [
            'reservation_min_notice_hours' => (int) ($restaurant->reservation_min_notice_hours ?? 2),
            'reservation_cancellation_cutoff_minutes' => (int) ($restaurant->reservation_cancellation_cutoff_minutes ?? 120),
            'reservation_pending_expiry_minutes' => (int) ($restaurant->reservation_pending_expiry_minutes ?? 120),
            'reservation_duration_minutes' => (int) ($restaurant->reservation_duration_minutes ?? 90),
            'reservation_deposit_required' => (bool) ($restaurant->reservation_deposit_required ?? false),
        ];

        return $formatted;
    }

    /**
     * @param  array{visits: int, no_shows: int, cancellations: int}  $guestHistory
     * @param  array<string, bool>  $permissions
     * @param  array<int, object>|null  $statusHistory
     * @return array<string, mixed>
     */
    private function formatOwnerRow(
        object $row,
        object $restaurant,
        array $guestHistory,
        array $permissions,
        CarbonImmutable $manilaNow,
        ?array $statusHistory = null,
    ): array {
        $allowedActions = $this->computeAllowedActions($row, $permissions, $manilaNow);
        $allowedDepositActions = $this->computeAllowedDepositActions($row, $permissions);
        $attention = $this->computeAttentionFlag($row, $restaurant, $manilaNow);

        return ReservationFormatter::formatOwner(
            row: $row,
            now: $manilaNow,
            cancellationCutoffMinutes: isset($restaurant->reservation_cancellation_cutoff_minutes)
                ? (int) $restaurant->reservation_cancellation_cutoff_minutes
                : null,
            statusHistory: $statusHistory,
            guestHistory: $guestHistory,
            allowedActions: $allowedActions,
            attention: $attention,
            allowedDepositActions: $allowedDepositActions,
        );
    }

    /**
     * Compute valid manual deposit actions RIGHT NOW given deposit_status and user permissions.
     *
     * @param  array<string, bool>  $permissions
     * @return array<int, string>
     */
    private function computeAllowedDepositActions(object $row, array $permissions): array
    {
        if (! ($permissions['reservations.updateStatus'] ?? false)) {
            return [];
        }

        $depositAmount = (float) ($row->deposit_amount ?? 0);
        $depositStatus = (string) ($row->deposit_status ?? 'none');
        if ($depositAmount <= 0 || $depositStatus === 'none') {
            return [];
        }

        $allowedTargets = config("salo.reservations.deposit_transitions.{$depositStatus}", []);
        if (! is_array($allowedTargets)) {
            return [];
        }

        $actionMap = [
            'paid' => 'mark_paid',
            'waived' => 'waive',
            'refunded' => 'refund',
        ];

        $actions = [];
        foreach ($allowedTargets as $target) {
            if (isset($actionMap[$target])) {
                $actions[] = $actionMap[$target];
            }
        }

        return $actions;
    }

    /**
     * Compute action keys valid RIGHT NOW given status, time guards, and user permissions.
     *
     * @param  array<string, bool>  $permissions
     * @return array<int, string>
     */
    private function computeAllowedActions(
        object $row,
        array $permissions,
        CarbonImmutable $manilaNow,
    ): array {
        $status = (string) $row->reservation_status;
        if (ReservationStatus::isTerminal($status)) {
            return [];
        }

        $startCarbon = CarbonImmutable::parse((string) $row->reservation_start, self::TIMEZONE);
        $endCarbon = CarbonImmutable::parse((string) $row->reservation_end, self::TIMEZONE);
        $earlyMinutes = max(0, (int) config('salo.reservations.seating_early_minutes', 60));
        $graceMinutes = max(0, (int) config('salo.reservations.no_show_grace_minutes', 15));

        $withinSeatingWindow = $manilaNow->greaterThanOrEqualTo($startCarbon->subMinutes($earlyMinutes))
            && $manilaNow->lessThanOrEqualTo($endCarbon);
        $pastGrace = $manilaNow->greaterThanOrEqualTo($startCarbon->addMinutes($graceMinutes));
        $hasActiveTable = $row->table_id !== null && (int) ($row->table_is_active ?? 1) === 1;

        $actions = [];

        if ($status === ReservationStatus::PENDING) {
            if (($permissions['reservations.approve'] ?? false) && $startCarbon->greaterThan($manilaNow)) {
                $actions[] = 'approve';
            }
            if ($permissions['reservations.reject'] ?? false) {
                $actions[] = 'reject';
            }
        }

        if ($status === ReservationStatus::AWAITING_PAYMENT && ($permissions['reservations.updateStatus'] ?? false)) {
            $actions[] = 'confirm_deposit';
        }

        if ($status === ReservationStatus::CONFIRMED && ($permissions['reservations.manageArrival'] ?? false) && $withinSeatingWindow) {
            $actions[] = 'arrived';
        }

        if (
            in_array($status, [ReservationStatus::CONFIRMED, ReservationStatus::ARRIVED], true)
            && ($permissions['reservations.updateStatus'] ?? false)
            && $withinSeatingWindow
            && $hasActiveTable
        ) {
            $actions[] = 'seat';
        }

        if ($status === ReservationStatus::SEATED && ($permissions['reservations.updateStatus'] ?? false)) {
            $actions[] = 'complete';
        }

        if (
            in_array($status, [ReservationStatus::CONFIRMED, ReservationStatus::ARRIVED], true)
            && ($permissions['reservations.manageArrival'] ?? false)
            && $pastGrace
        ) {
            $actions[] = 'no_show';
        }

        if (
            in_array($status, [
                ReservationStatus::PENDING,
                ReservationStatus::APPROVED,
                ReservationStatus::AWAITING_PAYMENT,
                ReservationStatus::CONFIRMED,
                ReservationStatus::ARRIVED,
            ], true)
            && ($permissions['reservations.assignTables'] ?? false)
        ) {
            $actions[] = 'reassign_table';
        }

        if (
            in_array($status, [
                ReservationStatus::PENDING,
                ReservationStatus::APPROVED,
                ReservationStatus::AWAITING_PAYMENT,
                ReservationStatus::CONFIRMED,
                ReservationStatus::ARRIVED,
            ], true)
            && ($permissions['reservations.updateStatus'] ?? false)
        ) {
            $actions[] = 'cancel';
        }

        return $actions;
    }

    private function computeAttentionFlag(
        object $row,
        object $restaurant,
        CarbonImmutable $manilaNow,
    ): ?string {
        return ReservationAttention::compute($row, $restaurant, $manilaNow);
    }

    /**
     * @return array<string, bool>
     */
    private function resolveUserPermissionsForRestaurant(User $user, int $restaurantId): array
    {
        $keys = [
            'reservations.view',
            'reservations.approve',
            'reservations.reject',
            'reservations.assignTables',
            'reservations.updateStatus',
            'reservations.manageArrival',
        ];

        $isOwner = DB::table('restaurant_owners')
            ->where('restaurant_id', $restaurantId)
            ->where('user_id', $user->user_id)
            ->exists();

        if ($isOwner) {
            return array_fill_keys($keys, true);
        }

        $position = DB::table('restaurant_staff')
            ->where('restaurant_id', $restaurantId)
            ->where('user_id', $user->user_id)
            ->where('staff_status', 'active')
            ->value('staff_position');

        $map = [];
        foreach ($keys as $perm) {
            $map[$perm] = User::positionHasPermission($position ? (string) $position : null, $perm);
        }

        return $map;
    }

    private function baseOwnerReservationQuery(int $restaurantId): Builder
    {
        return DB::table('reservations as res')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'res.restaurant_id')
            ->join('users as u', 'u.user_id', '=', 'res.customer_id')
            ->leftJoin('restaurant_tables as rt', static function ($join): void {
                $join->on('rt.table_id', '=', 'res.table_id')
                    ->on('rt.restaurant_id', '=', 'res.restaurant_id');
            })
            ->where('res.restaurant_id', $restaurantId)
            ->select([
                'res.*',
                'r.restaurant_name',
                'r.reservation_cancellation_cutoff_minutes',
                'u.first_name as customer_first_name',
                'u.last_name as customer_last_name',
                'u.email as customer_email',
                'u.phone_number as customer_phone',
                'rt.table_name',
                'rt.dining_area',
                'rt.description as table_description',
                'rt.seating_capacity',
                'rt.min_party_size',
                'rt.is_active as table_is_active',
            ]);
    }

    private function toManilaImmutable(?CarbonInterface $value = null): CarbonImmutable
    {
        if ($value === null) {
            return CarbonImmutable::now(self::TIMEZONE);
        }

        return CarbonImmutable::instance($value)->setTimezone(self::TIMEZONE);
    }
}
