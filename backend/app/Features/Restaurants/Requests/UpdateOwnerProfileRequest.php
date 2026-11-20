<?php

namespace App\Features\Restaurants\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateOwnerProfileRequest extends FormRequest
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
            'description' => ['nullable', 'string', 'max:2000'],
            'contact_phone' => ['sometimes', 'required', 'string', 'max:30'],
            'business_email' => ['sometimes', 'required', 'string', 'email', 'max:255'],
            'offers_delivery' => ['sometimes', 'boolean'],
            'offers_pickup' => ['sometimes', 'boolean'],
        ];
    }
}
