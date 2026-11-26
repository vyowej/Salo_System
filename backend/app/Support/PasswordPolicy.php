<?php

namespace App\Support;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

final class PasswordPolicy implements ValidationRule
{
    public const COMMON_PASSWORDS = [
        'password',
        'password1',
        'password123',
        'passw0rd',
        'p@ssw0rd',
        'p@ssword1',
        '12345678',
        '123456789',
        '1234567890',
        'qwerty123',
        'qwertyuiop',
        'admin123',
        'welcome123',
        'letmein123',
        'iloveyou',
        'abc12345',
        '1234qwer',
        'changeme',
        'default123',
        'monkey123',
        'dragon123',
        'salo1234',
        'salo@123',
    ];

    public function __construct(
        private readonly ?string $username = null,
        private readonly ?string $email = null,
    ) {}

    /**
     * @return list<string>
     */
    public static function check(string $password, ?string $username = null, ?string $email = null): array
    {
        $errors = [];

        if (mb_strlen($password) < 8) {
            $errors[] = 'Password must be at least 8 characters long.';
        }
        if (preg_match('/[A-Z]/', $password) !== 1) {
            $errors[] = 'Password must include at least one uppercase letter.';
        }
        if (preg_match('/[a-z]/', $password) !== 1) {
            $errors[] = 'Password must include at least one lowercase letter.';
        }
        if (preg_match('/[0-9]/', $password) !== 1) {
            $errors[] = 'Password must include at least one number.';
        }
        if (preg_match('/[^A-Za-z0-9\s]/', $password) !== 1) {
            $errors[] = 'Password must include at least one special character.';
        }

        $lowerPassword = mb_strtolower($password);

        $cleanUsername = trim((string) ($username ?? ''));
        if ($cleanUsername !== '' && mb_strlen($cleanUsername) >= 2 && str_contains($lowerPassword, mb_strtolower($cleanUsername))) {
            $errors[] = 'Password must not contain your username.';
        }

        $cleanEmail = trim((string) ($email ?? ''));
        if ($cleanEmail !== '' && str_contains($lowerPassword, mb_strtolower($cleanEmail))) {
            $errors[] = 'Password must not contain your email address.';
        }

        if (in_array($lowerPassword, self::COMMON_PASSWORDS, true)) {
            $errors[] = 'Password is too common. Please choose a stronger password.';
        }

        return $errors;
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $password = (string) $value;
        $errors = self::check($password, $this->username, $this->email);
        foreach ($errors as $error) {
            $fail($error);
        }
    }
}
