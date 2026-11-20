<?php

namespace App\Features\Admin\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class DecideApplicationRequest extends FormRequest
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
            'decision' => ['required', 'string', Rule::in(['under_review', 'additional_documents_required', 'approve', 'reject'])],
            'note' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
