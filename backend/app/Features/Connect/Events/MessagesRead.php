<?php

namespace App\Features\Connect\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MessagesRead implements ShouldBroadcastNow
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    public function __construct(
        public readonly int $orderId,
        public readonly int $readerUserId,
        public readonly string $readAt,
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PresenceChannel("order.{$this->orderId}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'MessagesRead';
    }

    public function broadcastWith(): array
    {
        return [
            'order_id' => $this->orderId,
            'reader_user_id' => $this->readerUserId,
            'read_at' => $this->readAt,
        ];
    }
}
