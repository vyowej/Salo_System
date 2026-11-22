<?php

namespace App\Features\Reservations\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreOwnerTableRequest extends FormRequest
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
            'table_name' => ['required', 'string', 'max:50'],
            'seating_capacity' => ['required', 'integer', 'min:1', 'max:100'],
            'min_party_size' => ['nullable', 'integer', 'min:1', 'lte:seating_capacity'],
            'dining_area' => ['nullable', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:255'],
        ];
    }
}
