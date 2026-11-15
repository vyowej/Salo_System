<?php

namespace App\Features\Locations\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class PsgcLocationService
{
    private const CACHE_TTL_SECONDS = 86400; // 24 hours

    public function __construct(
        private readonly bool $skipExternalInTesting = true,
    ) {}

    /**
     * Built-in fallback Philippine administrative hierarchy for offline / test resilience.
     * Keys: province_name => [city_name => [barangay_name, ...]]
     *
     * @var array<string, array<string, list<string>>>
     */
    private const FALLBACK_HIERARCHY = [
        'Metro Manila' => [
            'Quezon City' => ['Bagumbayan', 'Commonwealth', 'Diliman', 'Kamuning', 'Katipunan', 'Loyola Heights', 'Project 4', 'South Triangle', 'Tandang Sora', 'UP Campus'],
            'Makati City' => ['Bel-Air', 'Forbes Park', 'Guadalupe Nuevo', 'Legazpi Village', 'Poblacion', 'Salcedo Village', 'San Lorenzo', 'Urdaneta'],
            'Taguig City' => ['Bagumbayan', 'Bambang', 'Fort Bonifacio', 'Lower Bicutan', 'Pinagsama', 'Upper Bicutan', 'Ususan', 'Western Bicutan'],
            'Pasig City' => ['Bagong Ilog', 'Kapitolyo', 'Manggahan', 'Oranbo', 'Rosario', 'San Antonio', 'Santolan', 'Ugong'],
            'Manila' => ['Binondo', 'Ermita', 'Intramuros', 'Malate', 'Paco', 'Quiapo', 'Sampaloc', 'San Miguel', 'Santa Cruz', 'Tondo'],
            'Mandaluyong City' => ['Addition Hills', 'Barangka Drive', 'Highway Hills', 'Plainview', 'Wack-Wack Greenhills'],
            'Muntinlupa City' => ['Alabang', 'Ayala Alabang', 'Bayanan', 'Cupang', 'Poblacion', 'Putatan', 'Sucat'],
            'Parañaque City' => ['Baclaran', 'BF Homes', 'Don Bosco', 'Moonwalk', 'San Antonio', 'Sucat', 'Tambo'],
            'Pasay City' => ['Baclaran', 'Malibay', 'San Isidro', 'San Rafael', 'Villamor'],
            'San Juan City' => ['Addition Hills', 'Greenhills', 'Kabayanan', 'Little Baguio', 'Salapan'],
            'Marikina City' => ['Barangka', 'Concepcion Uno', 'Fortune', 'Marikina Heights', 'San Roque', 'Sto. Niño'],
            'Caloocan City' => ['Bagong Silang', 'Grace Park East', 'Grace Park West', 'Maypajo', 'Sangandaan'],
            'Las Piñas City' => ['Almanza Uno', 'BF International Village', 'Pamplona Tres', 'Pilar', 'Talon Uno'],
            'Valenzuela City' => ['Dalandanan', 'Gen. T. de Leon', 'Karuhatan', 'Malinta', 'Marulas'],
        ],
        'Misamis Oriental' => [
            'Cagayan de Oro City' => ['Balulang', 'Bugo', 'Bulua', 'Camaman-an', 'Carmen', 'Gusa', 'Iponan', 'Kauswagan', 'Lapasan', 'Macasandig', 'Nazareth', 'Patag', 'Puerto'],
            'El Salvador City' => ['Amor', 'Bolobolo', 'Cogon', 'Molugan', 'Poblacion', 'Sinaloc', 'Taytay'],
            'Gingoog City' => ['Agay-ayan', 'Anakan', 'Lunao', 'Odiongan', 'Poblacion', 'San Juan'],
            'Opol' => ['Awang', 'Barra', 'Bonbon', 'Igpit', 'Luyong Bonbon', 'Poblacion', 'Taboc'],
            'Tagoloan' => ['Baluarte', 'Casinglot', 'Gracia', 'Mohon', 'Natumolan', 'Poblacion', 'Santa Ana'],
            'Villanueva' => ['Balacanas', 'Dayawan', 'Katipunan', 'Looc', 'Poblacion', 'San Martin'],
        ],
        'Zamboanga del Sur' => [
            'Zamboanga City' => ['Ayala', 'Baliwasan', 'Boalan', 'Camino Nuevo', 'Canelar', 'Divisoria', 'Guiwan', 'Mercedes', 'Pasonanca', 'Putik', 'San Jose Gusu', 'San Roque', 'Santa Maria', 'Tetuan', 'Tumaga'],
            'Pagadian City' => ['Balangasan', 'Buenavista', 'Dao', 'Gatas', 'Kawit', 'San Jose', 'San Pedro', 'Santiago', 'Tuburan'],
        ],
        'Cebu' => [
            'Cebu City' => ['Apas', 'Banilad', 'Capitol Site', 'Guadalupe', 'Kamputhaw', 'Kasambagan', 'Lahug', 'Mabolo', 'Nasipit', 'Pardo', 'Talamban'],
            'Mandaue City' => ['Alang-Alang', 'Banilad', 'Cabancalan', 'Centro', 'Guizo', 'Subangdaku', 'Tipolo'],
            'Lapu-Lapu City' => ['Agus', 'Basak', 'Gun-ob', 'Mactan', 'Maribago', 'Pajo', 'Poblacion', 'Pusok'],
            'Talisay City' => ['Biasong', 'Bulacao', 'Dumlog', 'Lawaan I', 'Linao', 'Poblacion', 'Tabunok'],
        ],
        'Davao del Sur' => [
            'Davao City' => ['Agdao', 'Bajada', 'Barangay 40-D', 'Buhangin', 'Catalunan Grande', 'Ecoland', 'Lanang', 'Ma-a', 'Matina Crossing', 'Poblacion', 'Talomo', 'Toril'],
            'Digos City' => ['Aplaya', 'Colorado', 'Dulangan', 'San Jose', 'Tres de Mayo', 'Zone 1', 'Zone 2', 'Zone 3'],
        ],
        'Cavite' => [
            'Bacoor City' => ['Alima', 'Aniban I', 'Habay I', 'Mambog I', 'Molino I', 'Molino III', 'Niog I', 'Talaba I'],
            'Dasmariñas City' => ['Burol', 'Langkaan I', 'Paliparan I', 'Salawag', 'Salitran I', 'Sampaloc I', 'Zone I'],
            'Imus City' => ['Alapan I-A', 'Anabu I-A', 'Bayan Luma I', 'Bucandala I', 'Malagasang I-A', 'Tanzang Luma I'],
            'Tagaytay City' => ['Asisan', 'Kaybagal South', 'Maharlika East', 'Maitim 2nd East', 'Mendez Crossing East', 'San Jose', 'Silang Junction North'],
        ],
        'Laguna' => [
            'Calamba City' => ['Bagong Kalsada', 'Bucal', 'Canlubang', 'Halang', 'Pansol', 'Parian', 'Real'],
            'Santa Rosa City' => ['Balibago', 'Dita', 'Don Jose', 'Ibaba', 'Macabling', 'Market Area', 'Tagapo'],
            'Biñan City' => ['Canlalay', 'Dela Paz', 'Malaban', 'Platero', 'Poblacion', 'San Antonio', 'Sto. Domingo'],
        ],
        'Bulacan' => [
            'Malolos City' => ['Anilao', 'Atlag', 'Babatnin', 'Bagna', 'Catmon', 'Guinhawa', 'Mojon', 'Sumapang Matanda'],
            'Meycauayan City' => ['Bancal', 'Banga', 'Calvario', 'Camalig', 'Iba', 'Malhacan', 'Pandayan', 'Saluysoy'],
            'San Jose del Monte City' => ['Assumption', 'Bagong Buhay', 'Francisco Homes', 'Gaya-Gaya', 'Muzon', 'Tungkong Mangga'],
        ],
        'Rizal' => [
            'Antipolo City' => ['Bagong Nayon', 'Beverly Hills', 'Cupang', 'Dalig', 'Dela Paz', 'Mambugan', 'Mayamot', 'San Roque'],
            'Cainta' => ['San Andres', 'San Isidro', 'San Juan', 'San Roque', 'Santa Rosa', 'Santo Domingo', 'Santo Niño'],
            'Taytay' => ['Dolores', 'Muzon', 'San Isidro', 'San Juan', 'Santa Ana'],
        ],
        'Pampanga' => [
            'Angeles City' => ['Anunas', 'Balibago', 'Cutcut', 'Lourdes North West', 'Malabanias', 'Pampang', 'Pulung Maragul', 'Santo Rosario'],
            'San Fernando City' => ['Baliti', 'Del Pilar', 'Dolores', 'San Agustin', 'San Jose', 'Sindalan', 'Telabastagan'],
        ],
        'Iloilo' => [
            'Iloilo City' => ['Arevalo', 'City Proper', 'Jaro', 'La Paz', 'Lapuz', 'Mandurriao', 'Molo'],
        ],
        'Benguet' => [
            'Baguio City' => ['Burnham-Legarda', 'Camp 7', 'City Camp Central', 'Irisan', 'Loakan Proper', 'Mines View Park', 'Pacdal', 'Session Road Area'],
        ],
    ];

    /**
     * Search Philippine provinces.
     *
     * @return list<array{code: string|null, name: string, source: string}>
     */
    public function searchProvinces(string $query = '', int $limit = 30): array
    {
        $all = $this->getAllProvinces();
        $term = mb_strtolower(trim($query));

        $filtered = array_values(array_filter($all, static function (array $item) use ($term): bool {
            return $term === '' || str_contains(mb_strtolower($item['name']), $term);
        }));

        usort($filtered, static function (array $a, array $b) use ($term): int {
            if ($term !== '') {
                $aStarts = str_starts_with(mb_strtolower($a['name']), $term) ? 0 : 1;
                $bStarts = str_starts_with(mb_strtolower($b['name']), $term) ? 0 : 1;
                if ($aStarts !== $bStarts) {
                    return $aStarts <=> $bStarts;
                }
            }

            return strcmp($a['name'], $b['name']);
        });

        return array_slice($filtered, 0, max(1, $limit));
    }

    /**
     * Search Philippine cities / municipalities within a province.
     *
     * @return list<array{code: string|null, name: string, province: string, source: string}>
     */
    public function searchCities(string $provinceName, string $query = '', int $limit = 40): array
    {
        $cleanProvince = trim($provinceName);
        if ($cleanProvince === '') {
            return [];
        }

        $all = $this->getCitiesForProvince($cleanProvince);
        $term = mb_strtolower(trim($query));

        $filtered = array_values(array_filter($all, static function (array $item) use ($term): bool {
            return $term === '' || str_contains(mb_strtolower($item['name']), $term);
        }));

        usort($filtered, static function (array $a, array $b) use ($term): int {
            if ($term !== '') {
                $aStarts = str_starts_with(mb_strtolower($a['name']), $term) ? 0 : 1;
                $bStarts = str_starts_with(mb_strtolower($b['name']), $term) ? 0 : 1;
                if ($aStarts !== $bStarts) {
                    return $aStarts <=> $bStarts;
                }
            }

            return strcmp($a['name'], $b['name']);
        });

        return array_slice($filtered, 0, max(1, $limit));
    }

    /**
     * Search Philippine barangays within a city/municipality (and optional province).
     *
     * @return list<array{code: string|null, name: string, city: string, province: string, source: string}>
     */
    public function searchBarangays(string $cityName, ?string $provinceName = null, string $query = '', int $limit = 50): array
    {
        $cleanCity = trim($cityName);
        if ($cleanCity === '') {
            return [];
        }

        $all = $this->getBarangaysForCity($cleanCity, $provinceName ? trim($provinceName) : null);
        $term = mb_strtolower(trim($query));

        $filtered = array_values(array_filter($all, static function (array $item) use ($term): bool {
            return $term === '' || str_contains(mb_strtolower($item['name']), $term);
        }));

        usort($filtered, static function (array $a, array $b) use ($term): int {
            if ($term !== '') {
                $aStarts = str_starts_with(mb_strtolower($a['name']), $term) ? 0 : 1;
                $bStarts = str_starts_with(mb_strtolower($b['name']), $term) ? 0 : 1;
                if ($aStarts !== $bStarts) {
                    return $aStarts <=> $bStarts;
                }
            }

            return strcmp($a['name'], $b['name']);
        });

        return array_slice($filtered, 0, max(1, $limit));
    }

    /**
     * @return list<array{code: string|null, name: string, source: string}>
     */
    private function getAllProvinces(): array
    {
        $byName = [];

        foreach (array_keys(self::FALLBACK_HIERARCHY) as $name) {
            $byName[mb_strtolower($name)] = [
                'code' => $name === 'Metro Manila' ? 'NCR' : null,
                'name' => $name,
                'source' => 'fallback',
            ];
        }

        // Merge PSGC API provinces (cached)
        $psgcProvinces = $this->fetchPsgcProvinces();
        foreach ($psgcProvinces as $prov) {
            $name = trim((string) ($prov['name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $byName[mb_strtolower($name)] = [
                'code' => (string) ($prov['code'] ?? ''),
                'name' => $name,
                'source' => 'psgc',
            ];
        }

        // Merge local DB provinces
        $dbProvinces = DB::table('provinces')->select('province_name')->get();
        foreach ($dbProvinces as $row) {
            $name = trim((string) $row->province_name);
            if ($name !== '' && ! isset($byName[mb_strtolower($name)])) {
                $byName[mb_strtolower($name)] = [
                    'code' => null,
                    'name' => $name,
                    'source' => 'database',
                ];
            }
        }

        return array_values($byName);
    }

    /**
     * @return list<array{code: string|null, name: string, province: string, source: string}>
     */
    private function getCitiesForProvince(string $provinceName): array
    {
        $byName = [];

        // Fallback match (case-insensitive)
        foreach (self::FALLBACK_HIERARCHY as $prov => $cities) {
            if (mb_strtolower($prov) === mb_strtolower($provinceName)) {
                foreach (array_keys($cities) as $cityName) {
                    $byName[mb_strtolower($cityName)] = [
                        'code' => null,
                        'name' => $cityName,
                        'province' => $prov,
                        'source' => 'fallback',
                    ];
                }
            }
        }

        // PSGC API match
        $psgcCities = $this->fetchPsgcCities($provinceName);
        foreach ($psgcCities as $city) {
            $name = trim((string) ($city['name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $byName[mb_strtolower($name)] = [
                'code' => (string) ($city['code'] ?? ''),
                'name' => $name,
                'province' => $provinceName,
                'source' => 'psgc',
            ];
        }

        // Database cities for this province
        $dbCities = DB::table('cities')
            ->join('provinces', 'provinces.province_id', '=', 'cities.province_id')
            ->whereRaw('LOWER(provinces.province_name) = ?', [mb_strtolower($provinceName)])
            ->select('cities.city_name')
            ->get();

        foreach ($dbCities as $row) {
            $name = trim((string) $row->city_name);
            if ($name !== '' && ! isset($byName[mb_strtolower($name)])) {
                $byName[mb_strtolower($name)] = [
                    'code' => null,
                    'name' => $name,
                    'province' => $provinceName,
                    'source' => 'database',
                ];
            }
        }

        return array_values($byName);
    }

    /**
     * @return list<array{code: string|null, name: string, city: string, province: string, source: string}>
     */
    private function getBarangaysForCity(string $cityName, ?string $provinceName): array
    {
        $byName = [];
        $resolvedProvince = $provinceName ?? '';

        // Fallback match
        foreach (self::FALLBACK_HIERARCHY as $prov => $cities) {
            if ($provinceName !== null && mb_strtolower($prov) !== mb_strtolower($provinceName)) {
                continue;
            }
            foreach ($cities as $cName => $barangays) {
                if (mb_strtolower($cName) === mb_strtolower($cityName)) {
                    $resolvedProvince = $prov;
                    foreach ($barangays as $bName) {
                        $byName[mb_strtolower($bName)] = [
                            'code' => null,
                            'name' => $bName,
                            'city' => $cName,
                            'province' => $prov,
                            'source' => 'fallback',
                        ];
                    }
                }
            }
        }

        // PSGC API match
        $psgcBarangays = $this->fetchPsgcBarangays($cityName, $provinceName);
        foreach ($psgcBarangays as $bgy) {
            $name = trim((string) ($bgy['name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $byName[mb_strtolower($name)] = [
                'code' => (string) ($bgy['code'] ?? ''),
                'name' => $name,
                'city' => $cityName,
                'province' => $resolvedProvince,
                'source' => 'psgc',
            ];
        }

        // Database barangays for this city
        $query = DB::table('barangays')
            ->join('cities', 'cities.city_id', '=', 'barangays.city_id')
            ->join('provinces', 'provinces.province_id', '=', 'cities.province_id')
            ->whereRaw('LOWER(cities.city_name) = ?', [mb_strtolower($cityName)]);

        if ($provinceName !== null && $provinceName !== '') {
            $query->whereRaw('LOWER(provinces.province_name) = ?', [mb_strtolower($provinceName)]);
        }

        $dbBarangays = $query->select('barangays.barangay_name', 'provinces.province_name')->get();
        foreach ($dbBarangays as $row) {
            $name = trim((string) $row->barangay_name);
            if ($name !== '' && ! isset($byName[mb_strtolower($name)])) {
                $byName[mb_strtolower($name)] = [
                    'code' => null,
                    'name' => $name,
                    'city' => $cityName,
                    'province' => $row->province_name,
                    'source' => 'database',
                ];
            }
        }

        return array_values($byName);
    }

    /**
     * Cache only successful, non-empty PSGC responses for 24 hours.
     *
     * @param  callable(): list<array<string, mixed>>  $fetcher
     * @return list<array<string, mixed>>
     */
    private function rememberNonEmpty(string $cacheKey, callable $fetcher): array
    {
        if (app()->environment('testing') && $this->skipExternalInTesting) {
            return [];
        }

        $cached = Cache::get($cacheKey);
        if (is_array($cached) && $cached !== []) {
            return $cached;
        }

        $result = $fetcher();
        if (is_array($result) && $result !== []) {
            Cache::put($cacheKey, $result, self::CACHE_TTL_SECONDS);

            return $result;
        }

        return [];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function fetchPsgcProvinces(): array
    {
        $baseUrl = rtrim((string) env('PSGC_API_BASE_URL', 'https://psgc.gitlab.io/api'), '/');

        return $this->rememberNonEmpty('psgc:provinces', static function () use ($baseUrl): array {
            try {
                $response = Http::timeout(6)->acceptJson()->get("{$baseUrl}/provinces/");
                if ($response->successful() && is_array($response->json())) {
                    return $response->json();
                }
            } catch (\Throwable) {
                // Fall back silently to local dataset
            }

            return [];
        });
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function fetchPsgcCities(string $provinceName): array
    {
        $baseUrl = rtrim((string) env('PSGC_API_BASE_URL', 'https://psgc.gitlab.io/api'), '/');
        $cacheKey = 'psgc:cities:' . md5(mb_strtolower($provinceName));

        return $this->rememberNonEmpty($cacheKey, function () use ($baseUrl, $provinceName): array {
            try {
                if (in_array(mb_strtolower($provinceName), ['metro manila', 'ncr', 'national capital region'], true)) {
                    $response = Http::timeout(6)->acceptJson()->get("{$baseUrl}/regions/130000000/cities-municipalities/");
                    if ($response->successful() && is_array($response->json())) {
                        return $response->json();
                    }
                }

                $provinces = $this->fetchPsgcProvinces();
                $matched = null;
                foreach ($provinces as $p) {
                    if (mb_strtolower((string) ($p['name'] ?? '')) === mb_strtolower($provinceName)) {
                        $matched = $p;
                        break;
                    }
                }

                if ($matched && ! empty($matched['code'])) {
                    $response = Http::timeout(6)->acceptJson()->get("{$baseUrl}/provinces/{$matched['code']}/cities-municipalities/");
                    if ($response->successful() && is_array($response->json())) {
                        return $response->json();
                    }
                }
            } catch (\Throwable) {
                // Fall back silently
            }

            return [];
        });
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function fetchPsgcBarangays(string $cityName, ?string $provinceName): array
    {
        $baseUrl = rtrim((string) env('PSGC_API_BASE_URL', 'https://psgc.gitlab.io/api'), '/');
        $cacheKey = 'psgc:barangays:' . md5(mb_strtolower(($provinceName ?? '') . '|' . $cityName));

        return $this->rememberNonEmpty($cacheKey, function () use ($baseUrl, $cityName, $provinceName): array {
            try {
                $cities = $provinceName ? $this->fetchPsgcCities($provinceName) : [];
                $matched = null;
                foreach ($cities as $c) {
                    $candidate = mb_strtolower((string) ($c['name'] ?? ''));
                    $target = mb_strtolower($cityName);
                    if ($candidate === $target || str_replace('city of ', '', $candidate) === str_replace(' city', '', $target)) {
                        $matched = $c;
                        break;
                    }
                }

                if ($matched && ! empty($matched['code'])) {
                    $response = Http::timeout(6)->acceptJson()->get("{$baseUrl}/cities-municipalities/{$matched['code']}/barangays/");
                    if ($response->successful() && is_array($response->json())) {
                        return $response->json();
                    }
                }
            } catch (\Throwable) {
                // Fall back silently
            }

            return [];
        });
    }
}
