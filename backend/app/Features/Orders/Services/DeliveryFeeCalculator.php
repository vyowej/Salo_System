<?php

namespace App\Features\Orders\Services;

use App\Support\Money;

class DeliveryFeeCalculator
{
    private const EARTH_RADIUS_METERS = 6371000.0;

    private const METER_TOLERANCE = 0.001;

    /**
     * Compute straight-line (haversine) distance in meters between two coordinate pairs.
     */
    public static function haversineMeters(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $phi1 = deg2rad($lat1);
        $phi2 = deg2rad($lat2);
        $deltaPhi = deg2rad($lat2 - $lat1);
        $deltaLambda = deg2rad($lng2 - $lng1);

        $a = sin($deltaPhi / 2) ** 2
            + cos($phi1) * cos($phi2) * (sin($deltaLambda / 2) ** 2);
        $c = 2 * atan2(sqrt($a), sqrt(max(0.0, 1.0 - $a)));

        return self::EARTH_RADIUS_METERS * $c;
    }

    /**
     * Calculate delivery distance (km) and fee (integer cents) from coordinates and settings.
     *
     * @param  array{
     *   base_fee_cents: int,
     *   base_distance_km: float,
     *   per_extra_km_cents: int,
     *   max_fee_cents: int
     * }  $settings
     * @return array{
     *   distance_km: float|null,
     *   fee_cents: int,
     *   fee: string,
     *   used_fallback: bool
     * }
     */
    public function calculate(
        ?float $restaurantLat,
        ?float $restaurantLng,
        ?float $deliveryLat,
        ?float $deliveryLng,
        array $settings,
        string $fulfillment = 'delivery',
    ): array {
        if ($fulfillment !== 'delivery') {
            return [
                'distance_km' => null,
                'fee_cents' => 0,
                'fee' => Money::fromCents(0),
                'used_fallback' => false,
            ];
        }

        $baseFeeCents = max(0, (int) ($settings['base_fee_cents'] ?? 4900));
        $baseDistanceKm = max(0.001, (float) ($settings['base_distance_km'] ?? 2.0));
        $perExtraKmCents = max(0, (int) ($settings['per_extra_km_cents'] ?? 1000));
        $maxFeeCents = max($baseFeeCents, (int) ($settings['max_fee_cents'] ?? 15000));

        if ($restaurantLat === null || $restaurantLng === null || $deliveryLat === null || $deliveryLng === null) {
            return [
                'distance_km' => null,
                'fee_cents' => min($baseFeeCents, $maxFeeCents),
                'fee' => Money::fromCents(min($baseFeeCents, $maxFeeCents)),
                'used_fallback' => true,
            ];
        }

        $meters = self::haversineMeters($restaurantLat, $restaurantLng, $deliveryLat, $deliveryLng);
        $distanceKm = round($meters / 1000.0, 1);

        $baseDistanceMeters = $baseDistanceKm * 1000.0;
        $extraMeters = $meters - $baseDistanceMeters;

        if ($extraMeters <= self::METER_TOLERANCE) {
            $feeCents = $baseFeeCents;
        } else {
            $extraKm = max(1, (int) ceil(($extraMeters - self::METER_TOLERANCE) / 1000.0));
            $feeCents = $baseFeeCents + ($extraKm * $perExtraKmCents);
        }

        $feeCents = min($feeCents, $maxFeeCents);

        return [
            'distance_km' => $distanceKm,
            'fee_cents' => $feeCents,
            'fee' => Money::fromCents($feeCents),
            'used_fallback' => false,
        ];
    }
}
