<?php

namespace App\Features\Admin\Controllers;

use App\Features\Admin\Requests\AdminReservationStatsRequest;
use App\Features\Admin\Requests\ListAdminReservationsRequest;
use App\Features\Admin\Services\AdminReservationService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminReservationController extends Controller
{
    public function __construct(
        private readonly AdminReservationService $adminReservationService,
    ) {}

    public function index(ListAdminReservationsRequest $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->adminReservationService->listReservations($request->validated()),
            message: 'Reservations retrieved.',
        );
    }

    public function stats(AdminReservationStatsRequest $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->adminReservationService->getStats($request->validated()),
            message: 'Reservation statistics retrieved.',
        );
    }

    public function show(int $id): JsonResponse
    {
        $reservation = $this->adminReservationService->getReservationDetail($id);

        if ($reservation === null) {
            return ApiResponse::error(
                message: 'Reservation not found.',
                status: 404,
            );
        }

        return ApiResponse::success(
            data: [
                'reservation' => $reservation,
            ],
            message: 'Reservation retrieved.',
        );
    }

    public function resolveReview(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'note' => ['required', 'string', 'min:5', 'max:500'],
        ]);

        $result = $this->adminReservationService->resolveReview(
            reservationId: $id,
            note: (string) $validated['note'],
            admin: $request->user(),
            request: $request,
        );

        return ApiResponse::success(
            data: $result,
            message: ($result['already_resolved'] ?? false)
                ? 'Reservation review was already resolved.'
                : 'Reservation review marked as resolved.',
        );
    }
}
