<?php

namespace App\Features\Restaurants\Controllers;

use App\Features\Restaurants\Services\RestaurantService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RestaurantController extends Controller
{
    public function __construct(
        private readonly RestaurantService $restaurantService,
    ) {}

    public function categories(): JsonResponse
    {
        return ApiResponse::success(
            data: ['categories' => $this->restaurantService->getActiveCategories()],
            message: 'Restaurant categories retrieved.',
        );
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->only([
            'page',
            'per_page',
            'search',
            'category',
            'offers_delivery',
            'offers_pickup',
            'offers_dine_in',
            'sort',
        ]);

        return ApiResponse::success(
            data: $this->restaurantService->listRestaurants($filters),
            message: 'Restaurants retrieved.',
        );
    }

    public function show(int $id): JsonResponse
    {
        return ApiResponse::success(
            data: ['restaurant' => $this->restaurantService->getRestaurantDetails($id)],
            message: 'Restaurant details retrieved.',
        );
    }

    public function menu(int $id): JsonResponse
    {
        return ApiResponse::success(
            data: $this->restaurantService->getRestaurantMenu($id),
            message: 'Restaurant menu retrieved.',
        );
    }
}
