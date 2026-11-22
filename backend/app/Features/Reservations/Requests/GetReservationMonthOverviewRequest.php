<?php

namespace App\Features\Reservations\Requests;

use Illuminate\Foundation\Http\FormRequest;

class GetReservationMonthOverviewRequest extends FormRequest
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
            'month' => ['required', 'string', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/'],
            'party_size' => ['required', 'integer', 'min:1', 'max:100'],
        ];
    }
}
