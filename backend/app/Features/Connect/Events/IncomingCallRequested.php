<?php

namespace App\Features\Connect\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class IncomingCallRequested implements ShouldBroadcastNow
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    /**
     * @param  array<string, mixed>  $call
     */
    public function __construct(
        public readonly int $orderId,
        public readonly array $call,
        public readonly string $serverNow,
    ) {}

    /**
     * @return array<int, PrivateChannel>
     */
    public function broadcastOn(): array
    {
        return [
            new PresenceChannel("order.{$this->orderId}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'IncomingCallRequested';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'order_id' => $this->orderId,
            'call' => $this->call,
            'server_now' => $this->serverNow,
        ];
    }
}
