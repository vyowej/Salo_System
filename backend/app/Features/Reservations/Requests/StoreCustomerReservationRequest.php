<?php

namespace App\Features\Reservations\Requests;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreCustomerReservationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $updates = [];

        foreach (['dining_area', 'contact_name', 'contact_phone', 'special_requests'] as $field) {
            if ($this->has($field)) {
                $raw = $this->input($field);
                $trimmed = is_string($raw) ? trim($raw) : $raw;
                $updates[$field] = ($trimmed === '' || $trimmed === null) ? null : $trimmed;
            }
        }

        if ($this->has('idempotency_key') && is_string($this->input('idempotency_key'))) {
            $updates['idempotency_key'] = trim($this->input('idempotency_key'));
        }

        if ($updates !== []) {
            $this->merge($updates);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'restaurant_id' => ['required', 'integer', 'min:1'],
            'start' => [
                'required',
                'string',
                'regex:/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?$/',
            ],
            'party_size' => ['required', 'integer', 'min:1', 'max:100'],
            'table_id' => ['nullable', 'integer', 'min:1'],
            'dining_area' => ['nullable', 'string', 'max:100'],
            'contact_name' => ['nullable', 'string', 'max:150'],
            'contact_phone' => ['nullable', 'string', 'max:30'],
            'special_requests' => ['nullable', 'string', 'max:500'],
            'idempotency_key' => ['required', 'string', 'min:8', 'max:64'],
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
