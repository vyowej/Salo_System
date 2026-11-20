<?php

namespace App\Features\Restaurants\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateOwnerInventoryConfigRequest extends FormRequest
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
        $allowedModes = (array) config('salo.inventory.deduction_modes', ['manual', 'on_completion']);

        return [
            'restaurant_id' => ['nullable', 'integer', 'min:1'],
            'deduction_mode' => ['required', 'string', Rule::in($allowedModes)],
        ];
    }
}
