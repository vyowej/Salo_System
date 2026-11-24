<?php

namespace App\Features\Admin\Controllers;

use App\Features\Admin\Requests\AdminUpdateRiderScheduleRequest;
use App\Features\Admin\Requests\DecideRiderScheduleRequest;
use App\Features\Riders\Services\RiderScheduleService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminRiderScheduleController extends Controller
{
    public function __construct(
        private readonly RiderScheduleService $riderScheduleService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->riderScheduleService->listAdminRequests($request->query()),
            message: 'Rider schedule change requests retrieved.',
        );
    }

    public function showRiderSchedule(int $id): JsonResponse
    {
        return ApiResponse::success(
            data: $this->riderScheduleService->getAdminRiderSchedule($id),
            message: 'Rider schedule retrieved.',
        );
    }

    public function updateRiderSchedule(AdminUpdateRiderScheduleRequest $request, int $id): JsonResponse
    {
        $schedule = $this->riderScheduleService->applyAdminDirectUpdate(
            riderId: $id,
            admin: $request->user(),
            validated: $request->validated(),
            request: $request,
        );

        return ApiResponse::success(
            data: $schedule,
            message: 'Rider approved schedule updated.',
        );
    }

    public function approve(DecideRiderScheduleRequest $request, int $id): JsonResponse
    {
        $validated = $request->validated();

        $updated = $this->riderScheduleService->approveRequest(
            requestId: $id,
            admin: $request->user(),
            remarks: $validated['remarks'] ?? null,
            request: $request,
        );

        return ApiResponse::success(
            data: ['request' => $updated],
            message: 'Schedule change request approved.',
        );
    }

    public function reject(DecideRiderScheduleRequest $request, int $id): JsonResponse
    {
        $validated = $request->validated();

        $updated = $this->riderScheduleService->rejectRequest(
            requestId: $id,
            admin: $request->user(),
            remarks: (string) ($validated['remarks'] ?? ''),
            request: $request,
        );

        return ApiResponse::success(
            data: ['request' => $updated],
            message: 'Schedule change request rejected.',
        );
    }
}
