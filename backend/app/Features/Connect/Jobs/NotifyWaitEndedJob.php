<?php

namespace App\Features\Connect\Jobs;

use App\Features\Connect\Services\WaitingRequestService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class NotifyWaitEndedJob implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly int $waitingRequestId,
    ) {}

    public function handle(WaitingRequestService $waitingRequestService): void
    {
        $waitingRequestService->notifyWaitEnded($this->waitingRequestId);
    }
}
