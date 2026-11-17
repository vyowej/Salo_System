<?php

use App\Features\Account\Controllers\AccountController;
use App\Features\Admin\Controllers\AdminApplicationController;
use App\Features\Admin\Controllers\AdminManagementController;
use App\Features\Applications\Controllers\ApplicationDocumentController;
use App\Features\Auth\Controllers\AuthController;
use App\Features\Auth\Controllers\OtpController;
use App\Features\Locations\Controllers\AdminServiceAreaController;
use App\Features\Locations\Controllers\CustomerAddressController;
use App\Features\Locations\Controllers\LocationLookupController;
use App\Features\Locations\Controllers\RestaurantLocationController;
use App\Features\Locations\Controllers\TrackingController;
use App\Features\Restaurants\Controllers\OwnerMenuController;
use App\Features\Restaurants\Controllers\OwnerProfileController;
use App\Features\Restaurants\Controllers\RestaurantApplicationController;
use App\Features\Restaurants\Controllers\RestaurantController;
use App\Features\Riders\Controllers\RiderApplicationController;
use App\Features\Riders\Controllers\RiderController;
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

Route::prefix('otp')->middleware('auth')->group(function (): void {
    Route::post('/send', [OtpController::class, 'send']);
    Route::post('/verify', [OtpController::class, 'verify']);
});

Route::prefix('applications')->middleware('auth')->group(function (): void {
    Route::get('/documents/{documentId}/file', [ApplicationDocumentController::class, 'show'])->whereNumber('documentId');
});

Route::prefix('rider')->middleware('auth')->group(function (): void {
    Route::post('/applications', [RiderApplicationController::class, 'store']);
    Route::get('/applications/current', [RiderApplicationController::class, 'current']);
    Route::post('/applications/{id}/documents', [RiderApplicationController::class, 'uploadDocument'])->whereNumber('id');

    Route::middleware('role:rider')->group(function (): void {
        Route::get('/dashboard', [RiderController::class, 'dashboard']);
        Route::get('/profile', [RiderController::class, 'profile']);
        Route::patch('/profile', [RiderController::class, 'updateProfile']);
        Route::patch('/availability', [RiderController::class, 'updateAvailability']);
        Route::post('/location', [TrackingController::class, 'recordRiderLocation']);
    });
});

Route::prefix('customer')->middleware('auth')->group(function (): void {
    Route::get('/addresses', [CustomerAddressController::class, 'index']);
    Route::post('/addresses', [CustomerAddressController::class, 'store']);
    Route::patch('/addresses/{id}', [CustomerAddressController::class, 'update'])->whereNumber('id');
    Route::patch('/addresses/{id}/default', [CustomerAddressController::class, 'setDefault'])->whereNumber('id');
    Route::delete('/addresses/{id}', [CustomerAddressController::class, 'destroy'])->whereNumber('id');
    Route::get('/orders/{id}/tracking', [TrackingController::class, 'customerOrderTracking'])->whereNumber('id');
});

Route::prefix('restaurant')->middleware('auth')->group(function (): void {
    Route::post('/applications', [RestaurantApplicationController::class, 'store']);
    Route::get('/applications/current', [RestaurantApplicationController::class, 'current']);
    Route::post('/applications/{id}/documents', [RestaurantApplicationController::class, 'uploadDocument'])->whereNumber('id');

    Route::middleware('role:owner')->group(function (): void {
        Route::get('/setup-status', [RestaurantController::class, 'setupStatus']);

        Route::get('/profile', [OwnerProfileController::class, 'show']);
        Route::patch('/profile', [OwnerProfileController::class, 'update']);
        Route::post('/profile/media', [OwnerProfileController::class, 'updateMedia']);
        Route::patch('/accepting-status', [OwnerProfileController::class, 'updateAcceptingStatus']);

        Route::get('/operating-hours', [OwnerProfileController::class, 'operatingHours']);
        Route::put('/operating-hours', [OwnerProfileController::class, 'updateOperatingHours']);

        Route::get('/menu/categories', [OwnerMenuController::class, 'categories']);
        Route::post('/menu/categories', [OwnerMenuController::class, 'storeCategory']);
        Route::put('/menu/categories/reorder', [OwnerMenuController::class, 'reorderCategories']);
        Route::patch('/menu/categories/{categoryId}', [OwnerMenuController::class, 'updateCategory'])->whereNumber('categoryId');
        Route::delete('/menu/categories/{categoryId}', [OwnerMenuController::class, 'destroyCategory'])->whereNumber('categoryId');

        Route::get('/menu/items', [OwnerMenuController::class, 'items']);
        Route::post('/menu/items', [OwnerMenuController::class, 'storeItem']);
        Route::post('/menu/items/{itemId}', [OwnerMenuController::class, 'updateItem'])->whereNumber('itemId');
        Route::patch('/menu/items/{itemId}', [OwnerMenuController::class, 'updateItem'])->whereNumber('itemId');
        Route::patch('/menu/items/{itemId}/availability', [OwnerMenuController::class, 'updateItemAvailability'])->whereNumber('itemId');
        Route::delete('/menu/items/{itemId}', [OwnerMenuController::class, 'destroyItem'])->whereNumber('itemId');
    });

    Route::middleware('role:owner,staff')->group(function (): void {
        Route::get('/location', [RestaurantLocationController::class, 'show']);
        Route::patch('/location', [RestaurantLocationController::class, 'updateLocation']);
        Route::put('/coverage', [RestaurantLocationController::class, 'updateCoverage']);
    });
});

Route::prefix('admin')->middleware(['auth', 'role:admin'])->group(function (): void {
    Route::get('/applications', [AdminApplicationController::class, 'index']);
    Route::get('/applications/{type}/{id}', [AdminApplicationController::class, 'show'])->whereNumber('id');
    Route::patch('/applications/{type}/{id}/documents/{documentId}', [AdminApplicationController::class, 'reviewDocument'])->whereNumber(['id', 'documentId']);
    Route::post('/applications/{type}/{id}/document-requests', [AdminApplicationController::class, 'requestDocument'])->whereNumber('id');
    Route::post('/applications/{type}/{id}/decision', [AdminApplicationController::class, 'decide'])->whereNumber('id');

    Route::get('/users', [AdminManagementController::class, 'users']);
    Route::post('/users', [AdminManagementController::class, 'createUser']);
    Route::patch('/users/{id}', [AdminManagementController::class, 'updateUser'])->whereNumber('id');

    Route::get('/restaurants', [AdminManagementController::class, 'restaurants']);
    Route::patch('/restaurants/{id}/status', [AdminManagementController::class, 'updateRestaurantStatus'])->whereNumber('id');

    Route::get('/riders', [AdminManagementController::class, 'riders']);
    Route::patch('/riders/{id}/status', [AdminManagementController::class, 'updateRiderStatus'])->whereNumber('id');

    Route::get('/audit-logs', [AdminManagementController::class, 'auditLogs']);

    Route::get('/service-areas', [AdminServiceAreaController::class, 'index']);
    Route::post('/service-areas', [AdminServiceAreaController::class, 'store']);
    Route::patch('/service-areas/{id}', [AdminServiceAreaController::class, 'update'])->whereNumber('id');
    Route::get('/locations/overview', [AdminServiceAreaController::class, 'locationsOverview']);
    Route::get('/orders/{id}/tracking', [TrackingController::class, 'adminOrderTracking'])->whereNumber('id');
});

Route::prefix('locations')->middleware('throttle:120,1')->group(function (): void {
    Route::get('/provinces', [LocationLookupController::class, 'provinces']);
    Route::get('/cities', [LocationLookupController::class, 'cities']);
    Route::get('/barangays', [LocationLookupController::class, 'barangays']);
    Route::get('/active-service-areas', [LocationLookupController::class, 'activeServiceAreas']);
    Route::post('/validate-service-area', [LocationLookupController::class, 'validateServiceArea']);
});

Route::middleware('throttle:60,1')->group(function (): void {
    Route::get('/restaurant-categories', [RestaurantController::class, 'categories']);
    Route::get('/restaurants', [RestaurantController::class, 'index']);
    Route::get('/restaurants/{id}', [RestaurantController::class, 'show'])->whereNumber('id');
    Route::get('/restaurants/{id}/menu', [RestaurantController::class, 'menu'])->whereNumber('id');
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
