<?php

namespace App\Features\Restaurants\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateMenuItemRequest extends FormRequest
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
        $maxKb = max(256, (int) config('salo.uploads.max_size_kb', 5120));
        $imgMimes = implode(',', (array) config('salo.uploads.allowed_image_types', ['jpg', 'jpeg', 'png', 'webp']));

        return [
            'restaurant_id' => ['nullable', 'integer'],
            'menu_category_id' => ['sometimes', 'required', 'integer'],
            'item_name' => ['sometimes', 'required', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:2000'],
            'base_price' => ['sometimes', 'required', 'numeric', 'gt:0', 'max:999999.99', 'regex:/^\d+(\.\d{1,2})?$/'],
            'availability_status' => ['sometimes', 'string', Rule::in(['available', 'temporarily_unavailable', 'sold_out', 'hidden'])],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'photo' => ['nullable', 'file', "mimes:{$imgMimes}", "max:{$maxKb}"],
            'remove_photo' => ['nullable', 'boolean'],
        ];
    }
}
