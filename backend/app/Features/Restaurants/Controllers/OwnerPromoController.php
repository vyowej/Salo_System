<?php

namespace App\Features\Restaurants\Controllers;

use App\Features\Restaurants\Services\OwnerPromoService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OwnerPromoController extends Controller
{
    public function __construct(
        private readonly OwnerPromoService $ownerPromoService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        return ApiResponse::success(
            data: $this->ownerPromoService->listPromos($request->user(), $request->query(), $restaurantId),
            message: 'Restaurant promos retrieved.',
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'promo_code' => ['required', 'string', 'max:50'],
            'promo_name' => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:255'],
            'discount_type' => ['required', 'string', 'in:percentage,fixed_amount'],
            'discount_value' => ['required', 'numeric', 'gt:0'],
            'minimum_order_amount' => ['nullable', 'numeric', 'min:0'],
            'maximum_discount' => ['nullable', 'numeric', 'min:0'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['required', 'date'],
            'usage_limit' => ['nullable', 'integer', 'min:1'],
            'is_active' => ['sometimes', 'boolean'],
            'restaurant_id' => ['nullable', 'integer', 'min:1'],
        ]);

        $restaurantId = isset($validated['restaurant_id'])
            ? (int) $validated['restaurant_id']
            : $this->resolveRestaurantId($request);

        return ApiResponse::success(
            data: ['promo' => $this->ownerPromoService->createPromo($request->user(), $validated, $restaurantId, $request)],
            message: 'Promo created.',
            status: 201,
        );
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'is_active' => ['sometimes', 'boolean'],
            'promo_name' => ['sometimes', 'string', 'max:150'],
            'usage_limit' => ['nullable', 'integer', 'min:1'],
            'restaurant_id' => ['nullable', 'integer', 'min:1'],
        ]);

        $restaurantId = isset($validated['restaurant_id'])
            ? (int) $validated['restaurant_id']
            : $this->resolveRestaurantId($request);

        return ApiResponse::success(
            data: ['promo' => $this->ownerPromoService->updatePromo($request->user(), $id, $validated, $restaurantId, $request)],
            message: 'Promo updated.',
        );
    }

    private function resolveRestaurantId(Request $request): ?int
    {
        $q = $request->query('restaurant_id');
        if (is_numeric($q)) {
            return (int) $q;
        }
        $h = $request->header('X-Restaurant-Id');

        return is_numeric($h) ? (int) $h : null;
    }
}
