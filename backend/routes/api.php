<?php

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
