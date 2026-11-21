<?php

namespace App\Features\Reviews\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ModerateReviewRequest extends FormRequest
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
            'action' => ['required', 'string', Rule::in(['approve', 'restore', 'hide', 'remove'])],
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }
}
