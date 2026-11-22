<?php

namespace App\Features\Reservations\Services;

use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Features\Reservations\Support\ReservationStatus;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\WorkspaceAccessResolver;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class OwnerTableService
{
    public function __construct(
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
        private readonly AuditLogService $auditLogService,
    ) {}

    /**
     * List all tables for the authorized restaurant with live reservation status for the selected date,
     * summary metrics, and distinct dining areas using a single aggregated query.
     *
     * @param  array<string, mixed>  $filters
     * @return array{items: array<int, array<string, mixed>>, summary: array<string, int>, dining_areas: array<int, string>}
     */
    public function listTables(
        User $user,
        array $filters = [],
        ?int $restaurantId = null,
        ?CarbonInterface $now = null,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForTables(
            $user,
            $restaurantId,
            'tables.view',
        );
        $targetRestaurantId = (int) $restaurant->restaurant_id;

        $manilaNow = $now !== null
            ? CarbonImmutable::instance($now)->setTimezone('Asia/Manila')
            : CarbonImmutable::now('Asia/Manila');

        $todayDate = $manilaNow->format('Y-m-d');
        $selectedDate = isset($filters['date']) && is_string($filters['date']) && trim($filters['date']) !== ''
            ? trim($filters['date'])
            : $todayDate;

        $rows = $this->fetchAggregatedTables($targetRestaurantId, $selectedDate, $manilaNow);

        $allFormatted = [];
        $diningAreasMap = [];
        $totalTables = 0;
        $activeTables = 0;
        $archivedTables = 0;
        $totalSeats = 0;
        $availableNow = 0;
        $reservedCount = 0;
        $occupiedCount = 0;

        foreach ($rows as $row) {
            $item = $this->formatTableRow($row, $selectedDate, $todayDate);
            $allFormatted[] = $item;

            $totalTables++;
            if ($item['is_active']) {
                $activeTables++;
                $totalSeats += (int) $item['seating_capacity'];

                if ($item['table_status'] === 'occupied') {
                    $occupiedCount++;
                } elseif ($item['table_status'] === 'reserved') {
                    $reservedCount++;
                } else {
                    $availableNow++;
                }
            } else {
                $archivedTables++;
            }

            if ($item['dining_area'] !== null && $item['dining_area'] !== '') {
                $key = mb_strtolower($item['dining_area']);
                if (! isset($diningAreasMap[$key])) {
                    $diningAreasMap[$key] = $item['dining_area'];
                }
            }
        }

        $diningAreas = array_values($diningAreasMap);
        natcasesort($diningAreas);
        $diningAreas = array_values($diningAreas);

        $statusFilter = isset($filters['status']) && is_string($filters['status']) && trim($filters['status']) !== ''
            ? strtolower(trim($filters['status']))
            : 'all';
        $areaFilter = isset($filters['dining_area']) && is_string($filters['dining_area']) && trim($filters['dining_area']) !== ''
            ? mb_strtolower(trim($filters['dining_area']))
            : null;
        $searchFilter = isset($filters['search']) && is_string($filters['search']) && trim($filters['search']) !== ''
            ? mb_strtolower(trim($filters['search']))
            : null;

        $filteredItems = array_values(array_filter(
            $allFormatted,
            static function (array $item) use ($statusFilter, $areaFilter, $searchFilter): bool {
                if ($statusFilter === 'active' && ! $item['is_active']) {
                    return false;
                }
                if ($statusFilter === 'archived' && $item['is_active']) {
                    return false;
                }

                if ($areaFilter !== null) {
                    $itemArea = $item['dining_area'] !== null ? mb_strtolower($item['dining_area']) : '';
                    if ($itemArea !== $areaFilter) {
                        return false;
                    }
                }

                if ($searchFilter !== null) {
                    $haystack = mb_strtolower(implode(' ', array_filter([
                        $item['table_name'],
                        $item['dining_area'] ?? '',
                        $item['description'] ?? '',
                    ])));
                    if (! str_contains($haystack, $searchFilter)) {
                        return false;
                    }
                }

                return true;
            }
        ));

        return [
            'items' => $filteredItems,
            'summary' => [
                'total_tables' => $totalTables,
                'active_tables' => $activeTables,
                'archived_tables' => $archivedTables,
                'total_seats' => $totalSeats,
                'available_now' => $availableNow,
                'reserved_count' => $reservedCount,
                'occupied_count' => $occupiedCount,
            ],
            'dining_areas' => $diningAreas,
        ];
    }

    /**
     * Retrieve a single table by ID scoped to the authorized restaurant.
     * Throws 404 NotFoundHttpException if the table does not exist or belongs to another restaurant.
     *
     * @return array<string, mixed>
     */
    public function showTable(
        User $user,
        int $tableId,
        ?int $restaurantId = null,
        ?string $date = null,
        ?CarbonInterface $now = null,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForTables(
            $user,
            $restaurantId,
            'tables.view',
        );
        $targetRestaurantId = (int) $restaurant->restaurant_id;

        $manilaNow = $now !== null
            ? CarbonImmutable::instance($now)->setTimezone('Asia/Manila')
            : CarbonImmutable::now('Asia/Manila');

        $todayDate = $manilaNow->format('Y-m-d');
        $selectedDate = $date !== null && trim($date) !== '' ? trim($date) : $todayDate;

        $rows = $this->fetchAggregatedTables($targetRestaurantId, $selectedDate, $manilaNow, $tableId);
        $row = $rows[0] ?? null;

        if (! $row) {
            throw new NotFoundHttpException('Table not found.');
        }

        return $this->formatTableRow($row, $selectedDate, $todayDate);
    }

    /**
     * Create a new table for the authorized restaurant.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function createTable(
        User $user,
        array $validated,
        ?int $restaurantId,
        Request $request,
        ?CarbonInterface $now = null,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForTables(
            $user,
            $restaurantId,
            'tables.add',
        );
        $targetRestaurantId = (int) $restaurant->restaurant_id;

        $tableName = trim((string) $validated['table_name']);
        $seatingCapacity = (int) $validated['seating_capacity'];
        $minPartySize = array_key_exists('min_party_size', $validated) && $validated['min_party_size'] !== null
            ? (int) $validated['min_party_size']
            : 1;

        if ($minPartySize < 1 || $minPartySize > $seatingCapacity) {
            throw ValidationException::withMessages([
                'min_party_size' => ["Minimum party size must be between 1 and {$seatingCapacity}."],
            ]);
        }

        $diningArea = isset($validated['dining_area']) && trim((string) $validated['dining_area']) !== ''
            ? trim((string) $validated['dining_area'])
            : null;
        $description = isset($validated['description']) && trim((string) $validated['description']) !== ''
            ? trim((string) $validated['description'])
            : null;

        $this->assertUniqueTableName($targetRestaurantId, $tableName);

        try {
            $tableId = DB::transaction(function () use (
                $targetRestaurantId,
                $tableName,
                $seatingCapacity,
                $minPartySize,
                $diningArea,
                $description,
                $user,
                $request,
            ): int {
                $timestamp = CarbonImmutable::now('Asia/Manila')->format('Y-m-d H:i:s');

                $id = (int) DB::table('restaurant_tables')->insertGetId([
                    'restaurant_id' => $targetRestaurantId,
                    'table_name' => $tableName,
                    'dining_area' => $diningArea,
                    'description' => $description,
                    'seating_capacity' => $seatingCapacity,
                    'min_party_size' => $minPartySize,
                    'is_active' => 1,
                    'created_at' => $timestamp,
                    'updated_at' => $timestamp,
                ]);

                $this->auditLogService->record(
                    actorUserId: (int) $user->user_id,
                    action: 'owner_table_created',
                    entityType: 'restaurant_tables',
                    entityId: $id,
                    oldValues: null,
                    newValues: [
                        'restaurant_id' => $targetRestaurantId,
                        'table_name' => $tableName,
                        'dining_area' => $diningArea,
                        'description' => $description,
                        'seating_capacity' => $seatingCapacity,
                        'min_party_size' => $minPartySize,
                        'is_active' => true,
                    ],
                    request: $request,
                );

                return $id;
            });
        } catch (QueryException $e) {
            if ($this->isDuplicateKeyException($e)) {
                throw ValidationException::withMessages([
                    'table_name' => ['A table with this name already exists for your restaurant.'],
                ]);
            }

            throw $e;
        }

        return $this->showTable($user, $tableId, $targetRestaurantId, null, $now);
    }

    /**
     * Partially update an existing table for the authorized restaurant.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function updateTable(
        User $user,
        int $tableId,
        array $validated,
        ?int $restaurantId,
        Request $request,
        ?CarbonInterface $now = null,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForTables(
            $user,
            $restaurantId,
            'tables.edit',
        );
        $targetRestaurantId = (int) $restaurant->restaurant_id;

        $manilaNow = $now !== null
            ? CarbonImmutable::instance($now)->setTimezone('Asia/Manila')
            : CarbonImmutable::now('Asia/Manila');

        try {
            DB::transaction(function () use (
                $targetRestaurantId,
                $tableId,
                $validated,
                $user,
                $request,
                $manilaNow,
            ): void {
                $existing = DB::table('restaurant_tables')
                    ->where('table_id', $tableId)
                    ->where('restaurant_id', $targetRestaurantId)
                    ->lockForUpdate()
                    ->first();

                if (! $existing) {
                    throw new NotFoundHttpException('Table not found.');
                }

                $oldCapacity = (int) $existing->seating_capacity;
                $oldMinParty = (int) ($existing->min_party_size ?? 1);

                $newTableName = array_key_exists('table_name', $validated)
                    ? trim((string) $validated['table_name'])
                    : (string) $existing->table_name;

                $newCapacity = array_key_exists('seating_capacity', $validated)
                    ? (int) $validated['seating_capacity']
                    : $oldCapacity;

                $newMinParty = array_key_exists('min_party_size', $validated) && $validated['min_party_size'] !== null
                    ? (int) $validated['min_party_size']
                    : $oldMinParty;

                $newDiningArea = array_key_exists('dining_area', $validated)
                    ? ($validated['dining_area'] !== null && trim((string) $validated['dining_area']) !== ''
                        ? trim((string) $validated['dining_area'])
                        : null)
                    : $existing->dining_area;

                $newDescription = array_key_exists('description', $validated)
                    ? ($validated['description'] !== null && trim((string) $validated['description']) !== ''
                        ? trim((string) $validated['description'])
                        : null)
                    : $existing->description;

                if ($newMinParty < 1 || $newMinParty > $newCapacity) {
                    throw ValidationException::withMessages([
                        'min_party_size' => ["Minimum party size must be between 1 and {$newCapacity}."],
                    ]);
                }

                $this->assertUniqueTableName($targetRestaurantId, $newTableName, $tableId);

                if ($newCapacity < $oldCapacity || $newMinParty > $oldMinParty) {
                    $nowStr = $manilaNow->format('Y-m-d H:i:s');
                    $conflicts = DB::table('reservations')
                        ->where('restaurant_id', $targetRestaurantId)
                        ->where('table_id', $tableId)
                        ->whereIn('reservation_status', ReservationStatus::BLOCKING)
                        ->where('reservation_start', '>=', $nowStr)
                        ->where(function ($query) use ($newCapacity, $newMinParty): void {
                            $query->where('number_of_guests', '>', $newCapacity)
                                ->orWhere('number_of_guests', '<', $newMinParty);
                        })
                        ->orderBy('reservation_start', 'asc')
                        ->orderBy('reservation_id', 'asc')
                        ->get(['reservation_id', 'reservation_reference', 'number_of_guests']);

                    if ($conflicts->isNotEmpty()) {
                        $count = $conflicts->count();
                        $earliest = $conflicts->first();
                        $earliestRef = $earliest->reservation_reference ?: ('#' . $earliest->reservation_id);

                        throw new ConflictHttpException(
                            "Cannot update table capacity bounds: {$count} upcoming reservation(s) assigned to this table would no longer fit (earliest conflict: {$earliestRef} for {$earliest->number_of_guests} guest(s)). Please reassign or adjust those reservations first."
                        );
                    }
                }

                $timestamp = $manilaNow->format('Y-m-d H:i:s');

                DB::table('restaurant_tables')
                    ->where('table_id', $tableId)
                    ->where('restaurant_id', $targetRestaurantId)
                    ->update([
                        'table_name' => $newTableName,
                        'dining_area' => $newDiningArea,
                        'description' => $newDescription,
                        'seating_capacity' => $newCapacity,
                        'min_party_size' => $newMinParty,
                        'updated_at' => $timestamp,
                    ]);

                $this->auditLogService->record(
                    actorUserId: (int) $user->user_id,
                    action: 'owner_table_updated',
                    entityType: 'restaurant_tables',
                    entityId: $tableId,
                    oldValues: [
                        'table_name' => $existing->table_name,
                        'dining_area' => $existing->dining_area,
                        'description' => $existing->description,
                        'seating_capacity' => $oldCapacity,
                        'min_party_size' => $oldMinParty,
                    ],
                    newValues: [
                        'table_name' => $newTableName,
                        'dining_area' => $newDiningArea,
                        'description' => $newDescription,
                        'seating_capacity' => $newCapacity,
                        'min_party_size' => $newMinParty,
                    ],
                    request: $request,
                );
            });
        } catch (QueryException $e) {
            if ($this->isDuplicateKeyException($e)) {
                throw ValidationException::withMessages([
                    'table_name' => ['A table with this name already exists for your restaurant.'],
                ]);
            }

            throw $e;
        }

        return $this->showTable($user, $tableId, $targetRestaurantId, null, $manilaNow);
    }

    /**
     * Archive a table (is_active = 0). Idempotent if already archived.
     * Blocks with 409 if the table has any future blocking reservation.
     *
     * @return array<string, mixed>
     */
    public function archiveTable(
        User $user,
        int $tableId,
        ?int $restaurantId,
        Request $request,
        ?CarbonInterface $now = null,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForTables(
            $user,
            $restaurantId,
            'tables.manageAvailability',
        );
        $targetRestaurantId = (int) $restaurant->restaurant_id;

        $manilaNow = $now !== null
            ? CarbonImmutable::instance($now)->setTimezone('Asia/Manila')
            : CarbonImmutable::now('Asia/Manila');

        DB::transaction(function () use (
            $targetRestaurantId,
            $tableId,
            $user,
            $request,
            $manilaNow,
        ): void {
            $existing = DB::table('restaurant_tables')
                ->where('table_id', $tableId)
                ->where('restaurant_id', $targetRestaurantId)
                ->lockForUpdate()
                ->first();

            if (! $existing) {
                throw new NotFoundHttpException('Table not found.');
            }

            if ((int) $existing->is_active === 0) {
                return;
            }

            $nowStr = $manilaNow->format('Y-m-d H:i:s');
            $futureBlockingCount = DB::table('reservations')
                ->where('restaurant_id', $targetRestaurantId)
                ->where('table_id', $tableId)
                ->whereIn('reservation_status', ReservationStatus::BLOCKING)
                ->where('reservation_start', '>=', $nowStr)
                ->count();

            if ($futureBlockingCount > 0) {
                throw new ConflictHttpException(
                    "Cannot archive table \"{$existing->table_name}\": {$futureBlockingCount} upcoming active reservation(s) are assigned to it. Please reassign or cancel them first."
                );
            }

            DB::table('restaurant_tables')
                ->where('table_id', $tableId)
                ->where('restaurant_id', $targetRestaurantId)
                ->update([
                    'is_active' => 0,
                    'updated_at' => $nowStr,
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_table_archived',
                entityType: 'restaurant_tables',
                entityId: $tableId,
                oldValues: ['is_active' => true],
                newValues: ['is_active' => false],
                request: $request,
            );
        });

        return $this->showTable($user, $tableId, $targetRestaurantId, null, $manilaNow);
    }

    /**
     * Reactivate an archived table (is_active = 1). Idempotent if already active.
     *
     * @return array<string, mixed>
     */
    public function reactivateTable(
        User $user,
        int $tableId,
        ?int $restaurantId,
        Request $request,
        ?CarbonInterface $now = null,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForTables(
            $user,
            $restaurantId,
            'tables.manageAvailability',
        );
        $targetRestaurantId = (int) $restaurant->restaurant_id;

        $manilaNow = $now !== null
            ? CarbonImmutable::instance($now)->setTimezone('Asia/Manila')
            : CarbonImmutable::now('Asia/Manila');

        DB::transaction(function () use (
            $targetRestaurantId,
            $tableId,
            $user,
            $request,
            $manilaNow,
        ): void {
            $existing = DB::table('restaurant_tables')
                ->where('table_id', $tableId)
                ->where('restaurant_id', $targetRestaurantId)
                ->lockForUpdate()
                ->first();

            if (! $existing) {
                throw new NotFoundHttpException('Table not found.');
            }

            if ((int) $existing->is_active === 1) {
                return;
            }

            $nowStr = $manilaNow->format('Y-m-d H:i:s');

            DB::table('restaurant_tables')
                ->where('table_id', $tableId)
                ->where('restaurant_id', $targetRestaurantId)
                ->update([
                    'is_active' => 1,
                    'updated_at' => $nowStr,
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_table_reactivated',
                entityType: 'restaurant_tables',
                entityId: $tableId,
                oldValues: ['is_active' => false],
                newValues: ['is_active' => true],
                request: $request,
            );
        });

        return $this->showTable($user, $tableId, $targetRestaurantId, null, $manilaNow);
    }

    /**
     * Execute ONE query joining restaurant_tables with grouped blocking reservation aggregates.
     *
     * @return array<int, object>
     */
    private function fetchAggregatedTables(
        int $restaurantId,
        string $selectedDate,
        CarbonImmutable $manilaNow,
        ?int $onlyTableId = null,
    ): array {
        $dayStart = CarbonImmutable::parse($selectedDate . ' 00:00:00', 'Asia/Manila')->format('Y-m-d H:i:s');
        $dayEnd = CarbonImmutable::parse($selectedDate . ' 23:59:59', 'Asia/Manila')->format('Y-m-d H:i:s');
        $nowStr = $manilaNow->format('Y-m-d H:i:s');

        $reservationAggregates = DB::table('reservations')
            ->where('restaurant_id', $restaurantId)
            ->whereNotNull('table_id')
            ->whereIn('reservation_status', ReservationStatus::BLOCKING)
            ->groupBy('table_id')
            ->selectRaw(
                "table_id,
                SUM(CASE WHEN reservation_start >= ? AND reservation_start <= ? THEN 1 ELSE 0 END) AS date_reservations_count,
                SUM(CASE WHEN reservation_start >= ? THEN 1 ELSE 0 END) AS upcoming_reservations_count,
                SUM(CASE WHEN reservation_status IN ('arrived', 'seated') AND reservation_start <= ? AND reservation_end > ? THEN 1 ELSE 0 END) AS occupied_now_count,
                SUBSTRING_INDEX(
                    GROUP_CONCAT(
                        CASE
                            WHEN reservation_start >= ? AND reservation_start <= ?
                            THEN CONCAT_WS('::', reservation_id, COALESCE(reservation_reference, ''), DATE_FORMAT(reservation_start, '%Y-%m-%d %H:%i:%s'), number_of_guests, reservation_status)
                            ELSE NULL
                        END
                        ORDER BY
                            CASE WHEN reservation_end >= ? THEN 0 ELSE 1 END ASC,
                            reservation_start ASC,
                            reservation_id ASC
                        SEPARATOR '||'
                    ),
                    '||',
                    1
                ) AS next_reservation_packed",
                [
                    $dayStart,
                    $dayEnd,
                    $nowStr,
                    $nowStr,
                    $nowStr,
                    $dayStart,
                    $dayEnd,
                    $nowStr,
                ]
            );

        $query = DB::table('restaurant_tables as rt')
            ->leftJoinSub($reservationAggregates, 'ra', static function ($join): void {
                $join->on('ra.table_id', '=', 'rt.table_id');
            })
            ->where('rt.restaurant_id', $restaurantId);

        if ($onlyTableId !== null) {
            $query->where('rt.table_id', $onlyTableId);
        }

        return $query
            ->orderBy('rt.is_active', 'desc')
            ->orderBy('rt.table_name', 'asc')
            ->orderBy('rt.table_id', 'asc')
            ->select([
                'rt.table_id',
                'rt.restaurant_id',
                'rt.table_name',
                'rt.dining_area',
                'rt.description',
                'rt.seating_capacity',
                'rt.min_party_size',
                'rt.is_active',
                'rt.created_at',
                'rt.updated_at',
                DB::raw('COALESCE(ra.date_reservations_count, 0) AS date_reservations_count'),
                DB::raw('COALESCE(ra.upcoming_reservations_count, 0) AS upcoming_reservations_count'),
                DB::raw('COALESCE(ra.occupied_now_count, 0) AS occupied_now_count'),
                'ra.next_reservation_packed',
            ])
            ->get()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function formatTableRow(object $row, string $selectedDate, string $todayDate): array
    {
        $isActive = (bool) $row->is_active;
        $dateReservationsCount = (int) ($row->date_reservations_count ?? 0);
        $upcomingReservationsCount = (int) ($row->upcoming_reservations_count ?? 0);
        $occupiedNowCount = (int) ($row->occupied_now_count ?? 0);
        $isToday = ($selectedDate === $todayDate);

        if (! $isActive) {
            $tableStatus = 'archived';
        } elseif ($isToday && $occupiedNowCount > 0) {
            $tableStatus = 'occupied';
        } elseif ($dateReservationsCount > 0) {
            $tableStatus = 'reserved';
        } else {
            $tableStatus = 'available';
        }

        $nextReservation = null;
        if (! empty($row->next_reservation_packed) && is_string($row->next_reservation_packed)) {
            $parts = explode('::', $row->next_reservation_packed);
            if (count($parts) >= 5 && (int) $parts[0] > 0) {
                $nextReservation = [
                    'reservation_id' => (int) $parts[0],
                    'reservation_reference' => $parts[1] !== '' ? $parts[1] : null,
                    'reservation_start' => OrderTimestampFormatter::toManilaIso($parts[2]),
                    'number_of_guests' => (int) $parts[3],
                    'status' => $parts[4],
                ];
            }
        }

        return [
            'table_id' => (int) $row->table_id,
            'restaurant_id' => (int) $row->restaurant_id,
            'table_name' => (string) $row->table_name,
            'seating_capacity' => (int) $row->seating_capacity,
            'min_party_size' => (int) ($row->min_party_size ?? 1),
            'dining_area' => $row->dining_area !== null && trim((string) $row->dining_area) !== ''
                ? trim((string) $row->dining_area)
                : null,
            'description' => $row->description !== null && trim((string) $row->description) !== ''
                ? trim((string) $row->description)
                : null,
            'is_active' => $isActive,
            'table_status' => $tableStatus,
            'reservations_count' => $dateReservationsCount,
            'next_reservation' => $nextReservation,
            'upcoming_reservations_count' => $upcomingReservationsCount,
            'created_at' => OrderTimestampFormatter::toManilaIso($row->created_at ?? null),
            'updated_at' => OrderTimestampFormatter::toManilaIso($row->updated_at ?? null),
        ];
    }

    private function assertUniqueTableName(int $restaurantId, string $tableName, ?int $ignoreTableId = null): void
    {
        $query = DB::table('restaurant_tables')
            ->where('restaurant_id', $restaurantId)
            ->whereRaw('LOWER(table_name) = ?', [mb_strtolower($tableName)]);

        if ($ignoreTableId !== null) {
            $query->where('table_id', '!=', $ignoreTableId);
        }

        if ($query->exists()) {
            throw ValidationException::withMessages([
                'table_name' => ['A table with this name already exists for your restaurant.'],
            ]);
        }
    }

    private function isDuplicateKeyException(QueryException $e): bool
    {
        $sqlState = (string) ($e->errorInfo[0] ?? $e->getCode());
        $driverCode = (int) ($e->errorInfo[1] ?? 0);

        return $sqlState === '23000' && $driverCode === 1062;
    }
}
