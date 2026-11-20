<?php

namespace App\Features\Riders\Controllers;

use App\Features\Riders\Requests\UpdateRiderAvailabilityRequest;
use App\Features\Riders\Requests\UpdateRiderProfileRequest;
use App\Features\Riders\Services\RiderService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RiderController extends Controller
{
    public function __construct(
        private readonly RiderService $riderService,
    ) {}

    public function dashboard(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->riderService->getDashboard($request->user()),
            message: 'Rider dashboard retrieved.',
        );
    }

    public function profile(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: ['profile' => $this->riderService->getProfile($request->user())],
            message: 'Rider profile retrieved.',
        );
    }

    public function updateProfile(UpdateRiderProfileRequest $request): JsonResponse
    {
        return ApiResponse::success(
            data: ['profile' => $this->riderService->updateProfile($request->user(), $request->validated(), $request)],
            message: 'Rider profile updated.',
        );
    }

    public function updateAvailability(UpdateRiderAvailabilityRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $availability = $this->riderService->updateAvailability(
            user: $request->user(),
            status: (string) $validated['status'],
            request: $request,
        );

        return ApiResponse::success(
            data: ['availability' => $availability],
            message: 'Rider availability updated.',
        );
    }
}
