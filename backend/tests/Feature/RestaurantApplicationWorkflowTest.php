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

        $owner = User::forceCreate([
            'username' => 'rest_owner_'.random_int(100, 999),
            'first_name' => 'Elena',
            'last_name' => 'Cruz',
            'email' => 'elena@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $admin = User::forceCreate([
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
                'dti_certificate' => UploadedFile::fake()->createWithContent('dti.pdf', "%PDF-1.4\n%SALO-TEST-PDF\n"),
                'mayors_permit' => UploadedFile::fake()->createWithContent('permit.pdf', "%PDF-1.4\n%SALO-TEST-PDF\n"),
            ],
        ], ['Accept' => 'application/json']);

        $submitResponse->assertStatus(201)
            ->assertJsonPath('data.application.application_status', 'submitted')
            ->assertJsonPath('data.application.restaurant_name', 'Kusina ni Elena')
            ->assertJsonPath('data.application.has_branches', false)
            ->assertJsonPath('data.application.main_branch_name', null)
            ->assertJsonPath('data.application.branches', []);

        $appId = $submitResponse->json('data.application.restaurant_application_id');
        $docId = $submitResponse->json('data.application.documents.0.document_id');

        // 3. Admin starts review, verifies existing document, and requests additional document
        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'under_review',
        ])->assertOk()
            ->assertJsonPath('data.application.application_status', 'under_review');

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
            'file' => UploadedFile::fake()->createWithContent('bir.pdf', "%PDF-1.4\n%SALO-TEST-PDF\n"),
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.application.application_status', 'resubmitted');

        // 5. Admin resumes review and approves application
        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'under_review',
        ])->assertOk();

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

    public function test_multi_branch_submission_validation_persistence_and_applicant_read_isolation(): void
    {
        Mail::fake();

        $owner = User::forceCreate([
            'username' => 'mb_app_owner_'.random_int(1000, 9999),
            'first_name' => 'Marco',
            'last_name' => 'Reyes',
            'email' => 'marco.mb@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $otherUser = User::forceCreate([
            'username' => 'mb_other_'.random_int(1000, 9999),
            'first_name' => 'Other',
            'last_name' => 'User',
            'email' => 'other.mb@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        // Verify OTP
        $this->actingAs($owner)->postJson('/api/otp/send', [
            'email' => 'marco.mb@example.com',
            'purpose' => 'restaurant_application',
        ])->assertOk();

        $otp = null;
        Mail::assertSent(EmailOtpMail::class, function (EmailOtpMail $mail) use (&$otp) {
            $otp = $mail->otpCode;

            return true;
        });

        $this->actingAs($owner)->postJson('/api/otp/verify', [
            'email' => 'marco.mb@example.com',
            'purpose' => 'restaurant_application',
            'code' => $otp,
        ])->assertOk();

        $basePayload = [
            'restaurant_name' => 'Marco Multi-Branch Grill',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_phone' => '09171001000',
            'business_email' => 'marco.mb@example.com',
            'applicant_position' => 'business_owner',
            'legal_first_name' => 'Marco',
            'legal_last_name' => 'Reyes',
            'date_of_birth' => '1988-06-10',
            'contact_phone' => '09171001000',
            'contact_email' => 'marco.mb@example.com',
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '10 Katipunan Ave',
            'offers_delivery' => true,
            'offers_pickup' => true,
            'offers_dine_in' => true,
            'payout_provider' => 'BDO',
            'payout_account_type' => 'savings',
            'payout_account_holder_name' => 'Marco Reyes',
            'payout_account_number' => '9876543210',
            'terms_accepted' => true,
        ];

        $docs = fn (): array => [
            'dti_certificate' => UploadedFile::fake()->createWithContent('dti.pdf', "%PDF-1.4\n%SALO-TEST-PDF\n"),
        ];

        // 1. has_branches=true without main_branch_name -> 422
        $this->actingAs($owner)->post('/api/restaurant/applications', array_merge($basePayload, [
            'has_branches' => true,
            'main_branch_name' => '',
            'documents' => $docs(),
        ]), ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['main_branch_name']);

        // 2. Duplicate branch names (case-insensitive vs main_branch_name) -> 422
        $this->actingAs($owner)->post('/api/restaurant/applications', array_merge($basePayload, [
            'has_branches' => true,
            'main_branch_name' => 'Katipunan Main',
            'branches' => [[
                'branch_name' => '  katipunan main  ',
                'province' => 'Metro Manila',
                'city' => 'Quezon City',
                'barangay' => 'Loyola Heights',
            ]],
            'documents' => $docs(),
        ]), ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['branches.0.branch_name']);

        // 3. Over limit (> 4 additional branches when max_application_branches = 5) -> 422
        $fiveExtra = [];
        for ($i = 1; $i <= 5; $i++) {
            $fiveExtra[] = [
                'branch_name' => "Branch #{$i}",
                'province' => 'Metro Manila',
                'city' => 'Quezon City',
                'barangay' => 'Diliman',
            ];
        }
        $this->actingAs($owner)->post('/api/restaurant/applications', array_merge($basePayload, [
            'has_branches' => true,
            'main_branch_name' => 'Katipunan Main',
            'branches' => $fiveExtra,
            'documents' => $docs(),
        ]), ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['branches']);

        // 4. Invalid branch address (invalid postal_code and missing city) -> 422
        $this->actingAs($owner)->post('/api/restaurant/applications', array_merge($basePayload, [
            'has_branches' => true,
            'main_branch_name' => 'Katipunan Main',
            'branches' => [[
                'branch_name' => 'BGC Branch',
                'province' => 'Metro Manila',
                'city' => '',
                'barangay' => 'Diliman',
                'postal_code' => '12A',
            ]],
            'documents' => $docs(),
        ]), ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['branches.0.city', 'branches.0.postal_code']);

        // 5. Valid submission with has_branches and 2 additional branches
        $validRes = $this->actingAs($owner)->post('/api/restaurant/applications', array_merge($basePayload, [
            'has_branches' => true,
            'main_branch_name' => 'Katipunan Main',
            'branches' => [
                [
                    'branch_name' => 'SM North EDSA',
                    'contact_phone' => '09172002001',
                    'province' => 'Metro Manila',
                    'city' => 'Quezon City',
                    'barangay' => 'Diliman',
                    'street' => 'North Ave',
                    'postal_code' => '1100',
                    'latitude' => 14.6565,
                    'longitude' => 121.0305,
                ],
                [
                    'branch_name' => 'Loyola Heights Branch',
                    'province' => 'Metro Manila',
                    'city' => 'Quezon City',
                    'barangay' => 'Loyola Heights',
                    'street' => 'Esteban Abada St',
                ],
            ],
            'documents' => $docs(),
        ]), ['Accept' => 'application/json']);

        $validRes->assertStatus(201)
            ->assertJsonPath('data.application.has_branches', true)
            ->assertJsonPath('data.application.main_branch_name', 'Katipunan Main')
            ->assertJsonCount(2, 'data.application.branches')
            ->assertJsonPath('data.application.branches.0.branch_name', 'SM North EDSA')
            ->assertJsonPath('data.application.branches.0.contact_phone', '09172002001')
            ->assertJsonPath('data.application.branches.0.address.street', 'North Ave')
            ->assertJsonPath('data.application.branches.1.branch_name', 'Loyola Heights Branch')
            ->assertJsonPath('data.application.branches.1.contact_phone', null);

        $appId = (int) $validRes->json('data.application.restaurant_application_id');
        $rootRestId = (int) $validRes->json('data.application.restaurant_id');

        $rootRow = DB::table('restaurants')->where('restaurant_id', $rootRestId)->first();
        $this->assertSame('Katipunan Main', $rootRow->branch_name);
        $this->assertSame($rootRestId, (int) $rootRow->brand_restaurant_id);
        $this->assertSame(2, DB::table('restaurant_application_branches')->where('restaurant_application_id', $appId)->count());

        // Applicant read path returns branches; another user cannot view applicant's branches
        $this->actingAs($owner)->getJson('/api/restaurant/applications/current')
            ->assertOk()
            ->assertJsonPath('data.application.main_branch_name', 'Katipunan Main')
            ->assertJsonCount(2, 'data.application.branches');

        $this->actingAs($otherUser)->getJson('/api/restaurant/applications/current')
            ->assertOk()
            ->assertJsonPath('data.application', null);

        $this->actingAs($otherUser)->getJson("/api/admin/applications/restaurant/{$appId}")
            ->assertStatus(403);
    }
}
