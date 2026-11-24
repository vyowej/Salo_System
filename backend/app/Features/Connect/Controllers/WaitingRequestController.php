<?php

namespace App\Features\Connect\Controllers;

use App\Features\Connect\Services\WaitingRequestService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WaitingRequestController extends Controller
{
    public function __construct(
        private readonly WaitingRequestService $waitingRequestService,
    ) {}

    public function store(Request $request, int $id): JsonResponse
    {
        $data = $this->waitingRequestService->requestWait($request->user(), $id, $request);

        return ApiResponse::success(
            data: $data,
            message: 'Waiting request sent to your rider.',
            status: 201,
        );
    }

    public function respond(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'action' => ['required', 'string', 'in:accept,decline'],
        ]);

        $data = $this->waitingRequestService->respondToWaitRequest(
            riderUser: $request->user(),
            waitingRequestId: $id,
            action: (string) $validated['action'],
            request: $request,
        );

        return ApiResponse::success(
            data: $data,
            message: $validated['action'] === 'accept'
                ? 'Waiting request accepted.'
                : 'Waiting request declined.',
        );
    }
}
