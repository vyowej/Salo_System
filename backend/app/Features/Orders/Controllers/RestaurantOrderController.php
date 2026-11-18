<?php

namespace App\Features\Orders\Controllers;

use App\Features\Orders\Services\RestaurantOrderService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RestaurantOrderController extends Controller
{
    public function __construct(
        private readonly RestaurantOrderService $restaurantOrderService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->restaurantOrderService->listOrders($request->user(), $request->query()),
            message: 'Restaurant orders retrieved.',
        );
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        return ApiResponse::success(
            data: ['order' => $this->restaurantOrderService->getOrderDetail($request->user(), $id, $restaurantId)],
            message: 'Restaurant order details retrieved.',
        );
    }

    public function accept(Request $request, int $id): JsonResponse
    {
        return $this->handleTransition($request, $id, 'accept', 'Order accepted.');
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'restaurant_id' => ['nullable', 'integer'],
            'reason' => ['required', 'string', 'max:255'],
        ]);

        $order = $this->restaurantOrderService->transitionStatus(
            user: $request->user(),
            orderId: $id,
            action: 'reject',
            reason: (string) $validated['reason'],
            restaurantId: $this->resolveRestaurantId($request),
            request: $request,
        );

        return ApiResponse::success(
            data: ['order' => $order],
            message: 'Order rejected.',
        );
    }

    public function prepare(Request $request, int $id): JsonResponse
    {
        return $this->handleTransition($request, $id, 'prepare', 'Order marked as preparing.');
    }

    public function ready(Request $request, int $id): JsonResponse
    {
        return $this->handleTransition($request, $id, 'ready', 'Order marked as ready.');
    }

    public function complete(Request $request, int $id): JsonResponse
    {
        return $this->handleTransition($request, $id, 'complete', 'Pickup order completed.');
    }

    private function handleTransition(Request $request, int $id, string $action, string $message): JsonResponse
    {
        $order = $this->restaurantOrderService->transitionStatus(
            user: $request->user(),
            orderId: $id,
            action: $action,
            reason: null,
            restaurantId: $this->resolveRestaurantId($request),
            request: $request,
        );

        return ApiResponse::success(
            data: ['order' => $order],
            message: $message,
        );
    }

    private function resolveRestaurantId(Request $request): ?int
    {
        $val = $request->input('restaurant_id') ?? $request->query('restaurant_id');

        return is_numeric($val) ? (int) $val : null;
    }
}
