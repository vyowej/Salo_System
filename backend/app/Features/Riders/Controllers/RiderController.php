<?php

namespace App\Features\Riders\Controllers;

use App\Features\Riders\Services\RiderService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

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

    public function updateProfile(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'emergency_contact_name' => ['sometimes', 'string', 'max:150'],
            'emergency_contact_relationship' => ['sometimes', 'string', Rule::in(['parent', 'spouse_partner', 'sibling', 'child', 'relative', 'friend', 'colleague', 'other'])],
            'emergency_contact_phone' => ['sometimes', 'string', 'max:30'],
            'emergency_contact_alt_phone' => ['nullable', 'string', 'max:30'],
            'preferred_hubs' => ['nullable', 'string', 'max:255'],
            'preferred_shifts' => ['nullable', 'array'],
            'preferred_shifts.*' => ['string', Rule::in(['breakfast', 'lunch', 'afternoon', 'dinner', 'late_night', 'flexible'])],
            'available_days' => ['nullable', 'array'],
            'available_days.*' => ['string', Rule::in(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])],
        ]);

        return ApiResponse::success(
            data: ['profile' => $this->riderService->updateProfile($request->user(), $validated, $request)],
            message: 'Rider profile updated.',
        );
    }

    public function updateAvailability(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', Rule::in(RiderService::AVAILABILITY_STATUSES)],
        ]);

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
