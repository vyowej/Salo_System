<?php

namespace App\Features\Reviews\Controllers;

use App\Features\Reviews\Requests\SubmitReviewRequest;
use App\Features\Reviews\Services\CustomerReviewService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerReviewController extends Controller
{
    public function __construct(
        private readonly CustomerReviewService $customerReviewService,
    ) {}

    public function showOrderReviews(Request $request, int $id): JsonResponse
    {
        $data = $this->customerReviewService->getOrderReviewStatus($request->user(), $id);

        return ApiResponse::success(
            data: $data,
            message: 'Order review status retrieved.',
        );
    }

    public function storeRestaurantReview(SubmitReviewRequest $request, int $id): JsonResponse
    {
        $data = $this->customerReviewService->submitRestaurantReview(
            customer: $request->user(),
            orderId: $id,
            data: $request->validated(),
        );

        return ApiResponse::success(
            data: $data,
            message: 'Restaurant review submitted successfully.',
            status: 201,
        );
    }

    public function storeRiderReview(SubmitReviewRequest $request, int $id): JsonResponse
    {
        $data = $this->customerReviewService->submitRiderReview(
            customer: $request->user(),
            orderId: $id,
            data: $request->validated(),
        );

        return ApiResponse::success(
            data: $data,
            message: 'Rider review submitted successfully.',
            status: 201,
        );
    }
}
