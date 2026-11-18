<?php

namespace App\Features\Restaurants\Controllers;

use App\Features\Restaurants\Services\OwnerInventoryService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OwnerInventoryController extends Controller
{
    public function __construct(
        private readonly OwnerInventoryService $ownerInventoryService,
    ) {}

    public function showConfig(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'restaurant_id' => ['nullable', 'integer', 'min:1'],
        ]);

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

    public function updateConfig(Request $request): JsonResponse
    {
        $allowedModes = (array) config('salo.inventory.deduction_modes', ['manual', 'on_completion']);

        $validated = $request->validate([
            'restaurant_id' => ['nullable', 'integer', 'min:1'],
            'deduction_mode' => ['required', 'string', Rule::in($allowedModes)],
        ]);

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
}
