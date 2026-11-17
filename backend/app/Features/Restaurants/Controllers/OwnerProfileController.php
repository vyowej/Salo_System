<?php

namespace App\Features\Restaurants\Controllers;

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

    public function update(Request $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        $validated = $request->validate([
            'restaurant_id' => ['nullable', 'integer'],
            'description' => ['nullable', 'string', 'max:2000'],
            'contact_phone' => ['sometimes', 'required', 'string', 'max:30'],
            'business_email' => ['sometimes', 'required', 'string', 'email', 'max:255'],
            'offers_delivery' => ['sometimes', 'boolean'],
            'offers_pickup' => ['sometimes', 'boolean'],
        ]);

        return ApiResponse::success(
            data: ['profile' => $this->ownerProfileService->updateProfile($request->user(), $validated, $restaurantId, $request)],
            message: 'Restaurant profile updated.',
        );
    }

    public function updateMedia(Request $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $maxKb = max(256, (int) config('salo.uploads.max_size_kb', 5120));
        $imgMimes = implode(',', (array) config('salo.uploads.allowed_image_types', ['jpg', 'jpeg', 'png', 'webp']));

        $validated = $request->validate([
            'restaurant_id' => ['nullable', 'integer'],
            'logo_image' => ['nullable', 'file', "mimes:{$imgMimes}", "max:{$maxKb}"],
            'cover_image' => ['nullable', 'file', "mimes:{$imgMimes}", "max:{$maxKb}"],
            'remove_logo' => ['nullable', 'boolean'],
            'remove_cover' => ['nullable', 'boolean'],
        ]);

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

    public function updateAcceptingStatus(Request $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        $validated = $request->validate([
            'restaurant_id' => ['nullable', 'integer'],
            'accepting_orders' => ['sometimes', 'boolean'],
            'accepting_reservations' => ['sometimes', 'boolean'],
        ]);

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

    public function updateOperatingHours(Request $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        $validated = $request->validate([
            'restaurant_id' => ['nullable', 'integer'],
            'operating_hours' => ['required', 'array', 'min:1', 'max:35'],
            'operating_hours.*.day_of_week' => ['required', 'integer', 'between:0,6'],
            'operating_hours.*.opening_time' => ['nullable', 'string'],
            'operating_hours.*.closing_time' => ['nullable', 'string'],
            'operating_hours.*.closes_next_day' => ['nullable', 'boolean'],
            'operating_hours.*.is_closed' => ['nullable', 'boolean'],
        ]);

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

    private function resolveRestaurantId(Request $request): ?int
    {
        $val = $request->input('restaurant_id') ?? $request->query('restaurant_id');

        return is_numeric($val) ? (int) $val : null;
    }
}
