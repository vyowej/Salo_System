<?php

namespace App\Features\Reviews\Controllers;

use App\Features\Reviews\Services\ReviewModerationService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RiderReviewController extends Controller
{
    public function __construct(
        private readonly ReviewModerationService $moderationService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $data = $this->moderationService->listMyRiderFeedback($request->user(), [
            'rating' => $request->query('rating'),
            'days' => $request->query('days'),
            'page' => $request->query('page', 1),
            'per_page' => $request->query('per_page', 10),
        ]);

        return ApiResponse::success(
            data: $data,
            message: 'Rider feedback retrieved.',
        );
    }
}
