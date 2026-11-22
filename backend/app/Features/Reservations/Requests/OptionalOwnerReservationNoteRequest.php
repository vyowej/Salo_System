<?php

namespace App\Features\Reservations\Requests;

use Illuminate\Foundation\Http\FormRequest;

class OptionalOwnerReservationNoteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('note')) {
            $raw = $this->input('note');
            $trimmed = is_string($raw) ? trim($raw) : $raw;
            $this->merge([
                'note' => ($trimmed === '' || $trimmed === null) ? null : $trimmed,
            ]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}
