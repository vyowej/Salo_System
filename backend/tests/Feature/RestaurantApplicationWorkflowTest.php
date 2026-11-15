<?php

namespace Tests\Feature;

use App\Features\Auth\Mail\EmailOtpMail;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class RestaurantApplicationWorkflowTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('local');
        Storage::fake('public');
    }

    public function test_restaurant_application_submission_document_request_and_admin_approval(): void
    {
        Mail::fake();

        $owner = User::create([
            'username' => 'rest_owner_'.random_int(100, 999),
            'first_name' => 'Elena',
            'last_name' => 'Cruz',
            'email' => 'elena@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $admin = User::create([
            'username' => 'admin_rest_'.random_int(100, 999),
            'first_name' => 'Admin',
            'last_name' => 'Two',
            'email' => 'admin2@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'admin',
            'account_status' => 'active',
        ]);

        // 1. Send & Verify OTP
        $this->actingAs($owner)->postJson('/api/otp/send', [
            'email' => 'elena@example.com',
            'purpose' => 'restaurant_application',
        ])->assertOk();

        $otp = null;
        Mail::assertSent(EmailOtpMail::class, function (EmailOtpMail $mail) use (&$otp) {
            $otp = $mail->otpCode;

            return true;
        });

        $this->actingAs($owner)->postJson('/api/otp/verify', [
            'email' => 'elena@example.com',
            'purpose' => 'restaurant_application',
            'code' => $otp,
        ])->assertOk();

        // 2. Submit Restaurant Application with logo, cover, and documents
        $submitResponse = $this->actingAs($owner)->post('/api/restaurant/applications', [
            'restaurant_name' => 'Kusina ni Elena',
            'registered_name' => 'Kusina ni Elena Food Corp',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'description' => 'Authentic Filipino home cooking.',
            'business_phone' => '09179998888',
            'business_email' => 'elena@example.com',
            'categories' => ['Filipino · Grill & BBQ'],
            'applicant_position' => 'business_owner',
            'legal_first_name' => 'Elena',
            'legal_last_name' => 'Cruz',
            'date_of_birth' => '1990-03-15',
            'contact_phone' => '09179998888',
            'contact_email' => 'elena@example.com',
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '45 Maginhawa St',
            'postal_code' => '1101',
            'delivery_radius' => 5.0,
            'offers_delivery' => true,
            'offers_pickup' => true,
            'offers_dine_in' => true,
            'accepts_reservations' => true,
            'operating_hours' => [
                ['day_of_week' => 1, 'opening_time' => '09:00:00', 'closing_time' => '21:00:00', 'is_closed' => false],
            ],
            'payout_provider' => 'BPI',
            'payout_account_type' => 'savings',
            'payout_account_holder_name' => 'Elena Cruz',
            'payout_account_number' => '1234567890',
            'terms_accepted' => true,
            'logo_image' => UploadedFile::fake()->image('logo.png'),
            'cover_image' => UploadedFile::fake()->image('cover.jpg'),
            'documents' => [
                'dti_certificate' => UploadedFile::fake()->create('dti.pdf', 120, 'application/pdf'),
                'mayors_permit' => UploadedFile::fake()->create('permit.pdf', 120, 'application/pdf'),
            ],
        ], ['Accept' => 'application/json']);

        $submitResponse->assertStatus(201)
            ->assertJsonPath('data.application.application_status', 'submitted')
            ->assertJsonPath('data.application.restaurant_name', 'Kusina ni Elena');

        $appId = $submitResponse->json('data.application.restaurant_application_id');
        $docId = $submitResponse->json('data.application.documents.0.document_id');

        // 3. Admin requests additional document & verifies existing document
        $this->actingAs($admin)->patchJson("/api/admin/applications/restaurant/{$appId}/documents/{$docId}", [
            'status' => 'verified',
        ])->assertOk();

        $reqRes = $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/document-requests", [
            'document_name' => 'BIR Form 2303',
            'reason' => 'Please upload BIR Certificate of Registration.',
        ])->assertStatus(201);

        $requestId = $reqRes->json('data.application.document_requests.0.request_id');

        // 4. Owner uploads requested document -> status becomes resubmitted
        $this->actingAs($owner)->post("/api/restaurant/applications/{$appId}/documents", [
            'document_code' => 'requested_document',
            'request_id' => $requestId,
            'file' => UploadedFile::fake()->create('bir.pdf', 100, 'application/pdf'),
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.application.application_status', 'resubmitted');

        // 5. Admin approves application
        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'approve',
            'note' => 'Welcome to SALO!',
        ])->assertOk()
            ->assertJsonPath('data.application.application_status', 'approved')
            ->assertJsonPath('data.application.restaurant_status', 'active');

        // 6. Owner sees updated status in /api/restaurant/applications/current and /api/auth/me includes 'owner'
        $this->actingAs($owner)->getJson('/api/restaurant/applications/current')
            ->assertOk()
            ->assertJsonPath('data.application.application_status', 'approved');

        $this->actingAs($owner)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonFragment(['owner']);
    }
}
