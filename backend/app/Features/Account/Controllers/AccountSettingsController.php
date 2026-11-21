<?php

namespace App\Features\Account\Controllers;

use App\Features\Account\Services\AccountSettingsService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountSettingsController extends Controller
{
    public function __construct(
        private readonly AccountSettingsService $accountSettingsService,
    ) {}

    public function show(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: ['settings' => $this->accountSettingsService->getSettings($request->user())],
            message: 'Account settings retrieved.',
        );
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'notifications' => ['sometimes', 'array'],
            'notifications.*' => ['boolean'],
            'privacy' => ['sometimes', 'array'],
            'privacy.*' => ['boolean'],
            'security' => ['sometimes', 'array'],
            'security.*' => ['boolean'],
            'appearance' => ['sometimes', 'array'],
            'appearance.theme' => ['sometimes', 'string', 'in:light,dark,system'],
        ]);

        return ApiResponse::success(
            data: ['settings' => $this->accountSettingsService->updateSettings($request->user(), $validated, $request)],
            message: 'Account settings updated.',
        );
    }
}
