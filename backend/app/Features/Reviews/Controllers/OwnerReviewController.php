<?php

namespace App\Features\Reviews\Controllers;

use App\Features\Reviews\Requests\FlagReviewRequest;
use App\Features\Reviews\Services\ReviewModerationService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OwnerReviewController extends Controller
{
    public function __construct(
        private readonly ReviewModerationService $moderationService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $data = $this->moderationService->listRestaurantFeedback($request->user(), [
            'restaurant_id' => $request->query('restaurant_id'),
            'rating' => $request->query('rating'),
            'days' => $request->query('days'),
            'page' => $request->query('page', 1),
            'per_page' => $request->query('per_page', 15),
        ]);

        return ApiResponse::success(
            data: $data,
            message: 'Restaurant feedback retrieved.',
        );
    }

    public function flag(FlagReviewRequest $request, int $reviewId): JsonResponse
    {
        $data = $this->moderationService->flagRestaurantReview(
            user: $request->user(),
            reviewId: $reviewId,
            reason: (string) $request->validated('reason'),
            request: $request,
        );

        return ApiResponse::success(
            data: $data,
            message: 'Review flagged for admin moderation.',
        );
    }
}
