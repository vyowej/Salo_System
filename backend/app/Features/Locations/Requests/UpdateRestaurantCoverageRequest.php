<?php

namespace App\Features\Locations\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateRestaurantCoverageRequest extends FormRequest
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
            'restaurant_id' => ['nullable', 'integer', 'min:1'],
            'areas' => ['present', 'array'],
            'areas.*.province' => ['required', 'string', 'max:100'],
            'areas.*.city' => ['required', 'string', 'max:100'],
            'areas.*.barangay' => ['nullable', 'string', 'max:100'],
        ];
    }
}
