<?php

namespace App\Features\Account\Controllers;

use App\Features\Account\Services\AccountLifecycleService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountLifecycleController extends Controller
{
    public function __construct(
        private readonly AccountLifecycleService $accountLifecycleService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: ['requests' => $this->accountLifecycleService->listForUser($request->user())],
            message: 'Account lifecycle requests retrieved.',
        );
    }

    public function deactivate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $result = $this->accountLifecycleService->deactivate(
            $request->user(),
            $validated['reason'] ?? null,
            $request,
        );

        return ApiResponse::success(
            data: $result,
            message: 'Your account has been deactivated.',
        );
    }

    public function requestDeletion(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $result = $this->accountLifecycleService->requestDeletion(
            $request->user(),
            $validated['reason'] ?? null,
            $request,
        );

        return ApiResponse::success(
            data: ['request' => $result],
            message: 'Account deletion request submitted for administrator review.',
            status: 201,
        );
    }

    public function requestReactivation(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $result = $this->accountLifecycleService->requestReactivation(
            $validated['email'],
            $validated['password'],
            $validated['reason'] ?? null,
            $request,
        );

        return ApiResponse::success(
            data: ['request' => $result],
            message: 'Account reactivation request submitted for administrator review.',
            status: 201,
        );
    }
}
