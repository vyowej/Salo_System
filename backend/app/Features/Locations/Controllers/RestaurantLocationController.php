<?php

namespace App\Features\Locations\Controllers;

use App\Features\Locations\Services\RestaurantLocationService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RestaurantLocationController extends Controller
{
    public function __construct(
        private readonly RestaurantLocationService $restaurantLocations,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $restaurantId = $request->query('restaurant_id');

        return ApiResponse::success(
            data: $this->restaurantLocations->getLocationAndCoverage(
                $request->user(),
                is_numeric($restaurantId) ? (int) $restaurantId : null,
            ),
            message: 'Restaurant location and coverage retrieved.',
        );
    }

    public function updateLocation(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'restaurant_id' => ['nullable', 'integer', 'min:1'],
            'province' => ['required', 'string', 'max:100'],
            'city' => ['required', 'string', 'max:100'],
            'barangay' => ['required', 'string', 'max:100'],
            'street' => ['required', 'string', 'max:255'],
            'house_number' => ['nullable', 'string', 'max:50'],
            'building_name' => ['nullable', 'string', 'max:150'],
            'landmark' => ['nullable', 'string', 'max:500'],
            'postal_code' => ['nullable', 'regex:/^\d{4}$/'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'gps_accuracy' => ['nullable', 'numeric', 'min:0', 'max:100000'],
        ]);

        $data = $this->restaurantLocations->updateLocation(
            $request->user(),
            isset($validated['restaurant_id']) ? (int) $validated['restaurant_id'] : null,
            $validated,
            $request,
        );

        return ApiResponse::success(
            data: $data,
            message: 'Restaurant location updated.',
        );
    }

    public function updateCoverage(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'restaurant_id' => ['nullable', 'integer', 'min:1'],
            'areas' => ['present', 'array'],
            'areas.*.province' => ['required', 'string', 'max:100'],
            'areas.*.city' => ['required', 'string', 'max:100'],
            'areas.*.barangay' => ['nullable', 'string', 'max:100'],
        ]);

        $data = $this->restaurantLocations->updateCoverage(
            $request->user(),
            isset($validated['restaurant_id']) ? (int) $validated['restaurant_id'] : null,
            $validated['areas'],
            $request,
        );

        return ApiResponse::success(
            data: $data,
            message: 'Restaurant delivery coverage updated.',
        );
    }
}
