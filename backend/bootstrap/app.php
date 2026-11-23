<?php

use App\Http\Middleware\EnsureAccountIsActive;
use App\Http\Middleware\RequireRole;
use App\Support\ApiResponse;
use App\Support\Storage\ImageStorageUnavailableException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Http\Exceptions\PostTooLargeException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->redirectGuestsTo(fn () => null);

        $middleware->api(prepend: [
            EncryptCookies::class,
            AddQueuedCookiesToResponse::class,
            StartSession::class,
            PreventRequestForgery::class,
            EnsureAccountIsActive::class,
        ]);

        $middleware->preventRequestForgery(except: [
            'api/payments/xendit/webhook',
        ]);

        $middleware->alias([
            'role' => RequireRole::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        $exceptions->render(function (Throwable $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            if ($e instanceof \App\Features\Reservations\Support\ReservationBookingException) {
                return $e->toResponse();
            }

            if ($e instanceof ValidationException) {
                return ApiResponse::error(
                    message: 'The given data was invalid.',
                    status: 422,
                    errors: $e->errors(),
                );
            }

            if ($e instanceof AuthenticationException) {
                return ApiResponse::error(
                    message: 'Unauthenticated.',
                    status: 401,
                );
            }

            if ($e instanceof TokenMismatchException) {
                return ApiResponse::error(
                    message: 'CSRF token mismatch.',
                    status: 419,
                );
            }

            if ($e instanceof PostTooLargeException) {
                $maxKb = (int) config('salo.uploads.max_size_kb', 5120);
                $maxMb = round($maxKb / 1024, 1);

                return ApiResponse::error(
                    message: "The uploaded files exceed the maximum allowed request size. Each file must be {$maxMb} MB or smaller.",
                    status: 413,
                );
            }

            if ($e instanceof ThrottleRequestsException) {
                return ApiResponse::error(
                    message: $e->getMessage() ?: 'Too many attempts. Please try again later.',
                    status: 429,
                );
            }

            if ($e instanceof ImageStorageUnavailableException) {
                return ApiResponse::error(
                    message: $e->getMessage(),
                    status: $e->statusCode(),
                );
            }

            if ($e instanceof HttpExceptionInterface) {
                $status = $e->getStatusCode();
                if ($status === 419) {
                    return ApiResponse::error(
                        message: 'CSRF token mismatch.',
                        status: 419,
                    );
                }

                $message = $status >= 500
                    ? 'An unexpected server error occurred.'
                    : ($e->getMessage() ?: 'Request error.');

                return ApiResponse::error(
                    message: $message,
                    status: $status,
                );
            }

            return ApiResponse::error(
                message: 'An unexpected server error occurred.',
                status: 500,
            );
        });
    })->create();
