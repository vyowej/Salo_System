<?php

namespace Tests\Feature;

use App\Features\Restaurants\Services\BranchPermitService;
use App\Models\User;
use App\Support\AddressService;
use App\Support\RestaurantBranchService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class BranchPermitsAdminReviewTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'bp2b'): User
    {
        return User::create([
            'username' => "{$prefix}_" . random_int(10000, 99999),
            'first_name' => ucfirst($prefix),
            'last_name' => 'Tester',
            'email' => "{$prefix}_" . random_int(10000, 99999) . '@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createAddress(string $barangay = 'Diliman', string $street = '101 Katipunan Ave'): int
    {
        return app(AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => $barangay,
            'street' => $street,
            'latitude' => 14.650000,
            'longitude' => 121.050000,
        ]);
    }

    private function fakePdf(string $name = 'permit.pdf'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent(
            $name,
            "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
        );
    }

    /**
     * @return array{root_id: int, branch_id: int, permit_id: int}
     */
    private function createBrandWithChildPermit(User $owner, bool $withFile = true, bool $exemption = false): array
    {
        $branchService = app(RestaurantBranchService::class);
        $rootId = $branchService->createRootRestaurant([
            'restaurant_name' => 'Admin Review Bistro',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'description' => 'Great food.',
            'contact_phone' => '09171234567',
            'business_email' => $owner->email,
            'address_id' => $this->createAddress(),
            'branch_name' => 'Main',
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'accepting_orders' => 1,
            'restaurant_status' => 'active',
            'is_published' => 1,
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $rootId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        $payload = [
            'branch_name' => 'Makati',
            'province' => 'Metro Manila',
            'city' => 'Makati',
            'barangay' => 'Bel-Air',
            'street' => '123 Ayala Ave',
            'offers_delivery' => 1,
            'offers_pickup' => 1,
        ];
        if ($withFile) {
            $payload['mayors_permit'] = $this->fakePdf('makati-permit.pdf');
        } elseif ($exemption) {
            $payload['is_required_locally'] = 0;
            $payload['exemption_reason'] = 'Temporary kiosk exempt under barangay ordinance.';
        }

        $res = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->post('/api/restaurant/branches', $payload);
        $res->assertStatus(201);
        $branchId = (int) $res->json('data.branch.restaurant_id');
        $permitId = (int) DB::table('branch_permits')->where('restaurant_id', $branchId)->value('permit_id');

        return ['root_id' => $rootId, 'branch_id' => $branchId, 'permit_id' => $permitId];
    }

    public function test_full_transition_matrix_validation_and_stale_409(): void
    {
        Storage::fake('local');
        $owner = $this->createUser('customer', 'owner');
        $admin = $this->createUser('admin', 'admin');

        // 1. pending_submission -> all admin actions return 409
        ['permit_id' => $pendingSubId] = $this->createBrandWithChildPermit($owner, false, false);
        foreach ([
            ['start-review', []],
            ['approve', []],
            ['reject', ['review_note' => 'Missing required permit document.']],
            ['request-info', ['review_note' => 'Please upload your permit file.']],
            ['reopen', ['review_note' => 'Reopening for review check.']],
        ] as [$ep, $body]) {
            $this->actingAs($admin)
                ->postJson("/api/admin/branch-permits/{$pendingSubId}/{$ep}", $body)
                ->assertStatus(409);
        }

        // 2. Validation: missing/short note -> 422; waive when is_required_locally=1 -> 422
        ['permit_id' => $filePermitId] = $this->createBrandWithChildPermit($owner, true, false);
        foreach (['reject', 'request-info'] as $ep) {
            $this->actingAs($admin)
                ->postJson("/api/admin/branch-permits/{$filePermitId}/{$ep}", [])
                ->assertStatus(422)
                ->assertJsonValidationErrors(['review_note']);
            $this->actingAs($admin)
                ->postJson("/api/admin/branch-permits/{$filePermitId}/{$ep}", ['review_note' => 'Too short'])
                ->assertStatus(422)
                ->assertJsonValidationErrors(['review_note']);
        }
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$filePermitId}/waive", ['review_note' => 'Trying to waive a required permit.'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['is_required_locally']);

        // 3. pending_review -> start-review -> under_review; second start-review -> 409 (stale state)
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$filePermitId}/start-review")
            ->assertStatus(200)
            ->assertJsonPath('data.permit.permit_status', 'under_review');
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$filePermitId}/start-review")
            ->assertStatus(409);

        // under_review -> reopen -> 409 (only approved/waived can reopen)
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$filePermitId}/reopen", ['review_note' => 'Cannot reopen under_review.'])
            ->assertStatus(409);

        // under_review -> request-info -> additional_info_required
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$filePermitId}/request-info", ['review_note' => 'Please upload a clearer scan of the seal.'])
            ->assertStatus(200)
            ->assertJsonPath('data.permit.permit_status', 'additional_info_required');

        // additional_info_required -> request-info -> 409
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$filePermitId}/request-info", ['review_note' => 'Duplicate request info should conflict.'])
            ->assertStatus(409);

        // additional_info_required -> approve -> approved; second approve -> 409 (concurrent/stale)
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$filePermitId}/approve")
            ->assertStatus(200)
            ->assertJsonPath('data.permit.permit_status', 'approved');
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$filePermitId}/approve")
            ->assertStatus(409);

        // approved -> start-review -> 409 (must use reopen with note); reopen without/short note -> 422
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$filePermitId}/start-review")
            ->assertStatus(409);
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$filePermitId}/reopen", ['review_note' => 'short'])
            ->assertStatus(422);

        // approved -> reopen -> under_review -> reject -> rejected -> reject again -> 409
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$filePermitId}/reopen", ['review_note' => 'Reopening for compliance audit check.'])
            ->assertStatus(200)
            ->assertJsonPath('data.permit.permit_status', 'under_review');
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$filePermitId}/reject", ['review_note' => 'Permit expired last month.'])
            ->assertStatus(200)
            ->assertJsonPath('data.permit.permit_status', 'rejected');
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$filePermitId}/reject", ['review_note' => 'Already rejected should 409.'])
            ->assertStatus(409);

        // 4. Exemption branch -> waive -> waived -> reopen -> under_review
        ['permit_id' => $exemptPermitId] = $this->createBrandWithChildPermit($owner, false, true);
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$exemptPermitId}/waive", ['review_note' => 'Verified LGU micro-enterprise exemption.'])
            ->assertStatus(200)
            ->assertJsonPath('data.permit.permit_status', 'waived');
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$exemptPermitId}/waive", ['review_note' => 'Already waived should 409.'])
            ->assertStatus(409);
    }

    public function test_unpublish_on_reject_request_info_reopen_and_approve_leaves_unpublished(): void
    {
        Storage::fake('local');
        $owner = $this->createUser('customer', 'owner');
        $admin = $this->createUser('admin', 'admin');
        $customer = $this->createUser('customer', 'cust');
        ['branch_id' => $branchId, 'permit_id' => $permitId] = $this->createBrandWithChildPermit($owner, true, false);

        // Seed hours + menu so branch is publishable once permit is approved
        for ($d = 0; $d <= 6; $d++) {
            DB::table('operating_hours')->insert([
                'restaurant_id' => $branchId,
                'day_of_week' => $d,
                'opening_time' => '00:00:00',
                'closing_time' => '23:59:00',
                'closes_next_day' => 0,
                'is_closed' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
        $catId = DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $branchId,
            'category_name' => 'Mains',
            'sort_order' => 1,
            'is_active' => 1,
            'is_published' => 1,
            'published_category_name' => 'Mains',
            'published_sort_order' => 1,
            'published_is_active' => 1,
            'draft_state' => 'clean',
        ]);
        $itemId = DB::table('menu_items')->insertGetId([
            'restaurant_id' => $branchId,
            'menu_category_id' => $catId,
            'published_menu_category_id' => $catId,
            'item_name' => 'Sisig',
            'published_item_name' => 'Sisig',
            'base_price' => 220.00,
            'published_base_price' => 220.00,
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'is_published' => 1,
            'draft_state' => 'clean',
        ]);

        $qcCityId = (int) DB::table('cities')->where('city_name', 'Quezon City')->value('city_id');
        DB::table('service_areas')->insert([
            'restaurant_id' => $branchId,
            'city_id' => $qcCityId,
            'barangay_id' => null,
        ]);

        // Approve does NOT auto-publish
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$permitId}/approve")
            ->assertStatus(200);
        $this->assertSame(0, (int) DB::table('restaurants')->where('restaurant_id', $branchId)->value('is_published'));

        // Owner publishes -> now visible in listing
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $branchId)
            ->postJson('/api/restaurant/menu/publish')
            ->assertStatus(200);
        $this->assertSame(1, (int) DB::table('restaurants')->where('restaurant_id', $branchId)->value('is_published'));
        $listed = collect($this->getJson('/api/restaurants?search=Admin+Review+Bistro&per_page=50')->json('data.restaurants'))->pluck('id')->all();
        $this->assertContains($branchId, $listed);

        // Reopen unpublishes and removes from listing & checkout
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$permitId}/reopen", ['review_note' => 'Re-checking business address match.'])
            ->assertStatus(200);
        $this->assertSame(0, (int) DB::table('restaurants')->where('restaurant_id', $branchId)->value('is_published'));
        $listedAfterReopen = collect($this->getJson('/api/restaurants?search=Admin+Review+Bistro&per_page=50')->json('data.restaurants'))->pluck('id')->all();
        $this->assertNotContains($branchId, $listedAfterReopen);

        $checkoutRes = $this->actingAs($customer)->postJson('/api/customer/checkout', [
            'idempotency_key' => 'bp2b-reopen-' . random_int(1000, 9999),
            'contact_phone' => '09179998888',
            'payment_method' => 'cod',
            'groups' => [[
                'restaurant_id' => $branchId,
                'fulfillment' => 'pickup',
                'items' => [['menu_item_id' => $itemId, 'quantity' => 1]],
            ]],
        ]);
        $this->assertTrue(in_array($checkoutRes->status(), [404, 422], true));

        // Re-approve, re-publish, then request-info -> unpublishes
        $this->actingAs($admin)->postJson("/api/admin/branch-permits/{$permitId}/approve")->assertStatus(200);
        $this->actingAs($owner)->withHeader('X-Restaurant-Id', (string) $branchId)->postJson('/api/restaurant/menu/publish')->assertStatus(200);
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$permitId}/request-info", ['review_note' => 'Need updated stamp page.'])
            ->assertStatus(200);
        $this->assertSame(0, (int) DB::table('restaurants')->where('restaurant_id', $branchId)->value('is_published'));

        // Re-approve, re-publish, then reject -> unpublishes
        $this->actingAs($admin)->postJson("/api/admin/branch-permits/{$permitId}/approve")->assertStatus(200);
        $this->actingAs($owner)->withHeader('X-Restaurant-Id', (string) $branchId)->postJson('/api/restaurant/menu/publish')->assertStatus(200);
        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$permitId}/reject", ['review_note' => 'Permit failed verification.'])
            ->assertStatus(200);
        $this->assertSame(0, (int) DB::table('restaurants')->where('restaurant_id', $branchId)->value('is_published'));
    }

    public function test_authorization_401_403_and_self_review_blocked(): void
    {
        Storage::fake('local');
        $owner = $this->createUser('customer', 'owner');
        $staff = $this->createUser('customer', 'staff');
        $customer = $this->createUser('customer', 'cust');
        $rider = $this->createUser('customer', 'rider');
        $cityId = (int) DB::table('cities')->value('city_id');
        DB::table('riders')->insert([
            'user_id' => $rider->user_id,
            'base_city_id' => $cityId,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Contact Rider',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09170000101',
            'rider_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $selfAdmin = $this->createUser('admin', 'selfadm');
        ['root_id' => $rootId, 'branch_id' => $branchId, 'permit_id' => $permitId] = $this->createBrandWithChildPermit($owner, true, false);

        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $branchId,
            'user_id' => $staff->user_id,
            'invited_by' => $owner->user_id,
            'staff_position' => 'Manager',
            'staff_status' => 'active',
            'invited_at' => now(),
            'responded_at' => now(),
        ]);

        // Unauthenticated -> 401
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/admin/branch-permits')->assertStatus(401);
        $this->postJson("/api/admin/branch-permits/{$permitId}/approve")->assertStatus(401);

        // Non-admins -> 403
        foreach ([$owner, $staff, $customer, $rider] as $nonAdmin) {
            $this->actingAs($nonAdmin)->getJson('/api/admin/branch-permits')->assertStatus(403);
            $this->actingAs($nonAdmin)->getJson("/api/admin/branch-permits/{$permitId}")->assertStatus(403);
            $this->actingAs($nonAdmin)->get("/api/admin/branch-permits/{$permitId}/file")->assertStatus(403);
            $this->actingAs($nonAdmin)->postJson("/api/admin/branch-permits/{$permitId}/approve")->assertStatus(403);
        }

        // Self-review: admin who is staff/owner/applicant of that business -> 403
        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $rootId,
            'user_id' => $selfAdmin->user_id,
            'invited_by' => $owner->user_id,
            'staff_position' => 'Manager',
            'staff_status' => 'active',
            'invited_at' => now(),
            'responded_at' => now(),
        ]);
        $this->actingAs($selfAdmin)
            ->postJson("/api/admin/branch-permits/{$permitId}/approve")
            ->assertStatus(403);
    }

    public function test_audit_logs_and_notifications_for_owners_and_pre_approval_applicant(): void
    {
        Storage::fake('local');
        $owner = $this->createUser('customer', 'owner');
        $admin = $this->createUser('admin', 'admin');
        ['permit_id' => $permitId] = $this->createBrandWithChildPermit($owner, true, false);
        $filePath = (string) DB::table('branch_permits')->where('permit_id', $permitId)->value('file_path');

        // Approve -> notifies owner in restaurant workspace, audit log includes file_path, notification body has NO file_path
        $this->actingAs($admin)->postJson("/api/admin/branch-permits/{$permitId}/approve")->assertStatus(200);
        $notifApproved = DB::table('notifications')
            ->where('user_id', $owner->user_id)
            ->where('type', 'branch_permit_approved')
            ->where('related_entity_id', $permitId)
            ->first();
        $this->assertNotNull($notifApproved);
        $this->assertSame('restaurant', $notifApproved->workspace);
        $this->assertStringContainsString('Admin Review Bistro — Makati', $notifApproved->body);
        $this->assertStringNotContainsString($filePath, $notifApproved->body);

        $audit = DB::table('audit_logs')
            ->where('entity_type', 'branch_permits')
            ->where('entity_id', $permitId)
            ->orderByDesc('log_id')
            ->first();
        $this->assertNotNull($audit);
        $newVals = json_decode((string) $audit->new_values, true);
        $this->assertSame('approved', $newVals['permit_status'] ?? null);
        $this->assertSame($filePath, $newVals['file_path'] ?? null);

        // Pre-approval application branch -> notifies applicant in customer workspace
        $applicant = $this->createUser('customer', 'app');
        $appAddrId = $this->createAddress('Kamuning', '55 Scout Ave');
        $pendingRootId = app(RestaurantBranchService::class)->createRootRestaurant([
            'restaurant_name' => 'PreApproval Cafe',
            'business_type' => 'cafe',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234567',
            'business_email' => $applicant->email,
            'address_id' => $appAddrId,
            'restaurant_status' => 'pending',
        ]);
        $appId = DB::table('restaurant_applications')->insertGetId([
            'applicant_user_id' => $applicant->user_id,
            'restaurant_id' => $pendingRootId,
            'reference_number' => 'SALO-APP-' . random_int(10000, 99999),
            'legal_first_name' => 'App',
            'legal_last_name' => 'Owner',
            'applicant_position' => 'business_owner',
            'date_of_birth' => '1990-01-01',
            'contact_email' => $applicant->email,
            'contact_email_verified_at' => now(),
            'declarations_accepted_at' => now(),
            'terms_version' => 'v1.0',
            'contact_phone' => '09171234567',
            'application_status' => 'submitted',
            'submitted_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $appBranchId = DB::table('restaurant_application_branches')->insertGetId([
            'restaurant_application_id' => $appId,
            'branch_name' => 'BGC Kiosk',
            'address_id' => $appAddrId,
            'contact_phone' => '09171234568',
            'sort_order' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $prePermitId = DB::table('branch_permits')->insertGetId([
            'application_branch_id' => $appBranchId,
            'is_required_locally' => 0,
            'exemption_reason' => 'Pop-up kiosk exempt under barangay rules.',
            'permit_status' => 'pending_review',
            'uploaded_by' => $applicant->user_id,
            'uploaded_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($admin)
            ->postJson("/api/admin/branch-permits/{$prePermitId}/waive", ['review_note' => 'Exemption accepted for kiosk.'])
            ->assertStatus(200);

        $notifWaived = DB::table('notifications')
            ->where('user_id', $applicant->user_id)
            ->where('type', 'branch_permit_waived')
            ->where('related_entity_id', $prePermitId)
            ->first();
        $this->assertNotNull($notifWaived);
        $this->assertSame('customer', $notifWaived->workspace);
        $this->assertStringContainsString('PreApproval Cafe — BGC Kiosk', $notifWaived->body);
    }

    public function test_admin_queue_filtering_file_streaming_restaurants_list_and_application_detail(): void
    {
        Storage::fake('local');
        $owner = $this->createUser('customer', 'owner');
        $admin = $this->createUser('admin', 'admin');
        ['root_id' => $rootId, 'branch_id' => $branchId, 'permit_id' => $permitId] = $this->createBrandWithChildPermit($owner, true, false);
        ['permit_id' => $noFilePermitId] = $this->createBrandWithChildPermit($owner, false, false);

        // Queue filtering by status & search
        $queueRes = $this->actingAs($admin)
            ->getJson('/api/admin/branch-permits?status=pending_review&search=Admin+Review+Bistro&per_page=10')
            ->assertStatus(200);
        $queueIds = collect($queueRes->json('data.items'))->pluck('permit_id')->all();
        $this->assertContains($permitId, $queueIds);
        $this->assertNotContains($noFilePermitId, $queueIds);

        // Detail with file vs without file
        $this->actingAs($admin)
            ->getJson("/api/admin/branch-permits/{$permitId}")
            ->assertStatus(200)
            ->assertJsonPath('data.permit.has_file', true)
            ->assertJsonPath('data.permit.file_url', url("/api/admin/branch-permits/{$permitId}/file"));

        $this->actingAs($admin)
            ->getJson("/api/admin/branch-permits/{$noFilePermitId}")
            ->assertStatus(200)
            ->assertJsonPath('data.permit.has_file', false)
            ->assertJsonPath('data.permit.file_url', null);

        // File streaming: 200 for file, 404 for no file
        $this->actingAs($admin)->get("/api/admin/branch-permits/{$permitId}/file")->assertStatus(200);
        $this->actingAs($admin)->get("/api/admin/branch-permits/{$noFilePermitId}/file")->assertStatus(404);

        // Admin restaurants list: non-root gets branch_permits status, root gets derived status ('not_submitted' or from application_documents)
        // Also verify no N+1 queries on admin restaurants list
        DB::enableQueryLog();
        $restListRes = $this->actingAs($admin)
            ->getJson('/api/admin/restaurants?search=Admin+Review+Bistro&per_page=20')
            ->assertStatus(200);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        $this->assertLessThanOrEqual(8, count($queries));

        $restItems = collect($restListRes->json('data.items'));
        $rootRow = $restItems->firstWhere('restaurant_id', $rootId);
        $branchRow = $restItems->firstWhere('restaurant_id', $branchId);
        $this->assertSame('not_submitted', $rootRow['permit_status'] ?? null);
        $this->assertTrue((bool) ($rootRow['is_required_locally'] ?? false));
        $this->assertSame('pending_review', $branchRow['permit_status'] ?? null);

        // Application review detail includes branches[].permit_* for materialized branch
        $appAddrId = $this->createAddress('Loyola Heights', '77 Katipunan');
        $appId = DB::table('restaurant_applications')->insertGetId([
            'applicant_user_id' => $owner->user_id,
            'restaurant_id' => $rootId,
            'reference_number' => 'SALO-MAT-' . random_int(10000, 99999),
            'legal_first_name' => 'Owner',
            'legal_last_name' => 'Tester',
            'applicant_position' => 'business_owner',
            'date_of_birth' => '1990-01-01',
            'contact_email' => $owner->email,
            'contact_email_verified_at' => now(),
            'declarations_accepted_at' => now(),
            'terms_version' => 'v1.0',
            'contact_phone' => '09171234567',
            'application_status' => 'approved',
            'reviewed_by' => $admin->user_id,
            'reviewed_at' => now(),
            'decided_at' => now(),
            'submitted_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $matAppBranchId = DB::table('restaurant_application_branches')->insertGetId([
            'restaurant_application_id' => $appId,
            'branch_name' => 'Makati',
            'address_id' => $appAddrId,
            'contact_phone' => '09171234568',
            'sort_order' => 1,
            'created_branch_restaurant_id' => $branchId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('branch_permits')->where('permit_id', $permitId)->update(['application_branch_id' => $matAppBranchId]);

        $appDetailRes = $this->actingAs($admin)
            ->getJson("/api/admin/applications/restaurant/{$appId}")
            ->assertStatus(200);
        $firstBranch = $appDetailRes->json('data.application.branches.0');
        $this->assertSame($permitId, $firstBranch['permit_id'] ?? null);
        $this->assertSame('pending_review', $firstBranch['permit_status'] ?? null);
        $this->assertTrue((bool) ($firstBranch['permit_is_required_locally'] ?? false));
    }
}
