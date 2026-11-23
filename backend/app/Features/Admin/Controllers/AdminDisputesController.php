<?php

namespace App\Features\Admin\Controllers;

use App\Features\Admin\Services\AdminDisputesService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminDisputesController extends Controller
{
    public function __construct(
        private readonly AdminDisputesService $adminDisputesService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->adminDisputesService->listDisputes($request->query()),
            message: 'Disputes retrieved.',
        );
    }

    public function resolve(Request $request, int $orderId): JsonResponse
    {
        $resolution = $this->adminDisputesService->resolveDispute(
            orderId: $orderId,
            action: (string) $request->input('action', ''),
            notes: $request->input('notes'),
            admin: $request->user(),
            request: $request,
        );

        return ApiResponse::success(
            data: ['resolution' => $resolution],
            message: 'Dispute resolved.',
        );
    }
}
