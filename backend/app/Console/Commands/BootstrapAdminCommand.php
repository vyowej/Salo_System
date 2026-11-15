<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class BootstrapAdminCommand extends Command
{
    protected $signature = 'salo:bootstrap-admin';

    protected $description = 'Create the very first SALO administrator account interactively (refuses if an admin already exists).';

    public function handle(): int
    {
        if (User::query()->where('user_role', 'admin')->exists()) {
            $this->error('Bootstrap aborted: an administrator account already exists.');

            return self::FAILURE;
        }

        $firstName = trim((string) $this->ask('First name'));
        $lastName = trim((string) $this->ask('Last name'));
        $username = trim((string) $this->ask('Username'));
        $email = strtolower(trim((string) $this->ask('Email address')));
        $password = (string) $this->secret('Password (minimum 8 characters)');
        $passwordConfirmation = (string) $this->secret('Confirm password');

        $validator = Validator::make([
            'first_name' => $firstName,
            'last_name' => $lastName,
            'username' => $username,
            'email' => $email,
            'password' => $password,
            'password_confirmation' => $passwordConfirmation,
        ], [
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'username' => ['required', 'string', 'min:3', 'max:50', 'regex:/^[a-zA-Z0-9._-]+$/', 'unique:users,username'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $admin = DB::transaction(function () use ($firstName, $lastName, $username, $email, $password): User {
            if (User::query()->where('user_role', 'admin')->lockForUpdate()->exists()) {
                throw new \RuntimeException('An administrator account already exists.');
            }

            $user = User::create([
                'username' => $username,
                'first_name' => $firstName,
                'middle_initial' => null,
                'last_name' => $lastName,
                'email' => $email,
                'password_hash' => Hash::make($password),
                'user_role' => 'admin',
                'account_status' => 'active',
                'email_verified_at' => now(),
            ]);

            DB::table('audit_logs')->insert([
                'actor_user_id' => null,
                'action' => 'bootstrap_admin',
                'entity_type' => 'user',
                'entity_id' => (string) $user->user_id,
                'old_values' => null,
                'new_values' => json_encode([
                    'user_id' => (int) $user->user_id,
                    'username' => $user->username,
                    'email' => $user->email,
                    'user_role' => $user->user_role,
                    'account_status' => $user->account_status,
                ], JSON_THROW_ON_ERROR),
                'reason' => 'Initial administrator bootstrap via CLI',
                'ip_address' => '127.0.0.1',
                'created_at' => now(),
            ]);

            return $user;
        });

        $this->info("Initial administrator '{$admin->username}' ({$admin->email}) created successfully.");

        return self::SUCCESS;
    }
}
