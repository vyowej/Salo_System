<?php

namespace App\Features\Connect\Controllers;

use App\Features\Connect\Services\OrderConnectService;
use App\Features\Riders\Services\RiderDeliveryService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RiderConnectController extends Controller
{
    public function __construct(
        private readonly OrderConnectService $connectService,
        private readonly RiderDeliveryService $deliveryService,
    ) {}

    public function showOrder(Request $request, int $id): JsonResponse
    {
        $order = $this->deliveryService->getAssignedOrderDetail($request->user(), $id);

        return ApiResponse::success(
            data: ['order' => $order],
            message: 'Assigned order retrieved.',
        );
    }

    public function arrive(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'latitude' => ['sometimes', 'nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['sometimes', 'nullable', 'numeric', 'between:-180,180'],
        ]);

        $state = $this->connectService->markArrived($request->user(), $id, $request, $validated);

        return ApiResponse::success(
            data: $state,
            message: 'Marked as arrived at drop-off.',
        );
    }

    public function startCall(Request $request, int $id): JsonResponse
    {
        $state = $this->connectService->startCall($request->user(), $id, $request);

        return ApiResponse::success(
            data: $state,
            message: 'Call request sent to customer.',
        );
    }

    public function deliver(Request $request, int $id): JsonResponse
    {
        $delivery = $this->deliveryService->markDelivered(
            user: $request->user(),
            orderId: $id,
            collectedAmount: $request->input('collected_amount'),
            request: $request,
            pod: [
                'recipient_name' => $request->input('recipient_name'),
                'delivery_notes' => $request->input('delivery_notes'),
                'proof_latitude' => $request->input('proof_latitude'),
                'proof_longitude' => $request->input('proof_longitude'),
                'proof_photo' => $request->file('proof_photo'),
            ],
        );

        return ApiResponse::success(
            data: ['delivery' => $delivery],
            message: 'Delivery completed successfully.',
        );
    }
}
