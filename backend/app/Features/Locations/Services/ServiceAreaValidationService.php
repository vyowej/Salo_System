<?php

namespace App\Features\Locations\Services;

use Illuminate\Support\Facades\DB;

class ServiceAreaValidationService
{
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
            return [
                'supported' => false,
                'platform_supported' => false,
                'matched_level' => null,
                'matched_area_id' => null,
                'reason' => 'Province and city/municipality are required to check service area coverage.',
            ];
        }

        if ($preloadedActiveAreas !== null) {
            $activeAreas = [];
            foreach ($preloadedActiveAreas as $candidate) {
                if (mb_strtolower((string) ($candidate->province_name ?? '')) === $cleanProvince) {
                    $activeAreas[] = $candidate;
                }
            }
        } else {
            $activeAreas = DB::table('platform_service_areas as psa')
                ->join('provinces as p', 'p.province_id', '=', 'psa.province_id')
                ->leftJoin('cities as c', 'c.city_id', '=', 'psa.city_id')
                ->leftJoin('barangays as b', 'b.barangay_id', '=', 'psa.barangay_id')
                ->where('psa.is_active', 1)
                ->where('p.province_name', $cleanProvince)
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

        // 1. Exact barangay match
        if ($cleanBarangay !== '') {
            foreach ($activeAreas as $area) {
                if (
                    $area->barangay_id !== null
                    && mb_strtolower((string) $area->city_name) === $cleanCity
                    && mb_strtolower((string) $area->barangay_name) === $cleanBarangay
                ) {
                    return [
                        'supported' => true,
                        'platform_supported' => true,
                        'matched_level' => 'barangay',
                        'matched_area_id' => (int) $area->platform_service_area_id,
                        'reason' => "Brgy. {$area->barangay_name}, {$area->city_name} is an active SALO service area.",
                    ];
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
                return [
                    'supported' => true,
                    'platform_supported' => true,
                    'matched_level' => 'city',
                    'matched_area_id' => (int) $area->platform_service_area_id,
                    'reason' => "{$area->city_name} is an active SALO service area.",
                ];
            }
        }

        // 3. Active province-wide match (city_id IS NULL AND barangay_id IS NULL)
        foreach ($activeAreas as $area) {
            if ($area->city_id === null && $area->barangay_id === null) {
                return [
                    'supported' => true,
                    'platform_supported' => true,
                    'matched_level' => 'province',
                    'matched_area_id' => (int) $area->platform_service_area_id,
                    'reason' => "{$province} is an active SALO service area.",
                ];
            }
        }

        $locationLabel = $barangay ? "Brgy. {$barangay}, {$city}, {$province}" : "{$city}, {$province}";

        return [
            'supported' => false,
            'platform_supported' => false,
            'matched_level' => null,
            'matched_area_id' => null,
            'reason' => "{$locationLabel} is currently outside SALO's active service areas.",
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
        $uniqueProvinces = array_values(array_unique(array_filter(array_map('trim', $provinceNames))));
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
            return [
                'supported' => false,
                'platform_supported' => false,
                'restaurant_supported' => false,
                'restaurant_configured' => false,
                'reason' => $platform['reason'],
            ];
        }

        $restaurant = DB::table('restaurants')->where('restaurant_id', $restaurantId)->first();
        if (! $restaurant) {
            return [
                'supported' => false,
                'platform_supported' => true,
                'restaurant_supported' => false,
                'restaurant_configured' => false,
                'reason' => 'Restaurant not found.',
            ];
        }

        if ((int) $restaurant->offers_delivery !== 1) {
            return [
                'supported' => false,
                'platform_supported' => true,
                'restaurant_supported' => false,
                'restaurant_configured' => true,
                'reason' => "{$restaurant->restaurant_name} does not currently offer delivery.",
            ];
        }

        $coverageRows = DB::table('service_areas as sa')
            ->join('cities as c', 'c.city_id', '=', 'sa.city_id')
            ->leftJoin('barangays as b', 'b.barangay_id', '=', 'sa.barangay_id')
            ->where('sa.restaurant_id', $restaurantId)
            ->select(['sa.city_id', 'sa.barangay_id', 'c.city_name', 'b.barangay_name'])
            ->get();

        if ($coverageRows->isEmpty()) {
            return [
                'supported' => true,
                'platform_supported' => true,
                'restaurant_supported' => true,
                'restaurant_configured' => false,
                'reason' => $platform['reason'],
            ];
        }

        $cleanCity = mb_strtolower(trim($city));
        $cleanBarangay = $barangay !== null ? mb_strtolower(trim($barangay)) : '';

        foreach ($coverageRows as $row) {
            if (mb_strtolower((string) $row->city_name) !== $cleanCity) {
                continue;
            }
            if ($row->barangay_id === null) {
                return [
                    'supported' => true,
                    'platform_supported' => true,
                    'restaurant_supported' => true,
                    'restaurant_configured' => true,
                    'reason' => "{$restaurant->restaurant_name} delivers to {$city}.",
                ];
            }
            if ($cleanBarangay !== '' && mb_strtolower((string) $row->barangay_name) === $cleanBarangay) {
                return [
                    'supported' => true,
                    'platform_supported' => true,
                    'restaurant_supported' => true,
                    'restaurant_configured' => true,
                    'reason' => "{$restaurant->restaurant_name} delivers to Brgy. {$row->barangay_name}, {$city}.",
                ];
            }
        }

        $areaText = $barangay ? "Brgy. {$barangay}, {$city}" : $city;

        return [
            'supported' => false,
            'platform_supported' => true,
            'restaurant_supported' => false,
            'restaurant_configured' => true,
            'reason' => "{$restaurant->restaurant_name} does not deliver to {$areaText}.",
        ];
    }
}
