<?php

namespace App\Support\Storage;

final class DriveFolderName
{
    private const MAX_LABEL_LENGTH = 80;

    /**
     * Sanitize a human-readable folder name: strip slashes and control characters,
     * collapse whitespace, trim length while preserving valid UTF-8 unicode.
     */
    public static function sanitize(?string $raw, string $fallback = 'Unnamed', int $maxLength = self::MAX_LABEL_LENGTH): string
    {
        $value = (string) ($raw ?? '');
        $value = str_replace(['/', '\\'], ' ', $value);
        $value = (string) preg_replace('/[\x00-\x1F\x7F]/u', '', $value);
        $value = (string) preg_replace('/\s+/u', ' ', trim($value));

        if ($value === '') {
            return $fallback;
        }

        if (mb_strlen($value, 'UTF-8') > $maxLength) {
            $value = rtrim(mb_substr($value, 0, $maxLength, 'UTF-8'));
        }

        return $value === '' ? $fallback : $value;
    }

    public static function withSuffix(?string $name, string $suffix, string $fallback = 'Unnamed'): string
    {
        $clean = self::sanitize($name, $fallback);

        return "{$clean} [{$suffix}]";
    }

    public static function restaurantBrand(?string $restaurantName, int $brandId): string
    {
        return self::withSuffix($restaurantName, "R-{$brandId}", 'Restaurant');
    }

    public static function branch(?string $branchName, int $branchId): string
    {
        return self::withSuffix($branchName, "R-{$branchId}", 'Branch');
    }

    public static function applicationBranchPermit(?string $branchName, int $applicationBranchId): string
    {
        return self::withSuffix($branchName, "AB-{$applicationBranchId}", 'Branch');
    }

    public static function rider(?string $riderName, int $userId): string
    {
        return self::withSuffix($riderName, "U-{$userId}", 'Rider');
    }

    public static function restaurantApplication(?string $ownerName, ?string $restaurantName, int $applicationId): string
    {
        $owner = self::sanitize($ownerName, 'Owner', 36);
        $restaurant = self::sanitize($restaurantName, 'Restaurant', 40);

        return "{$owner} - {$restaurant} [A-{$applicationId}]";
    }

    public static function riderApplication(?string $riderName, int $applicationId): string
    {
        return self::withSuffix($riderName, "A-{$applicationId}", 'Rider');
    }
}
