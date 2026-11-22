<?php

namespace App\Features\Reservations\Controllers;

use App\Features\Reservations\Requests\CancelCustomerReservationRequest;
use App\Features\Reservations\Requests\ListCustomerReservationsRequest;
use App\Features\Reservations\Requests\StoreCustomerReservationRequest;
use App\Features\Reservations\Services\CustomerReservationService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerReservationController extends Controller
{
    public function __construct(
        private readonly CustomerReservationService $customerReservationService,
    ) {}

    public function index(ListCustomerReservationsRequest $request): JsonResponse
    {
        $validated = $request->validated();

        return ApiResponse::success(
            data: $this->customerReservationService->list($request->user(), $validated),
            message: 'Customer reservations retrieved.',
        );
    }

    public function store(StoreCustomerReservationRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $reservation = $this->customerReservationService->create($request->user(), $validated, $request);

        return ApiResponse::success(
            data: ['reservation' => $reservation],
            message: 'Reservation request submitted.',
            status: 201,
        );
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return ApiResponse::success(
            data: ['reservation' => $this->customerReservationService->getDetail($request->user(), $id)],
            message: 'Reservation details retrieved.',
        );
    }

    public function cancel(CancelCustomerReservationRequest $request, int $id): JsonResponse
    {
        $validated = $request->validated();
        $reservation = $this->customerReservationService->cancel(
            user: $request->user(),
            reservationId: $id,
            reason: $validated['reason'] ?? null,
            request: $request,
        );

        return ApiResponse::success(
            data: ['reservation' => $reservation],
            message: 'Reservation cancelled.',
        );
    }
}
