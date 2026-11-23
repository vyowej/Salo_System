<?php

use App\Features\Account\Controllers\AccountContactController;
use App\Features\Account\Controllers\AccountController;
use App\Features\Account\Controllers\AccountLifecycleController;
use App\Features\Account\Controllers\AccountSettingsController;
use App\Features\Account\Controllers\AccountStaffInvitationController;
use App\Features\Admin\Controllers\AdminApplicationController;
use App\Features\Admin\Controllers\AdminBranchPermitController;
use App\Features\Admin\Controllers\AdminManagementController;
use App\Features\Admin\Controllers\AdminOrderController;
use App\Features\Admin\Controllers\AdminReservationController;
use App\Features\Admin\Controllers\AdminSettingsRequestController;
use App\Features\Applications\Controllers\ApplicationDocumentController;
use App\Features\Auth\Controllers\AuthController;
use App\Features\Auth\Controllers\OtpController;
use App\Features\Locations\Controllers\AdminServiceAreaController;
use App\Features\Locations\Controllers\CustomerAddressController;
use App\Features\Locations\Controllers\LocationLookupController;
use App\Features\Locations\Controllers\RestaurantLocationController;
use App\Features\Locations\Controllers\TrackingController;
use App\Features\Media\Controllers\PublicImageProxyController;
use App\Features\Notifications\Controllers\NotificationController;
use App\Features\Orders\Controllers\CustomerOrderController;
use App\Features\Orders\Controllers\RestaurantOrderController;
use App\Features\Reservations\Controllers\CustomerReservationController;
use App\Features\Reservations\Controllers\OwnerReservationController;
use App\Features\Reservations\Controllers\OwnerTableController;
use App\Features\Reservations\Controllers\ReservationAvailabilityController;
use App\Features\Restaurants\Controllers\OwnerBranchController;
use App\Features\Restaurants\Controllers\OwnerInventoryController;
use App\Features\Restaurants\Controllers\OwnerMenuController;
use App\Features\Restaurants\Controllers\OwnerMenuPublishController;
use App\Features\Restaurants\Controllers\OwnerProfileController;
use App\Features\Restaurants\Controllers\RestaurantApplicationController;
use App\Features\Restaurants\Controllers\RestaurantChangeRequestController;
use App\Features\Restaurants\Controllers\RestaurantController;
use App\Features\Restaurants\Controllers\StaffInvitationController;
use App\Features\Reviews\Controllers\AdminReviewController;
use App\Features\Reviews\Controllers\CustomerReviewController;
use App\Features\Reviews\Controllers\OwnerReviewController;
use App\Features\Reviews\Controllers\PublicReviewController;
use App\Features\Reviews\Controllers\RiderReviewController;
use App\Features\Riders\Controllers\RiderApplicationController;
use App\Features\Riders\Controllers\RiderChangeRequestController;
use App\Features\Riders\Controllers\RiderController;
use App\Features\Riders\Controllers\RiderDeliveryController;
use App\Support\ApiResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::get('/media/images/{fileId}', [PublicImageProxyController::class, 'show'])
    ->where('fileId', '[A-Za-z0-9_-]{10,128}')
    ->middleware('throttle:600,1');

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
    Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:10,1');
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/password/forgot', [AuthController::class, 'forgotPassword']);
    Route::post('/password/reset', [AuthController::class, 'resetPassword']);
    Route::post('/reactivation-request', [AccountLifecycleController::class, 'requestReactivation'])->middleware('throttle:10,1');

    Route::middleware('auth')->group(function (): void {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me']);
    });
});

Route::prefix('account')->middleware('auth')->group(function (): void {
    Route::patch('/profile', [AccountController::class, 'updateProfile']);
    Route::put('/password', [AccountController::class, 'updatePassword']);
    Route::get('/applications', [AccountController::class, 'applications']);

    Route::get('/settings', [AccountSettingsController::class, 'show']);
    Route::put('/settings', [AccountSettingsController::class, 'update']);

    Route::get('/contact-numbers', [AccountContactController::class, 'index']);
    Route::post('/contact-numbers', [AccountContactController::class, 'store']);
    Route::patch('/contact-numbers/{id}', [AccountContactController::class, 'update'])->whereNumber('id');
    Route::patch('/contact-numbers/{id}/default', [AccountContactController::class, 'setDefault'])->whereNumber('id');
    Route::delete('/contact-numbers/{id}', [AccountContactController::class, 'destroy'])->whereNumber('id');

    Route::get('/lifecycle-requests', [AccountLifecycleController::class, 'index']);
    Route::post('/deactivate', [AccountLifecycleController::class, 'deactivate']);
    Route::post('/deletion-request', [AccountLifecycleController::class, 'requestDeletion']);

    Route::get('/staff-invitations', [AccountStaffInvitationController::class, 'index']);
    Route::post('/staff-invitations/{id}/accept', [AccountStaffInvitationController::class, 'accept'])->whereNumber('id');
    Route::post('/staff-invitations/{id}/decline', [AccountStaffInvitationController::class, 'decline'])->whereNumber('id');
});

Route::prefix('notifications')->middleware(['auth', 'throttle:120,1'])->group(function (): void {
    Route::get('/', [NotificationController::class, 'index']);
    Route::get('/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('/{id}/read', [NotificationController::class, 'markRead'])->whereNumber('id');
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

        Route::get('/change-requests', [RiderChangeRequestController::class, 'index']);
        Route::post('/change-requests', [RiderChangeRequestController::class, 'store']);
        Route::delete('/change-requests/{id}', [RiderChangeRequestController::class, 'destroy'])->whereNumber('id');
        Route::get('/change-requests/{id}/documents/{index}', [RiderChangeRequestController::class, 'document'])->whereNumber(['id', 'index']);

        Route::get('/deliveries/available', [RiderDeliveryController::class, 'available']);
        Route::get('/deliveries/current', [RiderDeliveryController::class, 'current']);
        Route::post('/deliveries/{orderId}/accept', [RiderDeliveryController::class, 'accept'])->whereNumber('orderId');
        Route::post('/deliveries/{orderId}/picked-up', [RiderDeliveryController::class, 'pickedUp'])->whereNumber('orderId');
        Route::post('/deliveries/{orderId}/delivered', [RiderDeliveryController::class, 'delivered'])->whereNumber('orderId');

        Route::get('/reviews', [RiderReviewController::class, 'index']);
    });
});

Route::prefix('customer')->middleware('auth')->group(function (): void {
    Route::get('/addresses', [CustomerAddressController::class, 'index']);
    Route::post('/addresses', [CustomerAddressController::class, 'store']);
    Route::patch('/addresses/{id}', [CustomerAddressController::class, 'update'])->whereNumber('id');
    Route::patch('/addresses/{id}/default', [CustomerAddressController::class, 'setDefault'])->whereNumber('id');
    Route::delete('/addresses/{id}', [CustomerAddressController::class, 'destroy'])->whereNumber('id');
    Route::get('/orders/{id}/tracking', [TrackingController::class, 'customerOrderTracking'])->whereNumber('id');

    Route::post('/checkout', [CustomerOrderController::class, 'checkout']);
    Route::get('/orders', [CustomerOrderController::class, 'index']);
    Route::get('/orders/{id}', [CustomerOrderController::class, 'show'])->whereNumber('id');
    Route::post('/orders/{id}/cancel', [CustomerOrderController::class, 'cancel'])->whereNumber('id');

    Route::get('/orders/{id}/reviews', [CustomerReviewController::class, 'showOrderReviews'])->whereNumber('id');
    Route::post('/orders/{id}/reviews/restaurant', [CustomerReviewController::class, 'storeRestaurantReview'])->whereNumber('id');
    Route::post('/orders/{id}/reviews/rider', [CustomerReviewController::class, 'storeRiderReview'])->whereNumber('id');

    Route::post('/reservations', [CustomerReservationController::class, 'store'])->middleware('throttle:20,1');
    Route::get('/reservations', [CustomerReservationController::class, 'index']);
    Route::get('/reservations/{id}', [CustomerReservationController::class, 'show'])->whereNumber('id');
    Route::post('/reservations/{id}/cancel', [CustomerReservationController::class, 'cancel'])->whereNumber('id')->middleware('throttle:30,1');
});

Route::prefix('restaurant')->middleware('auth')->group(function (): void {
    Route::post('/applications', [RestaurantApplicationController::class, 'store']);
    Route::get('/applications/current', [RestaurantApplicationController::class, 'current']);
    Route::post('/applications/{id}/documents', [RestaurantApplicationController::class, 'uploadDocument'])->whereNumber('id');
    Route::post('/applications/{id}/branches/{branchId}/permit', [RestaurantApplicationController::class, 'submitBranchPermit'])->whereNumber(['id', 'branchId']);
    Route::get('/applications/{id}/branches/{branchId}/permit/file', [RestaurantApplicationController::class, 'branchPermitFile'])->whereNumber(['id', 'branchId']);
    Route::get('/branches/{id}/permit/file', [OwnerBranchController::class, 'permitFile'])->whereNumber('id');

    Route::middleware('role:owner')->group(function (): void {
        Route::get('/setup-status', [RestaurantController::class, 'setupStatus']);

        Route::get('/profile', [OwnerProfileController::class, 'show']);
        Route::patch('/profile', [OwnerProfileController::class, 'update']);
        Route::post('/profile/media', [OwnerProfileController::class, 'updateMedia']);
        Route::patch('/accepting-status', [OwnerProfileController::class, 'updateAcceptingStatus']);
        Route::get('/settings', [OwnerProfileController::class, 'settings']);
        Route::patch('/settings', [OwnerProfileController::class, 'updateSettings'])->middleware('throttle:30,1');

        Route::get('/change-requests', [RestaurantChangeRequestController::class, 'index']);
        Route::post('/change-requests', [RestaurantChangeRequestController::class, 'store']);
        Route::delete('/change-requests/{id}', [RestaurantChangeRequestController::class, 'destroy'])->whereNumber('id');
        Route::get('/change-requests/{id}/documents/{index}', [RestaurantChangeRequestController::class, 'document'])->whereNumber(['id', 'index']);

        Route::get('/operating-hours', [OwnerProfileController::class, 'operatingHours']);
        Route::put('/operating-hours', [OwnerProfileController::class, 'updateOperatingHours']);

        Route::get('/staff', [StaffInvitationController::class, 'index']);
        Route::post('/staff/invitations', [StaffInvitationController::class, 'storeInvitation'])->middleware('throttle:20,1');
        Route::post('/staff/invitations/{id}/cancel', [StaffInvitationController::class, 'cancelInvitation'])->whereNumber('id');
        Route::patch('/staff/{id}/position', [StaffInvitationController::class, 'updatePosition'])->whereNumber('id');
        Route::delete('/staff/{id}', [StaffInvitationController::class, 'remove'])->whereNumber('id');

        Route::post('/branches', [OwnerBranchController::class, 'store']);
        Route::post('/branches/{id}/permit', [OwnerBranchController::class, 'submitPermit'])->whereNumber('id');
    });

    Route::middleware('role:owner,staff')->group(function (): void {
        Route::get('/branches', [OwnerBranchController::class, 'index']);

        Route::get('/menu/categories', [OwnerMenuController::class, 'categories']);
        Route::post('/menu/categories', [OwnerMenuController::class, 'storeCategory']);
        Route::put('/menu/categories/reorder', [OwnerMenuController::class, 'reorderCategories']);
        Route::patch('/menu/categories/{categoryId}', [OwnerMenuController::class, 'updateCategory'])->whereNumber('categoryId');
        Route::delete('/menu/categories/{categoryId}', [OwnerMenuController::class, 'destroyCategory'])->whereNumber('categoryId');
        Route::post('/menu/categories/{categoryId}/restore', [OwnerMenuController::class, 'restoreCategory'])->whereNumber('categoryId');

        Route::get('/menu/items', [OwnerMenuController::class, 'items']);
        Route::post('/menu/items', [OwnerMenuController::class, 'storeItem']);
        Route::post('/menu/items/{itemId}', [OwnerMenuController::class, 'updateItem'])->whereNumber('itemId');
        Route::patch('/menu/items/{itemId}', [OwnerMenuController::class, 'updateItem'])->whereNumber('itemId');
        Route::patch('/menu/items/{itemId}/availability', [OwnerMenuController::class, 'updateItemAvailability'])->whereNumber('itemId');
        Route::delete('/menu/items/{itemId}', [OwnerMenuController::class, 'destroyItem'])->whereNumber('itemId');
        Route::post('/menu/items/{itemId}/restore', [OwnerMenuController::class, 'restoreItem'])->whereNumber('itemId');

        Route::get('/menu/publish-status', [OwnerMenuPublishController::class, 'status']);
        Route::get('/menu/preview', [OwnerMenuPublishController::class, 'preview']);
        Route::post('/menu/publish', [OwnerMenuPublishController::class, 'publish'])->middleware('throttle:20,1');
        Route::post('/menu/unpublish', [OwnerMenuPublishController::class, 'unpublish'])->middleware('throttle:20,1');
        Route::post('/menu/discard-changes', [OwnerMenuPublishController::class, 'discard']);

        Route::get('/location', [RestaurantLocationController::class, 'show']);
        Route::patch('/location', [RestaurantLocationController::class, 'updateLocation']);
        Route::put('/coverage', [RestaurantLocationController::class, 'updateCoverage']);

        Route::get('/inventory/config', [OwnerInventoryController::class, 'showConfig']);
        Route::patch('/inventory/config', [OwnerInventoryController::class, 'updateConfig']);

        Route::get('/orders', [RestaurantOrderController::class, 'index']);
        Route::get('/orders/{id}', [RestaurantOrderController::class, 'show'])->whereNumber('id');
        Route::post('/orders/{id}/accept', [RestaurantOrderController::class, 'accept'])->whereNumber('id');
        Route::post('/orders/{id}/reject', [RestaurantOrderController::class, 'reject'])->whereNumber('id');
        Route::post('/orders/{id}/prepare', [RestaurantOrderController::class, 'prepare'])->whereNumber('id');
        Route::post('/orders/{id}/ready', [RestaurantOrderController::class, 'ready'])->whereNumber('id');
        Route::post('/orders/{id}/complete', [RestaurantOrderController::class, 'complete'])->whereNumber('id');

        Route::get('/reviews', [OwnerReviewController::class, 'index']);
        Route::post('/reviews/{reviewId}/flag', [OwnerReviewController::class, 'flag'])->whereNumber('reviewId');

        Route::get('/tables', [OwnerTableController::class, 'index']);
        Route::post('/tables', [OwnerTableController::class, 'store'])->middleware('throttle:60,1');
        Route::get('/tables/{id}', [OwnerTableController::class, 'show'])->whereNumber('id');
        Route::patch('/tables/{id}', [OwnerTableController::class, 'update'])->whereNumber('id')->middleware('throttle:60,1');
        Route::post('/tables/{id}/archive', [OwnerTableController::class, 'archive'])->whereNumber('id')->middleware('throttle:60,1');
        Route::post('/tables/{id}/reactivate', [OwnerTableController::class, 'reactivate'])->whereNumber('id')->middleware('throttle:60,1');

        Route::get('/reservations', [OwnerReservationController::class, 'index']);
        Route::get('/reservations/calendar', [OwnerReservationController::class, 'calendar']);
        Route::get('/reservations/{id}', [OwnerReservationController::class, 'show'])->whereNumber('id');
        Route::post('/reservations/{id}/approve', [OwnerReservationController::class, 'approve'])->whereNumber('id')->middleware('throttle:60,1');
        Route::post('/reservations/{id}/reject', [OwnerReservationController::class, 'reject'])->whereNumber('id')->middleware('throttle:60,1');
        Route::post('/reservations/{id}/confirm-deposit', [OwnerReservationController::class, 'confirmDeposit'])->whereNumber('id')->middleware('throttle:60,1');
        Route::post('/reservations/{id}/deposit', [OwnerReservationController::class, 'deposit'])->whereNumber('id')->middleware('throttle:60,1');
        Route::post('/reservations/{id}/arrived', [OwnerReservationController::class, 'arrived'])->whereNumber('id')->middleware('throttle:60,1');
        Route::post('/reservations/{id}/seat', [OwnerReservationController::class, 'seat'])->whereNumber('id')->middleware('throttle:60,1');
        Route::post('/reservations/{id}/complete', [OwnerReservationController::class, 'complete'])->whereNumber('id')->middleware('throttle:60,1');
        Route::post('/reservations/{id}/no-show', [OwnerReservationController::class, 'noShow'])->whereNumber('id')->middleware('throttle:60,1');
        Route::post('/reservations/{id}/cancel', [OwnerReservationController::class, 'cancel'])->whereNumber('id')->middleware('throttle:30,1');
        Route::patch('/reservations/{id}/table', [OwnerReservationController::class, 'assignTable'])->whereNumber('id')->middleware('throttle:60,1');
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

    Route::get('/branch-permits', [AdminBranchPermitController::class, 'index']);
    Route::get('/branch-permits/{permitId}', [AdminBranchPermitController::class, 'show'])->whereNumber('permitId');
    Route::get('/branch-permits/{permitId}/file', [AdminBranchPermitController::class, 'file'])->whereNumber('permitId');
    Route::post('/branch-permits/{permitId}/start-review', [AdminBranchPermitController::class, 'startReview'])->whereNumber('permitId');
    Route::post('/branch-permits/{permitId}/approve', [AdminBranchPermitController::class, 'approve'])->whereNumber('permitId');
    Route::post('/branch-permits/{permitId}/reject', [AdminBranchPermitController::class, 'reject'])->whereNumber('permitId');
    Route::post('/branch-permits/{permitId}/request-info', [AdminBranchPermitController::class, 'requestInfo'])->whereNumber('permitId');
    Route::post('/branch-permits/{permitId}/waive', [AdminBranchPermitController::class, 'waive'])->whereNumber('permitId');
    Route::post('/branch-permits/{permitId}/reopen', [AdminBranchPermitController::class, 'reopen'])->whereNumber('permitId');

    Route::get('/riders', [AdminManagementController::class, 'riders']);
    Route::post('/riders/{id}/activate', [AdminManagementController::class, 'activateRider'])->whereNumber('id');
    Route::patch('/riders/{id}/status', [AdminManagementController::class, 'updateRiderStatus'])->whereNumber('id');

    Route::get('/audit-logs', [AdminManagementController::class, 'auditLogs']);

    Route::get('/service-areas', [AdminServiceAreaController::class, 'index']);
    Route::post('/service-areas', [AdminServiceAreaController::class, 'store']);
    Route::patch('/service-areas/{id}', [AdminServiceAreaController::class, 'update'])->whereNumber('id');
    Route::get('/locations/overview', [AdminServiceAreaController::class, 'locationsOverview']);
    Route::get('/orders', [AdminOrderController::class, 'index']);
    Route::get('/orders/{id}/tracking', [TrackingController::class, 'adminOrderTracking'])->whereNumber('id');

    Route::get('/reservations', [AdminReservationController::class, 'index']);
    Route::get('/reservations/stats', [AdminReservationController::class, 'stats']);
    Route::get('/reservations/{id}', [AdminReservationController::class, 'show'])->whereNumber('id');

    Route::get('/change-requests', [AdminSettingsRequestController::class, 'changeRequests']);
    Route::post('/change-requests/{id}/decision', [AdminSettingsRequestController::class, 'decideChangeRequest'])->whereNumber('id');
    Route::get('/change-requests/{id}/documents/{index}', [AdminSettingsRequestController::class, 'changeRequestDocument'])->whereNumber(['id', 'index']);

    Route::get('/lifecycle-requests', [AdminSettingsRequestController::class, 'lifecycleRequests']);
    Route::post('/lifecycle-requests/{id}/decision', [AdminSettingsRequestController::class, 'decideLifecycleRequest'])->whereNumber('id');

    Route::get('/reviews', [AdminReviewController::class, 'index']);
    Route::post('/reviews/{type}/{id}/moderate', [AdminReviewController::class, 'moderate'])
        ->whereIn('type', ['restaurant', 'rider'])
        ->whereNumber('id');
    Route::get('/reviews/settings', [AdminReviewController::class, 'getSettings']);
    Route::put('/reviews/settings', [AdminReviewController::class, 'updateSettings']);

    Route::get('/featured-restaurants', [AdminReviewController::class, 'featuredOverview']);
    Route::post('/featured-restaurants/evaluate', [AdminReviewController::class, 'evaluateFeatured']);
    Route::post('/featured-restaurants/override', [AdminReviewController::class, 'overrideFeatured']);
});

Route::prefix('locations')->middleware('throttle:120,1')->group(function (): void {
    Route::get('/provinces', [LocationLookupController::class, 'provinces']);
    Route::get('/cities', [LocationLookupController::class, 'cities']);
    Route::get('/barangays', [LocationLookupController::class, 'barangays']);
    Route::get('/active-service-areas', [LocationLookupController::class, 'activeServiceAreas']);
    Route::post('/validate-service-area', [LocationLookupController::class, 'validateServiceArea']);
});

Route::middleware('throttle:60,1')->group(function (): void {
    Route::get('/featured-restaurant', [PublicReviewController::class, 'featuredRestaurant']);
    Route::get('/restaurant-categories', [RestaurantController::class, 'categories']);
    Route::get('/restaurants', [RestaurantController::class, 'index']);
    Route::get('/restaurants/{id}', [RestaurantController::class, 'show'])->whereNumber('id');
    Route::get('/restaurants/{id}/menu', [RestaurantController::class, 'menu'])->whereNumber('id');
    Route::get('/restaurants/{id}/reviews', [PublicReviewController::class, 'restaurantReviews'])->whereNumber('id');
    Route::get('/restaurants/{id}/reservation-info', [ReservationAvailabilityController::class, 'info'])->whereNumber('id');
    Route::get('/restaurants/{id}/reservation-availability/month', [ReservationAvailabilityController::class, 'month'])->whereNumber('id');
    Route::get('/restaurants/{id}/reservation-availability', [ReservationAvailabilityController::class, 'day'])->whereNumber('id');
    Route::get('/restaurants/{id}/reservation-availability/tables', [ReservationAvailabilityController::class, 'tables'])->whereNumber('id');
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
