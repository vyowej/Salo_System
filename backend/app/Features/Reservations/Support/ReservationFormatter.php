<?php

namespace App\Features\Reservations\Support;

use App\Features\Orders\Support\OrderTimestampFormatter;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

class ReservationFormatter
{
    /**
     * Format a database reservation row (with optional joined restaurant, table, and customer columns)
     * into the standard SALO API payload shape.
     *
     * @param  object|array<string, mixed>  $row
     * @param  array<int, object|array<string, mixed>>|null  $statusHistory
     * @return array<string, mixed>
     */
    public static function format(
        object|array $row,
        ?CarbonInterface $now = null,
        ?int $cancellationCutoffMinutes = null,
        ?array $statusHistory = null,
    ): array {
        $data = is_array($row) ? (object) $row : $row;

        $referenceNow = $now !== null
            ? CarbonImmutable::instance($now)->setTimezone('Asia/Manila')
            : CarbonImmutable::now('Asia/Manila');

        $startCarbon = self::parseManilaDateTime($data->reservation_start ?? null);
        $endCarbon = self::parseManilaDateTime($data->reservation_end ?? null);

        $status = (string) ($data->reservation_status ?? ReservationStatus::PENDING);

        $cutoff = $cancellationCutoffMinutes;
        if ($cutoff === null && isset($data->reservation_cancellation_cutoff_minutes)) {
            $cutoff = max(0, (int) $data->reservation_cancellation_cutoff_minutes);
        }
        $cutoff = $cutoff ?? 0;

        $isUpcoming = ReservationStatus::isBlocking($status)
            && $endCarbon !== null
            && $endCarbon->greaterThanOrEqualTo($referenceNow);

        $canCancel = false;
        if (
            in_array($status, [
                ReservationStatus::PENDING,
                ReservationStatus::APPROVED,
                ReservationStatus::AWAITING_PAYMENT,
                ReservationStatus::CONFIRMED,
            ], true)
            && $startCarbon !== null
        ) {
            $cutoffThreshold = $startCarbon->subMinutes($cutoff);
            $canCancel = $referenceNow->lessThanOrEqualTo($cutoffThreshold);
        }

        $tableId = isset($data->table_id) && $data->table_id !== null ? (int) $data->table_id : null;
        $table = null;
        if ($tableId !== null) {
            $table = [
                'table_id' => $tableId,
                'table_name' => isset($data->table_name) ? (string) $data->table_name : null,
                'dining_area' => isset($data->dining_area) && $data->dining_area !== null ? (string) $data->dining_area : null,
                'description' => isset($data->table_description)
                    ? ($data->table_description !== null ? (string) $data->table_description : null)
                    : (isset($data->description) && $data->description !== null ? (string) $data->description : null),
                'seating_capacity' => isset($data->seating_capacity) && $data->seating_capacity !== null ? (int) $data->seating_capacity : null,
                'min_party_size' => isset($data->min_party_size) && $data->min_party_size !== null ? (int) $data->min_party_size : 1,
            ];
        }

        $fallbackCustomerName = trim(sprintf(
            '%s %s',
            (string) ($data->customer_first_name ?? $data->first_name ?? ''),
            (string) ($data->customer_last_name ?? $data->last_name ?? ''),
        ));

        $contactName = isset($data->contact_name) && trim((string) $data->contact_name) !== ''
            ? trim((string) $data->contact_name)
            : ($fallbackCustomerName !== '' ? $fallbackCustomerName : null);

        $contactPhone = isset($data->contact_phone) && trim((string) $data->contact_phone) !== ''
            ? trim((string) $data->contact_phone)
            : (isset($data->customer_phone) && trim((string) $data->customer_phone) !== ''
                ? trim((string) $data->customer_phone)
                : (isset($data->phone_number) && trim((string) $data->phone_number) !== ''
                    ? trim((string) $data->phone_number)
                    : (isset($data->phone) && trim((string) $data->phone) !== '' ? trim((string) $data->phone) : null)));

        $customerEmail = isset($data->customer_email) && trim((string) $data->customer_email) !== ''
            ? trim((string) $data->customer_email)
            : (isset($data->email) && trim((string) $data->email) !== '' ? trim((string) $data->email) : null);

        $durationMinutes = ($startCarbon !== null && $endCarbon !== null)
            ? max(0, (int) $startCarbon->diffInMinutes($endCarbon, false))
            : null;

        $formatted = [
            'reservation_id' => (int) ($data->reservation_id ?? 0),
            'reservation_reference' => isset($data->reservation_reference) && $data->reservation_reference !== null
                ? (string) $data->reservation_reference
                : null,
            'restaurant_id' => (int) ($data->restaurant_id ?? 0),
            'restaurant_name' => isset($data->restaurant_name) && $data->restaurant_name !== null
                ? (string) $data->restaurant_name
                : null,
            'customer_id' => (int) ($data->customer_id ?? 0),
            'contact_name' => $contactName,
            'contact_phone' => $contactPhone,
            'customer_email' => $customerEmail,
            'customer' => [
                'customer_id' => (int) ($data->customer_id ?? 0),
                'contact_name' => $contactName,
                'contact_phone' => $contactPhone,
                'email' => $customerEmail,
            ],
            'table_id' => $tableId,
            'table' => $table,
            'reservation_start' => OrderTimestampFormatter::toManilaIso($data->reservation_start ?? null),
            'reservation_end' => OrderTimestampFormatter::toManilaIso($data->reservation_end ?? null),
            'reservation_date' => $startCarbon?->format('Y-m-d'),
            'reservation_time' => $startCarbon?->format('H:i'),
            'duration_minutes' => $durationMinutes,
            'number_of_guests' => (int) ($data->number_of_guests ?? 0),
            'reservation_status' => $status,
            'special_requests' => isset($data->special_requests) && $data->special_requests !== null
                ? (string) $data->special_requests
                : null,
            'deposit_amount' => number_format((float) ($data->deposit_amount ?? 0), 2, '.', ''),
            'deposit_status' => (string) ($data->deposit_status ?? 'none'),
            'service_fee' => number_format((float) ($data->service_fee ?? 0), 2, '.', ''),
            'is_fee_refundable' => (bool) ($data->is_fee_refundable ?? true),
            'cancellation_fee' => number_format((float) ($data->cancellation_fee ?? 0), 2, '.', ''),
            'cancelled_by' => isset($data->cancelled_by) && $data->cancelled_by !== null
                ? (string) $data->cancelled_by
                : null,
            'cancelled_at' => OrderTimestampFormatter::toManilaIso($data->cancelled_at ?? null),
            'cancellation_reason' => isset($data->cancellation_reason) && $data->cancellation_reason !== null
                ? (string) $data->cancellation_reason
                : null,
            'rejection_reason' => isset($data->rejection_reason) && $data->rejection_reason !== null
                ? (string) $data->rejection_reason
                : null,
            'rejected_at' => OrderTimestampFormatter::toManilaIso($data->rejected_at ?? null),
            'approved_at' => OrderTimestampFormatter::toManilaIso($data->approved_at ?? null),
            'confirmed_at' => OrderTimestampFormatter::toManilaIso($data->confirmed_at ?? null),
            'arrived_at' => OrderTimestampFormatter::toManilaIso($data->arrived_at ?? null),
            'seated_at' => OrderTimestampFormatter::toManilaIso($data->seated_at ?? null),
            'completed_at' => OrderTimestampFormatter::toManilaIso($data->completed_at ?? null),
            'expired_at' => OrderTimestampFormatter::toManilaIso($data->expired_at ?? null),
            'no_show_marked_at' => OrderTimestampFormatter::toManilaIso($data->no_show_marked_at ?? null),
            'no_show_marked_by' => isset($data->no_show_marked_by) && $data->no_show_marked_by !== null
                ? (int) $data->no_show_marked_by
                : null,
            'created_at' => OrderTimestampFormatter::toManilaIso($data->created_at ?? null),
            'updated_at' => OrderTimestampFormatter::toManilaIso($data->updated_at ?? null),
            'can_cancel' => $canCancel,
            'is_upcoming' => $isUpcoming,
        ];

        if ($statusHistory !== null) {
            $formatted['status_history'] = array_values(array_map(
                static fn (object|array $entry): array => self::formatHistoryEntry($entry),
                $statusHistory,
            ));
        }

        return $formatted;
    }

    /**
     * @param  object|array<string, mixed>  $entry
     * @return array<string, mixed>
     */
    public static function formatHistoryEntry(object|array $entry): array
    {
        $row = is_array($entry) ? (object) $entry : $entry;

        return [
            'history_id' => (int) ($row->history_id ?? 0),
            'reservation_id' => (int) ($row->reservation_id ?? 0),
            'from_status' => isset($row->from_status) && $row->from_status !== null ? (string) $row->from_status : null,
            'to_status' => (string) ($row->to_status ?? ''),
            'changed_by_user_id' => isset($row->changed_by_user_id) && $row->changed_by_user_id !== null
                ? (int) $row->changed_by_user_id
                : null,
            'changed_by_role' => (string) ($row->changed_by_role ?? 'system'),
            'note' => isset($row->note) && $row->note !== null ? (string) $row->note : null,
            'created_at' => OrderTimestampFormatter::toManilaIso($row->created_at ?? null),
        ];
    }

    private static function parseManilaDateTime(mixed $value): ?CarbonImmutable
    {
        if ($value === null || $value === '') {
            return null;
        }

        if ($value instanceof CarbonInterface) {
            return CarbonImmutable::instance($value)->setTimezone('Asia/Manila');
        }

        return CarbonImmutable::parse((string) $value, 'Asia/Manila')->setTimezone('Asia/Manila');
    }
}
