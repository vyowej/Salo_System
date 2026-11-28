<?php

namespace App\Features\Reservations\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Payments\Services\PaymentService;
use App\Features\Reservations\Support\ReservationBookingException;
use App\Features\Reservations\Support\ReservationExpiry;
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
        private readonly ReservationExpiryService $expiryService,
        private readonly ReservationPreOrderService $preOrderService,
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

        $incomingPreOrderInput = isset($validated['pre_order']) && is_array($validated['pre_order'])
            ? $validated['pre_order']
            : null;
        $incomingPreOrderFingerprint = $this->preOrderService->canonicalPreOrderFingerprint($incomingPreOrderInput);

        // 1. Idempotency check by (customer_id, idempotency_key)
        $existing = DB::table('reservations')
            ->where('customer_id', $customerId)
            ->where('idempotency_key', $idempotencyKey)
            ->first(['reservation_id', 'restaurant_id', 'reservation_start', 'number_of_guests']);

        if ($existing) {
            $reqStartStr = CarbonImmutable::parse((string) $validated['start'], self::TIMEZONE)
                ->setTimezone(self::TIMEZONE)
                ->format('Y-m-d H:i:s');
            $storedPreOrderFingerprint = $this->preOrderService->storedPreOrderFingerprint((int) $existing->reservation_id);
            if (
                (int) $existing->restaurant_id !== (int) $validated['restaurant_id']
                || (string) $existing->reservation_start !== $reqStartStr
                || (int) $existing->number_of_guests !== (int) $validated['party_size']
                || $incomingPreOrderFingerprint !== $storedPreOrderFingerprint
            ) {
                throw new ReservationBookingException(
                    errorCode: 'IDEMPOTENCY_KEY_REUSED',
                    message: 'This idempotency key was already used for a different reservation request.',
                    statusCode: 409,
                );
            }

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

        $preOrderInput = isset($validated['pre_order']) && is_array($validated['pre_order'])
            ? $validated['pre_order']
            : null;
        $preOrderItemsInput = is_array($preOrderInput['items'] ?? null) ? $preOrderInput['items'] : [];
        $preOrderNotes = isset($preOrderInput['notes']) && is_string($preOrderInput['notes'])
            ? trim($preOrderInput['notes'])
            : null;
        $preparedPreOrder = $preOrderItemsInput !== []
            ? $this->preOrderService->validateAndPrepareItems($restaurantId, $restaurantRow, $preOrderItemsInput)
            : null;

        // 5. Customer limits (overlapping booking at any restaurant & max active pending)
        $this->assertCustomerBookingLimits($customerId, $manilaStart, $manilaEnd, $manilaNow);

        $requestedTableId = isset($validated['table_id']) && $validated['table_id'] !== null
            ? (int) $validated['table_id']
            : null;
        $requestedDiningArea = isset($validated['dining_area']) && trim((string) $validated['dining_area']) !== ''
            ? trim((string) $validated['dining_area'])
            : null;

        $assignedDiningAreaDiffers = false;

        $pendingExpiryMinutes = max(5, (int) ($settings['reservation_pending_expiry_minutes'] ?? 120));

        try {
            $reservationId = DB::transaction(function () use (
                $user,
                $customerId,
                $restaurantId,
                $restaurantRow,
                $settings,
                $pendingExpiryMinutes,
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
                $preparedPreOrder,
                $preOrderNotes,
                &$assignedDiningAreaDiffers,
            ): int {
                // Lock protocol step 1: acquire FOR UPDATE locks on candidate restaurant_tables
                // in ascending table_id order BEFORE any plain SELECT so REPEATABLE READ
                // never creates a stale snapshot.
                if ($requestedTableId !== null) {
                    $lockedTable = DB::table('restaurant_tables')
                        ->where('table_id', $requestedTableId)
                        ->where('restaurant_id', $restaurantId)
                        ->where('is_active', 1)
                        ->orderBy('table_id', 'asc')
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
                } else {
                    DB::table('restaurant_tables')
                        ->where('restaurant_id', $restaurantId)
                        ->where('is_active', 1)
                        ->where('min_party_size', '<=', $partySize)
                        ->where('seating_capacity', '>=', $partySize)
                        ->orderBy('table_id', 'asc')
                        ->lockForUpdate()
                        ->get(['table_id']);
                }

                // Lock protocol step 2: verify customer limits with row locking on customer's active reservations
                $this->assertCustomerBookingLimits($customerId, $manilaStart, $manilaEnd, $manilaNow, true);

                // Lock protocol step 3: select and lock candidate table(s) & overlapping reservations
                if ($requestedTableId !== null) {
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
                        pendingExpiryMinutes: $pendingExpiryMinutes,
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
                        pendingExpiryMinutes: $pendingExpiryMinutes,
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
                            pendingExpiryMinutes: $pendingExpiryMinutes,
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
                $depositRequired = (bool) $settings['reservation_deposit_required'];
                $depositAmount = $depositRequired
                    ? number_format((float) $settings['reservation_deposit_amount'], 2, '.', '')
                    : '0.00';
                $depositStatus = ($depositRequired && (float) $depositAmount > 0) ? 'pending' : 'none';
                $serviceFee = number_format((float) $settings['reservation_service_fee'], 2, '.', '');

                $autoConfirm = (bool) $settings['reservation_auto_confirm'] && ! $depositRequired;
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

                if ($preparedPreOrder !== null) {
                    $this->preOrderService->createLinkedPreOrder(
                        user: $user,
                        restaurantRow: $restaurantRow,
                        reservationId: $id,
                        reservationStartSql: $manilaStart->format('Y-m-d H:i:s'),
                        contactName: $contactName,
                        notes: $preOrderNotes,
                        prepared: $preparedPreOrder,
                        idempotencyKey: $idempotencyKey,
                        now: $manilaNow,
                    );
                }

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
                        title: "Reservation Confirmed at {$settings['restaurant_name']}",
                        body: "Your table for {$partySize} guest(s) on {$formattedWhen} ({$reference}) has been automatically confirmed.",
                        relatedEntityType: 'reservation',
                        relatedEntityId: $id,
                    );
                }

                return $id;
            }, 3);
        } catch (QueryException $e) {
            $sqlState = (string) ($e->errorInfo[0] ?? $e->getCode());
            $driverCode = (int) ($e->errorInfo[1] ?? 0);

            if ($sqlState === '40001' || in_array($driverCode, [1205, 1213], true)) {
                throw new ReservationBookingException(
                    errorCode: 'TRY_AGAIN',
                    message: 'High booking traffic on this table right now. Please try again.',
                    statusCode: 409,
                );
            }

            if ($sqlState === '23000' && $driverCode === 1062) {
                $raced = DB::table('reservations')
                    ->where('customer_id', $customerId)
                    ->where('idempotency_key', $idempotencyKey)
                    ->first(['reservation_id', 'restaurant_id', 'reservation_start', 'number_of_guests']);

                if ($raced) {
                    $storedPreOrderFingerprint = $this->preOrderService->storedPreOrderFingerprint((int) $raced->reservation_id);
                    if (
                        (int) $raced->restaurant_id !== $restaurantId
                        || (string) $raced->reservation_start !== $manilaStart->format('Y-m-d H:i:s')
                        || (int) $raced->number_of_guests !== $partySize
                        || $incomingPreOrderFingerprint !== $storedPreOrderFingerprint
                    ) {
                        throw new ReservationBookingException(
                            errorCode: 'IDEMPOTENCY_KEY_REUSED',
                            message: 'This idempotency key was already used for a different reservation request.',
                            statusCode: 409,
                        );
                    }

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

        $this->expiryService->expireDue(
            now: $manilaNow,
            reservationId: $reservationId,
        );

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

        $this->expiryService->expireDue(
            now: $manilaNow,
            reservationId: $reservationId,
        );

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

            if ($currentStatus === ReservationStatus::EXPIRED) {
                throw new ReservationBookingException(
                    errorCode: 'INVALID_TRANSITION',
                    message: 'This reservation request has already expired.',
                    statusCode: 409,
                );
            }

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

            app(PaymentService::class)->voidPendingReservationPayments(
                reservationId: $reservationId,
                reason: $cleanReason ?? 'Cancelled by customer.',
                actorUserId: $customerId,
                request: $request,
            );

            $this->preOrderService->syncPreOrderOnReservationTerminalState(
                reservationId: $reservationId,
                cancelledBy: 'customer',
                reason: $cleanReason ?? 'Cancelled by customer.',
                actorUserId: $customerId,
                now: $manilaNow,
            );

            if (((string) ($row->deposit_status ?? 'none')) === 'paid') {
                $this->auditLogService->record(
                    actorUserId: $customerId,
                    action: 'customer_paid_reservation_cancelled_review',
                    entityType: 'reservations',
                    entityId: $reservationId,
                    oldValues: ['deposit_status' => 'paid', 'reservation_status' => $currentStatus],
                    newValues: ['deposit_status' => 'paid', 'reservation_status' => ReservationStatus::CANCELLED, 'flagged_for_admin_review' => true],
                    reason: 'Customer cancelled a deposit-paid reservation; deposit held pending admin review (refund policy not approved).',
                    request: $request,
                );

                $reference = $row->reservation_reference ?: ('#' . $reservationId);
                $this->notificationService->notifyUser(
                    userId: $customerId,
                    workspace: 'customer',
                    type: 'reservation_deposit_under_review',
                    title: "Deposit Under Review ({$reference})",
                    body: 'Your reservation was cancelled. Your deposit of PHP '.number_format((float) ($row->deposit_amount ?? 0), 2).' is being held pending admin review.',
                    relatedEntityType: 'reservation',
                    relatedEntityId: $reservationId,
                );
            }

            $handlerUserIds = $this->notificationService->resolveRestaurantReservationHandlerUserIds($restaurantId);
            if ($handlerUserIds !== []) {
                $reference = $row->reservation_reference ?: ('#' . $reservationId);
                $formattedWhen = $startCarbon->format('M j, Y \a\t g:i A');
                $guestName = $row->contact_name ?: 'Customer';
                $reasonSuffix = $cleanReason !== null ? " Reason: {$cleanReason}" : '';
                $depositSuffix = ((string) ($row->deposit_status ?? 'none')) === 'paid'
                    ? ' Deposit already received — decide whether to refund.'
                    : '';

                $this->notificationService->notifyUsers(
                    userIds: $handlerUserIds,
                    workspace: 'restaurant',
                    type: 'reservation_cancelled_by_customer',
                    title: "Reservation Cancelled ({$reference})",
                    body: "{$guestName} cancelled their reservation for {$row->number_of_guests} guest(s) on {$formattedWhen}.{$reasonSuffix}{$depositSuffix}",
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

        // (a) Customer cannot hold two non-expired blocking reservations whose time windows overlap at ANY restaurant
        $overlapQuery = DB::table('reservations as res')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'res.restaurant_id')
            ->where('res.customer_id', $customerId)
            ->whereIn('res.reservation_status', ReservationStatus::BLOCKING)
            ->where('res.reservation_start', '<', $endStr)
            ->where('res.reservation_end', '>', $startStr);

        if ($lockForUpdate) {
            $overlapQuery->lockForUpdate();
        }

        $hasOverlap = $overlapQuery
            ->get([
                'res.reservation_id',
                'res.reservation_status',
                'res.reservation_start',
                'res.created_at',
                'res.approved_at',
                'res.updated_at',
                'r.reservation_pending_expiry_minutes',
            ])
            ->contains(static fn (object $row): bool => ! ReservationExpiry::isExpired($row, $manilaNow));

        if ($hasOverlap) {
            throw new ReservationBookingException(
                errorCode: 'OVERLAPPING_BOOKING',
                message: 'You already have another active reservation during this time window.',
                statusCode: 409,
            );
        }

        // (b) Customer cannot have more than max_active_pending_per_customer non-expired pending reservations
        $maxPending = max(1, (int) config('salo.reservations.max_active_pending_per_customer', 3));

        $pendingQuery = DB::table('reservations as res')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'res.restaurant_id')
            ->where('res.customer_id', $customerId)
            ->where('res.reservation_status', ReservationStatus::PENDING)
            ->where('res.reservation_end', '>', $nowStr);

        if ($lockForUpdate) {
            $pendingQuery->lockForUpdate();
        }

        $activePendingCount = $pendingQuery
            ->get([
                'res.reservation_id',
                'res.reservation_status',
                'res.reservation_start',
                'res.created_at',
                'r.reservation_pending_expiry_minutes',
            ])
            ->reject(static fn (object $row): bool => ReservationExpiry::isExpired($row, $manilaNow))
            ->count();
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
                'r.reservation_pending_expiry_minutes',
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
        $formattedAddress = \App\Support\AddressFormatter::format($row);
        $row->restaurant_address = $formattedAddress !== '' ? $formattedAddress : null;
        $row->restaurant_logo_path = $this->fileStorageService->publicUrl($row->logo_image ?? null);

        $formatted = ReservationFormatter::format(
            row: $row,
            now: $manilaNow,
            cancellationCutoffMinutes: isset($row->reservation_cancellation_cutoff_minutes)
                ? (int) $row->reservation_cancellation_cutoff_minutes
                : null,
            statusHistory: $statusHistory,
        );

        $reservationId = (int) $row->reservation_id;
        $paymentRows = DB::table('payment_allocations as pa')
            ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
            ->where('pa.reservation_id', $reservationId)
            ->whereIn('pa.allocation_type', ['reservation_payment', 'reservation_refund'])
            ->orderByDesc('p.payment_id')
            ->select(['p.*', 'pa.allocation_type'])
            ->get();

        $paymentService = app(PaymentService::class);
        $latestPaymentRow = $paymentRows->firstWhere('allocation_type', 'reservation_payment');
        $latestRefundRow = $paymentRows->firstWhere('allocation_type', 'reservation_refund');

        $formatted['latest_payment'] = $latestPaymentRow ? $paymentService->formatPayment($latestPaymentRow) : null;
        $formatted['latest_refund'] = $latestRefundRow ? $paymentService->formatPayment($latestRefundRow) : null;
        $formatted['deposit_under_review'] = ((string) ($row->reservation_status ?? '')) === ReservationStatus::CANCELLED
            && ((string) ($row->cancelled_by ?? '')) === 'customer'
            && ((string) ($row->deposit_status ?? 'none')) === 'paid';

        $preOrders = $this->preOrderService->loadByReservationIds(
            [$reservationId],
            [$reservationId => $row],
            $manilaNow,
        );
        $formatted['pre_order'] = $preOrders[$reservationId] ?? null;

        return $formatted;
    }

    private function toManilaImmutable(?CarbonInterface $value = null): CarbonImmutable
    {
        if ($value === null) {
            return CarbonImmutable::now(self::TIMEZONE);
        }

        return CarbonImmutable::instance($value)->setTimezone(self::TIMEZONE);
    }
}
