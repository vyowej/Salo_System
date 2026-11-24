<?php

namespace App\Features\Connect\Services;

use App\Features\Connect\Events\MessageSent;
use App\Features\Connect\Events\MessagesRead;
use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ConversationService
{
    public const READ_ONLY_ORDER_STATUSES = [
        'delivered',
        'completed',
        'cancelled',
        'failed',
        'rejected',
    ];

    public const CUSTOMER_QUICK_REPLIES = [
        "I'm coming down!",
        'Please wait 5 minutes.',
        "I'm at the entrance.",
        "I'm still in class.",
        'Please call me again.',
        'Where are you?',
    ];

    public const RIDER_QUICK_REPLIES = [
        "I'm already at your location.",
        "I'm waiting outside.",
        'Please confirm your location.',
        "I'll wait for a moment.",
        "I can't find your address.",
    ];

    /**
     * Load conversation and messages for an order, marking other-party messages as read.
     *
     * @return array<string, mixed>
     */
    public function getConversation(User $user, int $orderId): array
    {
        $context = $this->authorizeParticipant($user, $orderId);
        $conversation = $this->findOrCreateConversation($context);

        $now = CarbonImmutable::now();
        $markedCount = DB::table('messages')
            ->where('conversation_id', $conversation->id)
            ->where('sender_id', '!=', (int) $user->user_id)
            ->whereNull('read_at')
            ->update(['read_at' => $now->toDateTimeString()]);

        if ($markedCount > 0) {
            $readIso = OrderTimestampFormatter::toManilaIso($now) ?? $now->toIso8601String();
            event(new MessagesRead($orderId, (int) $user->user_id, $readIso));
        }

        $messages = $this->loadFormattedMessages((int) $conversation->id, (int) $context->customer_id);
        $isReadOnly = in_array($context->order_status, self::READ_ONLY_ORDER_STATUSES, true);

        return [
            'conversation' => [
                'id' => (int) $conversation->id,
                'order_id' => $orderId,
                'customer_id' => (int) $conversation->customer_id,
                'rider_id' => (int) $conversation->rider_id,
                'is_read_only' => $isReadOnly,
            ],
            'messages' => $messages,
            'unread_count' => 0,
            'is_read_only' => $isReadOnly,
            'quick_replies' => $context->viewer_role === 'customer'
                ? self::CUSTOMER_QUICK_REPLIES
                : self::RIDER_QUICK_REPLIES,
            'server_now' => OrderTimestampFormatter::toManilaIso($now),
        ];
    }

    /**
     * Send a message in an order's conversation.
     *
     * @return array<string, mixed>
     */
    public function sendMessage(User $user, int $orderId, string $rawMessage, Request $request): array
    {
        $context = $this->authorizeParticipant($user, $orderId);

        if (in_array($context->order_status, self::READ_ONLY_ORDER_STATUSES, true)) {
            throw new ConflictHttpException('This conversation is read-only because the order has ended.');
        }

        $sanitized = $this->sanitizeMessage($rawMessage);
        $maxLength = (int) config('salo.connect.message_max_length', 500);

        if ($sanitized === '') {
            throw ValidationException::withMessages([
                'message' => ['Message cannot be empty.'],
            ]);
        }

        if (mb_strlen($sanitized) > $maxLength) {
            throw ValidationException::withMessages([
                'message' => ["Message must not exceed {$maxLength} characters."],
            ]);
        }

        $conversation = $this->findOrCreateConversation($context);
        $now = CarbonImmutable::now();

        $messageId = (int) DB::table('messages')->insertGetId([
            'conversation_id' => (int) $conversation->id,
            'sender_id' => (int) $user->user_id,
            'message' => $sanitized,
            'created_at' => $now->toDateTimeString(),
            'read_at' => null,
        ]);

        DB::table('conversations')
            ->where('id', $conversation->id)
            ->update(['updated_at' => $now->toDateTimeString()]);

        $formatted = [
            'id' => $messageId,
            'conversation_id' => (int) $conversation->id,
            'order_id' => $orderId,
            'sender_id' => (int) $user->user_id,
            'sender_role' => $context->viewer_role,
            'sender_name' => trim((string) ($user->first_name ?? '')) ?: ucfirst($context->viewer_role),
            'message' => $sanitized,
            'created_at' => OrderTimestampFormatter::toManilaIso($now),
            'read_at' => null,
        ];

        $serverNowIso = OrderTimestampFormatter::toManilaIso($now) ?? $now->toIso8601String();
        event(new MessageSent($orderId, $formatted, $serverNowIso));

        return [
            'message' => $formatted,
            'server_now' => $serverNowIso,
        ];
    }

    /**
     * Count unread messages for a viewer on an order.
     */
    public function countUnreadForUser(int $orderId, int $userId): int
    {
        $convId = DB::table('conversations')->where('order_id', $orderId)->value('id');
        if (! $convId) {
            return 0;
        }

        return (int) DB::table('messages')
            ->where('conversation_id', $convId)
            ->where('sender_id', '!=', $userId)
            ->whereNull('read_at')
            ->count();
    }

    private function authorizeParticipant(User $user, int $orderId): object
    {
        $row = DB::table('orders as o')
            ->leftJoin('deliveries as d', 'd.order_id', '=', 'o.order_id')
            ->leftJoin('riders as r', 'r.rider_id', '=', 'd.rider_id')
            ->where('o.order_id', $orderId)
            ->select([
                'o.order_id',
                'o.customer_id',
                'o.order_status',
                'd.rider_id',
                'r.user_id as rider_user_id',
            ])
            ->first();

        if (! $row) {
            throw new NotFoundHttpException('Order not found.');
        }

        $userId = (int) $user->user_id;
        $isCustomer = (int) $row->customer_id === $userId;
        $isAssignedRider = $row->rider_user_id !== null && (int) $row->rider_user_id === $userId;

        if (! $isCustomer && ! $isAssignedRider) {
            throw new NotFoundHttpException('Conversation not found.');
        }

        if ($row->rider_id === null) {
            throw new ConflictHttpException('Chat becomes available once a rider is assigned to this order.');
        }

        $row->viewer_role = $isCustomer ? 'customer' : 'rider';

        return $row;
    }

    private function findOrCreateConversation(object $context): object
    {
        $existing = DB::table('conversations')->where('order_id', $context->order_id)->first();
        if ($existing) {
            return $existing;
        }

        $now = now();
        $id = (int) DB::table('conversations')->insertGetId([
            'order_id' => (int) $context->order_id,
            'customer_id' => (int) $context->customer_id,
            'rider_id' => (int) $context->rider_id,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return DB::table('conversations')->where('id', $id)->first();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function loadFormattedMessages(int $conversationId, int $customerId): array
    {
        return DB::table('messages as m')
            ->leftJoin('users as u', 'u.user_id', '=', 'm.sender_id')
            ->where('m.conversation_id', $conversationId)
            ->orderBy('m.created_at')
            ->orderBy('m.id')
            ->get([
                'm.id',
                'm.conversation_id',
                'm.sender_id',
                'm.message',
                'm.created_at',
                'm.read_at',
                'u.first_name as sender_first_name',
            ])
            ->map(static function (object $row) use ($customerId): array {
                $role = (int) $row->sender_id === $customerId ? 'customer' : 'rider';

                return [
                    'id' => (int) $row->id,
                    'conversation_id' => (int) $row->conversation_id,
                    'sender_id' => (int) $row->sender_id,
                    'sender_role' => $role,
                    'sender_name' => trim((string) ($row->sender_first_name ?? '')) ?: ucfirst($role),
                    'message' => (string) $row->message,
                    'created_at' => OrderTimestampFormatter::toManilaIso($row->created_at),
                    'read_at' => OrderTimestampFormatter::toManilaIso($row->read_at),
                ];
            })
            ->values()
            ->all();
    }

    private function sanitizeMessage(string $raw): string
    {
        $stripped = strip_tags($raw);
        $normalized = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $stripped) ?? $stripped;

        return trim($normalized);
    }
}
