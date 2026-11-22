<?php

namespace App\Features\Admin\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAdminRestaurantStatusRequest extends FormRequest
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
            'status' => ['required', 'string', Rule::in(['pending', 'approved', 'rejected', 'active', 'inactive', 'suspended'])],
            'reason' => ['nullable', 'string', 'max:255'],
            'apply_to_all_branches' => ['sometimes', 'boolean'],
        ];
    }
}
