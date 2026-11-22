<?php

namespace App\Features\Reservations\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Reservations\Support\ReservationBookingException;
use App\Features\Reservations\Support\ReservationFormatter;
use App\Features\Reservations\Support\ReservationReferenceGenerator;
use App\Features\Reservations\Support\ReservationStatus;
use App\Features\Reservations\Support\ReservationStatusHistoryRecorder;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\FileStorageService;
use App\Support\RestaurantBranchService;
use App\Support\SqlLike;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class CustomerReservationService
{
    private const TIMEZONE = 'Asia/Manila';

    public function __construct(
        private readonly ReservationAvailabilityService $availabilityService,
        private readonly ReservationReferenceGenerator $referenceGenerator,
        private readonly ReservationStatusHistoryRecorder $historyRecorder,
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
        private readonly FileStorageService $fileStorageService,
    ) {}

    /**
     * Create a customer table reservation with idempotency, row locking on candidate tables,
     * status history, audit log, and synchronous notifications inside a single DB transaction.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function create(
        User $user,
        array $validated,
        Request $request,
        ?CarbonInterface $now = null,
    ): array {
        $customerId = (int) $user->user_id;
        $idempotencyKey = trim((string) $validated['idempotency_key']);
        $manilaNow = $this->toManilaImmutable($now);

        // 1. Idempotency check by (customer_id, idempotency_key)
        $existing = DB::table('reservations')
            ->where('customer_id', $customerId)
            ->where('idempotency_key', $idempotencyKey)
            ->first(['reservation_id']);

        if ($existing) {
            return $this->getDetail($user, (int) $existing->reservation_id, $manilaNow);
        }

        $restaurantId = (int) $validated['restaurant_id'];

        // 2. Require active, published restaurant (404 if unknown, inactive, or unpublished)
        $restaurantRow = DB::table('restaurants')
            ->where('restaurant_id', $restaurantId)
            ->where('restaurant_status', 'active')
            ->where('is_published', 1)
            ->first();

        if (! $restaurantRow) {
            throw new NotFoundHttpException('Restaurant not found.');
        }

        // 3. Self-booking block (mirror CheckoutService self-order block)
        $this->assertNotOwnerOrActiveStaff($user, $restaurantRow);

        // 4. Load booking settings and validate booking window
        $settings = $this->availabilityService->getBookingSettings($restaurantId, $restaurantRow);
        $manilaStart = CarbonImmutable::parse((string) $validated['start'], self::TIMEZONE)->setTimezone(self::TIMEZONE);
        $durationMinutes = (int) $settings['reservation_duration_minutes'];
        $manilaEnd = $manilaStart->addMinutes($durationMinutes);
        $partySize = (int) $validated['party_size'];

        $windowError = $this->availabilityService->validateBookingWindow(
            settings: $settings,
            start: $manilaStart,
            end: $manilaEnd,
            partySize: $partySize,
            now: $manilaNow,
        );

        if ($windowError !== null) {
            throw new ReservationBookingException(
                errorCode: $windowError['code'],
                message: $windowError['message'],
                statusCode: 422,
            );
        }

        // 5. Customer limits (overlapping booking at any restaurant & max active pending)
        $this->assertCustomerBookingLimits($customerId, $manilaStart, $manilaEnd, $manilaNow);

        $requestedTableId = isset($validated['table_id']) && $validated['table_id'] !== null
            ? (int) $validated['table_id']
            : null;
        $requestedDiningArea = isset($validated['dining_area']) && trim((string) $validated['dining_area']) !== ''
            ? trim((string) $validated['dining_area'])
            : null;

        $assignedDiningAreaDiffers = false;

        try {
            $reservationId = DB::transaction(function () use (
                $user,
                $customerId,
                $restaurantId,
                $idempotencyKey,
                $manilaNow,
                $manilaStart,
                $manilaEnd,
                $durationMinutes,
                $partySize,
                $requestedTableId,
                $requestedDiningArea,
                $validated,
                $request,
                &$assignedDiningAreaDiffers,
            ): int {
                // Re-load restaurant row and settings inside the transaction
                $freshRestaurant = DB::table('restaurants')
                    ->where('restaurant_id', $restaurantId)
                    ->where('restaurant_status', 'active')
                    ->where('is_published', 1)
                    ->first();

                if (! $freshRestaurant) {
                    throw new NotFoundHttpException('Restaurant not found.');
                }

                $freshSettings = $this->availabilityService->getBookingSettings($restaurantId, $freshRestaurant);
                $recheckError = $this->availabilityService->validateBookingWindow(
                    settings: $freshSettings,
                    start: $manilaStart,
                    end: $manilaEnd,
                    partySize: $partySize,
                    now: $manilaNow,
                );

                if ($recheckError !== null) {
                    throw new ReservationBookingException(
                        errorCode: $recheckError['code'],
                        message: $recheckError['message'],
                        statusCode: 422,
                    );
                }

                // Re-verify customer limits with row locking on customer's active reservations
                $this->assertCustomerBookingLimits($customerId, $manilaStart, $manilaEnd, $manilaNow, true);

                // Select and lock candidate table(s) BEFORE inserting
                if ($requestedTableId !== null) {
                    $lockedTable = DB::table('restaurant_tables')
                        ->where('table_id', $requestedTableId)
                        ->where('restaurant_id', $restaurantId)
                        ->where('is_active', 1)
                        ->lockForUpdate()
                        ->first();

                    if (
                        ! $lockedTable
                        || $partySize < max(1, (int) ($lockedTable->min_party_size ?? 1))
                        || $partySize > (int) $lockedTable->seating_capacity
                    ) {
                        // Do not leak whether a table belongs to another restaurant; treat as NO_FIT
                        throw new ReservationBookingException(
                            errorCode: ReservationAvailabilityService::REASON_NO_FIT,
                            message: 'The selected table is not available or cannot accommodate your party size.',
                            statusCode: 409,
                        );
                    }

                    $availableForTable = $this->availabilityService->getAvailableTables(
                        restaurantId: $restaurantId,
                        start: $manilaStart,
                        end: $manilaEnd,
                        partySize: $partySize,
                        diningArea: null,
                        excludeReservationId: null,
                        lockForUpdate: true,
                        onlyTableId: $requestedTableId,
                        now: $manilaNow,
                    );

                    if ($availableForTable->isEmpty()) {
                        $alternatives = $this->availabilityService->suggestAlternativeSlots(
                            restaurantId: $restaurantId,
                            requestedStart: $manilaStart,
                            partySize: $partySize,
                            diningArea: $requestedDiningArea,
                            durationMinutes: $durationMinutes,
                            now: $manilaNow,
                        );

                        throw new ReservationBookingException(
                            errorCode: 'SLOT_TAKEN',
                            message: 'The selected table has just been reserved for this time slot. Please choose another table or time.',
                            statusCode: 409,
                            extra: ['suggested_alternatives' => $alternatives],
                        );
                    }

                    $assignedTable = $availableForTable->first();
                    $assignedDiningAreaDiffers = false;
                } else {
                    $candidates = $this->availabilityService->getAvailableTables(
                        restaurantId: $restaurantId,
                        start: $manilaStart,
                        end: $manilaEnd,
                        partySize: $partySize,
                        diningArea: $requestedDiningArea,
                        excludeReservationId: null,
                        lockForUpdate: true,
                        onlyTableId: null,
                        now: $manilaNow,
                    );

                    if ($candidates->isEmpty() && $requestedDiningArea !== null) {
                        // Fallback: retry across all dining areas and mark assigned_dining_area_differs = true
                        $fallbackCandidates = $this->availabilityService->getAvailableTables(
                            restaurantId: $restaurantId,
                            start: $manilaStart,
                            end: $manilaEnd,
                            partySize: $partySize,
                            diningArea: null,
                            excludeReservationId: null,
                            lockForUpdate: true,
                            onlyTableId: null,
                            now: $manilaNow,
                        );

                        if ($fallbackCandidates->isNotEmpty()) {
                            $candidates = $fallbackCandidates;
                            $assignedDiningAreaDiffers = true;
                        }
                    }

                    if ($candidates->isEmpty()) {
                        $anyTableFits = DB::table('restaurant_tables')
                            ->where('restaurant_id', $restaurantId)
                            ->where('is_active', 1)
                            ->where('min_party_size', '<=', $partySize)
                            ->where('seating_capacity', '>=', $partySize)
                            ->exists();

                        $errCode = $anyTableFits
                            ? ReservationAvailabilityService::REASON_FULLY_BOOKED
                            : ReservationAvailabilityService::REASON_NO_FIT;
                        $errMsg = $anyTableFits
                            ? 'All suitable tables are already reserved for this time slot.'
                            : 'No active tables at this restaurant can accommodate your party size.';

                        $alternatives = $this->availabilityService->suggestAlternativeSlots(
                            restaurantId: $restaurantId,
                            requestedStart: $manilaStart,
                            partySize: $partySize,
                            diningArea: $requestedDiningArea,
                            durationMinutes: $durationMinutes,
                            now: $manilaNow,
                        );

                        throw new ReservationBookingException(
                            errorCode: $errCode,
                            message: $errMsg,
                            statusCode: 409,
                            extra: ['suggested_alternatives' => $alternatives],
                        );
                    }

                    $assignedTable = $candidates->first();
                }

                $assignedTableId = (int) $assignedTable->table_id;

                // Snapshot deposit, fee, contact info, and initial status
                $depositRequired = (bool) $freshSettings['reservation_deposit_required'];
                $depositAmount = $depositRequired
                    ? number_format((float) $freshSettings['reservation_deposit_amount'], 2, '.', '')
                    : '0.00';
                $depositStatus = ($depositRequired && (float) $depositAmount > 0) ? 'pending' : 'none';
                $serviceFee = number_format((float) $freshSettings['reservation_service_fee'], 2, '.', '');

                $autoConfirm = (bool) $freshSettings['reservation_auto_confirm'];
                $initialStatus = $autoConfirm ? ReservationStatus::CONFIRMED : ReservationStatus::PENDING;
                $nowStr = $manilaNow->format('Y-m-d H:i:s');
                $confirmedAt = $autoConfirm ? $nowStr : null;

                $defaultContactName = trim(sprintf(
                    '%s %s',
                    (string) ($user->first_name ?? ''),
                    (string) ($user->last_name ?? ''),
                ));
                if ($defaultContactName === '') {
                    $defaultContactName = (string) ($user->username ?? 'Customer');
                }

                $contactName = isset($validated['contact_name']) && trim((string) $validated['contact_name']) !== ''
                    ? mb_substr(trim((string) $validated['contact_name']), 0, 150)
                    : mb_substr($defaultContactName, 0, 150);

                $contactPhone = isset($validated['contact_phone']) && trim((string) $validated['contact_phone']) !== ''
                    ? mb_substr(trim((string) $validated['contact_phone']), 0, 30)
                    : (isset($user->phone_number) && trim((string) $user->phone_number) !== ''
                        ? mb_substr(trim((string) $user->phone_number), 0, 30)
                        : null);

                $specialRequests = isset($validated['special_requests']) && trim((string) $validated['special_requests']) !== ''
                    ? trim((string) $validated['special_requests'])
                    : null;

                $reference = $this->referenceGenerator->generate($manilaNow);

                $id = (int) DB::table('reservations')->insertGetId([
                    'reservation_reference' => $reference,
                    'customer_id' => $customerId,
                    'restaurant_id' => $restaurantId,
                    'table_id' => $assignedTableId,
                    'contact_name' => $contactName,
                    'contact_phone' => $contactPhone,
                    'reservation_start' => $manilaStart->format('Y-m-d H:i:s'),
                    'reservation_end' => $manilaEnd->format('Y-m-d H:i:s'),
                    'number_of_guests' => $partySize,
                    'reservation_status' => $initialStatus,
                    'deposit_amount' => $depositAmount,
                    'deposit_status' => $depositStatus,
                    'service_fee' => $serviceFee,
                    'is_fee_refundable' => 1,
                    'cancellation_fee' => '0.00',
                    'special_requests' => $specialRequests,
                    'idempotency_key' => $idempotencyKey,
                    'confirmed_at' => $confirmedAt,
                    'created_at' => $nowStr,
                    'updated_at' => $nowStr,
                ]);

                // Status history row
                $this->historyRecorder->record(
                    reservationId: $id,
                    fromStatus: null,
                    toStatus: $initialStatus,
                    changedByUserId: $customerId,
                    changedByRole: 'customer',
                    note: $autoConfirm
                        ? 'Reservation created and automatically confirmed.'
                        : 'Reservation request submitted by customer.',
                    createdAt: $manilaNow,
                );

                // Audit log row
                $this->auditLogService->record(
                    actorUserId: $customerId,
                    action: 'customer_reservation_created',
                    entityType: 'reservations',
                    entityId: $id,
                    oldValues: null,
                    newValues: [
                        'reservation_reference' => $reference,
                        'restaurant_id' => $restaurantId,
                        'table_id' => $assignedTableId,
                        'reservation_start' => $manilaStart->format('Y-m-d H:i:s'),
                        'reservation_end' => $manilaEnd->format('Y-m-d H:i:s'),
                        'number_of_guests' => $partySize,
                        'reservation_status' => $initialStatus,
                        'deposit_amount' => $depositAmount,
                        'deposit_status' => $depositStatus,
                        'service_fee' => $serviceFee,
                    ],
                    request: $request,
                );

                // Synchronous notifications inside the same transaction
                $formattedWhen = $manilaStart->format('M j, Y \a\t g:i A');
                $handlerUserIds = $this->notificationService->resolveRestaurantReservationHandlerUserIds($restaurantId);

                if ($handlerUserIds !== []) {
                    $restaurantNotificationType = $autoConfirm ? 'reservation_confirmed' : 'reservation_requested';
                    $restaurantTitle = $autoConfirm
                        ? "New Confirmed Reservation ({$reference})"
                        : "New Reservation Request ({$reference})";
                    $restaurantBody = "{$contactName} booked a table for {$partySize} guest(s) on {$formattedWhen} (Table {$assignedTable->table_name}).";

                    $this->notificationService->notifyUsers(
                        userIds: $handlerUserIds,
                        workspace: 'restaurant',
                        type: $restaurantNotificationType,
                        title: $restaurantTitle,
                        body: $restaurantBody,
                        relatedEntityType: 'reservation',
                        relatedEntityId: $id,
                    );
                }

                if ($autoConfirm) {
                    $this->notificationService->notifyUser(
                        userId: $customerId,
                        workspace: 'customer',
                        type: 'reservation_confirmed',
                        title: "Reservation Confirmed at {$freshSettings['restaurant_name']}",
                        body: "Your table for {$partySize} guest(s) on {$formattedWhen} ({$reference}) has been automatically confirmed.",
                        relatedEntityType: 'reservation',
                        relatedEntityId: $id,
                    );
                }

                return $id;
            });
        } catch (QueryException $e) {
            $sqlState = (string) ($e->errorInfo[0] ?? $e->getCode());
            $driverCode = (int) ($e->errorInfo[1] ?? 0);

            if ($sqlState === '23000' && $driverCode === 1062) {
                $raced = DB::table('reservations')
                    ->where('customer_id', $customerId)
                    ->where('idempotency_key', $idempotencyKey)
                    ->first(['reservation_id']);

                if ($raced) {
                    return $this->getDetail($user, (int) $raced->reservation_id, $manilaNow);
                }
            }

            throw $e;
        }

        $detail = $this->getDetail($user, $reservationId, $manilaNow);
        $detail['assigned_dining_area_differs'] = $assignedDiningAreaDiffers;

        return $detail;
    }

    /**
     * List the authenticated customer's reservations with tab/status/date/search filtering,
     * eager-joined restaurant & table details in ONE query, pagination, and global summary counts.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function list(User $user, array $filters = [], ?CarbonInterface $now = null): array
    {
        $customerId = (int) $user->user_id;
        $manilaNow = $this->toManilaImmutable($now);
        $nowStr = $manilaNow->format('Y-m-d H:i:s');

        $summary = $this->computeCustomerSummary($customerId, $nowStr);

        $query = $this->baseCustomerReservationQuery($customerId);

        $tab = isset($filters['tab']) && is_string($filters['tab']) && trim($filters['tab']) !== ''
            ? strtolower(trim($filters['tab']))
            : 'all';

        if ($tab === 'upcoming') {
            $query->where('res.reservation_start', '>=', $nowStr)
                ->whereIn('res.reservation_status', ReservationStatus::BLOCKING);
        } elseif ($tab === 'past') {
            $query->where(static function (Builder $sub) use ($nowStr): void {
                $sub->whereIn('res.reservation_status', [
                    ReservationStatus::COMPLETED,
                    ReservationStatus::NO_SHOW,
                    ReservationStatus::EXPIRED,
                ])->orWhere(static function (Builder $pastTime) use ($nowStr): void {
                    $pastTime->whereNotIn('res.reservation_status', [
                        ReservationStatus::CANCELLED,
                        ReservationStatus::REJECTED,
                    ])->where('res.reservation_end', '<', $nowStr);
                });
            });
        } elseif ($tab === 'cancelled') {
            $query->whereIn('res.reservation_status', [
                ReservationStatus::CANCELLED,
                ReservationStatus::REJECTED,
            ]);
        }

        if (isset($filters['status']) && is_string($filters['status']) && trim($filters['status']) !== '') {
            $statusFilter = strtolower(trim($filters['status']));
            if ($statusFilter !== 'all') {
                $query->where('res.reservation_status', $statusFilter);
            }
        }

        if (isset($filters['restaurant_id']) && (int) $filters['restaurant_id'] > 0) {
            $query->where('res.restaurant_id', (int) $filters['restaurant_id']);
        }

        if (isset($filters['date_from']) && is_string($filters['date_from']) && trim($filters['date_from']) !== '') {
            $query->where('res.reservation_start', '>=', trim($filters['date_from']) . ' 00:00:00');
        }

        if (isset($filters['date_to']) && is_string($filters['date_to']) && trim($filters['date_to']) !== '') {
            $query->where('res.reservation_start', '<=', trim($filters['date_to']) . ' 23:59:59');
        }

        if (isset($filters['search']) && is_string($filters['search']) && trim($filters['search']) !== '') {
            $pattern = '%' . SqlLike::escape(trim($filters['search'])) . '%';
            $query->where(static function (Builder $sub) use ($pattern): void {
                $sub->where('res.reservation_reference', 'like', $pattern)
                    ->orWhere('r.restaurant_name', 'like', $pattern)
                    ->orWhere('rt.dining_area', 'like', $pattern)
                    ->orWhere('res.special_requests', 'like', $pattern);
            });
        }

        $sort = isset($filters['sort']) && is_string($filters['sort']) && trim($filters['sort']) !== ''
            ? strtolower(trim($filters['sort']))
            : ($tab === 'upcoming' ? 'soonest' : 'latest');

        if ($sort === 'soonest') {
            $query->orderBy('res.reservation_start', 'asc')->orderBy('res.reservation_id', 'asc');
        } else {
            $query->orderBy('res.reservation_start', 'desc')->orderBy('res.reservation_id', 'desc');
        }

        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 15)));
        $page = max(1, (int) ($filters['page'] ?? 1));

        $paginator = $query->paginate($perPage, ['*'], 'page', $page);
        $items = collect($paginator->items())
            ->map(fn (object $row): array => $this->formatJoinedReservationRow($row, $manilaNow))
            ->values()
            ->all();

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
     * Get full reservation details including status_history, restaurant address/contact/notes,
     * and cancellation cutoff info. Returns 404 if not owned by the customer.
     *
     * @return array<string, mixed>
     */
    public function getDetail(User $user, int $reservationId, ?CarbonInterface $now = null): array
    {
        $customerId = (int) $user->user_id;
        $manilaNow = $this->toManilaImmutable($now);

        $row = $this->baseCustomerReservationQuery($customerId)
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

        return $this->formatJoinedReservationRow($row, $manilaNow, $historyRows);
    }

    /**
     * Cancel a customer's reservation enforcing state-machine transitions and the cancellation cutoff rule.
     *
     * @return array<string, mixed>
     */
    public function cancel(
        User $user,
        int $reservationId,
        ?string $reason,
        Request $request,
        ?CarbonInterface $now = null,
    ): array {
        $customerId = (int) $user->user_id;
        $manilaNow = $this->toManilaImmutable($now);
        $cleanReason = $reason !== null && trim($reason) !== ''
            ? mb_substr(trim($reason), 0, 255)
            : null;

        DB::transaction(function () use (
            $customerId,
            $reservationId,
            $cleanReason,
            $request,
            $manilaNow,
        ): void {
            $row = DB::table('reservations')
                ->where('reservation_id', $reservationId)
                ->lockForUpdate()
                ->first();

            if (! $row || (int) $row->customer_id !== $customerId) {
                throw new NotFoundHttpException('Reservation not found.');
            }

            $currentStatus = (string) $row->reservation_status;

            // Only pending, approved, awaiting_payment, and confirmed are customer-cancellable
            $customerCancellableStatuses = [
                ReservationStatus::PENDING,
                ReservationStatus::APPROVED,
                ReservationStatus::AWAITING_PAYMENT,
                ReservationStatus::CONFIRMED,
            ];

            if (
                ! ReservationStatus::canTransition($currentStatus, ReservationStatus::CANCELLED)
                || ! in_array($currentStatus, $customerCancellableStatuses, true)
            ) {
                $reasonText = match ($currentStatus) {
                    ReservationStatus::CANCELLED => 'This reservation has already been cancelled.',
                    ReservationStatus::SEATED, ReservationStatus::ARRIVED => 'This reservation cannot be cancelled because the party has already arrived or been seated.',
                    ReservationStatus::COMPLETED => 'This reservation has already been completed.',
                    default => "This reservation cannot be cancelled from its current '{$currentStatus}' status.",
                };

                throw new ReservationBookingException(
                    errorCode: 'INVALID_STATUS_TRANSITION',
                    message: $reasonText,
                    statusCode: 409,
                );
            }

            $restaurantId = (int) $row->restaurant_id;
            $cutoffMinutes = max(
                0,
                (int) (DB::table('restaurants')
                    ->where('restaurant_id', $restaurantId)
                    ->value('reservation_cancellation_cutoff_minutes') ?? 120)
            );

            $startCarbon = CarbonImmutable::parse((string) $row->reservation_start, self::TIMEZONE);

            // Cutoff rule:
            // - pending: can always be cancelled until start
            // - approved / awaiting_payment / confirmed: can be cancelled only when now <= start - cutoffMinutes
            if ($currentStatus === ReservationStatus::PENDING) {
                if ($manilaNow->greaterThan($startCarbon)) {
                    throw new ReservationBookingException(
                        errorCode: 'CANCELLATION_CUTOFF_PASSED',
                        message: 'This reservation can no longer be cancelled because its scheduled start time has already passed.',
                        statusCode: 409,
                    );
                }
            } else {
                $cutoffTime = $startCarbon->subMinutes($cutoffMinutes);
                if ($manilaNow->greaterThan($cutoffTime)) {
                    $formattedCutoff = $cutoffTime->format('M j, Y g:i A');
                    throw new ReservationBookingException(
                        errorCode: 'CANCELLATION_CUTOFF_PASSED',
                        message: "This reservation can no longer be cancelled online because the {$cutoffMinutes}-minute cancellation cutoff ({$formattedCutoff}) has passed.",
                        statusCode: 409,
                    );
                }
            }

            $nowStr = $manilaNow->format('Y-m-d H:i:s');

            DB::table('reservations')
                ->where('reservation_id', $reservationId)
                ->update([
                    'reservation_status' => ReservationStatus::CANCELLED,
                    'cancelled_by' => 'customer',
                    'cancelled_at' => $nowStr,
                    'cancellation_reason' => $cleanReason,
                    'cancellation_fee' => '0.00',
                    'updated_at' => $nowStr,
                ]);

            $this->historyRecorder->record(
                reservationId: $reservationId,
                fromStatus: $currentStatus,
                toStatus: ReservationStatus::CANCELLED,
                changedByUserId: $customerId,
                changedByRole: 'customer',
                note: $cleanReason ?? 'Cancelled by customer.',
                createdAt: $manilaNow,
            );

            $this->auditLogService->record(
                actorUserId: $customerId,
                action: 'customer_reservation_cancelled',
                entityType: 'reservations',
                entityId: $reservationId,
                oldValues: [
                    'reservation_status' => $currentStatus,
                ],
                newValues: [
                    'reservation_status' => ReservationStatus::CANCELLED,
                    'cancelled_by' => 'customer',
                    'cancelled_at' => $nowStr,
                    'cancellation_reason' => $cleanReason,
                    'cancellation_fee' => '0.00',
                ],
                reason: $cleanReason,
                request: $request,
            );

            $handlerUserIds = $this->notificationService->resolveRestaurantReservationHandlerUserIds($restaurantId);
            if ($handlerUserIds !== []) {
                $reference = $row->reservation_reference ?: ('#' . $reservationId);
                $formattedWhen = $startCarbon->format('M j, Y \a\t g:i A');
                $guestName = $row->contact_name ?: 'Customer';
                $reasonSuffix = $cleanReason !== null ? " Reason: {$cleanReason}" : '';

                $this->notificationService->notifyUsers(
                    userIds: $handlerUserIds,
                    workspace: 'restaurant',
                    type: 'reservation_cancelled_by_customer',
                    title: "Reservation Cancelled ({$reference})",
                    body: "{$guestName} cancelled their reservation for {$row->number_of_guests} guest(s) on {$formattedWhen}.{$reasonSuffix}",
                    relatedEntityType: 'reservation',
                    relatedEntityId: $reservationId,
                );
            }
        });

        return $this->getDetail($user, $reservationId, $manilaNow);
    }

    private function assertNotOwnerOrActiveStaff(User $user, object $restaurant): void
    {
        $restaurantId = (int) $restaurant->restaurant_id;
        $isOwnerOrStaff = DB::table('restaurant_owners')
            ->where('restaurant_id', $restaurantId)
            ->where('user_id', $user->user_id)
            ->exists()
            || DB::table('restaurant_staff')
                ->where('restaurant_id', $restaurantId)
                ->where('user_id', $user->user_id)
                ->where('staff_status', 'active')
                ->exists();

        if ($isOwnerOrStaff) {
            $displayName = RestaurantBranchService::formatDisplayName(
                (string) $restaurant->restaurant_name,
                $restaurant->branch_name ?? null,
            );
            $message = "You cannot place a reservation at {$displayName} because you own or work at it.";

            throw new ReservationBookingException(
                errorCode: 'SELF_BOOKING',
                message: $message,
                statusCode: 422,
                errors: [
                    'restaurant_id' => [$message],
                ],
            );
        }
    }

    private function assertCustomerBookingLimits(
        int $customerId,
        CarbonImmutable $start,
        CarbonImmutable $end,
        CarbonImmutable $manilaNow,
        bool $lockForUpdate = false,
    ): void {
        $startStr = $start->format('Y-m-d H:i:s');
        $endStr = $end->format('Y-m-d H:i:s');
        $nowStr = $manilaNow->format('Y-m-d H:i:s');
        $nonPendingBlocking = array_values(array_diff(ReservationStatus::BLOCKING, [ReservationStatus::PENDING]));

        // (a) Customer cannot hold two blocking reservations whose time windows overlap at ANY restaurant
        $overlapQuery = DB::table('reservations as res')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'res.restaurant_id')
            ->where('res.customer_id', $customerId)
            ->where('res.reservation_start', '<', $endStr)
            ->where('res.reservation_end', '>', $startStr)
            ->where(static function ($q) use ($nonPendingBlocking, $nowStr): void {
                $q->whereIn('res.reservation_status', $nonPendingBlocking)
                    ->orWhere(static function ($pendingQ) use ($nowStr): void {
                        $pendingQ->where('res.reservation_status', ReservationStatus::PENDING)
                            ->whereRaw(
                                'TIMESTAMPADD(MINUTE, COALESCE(r.reservation_pending_expiry_minutes, 120), res.created_at) >= ?',
                                [$nowStr]
                            );
                    });
            });

        if ($lockForUpdate) {
            $overlapQuery->lockForUpdate();
        }

        if ($overlapQuery->exists()) {
            throw new ReservationBookingException(
                errorCode: 'OVERLAPPING_BOOKING',
                message: 'You already have another active reservation during this time window.',
                statusCode: 409,
            );
        }

        // (b) Customer cannot have more than max_active_pending_per_customer active pending reservations
        $maxPending = max(1, (int) config('salo.reservations.max_active_pending_per_customer', 3));

        $pendingQuery = DB::table('reservations as res')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'res.restaurant_id')
            ->where('res.customer_id', $customerId)
            ->where('res.reservation_status', ReservationStatus::PENDING)
            ->where('res.reservation_end', '>', $nowStr)
            ->whereRaw(
                'TIMESTAMPADD(MINUTE, COALESCE(r.reservation_pending_expiry_minutes, 120), res.created_at) >= ?',
                [$nowStr]
            );

        if ($lockForUpdate) {
            $pendingQuery->lockForUpdate();
        }

        $activePendingCount = $pendingQuery->count();
        if ($activePendingCount >= $maxPending) {
            throw new ReservationBookingException(
                errorCode: 'TOO_MANY_PENDING',
                message: "You already have {$activePendingCount} pending reservation requests awaiting review (maximum {$maxPending} allowed at a time).",
                statusCode: 409,
            );
        }
    }

    /**
     * @return array<string, int>
     */
    private function computeCustomerSummary(int $customerId, string $nowStr): array
    {
        $blockingList = "'" . implode("','", ReservationStatus::BLOCKING) . "'";

        $agg = DB::table('reservations')
            ->where('customer_id', $customerId)
            ->selectRaw(
                "COUNT(*) AS total_count,
                SUM(CASE WHEN reservation_start >= ? AND reservation_status IN ({$blockingList}) THEN 1 ELSE 0 END) AS upcoming_count,
                SUM(CASE WHEN reservation_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
                SUM(CASE WHEN reservation_status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
                SUM(CASE WHEN reservation_status IN ('cancelled', 'rejected', 'no_show', 'expired') THEN 1 ELSE 0 END) AS cancelled_or_declined_count",
                [$nowStr]
            )
            ->first();

        return [
            'total' => (int) ($agg->total_count ?? 0),
            'upcoming' => (int) ($agg->upcoming_count ?? 0),
            'pending' => (int) ($agg->pending_count ?? 0),
            'completed' => (int) ($agg->completed_count ?? 0),
            'cancelled_or_declined' => (int) ($agg->cancelled_or_declined_count ?? 0),
        ];
    }

    private function baseCustomerReservationQuery(int $customerId): Builder
    {
        return DB::table('reservations as res')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'res.restaurant_id')
            ->leftJoin('addresses as a', 'a.address_id', '=', 'r.address_id')
            ->leftJoin('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->leftJoin('cities as c', 'c.city_id', '=', 'b.city_id')
            ->leftJoin('restaurant_tables as rt', static function ($join): void {
                $join->on('rt.table_id', '=', 'res.table_id')
                    ->on('rt.restaurant_id', '=', 'res.restaurant_id');
            })
            ->where('res.customer_id', $customerId)
            ->select([
                'res.*',
                'r.restaurant_name',
                'r.branch_name',
                'r.logo_image',
                'r.contact_phone as restaurant_phone',
                'r.reservation_notes',
                'r.reservation_cancellation_cutoff_minutes',
                'a.street as restaurant_street',
                'b.barangay_name as restaurant_barangay',
                'c.city_name as restaurant_city',
                'rt.table_name',
                'rt.dining_area',
                'rt.description as table_description',
                'rt.seating_capacity',
                'rt.min_party_size',
            ]);
    }

    /**
     * @param  array<int, object>|null  $statusHistory
     * @return array<string, mixed>
     */
    private function formatJoinedReservationRow(
        object $row,
        CarbonImmutable $manilaNow,
        ?array $statusHistory = null,
    ): array {
        $addressParts = array_filter([
            $row->restaurant_street ?? null,
            ! empty($row->restaurant_barangay) ? 'Brgy. ' . $row->restaurant_barangay : null,
            $row->restaurant_city ?? null,
        ]);

        $row->restaurant_address = $addressParts !== [] ? implode(', ', $addressParts) : null;
        $row->restaurant_logo_path = $this->fileStorageService->publicUrl($row->logo_image ?? null);

        return ReservationFormatter::format(
            row: $row,
            now: $manilaNow,
            cancellationCutoffMinutes: isset($row->reservation_cancellation_cutoff_minutes)
                ? (int) $row->reservation_cancellation_cutoff_minutes
                : null,
            statusHistory: $statusHistory,
        );
    }

    private function toManilaImmutable(?CarbonInterface $value = null): CarbonImmutable
    {
        if ($value === null) {
            return CarbonImmutable::now(self::TIMEZONE);
        }

        return CarbonImmutable::instance($value)->setTimezone(self::TIMEZONE);
    }
}
