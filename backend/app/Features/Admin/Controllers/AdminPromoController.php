<?php

namespace App\Features\Admin\Controllers;

use App\Features\Admin\Services\AdminPromoService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminPromoController extends Controller
{
    public function __construct(
        private readonly AdminPromoService $adminPromoService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->adminPromoService->listPromos($request->query()),
            message: 'Promos retrieved.',
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'promo_code' => ['nullable', 'string', 'max:50'],
            'auto_apply' => ['sometimes', 'boolean'],
            'promo_name' => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:255'],
            'discount_type' => ['required', 'string', 'in:percentage,fixed_amount'],
            'funding_source' => ['sometimes', 'string', 'in:platform,restaurant,joint,provider'],
            'platform_share_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'restaurant_share_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'discount_value' => ['required', 'numeric', 'gt:0'],
            'minimum_order_amount' => ['nullable', 'numeric', 'min:0'],
            'maximum_discount' => ['nullable', 'numeric', 'min:0'],
            'restaurant_id' => ['nullable', 'integer', 'min:1'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['required', 'date'],
            'usage_limit' => ['nullable', 'integer', 'min:1'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        return ApiResponse::success(
            data: ['promo' => $this->adminPromoService->createPromo($validated, $request->user(), $request)],
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
        ]);

        return ApiResponse::success(
            data: ['promo' => $this->adminPromoService->updatePromo($id, $validated, $request->user(), $request)],
            message: 'Promo updated.',
        );
    }

    public function validateForCustomer(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'promo_code' => ['required', 'string', 'max:50'],
            'subtotal' => ['required', 'numeric', 'min:0'],
            'restaurant_id' => ['nullable', 'integer', 'min:1'],
        ]);

        return ApiResponse::success(
            data: [
                'promo' => $this->adminPromoService->validateCodeForCustomer(
                    promoCode: (string) $validated['promo_code'],
                    subtotal: (float) $validated['subtotal'],
                    restaurantId: isset($validated['restaurant_id']) ? (int) $validated['restaurant_id'] : null,
                ),
            ],
            message: 'Promo code is valid.',
        );
    }
}
