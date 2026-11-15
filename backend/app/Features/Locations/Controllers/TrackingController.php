<?php

namespace App\Features\Locations\Controllers;

use App\Features\Locations\Services\RiderTrackingService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TrackingController extends Controller
{
    public function __construct(
        private readonly RiderTrackingService $tracking,
    ) {}

    public function recordRiderLocation(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'delivery_id' => ['nullable', 'integer', 'min:1'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'accuracy_meters' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'heading' => ['nullable', 'numeric', 'between:0,360'],
            'speed_mps' => ['nullable', 'numeric', 'min:0'],
            'recorded_at' => ['nullable', 'date'],
        ]);

        $result = $this->tracking->recordLocation($request->user(), $validated);

        return ApiResponse::success(
            data: $result,
            message: $result['recorded'] ? 'Rider GPS location recorded.' : ($result['reason'] ?? 'Location ignored.'),
        );
    }

    public function customerOrderTracking(Request $request, int $id): JsonResponse
    {
        return ApiResponse::success(
            data: $this->tracking->getOrderTracking($id, $request->user(), isAdmin: false),
            message: 'Order tracking retrieved.',
        );
    }

    public function adminOrderTracking(Request $request, int $id): JsonResponse
    {
        return ApiResponse::success(
            data: $this->tracking->getOrderTracking($id, $request->user(), isAdmin: true),
            message: 'Order tracking retrieved.',
        );
    }
}
