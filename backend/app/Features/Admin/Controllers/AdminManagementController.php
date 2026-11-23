<?php

namespace App\Features\Admin\Controllers;

use App\Features\Admin\Requests\CreateAdminUserRequest;
use App\Features\Admin\Requests\UpdateAdminRestaurantStatusRequest;
use App\Features\Admin\Requests\UpdateAdminRiderStatusRequest;
use App\Features\Admin\Requests\UpdateAdminUserRequest;
use App\Features\Admin\Services\AdminManagementService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminManagementController extends Controller
{
    public function __construct(
        private readonly AdminManagementService $adminManagementService,
    ) {}

    public function dashboard(): JsonResponse
    {
        return ApiResponse::success(
            data: $this->adminManagementService->getDashboardMetrics(),
            message: 'Admin dashboard metrics retrieved.',
        );
    }

    public function users(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->adminManagementService->listUsers($request->query()),
            message: 'Users retrieved.',
        );
    }

    public function userActivity(int $id): JsonResponse
    {
        return ApiResponse::success(
            data: $this->adminManagementService->getUserActivity($id),
            message: 'User activity retrieved.',
        );
    }

    public function createUser(CreateAdminUserRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $user = $this->adminManagementService->createUser($validated, $request->user(), $request);

        return ApiResponse::success(
            data: ['user' => $user],
            message: 'User account created.',
            status: 201,
        );
    }

    public function updateUser(UpdateAdminUserRequest $request, int $id): JsonResponse
    {
        $validated = $request->validated();

        $user = $this->adminManagementService->updateUser($id, $validated, $request->user(), $request);

        return ApiResponse::success(
            data: ['user' => $user],
            message: 'User account updated.',
        );
    }

    public function restaurants(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->adminManagementService->listRestaurants($request->query()),
            message: 'Restaurants retrieved.',
        );
    }

    public function updateRestaurantStatus(UpdateAdminRestaurantStatusRequest $request, int $id): JsonResponse
    {
        $validated = $request->validated();

        $restaurant = $this->adminManagementService->updateRestaurantStatus(
            restaurantId: $id,
            status: (string) $validated['status'],
            reason: $validated['reason'] ?? null,
            admin: $request->user(),
            request: $request,
            applyToAllBranches: (bool) ($validated['apply_to_all_branches'] ?? false),
        );

        return ApiResponse::success(
            data: ['restaurant' => $restaurant],
            message: 'Restaurant status updated.',
        );
    }

    public function riders(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->adminManagementService->listRiders($request->query()),
            message: 'Riders retrieved.',
        );
    }

    public function updateRiderStatus(UpdateAdminRiderStatusRequest $request, int $id): JsonResponse
    {
        $validated = $request->validated();

        $rider = $this->adminManagementService->updateRiderStatus(
            riderId: $id,
            status: (string) $validated['status'],
            reason: $validated['reason'] ?? null,
            admin: $request->user(),
            request: $request,
        );

        return ApiResponse::success(
            data: ['rider' => $rider],
            message: 'Rider status updated.',
        );
    }

    public function activateRider(Request $request, int $id): JsonResponse
    {
        $rider = $this->adminManagementService->activateRider(
            riderId: $id,
            admin: $request->user(),
            request: $request,
        );

        return ApiResponse::success(
            data: ['rider' => $rider],
            message: 'Rider activated.',
        );
    }

    public function auditLogs(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->adminManagementService->listAuditLogs($request->query()),
            message: 'Audit logs retrieved.',
        );
    }
}
