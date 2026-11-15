<?php

namespace App\Features\Account\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $normalized = [];

        foreach (['username', 'first_name', 'middle_initial', 'last_name', 'phone_number', 'date_of_birth'] as $field) {
            if (! $this->exists($field)) {
                continue;
            }

            $value = $this->input($field);
            if (is_string($value)) {
                $value = trim($value);
            }

            if (in_array($field, ['middle_initial', 'phone_number', 'date_of_birth'], true) && $value === '') {
                $value = null;
            }

            $normalized[$field] = $value;
        }

        if ($normalized !== []) {
            $this->merge($normalized);
        }
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $userId = $this->user()?->user_id;

        return [
            'username' => [
                'sometimes',
                'required',
                'string',
                'min:3',
                'max:50',
                'regex:/^[a-zA-Z0-9._-]+$/',
                Rule::unique('users', 'username')->ignore($userId, 'user_id'),
            ],
            'first_name' => ['sometimes', 'required', 'string', 'max:100'],
            'middle_initial' => ['sometimes', 'nullable', 'string', 'size:1'],
            'last_name' => ['sometimes', 'required', 'string', 'max:100'],
            'phone_number' => ['sometimes', 'nullable', 'string', 'max:30', 'regex:/^[0-9+\-\s()]{7,30}$/'],
            'date_of_birth' => ['sometimes', 'nullable', 'date', 'before:today'],
        ];
    }
}
