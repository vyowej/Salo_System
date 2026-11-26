<?php

namespace App\Features\Orders\Requests;

use Illuminate\Foundation\Http\FormRequest;

class DeliveryFeeQuoteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'restaurant_id' => ['required', 'integer', 'min:1'],
            'fulfillment' => ['nullable', 'string', 'in:delivery,pickup,dine_in'],
            'address_id' => ['nullable', 'integer', 'min:1'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
        ];
    }
}
