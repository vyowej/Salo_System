<?php

namespace App\Features\Restaurants\Requests;

use Illuminate\Foundation\Http\FormRequest;

class BulkStoreMenuCategoriesRequest extends FormRequest
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
            'categories' => ['required', 'array', 'min:1', 'max:30'],
            'categories.*.category_name' => ['required', 'string', 'max:100'],
            'categories.*.description' => ['nullable', 'string', 'max:500'],
        ];
    }
}
