<?php

namespace App\Features\Locations\Services;

use App\Models\User;
use App\Support\AddressService;
use App\Support\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AdminServiceAreaService
{
    public function __construct(
        private readonly AddressService $addressService,
        private readonly AuditLogService $auditLog,
    ) {}

    /**
     * List all platform service areas (or only active ones when $activeOnly = true).
     *
     * @return list<array<string, mixed>>
     */
    public function list(bool $activeOnly = false): array
    {
        $query = DB::table('platform_service_areas as psa')
            ->join('provinces as p', 'p.province_id', '=', 'psa.province_id')
            ->leftJoin('cities as c', 'c.city_id', '=', 'psa.city_id')
            ->leftJoin('barangays as b', 'b.barangay_id', '=', 'psa.barangay_id')
            ->select([
                'psa.platform_service_area_id',
                'psa.province_id',
                'psa.city_id',
                'psa.barangay_id',
                'psa.area_level',
                'psa.is_active',
                'psa.center_latitude',
                'psa.center_longitude',
                'psa.notes',
                'psa.created_at',
                'psa.updated_at',
                'p.province_name',
                'c.city_name',
                'b.barangay_name',
            ])
            ->orderBy('p.province_name')
            ->orderBy('c.city_name')
            ->orderBy('b.barangay_name');

        if ($activeOnly) {
            $query->where('psa.is_active', 1);
        }

        $rows = $query->get();
        if ($rows->isEmpty()) {
            return [];
        }

        $psaIds = $rows->pluck('platform_service_area_id')->map(static fn ($id): int => (int) $id)->all();
        $boundariesById = DB::table('platform_service_areas')
            ->whereIn('platform_service_area_id', $psaIds)
            ->pluck('boundary_geojson', 'platform_service_area_id');

        $restaurantCountsById = $this->computeRestaurantCountsForPlatformAreas($rows);

        return $rows->map(function (object $row) use ($boundariesById, $restaurantCountsById): array {
            $id = (int) $row->platform_service_area_id;
            $row->boundary_geojson = $boundariesById[$id] ?? null;

            return $this->formatRow($row, $restaurantCountsById[$id] ?? 0);
        })->all();
    }

    /**
     * Create a new platform service area, preventing duplicates.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function create(User $admin, array $data, ?Request $request = null): array
    {
        $province = trim((string) $data['province']);
        $city = isset($data['city']) && trim((string) $data['city']) !== '' ? trim((string) $data['city']) : null;
        $barangay = isset($data['barangay']) && trim((string) $data['barangay']) !== '' ? trim((string) $data['barangay']) : null;

        if ($barangay !== null && $city === null) {
            throw ValidationException::withMessages([
                'city' => ['City/Municipality is required when specifying a barangay.'],
            ]);
        }

        $areaLevel = $barangay !== null ? 'barangay' : ($city !== null ? 'city' : 'province');

        $id = DB::transaction(function () use ($admin, $province, $city, $barangay, $areaLevel, $data, $request): int {
            $ids = $this->addressService->resolveHierarchyIds($province, $city, $barangay);

            $duplicate = DB::table('platform_service_areas')
                ->where('province_id', $ids['province_id'])
                ->where('city_key', $ids['city_id'] ?? 0)
                ->where('barangay_key', $ids['barangay_id'] ?? 0)
                ->exists();

            if ($duplicate) {
                throw ValidationException::withMessages([
                    'service_area' => ['This service area already exists. Edit or toggle its status instead.'],
                ]);
            }

            $newId = (int) DB::table('platform_service_areas')->insertGetId([
                'province_id' => $ids['province_id'],
                'city_id' => $ids['city_id'],
                'barangay_id' => $ids['barangay_id'],
                'area_level' => $areaLevel,
                'is_active' => array_key_exists('is_active', $data) ? ((bool) $data['is_active'] ? 1 : 0) : 1,
                'center_latitude' => isset($data['center_latitude']) && is_numeric($data['center_latitude']) ? (float) $data['center_latitude'] : null,
                'center_longitude' => isset($data['center_longitude']) && is_numeric($data['center_longitude']) ? (float) $data['center_longitude'] : null,
                'boundary_geojson' => $data['boundary_geojson'] ?? null,
                'notes' => isset($data['notes']) ? mb_substr(trim((string) $data['notes']), 0, 255) : null,
                'updated_by' => $admin->user_id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $this->auditLog->record(
                actorUserId: $admin->user_id,
                action: 'service_area.created',
                entityType: 'platform_service_area',
                entityId: $newId,
                oldValues: null,
                newValues: [
                    'province' => $province,
                    'city' => $city,
                    'barangay' => $barangay,
                    'area_level' => $areaLevel,
                    'is_active' => array_key_exists('is_active', $data) ? (bool) $data['is_active'] : true,
                ],
                reason: $data['reason'] ?? 'Created platform service area',
                request: $request,
            );

            return $newId;
        });

        return $this->findById($id);
    }

    /**
     * Update an existing platform service area (status, coordinates, notes, boundary).
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function update(User $admin, int $id, array $data, ?Request $request = null): array
    {
        $existing = DB::table('platform_service_areas')
            ->where('platform_service_area_id', $id)
            ->first();

        if (! $existing) {
            abort(404, 'Service area not found.');
        }

        $oldValues = [
            'is_active' => (bool) $existing->is_active,
            'center_latitude' => $existing->center_latitude,
            'center_longitude' => $existing->center_longitude,
            'notes' => $existing->notes,
        ];

        $updates = [
            'updated_by' => $admin->user_id,
            'updated_at' => now(),
        ];

        if (array_key_exists('is_active', $data)) {
            $updates['is_active'] = (bool) $data['is_active'] ? 1 : 0;
        }
        if (array_key_exists('center_latitude', $data)) {
            $updates['center_latitude'] = is_numeric($data['center_latitude']) ? (float) $data['center_latitude'] : null;
        }
        if (array_key_exists('center_longitude', $data)) {
            $updates['center_longitude'] = is_numeric($data['center_longitude']) ? (float) $data['center_longitude'] : null;
        }
        if (array_key_exists('boundary_geojson', $data)) {
            $updates['boundary_geojson'] = $data['boundary_geojson'];
        }
        if (array_key_exists('notes', $data)) {
            $updates['notes'] = $data['notes'] !== null ? mb_substr(trim((string) $data['notes']), 0, 255) : null;
        }

        DB::table('platform_service_areas')
            ->where('platform_service_area_id', $id)
            ->update($updates);

        $action = array_key_exists('is_active', $data)
            ? ((bool) $data['is_active'] ? 'service_area.activated' : 'service_area.deactivated')
            : 'service_area.updated';

        $this->auditLog->record(
            actorUserId: $admin->user_id,
            action: $action,
            entityType: 'platform_service_area',
            entityId: $id,
            oldValues: $oldValues,
            newValues: array_diff_key($updates, ['updated_by' => true, 'updated_at' => true]),
            reason: $data['reason'] ?? null,
            request: $request,
        );

        return $this->findById($id);
    }

    /**
     * Operational location monitoring overview for Admin Dashboard / Monitoring.
     * Respects privacy: only includes rider live locations when rider has an active delivery.
     *
     * @return array<string, mixed>
     */
    public function getLocationsOverview(): array
    {
        $restaurants = DB::table('restaurants as r')
            ->join('addresses as a', 'a.address_id', '=', 'r.address_id')
            ->join('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->join('cities as c', 'c.city_id', '=', 'b.city_id')
            ->join('provinces as p', 'p.province_id', '=', 'c.province_id')
            ->whereIn('r.restaurant_status', ['approved', 'active'])
            ->select([
                'r.restaurant_id',
                'r.restaurant_name',
                'r.restaurant_status',
                'a.street',
                'a.latitude',
                'a.longitude',
                'b.barangay_name',
                'c.city_name',
                'p.province_name',
            ])
            ->limit(200)
            ->get()
            ->map(static fn (object $r): array => [
                'restaurant_id' => (int) $r->restaurant_id,
                'restaurant_name' => $r->restaurant_name,
                'status' => $r->restaurant_status,
                'address' => trim(($r->street ? $r->street . ', ' : '') . "Brgy. {$r->barangay_name}, {$r->city_name}, {$r->province_name}"),
                'latitude' => $r->latitude !== null ? (float) $r->latitude : null,
                'longitude' => $r->longitude !== null ? (float) $r->longitude : null,
            ])
            ->all();

        // Only expose live rider locations for active deliveries
        $activeDeliveryRows = DB::table('deliveries as d')
            ->join('orders as o', 'o.order_id', '=', 'd.order_id')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->join('addresses as ra', 'ra.address_id', '=', 'r.address_id')
            ->leftJoin('riders as ri', 'ri.rider_id', '=', 'd.rider_id')
            ->leftJoin('users as ru', 'ru.user_id', '=', 'ri.user_id')
            ->whereIn('d.delivery_status', ['accepted', 'picked_up', 'in_transit'])
            ->select([
                'd.delivery_id',
                'd.order_id',
                'd.rider_id',
                'd.delivery_status',
                'o.order_reference',
                'o.delivery_address_text',
                'o.delivery_latitude',
                'o.delivery_longitude',
                'r.restaurant_name',
                'ra.latitude as pickup_latitude',
                'ra.longitude as pickup_longitude',
                'ru.first_name as rider_first_name',
                'ru.last_name as rider_last_name',
            ])
            ->limit(100)
            ->get();

        $activeRiderIds = $activeDeliveryRows
            ->pluck('rider_id')
            ->filter(static fn ($id): bool => $id !== null)
            ->map(static fn ($id): int => (int) $id)
            ->unique()
            ->values()
            ->all();

        $latestGpsByRider = [];
        if ($activeRiderIds !== []) {
            $gpsRows = DB::table('rider_locations')
                ->whereIn('rider_id', $activeRiderIds)
                ->orderByDesc('recorded_at')
                ->orderByDesc('rider_location_id')
                ->get();

            foreach ($gpsRows as $gpsRow) {
                $rId = (int) $gpsRow->rider_id;
                if (! array_key_exists($rId, $latestGpsByRider)) {
                    $latestGpsByRider[$rId] = $gpsRow;
                }
            }
        }

        $activeDeliveries = $activeDeliveryRows
            ->map(function (object $row) use ($latestGpsByRider): array {
                $latestGps = $row->rider_id !== null
                    ? ($latestGpsByRider[(int) $row->rider_id] ?? null)
                    : null;

                return [
                    'delivery_id' => (int) $row->delivery_id,
                    'order_id' => (int) $row->order_id,
                    'order_reference' => $row->order_reference,
                    'delivery_status' => $row->delivery_status,
                    'restaurant_name' => $row->restaurant_name,
                    'pickup_latitude' => $row->pickup_latitude !== null ? (float) $row->pickup_latitude : null,
                    'pickup_longitude' => $row->pickup_longitude !== null ? (float) $row->pickup_longitude : null,
                    'delivery_address' => $row->delivery_address_text,
                    'delivery_latitude' => $row->delivery_latitude !== null ? (float) $row->delivery_latitude : null,
                    'delivery_longitude' => $row->delivery_longitude !== null ? (float) $row->delivery_longitude : null,
                    'rider_name' => trim(($row->rider_first_name ?? '') . ' ' . ($row->rider_last_name ?? '')) ?: null,
                    'rider_location' => $latestGps ? [
                        'latitude' => (float) $latestGps->latitude,
                        'longitude' => (float) $latestGps->longitude,
                        'accuracy_meters' => $latestGps->accuracy_meters !== null ? (float) $latestGps->accuracy_meters : null,
                        'recorded_at' => $latestGps->recorded_at,
                    ] : null,
                ];
            })
            ->all();

        return [
            'service_areas' => $this->list(),
            'restaurants' => $restaurants,
            'active_deliveries' => $activeDeliveries,
        ];
    }

    private function findById(int $id): array
    {
        $row = DB::table('platform_service_areas as psa')
            ->join('provinces as p', 'p.province_id', '=', 'psa.province_id')
            ->leftJoin('cities as c', 'c.city_id', '=', 'psa.city_id')
            ->leftJoin('barangays as b', 'b.barangay_id', '=', 'psa.barangay_id')
            ->where('psa.platform_service_area_id', $id)
            ->select([
                'psa.platform_service_area_id',
                'psa.province_id',
                'psa.city_id',
                'psa.barangay_id',
                'psa.area_level',
                'psa.is_active',
                'psa.center_latitude',
                'psa.center_longitude',
                'psa.boundary_geojson',
                'psa.notes',
                'psa.created_at',
                'psa.updated_at',
                'p.province_name',
                'c.city_name',
                'b.barangay_name',
            ])
            ->first();

        if (! $row) {
            abort(404, 'Service area not found.');
        }

        return $this->formatRow($row);
    }

    /**
     * @param  \Illuminate\Support\Collection<int, object>  $platformRows
     * @return array<int, int>
     */
    private function computeRestaurantCountsForPlatformAreas($platformRows): array
    {
        $provinceIds = $platformRows
            ->pluck('province_id')
            ->map(static fn ($id): int => (int) $id)
            ->unique()
            ->values()
            ->all();

        if ($provinceIds === []) {
            return [];
        }

        $serviceAreas = DB::table('service_areas as sa')
            ->join('cities as c', 'c.city_id', '=', 'sa.city_id')
            ->whereIn('c.province_id', $provinceIds)
            ->select([
                'sa.restaurant_id',
                'sa.city_id',
                'sa.barangay_id',
                'c.province_id',
            ])
            ->get();

        $counts = [];
        foreach ($platformRows as $pRow) {
            $pId = (int) $pRow->platform_service_area_id;
            $provId = (int) $pRow->province_id;
            $cityId = $pRow->city_id !== null ? (int) $pRow->city_id : null;
            $brgyId = $pRow->barangay_id !== null ? (int) $pRow->barangay_id : null;

            $distinctRestaurants = [];
            foreach ($serviceAreas as $sa) {
                if ((int) $sa->province_id !== $provId) {
                    continue;
                }
                if ($cityId !== null && (int) $sa->city_id !== $cityId) {
                    continue;
                }
                if ($brgyId !== null && $sa->barangay_id !== null && (int) $sa->barangay_id !== $brgyId) {
                    continue;
                }
                $distinctRestaurants[(int) $sa->restaurant_id] = true;
            }
            $counts[$pId] = count($distinctRestaurants);
        }

        return $counts;
    }

    private function formatRow(object $row, ?int $precomputedRestaurantCount = null): array
    {
        $restaurantCount = $precomputedRestaurantCount ?? DB::table('service_areas as sa')
            ->join('cities as c', 'c.city_id', '=', 'sa.city_id')
            ->where('c.province_id', $row->province_id)
            ->when($row->city_id !== null, fn ($q) => $q->where('sa.city_id', $row->city_id))
            ->when($row->barangay_id !== null, fn ($q) => $q->where(fn ($sub) => $sub->where('sa.barangay_id', $row->barangay_id)->orWhereNull('sa.barangay_id')))
            ->distinct('sa.restaurant_id')
            ->count('sa.restaurant_id');

        return [
            'id' => (int) $row->platform_service_area_id,
            'country' => 'Philippines',
            'province_id' => (int) $row->province_id,
            'city_id' => $row->city_id !== null ? (int) $row->city_id : null,
            'barangay_id' => $row->barangay_id !== null ? (int) $row->barangay_id : null,
            'province' => $row->province_name,
            'city' => $row->city_name,
            'barangay' => $row->barangay_name,
            'area_level' => $row->area_level,
            'is_active' => (bool) $row->is_active,
            'status' => $row->is_active ? 'Active' : 'Inactive',
            'center_latitude' => $row->center_latitude !== null ? (float) $row->center_latitude : null,
            'center_longitude' => $row->center_longitude !== null ? (float) $row->center_longitude : null,
            'boundary_geojson' => $row->boundary_geojson,
            'notes' => $row->notes ?? '',
            'restaurant_count' => $restaurantCount,
            'created_at' => $row->created_at,
            'updated_at' => $row->updated_at,
        ];
    }
}
