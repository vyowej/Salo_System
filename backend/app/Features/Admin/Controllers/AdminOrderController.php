<?php

namespace App\Features\Admin\Controllers;

use App\Features\Admin\Requests\ListAdminOrdersRequest;
use App\Features\Admin\Services\AdminOrderService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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

    public function show(int $id): JsonResponse
    {
        return ApiResponse::success(
            data: ['order' => $this->adminOrderService->getOrderDetail($id)],
            message: 'Order retrieved.',
        );
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'min:5', 'max:255'],
            'idempotency_key' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);

        $idempotencyKey = $validated['idempotency_key'] ?? $request->header('Idempotency-Key');

        $result = $this->adminOrderService->cancelOrder(
            orderId: $id,
            reason: (string) $validated['reason'],
            idempotencyKey: is_string($idempotencyKey) ? $idempotencyKey : null,
            admin: $request->user(),
            request: $request,
        );

        return ApiResponse::success(
            data: $result,
            message: $result['already_cancelled']
                ? 'Order was already cancelled.'
                : 'Order cancelled by administrator.',
        );
    }
}
