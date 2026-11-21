<?php

namespace App\Features\Restaurants\Requests;

use Illuminate\Foundation\Http\FormRequest;

class PublishMenuRequest extends FormRequest
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
        ];
    }
}
