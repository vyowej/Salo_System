<?php

namespace App\Features\Reviews\Requests;

use Illuminate\Foundation\Http\FormRequest;

class OverrideFeaturedRestaurantRequest extends FormRequest
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
            'reason' => ['required', 'string', 'min:3', 'max:500'],
        ];
    }
}
