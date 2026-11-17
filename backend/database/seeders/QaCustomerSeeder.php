<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

class QaCustomerSeeder extends Seeder
{
    /**
     * Create one dedicated QA customer account in salo_test safely and idempotently.
     */
    public function run(): void
    {
        $resolvedDb = DB::connection()->getDatabaseName();
        if (app()->environment() !== 'qa' || $resolvedDb !== 'salo_test') {
            throw new RuntimeException(
                "QaCustomerSeeder aborted: expected APP_ENV=qa and DB_DATABASE=salo_test, got APP_ENV=" . app()->environment() . " and DB_DATABASE={$resolvedDb}."
            );
        }

        $email = trim((string) env('QA_CUSTOMER_EMAIL', 'qa.customer@salo.local'));
        $username = trim((string) env('QA_CUSTOMER_USERNAME', 'qa_customer'));
        $password = (string) env('QA_CUSTOMER_PASSWORD', '');

        if ($email === '' || $username === '' || $password === '') {
            throw new RuntimeException(
                'QaCustomerSeeder aborted: QA_CUSTOMER_EMAIL, QA_CUSTOMER_USERNAME, and QA_CUSTOMER_PASSWORD must be configured in the QA environment.'
            );
        }

        $byEmail = User::where('email', $email)->first();
        $byUsername = User::where('username', $username)->first();

        if ($byEmail && $byUsername && $byEmail->user_id === $byUsername->user_id) {
            $this->command?->info("QA customer already exists (user_id={$byEmail->user_id}); leaving record untouched.");
            return;
        }

        if ($byEmail || $byUsername) {
            throw new RuntimeException(
                'QaCustomerSeeder aborted: email or username collides with an existing non-QA user record.'
            );
        }

        $user = User::create([
            'username' => $username,
            'first_name' => 'QA',
            'middle_initial' => null,
            'last_name' => 'Customer',
            'email' => $email,
            'password_hash' => Hash::make($password),
            'phone_number' => '09170000001',
            'date_of_birth' => '1995-05-15',
            'user_role' => 'customer',
            'account_status' => 'active',
            'email_verified_at' => now(),
        ]);

        $this->command?->info("QA customer created in salo_test (user_id={$user->user_id}).");
    }
}
