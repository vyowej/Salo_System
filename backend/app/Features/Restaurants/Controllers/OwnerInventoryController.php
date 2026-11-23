<?php

namespace App\Features\Restaurants\Controllers;

use App\Features\Restaurants\Requests\ShowOwnerInventoryConfigRequest;
use App\Features\Restaurants\Requests\UpdateOwnerInventoryConfigRequest;
use App\Features\Restaurants\Services\OwnerInventoryService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OwnerInventoryController extends Controller
{
    public function __construct(
        private readonly OwnerInventoryService $ownerInventoryService,
    ) {}

    public function showConfig(ShowOwnerInventoryConfigRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $restaurantId = isset($validated['restaurant_id'])
            ? (int) $validated['restaurant_id']
            : null;

        return ApiResponse::success(
            data: [
                'config' => $this->ownerInventoryService->getConfig(
                    user: $request->user(),
                    restaurantId: $restaurantId,
                ),
            ],
            message: 'Inventory configuration retrieved.',
        );
    }

    public function updateConfig(UpdateOwnerInventoryConfigRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $restaurantId = isset($validated['restaurant_id'])
            ? (int) $validated['restaurant_id']
            : null;

        return ApiResponse::success(
            data: [
                'config' => $this->ownerInventoryService->updateConfig(
                    user: $request->user(),
                    deductionMode: (string) $validated['deduction_mode'],
                    restaurantId: $restaurantId,
                    request: $request,
                ),
            ],
            message: 'Inventory configuration updated.',
        );
    }

    public function updateItem(Request $request, int $itemId): JsonResponse
    {
        $validated = $request->validate([
            'availability_status' => ['nullable', 'string', 'in:available,temporarily_unavailable,sold_out'],
            'stock_quantity' => ['nullable', 'integer', 'min:0'],
            'low_stock_threshold' => ['nullable', 'integer', 'min:0'],
            'reason' => ['nullable', 'string', 'max:255'],
            'restaurant_id' => ['nullable', 'integer', 'min:1'],
        ]);

        if (
            ! $request->has('availability_status')
            && ! $request->has('stock_quantity')
            && ! $request->has('low_stock_threshold')
        ) {
            $request->validate([
                'availability_status' => ['required', 'string', 'in:available,temporarily_unavailable,sold_out'],
            ]);
        }

        $restaurantId = isset($validated['restaurant_id'])
            ? (int) $validated['restaurant_id']
            : (is_numeric($request->header('X-Restaurant-Id')) ? (int) $request->header('X-Restaurant-Id') : null);

        return ApiResponse::success(
            data: [
                'item' => $this->ownerInventoryService->updateItemAvailability(
                    user: $request->user(),
                    itemId: $itemId,
                    availabilityStatus: isset($validated['availability_status']) ? (string) $validated['availability_status'] : null,
                    restaurantId: $restaurantId,
                    request: $request,
                    hasStockQuantity: $request->has('stock_quantity'),
                    stockQuantity: isset($validated['stock_quantity']) ? (int) $validated['stock_quantity'] : null,
                    hasLowStockThreshold: $request->has('low_stock_threshold'),
                    lowStockThreshold: isset($validated['low_stock_threshold']) ? (int) $validated['low_stock_threshold'] : null,
                    reason: isset($validated['reason']) ? (string) $validated['reason'] : null,
                ),
            ],
            message: 'Inventory item updated.',
        );
    }
}
