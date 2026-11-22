<?php

namespace App\Features\Admin\Requests;

use App\Features\Reservations\Support\ReservationAttention;
use App\Features\Reservations\Support\ReservationStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ListAdminReservationsRequest extends FormRequest
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
        return [
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
            'status' => ['sometimes', 'nullable', 'string', Rule::in(array_merge(['all'], ReservationStatus::ALL))],
            'restaurant_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'attention' => ['sometimes', 'nullable', 'string', Rule::in(array_merge(['all', 'any'], ReservationAttention::ALL))],
            'date_from' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'date_to' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'direction' => ['sometimes', 'nullable', 'string', Rule::in(['asc', 'desc'])],
        ];
    }
}
