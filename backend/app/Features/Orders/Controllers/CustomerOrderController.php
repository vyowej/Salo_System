<?php

namespace App\Features\Orders\Controllers;

use App\Features\Orders\Requests\CheckoutRequest;
use App\Features\Orders\Services\CheckoutService;
use App\Features\Orders\Services\CustomerOrderService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerOrderController extends Controller
{
    public function __construct(
        private readonly CheckoutService $checkoutService,
        private readonly CustomerOrderService $customerOrderService,
    ) {}

    public function checkout(CheckoutRequest $request): JsonResponse
    {
        $result = $this->checkoutService->placeOrder(
            user: $request->user(),
            validated: $request->validated(),
            request: $request,
        );

        return ApiResponse::success(
            data: ['checkout' => $result],
            message: 'Order placed successfully.',
            status: 201,
        );
    }

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->customerOrderService->listOrders($request->user(), $request->query()),
            message: 'Orders retrieved.',
        );
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return ApiResponse::success(
            data: ['order' => $this->customerOrderService->getOrderDetail($request->user(), $id)],
            message: 'Order details retrieved.',
        );
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $order = $this->customerOrderService->cancelOrder(
            user: $request->user(),
            orderId: $id,
            reason: isset($validated['reason']) ? (string) $validated['reason'] : null,
            request: $request,
        );

        return ApiResponse::success(
            data: ['order' => $order],
            message: 'Order cancelled.',
        );
    }
}
