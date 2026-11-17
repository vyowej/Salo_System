<?php

namespace App\Features\Restaurants\Controllers;

use App\Features\Restaurants\Services\OwnerMenuService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

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

    public function storeCategory(Request $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        $validated = $request->validate([
            'restaurant_id' => ['nullable', 'integer'],
            'category_name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:255'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        return ApiResponse::success(
            data: ['category' => $this->ownerMenuService->createCategory($request->user(), $validated, $restaurantId, $request)],
            message: 'Menu category created.',
            status: 201,
        );
    }

    public function updateCategory(Request $request, int $categoryId): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        $validated = $request->validate([
            'restaurant_id' => ['nullable', 'integer'],
            'category_name' => ['sometimes', 'required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:255'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        return ApiResponse::success(
            data: ['category' => $this->ownerMenuService->updateCategory($request->user(), $categoryId, $validated, $restaurantId, $request)],
            message: 'Menu category updated.',
        );
    }

    public function reorderCategories(Request $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        $validated = $request->validate([
            'restaurant_id' => ['nullable', 'integer'],
            'ordered_ids' => ['required', 'array', 'min:1'],
            'ordered_ids.*' => ['integer'],
        ]);

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

    public function items(Request $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        return ApiResponse::success(
            data: ['items' => $this->ownerMenuService->listItems($request->user(), $restaurantId)],
            message: 'Menu items retrieved.',
        );
    }

    public function storeItem(Request $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $maxKb = max(256, (int) config('salo.uploads.max_size_kb', 5120));
        $imgMimes = implode(',', (array) config('salo.uploads.allowed_image_types', ['jpg', 'jpeg', 'png', 'webp']));

        $validated = $request->validate([
            'restaurant_id' => ['nullable', 'integer'],
            'menu_category_id' => ['required', 'integer'],
            'item_name' => ['required', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:2000'],
            'base_price' => ['required', 'numeric', 'gt:0', 'max:999999.99', 'regex:/^\d+(\.\d{1,2})?$/'],
            'availability_status' => ['nullable', 'string', Rule::in(['available', 'temporarily_unavailable', 'sold_out', 'hidden'])],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'photo' => ['nullable', 'file', "mimes:{$imgMimes}", "max:{$maxKb}"],
        ]);

        return ApiResponse::success(
            data: ['item' => $this->ownerMenuService->createItem($request->user(), $validated, $request->file('photo'), $restaurantId, $request)],
            message: 'Menu item created.',
            status: 201,
        );
    }

    public function updateItem(Request $request, int $itemId): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $maxKb = max(256, (int) config('salo.uploads.max_size_kb', 5120));
        $imgMimes = implode(',', (array) config('salo.uploads.allowed_image_types', ['jpg', 'jpeg', 'png', 'webp']));

        $validated = $request->validate([
            'restaurant_id' => ['nullable', 'integer'],
            'menu_category_id' => ['sometimes', 'required', 'integer'],
            'item_name' => ['sometimes', 'required', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:2000'],
            'base_price' => ['sometimes', 'required', 'numeric', 'gt:0', 'max:999999.99', 'regex:/^\d+(\.\d{1,2})?$/'],
            'availability_status' => ['sometimes', 'string', Rule::in(['available', 'temporarily_unavailable', 'sold_out', 'hidden'])],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'photo' => ['nullable', 'file', "mimes:{$imgMimes}", "max:{$maxKb}"],
            'remove_photo' => ['nullable', 'boolean'],
        ]);

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

    public function updateItemAvailability(Request $request, int $itemId): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        $validated = $request->validate([
            'restaurant_id' => ['nullable', 'integer'],
            'availability_status' => ['required', 'string', Rule::in(['available', 'temporarily_unavailable', 'sold_out', 'hidden'])],
        ]);

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

    private function resolveRestaurantId(Request $request): ?int
    {
        $val = $request->input('restaurant_id') ?? $request->query('restaurant_id');

        return is_numeric($val) ? (int) $val : null;
    }
}
