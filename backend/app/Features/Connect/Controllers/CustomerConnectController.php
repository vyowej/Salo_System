<?php

namespace App\Features\Connect\Controllers;

use App\Features\Connect\Services\OrderConnectService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerConnectController extends Controller
{
    public function __construct(
        private readonly OrderConnectService $connectService,
    ) {}

    public function respondToCall(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'action' => ['required', 'string', 'in:accept,decline'],
        ]);

        $state = $this->connectService->respondToCall(
            customerUser: $request->user(),
            orderId: $id,
            action: (string) $validated['action'],
            request: $request,
        );

        return ApiResponse::success(
            data: $state,
            message: $validated['action'] === 'accept'
                ? 'Call accepted. Your rider has been notified.'
                : 'Call declined.',
        );
    }
}
