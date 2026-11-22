<?php

namespace App\Features\Reservations\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateOwnerReservationDepositRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('note') && is_string($this->input('note'))) {
            $trimmed = trim($this->input('note'));
            $this->merge(['note' => $trimmed === '' ? null : $trimmed]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'deposit_status' => ['required', 'string', Rule::in(['paid', 'waived', 'refunded'])],
            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }
}
