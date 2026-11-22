<?php

namespace App\Features\Reservations\Support;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class ReservationReferenceGenerator
{
    private const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    private const SUFFIX_LENGTH = 4;
    private const MAX_ATTEMPTS = 25;

    /**
     * Generate a unique reservation reference of the form SALO-RES-YYYYMMDD-XXXX
     * using the Asia/Manila timezone and retrying on DB collisions.
     */
    public function generate(?CarbonInterface $when = null): string
    {
        $prefix = trim((string) config('salo.reservations.reference_prefix', 'SALO-RES'));
        if ($prefix === '') {
            $prefix = 'SALO-RES';
        }

        $datePart = ($when !== null
            ? CarbonImmutable::instance($when)->setTimezone('Asia/Manila')
            : CarbonImmutable::now('Asia/Manila')
        )->format('Ymd');

        $alphabetLength = strlen(self::ALPHABET);

        for ($attempt = 0; $attempt < self::MAX_ATTEMPTS; $attempt++) {
            $suffix = '';
            for ($i = 0; $i < self::SUFFIX_LENGTH; $i++) {
                $suffix .= self::ALPHABET[random_int(0, $alphabetLength - 1)];
            }

            $candidate = sprintf('%s-%s-%s', $prefix, $datePart, $suffix);

            $exists = DB::table('reservations')
                ->where('reservation_reference', $candidate)
                ->exists();

            if (! $exists) {
                return $candidate;
            }
        }

        throw new RuntimeException('Unable to generate a unique reservation reference after maximum attempts.');
    }

    public static function make(?CarbonInterface $when = null): string
    {
        return (new self())->generate($when);
    }
}
