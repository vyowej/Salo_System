<?php

namespace App\Features\Connect\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class WaitingRequestUpdated implements ShouldBroadcastNow
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    /**
     * @param  array<string, mixed>  $waitingRequest
     */
    public function __construct(
        public readonly int $orderId,
        public readonly array $waitingRequest,
        public readonly bool $waitEnded = false,
        public readonly string $serverNow = '',
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PresenceChannel("order.{$this->orderId}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'WaitingRequestUpdated';
    }

    public function broadcastWith(): array
    {
        return [
            'order_id' => $this->orderId,
            'waiting_request' => $this->waitingRequest,
            'wait_ended' => $this->waitEnded,
            'server_now' => $this->serverNow,
        ];
    }
}
