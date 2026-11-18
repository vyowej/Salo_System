<?php

namespace App\Features\Orders\Support;

use Carbon\Carbon;

class OrderTimestampFormatter
{
    public static function toManilaIso(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return Carbon::parse((string) $value, 'Asia/Manila')
            ->setTimezone('Asia/Manila')
            ->toIso8601String();
    }
}
