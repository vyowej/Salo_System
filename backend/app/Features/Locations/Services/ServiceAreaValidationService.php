<?php

namespace App\Features\Locations\Services;

use App\Support\PublicRestaurantVisibility;
use Illuminate\Support\Facades\DB;

class ServiceAreaValidationService
{
    public function __construct(
        private readonly PublicRestaurantVisibility $visibility,
    ) {}
    /**
     * Validate whether a Philippine administrative location is covered by an active SALO platform service area.
     *
     * @return array{
     *   supported: bool,
     *   platform_supported: bool,
     *   matched_level: string|null,
     *   matched_area_id: int|null,
     *   reason: string
     * }
     */
    public function checkPlatformSupport(string $province, string $city, ?string $barangay = null, ?iterable $preloadedActiveAreas = null): array
    {
        $cleanProvince = mb_strtolower(trim($province));
        $cleanCity = mb_strtolower(trim($city));
        $cleanBarangay = $barangay !== null ? mb_strtolower(trim($barangay)) : '';

        if ($cleanProvince === '' || $cleanCity === '') {
            return $this->platformResult(
                supported: false,
                matchedLevel: null,
                matchedAreaId: null,
                reason: 'Province and city/municipality are required to check service area coverage.',
            );
        }

        $activeAreas = $this->loadMatchingActiveAreas($cleanProvince, $preloadedActiveAreas);
        $matched = $this->matchActivePlatformArea($activeAreas, $cleanCity, $cleanBarangay, $province);
        if ($matched !== null) {
            return $matched;
        }

        $locationLabel = $barangay ? "Brgy. {$barangay}, {$city}, {$province}" : "{$city}, {$province}";

        return $this->platformResult(
            supported: false,
            matchedLevel: null,
            matchedAreaId: null,
            reason: "{$locationLabel} is currently outside SALO's active service areas.",
        );
    }

    /**
     * Map OpenStreetMap/Nominatim region names for Philippine Highly Urbanized Cities
     * to their PSGC province names so city/barangay service areas match reliably.
     *
     * @return list<string>
     */
    private function resolveEquivalentProvinces(string $cleanProvince): array
    {
        $aliases = [
            'zamboanga peninsula' => ['zamboanga del sur'],
            'region ix' => ['zamboanga del sur'],
            'davao region' => ['davao del sur'],
            'region xi' => ['davao del sur'],
            'central visayas' => ['cebu'],
            'region vii' => ['cebu'],
            'western visayas' => ['iloilo'],
            'region vi' => ['iloilo'],
            'northern mindanao' => ['misamis oriental'],
            'region x' => ['misamis oriental'],
            'cordillera administrative region' => ['benguet'],
            'national capital region' => ['metro manila'],
            'ncr' => ['metro manila'],
        ];

        $result = [$cleanProvince];
        foreach ($aliases[$cleanProvince] ?? [] as $mapped) {
            if (! in_array($mapped, $result, true)) {
                $result[] = $mapped;
            }
        }

        return $result;
    }

    /**
     * @param  iterable<int, object>|null  $preloadedActiveAreas
     * @return iterable<int, object>
     */
    private function loadMatchingActiveAreas(string $cleanProvince, ?iterable $preloadedActiveAreas): iterable
    {
        $equivalentProvinces = $this->resolveEquivalentProvinces($cleanProvince);

        if ($preloadedActiveAreas !== null) {
            $filtered = [];
            foreach ($preloadedActiveAreas as $candidate) {
                if (in_array(mb_strtolower((string) ($candidate->province_name ?? '')), $equivalentProvinces, true)) {
                    $filtered[] = $candidate;
                }
            }

            return $filtered;
        }

        return DB::table('platform_service_areas as psa')
            ->join('provinces as p', 'p.province_id', '=', 'psa.province_id')
            ->leftJoin('cities as c', 'c.city_id', '=', 'psa.city_id')
            ->leftJoin('barangays as b', 'b.barangay_id', '=', 'psa.barangay_id')
            ->where('psa.is_active', 1)
            ->whereIn('p.province_name', $equivalentProvinces)
            ->select([
                'psa.platform_service_area_id',
                'psa.area_level',
                'psa.city_id',
                'psa.barangay_id',
                'p.province_name',
                'c.city_name',
                'b.barangay_name',
            ])
            ->get();
    }

    /**
     * @param  iterable<int, object>  $activeAreas
     * @return array<string, mixed>|null
     */
    private function matchActivePlatformArea(iterable $activeAreas, string $cleanCity, string $cleanBarangay, string $province): ?array
    {
        // 1. Exact barangay match
        if ($cleanBarangay !== '') {
            foreach ($activeAreas as $area) {
                if (
                    $area->barangay_id !== null
                    && mb_strtolower((string) $area->city_name) === $cleanCity
                    && mb_strtolower((string) $area->barangay_name) === $cleanBarangay
                ) {
                    return $this->platformResult(
                        supported: true,
                        matchedLevel: 'barangay',
                        matchedAreaId: (int) $area->platform_service_area_id,
                        reason: "Brgy. {$area->barangay_name}, {$area->city_name} is an active SALO service area.",
                    );
                }
            }
        }

        // 2. Active city-wide match (barangay_id IS NULL)
        foreach ($activeAreas as $area) {
            if (
                $area->city_id !== null
                && $area->barangay_id === null
                && mb_strtolower((string) $area->city_name) === $cleanCity
            ) {
                return $this->platformResult(
                    supported: true,
                    matchedLevel: 'city',
                    matchedAreaId: (int) $area->platform_service_area_id,
                    reason: "{$area->city_name} is an active SALO service area.",
                );
            }
        }

        // 3. Active province-wide match (city_id IS NULL AND barangay_id IS NULL)
        foreach ($activeAreas as $area) {
            if ($area->city_id === null && $area->barangay_id === null) {
                return $this->platformResult(
                    supported: true,
                    matchedLevel: 'province',
                    matchedAreaId: (int) $area->platform_service_area_id,
                    reason: "{$province} is an active SALO service area.",
                );
            }
        }

        return null;
    }

    /**
     * @return array{
     *   supported: bool,
     *   platform_supported: bool,
     *   matched_level: string|null,
     *   matched_area_id: int|null,
     *   reason: string
     * }
     */
    private function platformResult(bool $supported, ?string $matchedLevel, ?int $matchedAreaId, string $reason): array
    {
        return [
            'supported' => $supported,
            'platform_supported' => $supported,
            'matched_level' => $matchedLevel,
            'matched_area_id' => $matchedAreaId,
            'reason' => $reason,
        ];
    }

    /**
     * Load active platform service areas for a batch of province names in a single query.
     *
     * @param  list<string>  $provinceNames
     * @return \Illuminate\Support\Collection<int, object>
     */
    public function loadActiveAreasForProvinces(array $provinceNames)
    {
        $expanded = [];
        foreach ($provinceNames as $name) {
            $clean = mb_strtolower(trim((string) $name));
            if ($clean === '') {
                continue;
            }
            foreach ($this->resolveEquivalentProvinces($clean) as $eq) {
                $expanded[] = $eq;
            }
        }
        $uniqueProvinces = array_values(array_unique($expanded));
        if ($uniqueProvinces === []) {
            return collect();
        }

        return DB::table('platform_service_areas as psa')
            ->join('provinces as p', 'p.province_id', '=', 'psa.province_id')
            ->leftJoin('cities as c', 'c.city_id', '=', 'psa.city_id')
            ->leftJoin('barangays as b', 'b.barangay_id', '=', 'psa.barangay_id')
            ->where('psa.is_active', 1)
            ->whereIn('p.province_name', $uniqueProvinces)
            ->select([
                'psa.platform_service_area_id',
                'psa.area_level',
                'psa.city_id',
                'psa.barangay_id',
                'p.province_name',
                'c.city_name',
                'b.barangay_name',
            ])
            ->get();
    }

    /**
     * Validate both platform service area support AND restaurant-specific delivery coverage.
     *
     * @return array{
     *   supported: bool,
     *   platform_supported: bool,
     *   restaurant_supported: bool,
     *   restaurant_configured: bool,
     *   reason: string
     * }
     */
    public function checkRestaurantSupport(int $restaurantId, string $province, string $city, ?string $barangay = null): array
    {
        $platform = $this->checkPlatformSupport($province, $city, $barangay);
        if (! $platform['platform_supported']) {
            return $this->restaurantResult(false, false, false, false, $platform['reason']);
        }

        $restaurant = $this->visibility->applyVisibleRestaurantScope(
            DB::table('restaurants as r')->where('r.restaurant_id', $restaurantId),
            'r',
        )->first(['r.restaurant_id', 'r.restaurant_name', 'r.offers_delivery']);
        if (! $restaurant) {
            return $this->restaurantResult(false, true, false, false, 'Restaurant not found.');
        }

        if ((int) $restaurant->offers_delivery !== 1) {
            return $this->restaurantResult(
                false,
                true,
                false,
                true,
                "{$restaurant->restaurant_name} does not currently offer delivery.",
            );
        }

        $coverageRows = DB::table('service_areas as sa')
            ->join('cities as c', 'c.city_id', '=', 'sa.city_id')
            ->leftJoin('barangays as b', 'b.barangay_id', '=', 'sa.barangay_id')
            ->where('sa.restaurant_id', $restaurantId)
            ->select(['sa.city_id', 'sa.barangay_id', 'c.city_name', 'b.barangay_name'])
            ->get();

        if ($coverageRows->isEmpty()) {
            return $this->restaurantResult(true, true, true, false, $platform['reason']);
        }

        return $this->matchRestaurantCoverage($restaurant, $coverageRows, $city, $barangay);
    }

    /**
     * @param  iterable<int, object>  $coverageRows
     * @return array{
     *   supported: bool,
     *   platform_supported: bool,
     *   restaurant_supported: bool,
     *   restaurant_configured: bool,
     *   reason: string
     * }
     */
    private function matchRestaurantCoverage(object $restaurant, iterable $coverageRows, string $city, ?string $barangay): array
    {
        $cleanCity = mb_strtolower(trim($city));
        $cleanBarangay = $barangay !== null ? mb_strtolower(trim($barangay)) : '';

        foreach ($coverageRows as $row) {
            if (mb_strtolower((string) $row->city_name) !== $cleanCity) {
                continue;
            }
            if ($row->barangay_id === null) {
                return $this->restaurantResult(
                    true,
                    true,
                    true,
                    true,
                    "{$restaurant->restaurant_name} delivers to {$city}.",
                );
            }
            if ($cleanBarangay !== '' && mb_strtolower((string) $row->barangay_name) === $cleanBarangay) {
                return $this->restaurantResult(
                    true,
                    true,
                    true,
                    true,
                    "{$restaurant->restaurant_name} delivers to Brgy. {$row->barangay_name}, {$city}.",
                );
            }
        }

        $areaText = $barangay ? "Brgy. {$barangay}, {$city}" : $city;

        return $this->restaurantResult(
            false,
            true,
            false,
            true,
            "{$restaurant->restaurant_name} does not deliver to {$areaText}.",
        );
    }

    /**
     * @return array{
     *   supported: bool,
     *   platform_supported: bool,
     *   restaurant_supported: bool,
     *   restaurant_configured: bool,
     *   reason: string
     * }
     */
    private function restaurantResult(
        bool $supported,
        bool $platformSupported,
        bool $restaurantSupported,
        bool $restaurantConfigured,
        string $reason,
    ): array {
        return [
            'supported' => $supported,
            'platform_supported' => $platformSupported,
            'restaurant_supported' => $restaurantSupported,
            'restaurant_configured' => $restaurantConfigured,
            'reason' => $reason,
        ];
    }
}
