<?php

namespace App\Features\Auth\Controllers;

use App\Features\Auth\Requests\SendOtpRequest;
use App\Features\Auth\Requests\VerifyOtpRequest;
use App\Features\Auth\Services\OtpService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;

class OtpController extends Controller
{
    public function __construct(
        private readonly OtpService $otpService,
    ) {}

    public function send(SendOtpRequest $request): JsonResponse
    {
        $result = $this->otpService->send(
            email: (string) $request->validated('email'),
            purpose: (string) $request->validated('purpose'),
            user: $request->user(),
            request: $request,
        );

        return ApiResponse::success(
            data: $result,
            message: 'Verification code sent to your email.',
        );
    }

    public function verify(VerifyOtpRequest $request): JsonResponse
    {
        $result = $this->otpService->verify(
            email: (string) $request->validated('email'),
            purpose: (string) $request->validated('purpose'),
            code: (string) $request->validated('code'),
            user: $request->user(),
            request: $request,
        );

        return ApiResponse::success(
            data: $result,
            message: 'Email verified successfully.',
        );
    }
}
