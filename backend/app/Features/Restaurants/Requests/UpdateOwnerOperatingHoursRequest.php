<?php

namespace App\Features\Restaurants\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateOwnerOperatingHoursRequest extends FormRequest
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
            'restaurant_id' => ['nullable', 'integer'],
            'operating_hours' => ['required', 'array', 'min:1', 'max:35'],
            'operating_hours.*.day_of_week' => ['required', 'integer', 'between:0,6'],
            'operating_hours.*.opening_time' => ['nullable', 'string'],
            'operating_hours.*.closing_time' => ['nullable', 'string'],
            'operating_hours.*.closes_next_day' => ['nullable', 'boolean'],
            'operating_hours.*.is_closed' => ['nullable', 'boolean'],
        ];
    }
}
