<?php

namespace App\Features\Orders\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RejectRestaurantOrderRequest extends FormRequest
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
            'reason' => ['required', 'string', 'max:255'],
        ];
    }
}
