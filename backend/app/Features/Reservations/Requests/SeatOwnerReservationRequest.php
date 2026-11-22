<?php

namespace App\Features\Reservations\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SeatOwnerReservationRequest extends FormRequest
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
            'table_id' => ['nullable', 'integer', 'min:1'],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}
