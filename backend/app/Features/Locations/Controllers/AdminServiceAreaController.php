<?php

namespace App\Features\Locations\Controllers;

use App\Features\Locations\Services\AdminServiceAreaService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'province' => ['required', 'string', 'max:100'],
            'city' => ['nullable', 'string', 'max:100'],
            'barangay' => ['nullable', 'string', 'max:100'],
            'is_active' => ['sometimes', 'boolean'],
            'center_latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'center_longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'boundary_geojson' => ['nullable', 'string'],
            'notes' => ['nullable', 'string', 'max:255'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $area = $this->adminServiceAreas->create($request->user(), $validated, $request);

        return ApiResponse::success(
            data: ['service_area' => $area],
            message: 'Platform service area created.',
            status: 201,
        );
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'is_active' => ['sometimes', 'boolean'],
            'center_latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'center_longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'boundary_geojson' => ['nullable', 'string'],
            'notes' => ['nullable', 'string', 'max:255'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $area = $this->adminServiceAreas->update($request->user(), $id, $validated, $request);

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
