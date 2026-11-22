<?php

namespace App\Features\Admin\Requests;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class AdminReservationStatsRequest extends FormRequest
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
            'date_from' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'date_to' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'restaurant_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
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
