<?php

namespace App\Features\Reservations\Controllers;

use App\Features\Reservations\Requests\AssignOwnerReservationTableRequest;
use App\Features\Reservations\Requests\CancelOwnerReservationRequest;
use App\Features\Reservations\Requests\ListOwnerReservationsRequest;
use App\Features\Reservations\Requests\OptionalOwnerReservationNoteRequest;
use App\Features\Reservations\Requests\OwnerReservationCalendarRequest;
use App\Features\Reservations\Requests\RejectOwnerReservationRequest;
use App\Features\Reservations\Requests\SeatOwnerReservationRequest;
use App\Features\Reservations\Requests\UpdateOwnerPreOrderStatusRequest;
use App\Features\Reservations\Requests\UpdateOwnerReservationDepositRequest;
use App\Features\Reservations\Services\OwnerReservationService;
use App\Features\Reservations\Services\ReservationPreOrderService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OwnerReservationController extends Controller
{
    public function __construct(
        private readonly OwnerReservationService $ownerReservationService,
        private readonly ReservationPreOrderService $preOrderService,
    ) {}

    public function index(ListOwnerReservationsRequest $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: $this->ownerReservationService->list($request->user(), $validated, $restaurantId),
            message: 'Restaurant reservations retrieved.',
        );
    }

    public function calendar(OwnerReservationCalendarRequest $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: $this->ownerReservationService->calendar($request->user(), (string) $validated['month'], $restaurantId),
            message: 'Reservation calendar retrieved.',
        );
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        return ApiResponse::success(
            data: ['reservation' => $this->ownerReservationService->getDetail($request->user(), $id, $restaurantId)],
            message: 'Reservation details retrieved.',
        );
    }

    public function approve(OptionalOwnerReservationNoteRequest $request, int $id): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: [
                'reservation' => $this->ownerReservationService->approve(
                    user: $request->user(),
                    reservationId: $id,
                    note: $validated['note'] ?? null,
                    restaurantId: $restaurantId,
                    request: $request,
                ),
            ],
            message: 'Reservation approved.',
        );
    }

    public function reject(RejectOwnerReservationRequest $request, int $id): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: [
                'reservation' => $this->ownerReservationService->reject(
                    user: $request->user(),
                    reservationId: $id,
                    reason: (string) $validated['reason'],
                    restaurantId: $restaurantId,
                    request: $request,
                ),
            ],
            message: 'Reservation rejected.',
        );
    }

    public function deposit(UpdateOwnerReservationDepositRequest $request, int $id): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: [
                'reservation' => $this->ownerReservationService->updateDeposit(
                    user: $request->user(),
                    reservationId: $id,
                    targetDepositStatus: (string) $validated['deposit_status'],
                    note: $validated['note'] ?? null,
                    restaurantId: $restaurantId,
                    request: $request,
                ),
            ],
            message: 'Reservation deposit updated.',
        );
    }

    public function confirmDeposit(OptionalOwnerReservationNoteRequest $request, int $id): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: [
                'reservation' => $this->ownerReservationService->confirmDeposit(
                    user: $request->user(),
                    reservationId: $id,
                    note: $validated['note'] ?? null,
                    restaurantId: $restaurantId,
                    request: $request,
                ),
            ],
            message: 'Reservation deposit confirmed.',
        );
    }

    public function arrived(OptionalOwnerReservationNoteRequest $request, int $id): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: [
                'reservation' => $this->ownerReservationService->markArrived(
                    user: $request->user(),
                    reservationId: $id,
                    note: $validated['note'] ?? null,
                    restaurantId: $restaurantId,
                    request: $request,
                ),
            ],
            message: 'Guest marked as arrived.',
        );
    }

    public function seat(SeatOwnerReservationRequest $request, int $id): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: [
                'reservation' => $this->ownerReservationService->seat(
                    user: $request->user(),
                    reservationId: $id,
                    tableId: isset($validated['table_id']) ? (int) $validated['table_id'] : null,
                    note: $validated['note'] ?? null,
                    restaurantId: $restaurantId,
                    request: $request,
                ),
            ],
            message: 'Guest seated.',
        );
    }

    public function complete(OptionalOwnerReservationNoteRequest $request, int $id): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: [
                'reservation' => $this->ownerReservationService->complete(
                    user: $request->user(),
                    reservationId: $id,
                    note: $validated['note'] ?? null,
                    restaurantId: $restaurantId,
                    request: $request,
                ),
            ],
            message: 'Reservation completed.',
        );
    }

    public function noShow(OptionalOwnerReservationNoteRequest $request, int $id): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: [
                'reservation' => $this->ownerReservationService->markNoShow(
                    user: $request->user(),
                    reservationId: $id,
                    note: $validated['note'] ?? null,
                    restaurantId: $restaurantId,
                    request: $request,
                ),
            ],
            message: 'Reservation marked as no-show.',
        );
    }

    public function cancel(CancelOwnerReservationRequest $request, int $id): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: ['reservation' => $this->ownerReservationService->cancel(
                    user: $request->user(),
                    reservationId: $id,
                    reason: (string) $validated['reason'],
                    restaurantId: $restaurantId,
                    request: $request,
                    refundDeposit: (bool) ($validated['refund_deposit'] ?? false),
                )],
            message: 'Reservation cancelled.',
        );
    }

    public function updatePreOrderStatus(UpdateOwnerPreOrderStatusRequest $request, int $id): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        $preOrder = $this->preOrderService->transitionPreOrderStatus(
            user: $request->user(),
            reservationId: $id,
            action: (string) $validated['action'],
            reason: $validated['reason'] ?? null,
            restaurantId: $restaurantId,
            request: $request,
        );

        return ApiResponse::success(
            data: ['pre_order' => $preOrder],
            message: 'Reservation pre-order status updated.',
        );
    }

    public function assignTable(AssignOwnerReservationTableRequest $request, int $id): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: [
                'reservation' => $this->ownerReservationService->assignTable(
                    user: $request->user(),
                    reservationId: $id,
                    tableId: (int) $validated['table_id'],
                    restaurantId: $restaurantId,
                    request: $request,
                ),
            ],
            message: 'Reservation table updated.',
        );
    }

    private function resolveRestaurantId(Request $request): ?int
    {
        $raw = $request->input('restaurant_id') ?? $request->query('restaurant_id');
        if ($raw === null || $raw === '') {
            return null;
        }

        return is_numeric($raw) ? (int) $raw : null;
    }
}
