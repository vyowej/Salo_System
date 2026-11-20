<?php

namespace App\Features\Locations\Services;

use App\Models\User;
use App\Support\AddressService;
use App\Support\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RestaurantLocationService
{
    public function __construct(
        private readonly AddressService $addressService,
        private readonly ServiceAreaValidationService $serviceAreaValidation,
        private readonly AdminServiceAreaService $adminServiceAreas,
        private readonly AuditLogService $auditLog,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function getLocationAndCoverage(User $user, ?int $restaurantId = null): array
    {
        $restaurant = $this->resolveAuthorizedRestaurant($user, $restaurantId);

        $address = DB::table('addresses as a')
            ->join('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->join('cities as c', 'c.city_id', '=', 'b.city_id')
            ->join('provinces as p', 'p.province_id', '=', 'c.province_id')
            ->where('a.address_id', $restaurant->address_id)
            ->select([
                'a.address_id',
                'a.street',
                'a.house_number',
                'a.building_name',
                'a.landmark',
                'a.postal_code',
                'a.latitude',
                'a.longitude',
                'a.gps_accuracy',
                'b.barangay_name',
                'c.city_name',
                'p.province_name',
            ])
            ->first();

        $coverageRows = DB::table('service_areas as sa')
            ->join('cities as c', 'c.city_id', '=', 'sa.city_id')
            ->join('provinces as p', 'p.province_id', '=', 'c.province_id')
            ->leftJoin('barangays as b', 'b.barangay_id', '=', 'sa.barangay_id')
            ->where('sa.restaurant_id', $restaurant->restaurant_id)
            ->orderBy('p.province_name')
            ->orderBy('c.city_name')
            ->orderBy('b.barangay_name')
            ->select([
                'sa.service_area_id',
                'sa.city_id',
                'sa.barangay_id',
                'p.province_name',
                'c.city_name',
                'b.barangay_name',
            ])
            ->get();

        $activeAreas = $this->serviceAreaValidation->loadActiveAreasForProvinces(
            $coverageRows->pluck('province_name')->map(static fn ($name): string => (string) $name)->all()
        );

        $coverage = $coverageRows
            ->map(function (object $row) use ($activeAreas): array {
                $platform = $this->serviceAreaValidation->checkPlatformSupport(
                    (string) $row->province_name,
                    (string) $row->city_name,
                    $row->barangay_name !== null ? (string) $row->barangay_name : null,
                    $activeAreas,
                );

                return [
                    'id' => (int) $row->service_area_id,
                    'province' => $row->province_name,
                    'city' => $row->city_name,
                    'barangay' => $row->barangay_name,
                    'platform_active' => $platform['platform_supported'],
                ];
            })
            ->all();

        return [
            'restaurant_id' => (int) $restaurant->restaurant_id,
            'restaurant_name' => $restaurant->restaurant_name,
            'restaurant_status' => $restaurant->restaurant_status,
            'location' => $address ? [
                'country' => 'Philippines',
                'province' => $address->province_name,
                'city' => $address->city_name,
                'barangay' => $address->barangay_name,
                'street' => $address->street ?? '',
                'house_number' => $address->house_number ?? '',
                'building_name' => $address->building_name ?? '',
                'landmark' => $address->landmark ?? '',
                'postal_code' => $address->postal_code ?? '',
                'latitude' => $address->latitude !== null ? (float) $address->latitude : null,
                'longitude' => $address->longitude !== null ? (float) $address->longitude : null,
                'gps_accuracy' => $address->gps_accuracy !== null ? (float) $address->gps_accuracy : null,
            ] : null,
            'coverage' => $coverage,
            'available_platform_areas' => $this->adminServiceAreas->list(activeOnly: true),
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function updateLocation(User $user, ?int $restaurantId, array $data, ?Request $request = null): array
    {
        $restaurant = $this->resolveAuthorizedRestaurant($user, $restaurantId);

        DB::transaction(function () use ($user, $restaurant, $data, $request): void {
            $this->addressService->updateAddress((int) $restaurant->address_id, [
                'province' => $data['province'],
                'city' => $data['city'],
                'barangay' => $data['barangay'],
                'street' => $data['street'] ?? null,
                'house_number' => $data['house_number'] ?? null,
                'building_name' => $data['building_name'] ?? null,
                'landmark' => $data['landmark'] ?? null,
                'postal_code' => $data['postal_code'] ?? null,
                'latitude' => $data['latitude'] ?? null,
                'longitude' => $data['longitude'] ?? null,
                'gps_accuracy' => $data['gps_accuracy'] ?? null,
            ]);

            $this->auditLog->record(
                actorUserId: $user->user_id,
                action: 'restaurant.location_updated',
                entityType: 'restaurant',
                entityId: $restaurant->restaurant_id,
                oldValues: null,
                newValues: [
                    'province' => $data['province'],
                    'city' => $data['city'],
                    'barangay' => $data['barangay'],
                    'latitude' => $data['latitude'] ?? null,
                    'longitude' => $data['longitude'] ?? null,
                ],
                reason: 'Updated restaurant physical location',
                request: $request,
            );
        });

        return $this->getLocationAndCoverage($user, (int) $restaurant->restaurant_id);
    }

    /**
     * @param  list<array{province: string, city: string, barangay?: string|null}>  $areas
     * @return array<string, mixed>
     */
    public function updateCoverage(User $user, ?int $restaurantId, array $areas, ?Request $request = null): array
    {
        $restaurant = $this->resolveAuthorizedRestaurant($user, $restaurantId);

        // Validate every selected coverage area against Admin-activated platform service areas
        $resolvedEntries = [];
        $seenKeys = [];

        foreach ($areas as $index => $area) {
            $province = trim((string) ($area['province'] ?? ''));
            $city = trim((string) ($area['city'] ?? ''));
            $barangay = isset($area['barangay']) && trim((string) $area['barangay']) !== ''
                ? trim((string) $area['barangay'])
                : null;

            $support = $this->serviceAreaValidation->checkPlatformSupport($province, $city, $barangay);
            if (! $support['platform_supported']) {
                throw ValidationException::withMessages([
                    "areas.{$index}" => [$support['reason']],
                ]);
            }

            $ids = $this->addressService->resolveHierarchyIds($province, $city, $barangay);
            $dedupeKey = "{$ids['city_id']}-" . ($ids['barangay_id'] ?? 0);
            if (isset($seenKeys[$dedupeKey])) {
                continue;
            }
            $seenKeys[$dedupeKey] = true;

            $resolvedEntries[] = [
                'restaurant_id' => $restaurant->restaurant_id,
                'city_id' => $ids['city_id'],
                'barangay_id' => $ids['barangay_id'],
                'created_at' => now(),
            ];
        }

        DB::transaction(function () use ($user, $restaurant, $resolvedEntries, $areas, $request): void {
            DB::table('service_areas')->where('restaurant_id', $restaurant->restaurant_id)->delete();
            if ($resolvedEntries !== []) {
                DB::table('service_areas')->insert($resolvedEntries);
            }

            $this->auditLog->record(
                actorUserId: $user->user_id,
                action: 'restaurant.coverage_updated',
                entityType: 'restaurant',
                entityId: $restaurant->restaurant_id,
                oldValues: null,
                newValues: ['areas_count' => count($resolvedEntries), 'areas' => $areas],
                reason: 'Updated restaurant delivery coverage',
                request: $request,
            );
        });

        return $this->getLocationAndCoverage($user, (int) $restaurant->restaurant_id);
    }

    private function resolveAuthorizedRestaurant(User $user, ?int $restaurantId): object
    {
        $query = DB::table('restaurants as r')
            ->join('restaurant_owners as ro', 'ro.restaurant_id', '=', 'r.restaurant_id')
            ->where('ro.user_id', $user->user_id)
            ->select('r.*');

        if ($restaurantId !== null) {
            $query->where('r.restaurant_id', $restaurantId);
        }

        $restaurant = $query->first();
        if (! $restaurant) {
            abort(403, 'You are not authorized to manage this restaurant.');
        }

        return $restaurant;
    }
}
