<?php

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
        // Allowed restaurant_staff.staff_position values for restaurant order handling (case-insensitive, trimmed).
        'handler_positions' => [
            'Manager',
            'Order Handler',
            'Order Staff',
        ],
    ],

    'staff' => [
        'invitation_expiry_days' => max(1, (int) env('SALO_STAFF_INVITATION_EXPIRY_DAYS', 7)),
        'positions' => [
            'Manager',
            'Order Handler',
            'Order Staff',
            'Reservation Handler',
            'Reservation Staff',
            'Inventory Manager',
            'Menu Manager',
        ],
    ],

    'inventory' => [
        'deduction_modes' => [
            'manual',
            'on_completion',
        ],
        // Allowed restaurant_staff.staff_position values for inventory management (case-insensitive, trimmed).
        'manager_positions' => [
            'Manager',
            'Inventory Manager',
        ],
    ],

    'menu' => [
        // Allowed restaurant_staff.staff_position values for publishing/unpublishing restaurant menus (case-insensitive, trimmed).
        'publisher_positions' => [
            'Manager',
        ],
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
