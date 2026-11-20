<?php

namespace App\Features\Locations\Controllers;

use App\Features\Locations\Requests\RecordRiderLocationRequest;
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

    public function recordRiderLocation(RecordRiderLocationRequest $request): JsonResponse
    {
        $result = $this->tracking->recordLocation($request->user(), $request->validated());

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
