<?php

namespace App\Features\Reservations\Controllers;

use App\Features\Payments\Services\PaymentService;
use App\Features\Reservations\Requests\CancelCustomerReservationRequest;
use App\Features\Reservations\Requests\ListCustomerReservationsRequest;
use App\Features\Reservations\Requests\StoreCustomerReservationRequest;
use App\Features\Reservations\Requests\UpdateCustomerPreOrderRequest;
use App\Features\Reservations\Services\CustomerReservationService;
use App\Features\Reservations\Services\ReservationPreOrderService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CustomerReservationController extends Controller
{
    public function __construct(
        private readonly CustomerReservationService $customerReservationService,
        private readonly PaymentService $paymentService,
        private readonly ReservationPreOrderService $preOrderService,
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

    public function initiateDeposit(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'payment_method' => ['required', 'string', Rule::in(['gcash', 'maya', 'card'])],
            'idempotency_key' => ['required', 'string', 'min:8', 'max:64'],
        ]);

        $payment = $this->paymentService->initiateReservationDepositPayment(
            user: $request->user(),
            reservationId: $id,
            channel: (string) $validated['payment_method'],
            idempotencyKey: (string) $validated['idempotency_key'],
            request: $request,
        );

        return ApiResponse::success(
            data: ['payment' => $payment],
            message: 'Reservation deposit payment initiated.',
            status: 201,
        );
    }

    public function updatePreOrder(UpdateCustomerPreOrderRequest $request, int $id): JsonResponse
    {
        $validated = $request->validated();
        $preOrder = $this->preOrderService->updateCustomerPreOrder(
            user: $request->user(),
            reservationId: $id,
            itemsInput: $validated['items'],
            notes: $validated['notes'] ?? null,
            request: $request,
        );

        return ApiResponse::success(
            data: ['pre_order' => $preOrder],
            message: $preOrder !== null ? 'Reservation pre-order updated.' : 'Reservation pre-order cancelled.',
        );
    }
}
