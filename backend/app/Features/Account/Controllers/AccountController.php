<?php

namespace App\Features\Account\Controllers;

use App\Features\Account\Requests\UpdatePasswordRequest;
use App\Features\Account\Requests\UpdateProfileRequest;
use App\Features\Account\Services\AccountService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountController extends Controller
{
    public function __construct(
        private readonly AccountService $accountService,
    ) {}

    public function updateProfile(UpdateProfileRequest $request): JsonResponse
    {
        $userPayload = $this->accountService->updateProfile(
            $request->user(),
            $request->validated(),
        );

        return ApiResponse::success(
            data: ['user' => $userPayload],
            message: 'Profile updated.',
        );
    }

    public function updatePassword(UpdatePasswordRequest $request): JsonResponse
    {
        $this->accountService->updatePassword(
            $request->user(),
            (string) $request->validated('current_password'),
            (string) $request->validated('password'),
            $request,
        );

        return ApiResponse::success(
            data: null,
            message: 'Password updated.',
        );
    }

    public function applications(Request $request): JsonResponse
    {
        $applications = $this->accountService->getApplications($request->user());

        return ApiResponse::success(
            data: $applications,
            message: 'Applications retrieved.',
        );
    }
}
