<?php

namespace App\Features\Admin\Controllers;

use App\Features\Admin\Requests\ListAdminOrdersRequest;
use App\Features\Admin\Services\AdminOrderService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;

class AdminOrderController extends Controller
{
    public function __construct(
        private readonly AdminOrderService $adminOrderService,
    ) {}

    public function index(ListAdminOrdersRequest $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->adminOrderService->listOrders($request->validated()),
            message: 'Orders retrieved.',
        );
    }
}
