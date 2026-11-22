<?php

namespace App\Features\Reservations\Requests;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class ListOwnerReservationsRequest extends FormRequest
{
    public const MAX_DATE_RANGE_DAYS = 366;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $updates = [];
        foreach (['dining_area', 'search'] as $field) {
            if ($this->has($field) && is_string($this->input($field))) {
                $clean = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $this->input($field));
                $updates[$field] = trim((string) $clean);
            }
        }
        if ($updates !== []) {
            $this->merge($updates);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'restaurant_id' => ['nullable', 'integer', 'min:1'],
            'date' => ['nullable', 'date_format:Y-m-d'],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'status' => ['nullable', 'string', 'max:200'],
            'group' => ['nullable', 'string', Rule::in(['active', 'pending', 'history', 'all'])],
            'table_id' => ['nullable', 'integer', 'min:1'],
            'dining_area' => ['nullable', 'string', 'max:100'],
            'search' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', 'string', Rule::in(['time_asc', 'time_desc', 'created_desc'])],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
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
