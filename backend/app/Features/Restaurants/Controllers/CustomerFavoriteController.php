<?php

namespace App\Features\Restaurants\Controllers;

use App\Features\Restaurants\Services\CustomerFavoriteService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerFavoriteController extends Controller
{
    public function __construct(
        private readonly CustomerFavoriteService $favoriteService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->favoriteService->listFavorites($request->user()),
            message: 'Customer favorites retrieved.',
        );
    }

    public function store(Request $request, int $restaurantId): JsonResponse
    {
        return ApiResponse::success(
            data: $this->favoriteService->addFavorite($request->user(), $restaurantId),
            message: 'Restaurant added to favorites.',
        );
    }

    public function destroy(Request $request, int $restaurantId): JsonResponse
    {
        return ApiResponse::success(
            data: $this->favoriteService->removeFavorite($request->user(), $restaurantId),
            message: 'Restaurant removed from favorites.',
        );
    }
}
