<?php

namespace App\Features\Admin\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AdminReservationStatsRequest extends FormRequest
{
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
}
