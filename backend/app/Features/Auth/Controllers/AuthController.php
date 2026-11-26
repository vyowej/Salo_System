<?php

namespace App\Features\Auth\Controllers;

use App\Features\Auth\Requests\ForgotPasswordRequest;
use App\Features\Auth\Requests\LoginRequest;
use App\Features\Auth\Requests\RegisterRequest;
use App\Features\Auth\Requests\ResetPasswordRequest;
use App\Features\Auth\Services\AuthService;
use App\Features\Auth\Services\PasswordResetService;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Throwable;

class AuthController extends Controller
{
    public function csrf(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: ['csrf_token' => $request->hasSession() ? $request->session()->token() : csrf_token()],
            message: 'CSRF token initialized.',
        );
    }

    public function register(RegisterRequest $request, AuthService $authService): JsonResponse
    {
        $userPayload = $authService->register($request->validated(), $request);

        return ApiResponse::success(
            data: ['user' => $userPayload],
            message: 'Account registered successfully.',
            status: 201,
        );
    }

    public function login(LoginRequest $request, AuthService $authService): JsonResponse
    {
        $userPayload = $authService->login(
            email: (string) $request->validated('email'),
            password: (string) $request->validated('password'),
            request: $request,
        );

        return ApiResponse::success(
            data: ['user' => $userPayload],
            message: 'Logged in successfully.',
        );
    }

    public function logout(Request $request, AuthService $authService): JsonResponse
    {
        $authService->logout($request);

        return ApiResponse::success(
            data: null,
            message: 'Logged out successfully.',
        );
    }

    public function me(Request $request, AuthService $authService): JsonResponse
    {
        /** @var User $authUser */
        $authUser = $request->user();
        $freshUser = $request->attributes->get('_salo_fresh_user');
        if (! $freshUser instanceof User || (int) $freshUser->user_id !== (int) $authUser->user_id) {
            $freshUser = User::query()->findOrFail($authUser->user_id);
        }

        return ApiResponse::success(
            data: ['user' => $authService->formatUserPayload($freshUser)],
            message: 'Authenticated user profile.',
        );
    }

    public function forgotPassword(
        ForgotPasswordRequest $request,
        PasswordResetService $passwordResetService,
    ): JsonResponse {
        $passwordResetService->requestReset(
            email: (string) $request->validated('email'),
            request: $request,
        );

        return ApiResponse::success(
            data: null,
            message: 'If an active account with that email exists, password reset instructions have been processed.',
        );
    }

    public function resetPassword(
        ResetPasswordRequest $request,
        PasswordResetService $passwordResetService,
    ): JsonResponse {
        $passwordResetService->confirmReset(
            email: (string) $request->validated('email'),
            plainToken: (string) $request->validated('token'),
            newPassword: (string) $request->validated('password'),
            request: $request,
        );

        return ApiResponse::success(
            data: null,
            message: 'Password has been reset successfully.',
        );
    }

    public function googleAuthUrl(Request $request, AuthService $authService): JsonResponse
    {
        if (trim((string) config('services.google.client_id')) === '' || trim((string) config('services.google.client_secret')) === '') {
            return ApiResponse::error(
                message: 'Google Sign-In is not configured yet. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env.',
                status: 503,
            );
        }

        $url = $authService->getGoogleAuthUrl($request);

        return ApiResponse::success(
            data: ['url' => $url],
            message: 'Google sign-in URL generated.',
        );
    }

    public function usernameAvailable(Request $request, AuthService $authService): JsonResponse
    {
        $result = $authService->checkUsernameAvailability((string) $request->query('username', ''));

        return ApiResponse::success(
            data: $result,
            message: $result['message'],
        );
    }

    public function googlePending(Request $request, AuthService $authService): JsonResponse
    {
        return ApiResponse::success(
            data: ['pending' => $authService->getPendingGoogleSignup($request)],
            message: 'Pending Google sign-up retrieved.',
        );
    }

    public function googleComplete(Request $request, AuthService $authService): JsonResponse
    {
        $userPayload = $authService->completeGoogleSignup((string) $request->input('username', ''), $request);

        return ApiResponse::success(
            data: ['user' => $userPayload],
            message: 'Google sign-up completed.',
            status: 201,
        );
    }

    public function googleCallback(Request $request, AuthService $authService): RedirectResponse
    {
        $frontendUrl = rtrim((string) config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173')), '/');

        try {
            $userPayload = $authService->handleGoogleCallback($request);
            if (! empty($userPayload['pending_username'])) {
                return redirect()->away($frontendUrl.'/google-complete');
            }
            $roles = $userPayload['roles'] ?? [];
            $destination = in_array('admin', $roles, true) ? '/admin' : '/customer';

            return redirect()->away($frontendUrl.$destination);
        } catch (Throwable $e) {
            $message = $e->getMessage() ?: 'Unable to sign in with Google.';

            return redirect()->away($frontendUrl.'/login?google_error='.urlencode($message));
        }
    }
}
