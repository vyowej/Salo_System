<?php

namespace App\Features\Auth\Requests;

use App\Models\User;
use App\Support\PasswordPolicy;
use Illuminate\Foundation\Http\FormRequest;

class ResetPasswordRequest extends FormRequest
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
        $email = strtolower(trim((string) $this->input('email', '')));
        $username = $email !== '' ? User::where('email', $email)->value('username') : null;

        return [
            'email' => ['required', 'string', 'email', 'max:255'],
            'token' => ['required', 'string'],
            'password' => [
                'required',
                'string',
                'confirmed',
                new PasswordPolicy(
                    username: $username ? (string) $username : null,
                    email: $email !== '' ? $email : null,
                ),
            ],
        ];
    }
}
