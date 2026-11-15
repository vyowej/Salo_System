<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\ApiResponse;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class RequireRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        if (! Auth::guard('web')->check()) {
            return ApiResponse::error(
                message: 'Unauthenticated.',
                status: 401,
            );
        }

        /** @var User|null $freshUser */
        $freshUser = User::query()->find(Auth::guard('web')->id());

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

        foreach ($roles as $role) {
            if ($freshUser->hasDerivedRole($role)) {
                return $next($request);
            }
        }

        return ApiResponse::error(
            message: 'Forbidden: insufficient role permissions.',
            status: 403,
        );
    }
}
