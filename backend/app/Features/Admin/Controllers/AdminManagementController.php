<?php

namespace App\Features\Admin\Controllers;

use App\Features\Admin\Services\AdminManagementService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminManagementController extends Controller
{
    public function __construct(
        private readonly AdminManagementService $adminManagementService,
    ) {}

    public function users(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->adminManagementService->listUsers($request->query()),
            message: 'Users retrieved.',
        );
    }

    public function createUser(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'username' => ['required', 'string', 'max:50', 'unique:users,username'],
            'first_name' => ['required', 'string', 'max:100'],
            'middle_initial' => ['nullable', 'string', 'max:1'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'phone_number' => ['nullable', 'string', 'max:30'],
            'password' => ['required', 'string', 'min:8'],
            'user_role' => ['sometimes', 'string', Rule::in(['customer', 'admin'])],
            'account_status' => ['sometimes', 'string', Rule::in(['active', 'inactive', 'suspended', 'pending'])],
        ]);

        $user = $this->adminManagementService->createUser($validated, $request->user(), $request);

        return ApiResponse::success(
            data: ['user' => $user],
            message: 'User account created.',
            status: 201,
        );
    }

    public function updateUser(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'first_name' => ['sometimes', 'string', 'max:100'],
            'last_name' => ['sometimes', 'string', 'max:100'],
            'phone_number' => ['nullable', 'string', 'max:30'],
            'user_role' => ['sometimes', 'string', Rule::in(['customer', 'admin'])],
            'account_status' => ['sometimes', 'string', Rule::in(['active', 'inactive', 'suspended', 'pending'])],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

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

    public function updateRestaurantStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', Rule::in(['pending', 'approved', 'rejected', 'active', 'inactive', 'suspended'])],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $restaurant = $this->adminManagementService->updateRestaurantStatus(
            restaurantId: $id,
            status: (string) $validated['status'],
            reason: $validated['reason'] ?? null,
            admin: $request->user(),
            request: $request,
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

    public function updateRiderStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', Rule::in(['pending', 'approved', 'rejected', 'active', 'inactive', 'suspended'])],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

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

    public function auditLogs(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->adminManagementService->listAuditLogs($request->query()),
            message: 'Audit logs retrieved.',
        );
    }
}
