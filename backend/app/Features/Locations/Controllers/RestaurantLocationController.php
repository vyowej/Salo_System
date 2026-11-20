<?php

namespace App\Features\Locations\Controllers;

use App\Features\Locations\Requests\UpdateRestaurantCoverageRequest;
use App\Features\Locations\Requests\UpdateRestaurantLocationRequest;
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

    public function updateLocation(UpdateRestaurantLocationRequest $request): JsonResponse
    {
        $validated = $request->validated();

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

    public function updateCoverage(UpdateRestaurantCoverageRequest $request): JsonResponse
    {
        $validated = $request->validated();

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
