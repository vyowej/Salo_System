<?php

namespace Tests\Feature;

use App\Features\Auth\Mail\EmailOtpMail;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
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

        // After approval: restaurant is active for owner workspace, but stays hidden from customers until published
        $this->getJson('/api/restaurants?search='.urlencode('Transition Bistro'))
            ->assertOk()
            ->assertJsonCount(0, 'data.restaurants');
        $this->getJson("/api/restaurants/{$restId}")->assertStatus(404);
        $this->getJson("/api/restaurants/{$restId}/menu")->assertStatus(404);
        $this->assertSame(0, (int) DB::table('restaurants')->where('restaurant_id', $restId)->value('is_published'));
        $this->assertSame('approved', DB::table('menu_items')->where('restaurant_id', $restId)->value('approval_status'));

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

    public function test_admin_applications_batch_document_counts_characterization_and_query_count(): void
    {
        $admin = $this->createUser('admin', 'batchadmin');
        $owner1 = $this->createUser('customer', 'batchown1');
        $owner2 = $this->createUser('customer', 'batchown2');

        $app1 = $this->submitRestaurantApp($owner1, 'BatchDoc Kitchen One');
        $app2 = $this->submitRestaurantApp($owner2, 'BatchDoc Kitchen Two');

        $app1Id = (int) $app1['restaurant_application_id'];
        $app2Id = (int) $app2['restaurant_application_id'];

        // Add extra documents with mixed document_status to app1 (1 initial pending_review + 2 verified + 1 rejected = 4 total, 2 verified)
        $uniq = random_int(10000, 99999);
        DB::table('application_documents')->insert([
            [
                'restaurant_application_id' => $app1Id,
                'document_code' => 'mayors_permit',
                'file_path' => "applications/{$uniq}_perm1.pdf",
                'original_filename' => 'perm1.pdf',
                'mime_type' => 'application/pdf',
                'file_size_bytes' => 1024,
                'document_status' => 'verified',
                'review_note' => null,
                'uploaded_by' => $owner1->user_id,
                'uploaded_at' => now(),
                'reviewed_by' => $admin->user_id,
                'reviewed_at' => now(),
            ],
            [
                'restaurant_application_id' => $app1Id,
                'document_code' => 'bir_2303',
                'file_path' => "applications/{$uniq}_bir1.pdf",
                'original_filename' => 'bir1.pdf',
                'mime_type' => 'application/pdf',
                'file_size_bytes' => 1024,
                'document_status' => 'verified',
                'review_note' => null,
                'uploaded_by' => $owner1->user_id,
                'uploaded_at' => now(),
                'reviewed_by' => $admin->user_id,
                'reviewed_at' => now(),
            ],
            [
                'restaurant_application_id' => $app1Id,
                'document_code' => 'government_id',
                'file_path' => "applications/{$uniq}_id1.pdf",
                'original_filename' => 'id1.pdf',
                'mime_type' => 'application/pdf',
                'file_size_bytes' => 1024,
                'document_status' => 'rejected',
                'review_note' => 'Blurry scan',
                'uploaded_by' => $owner1->user_id,
                'uploaded_at' => now(),
                'reviewed_by' => $admin->user_id,
                'reviewed_at' => now(),
            ],
        ]);

        // Prime auth once, then measure query count for listing restaurant applications
        DB::flushQueryLog();
        DB::enableQueryLog();

        $res = $this->actingAs($admin)
            ->getJson('/api/admin/applications?type=restaurant&search=' . urlencode('BatchDoc Kitchen'))
            ->assertOk();

        $this->assertLessThanOrEqual(5, count(DB::getQueryLog()), 'GET /api/admin/applications?type=restaurant must execute at most 5 queries.');

        $items = collect($res->json('data.items'));
        $item1 = $items->firstWhere('id', $app1Id);
        $item2 = $items->firstWhere('id', $app2Id);

        $this->assertNotNull($item1);
        $this->assertSame(4, $item1['total_docs_count']);
        $this->assertSame(2, $item1['verified_docs_count']);

        $this->assertNotNull($item2);
        $this->assertSame(1, $item2['total_docs_count']);
        $this->assertSame(0, $item2['verified_docs_count']);

        // Also verify rider applications list query count (<= 5 queries)
        DB::flushQueryLog();
        $this->actingAs($admin)
            ->getJson('/api/admin/applications?type=rider')
            ->assertOk();
        $this->assertLessThanOrEqual(5, count(DB::getQueryLog()), 'GET /api/admin/applications?type=rider must execute at most 5 queries.');
    }

    public function test_rider_applications_listing_filters_sorting_date_range_and_batch_doc_counts(): void
    {
        $admin = $this->createUser('admin', 'ridlistadm');
        $riderUser1 = $this->createUser('customer', 'ridlist1');
        $riderUser2 = $this->createUser('customer', 'ridlist2');

        $cityId = DB::table('cities')->where('city_name', 'Quezon City')->value('city_id')
            ?? DB::table('cities')->value('city_id');
        $addressId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '77 Rider Test St',
        ]);

        $rider1Id = (int) DB::table('riders')->insertGetId([
            'user_id' => $riderUser1->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Contact 1',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09170000101',
            'base_city_id' => $cityId,
            'rider_status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $rider2Id = (int) DB::table('riders')->insertGetId([
            'user_id' => $riderUser2->user_id,
            'vehicle_type' => 'walking',
            'emergency_contact_name' => 'Contact 2',
            'emergency_contact_relationship' => 'sibling',
            'emergency_contact_phone' => '09170000102',
            'base_city_id' => $cityId,
            'rider_status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $tag = 'RidList' . random_int(1000, 9999);
        $app1Id = (int) DB::table('rider_applications')->insertGetId([
            'reference_number' => "SALO-RDR-{$tag}-1",
            'applicant_user_id' => $riderUser1->user_id,
            'rider_id' => $rider1Id,
            'application_status' => 'submitted',
            'legal_first_name' => "{$tag}Alpha",
            'legal_last_name' => 'Courier',
            'date_of_birth' => '1995-05-05',
            'contact_phone' => '09170000101',
            'contact_email' => $riderUser1->email,
            'contact_email_verified_at' => now(),
            'residence_address_id' => $addressId,
            'gov_id_type' => 'philid',
            'gov_id_number_encrypted' => 'enc-stub-1234',
            'gov_id_is_permanent' => 1,
            'declarations_accepted_at' => now(),
            'terms_version' => '2026-01',
            'submitted_at' => now()->subDays(2),
        ]);

        $app2Id = (int) DB::table('rider_applications')->insertGetId([
            'reference_number' => "SALO-RDR-{$tag}-2",
            'applicant_user_id' => $riderUser2->user_id,
            'rider_id' => $rider2Id,
            'application_status' => 'under_review',
            'legal_first_name' => "{$tag}Beta",
            'legal_last_name' => 'Walker',
            'date_of_birth' => '1996-06-06',
            'contact_phone' => '09170000102',
            'contact_email' => $riderUser2->email,
            'contact_email_verified_at' => now(),
            'residence_address_id' => $addressId,
            'gov_id_type' => 'philid',
            'gov_id_number_encrypted' => 'enc-stub-1234',
            'gov_id_is_permanent' => 1,
            'declarations_accepted_at' => now(),
            'terms_version' => '2026-01',
            'submitted_at' => now()->subDays(15),
        ]);

        $uniq = random_int(10000, 99999);
        DB::table('application_documents')->insert([
            [
                'rider_application_id' => $app1Id,
                'document_code' => 'government_id_front',
                'file_path' => "applications/{$uniq}_rid_front.jpg",
                'original_filename' => 'front.jpg',
                'mime_type' => 'image/jpeg',
                'file_size_bytes' => 1024,
                'document_status' => 'verified',
                'uploaded_by' => $riderUser1->user_id,
                'uploaded_at' => now(),
                'reviewed_by' => $admin->user_id,
                'reviewed_at' => now(),
            ],
            [
                'rider_application_id' => $app1Id,
                'document_code' => 'selfie',
                'file_path' => "applications/{$uniq}_rid_selfie.jpg",
                'original_filename' => 'selfie.jpg',
                'mime_type' => 'image/jpeg',
                'file_size_bytes' => 1024,
                'document_status' => 'pending_review',
                'uploaded_by' => $riderUser1->user_id,
                'uploaded_at' => now(),
                'reviewed_by' => null,
                'reviewed_at' => null,
            ],
        ]);

        // 1. Default desc order + batch document counts + query count <= 5
        DB::flushQueryLog();
        DB::enableQueryLog();
        $descRes = $this->actingAs($admin)
            ->getJson('/api/admin/applications?type=rider&search=' . urlencode($tag))
            ->assertOk();
        $this->assertLessThanOrEqual(5, count(DB::getQueryLog()));
        $this->assertSame([$app1Id, $app2Id], collect($descRes->json('data.items'))->pluck('id')->all());
        $this->assertSame(2, $descRes->json('data.items.0.total_docs_count'));
        $this->assertSame(1, $descRes->json('data.items.0.verified_docs_count'));
        $this->assertSame('bicycle', $descRes->json('data.items.0.vehicle_type'));

        // 2. Asc order
        $ascRes = $this->actingAs($admin)
            ->getJson('/api/admin/applications?type=rider&direction=asc&search=' . urlencode($tag))
            ->assertOk();
        $this->assertSame([$app2Id, $app1Id], collect($ascRes->json('data.items'))->pluck('id')->all());

        // 3. Status filter + 7d date_range filter
        $this->actingAs($admin)
            ->getJson('/api/admin/applications?type=rider&status=under_review&search=' . urlencode($tag))
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.id', $app2Id);

        $this->actingAs($admin)
            ->getJson('/api/admin/applications?type=rider&date_range=7d&search=' . urlencode($tag))
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.id', $app1Id);
    }

    public function test_multi_branch_application_admin_detail_approval_materialization_rejection_and_rollback(): void
    {
        $admin = $this->createUser('admin', 'mbadmin');
        $applicant = $this->createUser('customer', 'mbapp');
        $rejectedApplicant = $this->createUser('customer', 'mbrej');

        // 1. Rejection of a multi-branch application creates zero child restaurants rows.
        $this->verifyOtp($rejectedApplicant, 'restaurant_application');
        $rejSubmit = $this->actingAs($rejectedApplicant)->post('/api/restaurant/applications', [
            'restaurant_name' => 'Rejected Multi Kitchen',
            'has_branches' => true,
            'main_branch_name' => 'Main Outlet',
            'branches' => [[
                'branch_name' => 'Second Outlet',
                'province' => 'Metro Manila',
                'city' => 'Quezon City',
                'barangay' => 'Diliman',
                'street' => '22 Second St',
            ]],
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_phone' => '09171110000',
            'business_email' => $rejectedApplicant->email,
            'applicant_position' => 'business_owner',
            'legal_first_name' => 'Rej',
            'legal_last_name' => 'Owner',
            'date_of_birth' => '1990-01-10',
            'contact_phone' => '09171110000',
            'contact_email' => $rejectedApplicant->email,
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '11 Main St',
            'offers_delivery' => true,
            'offers_pickup' => true,
            'offers_dine_in' => true,
            'payout_provider' => 'BPI',
            'payout_account_type' => 'savings',
            'payout_account_holder_name' => 'Rej Owner',
            'payout_account_number' => '1111222233',
            'terms_accepted' => true,
            'documents' => [
                'dti_certificate' => UploadedFile::fake()->createWithContent('dti.pdf', "%PDF-1.4\n%dti\n"),
            ],
        ], ['Accept' => 'application/json'])->assertStatus(201);

        $rejAppId = (int) $rejSubmit->json('data.application.restaurant_application_id');
        $rejRootId = (int) $rejSubmit->json('data.application.restaurant_id');

        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$rejAppId}/decision", [
            'decision' => 'under_review',
        ])->assertOk();

        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$rejAppId}/decision", [
            'decision' => 'reject',
            'note' => 'Incomplete permits',
        ])->assertOk();

        $this->assertSame(0, DB::table('restaurants')->where('parent_restaurant_id', $rejRootId)->count());
        $this->assertNull(
            DB::table('restaurant_application_branches')
                ->where('restaurant_application_id', $rejAppId)
                ->value('created_branch_restaurant_id')
        );

        // 2. Submit multi-branch application with categories, operating hours, and initial menu item (+ add-ons).
        $this->verifyOtp($applicant, 'restaurant_application');
        $submitRes = $this->actingAs($applicant)->post('/api/restaurant/applications', [
            'restaurant_name' => 'Kanto Branches Grill',
            'registered_name' => 'Kanto Branches Inc',
            'has_branches' => true,
            'main_branch_name' => 'Diliman Flagship',
            'branches' => [
                [
                    'branch_name' => 'SM North EDSA',
                    'contact_phone' => '09173330001',
                    'province' => 'Metro Manila',
                    'city' => 'Quezon City',
                    'barangay' => 'Diliman',
                    'street' => 'EDSA North',
                    'latitude' => 14.6560,
                    'longitude' => 121.0300,
                ],
                [
                    'branch_name' => 'Loyola Heights',
                    'province' => 'Metro Manila',
                    'city' => 'Quezon City',
                    'barangay' => 'Loyola Heights',
                    'street' => 'Katipunan Ave',
                ],
            ],
            'business_type' => 'restaurant',
            'ownership_structure' => 'corporation',
            'description' => 'Multi-branch grill house',
            'business_phone' => '09173330000',
            'business_email' => $applicant->email,
            'categories' => ['Filipino · Grill & BBQ'],
            'applicant_position' => 'business_owner',
            'legal_first_name' => $applicant->first_name,
            'legal_last_name' => $applicant->last_name,
            'date_of_birth' => '1989-05-12',
            'contact_phone' => '09173330000',
            'contact_email' => $applicant->email,
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '1 Flagship Rd',
            'offers_delivery' => true,
            'offers_pickup' => true,
            'offers_dine_in' => true,
            'operating_hours' => [
                ['day_of_week' => 1, 'opening_time' => '08:00:00', 'closing_time' => '22:00:00', 'is_closed' => false],
                ['day_of_week' => 2, 'opening_time' => '08:00:00', 'closing_time' => '22:00:00', 'is_closed' => false],
            ],
            'payout_provider' => 'BPI',
            'payout_account_type' => 'savings',
            'payout_account_holder_name' => 'Kanto Branches Inc',
            'payout_account_number' => '5555666677',
            'terms_accepted' => true,
            'menu_items' => [
                [
                    'name' => 'Inasal Quarter',
                    'description' => 'Chargrilled chicken',
                    'category' => 'Grill Specials',
                    'price' => '195.00',
                    'available' => true,
                ],
            ],
            'documents' => [
                'sec_certificate' => UploadedFile::fake()->createWithContent('sec.pdf', "%PDF-1.4\n%sec\n"),
            ],
        ], ['Accept' => 'application/json'])->assertStatus(201);

        $appId = (int) $submitRes->json('data.application.restaurant_application_id');
        $rootId = (int) $submitRes->json('data.application.restaurant_id');

        // Seed an add-on group & option on the root menu item to verify add-on cloning on approval.
        $rootMenuItemId = (int) DB::table('menu_items')->where('restaurant_id', $rootId)->value('menu_item_id');
        $rootAddOnGroupId = (int) DB::table('add_on_groups')->insertGetId([
            'menu_item_id' => $rootMenuItemId,
            'group_name' => 'Extra Rice',
            'is_required' => 0,
            'minimum_selections' => 0,
            'maximum_selections' => 2,
            'sort_order' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('add_on_options')->insert([
            'add_on_group_id' => $rootAddOnGroupId,
            'option_name' => 'Garlic Rice',
            'additional_price' => '35.00',
            'is_available' => 1,
            'sort_order' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Admin detail shows main_branch_name and branches[]
        $this->actingAs($admin)->getJson("/api/admin/applications/restaurant/{$appId}")
            ->assertOk()
            ->assertJsonPath('data.application.has_branches', true)
            ->assertJsonPath('data.application.main_branch_name', 'Diliman Flagship')
            ->assertJsonCount(2, 'data.application.branches')
            ->assertJsonPath('data.application.branches.0.branch_name', 'SM North EDSA');

        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'under_review',
        ])->assertOk();

        // 3. Forced failure mid-approval (after 1st child branch is created, 2nd child branch hits max_branches_per_business=2)
        // must roll back the ENTIRE approval transaction!
        Config::set('salo.restaurants.max_branches_per_business', 2);
        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'approve',
            'note' => 'Should roll back on 2nd branch',
        ])->assertStatus(422);

        $this->assertSame('under_review', DB::table('restaurant_applications')->where('restaurant_application_id', $appId)->value('application_status'));
        $this->assertSame('pending', DB::table('restaurants')->where('restaurant_id', $rootId)->value('restaurant_status'));
        $this->assertSame(0, DB::table('restaurants')->where('parent_restaurant_id', $rootId)->count());
        $this->assertSame(
            0,
            DB::table('restaurant_application_branches')
                ->where('restaurant_application_id', $appId)
                ->whereNotNull('created_branch_restaurant_id')
                ->count()
        );

        // 4. Restore limit and approve -> materializes 2 active unpublished child branches.
        Config::set('salo.restaurants.max_branches_per_business', 10);
        $approveRes = $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'approve',
            'note' => 'Approved all branches',
        ])->assertOk()
            ->assertJsonPath('data.application.application_status', 'approved');

        $children = DB::table('restaurants')
            ->where('parent_restaurant_id', $rootId)
            ->orderBy('restaurant_id')
            ->get();
        $this->assertCount(2, $children);

        $child1 = $children[0];
        $child2 = $children[1];

        $this->assertSame('SM North EDSA', $child1->branch_name);
        $this->assertSame($rootId, (int) $child1->brand_restaurant_id);
        $this->assertSame('active', $child1->restaurant_status);
        $this->assertSame(0, (int) $child1->is_published);
        $this->assertSame('09173330001', $child1->contact_phone);

        // Child 2 had no branch phone -> falls back to root contact_phone
        $this->assertSame('Loyola Heights', $child2->branch_name);
        $this->assertSame('09173330000', $child2->contact_phone);
        $this->assertSame('active', $child2->restaurant_status);
        $this->assertSame(0, (int) $child2->is_published);

        foreach ([$child1->restaurant_id, $child2->restaurant_id] as $cId) {
            $cId = (int) $cId;
            // Strategy B owners copied
            $this->assertTrue(DB::table('restaurant_owners')->where('restaurant_id', $cId)->where('user_id', $applicant->user_id)->exists());
            // Categories & operating hours copied
            $this->assertSame(1, DB::table('restaurant_category_map')->where('restaurant_id', $cId)->count());
            $this->assertSame(2, DB::table('operating_hours')->where('restaurant_id', $cId)->count());
            // Menu category, item, and add-ons cloned as approved + unpublished
            $clonedItem = DB::table('menu_items')->where('restaurant_id', $cId)->first();
            $this->assertNotNull($clonedItem);
            $this->assertSame('Inasal Quarter', $clonedItem->item_name);
            $this->assertSame('approved', $clonedItem->approval_status);
            $this->assertSame(0, (int) $clonedItem->is_published);
            $this->assertSame('new', $clonedItem->draft_state);

            $clonedGroup = DB::table('add_on_groups')->where('menu_item_id', $clonedItem->menu_item_id)->first();
            $this->assertNotNull($clonedGroup);
            $this->assertSame('Extra Rice', $clonedGroup->group_name);
            $this->assertSame(1, DB::table('add_on_options')->where('add_on_group_id', $clonedGroup->add_on_group_id)->count());

            // No service_areas and no payout_accounts created for child branches
            $this->assertSame(0, DB::table('service_areas')->where('restaurant_id', $cId)->count());
            $this->assertSame(0, DB::table('payout_accounts')->where('restaurant_id', $cId)->count());

            // Audit log recorded per created branch with brand_restaurant_id and branch_name
            $audit = DB::table('audit_logs')
                ->where('action', 'restaurant_branch_created')
                ->where('entity_type', 'restaurants')
                ->where('entity_id', (string) $cId)
                ->first();
            $this->assertNotNull($audit);
            $auditNew = json_decode((string) $audit->new_values, true);
            $this->assertSame($rootId, $auditNew['brand_restaurant_id']);
            $this->assertNotEmpty($auditNew['branch_name']);
        }

        // created_branch_restaurant_id populated on restaurant_application_branches
        $this->assertSame((int) $child1->restaurant_id, (int) $approveRes->json('data.application.branches.0.created_branch_restaurant_id'));
        $this->assertSame((int) $child2->restaurant_id, (int) $approveRes->json('data.application.branches.1.created_branch_restaurant_id'));

        $this->artisan('salo:check-branch-integrity')->assertSuccessful();
    }
}
