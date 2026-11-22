<?php

namespace App\Features\Restaurants\Controllers;

use App\Features\Restaurants\Requests\StoreStaffInvitationRequest;
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
        $allBranches = filter_var($request->query('all_branches', false), FILTER_VALIDATE_BOOLEAN);

        $data = $this->staffInvitationService->listRestaurantStaff($request->user(), $parsedId, $allBranches);

        return ApiResponse::success($data, 'Restaurant staff loaded.');
    }

    public function storeInvitation(StoreStaffInvitationRequest $request): JsonResponse
    {
        $validated = $request->validated();

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

    public function updatePosition(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'staff_position' => ['required', 'string', 'max:100'],
        ]);

        $data = $this->staffInvitationService->updateStaffPosition(
            $request->user(),
            $id,
            (string) $validated['staff_position'],
            $request,
        );

        return ApiResponse::success($data, 'Staff position updated.');
    }

    public function remove(Request $request, int $id): JsonResponse
    {
        $data = $this->staffInvitationService->removeStaff($request->user(), $id, $request);

        return ApiResponse::success($data, 'Staff member removed.');
    }
}
