<?php

namespace App\Features\Restaurants\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class BulkStoreMenuItemsRequest extends FormRequest
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
            'menu_category_id' => ['required', 'integer'],
            'items' => ['required', 'array', 'min:1', 'max:30'],
            'items.*.item_name' => ['required', 'string', 'max:200'],
            'items.*.description' => ['nullable', 'string', 'max:2000'],
            'items.*.base_price' => ['required', 'numeric', 'gt:0', 'max:999999.99', 'regex:/^\d+(\.\d{1,2})?$/'],
            'items.*.availability_status' => ['nullable', 'string', Rule::in(['available', 'temporarily_unavailable', 'sold_out', 'hidden'])],
            'photos' => ['nullable', 'array', 'max:30'],
            'photos.*' => ['nullable', 'file', "mimes:{$imgMimes}", "max:{$maxKb}"],
        ];
    }
}
