<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\ApiResponse;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
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

            $revokedAfter = Cache::get("auth:revoked_after:{$freshUser->user_id}");
            if ($revokedAfter !== null && $request->hasSession()) {
                $issuedAt = (int) $request->session()->get('auth_issued_at', 0);
                if ($issuedAt <= (int) $revokedAfter) {
                    Auth::guard('web')->logout();
                    $request->session()->invalidate();
                    $request->session()->regenerateToken();

                    return ApiResponse::error(
                        message: 'Session has been revoked by an administrator.',
                        status: 401,
                    );
                }
            }

            $freshUser->clearRoleContextCache();
            $request->attributes->set('_salo_fresh_user', $freshUser);
            Auth::guard('web')->setUser($freshUser);
        }

        return $next($request);
    }
}
