<?php

namespace App\Features\Locations\Controllers;

use App\Features\Locations\Requests\ValidateServiceAreaRequest;
use App\Features\Locations\Services\AdminServiceAreaService;
use App\Features\Locations\Services\PsgcLocationService;
use App\Features\Locations\Services\ServiceAreaValidationService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LocationLookupController extends Controller
{
    public function __construct(
        private readonly PsgcLocationService $psgc,
        private readonly ServiceAreaValidationService $validation,
        private readonly AdminServiceAreaService $adminServiceAreas,
    ) {}

    public function provinces(Request $request): JsonResponse
    {
        $query = (string) $request->query('q', '');
        $limit = min(100, max(1, (int) $request->query('limit', 30)));

        return ApiResponse::success(
            data: ['provinces' => $this->psgc->searchProvinces($query, $limit)],
            message: 'Provinces retrieved.',
        );
    }

    public function cities(Request $request): JsonResponse
    {
        $province = (string) $request->query('province', '');
        $query = (string) $request->query('q', '');
        $limit = min(100, max(1, (int) $request->query('limit', 40)));

        return ApiResponse::success(
            data: ['cities' => $this->psgc->searchCities($province, $query, $limit)],
            message: 'Cities/municipalities retrieved.',
        );
    }

    public function barangays(Request $request): JsonResponse
    {
        $city = (string) $request->query('city', '');
        $province = $request->query('province');
        $query = (string) $request->query('q', '');
        $limit = min(100, max(1, (int) $request->query('limit', 50)));

        return ApiResponse::success(
            data: [
                'barangays' => $this->psgc->searchBarangays(
                    $city,
                    is_string($province) && $province !== '' ? $province : null,
                    $query,
                    $limit,
                ),
            ],
            message: 'Barangays retrieved.',
        );
    }

    public function activeServiceAreas(): JsonResponse
    {
        return ApiResponse::success(
            data: ['service_areas' => $this->adminServiceAreas->list(activeOnly: true)],
            message: 'Active platform service areas retrieved.',
        );
    }

    public function validateServiceArea(ValidateServiceAreaRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $result = isset($validated['restaurant_id'])
            ? $this->validation->checkRestaurantSupport(
                (int) $validated['restaurant_id'],
                $validated['province'],
                $validated['city'],
                $validated['barangay'] ?? null,
            )
            : $this->validation->checkPlatformSupport(
                $validated['province'],
                $validated['city'],
                $validated['barangay'] ?? null,
            );

        return ApiResponse::success(
            data: $result,
            message: $result['reason'],
        );
    }
}
