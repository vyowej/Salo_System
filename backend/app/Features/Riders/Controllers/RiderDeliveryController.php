<?php

namespace App\Features\Riders\Controllers;

use App\Features\Riders\Services\RiderDeliveryService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RiderDeliveryController extends Controller
{
    public function __construct(
        private readonly RiderDeliveryService $riderDeliveryService,
    ) {}

    public function available(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->riderDeliveryService->listAvailable($request->user(), $request->query()),
            message: 'Available deliveries retrieved.',
        );
    }

    public function current(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: ['delivery' => $this->riderDeliveryService->getCurrentDelivery($request->user())],
            message: 'Current delivery retrieved.',
        );
    }

    public function accept(Request $request, int $orderId): JsonResponse
    {
        $delivery = $this->riderDeliveryService->acceptDelivery($request->user(), $orderId, $request);

        return ApiResponse::success(
            data: ['delivery' => $delivery],
            message: 'Delivery accepted.',
        );
    }

    public function pickedUp(Request $request, int $orderId): JsonResponse
    {
        $delivery = $this->riderDeliveryService->markPickedUp($request->user(), $orderId, $request);

        return ApiResponse::success(
            data: ['delivery' => $delivery],
            message: 'Delivery marked as picked up.',
        );
    }

    public function delivered(Request $request, int $orderId): JsonResponse
    {
        $delivery = $this->riderDeliveryService->markDelivered(
            user: $request->user(),
            orderId: $orderId,
            collectedAmount: $request->input('collected_amount'),
            request: $request,
        );

        return ApiResponse::success(
            data: ['delivery' => $delivery],
            message: 'Delivery marked as delivered.',
        );
    }
}
