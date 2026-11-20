<?php

namespace App\Features\Admin\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RequestApplicationDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        abort_unless(in_array($this->route('type'), ['restaurant', 'rider'], true), 404, 'Invalid application type.');
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'document_name' => ['required', 'string', 'max:150'],
            'reason' => ['required', 'string', 'max:1000'],
            'instructions' => ['nullable', 'string', 'max:1000'],
            'due_date' => ['nullable', 'date', 'after_or_equal:today'],
        ];
    }
}
