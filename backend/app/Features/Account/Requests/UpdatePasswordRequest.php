<?php

namespace App\Features\Account\Requests;

use App\Support\PasswordPolicy;
use Illuminate\Foundation\Http\FormRequest;

class UpdatePasswordRequest extends FormRequest
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
        $user = $this->user();

        return [
            'current_password' => ['required', 'string'],
            'password' => [
                'required',
                'string',
                'confirmed',
                'different:current_password',
                new PasswordPolicy(
                    username: $user?->username ? (string) $user->username : null,
                    email: $user?->email ? (string) $user->email : null,
                ),
            ],
        ];
    }
}
