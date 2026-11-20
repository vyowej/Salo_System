<?php

namespace App\Features\Riders\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateRiderProfileRequest extends FormRequest
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
            'emergency_contact_name' => ['sometimes', 'string', 'max:150'],
            'emergency_contact_relationship' => ['sometimes', 'string', Rule::in(['parent', 'spouse_partner', 'sibling', 'child', 'relative', 'friend', 'colleague', 'other'])],
            'emergency_contact_phone' => ['sometimes', 'string', 'max:30'],
            'emergency_contact_alt_phone' => ['nullable', 'string', 'max:30'],
            'preferred_hubs' => ['nullable', 'string', 'max:255'],
            'preferred_shifts' => ['nullable', 'array'],
            'preferred_shifts.*' => ['string', Rule::in(['breakfast', 'lunch', 'afternoon', 'dinner', 'late_night', 'flexible'])],
            'available_days' => ['nullable', 'array'],
            'available_days.*' => ['string', Rule::in(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])],
        ];
    }
}
