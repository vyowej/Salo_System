<?php

namespace App\Features\Restaurants\Controllers;

use App\Features\Restaurants\Services\OwnerReportsService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OwnerReportsController extends Controller
{
    public function __construct(
        private readonly OwnerReportsService $ownerReportsService,
    ) {}

    public function sales(Request $request): JsonResponse
    {
        $q = $request->query('restaurant_id');
        $restaurantId = is_numeric($q)
            ? (int) $q
            : (is_numeric($request->header('X-Restaurant-Id')) ? (int) $request->header('X-Restaurant-Id') : null);

        return ApiResponse::success(
            data: $this->ownerReportsService->salesReport($request->user(), $request->query(), $restaurantId),
            message: 'Sales report retrieved.',
        );
    }
}
