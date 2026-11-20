<?php

namespace App\Features\Admin\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAdminUserRequest extends FormRequest
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
            'first_name' => ['sometimes', 'string', 'max:100'],
            'last_name' => ['sometimes', 'string', 'max:100'],
            'phone_number' => ['nullable', 'string', 'max:30'],
            'user_role' => ['sometimes', 'string', Rule::in(['customer', 'admin'])],
            'account_status' => ['sometimes', 'string', Rule::in(['active', 'inactive', 'suspended', 'pending'])],
            'reason' => ['nullable', 'string', 'max:255'],
        ];
    }
}
