<?php

namespace App\Features\Restaurants\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateOwnerAcceptingStatusRequest extends FormRequest
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
            'accepting_orders' => ['sometimes', 'boolean'],
            'accepting_reservations' => ['sometimes', 'boolean'],
        ];
    }
}
