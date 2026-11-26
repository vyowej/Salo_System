<?php

namespace App\Support;

final class AddressFormatter
{
    /**
     * Merge legacy house_number / building_name with street for display-time formatting.
     *
     * @param  array<string, mixed>|object  $address
     */
    public static function formatStreetLine(array|object $address): string
    {
        $get = static function (string ...$keys) use ($address): string {
            foreach ($keys as $key) {
                $val = is_array($address) ? ($address[$key] ?? null) : ($address->{$key} ?? null);
                if ($val !== null && trim((string) $val) !== '') {
                    return trim((string) $val);
                }
            }

            return '';
        };

        $house = $get('house_number', 'houseNumber');
        $building = $get('building_name', 'buildingName');
        $street = $get('street', 'restaurant_street');

        $parts = [];
        if ($house !== '' && ($street === '' || ! str_contains(mb_strtolower($street), mb_strtolower($house)))) {
            $parts[] = $house;
        }
        if ($building !== '' && ($street === '' || ! str_contains(mb_strtolower($street), mb_strtolower($building)))) {
            $parts[] = $building;
        }
        if ($street !== '') {
            $parts[] = $street;
        }

        return implode(' ', $parts);
    }

    /**
     * Format a Philippine address in the canonical SALO format:
     * House/Building No. and Street, Barangay, City/Municipality, Province ZIP
     *
     * @param  array<string, mixed>|object  $address
     */
    public static function format(array|object $address): string
    {
        $get = static function (string ...$keys) use ($address): string {
            foreach ($keys as $key) {
                $val = is_array($address) ? ($address[$key] ?? null) : ($address->{$key} ?? null);
                if ($val !== null && trim((string) $val) !== '') {
                    return trim((string) $val);
                }
            }

            return '';
        };

        $streetLine = self::formatStreetLine($address);
        $barangay = $get('barangay', 'barangay_name', 'restaurant_barangay');
        $city = $get('city', 'city_name', 'restaurant_city');
        $province = $get('province', 'province_name', 'restaurant_province');
        $postal = $get('postal_code', 'postalCode');

        $barangayPart = '';
        if ($barangay !== '') {
            $barangayPart = preg_match('/^(brgy\.?|barangay)\b/i', $barangay) === 1
                ? $barangay
                : "Brgy. {$barangay}";
        }

        $provinceZip = trim(implode(' ', array_filter([$province, $postal], static fn ($v) => $v !== '')));

        return implode(', ', array_filter([
            $streetLine,
            $barangayPart,
            $city,
            $provinceZip,
        ], static fn ($v) => $v !== ''));
    }
}
