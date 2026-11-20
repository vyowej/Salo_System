<?php

namespace App\Features\Restaurants\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UploadRestaurantApplicationDocumentRequest extends FormRequest
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
        $docMimes = implode(',', (array) config('salo.uploads.allowed_document_types', ['pdf', 'jpg', 'jpeg', 'png']));

        return [
            'document_code' => ['required', 'string'],
            'request_id' => ['nullable', 'integer'],
            'file' => ['required', 'file', "mimes:{$docMimes}", "max:{$maxKb}"],
        ];
    }
}
