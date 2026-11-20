<?php

namespace App\Features\Locations\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ValidateServiceAreaRequest extends FormRequest
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
            'province' => ['required', 'string', 'max:100'],
            'city' => ['required', 'string', 'max:100'],
            'barangay' => ['nullable', 'string', 'max:100'],
            'restaurant_id' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
