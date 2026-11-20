<?php

namespace App\Features\Locations\Controllers;

use App\Features\Locations\Requests\StoreServiceAreaRequest;
use App\Features\Locations\Requests\UpdateServiceAreaRequest;
use App\Features\Locations\Services\AdminServiceAreaService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;

class AdminServiceAreaController extends Controller
{
    public function __construct(
        private readonly AdminServiceAreaService $adminServiceAreas,
    ) {}

    public function index(): JsonResponse
    {
        return ApiResponse::success(
            data: ['service_areas' => $this->adminServiceAreas->list()],
            message: 'Platform service areas retrieved.',
        );
    }

    public function store(StoreServiceAreaRequest $request): JsonResponse
    {
        $area = $this->adminServiceAreas->create($request->user(), $request->validated(), $request);

        return ApiResponse::success(
            data: ['service_area' => $area],
            message: 'Platform service area created.',
            status: 201,
        );
    }

    public function update(UpdateServiceAreaRequest $request, int $id): JsonResponse
    {
        $area = $this->adminServiceAreas->update($request->user(), $id, $request->validated(), $request);

        return ApiResponse::success(
            data: ['service_area' => $area],
            message: 'Platform service area updated.',
        );
    }

    public function locationsOverview(): JsonResponse
    {
        return ApiResponse::success(
            data: $this->adminServiceAreas->getLocationsOverview(),
            message: 'Operational locations overview retrieved.',
        );
    }
}
