<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\ApiResponse;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class EnsureAccountIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        if (Auth::guard('web')->check()) {
            $userId = Auth::guard('web')->id();
            $freshUser = $userId ? User::query()->find($userId) : null;

            if (! $freshUser || ! $freshUser->isActiveAccount()) {
                Auth::guard('web')->logout();

                if ($request->hasSession()) {
                    $request->session()->invalidate();
                    $request->session()->regenerateToken();
                }

                return ApiResponse::error(
                    message: 'Account is not active.',
                    status: 403,
                );
            }

            Auth::guard('web')->setUser($freshUser);
        }

        return $next($request);
    }
}
