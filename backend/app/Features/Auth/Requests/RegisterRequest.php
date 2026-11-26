<?php

namespace App\Features\Auth\Requests;

use App\Support\PasswordPolicy;
use Illuminate\Foundation\Http\FormRequest;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (! $this->exists('middle_initial')) {
            return;
        }

        $raw = $this->input('middle_initial');
        if (is_string($raw)) {
            $trimmed = trim($raw);
            if ($trimmed === '') {
                $this->merge(['middle_initial' => null]);
                return;
            }
            if (preg_match('/^[a-zA-Z]\.$/', $trimmed) === 1) {
                $trimmed = rtrim($trimmed, '.');
            }
            $this->merge(['middle_initial' => $trimmed]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'username' => ['required', 'string', 'min:3', 'max:30', 'regex:/^[a-zA-Z0-9_]+$/', 'unique:users,username'],
            'first_name' => ['required', 'string', 'max:100'],
            'middle_initial' => ['nullable', 'string', 'size:1', 'regex:/^[a-zA-Z]$/'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => [
                'required',
                'string',
                'confirmed',
                new PasswordPolicy(
                    username: (string) $this->input('username', ''),
                    email: (string) $this->input('email', ''),
                ),
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'middle_initial.size' => 'Middle initial must be a single letter.',
            'middle_initial.regex' => 'Middle initial must be a letter (A-Z).',
        ];
    }
}
