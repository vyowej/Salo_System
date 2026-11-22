<?php

namespace App\Features\Reservations\Controllers;

use App\Features\Reservations\Requests\GetReservationAvailabilityRequest;
use App\Features\Reservations\Requests\GetReservationMonthOverviewRequest;
use App\Features\Reservations\Requests\GetReservationSlotTablesRequest;
use App\Features\Reservations\Services\ReservationAvailabilityService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;

class ReservationAvailabilityController extends Controller
{
    public function __construct(
        private readonly ReservationAvailabilityService $reservationAvailabilityService,
    ) {}

    public function info(int $id): JsonResponse
    {
        $info = $this->reservationAvailabilityService->getPublicReservationInfo($id);

        return ApiResponse::success(
            data: $info,
            message: $info['message'],
        );
    }

    public function month(GetReservationMonthOverviewRequest $request, int $id): JsonResponse
    {
        $validated = $request->validated();
        $overview = $this->reservationAvailabilityService->getMonthOverview(
            restaurantId: $id,
            month: (string) $validated['month'],
            partySize: (int) $validated['party_size'],
            requirePublicRestaurant: true,
        );

        return ApiResponse::success(
            data: $overview,
            message: $overview['message'],
        );
    }

    public function day(GetReservationAvailabilityRequest $request, int $id): JsonResponse
    {
        $validated = $request->validated();
        $availability = $this->reservationAvailabilityService->getAvailabilityForDate(
            restaurantId: $id,
            date: (string) $validated['date'],
            partySize: (int) $validated['party_size'],
            diningArea: $validated['dining_area'] ?? null,
            requirePublicRestaurant: true,
        );

        return ApiResponse::success(
            data: $availability,
            message: $availability['message'],
        );
    }

    public function tables(GetReservationSlotTablesRequest $request, int $id): JsonResponse
    {
        $validated = $request->validated();
        $result = $this->reservationAvailabilityService->getSlotTablesOverview(
            restaurantId: $id,
            start: (string) $validated['start'],
            partySize: (int) $validated['party_size'],
            diningArea: $validated['dining_area'] ?? null,
            requirePublicRestaurant: true,
        );

        return ApiResponse::success(
            data: $result,
            message: $result['message'],
        );
    }
}
