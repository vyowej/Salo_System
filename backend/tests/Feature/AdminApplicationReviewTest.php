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

class AdminApplicationReviewTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('local');
        Storage::fake('public');
    }

    private function createUser(string $role = 'customer', string $prefix = 'u'): User
    {
        return User::create([
            'username' => "{$prefix}_".random_int(10000, 99999),
            'first_name' => ucfirst($prefix),
            'last_name' => 'Tester',
            'email' => "{$prefix}_".random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function verifyOtp(User $user, string $purpose): void
    {
        Mail::fake();

        $this->actingAs($user)->postJson('/api/otp/send', [
            'email' => $user->email,
            'purpose' => $purpose,
        ])->assertOk();

        $otp = null;
        Mail::assertSent(EmailOtpMail::class, function (EmailOtpMail $mail) use (&$otp) {
            $otp = $mail->otpCode;

            return true;
        });

        $this->actingAs($user)->postJson('/api/otp/verify', [
            'email' => $user->email,
            'purpose' => $purpose,
            'code' => $otp,
        ])->assertOk();
    }

    private function submitRestaurantApp(User $applicant, string $name = 'Review Kitchen'): array
    {
        $this->verifyOtp($applicant, 'restaurant_application');

        $res = $this->actingAs($applicant)->post('/api/restaurant/applications', [
            'restaurant_name' => $name,
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_phone' => '09171112222',
            'business_email' => $applicant->email,
            'applicant_position' => 'business_owner',
            'legal_first_name' => $applicant->first_name,
            'legal_last_name' => $applicant->last_name,
            'date_of_birth' => '1991-04-10',
            'contact_phone' => '09171112222',
            'contact_email' => $applicant->email,
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '99 Review St',
            'offers_delivery' => true,
            'offers_pickup' => true,
            'offers_dine_in' => true,
            'payout_provider' => 'BPI',
            'payout_account_type' => 'savings',
            'payout_account_holder_name' => 'Owner Name',
            'payout_account_number' => '1234567890',
            'terms_accepted' => true,
            'logo_image' => UploadedFile::fake()->image('logo.png', 150, 150),
            'cover_image' => UploadedFile::fake()->image('cover.jpg', 400, 200),
            'menu_items' => [
                [
                    'name' => 'Adobo Platter',
                    'description' => 'Classic pork adobo',
                    'category' => 'Main Dishes',
                    'price' => '240.00',
                    'available' => true,
                ],
            ],
            'menu_item_photos' => [
                0 => UploadedFile::fake()->image('adobo.jpg', 200, 200),
            ],
            'documents' => [
                'dti_certificate' => UploadedFile::fake()->createWithContent('dti.pdf', "%PDF-1.4\n%dti\n"),
            ],
        ], ['Accept' => 'application/json']);

        $res->assertStatus(201);

        return $res->json('data.application');
    }

    public function test_authorization_and_self_review_blocks(): void
    {
        $applicantAdmin = $this->createUser('admin', 'selfadmin');
        $otherAdmin = $this->createUser('admin', 'otheradmin');
        $customer = $this->createUser('customer', 'cust');

        $app = $this->submitRestaurantApp($applicantAdmin, 'Admin Own Kitchen');
        $appId = $app['restaurant_application_id'];
        $docId = $app['documents'][0]['document_id'];

        // Unauthenticated -> 401
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/admin/applications?type=restaurant')->assertStatus(401);
        $this->postJson("/api/admin/applications/restaurant/{$appId}/decision", ['decision' => 'under_review'])->assertStatus(401);

        // Customer -> 403
        $this->actingAs($customer)->getJson('/api/admin/applications?type=restaurant')->assertStatus(403);
        $this->actingAs($customer)->getJson("/api/admin/applications/restaurant/{$appId}")->assertStatus(403);
        $this->actingAs($customer)->postJson("/api/admin/applications/restaurant/{$appId}/decision", ['decision' => 'under_review'])->assertStatus(403);

        // Self-review by admin who submitted -> 403
        $this->actingAs($applicantAdmin)->patchJson("/api/admin/applications/restaurant/{$appId}/documents/{$docId}", [
            'status' => 'verified',
        ])->assertStatus(403);

        $this->actingAs($applicantAdmin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'under_review',
        ])->assertStatus(403);

        $this->actingAs($applicantAdmin)->postJson("/api/admin/applications/restaurant/{$appId}/document-requests", [
            'document_name' => 'Permit',
            'reason' => 'Need permit',
        ])->assertStatus(403);

        // Different admin CAN start review -> 200
        $this->actingAs($otherAdmin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'under_review',
        ])->assertOk();
    }

    public function test_transition_table_reject_reason_and_double_approve_idempotency(): void
    {
        $owner = $this->createUser('customer', 'owner');
        $admin = $this->createUser('admin', 'reviewer');

        $app = $this->submitRestaurantApp($owner, 'Transition Bistro');
        $appId = $app['restaurant_application_id'];
        $restId = $app['restaurant_id'];

        // Invalid from submitted: cannot jump straight to approve, reject, or additional_documents_required -> 409
        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'approve',
        ])->assertStatus(409);

        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'reject',
            'note' => 'Missing permit',
        ])->assertStatus(409);

        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'additional_documents_required',
            'note' => 'Need permit',
        ])->assertStatus(409);

        // Start review: submitted -> under_review
        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'under_review',
        ])->assertOk()
            ->assertJsonPath('data.application.application_status', 'under_review');

        // Missing note on reject / additional_documents_required -> 422
        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'reject',
            'note' => '',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['note']);

        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'additional_documents_required',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['note']);

        // Before approval: restaurant & menu items are NOT publicly visible
        $this->getJson('/api/restaurants?search='.urlencode('Transition Bistro'))
            ->assertOk()
            ->assertJsonCount(0, 'data.restaurants');
        $this->getJson("/api/restaurants/{$restId}/menu")->assertStatus(404);

        // Approve: under_review -> approved
        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'approve',
            'note' => 'Verified and approved.',
        ])->assertOk()
            ->assertJsonPath('data.application.application_status', 'approved')
            ->assertJsonPath('data.application.restaurant_status', 'active');

        // Double-approve and post-approval reject are blocked -> 409
        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'approve',
        ])->assertStatus(409);

        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'reject',
            'note' => 'Too late',
        ])->assertStatus(409);

        // After approval: restaurant & initial menu items ARE publicly visible
        $this->getJson('/api/restaurants?search='.urlencode('Transition Bistro'))
            ->assertOk()
            ->assertJsonCount(1, 'data.restaurants');
        $this->getJson("/api/restaurants/{$restId}")->assertOk();
        $this->getJson("/api/restaurants/{$restId}/menu")
            ->assertOk()
            ->assertJsonPath('data.categories.0.items.0.name', 'Adobo Platter');

        // Audit logs recorded before/after statuses
        $logs = DB::table('audit_logs')
            ->where('entity_type', 'restaurant_applications')
            ->where('entity_id', (string) $appId)
            ->orderBy('log_id')
            ->get();

        $actions = $logs->pluck('action')->all();
        $this->assertContains('restaurant_application_under_review', $actions);
        $this->assertContains('restaurant_application_approved', $actions);

        $approvedLog = $logs->firstWhere('action', 'restaurant_application_approved');
        $this->assertSame((int) $admin->user_id, (int) $approvedLog->actor_user_id);
        $this->assertSame('under_review', json_decode($approvedLog->old_values, true)['application_status']);
        $this->assertSame('approved', json_decode($approvedLog->new_values, true)['application_status']);
    }

    public function test_rejected_application_is_terminal_and_sets_rejected_status(): void
    {
        $owner = $this->createUser('customer', 'rejowner');
        $admin = $this->createUser('admin', 'rejadmin');

        $app = $this->submitRestaurantApp($owner, 'Rejected Cafe');
        $appId = $app['restaurant_application_id'];
        $restId = $app['restaurant_id'];

        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'under_review',
        ])->assertOk();

        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'reject',
            'note' => 'Incomplete permits.',
        ])->assertOk()
            ->assertJsonPath('data.application.application_status', 'rejected')
            ->assertJsonPath('data.application.restaurant_status', 'rejected');

        // Terminal: cannot approve or re-review a rejected application
        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'approve',
        ])->assertStatus(409);

        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'under_review',
        ])->assertStatus(409);

        $this->getJson("/api/restaurants/{$restId}")->assertStatus(404);
    }
}
