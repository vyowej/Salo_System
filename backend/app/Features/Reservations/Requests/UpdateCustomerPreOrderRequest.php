<?php

namespace App\Features\Reservations\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCustomerPreOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('notes') && is_string($this->input('notes'))) {
            $clean = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $this->input('notes'));
            $trimmed = trim((string) $clean);
            $this->merge(['notes' => $trimmed === '' ? null : $trimmed]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'notes' => ['nullable', 'string', 'max:500'],
            'items' => ['required', 'array', 'max:50'],
            'items.*.menu_item_id' => ['required', 'integer', 'min:1'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:50'],
            'items.*.add_on_option_ids' => ['nullable', 'array', 'max:30'],
            'items.*.add_on_option_ids.*' => ['integer', 'min:1'],
            'items.*.special_instructions' => ['nullable', 'string', 'max:500'],
        ];
    }
}
