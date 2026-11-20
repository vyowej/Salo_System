<?php

namespace App\Support;

class SqlLike
{
    /**
     * Escape SQL LIKE wildcard characters (\, %, _) in a user-supplied search term.
     */
    public static function escape(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
    }
}
