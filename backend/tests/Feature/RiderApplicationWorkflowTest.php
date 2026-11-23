<?php

namespace Tests\Feature;

use App\Features\Auth\Mail\EmailOtpMail;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class RiderApplicationWorkflowTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('local');
    }

    public function test_rider_application_submission_and_admin_approval_workflow(): void
    {
        Mail::fake();

        $applicant = User::forceCreate([
            'username' => 'rider_app_'.random_int(100, 999),
            'first_name' => 'Carlos',
            'last_name' => 'Reyes',
            'email' => 'carlos@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $otherUser = User::forceCreate([
            'username' => 'other_user_'.random_int(100, 999),
            'first_name' => 'Other',
            'last_name' => 'User',
            'email' => 'other@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $admin = User::forceCreate([
            'username' => 'admin_user_'.random_int(100, 999),
            'first_name' => 'Admin',
            'last_name' => 'One',
            'email' => 'admin1@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'admin',
            'account_status' => 'active',
        ]);

        // 1. Send and verify OTP
        $this->actingAs($applicant)->postJson('/api/otp/send', [
            'email' => 'carlos@example.com',
            'purpose' => 'rider_application',
        ])->assertOk();

        $otp = null;
        Mail::assertSent(EmailOtpMail::class, function (EmailOtpMail $mail) use (&$otp) {
            $otp = $mail->otpCode;

            return true;
        });

        $this->actingAs($applicant)->postJson('/api/otp/verify', [
            'email' => 'carlos@example.com',
            'purpose' => 'rider_application',
            'code' => $otp,
        ])->assertOk();

        // 2. Submit rider application with private documents
        $submitResponse = $this->actingAs($applicant)->post('/api/rider/applications', [
            'legal_first_name' => 'Carlos',
            'legal_last_name' => 'Reyes',
            'date_of_birth' => '1995-05-10',
            'gender' => 'male',
            'contact_phone' => '09171234567',
            'contact_email' => 'carlos@example.com',
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'South Triangle',
            'street' => '123 Mother Ignacia',
            'postal_code' => '1103',
            'gov_id_type' => 'philid',
            'gov_id_number' => '1234-5678-9012',
            'gov_id_is_permanent' => true,
            'vehicle_type' => 'motorcycle',
            'vehicle_brand' => 'Honda',
            'vehicle_model' => 'Click 125i',
            'vehicle_color' => 'Black',
            'vehicle_year' => 2023,
            'plate_number' => 'abc1234',
            'vehicle_ownership' => 'personally_owned',
            'emergency_contact_name' => 'Maria Reyes',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09181234567',
            'base_city' => 'Quezon City',
            'preferred_shifts' => ['lunch', 'dinner'],
            'available_days' => ['mon', 'tue', 'wed'],
            'payout_provider' => 'GCash',
            'payout_account_type' => 'e_wallet',
            'payout_account_holder_name' => 'Carlos Reyes',
            'payout_account_number' => '09171234567',
            'terms_accepted' => true,
            'documents' => [
                'government_id_front' => UploadedFile::fake()->image('id_front.jpg'),
                'selfie' => UploadedFile::fake()->image('selfie.jpg'),
                'driver_license' => UploadedFile::fake()->image('license.jpg'),
                'lto_or' => UploadedFile::fake()->createWithContent('or.pdf', "%PDF-1.4\n%SALO-TEST-PDF\n"),
                'lto_cr' => UploadedFile::fake()->createWithContent('cr.pdf', "%PDF-1.4\n%SALO-TEST-PDF\n"),
            ],
        ], ['Accept' => 'application/json']);

        $submitResponse->assertStatus(201)
            ->assertJsonPath('data.application.application_status', 'submitted')
            ->assertJsonPath('data.application.plate_number', 'ABC1234');

        $appId = $submitResponse->json('data.application.rider_application_id');
        $docId = $submitResponse->json('data.application.documents.0.document_id');

        // 3. Unauthorized user cannot view private document
        $this->actingAs($otherUser)->get("/api/applications/documents/{$docId}/file")->assertStatus(403);

        // 4. Admin lists, views, and approves rider application
        $this->actingAs($admin)->getJson('/api/admin/applications?type=rider')
            ->assertOk()
            ->assertJsonFragment(['id' => $appId])
            ->assertSuccessful();

        $this->actingAs($admin)->get("/api/applications/documents/{$docId}/file")->assertOk();

        $this->actingAs($admin)->postJson("/api/admin/applications/rider/{$appId}/decision", [
            'decision' => 'under_review',
        ])->assertOk()
            ->assertJsonPath('data.application.application_status', 'under_review');

        $this->actingAs($admin)->postJson("/api/admin/applications/rider/{$appId}/decision", [
            'decision' => 'approve',
            'note' => 'All documents verified.',
        ])->assertOk()
            ->assertJsonPath('data.application.application_status', 'approved')
            ->assertJsonPath('data.application.rider_status', 'approved');

        // 5. Applicant has rider role on dashboard, but approval alone does NOT allow going online
        $this->actingAs($applicant)->getJson('/api/rider/dashboard')
            ->assertOk()
            ->assertJsonPath('data.rider.rider_status', 'approved');

        $this->actingAs($applicant)->patchJson('/api/rider/availability', [
            'status' => 'online',
        ])->assertStatus(403);

        $this->assertDatabaseHas('audit_logs', [
            'entity_type' => 'rider_applications',
            'entity_id' => (string) $appId,
            'action' => 'rider_application_approved',
            'actor_user_id' => $admin->user_id,
        ]);
    }
}
