<?php

namespace App\Features\Reservations\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateOwnerTableRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $updates = [];

        if ($this->has('table_name') && is_string($this->input('table_name'))) {
            $updates['table_name'] = trim($this->input('table_name'));
        }

        if ($this->has('dining_area')) {
            $rawArea = $this->input('dining_area');
            $trimmedArea = is_string($rawArea) ? trim($rawArea) : $rawArea;
            $updates['dining_area'] = ($trimmedArea === '' || $trimmedArea === null) ? null : $trimmedArea;
        }

        if ($this->has('description')) {
            $rawDesc = $this->input('description');
            $trimmedDesc = is_string($rawDesc) ? trim($rawDesc) : $rawDesc;
            $updates['description'] = ($trimmedDesc === '' || $trimmedDesc === null) ? null : $trimmedDesc;
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
            'table_name' => ['sometimes', 'required', 'string', 'max:50'],
            'seating_capacity' => ['sometimes', 'required', 'integer', 'min:1', 'max:100'],
            'min_party_size' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:100'],
            'dining_area' => ['sometimes', 'nullable', 'string', 'max:100'],
            'description' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($this->filled('seating_capacity') && $this->filled('min_party_size')) {
                $capacity = (int) $this->input('seating_capacity');
                $minParty = (int) $this->input('min_party_size');

                if ($minParty > $capacity) {
                    $validator->errors()->add(
                        'min_party_size',
                        "The min party size field must be less than or equal to {$capacity}."
                    );
                }
            }
        });
    }
}
