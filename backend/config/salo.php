<?php

$allRestaurantPermissions = [
    'business.profile.view',
    'business.profile.edit',
    'business.photos.manage',
    'business.location.manage',
    'business.hours.manage',
    'menu.view',
    'menu.categories.manage',
    'menu.items.create',
    'menu.items.edit',
    'menu.items.delete',
    'menu.photos.manage',
    'menu.availability.manage',
    'menu.pricing.manage',
    'menu.addons.manage',
    'menu.publish',
    'orders.view',
    'orders.accept',
    'orders.reject',
    'orders.preparation.update',
    'orders.pickup.manage',
    'orders.customer.view',
    'reservations.view',
    'reservations.approve',
    'reservations.reject',
    'reservations.assignTables',
    'reservations.updateStatus',
    'reservations.manageArrival',
    'tables.view',
    'tables.add',
    'tables.edit',
    'tables.manageAvailability',
    'inventory.view',
    'inventory.addStock',
    'inventory.deductStock',
    'inventory.adjustStock',
    'inventory.viewHistory',
    'promotions.view',
    'promotions.create',
    'promotions.edit',
    'promotions.status.manage',
    'reports.sales.view',
    'reports.orders.view',
    'reports.reservations.view',
    'reports.inventory.view',
    'activity.view',
    'team.view',
    'team.invite',
    'team.permissions.manage',
];

$menuManagePermissions = [
    'menu.view',
    'menu.categories.manage',
    'menu.items.create',
    'menu.items.edit',
    'menu.items.delete',
    'menu.photos.manage',
    'menu.availability.manage',
    'menu.pricing.manage',
    'menu.addons.manage',
];

$orderHandlerPermissions = [
    'orders.view',
    'orders.accept',
    'orders.reject',
    'orders.preparation.update',
    'orders.pickup.manage',
    'orders.customer.view',
];

$inventoryManagerPermissions = [
    'inventory.view',
    'inventory.addStock',
    'inventory.deductStock',
    'inventory.adjustStock',
    'inventory.viewHistory',
];

$reservationHandlerPermissions = [
    'reservations.view',
    'reservations.approve',
    'reservations.reject',
    'reservations.assignTables',
    'reservations.updateStatus',
    'reservations.manageArrival',
    'tables.view',
    'tables.add',
    'tables.edit',
    'tables.manageAvailability',
];

/**
 * Canonical single source of truth mapping restaurant_staff.staff_position
 * to restaurant workspace permission keys (consumed by User::resolveRoleContext(),
 * WorkspaceAccessResolver, and the frontend via /api/auth/me).
 */
$positionPermissions = [
    'Manager' => array_values(array_unique(array_merge(
        $menuManagePermissions,
        ['menu.publish'],
        $orderHandlerPermissions,
        $inventoryManagerPermissions,
        $reservationHandlerPermissions,
    ))),
    'Order Handler' => $orderHandlerPermissions,
    'Order Staff' => $orderHandlerPermissions,
    'Reservation Handler' => $reservationHandlerPermissions,
    'Reservation Staff' => $reservationHandlerPermissions,
    'Inventory Manager' => array_values(array_unique(array_merge(
        $inventoryManagerPermissions,
        ['menu.view'],
    ))),
    'Menu Manager' => $menuManagePermissions,
];

$positionsWithPermission = static fn (string $permission): array => array_keys(array_filter(
    $positionPermissions,
    static fn (array $perms): bool => in_array($permission, $perms, true),
));

return [
    'otp' => [
        'expiration_minutes' => (int) env('OTP_EXPIRATION_MINUTES', 10),
        'resend_cooldown_seconds' => (int) env('OTP_RESEND_COOLDOWN_SECONDS', 60),
        'length' => (int) env('OTP_LENGTH', 6),
        'max_attempts' => (int) env('OTP_MAX_ATTEMPTS', 5),
        'verified_ttl_minutes' => 120,
    ],

    'uploads' => [
        'public_image_driver' => env('PUBLIC_IMAGE_STORAGE', 'local'),
        'max_size_kb' => (int) env('MAX_UPLOAD_SIZE_KB', 5120),
        'allowed_image_types' => array_values(array_filter(array_map(
            static fn (string $ext): string => strtolower(trim($ext)),
            explode(',', (string) env('ALLOWED_IMAGE_TYPES', 'jpg,jpeg,png,webp')),
        ))),
        'allowed_document_types' => array_values(array_filter(array_map(
            static fn (string $ext): string => strtolower(trim($ext)),
            explode(',', (string) env('ALLOWED_DOCUMENT_TYPES', 'pdf,jpg,jpeg,png')),
        ))),
        'google_drive' => [
            'client_id' => env('GOOGLE_DRIVE_CLIENT_ID'),
            'client_secret' => env('GOOGLE_DRIVE_CLIENT_SECRET'),
            'refresh_token' => env('GOOGLE_DRIVE_REFRESH_TOKEN'),
            'public_folder_id' => env('GOOGLE_DRIVE_PUBLIC_FOLDER_ID'),
            'timeout_seconds' => max(5, (int) env('GOOGLE_DRIVE_TIMEOUT_SECONDS', 20)),
            'proxy_cache' => filter_var(env('GOOGLE_DRIVE_PROXY_CACHE', true), FILTER_VALIDATE_BOOLEAN),
        ],
    ],

    'orders' => [
        // Placeholder flat delivery fee per delivery sub-order (PHP). Pickup fee is always 0.00.
        'flat_delivery_fee' => (string) env('SALO_FLAT_DELIVERY_FEE', '49.00'),
        'max_item_quantity' => max(1, (int) env('SALO_MAX_ORDER_ITEM_QUANTITY', 50)),
        // Derived from staff.position_permissions (single source of truth).
        'handler_positions' => $positionsWithPermission('orders.view'),
    ],

    'reservations' => [
        'default_duration_minutes' => max(30, (int) env('SALO_RESERVATION_DURATION_MINUTES', 90)),
        'slot_interval_minutes' => max(15, (int) env('SALO_RESERVATION_SLOT_INTERVAL_MINUTES', 30)),
        'no_show_grace_minutes' => max(0, (int) env('SALO_RESERVATION_NO_SHOW_GRACE_MINUTES', 15)),
        'max_active_pending_per_customer' => max(1, (int) env('SALO_RESERVATION_MAX_ACTIVE_PENDING', 3)),
        'suggested_slot_window' => max(1, (int) env('SALO_RESERVATION_SUGGESTED_SLOT_WINDOW', 3)),
        'reference_prefix' => 'SALO-RES',
        'handler_positions' => $positionsWithPermission('reservations.view'),
        'transitions' => [
            'pending' => ['approved', 'confirmed', 'awaiting_payment', 'rejected', 'cancelled', 'expired'],
            'approved' => ['confirmed', 'awaiting_payment', 'cancelled'],
            'awaiting_payment' => ['confirmed', 'cancelled', 'expired'],
            'confirmed' => ['arrived', 'seated', 'no_show', 'cancelled'],
            'arrived' => ['seated', 'no_show', 'cancelled'],
            'seated' => ['completed'],
            'rejected' => [],
            'completed' => [],
            'cancelled' => [],
            'no_show' => [],
            'expired' => [],
        ],
    ],

    'tables' => [
        'handler_positions' => $positionsWithPermission('tables.view'),
        'manager_positions' => $positionsWithPermission('tables.edit'),
    ],

    'staff' => [
        'invitation_expiry_days' => max(1, (int) env('SALO_STAFF_INVITATION_EXPIRY_DAYS', 7)),
        'positions' => array_keys($positionPermissions),
        'position_permissions' => $positionPermissions,
        'all_permissions' => $allRestaurantPermissions,
    ],

    'inventory' => [
        'deduction_modes' => [
            'manual',
            'on_completion',
        ],
        // Derived from staff.position_permissions (single source of truth).
        'manager_positions' => $positionsWithPermission('inventory.view'),
    ],

    'menu' => [
        // Derived from staff.position_permissions (single source of truth).
        'publisher_positions' => $positionsWithPermission('menu.publish'),
    ],

    'restaurants' => [
        'max_application_branches' => max(1, (int) env('SALO_MAX_APPLICATION_BRANCHES', 5)),
        'max_branches_per_business' => max(1, (int) env('SALO_MAX_BRANCHES_PER_BUSINESS', 10)),
    ],

    'reviews' => [
        // Default fallback values; runtime policy overrides live in platform_settings.
        'min_rating' => 1,
        'max_rating' => 5,
        'flagged_counts_toward_rating' => filter_var(env('SALO_FLAGGED_REVIEWS_COUNT', false), FILTER_VALIDATE_BOOLEAN),
    ],

    'featured_restaurant' => [
        // Default fallback values; runtime policy overrides live in platform_settings.
        'min_review_threshold' => max(1, (int) env('SALO_FEATURED_MIN_REVIEWS', 10)),
        'evaluation_period_days' => max(1, (int) env('SALO_FEATURED_EVALUATION_DAYS', 30)),
        'feature_period_days' => max(1, (int) env('SALO_FEATURED_PERIOD_DAYS', 7)),
        'week_start_day' => (string) env('SALO_FEATURED_WEEK_START_DAY', 'monday'),
        'fallback_baseline_rating' => (float) env('SALO_FEATURED_FALLBACK_BASELINE', 4.0),
        'min_platform_reviews_for_baseline' => max(1, (int) env('SALO_FEATURED_MIN_PLATFORM_REVIEWS', 10)),
        'auto_selection_enabled' => filter_var(env('SALO_FEATURED_AUTO_SELECTION', true), FILTER_VALIDATE_BOOLEAN),
    ],
];
