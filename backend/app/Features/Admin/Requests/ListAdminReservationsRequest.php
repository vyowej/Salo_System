<?php

namespace App\Features\Admin\Requests;

use App\Features\Reservations\Support\ReservationAttention;
use App\Features\Reservations\Support\ReservationStatus;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class ListAdminReservationsRequest extends FormRequest
{
    public const MAX_DATE_RANGE_DAYS = 366;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
            'status' => ['sometimes', 'nullable', 'string', function (string $attribute, mixed $value, \Closure $fail): void {
                $raw = trim((string) $value);
                if ($raw === '' || $raw === 'all') {
                    return;
                }
                $parts = array_filter(array_map('trim', explode(',', $raw)), static fn (string $s): bool => $s !== '');
                foreach ($parts as $part) {
                    if (! in_array($part, ReservationStatus::ALL, true)) {
                        $fail("Invalid status filter value: {$part}.");
                        return;
                    }
                }
            }],
            'group' => ['sometimes', 'nullable', 'string', Rule::in(['all', 'active', 'pending', 'attention', 'history'])],
            'restaurant_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'attention' => ['sometimes', 'nullable', 'string', Rule::in(array_merge(['all', 'any'], ReservationAttention::ALL))],
            'deposit_status' => ['sometimes', 'nullable', 'string', Rule::in(['all', 'none', 'pending', 'paid', 'waived', 'refunded'])],
            'date_from' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'date_to' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'sort' => ['sometimes', 'nullable', 'string', Rule::in(['reservation_start', 'created_at', 'party_size'])],
            'direction' => ['sometimes', 'nullable', 'string', Rule::in(['asc', 'desc'])],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v): void {
            $dateFrom = trim((string) ($this->input('date_from') ?? ''));
            $dateTo = trim((string) ($this->input('date_to') ?? ''));

            if ($dateFrom !== '' && $dateTo !== '' && ! $v->errors()->has('date_from') && ! $v->errors()->has('date_to')) {
                $from = CarbonImmutable::createFromFormat('Y-m-d', $dateFrom, 'Asia/Manila');
                $to = CarbonImmutable::createFromFormat('Y-m-d', $dateTo, 'Asia/Manila');
                if ($from->diffInDays($to) > self::MAX_DATE_RANGE_DAYS) {
                    $v->errors()->add('date_to', 'Date range cannot exceed '.self::MAX_DATE_RANGE_DAYS.' days.');
                }
            }
        });
    }
}
