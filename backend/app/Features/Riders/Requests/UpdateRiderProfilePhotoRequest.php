<?php

namespace App\Features\Riders\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateRiderProfilePhotoRequest extends FormRequest
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
        $maxKb = (int) config('salo.uploads.max_size_kb', 5120);

        return [
            'photo' => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'max:'.$maxKb],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'photo.required' => 'Please select a profile photo to upload.',
            'photo.file' => 'The uploaded profile photo is invalid.',
            'photo.mimes' => 'Profile photo must be a JPG, PNG, or WebP image.',
            'photo.max' => 'Profile photo must not exceed 5 MB.',
        ];
    }
}
