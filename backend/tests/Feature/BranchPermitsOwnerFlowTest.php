<?php

namespace Tests\Feature;

use App\Features\Restaurants\Services\BranchPermitService;
use App\Models\User;
use App\Support\AddressService;
use App\Support\RestaurantBranchService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;

class BranchPermitsOwnerFlowTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'bp2a'): User
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

    private function createRootRestaurant(User $owner, string $status = 'active', bool $published = true): int
    {
        $branchService = app(RestaurantBranchService::class);
        $rootId = $branchService->createRootRestaurant([
            'restaurant_name' => 'Permit Grill',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'description' => 'Authentic Filipino grill.',
            'contact_phone' => '09171234567',
            'business_email' => $owner->email,
            'address_id' => $this->createAddress(),
            'branch_name' => 'Main',
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'accepting_orders' => 1,
            'restaurant_status' => $status,
            'is_published' => $published ? 1 : 0,
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $rootId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        return $rootId;
    }

    private function addManager(int $restaurantId, User $manager, User $owner): void
    {
        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $manager->user_id,
            'invited_by' => $owner->user_id,
            'staff_position' => 'Manager',
            'staff_status' => 'active',
            'invited_at' => now(),
            'responded_at' => now(),
        ]);
    }

    private function fakePdf(string $name = 'mayors-permit.pdf', string $extra = ''): UploadedFile
    {
        return UploadedFile::fake()->createWithContent(
            $name,
            "%PDF-1.4\n1 0 obj\n<<>>\nendobj\n{$extra}\ntrailer\n<<>>\n%%EOF"
        );
    }

    private function branchPayload(string $branchName = 'BGC'): array
    {
        return [
            'branch_name' => $branchName,
            'province' => 'Metro Manila',
            'city' => 'Taguig',
            'barangay' => 'Fort Bonifacio',
            'street' => '5th Ave',
            'offers_delivery' => 1,
            'offers_pickup' => 1,
        ];
    }

    public function test_create_branch_with_file_exemption_and_neither(): void
    {
        Storage::fake('local');
        $owner = $this->createUser('customer', 'owner');
        $admin = $this->createUser('admin', 'admin');
        $rootId = $this->createRootRestaurant($owner);

        // 1. With file -> pending_review, private file stored, admin notified
        $res1 = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->post('/api/restaurant/branches', array_merge($this->branchPayload('BGC'), [
                'mayors_permit' => $this->fakePdf('bgc-permit.pdf'),
            ]));

        $res1->assertStatus(201);
        $branch1Id = (int) $res1->json('data.branch.restaurant_id');
        $permit1 = DB::table('branch_permits')->where('restaurant_id', $branch1Id)->first();
        $this->assertNotNull($permit1);
        $this->assertSame('pending_review', $permit1->permit_status);
        $this->assertSame(1, (int) $permit1->is_required_locally);
        $this->assertNotNull($permit1->file_path);
        Storage::disk('local')->assertExists($permit1->file_path);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $admin->user_id,
            'type' => 'branch_permit_submitted',
            'related_entity_id' => $permit1->permit_id,
        ]);

        // 2. With exemption (is_required_locally=false + exemption_reason) -> pending_review
        $res2 = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->post('/api/restaurant/branches', array_merge($this->branchPayload('Pop-Up'), [
                'is_required_locally' => 0,
                'exemption_reason' => 'Barangay micro-stall exempt under local ordinance.',
            ]));

        $res2->assertStatus(201);
        $branch2Id = (int) $res2->json('data.branch.restaurant_id');
        $permit2 = DB::table('branch_permits')->where('restaurant_id', $branch2Id)->first();
        $this->assertNotNull($permit2);
        $this->assertSame('pending_review', $permit2->permit_status);
        $this->assertSame(0, (int) $permit2->is_required_locally);
        $this->assertNull($permit2->file_path);

        // 3. With neither -> pending_submission (hidden & unpublishable)
        $res3 = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->post('/api/restaurant/branches', $this->branchPayload('Makati'));

        $res3->assertStatus(201);
        $branch3Id = (int) $res3->json('data.branch.restaurant_id');
        $permit3 = DB::table('branch_permits')->where('restaurant_id', $branch3Id)->first();
        $this->assertNotNull($permit3);
        $this->assertSame('pending_submission', $permit3->permit_status);
        $this->assertSame(1, (int) $permit3->is_required_locally);
        $this->assertNull($permit3->file_path);
    }

    public function test_create_branch_validation_auth_inactive_root_and_limit(): void
    {
        Storage::fake('local');
        $owner = $this->createUser('customer', 'owner');
        $staffManager = $this->createUser('customer', 'mgr');
        $outsider = $this->createUser('customer', 'out');
        $rootId = $this->createRootRestaurant($owner);
        $this->addManager($rootId, $staffManager, $owner);

        // Invalid file type and spoofed .pdf extension with plain text content
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->postJson('/api/restaurant/branches', array_merge($this->branchPayload('BadFile'), [
                'mayors_permit' => UploadedFile::fake()->create('script.txt', 10, 'text/plain'),
            ]))
            ->assertStatus(422);

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->postJson('/api/restaurant/branches', array_merge($this->branchPayload('SpoofedPdf'), [
                'mayors_permit' => UploadedFile::fake()->createWithContent('spoofed.pdf', 'plain text not a pdf'),
            ]))
            ->assertStatus(422);

        // Invalid exemption length (< 10)
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->postJson('/api/restaurant/branches', array_merge($this->branchPayload('ShortEx'), [
                'is_required_locally' => false,
                'exemption_reason' => 'Too short',
            ]))
            ->assertStatus(422);

        // Staff/Manager and outsider -> 403
        $this->actingAs($staffManager)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->postJson('/api/restaurant/branches', $this->branchPayload('MgrTry'))
            ->assertStatus(403);

        $this->actingAs($outsider)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->postJson('/api/restaurant/branches', $this->branchPayload('OutTry'))
            ->assertStatus(403);

        // Branch limit counts branches in ANY permit state (e.g., max=2: root + 1 pending_submission)
        Config::set('salo.restaurants.max_branches_per_business', 2);
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->post('/api/restaurant/branches', $this->branchPayload('Branch2'))
            ->assertStatus(201);

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->postJson('/api/restaurant/branches', $this->branchPayload('Branch3'))
            ->assertStatus(422);

        // Inactive root -> 403
        Config::set('salo.restaurants.max_branches_per_business', 10);
        DB::table('restaurants')->where('restaurant_id', $rootId)->update(['restaurant_status' => 'suspended']);
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->postJson('/api/restaurant/branches', $this->branchPayload('SuspendedRoot'))
            ->assertStatus(403);
    }

    public function test_create_branch_db_failure_cleans_up_only_newly_uploaded_file(): void
    {
        Storage::fake('local');
        $owner = $this->createUser('customer', 'owner');
        $rootId = $this->createRootRestaurant($owner);

        // Existing unrelated private file must NOT be touched
        Storage::disk('local')->put("branch-permits/{$rootId}/existing-old.pdf", 'keep-me');

        $mockBranchService = Mockery::mock(RestaurantBranchService::class)->makePartial();
        $mockBranchService->shouldReceive('createChildBranch')
            ->once()
            ->andThrow(new \RuntimeException('Simulated DB failure'));
        $this->app->instance(RestaurantBranchService::class, $mockBranchService);

        $res = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->post('/api/restaurant/branches', array_merge($this->branchPayload('RollbackBranch'), [
                'mayors_permit' => $this->fakePdf('rollback.pdf'),
            ]));

        $res->assertStatus(500);
        Storage::disk('local')->assertExists("branch-permits/{$rootId}/existing-old.pdf");
        $files = Storage::disk('local')->files("branch-permits/{$rootId}");
        $this->assertSame(["branch-permits/{$rootId}/existing-old.pdf"], $files);
    }

    public function test_reupload_matrix_retains_old_files_and_audits_paths(): void
    {
        Storage::fake('local');
        $owner = $this->createUser('customer', 'owner');
        $rootId = $this->createRootRestaurant($owner);

        $createRes = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->post('/api/restaurant/branches', $this->branchPayload('Ortigas'));
        $createRes->assertStatus(201);
        $branchId = (int) $createRes->json('data.branch.restaurant_id');

        // 1. pending_submission -> submit file -> pending_review
        $firstPdf = $this->fakePdf('first.pdf', 'v1');
        $resSubmit = $this->actingAs($owner)
            ->post("/api/restaurant/branches/{$branchId}/permit", [
                'mayors_permit' => $firstPdf,
            ]);
        $resSubmit->assertStatus(200)
            ->assertJsonPath('data.permit.permit_status', 'pending_review');

        $permitAfterFirst = DB::table('branch_permits')->where('restaurant_id', $branchId)->first();
        $firstPath = (string) $permitAfterFirst->file_path;
        Storage::disk('local')->assertExists($firstPath);

        // 2. Idempotent identical retry while pending_review -> 200
        $this->actingAs($owner)
            ->post("/api/restaurant/branches/{$branchId}/permit", [
                'mayors_permit' => $this->fakePdf('first.pdf', 'v1'),
            ])
            ->assertStatus(200)
            ->assertJsonPath('data.permit.permit_status', 'pending_review');

        // 3. Different payload while pending_review (different file, same name/size with different bytes, OR exemption) -> 409
        $this->actingAs($owner)
            ->postJson("/api/restaurant/branches/{$branchId}/permit", [
                'mayors_permit' => $this->fakePdf('different.pdf', 'v2-different'),
            ])
            ->assertStatus(409);

        $this->actingAs($owner)
            ->postJson("/api/restaurant/branches/{$branchId}/permit", [
                'mayors_permit' => $this->fakePdf('first.pdf', 'v2'),
            ])
            ->assertStatus(409);

        $this->actingAs($owner)
            ->postJson("/api/restaurant/branches/{$branchId}/permit", [
                'is_required_locally' => false,
                'exemption_reason' => 'Switching from file to exemption while pending review.',
            ])
            ->assertStatus(409);

        // 3b. Exemption idempotent retry -> 200; different exemption text -> 409
        $exBranchRes = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->post('/api/restaurant/branches', array_merge($this->branchPayload('ExRetry'), [
                'is_required_locally' => 0,
                'exemption_reason' => 'Exempt kiosk under LGU barangay rules.',
            ]))->assertStatus(201);
        $exBranchId = (int) $exBranchRes->json('data.branch.restaurant_id');

        $this->actingAs($owner)
            ->postJson("/api/restaurant/branches/{$exBranchId}/permit", [
                'is_required_locally' => false,
                'exemption_reason' => 'Exempt kiosk under LGU barangay rules.',
            ])
            ->assertStatus(200);

        $this->actingAs($owner)
            ->postJson("/api/restaurant/branches/{$exBranchId}/permit", [
                'is_required_locally' => false,
                'exemption_reason' => 'Different exemption reason text should conflict.',
            ])
            ->assertStatus(409);

        // 4. under_review, approved, waived -> 409
        foreach (['under_review', 'approved', 'waived'] as $blockedStatus) {
            DB::table('branch_permits')->where('restaurant_id', $branchId)->update([
                'permit_status' => $blockedStatus,
                'review_note' => $blockedStatus === 'waived' ? 'Waived by admin.' : null,
            ]);
            $this->actingAs($owner)
                ->postJson("/api/restaurant/branches/{$branchId}/permit", [
                    'is_required_locally' => false,
                    'exemption_reason' => 'Trying to overwrite a locked status.',
                ])
                ->assertStatus(409);
        }

        // 5. additional_info_required -> allowed, retains old file, logs old/new file_path
        DB::table('branch_permits')->where('restaurant_id', $branchId)->update([
            'permit_status' => 'additional_info_required',
            'review_note' => 'Please upload clearer scan.',
        ]);
        $this->actingAs($owner)
            ->post("/api/restaurant/branches/{$branchId}/permit", [
                'mayors_permit' => $this->fakePdf('second.pdf', 'v2-clearer'),
            ])
            ->assertStatus(200)
            ->assertJsonPath('data.permit.permit_status', 'pending_review')
            ->assertJsonPath('data.permit.review_note', null);

        $permitAfterSecond = DB::table('branch_permits')->where('restaurant_id', $branchId)->first();
        $secondPath = (string) $permitAfterSecond->file_path;
        $this->assertNotSame($firstPath, $secondPath);
        Storage::disk('local')->assertExists($firstPath);
        Storage::disk('local')->assertExists($secondPath);

        // 6. rejected -> allowed
        DB::table('branch_permits')->where('restaurant_id', $branchId)->update([
            'permit_status' => 'rejected',
            'review_note' => 'Expired permit.',
        ]);
        $this->actingAs($owner)
            ->post("/api/restaurant/branches/{$branchId}/permit", [
                'mayors_permit' => $this->fakePdf('third.pdf', 'v3-renewed'),
            ])
            ->assertStatus(200)
            ->assertJsonPath('data.permit.permit_status', 'pending_review');

        $permitAfterThird = DB::table('branch_permits')->where('restaurant_id', $branchId)->first();
        Storage::disk('local')->assertExists($firstPath);
        Storage::disk('local')->assertExists($secondPath);
        Storage::disk('local')->assertExists((string) $permitAfterThird->file_path);

        $audit = DB::table('audit_logs')
            ->where('action', 'branch_permit_submitted')
            ->where('entity_id', $permitAfterThird->permit_id)
            ->orderByDesc('log_id')
            ->first();
        $this->assertNotNull($audit);
        $oldValues = json_decode((string) $audit->old_values, true);
        $newValues = json_decode((string) $audit->new_values, true);
        $this->assertSame($secondPath, $oldValues['file_path'] ?? null);
        $this->assertSame((string) $permitAfterThird->file_path, $newValues['file_path'] ?? null);
    }

    public function test_permit_file_streaming_authorization(): void
    {
        Storage::fake('local');
        $owner = $this->createUser('customer', 'owner');
        $admin = $this->createUser('admin', 'admin');
        $manager = $this->createUser('customer', 'mgr');
        $outsider = $this->createUser('customer', 'out');
        $rootId = $this->createRootRestaurant($owner);

        $createRes = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->post('/api/restaurant/branches', array_merge($this->branchPayload('Alabang'), [
                'mayors_permit' => $this->fakePdf('alabang.pdf'),
            ]));
        $createRes->assertStatus(201);
        $branchId = (int) $createRes->json('data.branch.restaurant_id');

        $this->addManager($branchId, $manager, $owner);

        // Owner -> 200
        $this->actingAs($owner)
            ->get("/api/restaurant/branches/{$branchId}/permit/file")
            ->assertStatus(200);

        // Admin -> 200
        $this->actingAs($admin)
            ->get("/api/restaurant/branches/{$branchId}/permit/file")
            ->assertStatus(200);

        // Staff/Manager -> 403
        $this->actingAs($manager)
            ->get("/api/restaurant/branches/{$branchId}/permit/file")
            ->assertStatus(403);

        // Outsider / other business -> 403
        $this->actingAs($outsider)
            ->get("/api/restaurant/branches/{$branchId}/permit/file")
            ->assertStatus(403);

        // Root restaurant (no branch_permits row) -> 404 (not 500)
        $this->actingAs($owner)
            ->get("/api/restaurant/branches/{$rootId}/permit/file")
            ->assertStatus(404);

        // Branch permit without a file (pending_submission) -> 404 (not 500)
        $noFileRes = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->post('/api/restaurant/branches', $this->branchPayload('NoFileYet'))
            ->assertStatus(201);
        $noFileBranchId = (int) $noFileRes->json('data.branch.restaurant_id');
        $this->actingAs($owner)
            ->get("/api/restaurant/branches/{$noFileBranchId}/permit/file")
            ->assertStatus(404);
    }

    public function test_fail_closed_visibility_publish_checkout_transition_and_owner_only_fields(): void
    {
        Storage::fake('local');
        $owner = $this->createUser('customer', 'owner');
        $admin = $this->createUser('admin', 'admin');
        $manager = $this->createUser('customer', 'mgr');
        $customer = $this->createUser('customer', 'cust');
        $rootId = $this->createRootRestaurant($owner, 'active', true);

        // Create child branch without permit (pending_submission), force is_published=1 in DB to verify fail-closed query
        $createRes = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->post('/api/restaurant/branches', $this->branchPayload('Cebu'));
        $createRes->assertStatus(201);
        $childId = (int) $createRes->json('data.branch.restaurant_id');

        $this->addManager($childId, $manager, $owner);

        // Add operating hours + menu item to root & child so publish checks only fail on permit
        foreach ([$rootId, $childId] as $rid) {
            for ($d = 0; $d <= 6; $d++) {
                DB::table('operating_hours')->insert([
                    'restaurant_id' => $rid,
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
                'restaurant_id' => $rid,
                'category_name' => 'Mains',
                'sort_order' => 1,
                'is_active' => 1,
                'is_published' => 1,
                'published_category_name' => 'Mains',
                'published_sort_order' => 1,
                'published_is_active' => 1,
                'draft_state' => 'clean',
            ]);
            DB::table('menu_items')->insert([
                'restaurant_id' => $rid,
                'menu_category_id' => $catId,
                'published_menu_category_id' => $catId,
                'item_name' => 'Chicken Inasal',
                'published_item_name' => 'Chicken Inasal',
                'base_price' => 199.00,
                'published_base_price' => 199.00,
                'availability_status' => 'available',
                'approval_status' => 'approved',
                'is_published' => 1,
                'draft_state' => 'clean',
            ]);
        }

        // Root is unaffected (visible and publishable with no branch_permits row)
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $rootId)
            ->postJson('/api/restaurant/menu/publish')
            ->assertStatus(200);

        // Child cannot publish while pending_submission -> 422 with exact blocker
        $publishBlocked = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $childId)
            ->postJson('/api/restaurant/menu/publish');
        $publishBlocked->assertStatus(422);
        $this->assertContains(
            "Branch Mayor's / Business Permit must be verified or waived before publishing.",
            $publishBlocked->json('errors.publish', [])
        );

        // Even if is_published=1 in DB, child is hidden from listing, detail siblings[], and checkout
        DB::table('restaurants')->where('restaurant_id', $childId)->update(['is_published' => 1]);
        $listRes = $this->getJson('/api/restaurants?search=Permit+Grill&per_page=50');
        $listRes->assertStatus(200);
        $listedIds = collect($listRes->json('data.restaurants'))->pluck('id')->all();
        $this->assertContains($rootId, $listedIds);
        $this->assertNotContains($childId, $listedIds);

        $detailRes = $this->getJson("/api/restaurants/{$rootId}");
        $detailRes->assertStatus(200);
        $siblingIds = collect($detailRes->json('data.restaurant.siblings'))->pluck('id')->all();
        $this->assertNotContains($childId, $siblingIds);

        $childItemId = (int) DB::table('menu_items')->where('restaurant_id', $childId)->value('menu_item_id');
        $custAddrId = $this->createAddress('Kamuning', '12 Scout St');
        DB::table('user_addresses')->insert([
            'user_id' => $customer->user_id,
            'address_id' => $custAddrId,
            'address_label' => 'Home',
            'is_default' => 1,
        ]);
        $checkoutRes = $this->actingAs($customer)
            ->postJson('/api/customer/checkout', [
                'idempotency_key' => 'bp2a-unverified-' . random_int(1000, 9999),
                'contact_phone' => '09179998888',
                'payment_method' => 'cod',
                'groups' => [
                    [
                        'restaurant_id' => $childId,
                        'fulfillment' => 'pickup',
                        'items' => [['menu_item_id' => $childItemId, 'quantity' => 1]],
                    ],
                ],
            ]);
        $this->assertTrue(in_array($checkoutRes->status(), [404, 422], true));

        // Missing permit row altogether is also hidden and unpublishable
        DB::table('branch_permits')->where('restaurant_id', $childId)->delete();
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $childId)
            ->postJson('/api/restaurant/menu/publish')
            ->assertStatus(422);
        $listNoRow = $this->getJson('/api/restaurants?search=Permit+Grill&per_page=50');
        $this->assertNotContains($childId, collect($listNoRow->json('data.restaurants'))->pluck('id')->all());

        // Re-insert permit row and approve it -> visible, publishable, in siblings[]
        $permitId = DB::table('branch_permits')->insertGetId([
            'restaurant_id' => $childId,
            'is_required_locally' => 1,
            'permit_status' => 'pending_review',
            'file_path' => "branch-permits/{$rootId}/cebu.pdf",
            'original_filename' => 'cebu.pdf',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        app(BranchPermitService::class)->transitionStatus(
            $permitId,
            BranchPermitService::STATUS_APPROVED,
            $admin,
            'Verified.',
            Request::create('/'),
        );

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $childId)
            ->postJson('/api/restaurant/menu/publish')
            ->assertStatus(200);

        $listApproved = $this->getJson('/api/restaurants?search=Permit+Grill&per_page=50');
        $this->assertContains($childId, collect($listApproved->json('data.restaurants'))->pluck('id')->all());
        $detailApproved = $this->getJson("/api/restaurants/{$rootId}");
        $this->assertContains($childId, collect($detailApproved->json('data.restaurant.siblings'))->pluck('id')->all());

        // Transitioning approved -> rejected sets is_published = 0 in the same transaction
        app(BranchPermitService::class)->transitionStatus(
            $permitId,
            BranchPermitService::STATUS_REJECTED,
            $admin,
            'Revoked due to mismatch.',
            Request::create('/'),
        );
        $this->assertSame(0, (int) DB::table('restaurants')->where('restaurant_id', $childId)->value('is_published'));

        // Owner sees permit fields ONLY on non-root branches in GET /api/restaurant/branches & /api/auth/me
        $ownerBranches = $this->actingAs($owner)->getJson('/api/restaurant/branches')->json('data.branches');
        $ownerRoot = collect($ownerBranches)->firstWhere('restaurant_id', $rootId);
        $ownerChild = collect($ownerBranches)->firstWhere('restaurant_id', $childId);
        $this->assertArrayNotHasKey('permit_status', $ownerRoot);
        $this->assertSame('rejected', $ownerChild['permit_status'] ?? null);

        $ownerMe = $this->actingAs($owner)->getJson('/api/auth/me')->json('data.user.restaurant_ownerships');
        $meRoot = collect($ownerMe)->firstWhere('restaurant_id', $rootId);
        $meChild = collect($ownerMe)->firstWhere('restaurant_id', $childId);
        $this->assertNotNull($meRoot);
        $this->assertNotNull($meChild);
        $this->assertArrayNotHasKey('permit_status', $meRoot);
        $this->assertSame('rejected', $meChild['permit_status'] ?? null);

        // Staff/Manager and non-manager Staff (canonical position) do NOT see permit fields on any branch
        $orderStaff = $this->createUser('customer', 'ostaff');
        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $childId,
            'user_id' => $orderStaff->user_id,
            'invited_by' => $owner->user_id,
            'staff_position' => 'Order Staff',
            'staff_status' => 'active',
            'invited_at' => now(),
            'responded_at' => now(),
        ]);

        foreach ([$manager, $orderStaff] as $staffUser) {
            $staffBranches = $this->actingAs($staffUser)->getJson('/api/restaurant/branches')->json('data.branches');
            $staffChild = collect($staffBranches)->firstWhere('restaurant_id', $childId);
            $this->assertArrayNotHasKey('permit_status', $staffChild);

            $staffMe = $this->actingAs($staffUser)->getJson('/api/auth/me')->json('data.user.restaurant_staff_assignments');
            $staffMeChild = collect($staffMe)->firstWhere('restaurant_id', $childId);
            $this->assertNotNull($staffMeChild);
            $this->assertArrayNotHasKey('permit_status', $staffMeChild);
        }
    }
}
