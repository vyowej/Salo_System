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
        bool $includeInternalActorIds = false,
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
        $cancellationDeadline = null;
        if ($startCarbon !== null) {
            if ($status === ReservationStatus::PENDING) {
                $cancellationDeadline = $startCarbon;
                $canCancel = $referenceNow->lessThanOrEqualTo($startCarbon);
            } elseif (
                in_array($status, [
                    ReservationStatus::APPROVED,
                    ReservationStatus::AWAITING_PAYMENT,
                    ReservationStatus::CONFIRMED,
                ], true)
            ) {
                $cutoffThreshold = $startCarbon->subMinutes($cutoff);
                $cancellationDeadline = $cutoffThreshold;
                $canCancel = $referenceNow->lessThanOrEqualTo($cutoffThreshold);
            }
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
            'deposit_display_status' => self::depositDisplayStatus((string) ($data->deposit_status ?? 'none'), $status),
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
            'expires_at' => OrderTimestampFormatter::toManilaIso(
                ReservationExpiry::expiresAt(
                    $data,
                    isset($data->reservation_pending_expiry_minutes)
                        ? (int) $data->reservation_pending_expiry_minutes
                        : null,
                ),
            ),
            'no_show_marked_at' => OrderTimestampFormatter::toManilaIso($data->no_show_marked_at ?? null),
            'created_at' => OrderTimestampFormatter::toManilaIso($data->created_at ?? null),
            'updated_at' => OrderTimestampFormatter::toManilaIso($data->updated_at ?? null),
            'can_cancel' => $canCancel,
            'is_upcoming' => $isUpcoming,
            'cancellation_cutoff_minutes' => $cutoff,
            'cancellation_deadline' => OrderTimestampFormatter::toManilaIso($cancellationDeadline),
        ];

        if (isset($data->restaurant_phone)) {
            $formatted['restaurant_phone'] = $data->restaurant_phone !== null ? (string) $data->restaurant_phone : null;
        }
        if (isset($data->restaurant_address)) {
            $formatted['restaurant_address'] = $data->restaurant_address !== null ? (string) $data->restaurant_address : null;
        }
        if (isset($data->restaurant_logo_path)) {
            $formatted['restaurant_logo_path'] = $data->restaurant_logo_path !== null ? (string) $data->restaurant_logo_path : null;
        }
        if (isset($data->reservation_notes)) {
            $formatted['reservation_notes'] = $data->reservation_notes !== null ? (string) $data->reservation_notes : null;
        }
        if (isset($data->assigned_dining_area_differs)) {
            $formatted['assigned_dining_area_differs'] = (bool) $data->assigned_dining_area_differs;
        }

        if ($includeInternalActorIds) {
            $formatted['no_show_marked_by'] = isset($data->no_show_marked_by) && $data->no_show_marked_by !== null
                ? (int) $data->no_show_marked_by
                : null;
        }

        if ($statusHistory !== null) {
            $formatted['status_history'] = array_values(array_map(
                static fn (object|array $entry): array => self::formatHistoryEntry($entry, $includeInternalActorIds),
                $statusHistory,
            ));
        }

        return $formatted;
    }

    /**
     * Format a reservation row for the restaurant owner/staff workspace, adding status_label,
     * guest_history, allowed_actions, and attention flags.
     *
     * @param  object|array<string, mixed>  $row
     * @param  array<string, int>  $guestHistory
     * @param  array<int, string>  $allowedActions
     * @param  array<int, object|array<string, mixed>>|null  $statusHistory
     * @return array<string, mixed>
     */
    public static function formatOwner(
        object|array $row,
        ?CarbonInterface $now = null,
        ?int $cancellationCutoffMinutes = null,
        ?array $statusHistory = null,
        array $guestHistory = ['visits' => 0, 'no_shows' => 0, 'cancellations' => 0],
        array $allowedActions = [],
        ?string $attention = null,
        array $allowedDepositActions = [],
    ): array {
        $base = self::format($row, $now, $cancellationCutoffMinutes, $statusHistory, true);
        $status = (string) ($base['reservation_status'] ?? ReservationStatus::PENDING);

        $statusLabels = [
            ReservationStatus::PENDING => 'Pending',
            ReservationStatus::APPROVED => 'Approved',
            ReservationStatus::AWAITING_PAYMENT => 'Awaiting Deposit',
            ReservationStatus::CONFIRMED => 'Confirmed',
            ReservationStatus::ARRIVED => 'Arrived',
            ReservationStatus::SEATED => 'Seated',
            ReservationStatus::COMPLETED => 'Completed',
            ReservationStatus::CANCELLED => 'Cancelled',
            ReservationStatus::NO_SHOW => 'No-Show',
            ReservationStatus::REJECTED => 'Rejected',
            ReservationStatus::EXPIRED => 'Expired',
        ];

        $base['reference'] = $base['reservation_reference'];
        $base['status'] = $status;
        $base['status_label'] = $statusLabels[$status] ?? ucfirst($status);
        $base['party_size'] = $base['number_of_guests'];
        $base['guest_history'] = [
            'visits' => (int) ($guestHistory['visits'] ?? 0),
            'no_shows' => (int) ($guestHistory['no_shows'] ?? 0),
            'cancellations' => (int) ($guestHistory['cancellations'] ?? 0),
        ];
        $base['allowed_actions'] = array_values($allowedActions);
        $base['allowed_deposit_actions'] = array_values($allowedDepositActions);
        $base['deposit_action_needed'] = $status === ReservationStatus::CANCELLED
            && ($base['deposit_status'] ?? 'none') === 'paid';
        $base['attention'] = $attention;

        return $base;
    }

    public static function depositDisplayStatus(string $depositStatus, string $reservationStatus): string
    {
        if (
            $depositStatus === 'pending'
            && in_array($reservationStatus, [
                ReservationStatus::REJECTED,
                ReservationStatus::EXPIRED,
                ReservationStatus::CANCELLED,
                ReservationStatus::NO_SHOW,
            ], true)
        ) {
            return 'not_collected';
        }

        return $depositStatus;
    }

    /**
     * Format a reservation row for the admin monitoring workspace.
     *
     * @param  object|array<string, mixed>  $row
     * @param  array<int, object|array<string, mixed>>|null  $statusHistory
     * @return array<string, mixed>
     */
    public static function formatAdmin(
        object|array $row,
        ?CarbonInterface $now = null,
        ?int $cancellationCutoffMinutes = null,
        ?array $statusHistory = null,
        ?string $attention = null,
        ?array $customerHistory = null,
        ?array $restaurantSettings = null,
    ): array {
        $data = is_array($row) ? (object) $row : $row;
        $base = self::format($data, $now, $cancellationCutoffMinutes, $statusHistory, true);
        $status = (string) ($base['reservation_status'] ?? ReservationStatus::PENDING);

        $statusLabels = [
            ReservationStatus::PENDING => 'Pending',
            ReservationStatus::APPROVED => 'Approved',
            ReservationStatus::AWAITING_PAYMENT => 'Awaiting Deposit',
            ReservationStatus::CONFIRMED => 'Confirmed',
            ReservationStatus::ARRIVED => 'Arrived',
            ReservationStatus::SEATED => 'Seated',
            ReservationStatus::COMPLETED => 'Completed',
            ReservationStatus::CANCELLED => 'Cancelled',
            ReservationStatus::NO_SHOW => 'No-Show',
            ReservationStatus::REJECTED => 'Rejected',
            ReservationStatus::EXPIRED => 'Expired',
        ];

        $base['reference'] = $base['reservation_reference'];
        $base['status'] = $status;
        $base['status_label'] = $statusLabels[$status] ?? ucfirst($status);
        $base['party_size'] = $base['number_of_guests'];
        $base['attention'] = $attention;
        $base['can_admin_cancel'] = false;

        $base['restaurant'] = [
            'restaurant_id' => isset($data->restaurant_id) ? (int) $data->restaurant_id : null,
            'name' => isset($data->restaurant_name) ? (string) $data->restaurant_name : null,
        ];

        if ($customerHistory !== null) {
            $base['customer_history'] = [
                'visits' => (int) ($customerHistory['visits'] ?? 0),
                'no_shows' => (int) ($customerHistory['no_shows'] ?? 0),
                'cancellations' => (int) ($customerHistory['cancellations'] ?? 0),
                'total_reservations' => (int) ($customerHistory['total_reservations'] ?? 0),
            ];
        }

        if ($restaurantSettings !== null) {
            $base['restaurant_settings'] = $restaurantSettings;
        }

        return $base;
    }

    /**
     * @param  object|array<string, mixed>  $entry
     * @return array<string, mixed>
     */
    public static function formatHistoryEntry(object|array $entry, bool $includeInternalActorIds = false): array
    {
        $row = is_array($entry) ? (object) $entry : $entry;
        $actorName = trim(sprintf(
            '%s %s',
            (string) ($row->actor_first_name ?? ''),
            (string) ($row->actor_last_name ?? ''),
        ));

        $result = [
            'history_id' => (int) ($row->history_id ?? 0),
            'reservation_id' => (int) ($row->reservation_id ?? 0),
            'from_status' => isset($row->from_status) && $row->from_status !== null ? (string) $row->from_status : null,
            'to_status' => (string) ($row->to_status ?? ''),
            'changed_by_role' => (string) ($row->changed_by_role ?? 'system'),
            'note' => isset($row->note) && $row->note !== null ? (string) $row->note : null,
            'created_at' => OrderTimestampFormatter::toManilaIso($row->created_at ?? null),
        ];

        if ($includeInternalActorIds) {
            $result['changed_by_user_id'] = isset($row->changed_by_user_id) && $row->changed_by_user_id !== null
                ? (int) $row->changed_by_user_id
                : null;
            $result['actor_name'] = $actorName !== '' ? $actorName : null;
        }

        return $result;
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
