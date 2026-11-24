<?php

namespace App\Features\Connect\Jobs;

use App\Features\Connect\Services\OrderConnectService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class ResolveCallTimeoutJob implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly int $orderId,
        public readonly int $callLogId,
    ) {}

    public function handle(OrderConnectService $connectService): void
    {
        $connectService->resolveExpiredCall($this->orderId, $this->callLogId);
    }
}
