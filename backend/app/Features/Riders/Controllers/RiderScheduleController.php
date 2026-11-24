<?php

namespace App\Features\Riders\Controllers;

use App\Features\Riders\Requests\SubmitRiderScheduleRequest;
use App\Features\Riders\Services\RiderScheduleService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RiderScheduleController extends Controller
{
    public function __construct(
        private readonly RiderScheduleService $riderScheduleService,
    ) {}

    public function show(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->riderScheduleService->getRiderSchedule($request->user()),
            message: 'Rider schedule retrieved.',
        );
    }

    public function store(SubmitRiderScheduleRequest $request): JsonResponse
    {
        $created = $this->riderScheduleService->submitRequest(
            user: $request->user(),
            validated: $request->validated(),
            request: $request,
        );

        return ApiResponse::success(
            data: ['request' => $created],
            message: 'Schedule change request submitted for administrator review.',
            status: 201,
        );
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $cancelled = $this->riderScheduleService->cancelRequest(
            user: $request->user(),
            requestId: $id,
            request: $request,
        );

        return ApiResponse::success(
            data: ['request' => $cancelled],
            message: 'Pending schedule change request cancelled.',
        );
    }
}
