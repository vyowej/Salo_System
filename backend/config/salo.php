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
];
