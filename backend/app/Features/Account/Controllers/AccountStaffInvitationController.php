<?php

namespace App\Features\Account\Controllers;

use App\Features\Restaurants\Services\StaffInvitationService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountStaffInvitationController extends Controller
{
    public function __construct(
        private readonly StaffInvitationService $staffInvitationService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $invitations = $this->staffInvitationService->listAccountInvitations($request->user());

        return ApiResponse::success(['invitations' => $invitations], 'Staff invitations loaded.');
    }

    public function accept(Request $request, int $id): JsonResponse
    {
        $data = $this->staffInvitationService->acceptInvitation($request->user(), $id, $request);

        return ApiResponse::success($data, 'Staff invitation accepted.');
    }

    public function decline(Request $request, int $id): JsonResponse
    {
        $data = $this->staffInvitationService->declineInvitation($request->user(), $id, $request);

        return ApiResponse::success($data, 'Staff invitation declined.');
    }
}
