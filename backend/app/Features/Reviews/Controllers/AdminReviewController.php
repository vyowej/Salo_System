<?php

namespace App\Features\Reviews\Controllers;

use App\Features\Reviews\Requests\ModerateReviewRequest;
use App\Features\Reviews\Requests\OverrideFeaturedRestaurantRequest;
use App\Features\Reviews\Services\FeaturedRestaurantService;
use App\Features\Reviews\Services\PlatformSettingsService;
use App\Features\Reviews\Services\ReviewModerationService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminReviewController extends Controller
{
    public function __construct(
        private readonly ReviewModerationService $moderationService,
        private readonly FeaturedRestaurantService $featuredService,
        private readonly PlatformSettingsService $settingsService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $data = $this->moderationService->listAdminReviews([
            'type' => $request->query('type', 'restaurant'),
            'status' => $request->query('status', 'all'),
            'rating' => $request->query('rating'),
            'days' => $request->query('days'),
            'search' => $request->query('search', ''),
            'page' => $request->query('page', 1),
            'per_page' => $request->query('per_page', 15),
        ]);

        return ApiResponse::success(
            data: $data,
            message: 'Admin reviews retrieved.',
        );
    }

    public function moderate(ModerateReviewRequest $request, string $type, int $id): JsonResponse
    {
        $validated = $request->validated();
        $data = $this->moderationService->moderateReview(
            admin: $request->user(),
            type: $type,
            reviewId: $id,
            action: $validated['action'],
            reason: $validated['reason'] ?? null,
            request: $request,
        );

        return ApiResponse::success(
            data: ['review' => $data],
            message: 'Review moderation action applied.',
        );
    }

    public function featuredOverview(): JsonResponse
    {
        return ApiResponse::success(
            data: $this->featuredService->getAdminOverview(),
            message: 'Featured restaurant overview retrieved.',
        );
    }

    public function evaluateFeatured(): JsonResponse
    {
        $result = $this->featuredService->runAutomaticSelection();

        return ApiResponse::success(
            data: $result,
            message: $result['message'],
        );
    }

    public function overrideFeatured(OverrideFeaturedRestaurantRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $week = $this->featuredService->adminOverrideSelection(
            admin: $request->user(),
            restaurantId: (int) $validated['restaurant_id'],
            reason: (string) $validated['reason'],
            request: $request,
        );

        return ApiResponse::success(
            data: ['featured_week' => $week],
            message: 'Featured restaurant overridden successfully.',
        );
    }

    public function getSettings(): JsonResponse
    {
        return ApiResponse::success(
            data: ['settings' => $this->settingsService->getReviewsAndFeaturedSettings()],
            message: 'Review and featured policy settings retrieved.',
        );
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $settings = $this->settingsService->updateSettings(
            admin: $request->user(),
            input: $request->all(),
            request: $request,
        );

        return ApiResponse::success(
            data: ['settings' => $settings],
            message: 'Policy settings updated successfully.',
        );
    }
}
