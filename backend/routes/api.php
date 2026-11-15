<?php

use App\Features\Account\Controllers\AccountController;
use App\Features\Auth\Controllers\AuthController;
use App\Support\ApiResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    $database = 'down';

    try {
        DB::connection()->getPdo();
        DB::select('SELECT 1');
        $database = 'up';
    } catch (\Throwable) {
        $database = 'down';
    }

    $healthy = $database === 'up';

    return ApiResponse::success(
        data: [
            'app' => 'up',
            'database' => $database,
        ],
        message: $healthy ? 'Service is healthy.' : 'Service is degraded.',
        status: $healthy ? 200 : 503,
    );
});

Route::prefix('auth')->group(function (): void {
    Route::get('/csrf', [AuthController::class, 'csrf']);
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/password/forgot', [AuthController::class, 'forgotPassword']);
    Route::post('/password/reset', [AuthController::class, 'resetPassword']);

    Route::middleware('auth')->group(function (): void {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me']);
    });
});

Route::prefix('account')->middleware('auth')->group(function (): void {
    Route::patch('/profile', [AccountController::class, 'updateProfile']);
    Route::put('/password', [AccountController::class, 'updatePassword']);
    Route::get('/applications', [AccountController::class, 'applications']);
});

if (app()->environment('testing')) {
    Route::prefix('test/role-check')->middleware('auth')->group(function (): void {
        Route::get('/customer', fn () => ApiResponse::success(['role' => 'customer'], 'Customer role verified.'))
            ->middleware('role:customer');
        Route::get('/admin', fn () => ApiResponse::success(['role' => 'admin'], 'Admin role verified.'))
            ->middleware('role:admin');
        Route::get('/owner', fn () => ApiResponse::success(['role' => 'owner'], 'Owner role verified.'))
            ->middleware('role:owner');
        Route::get('/staff', fn () => ApiResponse::success(['role' => 'staff'], 'Staff role verified.'))
            ->middleware('role:staff');
        Route::get('/rider', fn () => ApiResponse::success(['role' => 'rider'], 'Rider role verified.'))
            ->middleware('role:rider');
    });
}
