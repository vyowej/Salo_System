<?php

namespace App\Features\Reservations\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateOwnerPreOrderStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('reason') && is_string($this->input('reason'))) {
            $clean = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $this->input('reason'));
            $trimmed = trim((string) $clean);
            $this->merge(['reason' => $trimmed === '' ? null : $trimmed]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'restaurant_id' => ['nullable', 'integer', 'min:1'],
            'action' => ['required', 'string', Rule::in(['accept', 'prepare', 'ready', 'complete', 'reject', 'cancel'])],
            'reason' => ['nullable', 'string', 'max:255'],
        ];
    }
}
