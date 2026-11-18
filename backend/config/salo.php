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
        'max_size_kb' => (int) env('MAX_UPLOAD_SIZE_KB', 5120),
        'allowed_image_types' => array_values(array_filter(array_map(
            static fn (string $ext): string => strtolower(trim($ext)),
            explode(',', (string) env('ALLOWED_IMAGE_TYPES', 'jpg,jpeg,png,webp')),
        ))),
        'allowed_document_types' => array_values(array_filter(array_map(
            static fn (string $ext): string => strtolower(trim($ext)),
            explode(',', (string) env('ALLOWED_DOCUMENT_TYPES', 'pdf,jpg,jpeg,png')),
        ))),
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
];
