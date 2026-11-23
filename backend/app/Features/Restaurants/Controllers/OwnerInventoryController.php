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
            'availability_status' => ['required', 'string', 'in:available,temporarily_unavailable,sold_out'],
            'restaurant_id' => ['nullable', 'integer', 'min:1'],
        ]);

        $restaurantId = isset($validated['restaurant_id'])
            ? (int) $validated['restaurant_id']
            : (is_numeric($request->header('X-Restaurant-Id')) ? (int) $request->header('X-Restaurant-Id') : null);

        return ApiResponse::success(
            data: [
                'item' => $this->ownerInventoryService->updateItemAvailability(
                    user: $request->user(),
                    itemId: $itemId,
                    availabilityStatus: (string) $validated['availability_status'],
                    restaurantId: $restaurantId,
                    request: $request,
                ),
            ],
            message: 'Inventory item availability updated.',
        );
    }
}
