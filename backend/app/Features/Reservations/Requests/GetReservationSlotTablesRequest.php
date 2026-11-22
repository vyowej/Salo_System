<?php

namespace App\Features\Reservations\Requests;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class GetReservationSlotTablesRequest extends FormRequest
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
            'start' => [
                'required',
                'string',
                'regex:/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?$/',
            ],
            'party_size' => ['required', 'integer', 'min:1', 'max:100'],
            'dining_area' => ['nullable', 'string', 'max:100'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($validator->errors()->has('start')) {
                return;
            }

            $rawStart = (string) $this->input('start', '');
            try {
                CarbonImmutable::parse($rawStart, 'Asia/Manila');
            } catch (\Throwable) {
                $validator->errors()->add('start', 'The start field must be a valid datetime (YYYY-MM-DDTHH:MM).');
            }
        });
    }
}
