<?php

namespace App\Features\Restaurants\Controllers;

use App\Features\Restaurants\Requests\UpdateOwnerAcceptingStatusRequest;
use App\Features\Restaurants\Requests\UpdateOwnerMediaRequest;
use App\Features\Restaurants\Requests\UpdateOwnerOperatingHoursRequest;
use App\Features\Restaurants\Requests\UpdateOwnerProfileRequest;
use App\Features\Restaurants\Services\OwnerProfileService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OwnerProfileController extends Controller
{
    public function __construct(
        private readonly OwnerProfileService $ownerProfileService,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        return ApiResponse::success(
            data: ['profile' => $this->ownerProfileService->getProfile($request->user(), $restaurantId)],
            message: 'Restaurant profile retrieved.',
        );
    }

    public function update(UpdateOwnerProfileRequest $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: ['profile' => $this->ownerProfileService->updateProfile($request->user(), $validated, $restaurantId, $request)],
            message: 'Restaurant profile updated.',
        );
    }

    public function updateMedia(UpdateOwnerMediaRequest $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: [
                'profile' => $this->ownerProfileService->updateMedia(
                    user: $request->user(),
                    restaurantId: $restaurantId,
                    logoFile: $request->file('logo_image'),
                    coverFile: $request->file('cover_image'),
                    removeLogo: (bool) ($validated['remove_logo'] ?? false),
                    removeCover: (bool) ($validated['remove_cover'] ?? false),
                    request: $request,
                ),
            ],
            message: 'Restaurant branding updated.',
        );
    }

    public function updateAcceptingStatus(UpdateOwnerAcceptingStatusRequest $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: ['profile' => $this->ownerProfileService->updateAcceptingStatus($request->user(), $validated, $restaurantId, $request)],
            message: 'Accepting status updated.',
        );
    }

    public function operatingHours(Request $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        return ApiResponse::success(
            data: $this->ownerProfileService->getOperatingHours($request->user(), $restaurantId),
            message: 'Operating hours retrieved.',
        );
    }

    public function updateOperatingHours(UpdateOwnerOperatingHoursRequest $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: $this->ownerProfileService->updateOperatingHours(
                user: $request->user(),
                rows: $validated['operating_hours'],
                restaurantId: $restaurantId,
                request: $request,
            ),
            message: 'Operating hours updated.',
        );
    }

    public function settings(Request $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        return ApiResponse::success(
            data: $this->ownerProfileService->getSettings($request->user(), $restaurantId),
            message: 'Restaurant settings retrieved.',
        );
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validate([
            'offers_delivery' => ['sometimes', 'boolean'],
            'offers_pickup' => ['sometimes', 'boolean'],
            'offers_dine_in' => ['sometimes', 'boolean'],
            'accepts_reservations' => ['sometimes', 'boolean'],
            'accepting_orders' => ['sometimes', 'boolean'],
            'accepting_reservations' => ['sometimes', 'boolean'],
            'inventory_deduction_mode' => ['sometimes', 'string', 'in:manual,on_completion'],
            'delivery_radius' => ['sometimes', 'nullable', 'numeric', 'min:0.5', 'max:100'],
            'reservation_min_notice_hours' => ['sometimes', 'integer', 'min:0', 'max:168'],
            'reservation_max_party_size' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'reservation_notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'reservation_duration_minutes' => [
                'sometimes',
                'integer',
                'min:30',
                'max:240',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (((int) $value) % 15 !== 0) {
                        $fail('Reservation duration must be a multiple of 15 minutes.');
                    }
                },
            ],
            'reservation_max_advance_days' => ['sometimes', 'integer', 'min:1', 'max:365'],
            'reservation_cancellation_cutoff_minutes' => ['sometimes', 'integer', 'min:0', 'max:1440'],
            'reservation_pending_expiry_minutes' => ['sometimes', 'integer', 'min:15', 'max:1440'],
            'reservation_auto_confirm' => ['sometimes', 'boolean'],
            'reservation_deposit_required' => ['sometimes', 'boolean'],
            'reservation_deposit_amount' => ['sometimes', 'numeric', 'min:0', 'max:100000', 'regex:/^\d+(\.\d{1,2})?$/'],
            'reservation_service_fee' => ['sometimes', 'numeric', 'min:0', 'max:100000', 'regex:/^\d+(\.\d{1,2})?$/'],
        ]);

        return ApiResponse::success(
            data: $this->ownerProfileService->updateSettings($request->user(), $validated, $restaurantId, $request),
            message: 'Restaurant settings updated.',
        );
    }

    private function resolveRestaurantId(Request $request): ?int
    {
        $val = $request->input('restaurant_id') ?? $request->query('restaurant_id');

        return is_numeric($val) ? (int) $val : null;
    }
}
