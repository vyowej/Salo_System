<?php

namespace App\Features\Restaurants\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateOwnerMediaRequest extends FormRequest
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
            'logo_image' => ['nullable', 'file', "mimes:{$imgMimes}", "max:{$maxKb}"],
            'cover_image' => ['nullable', 'file', "mimes:{$imgMimes}", "max:{$maxKb}"],
            'remove_logo' => ['nullable', 'boolean'],
            'remove_cover' => ['nullable', 'boolean'],
        ];
    }
}
