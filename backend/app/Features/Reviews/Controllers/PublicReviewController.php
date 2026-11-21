<?php

namespace App\Features\Reviews\Controllers;

use App\Features\Reviews\Services\FeaturedRestaurantService;
use App\Features\Reviews\Services\ReviewAggregationService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use App\Support\PublicRestaurantVisibility;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class PublicReviewController extends Controller
{
    public function __construct(
        private readonly ReviewAggregationService $aggregationService,
        private readonly FeaturedRestaurantService $featuredService,
        private readonly PublicRestaurantVisibility $visibility,
    ) {}

    public function featuredRestaurant(): JsonResponse
    {
        $featured = $this->featuredService->getCurrentActiveFeatured();

        return ApiResponse::success(
            data: ['featured_restaurant' => $featured],
            message: 'Featured restaurant retrieved.',
        );
    }

    public function restaurantReviews(Request $request, int $id): JsonResponse
    {
        if (! $this->visibility->isVisible($id)) {
            throw new NotFoundHttpException('Restaurant not found.');
        }

        $days = $request->query('days');
        $daysInt = is_numeric($days) && (int) $days > 0 ? (int) $days : null;

        $summary = $this->aggregationService->getRestaurantRatingSummary($id, $daysInt);
        $list = $this->aggregationService->listPublishedRestaurantReviews($id, [
            'rating' => $request->query('rating'),
            'days' => $daysInt,
            'page' => $request->query('page', 1),
            'per_page' => $request->query('per_page', 10),
        ]);

        $featured = $this->featuredService->getCurrentActiveFeatured();

        return ApiResponse::success(
            data: [
                'rating_summary' => $summary,
                'reviews' => $list['reviews'],
                'pagination' => $list['pagination'],
                'is_featured_this_week' => $featured !== null && (int) $featured['restaurant_id'] === $id,
                'featured_week' => $featured !== null && (int) $featured['restaurant_id'] === $id ? $featured : null,
            ],
            message: 'Restaurant reviews retrieved.',
        );
    }
}
