<?php

namespace App\Console\Commands;

use App\Features\Reservations\Services\ReservationReminderService;
use Illuminate\Console\Command;

class SendReservationReminders extends Command
{
    protected $signature = 'salo:send-reservation-reminders
                            {--dry-run : Report eligible reservations without sending notifications}
                            {--restaurant= : Limit processing to a single restaurant_id}';

    protected $description = 'Send upcoming reservation reminders to customers inside the configured lead window';

    public function handle(ReservationReminderService $reminderService): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $restaurantOpt = $this->option('restaurant');
        $restaurantId = is_numeric($restaurantOpt) && (int) $restaurantOpt > 0 ? (int) $restaurantOpt : null;

        $result = $reminderService->sendDue(
            restaurantId: $restaurantId,
            dryRun: $dryRun,
        );

        $prefix = $dryRun ? '[dry-run] ' : '';
        $this->info(
            "{$prefix}Reminders: examined={$result['examined']}, sent={$result['sent']}, skipped={$result['skipped']}, failed={$result['failed']}",
        );

        return $result['failed'] > 0 ? self::FAILURE : self::SUCCESS;
    }
}
