<?php

namespace App\Features\Locations\Services;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RiderTrackingService
{
    private const ACTIVE_DELIVERY_STATUSES = ['accepted', 'picked_up', 'in_transit'];
    private const STALE_THRESHOLD_SECONDS = 120;

    /**
     * Record an actual device GPS update from an authenticated rider.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function recordLocation(User $user, array $data): array
    {
        $rider = DB::table('riders')->where('user_id', $user->user_id)->first();
        if (! $rider || ! in_array($rider->rider_status, ['approved', 'active'], true)) {
            abort(403, 'Active approved rider profile required.');
        }

        $deliveryId = isset($data['delivery_id']) && is_numeric($data['delivery_id'])
            ? (int) $data['delivery_id']
            : null;

        if ($deliveryId !== null) {
            $delivery = DB::table('deliveries')
                ->where('delivery_id', $deliveryId)
                ->where('rider_id', $rider->rider_id)
                ->first();

            if (! $delivery) {
                abort(403, 'Delivery does not belong to this rider.');
            }

            if (! in_array($delivery->delivery_status, self::ACTIVE_DELIVERY_STATUSES, true)) {
                return [
                    'recorded' => false,
                    'reason' => 'Tracking stopped because delivery is no longer active.',
                ];
            }
        }

        $recordedAt = ! empty($data['recorded_at'])
            ? CarbonImmutable::parse((string) $data['recorded_at'])
            : CarbonImmutable::now();

        // Deduplicate / ignore out-of-order stale updates
        $latest = DB::table('rider_locations')
            ->where('rider_id', $rider->rider_id)
            ->orderByDesc('recorded_at')
            ->first();

        if ($latest && CarbonImmutable::parse((string) $latest->recorded_at)->greaterThan($recordedAt)) {
            return [
                'recorded' => false,
                'reason' => 'Ignored out-of-order GPS update.',
                'latest_recorded_at' => $latest->recorded_at,
            ];
        }

        $id = (int) DB::table('rider_locations')->insertGetId([
            'rider_id' => $rider->rider_id,
            'delivery_id' => $deliveryId,
            'latitude' => (float) $data['latitude'],
            'longitude' => (float) $data['longitude'],
            'accuracy_meters' => isset($data['accuracy_meters']) && is_numeric($data['accuracy_meters'])
                ? (float) $data['accuracy_meters']
                : null,
            'heading' => isset($data['heading']) && is_numeric($data['heading'])
                ? (float) $data['heading']
                : null,
            'speed_mps' => isset($data['speed_mps']) && is_numeric($data['speed_mps'])
                ? (float) $data['speed_mps']
                : null,
            'recorded_at' => $recordedAt->toDateTimeString(),
            'created_at' => now(),
        ]);

        return [
            'recorded' => true,
            'rider_location_id' => $id,
            'rider_id' => (int) $rider->rider_id,
            'delivery_id' => $deliveryId,
            'latitude' => (float) $data['latitude'],
            'longitude' => (float) $data['longitude'],
            'accuracy_meters' => isset($data['accuracy_meters']) ? (float) $data['accuracy_meters'] : null,
            'recorded_at' => $recordedAt->toIso8601String(),
        ];
    }

    /**
     * Retrieve live order tracking for Customer (own order only) or Admin.
     *
     * @return array<string, mixed>
     */
    public function getOrderTracking(int $orderId, User $viewer, bool $isAdmin = false): array
    {
        $order = DB::table('orders as o')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->join('addresses as ra', 'ra.address_id', '=', 'r.address_id')
            ->join('barangays as rb', 'rb.barangay_id', '=', 'ra.barangay_id')
            ->join('cities as rc', 'rc.city_id', '=', 'rb.city_id')
            ->join('provinces as rp', 'rp.province_id', '=', 'rc.province_id')
            ->where('o.order_id', $orderId)
            ->select([
                'o.order_id',
                'o.order_reference',
                'o.customer_id',
                'o.order_status',
                'o.order_type',
                'o.delivery_address_text',
                'o.delivery_latitude',
                'o.delivery_longitude',
                'o.delivery_notes',
                'o.delivery_recipient_name',
                'r.restaurant_id',
                'r.restaurant_name',
                'ra.street as restaurant_street',
                'ra.latitude as restaurant_latitude',
                'ra.longitude as restaurant_longitude',
                'rb.barangay_name as restaurant_barangay',
                'rc.city_name as restaurant_city',
                'rp.province_name as restaurant_province',
            ])
            ->first();

        if (! $order) {
            abort(404, 'Order not found.');
        }

        if (! $isAdmin && (int) $order->customer_id !== (int) $viewer->user_id) {
            abort(403, 'You are not authorized to track this order.');
        }

        $delivery = DB::table('deliveries as d')
            ->leftJoin('riders as ri', 'ri.rider_id', '=', 'd.rider_id')
            ->leftJoin('users as ru', 'ru.user_id', '=', 'ri.user_id')
            ->where('d.order_id', $orderId)
            ->select([
                'd.delivery_id',
                'd.rider_id',
                'd.delivery_status',
                'd.assigned_at',
                'd.accepted_at',
                'd.picked_up_at',
                'd.delivered_at',
                'd.failed_at',
                'ri.vehicle_type',
                'ri.plate_number',
                'ru.first_name as rider_first_name',
                'ru.last_name as rider_last_name',
            ])
            ->first();

        $riderLocation = null;
        if ($delivery && $delivery->rider_id && in_array($delivery->delivery_status, self::ACTIVE_DELIVERY_STATUSES, true)) {
            $latestGps = DB::table('rider_locations')
                ->where('rider_id', $delivery->rider_id)
                ->orderByDesc('recorded_at')
                ->first();

            if ($latestGps) {
                $recordedAt = CarbonImmutable::parse((string) $latestGps->recorded_at);
                $ageSeconds = $recordedAt->diffInSeconds(CarbonImmutable::now());
                $riderLocation = [
                    'latitude' => (float) $latestGps->latitude,
                    'longitude' => (float) $latestGps->longitude,
                    'accuracy_meters' => $latestGps->accuracy_meters !== null ? (float) $latestGps->accuracy_meters : null,
                    'recorded_at' => $recordedAt->toIso8601String(),
                    'age_seconds' => $ageSeconds,
                    'is_stale' => $ageSeconds > self::STALE_THRESHOLD_SECONDS,
                ];
            }
        }

        return [
            'order_id' => (int) $order->order_id,
            'order_reference' => $order->order_reference,
            'order_status' => $order->order_status,
            'order_type' => $order->order_type,
            'pickup' => [
                'restaurant_id' => (int) $order->restaurant_id,
                'restaurant_name' => $order->restaurant_name,
                'address' => trim(($order->restaurant_street ? $order->restaurant_street . ', ' : '') . "Brgy. {$order->restaurant_barangay}, {$order->restaurant_city}, {$order->restaurant_province}"),
                'latitude' => $order->restaurant_latitude !== null ? (float) $order->restaurant_latitude : null,
                'longitude' => $order->restaurant_longitude !== null ? (float) $order->restaurant_longitude : null,
            ],
            'dropoff' => [
                'recipient_name' => $order->delivery_recipient_name,
                'address' => $order->delivery_address_text,
                'latitude' => $order->delivery_latitude !== null ? (float) $order->delivery_latitude : null,
                'longitude' => $order->delivery_longitude !== null ? (float) $order->delivery_longitude : null,
                'notes' => $order->delivery_notes,
            ],
            'delivery' => $delivery ? [
                'delivery_id' => (int) $delivery->delivery_id,
                'status' => $delivery->delivery_status,
                'assigned_at' => $delivery->assigned_at,
                'accepted_at' => $delivery->accepted_at,
                'picked_up_at' => $delivery->picked_up_at,
                'delivered_at' => $delivery->delivered_at,
                'failed_at' => $delivery->failed_at,
            ] : null,
            'rider' => ($delivery && $delivery->rider_id) ? [
                'name' => trim(($delivery->rider_first_name ?? '') . ' ' . ($delivery->rider_last_name ?? '')),
                'vehicle_type' => $delivery->vehicle_type,
                'plate_number' => $delivery->plate_number,
            ] : null,
            'rider_location' => $riderLocation,
        ];
    }
}
