<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

class AddressService
{
    /**
     * Resolve or create province, city, barangay, and insert an address row.
     * Must be called inside a DB transaction when part of an application submission.
     *
     * @param  array<string, mixed>  $data
     */
    public function createAddress(array $data): int
    {
        $provinceName = trim((string) ($data['province'] ?? 'Metro Manila'));
        $cityName = trim((string) ($data['city'] ?? 'Quezon City'));
        $barangayName = trim((string) ($data['barangay'] ?? 'South Triangle'));

        $provinceId = $this->resolveProvinceId($provinceName);
        $cityId = $this->resolveCityId($provinceId, $cityName);
        $barangayId = $this->resolveBarangayId($cityId, $barangayName);

        $postalCode = isset($data['postal_code']) ? preg_replace('/\D/', '', (string) $data['postal_code']) : null;
        if ($postalCode === '' || strlen((string) $postalCode) !== 4) {
            $postalCode = null;
        }

        return (int) DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => isset($data['street']) && trim((string) $data['street']) !== '' ? mb_substr(trim((string) $data['street']), 0, 255) : null,
            'house_number' => isset($data['house_number']) && trim((string) $data['house_number']) !== '' ? mb_substr(trim((string) $data['house_number']), 0, 50) : null,
            'building_name' => isset($data['building_name']) && trim((string) $data['building_name']) !== '' ? mb_substr(trim((string) $data['building_name']), 0, 150) : null,
            'landmark' => isset($data['landmark']) && trim((string) $data['landmark']) !== '' ? trim((string) $data['landmark']) : null,
            'postal_code' => $postalCode,
            'latitude' => isset($data['latitude']) && is_numeric($data['latitude']) ? (float) $data['latitude'] : null,
            'longitude' => isset($data['longitude']) && is_numeric($data['longitude']) ? (float) $data['longitude'] : null,
            'gps_accuracy' => isset($data['gps_accuracy']) && is_numeric($data['gps_accuracy']) ? (float) $data['gps_accuracy'] : null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Update an existing address row while preserving coordinates when omitted.
     *
     * @param  array<string, mixed>  $data
     */
    public function updateAddress(int $addressId, array $data): void
    {
        $existing = DB::table('addresses')->where('address_id', $addressId)->first();
        if (! $existing) {
            return;
        }

        $barangayId = $existing->barangay_id;
        if (isset($data['province']) || isset($data['city']) || isset($data['barangay'])) {
            $currentHierarchy = DB::table('barangays')
                ->join('cities', 'cities.city_id', '=', 'barangays.city_id')
                ->join('provinces', 'provinces.province_id', '=', 'cities.province_id')
                ->where('barangays.barangay_id', $existing->barangay_id)
                ->select('provinces.province_name', 'cities.city_name', 'barangays.barangay_name')
                ->first();

            $provinceName = trim((string) ($data['province'] ?? $currentHierarchy?->province_name ?? 'Metro Manila'));
            $cityName = trim((string) ($data['city'] ?? $currentHierarchy?->city_name ?? 'Quezon City'));
            $barangayName = trim((string) ($data['barangay'] ?? $currentHierarchy?->barangay_name ?? 'South Triangle'));

            $provinceId = $this->resolveProvinceId($provinceName);
            $cityId = $this->resolveCityId($provinceId, $cityName);
            $barangayId = $this->resolveBarangayId($cityId, $barangayName);
        }

        $postalCode = $existing->postal_code;
        if (array_key_exists('postal_code', $data)) {
            $cleaned = preg_replace('/\D/', '', (string) $data['postal_code']);
            $postalCode = ($cleaned !== '' && strlen((string) $cleaned) === 4) ? $cleaned : null;
        }

        DB::table('addresses')->where('address_id', $addressId)->update([
            'barangay_id' => $barangayId,
            'street' => array_key_exists('street', $data)
                ? (trim((string) $data['street']) !== '' ? mb_substr(trim((string) $data['street']), 0, 255) : null)
                : $existing->street,
            'house_number' => array_key_exists('house_number', $data)
                ? (trim((string) $data['house_number']) !== '' ? mb_substr(trim((string) $data['house_number']), 0, 50) : null)
                : $existing->house_number,
            'building_name' => array_key_exists('building_name', $data)
                ? (trim((string) $data['building_name']) !== '' ? mb_substr(trim((string) $data['building_name']), 0, 150) : null)
                : $existing->building_name,
            'landmark' => array_key_exists('landmark', $data)
                ? (trim((string) $data['landmark']) !== '' ? trim((string) $data['landmark']) : null)
                : $existing->landmark,
            'postal_code' => $postalCode,
            'latitude' => isset($data['latitude']) && is_numeric($data['latitude']) ? (float) $data['latitude'] : $existing->latitude,
            'longitude' => isset($data['longitude']) && is_numeric($data['longitude']) ? (float) $data['longitude'] : $existing->longitude,
            'gps_accuracy' => isset($data['gps_accuracy']) && is_numeric($data['gps_accuracy']) ? (float) $data['gps_accuracy'] : $existing->gps_accuracy,
            'updated_at' => now(),
        ]);
    }

    /**
     * Resolve province, optional city, and optional barangay IDs.
     *
     * @return array{province_id: int, city_id: int|null, barangay_id: int|null}
     */
    public function resolveHierarchyIds(string $provinceName, ?string $cityName = null, ?string $barangayName = null): array
    {
        $provinceId = $this->resolveProvinceId(trim($provinceName));
        $cityId = $cityName !== null && trim($cityName) !== ''
            ? $this->resolveCityId($provinceId, trim($cityName))
            : null;
        $barangayId = ($cityId !== null && $barangayName !== null && trim($barangayName) !== '')
            ? $this->resolveBarangayId($cityId, trim($barangayName))
            : null;

        return [
            'province_id' => $provinceId,
            'city_id' => $cityId,
            'barangay_id' => $barangayId,
        ];
    }

    public function resolveCityIdByName(string $cityName, ?string $provinceName = null): int
    {
        $cleanCity = trim($cityName);
        $existing = DB::table('cities')->where('city_name', $cleanCity)->value('city_id');
        if ($existing) {
            return (int) $existing;
        }

        $provinceId = $this->resolveProvinceId($provinceName ?: 'Metro Manila');

        return $this->resolveCityId($provinceId, $cleanCity);
    }

    private function resolveProvinceId(string $name): int
    {
        $existing = DB::table('provinces')->where('province_name', $name)->value('province_id');
        if ($existing) {
            return (int) $existing;
        }

        return (int) DB::table('provinces')->insertGetId([
            'province_name' => mb_substr($name, 0, 100),
            'created_at' => now(),
        ]);
    }

    private function resolveCityId(int $provinceId, string $name): int
    {
        $existing = DB::table('cities')
            ->where('province_id', $provinceId)
            ->where('city_name', $name)
            ->value('city_id');

        if ($existing) {
            return (int) $existing;
        }

        return (int) DB::table('cities')->insertGetId([
            'province_id' => $provinceId,
            'city_name' => mb_substr($name, 0, 100),
            'created_at' => now(),
        ]);
    }

    private function resolveBarangayId(int $cityId, string $name): int
    {
        $existing = DB::table('barangays')
            ->where('city_id', $cityId)
            ->where('barangay_name', $name)
            ->value('barangay_id');

        if ($existing) {
            return (int) $existing;
        }

        return (int) DB::table('barangays')->insertGetId([
            'city_id' => $cityId,
            'barangay_name' => mb_substr($name, 0, 100),
            'created_at' => now(),
        ]);
    }
}
