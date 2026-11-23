<?php

namespace App\Features\Riders\Controllers;

use App\Features\Riders\Services\RiderDeliveryService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

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

    public function history(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->riderDeliveryService->listHistory($request->user(), $request->query()),
            message: 'Delivery history retrieved.',
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

    public function decline(Request $request, int $orderId): JsonResponse
    {
        $result = $this->riderDeliveryService->declineDelivery($request->user(), $orderId, $request);

        return ApiResponse::success(
            data: $result,
            message: 'Delivery offer declined.',
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
            pod: [
                'recipient_name' => $request->input('recipient_name'),
                'delivery_notes' => $request->input('delivery_notes'),
                'proof_photo' => $request->file('proof_photo'),
                'proof_latitude' => $request->input('proof_latitude'),
                'proof_longitude' => $request->input('proof_longitude'),
            ],
        );

        return ApiResponse::success(
            data: ['delivery' => $delivery],
            message: 'Delivery marked as delivered.',
        );
    }

    public function fail(Request $request, int $orderId): JsonResponse
    {
        $delivery = $this->riderDeliveryService->markFailed(
            user: $request->user(),
            orderId: $orderId,
            failureReason: (string) $request->input('failure_reason', ''),
            deliveryNotes: $request->input('delivery_notes'),
            request: $request,
        );

        return ApiResponse::success(
            data: ['delivery' => $delivery],
            message: 'Delivery marked as failed.',
        );
    }

    public function proof(Request $request, int $orderId): Response
    {
        return $this->riderDeliveryService->streamProofPhoto($request->user(), $orderId);
    }

    public function customerProof(Request $request, int $id): Response
    {
        return $this->riderDeliveryService->streamProofPhotoForCustomer($request->user(), $id);
    }

    public function adminProof(Request $request, int $id): Response
    {
        return $this->riderDeliveryService->streamProofPhotoForAdmin($request->user(), $id);
    }
}
