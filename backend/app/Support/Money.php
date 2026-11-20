<?php

namespace App\Support;

class Money
{
    /**
     * Parse a decimal money string into integer centavos without floating-point arithmetic.
     * Negative inputs clamp to 0 (matching CheckoutService behavior).
     */
    public static function toCents(string $decimal): int
    {
        $clean = trim($decimal);
        if (str_starts_with($clean, '-')) {
            return 0;
        }
        $parts = explode('.', $clean, 2);
        $pesos = (int) preg_replace('/\D/', '', $parts[0] ?: '0');
        $centStr = str_pad(substr(preg_replace('/\D/', '', $parts[1] ?? ''), 0, 2), 2, '0', STR_PAD_RIGHT);

        return ($pesos * 100) + (int) $centStr;
    }

    /**
     * Strictly parse a non-negative decimal money string (up to 2 fractional digits) into centavos.
     * Returns -1 when the input does not match /^\d+(?:\.\d{1,2})?$/ (matching RiderDeliveryService behavior).
     */
    public static function parseStrictCents(string $decimal): int
    {
        $clean = trim($decimal);
        if (! preg_match('/^\d+(?:\.\d{1,2})?$/', $clean)) {
            return -1;
        }
        [$whole, $frac] = array_pad(explode('.', $clean, 2), 2, '');
        $frac = str_pad(substr($frac, 0, 2), 2, '0');

        return ((int) $whole * 100) + (int) $frac;
    }

    /**
     * Format integer centavos into a 2-decimal string without floating-point arithmetic.
     */
    public static function fromCents(int $cents): string
    {
        $pesos = intdiv($cents, 100);
        $rem = $cents % 100;

        return sprintf('%d.%02d', $pesos, $rem);
    }
}
