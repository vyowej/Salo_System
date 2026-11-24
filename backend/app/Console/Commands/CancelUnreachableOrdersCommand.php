<?php

namespace App\Console\Commands;

use App\Features\Connect\Services\OrderConnectService;
use Illuminate\Console\Command;

class CancelUnreachableOrdersCommand extends Command
{
    protected $signature = 'salo:cancel-unreachable-orders';

    protected $description = 'Cancel arrived orders that reached max call strikes and passed the minimum wait period';

    public function handle(OrderConnectService $connectService): int
    {
        $count = $connectService->cancelEligibleUnreachableOrders();
        if ($count > 0) {
            $this->info("Cancelled {$count} unreachable order(s).");
        }

        return self::SUCCESS;
    }
}
