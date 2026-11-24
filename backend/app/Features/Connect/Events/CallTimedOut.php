<?php

namespace App\Features\Connect\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class CallTimedOut implements ShouldBroadcastNow
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
        public readonly int $callAttempts,
        public readonly int $maxStrikes,
        public readonly ?string $cooldownEndsAt,
        public readonly string $serverNow,
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PresenceChannel("order.{$this->orderId}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'CallTimedOut';
    }

    public function broadcastWith(): array
    {
        return [
            'order_id' => $this->orderId,
            'call' => $this->call,
            'call_attempts' => $this->callAttempts,
            'max_strikes' => $this->maxStrikes,
            'cooldown_ends_at' => $this->cooldownEndsAt,
            'server_now' => $this->serverNow,
        ];
    }
}
