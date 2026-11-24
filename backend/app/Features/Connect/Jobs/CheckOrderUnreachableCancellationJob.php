<?php

namespace App\Features\Connect\Jobs;

use App\Features\Connect\Services\OrderConnectService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class CheckOrderUnreachableCancellationJob implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly int $orderId,
    ) {}

    public function handle(OrderConnectService $connectService): void
    {
        $connectService->evaluateUnreachableCancellation($this->orderId);
    }
}
