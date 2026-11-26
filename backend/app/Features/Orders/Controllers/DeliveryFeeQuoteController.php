<?php

namespace App\Features\Orders\Controllers;

use App\Features\Orders\Requests\DeliveryFeeQuoteRequest;
use App\Features\Orders\Services\DeliveryFeeCalculator;
use App\Features\Reviews\Services\PlatformSettingsService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use App\Support\PublicRestaurantVisibility;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class DeliveryFeeQuoteController extends Controller
{
    public function quote(
        DeliveryFeeQuoteRequest $request,
        DeliveryFeeCalculator $calculator,
        PlatformSettingsService $settingsService,
        PublicRestaurantVisibility $visibility,
    ): JsonResponse {
        $validated = $request->validated();
        $restaurantId = (int) $validated['restaurant_id'];
        $fulfillment = (string) ($validated['fulfillment'] ?? 'delivery');
        $settings = $settingsService->getDeliveryFeeSettings();

        $restaurant = DB::table('restaurants')->where('restaurant_id', $restaurantId)->first([
            'restaurant_id',
            'address_id',
            'restaurant_status',
        ]);

        if (! $restaurant || ! $visibility->isVisible($restaurantId)) {
            throw new NotFoundHttpException('Restaurant not found or unavailable.');
        }

        if ($fulfillment !== 'delivery') {
            $calc = $calculator->calculate(null, null, null, null, $settings, $fulfillment);

            return ApiResponse::success([
                'restaurant_id' => $restaurantId,
                'fulfillment' => $fulfillment,
                'delivery_fee' => (float) $calc['fee'],
                'delivery_fee_formatted' => $calc['fee'],
                'distance_km' => null,
                'used_fallback' => false,
            ], 'Delivery fee quote retrieved.');
        }

        $deliveryLat = null;
        $deliveryLng = null;

        if (! empty($validated['address_id'])) {
            $addressId = (int) $validated['address_id'];
            $addrRow = DB::table('user_addresses as ua')
                ->join('addresses as a', 'a.address_id', '=', 'ua.address_id')
                ->where('ua.user_id', $request->user()->user_id)
                ->where('ua.address_id', $addressId)
                ->first(['a.latitude', 'a.longitude']);

            if (! $addrRow) {
                throw new NotFoundHttpException('Delivery address not found.');
            }

            $deliveryLat = $addrRow->latitude !== null ? (float) $addrRow->latitude : null;
            $deliveryLng = $addrRow->longitude !== null ? (float) $addrRow->longitude : null;
        } elseif (isset($validated['latitude'], $validated['longitude'])) {
            $deliveryLat = (float) $validated['latitude'];
            $deliveryLng = (float) $validated['longitude'];
        } else {
            throw ValidationException::withMessages([
                'address_id' => ['Either address_id or latitude/longitude is required for a delivery quote.'],
            ]);
        }

        $restaurantAddr = $restaurant->address_id
            ? DB::table('addresses')->where('address_id', $restaurant->address_id)->first(['latitude', 'longitude'])
            : null;

        $calc = $calculator->calculate(
            restaurantLat: $restaurantAddr?->latitude !== null ? (float) $restaurantAddr->latitude : null,
            restaurantLng: $restaurantAddr?->longitude !== null ? (float) $restaurantAddr->longitude : null,
            deliveryLat: $deliveryLat,
            deliveryLng: $deliveryLng,
            settings: $settings,
            fulfillment: 'delivery',
        );

        if ($calc['used_fallback']) {
            Log::warning('Delivery fee quote fell back to base fee due to missing coordinates.', [
                'restaurant_id' => $restaurantId,
                'address_id' => $validated['address_id'] ?? null,
            ]);
        }

        return ApiResponse::success([
            'restaurant_id' => $restaurantId,
            'fulfillment' => 'delivery',
            'delivery_fee' => (float) $calc['fee'],
            'delivery_fee_formatted' => $calc['fee'],
            'distance_km' => $calc['distance_km'],
            'used_fallback' => $calc['used_fallback'],
        ], 'Delivery fee quote retrieved.');
    }
}
