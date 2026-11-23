<?php

namespace App\Features\Restaurants\Controllers;

use App\Features\Restaurants\Requests\ReorderMenuCategoriesRequest;
use App\Features\Restaurants\Requests\StoreMenuCategoryRequest;
use App\Features\Restaurants\Requests\StoreMenuItemRequest;
use App\Features\Restaurants\Requests\UpdateMenuCategoryRequest;
use App\Features\Restaurants\Requests\UpdateMenuItemAvailabilityRequest;
use App\Features\Restaurants\Requests\UpdateMenuItemRequest;
use App\Features\Restaurants\Services\OwnerMenuService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OwnerMenuController extends Controller
{
    public function __construct(
        private readonly OwnerMenuService $ownerMenuService,
    ) {}

    public function categories(Request $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        return ApiResponse::success(
            data: ['categories' => $this->ownerMenuService->listCategories($request->user(), $restaurantId)],
            message: 'Menu categories retrieved.',
        );
    }

    public function storeCategory(StoreMenuCategoryRequest $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: ['category' => $this->ownerMenuService->createCategory($request->user(), $validated, $restaurantId, $request)],
            message: 'Menu category created.',
            status: 201,
        );
    }

    public function updateCategory(UpdateMenuCategoryRequest $request, int $categoryId): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: ['category' => $this->ownerMenuService->updateCategory($request->user(), $categoryId, $validated, $restaurantId, $request)],
            message: 'Menu category updated.',
        );
    }

    public function reorderCategories(ReorderMenuCategoriesRequest $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: ['categories' => $this->ownerMenuService->reorderCategories($request->user(), $validated['ordered_ids'], $restaurantId, $request)],
            message: 'Menu categories reordered.',
        );
    }

    public function destroyCategory(Request $request, int $categoryId): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $this->ownerMenuService->deleteCategory($request->user(), $categoryId, $restaurantId, $request);

        return ApiResponse::success(
            data: null,
            message: 'Menu category deleted.',
        );
    }

    public function restoreCategory(Request $request, int $categoryId): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        return ApiResponse::success(
            data: ['category' => $this->ownerMenuService->restoreCategory($request->user(), $categoryId, $restaurantId, $request)],
            message: 'Menu category restored.',
        );
    }

    public function items(Request $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        return ApiResponse::success(
            data: ['items' => $this->ownerMenuService->listItems($request->user(), $restaurantId)],
            message: 'Menu items retrieved.',
        );
    }

    public function storeItem(StoreMenuItemRequest $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: ['item' => $this->ownerMenuService->createItem($request->user(), $validated, $request->file('photo'), $restaurantId, $request)],
            message: 'Menu item created.',
            status: 201,
        );
    }

    public function updateItem(UpdateMenuItemRequest $request, int $itemId): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: [
                'item' => $this->ownerMenuService->updateItem(
                    user: $request->user(),
                    itemId: $itemId,
                    validated: $validated,
                    photoFile: $request->file('photo'),
                    removePhoto: (bool) ($validated['remove_photo'] ?? false),
                    restaurantId: $restaurantId,
                    request: $request,
                ),
            ],
            message: 'Menu item updated.',
        );
    }

    public function updateItemAvailability(UpdateMenuItemAvailabilityRequest $request, int $itemId): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: [
                'item' => $this->ownerMenuService->updateItemAvailability(
                    user: $request->user(),
                    itemId: $itemId,
                    availabilityStatus: (string) $validated['availability_status'],
                    restaurantId: $restaurantId,
                    request: $request,
                ),
            ],
            message: 'Menu item availability updated.',
        );
    }

    public function destroyItem(Request $request, int $itemId): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $this->ownerMenuService->deleteItem($request->user(), $itemId, $restaurantId, $request);

        return ApiResponse::success(
            data: null,
            message: 'Menu item deleted.',
        );
    }

    public function restoreItem(Request $request, int $itemId): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        return ApiResponse::success(
            data: ['item' => $this->ownerMenuService->restoreItem($request->user(), $itemId, $restaurantId, $request)],
            message: 'Menu item restored.',
        );
    }

    public function syncItemAddOns(Request $request, int $itemId): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $groups = $request->input('groups', []);
        if (! is_array($groups)) {
            $groups = [];
        }

        return ApiResponse::success(
            data: ['item' => $this->ownerMenuService->syncAddOnGroups($request->user(), $itemId, $groups, $restaurantId, $request)],
            message: 'Menu item add-ons updated.',
        );
    }

    private function resolveRestaurantId(Request $request): ?int
    {
        $val = $request->input('restaurant_id') ?? $request->query('restaurant_id');

        return is_numeric($val) ? (int) $val : null;
    }
}
