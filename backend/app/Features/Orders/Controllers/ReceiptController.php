<?php

namespace App\Features\Orders\Controllers;

use App\Features\Orders\Services\ReceiptService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReceiptController extends Controller
{
    public function __construct(
        private readonly ReceiptService $receiptService,
    ) {}

    public function customerShow(Request $request, int $id): JsonResponse
    {
        return ApiResponse::success(
            data: ['receipt' => $this->receiptService->getCustomerReceipt($request->user(), $id)],
            message: 'Customer receipt retrieved.',
        );
    }

    public function restaurantShow(Request $request, int $id): JsonResponse
    {
        $rawRestaurantId = $request->header('X-Restaurant-Id') ?? $request->query('restaurant_id');
        $restaurantId = is_numeric($rawRestaurantId) ? (int) $rawRestaurantId : null;

        return ApiResponse::success(
            data: ['receipt' => $this->receiptService->getRestaurantReceipt($request->user(), $id, $restaurantId)],
            message: 'Restaurant receipt retrieved.',
        );
    }

    public function riderShow(Request $request, int $orderId): JsonResponse
    {
        return ApiResponse::success(
            data: ['receipt' => $this->receiptService->getRiderReceipt($request->user(), $orderId)],
            message: 'Rider receipt retrieved.',
        );
    }
}
