<?php

namespace App\Features\Reservations\Support;

class ReservationStatus
{
    public const PENDING = 'pending';
    public const APPROVED = 'approved';
    public const AWAITING_PAYMENT = 'awaiting_payment';
    public const CONFIRMED = 'confirmed';
    public const ARRIVED = 'arrived';
    public const SEATED = 'seated';
    public const COMPLETED = 'completed';
    public const CANCELLED = 'cancelled';
    public const NO_SHOW = 'no_show';
    public const REJECTED = 'rejected';
    public const EXPIRED = 'expired';

    /**
     * All valid reservation_status enum values.
     *
     * @var array<int, string>
     */
    public const ALL = [
        self::PENDING,
        self::APPROVED,
        self::AWAITING_PAYMENT,
        self::CONFIRMED,
        self::ARRIVED,
        self::SEATED,
        self::COMPLETED,
        self::CANCELLED,
        self::NO_SHOW,
        self::REJECTED,
        self::EXPIRED,
    ];

    /**
     * Statuses that hold/block a table time window.
     *
     * @var array<int, string>
     */
    public const BLOCKING = [
        self::PENDING,
        self::APPROVED,
        self::AWAITING_PAYMENT,
        self::CONFIRMED,
        self::ARRIVED,
        self::SEATED,
    ];

    /**
     * Terminal statuses from which no further transitions are allowed.
     *
     * @var array<int, string>
     */
    public const TERMINAL = [
        self::REJECTED,
        self::COMPLETED,
        self::CANCELLED,
        self::NO_SHOW,
        self::EXPIRED,
    ];

    /**
     * Default state-machine transition map fallback if config is unavailable.
     *
     * @var array<string, array<int, string>>
     */
    public const DEFAULT_TRANSITIONS = [
        self::PENDING => [
            self::APPROVED,
            self::CONFIRMED,
            self::AWAITING_PAYMENT,
            self::REJECTED,
            self::CANCELLED,
            self::EXPIRED,
        ],
        self::APPROVED => [
            self::CONFIRMED,
            self::AWAITING_PAYMENT,
            self::CANCELLED,
        ],
        self::AWAITING_PAYMENT => [
            self::CONFIRMED,
            self::CANCELLED,
            self::EXPIRED,
        ],
        self::CONFIRMED => [
            self::ARRIVED,
            self::SEATED,
            self::NO_SHOW,
            self::CANCELLED,
        ],
        self::ARRIVED => [
            self::SEATED,
            self::NO_SHOW,
            self::CANCELLED,
        ],
        self::SEATED => [
            self::COMPLETED,
        ],
        self::REJECTED => [],
        self::COMPLETED => [],
        self::CANCELLED => [],
        self::NO_SHOW => [],
        self::EXPIRED => [],
    ];

    public static function isValid(string $status): bool
    {
        return in_array(strtolower(trim($status)), self::ALL, true);
    }

    public static function isBlocking(string $status): bool
    {
        return in_array(strtolower(trim($status)), self::BLOCKING, true);
    }

    public static function isTerminal(string $status): bool
    {
        return in_array(strtolower(trim($status)), self::TERMINAL, true);
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function transitionMap(): array
    {
        $configured = config('salo.reservations.transitions');

        return is_array($configured) && $configured !== []
            ? $configured
            : self::DEFAULT_TRANSITIONS;
    }

    /**
     * @return array<int, string>
     */
    public static function allowedTransitions(string $from): array
    {
        $normalizedFrom = strtolower(trim($from));
        $map = self::transitionMap();

        if (! isset($map[$normalizedFrom]) || ! is_array($map[$normalizedFrom])) {
            return [];
        }

        return array_values(array_map(
            static fn (mixed $status): string => strtolower(trim((string) $status)),
            $map[$normalizedFrom],
        ));
    }

    public static function canTransition(string $from, string $to): bool
    {
        $normalizedFrom = strtolower(trim($from));
        $normalizedTo = strtolower(trim($to));

        if ($normalizedFrom === '' || $normalizedTo === '' || $normalizedFrom === $normalizedTo) {
            return false;
        }

        if (! self::isValid($normalizedFrom) || ! self::isValid($normalizedTo)) {
            return false;
        }

        return in_array($normalizedTo, self::allowedTransitions($normalizedFrom), true);
    }
}
