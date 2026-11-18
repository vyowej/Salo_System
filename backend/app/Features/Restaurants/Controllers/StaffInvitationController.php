<?php

namespace App\Features\Restaurants\Controllers;

use App\Features\Restaurants\Services\StaffInvitationService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StaffInvitationController extends Controller
{
    public function __construct(
        private readonly StaffInvitationService $staffInvitationService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $restaurantId = $request->query('restaurant_id');
        $parsedId = $restaurantId !== null && $restaurantId !== '' ? (int) $restaurantId : null;

        $data = $this->staffInvitationService->listRestaurantStaff($request->user(), $parsedId);

        return ApiResponse::success($data, 'Restaurant staff loaded.');
    }

    public function storeInvitation(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'restaurant_id' => ['nullable', 'integer', 'min:1'],
            'username' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'identifier' => ['nullable', 'string', 'max:255'],
            'staff_position' => ['required', 'string', 'max:100'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $data = $this->staffInvitationService->sendInvitation($request->user(), $validated, $request);

        return ApiResponse::success(
            $data,
            'If an eligible SALO account matches that username or email, an invitation has been sent.',
        );
    }

    public function cancelInvitation(Request $request, int $id): JsonResponse
    {
        $data = $this->staffInvitationService->cancelInvitation($request->user(), $id, $request);

        return ApiResponse::success($data, 'Staff invitation cancelled.');
    }
}
