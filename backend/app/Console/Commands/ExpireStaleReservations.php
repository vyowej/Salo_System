<?php

namespace App\Console\Commands;

use App\Features\Reservations\Services\ReservationExpiryService;
use Illuminate\Console\Command;

class ExpireStaleReservations extends Command
{
    protected $signature = 'salo:expire-stale-reservations
                            {--dry-run : Report candidates without modifying the database}
                            {--restaurant= : Limit processing to a single restaurant_id}
                            {--limit= : Maximum number of reservations to expire/warn}';

    protected $description = 'Send pending-expiry warnings to restaurants and expire overdue pending/awaiting_payment reservations';

    public function handle(ReservationExpiryService $expiryService): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $restaurantOpt = $this->option('restaurant');
        $restaurantId = is_numeric($restaurantOpt) && (int) $restaurantOpt > 0 ? (int) $restaurantOpt : null;
        $limitOpt = $this->option('limit');
        $limit = is_numeric($limitOpt) && (int) $limitOpt > 0 ? (int) $limitOpt : null;

        $warnings = $expiryService->sendExpiryWarnings(
            restaurantId: $restaurantId,
            dryRun: $dryRun,
            limit: $limit,
        );

        $expiries = $expiryService->expireDue(
            restaurantId: $restaurantId,
            dryRun: $dryRun,
            limit: $limit,
        );

        $prefix = $dryRun ? '[dry-run] ' : '';
        $this->info(
            "{$prefix}Reservations: examined={$expiries['examined']}, warned={$warnings['warned']}, expired={$expiries['expired']}, skipped={$expiries['skipped']}, failed="
            .($warnings['failed'] + $expiries['failed']),
        );

        return ($warnings['failed'] + $expiries['failed']) > 0 ? self::FAILURE : self::SUCCESS;
    }
}
