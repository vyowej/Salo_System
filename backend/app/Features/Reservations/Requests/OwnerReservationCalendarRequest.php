<?php

namespace App\Features\Reservations\Requests;

use Illuminate\Foundation\Http\FormRequest;

class OwnerReservationCalendarRequest extends FormRequest
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
        return [
            'restaurant_id' => ['nullable', 'integer', 'min:1'],
            'month' => ['required', 'string', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/'],
        ];
    }
}
