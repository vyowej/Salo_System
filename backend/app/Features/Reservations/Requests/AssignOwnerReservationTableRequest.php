<?php

namespace App\Features\Reservations\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AssignOwnerReservationTableRequest extends FormRequest
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
            'table_id' => ['required', 'integer', 'min:1'],
        ];
    }
}
