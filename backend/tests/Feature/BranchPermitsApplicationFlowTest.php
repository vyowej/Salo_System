<?php

namespace Tests\Feature;

use App\Features\Restaurants\Services\BranchPermitService;
use App\Features\Auth\Mail\EmailOtpMail;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class BranchPermitsApplicationFlowTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'bp3'): User
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

    private function verifyApplicationOtp(User $user): void
    {
        Mail::fake();
        $this->actingAs($user)->postJson('/api/otp/send', [
            'email' => $user->email,
            'purpose' => 'restaurant_application',
        ])->assertOk();

        $otp = null;
        Mail::assertSent(EmailOtpMail::class, function (EmailOtpMail $mail) use (&$otp) {
            $otp = $mail->otpCode;

            return true;
        });

        $this->actingAs($user)->postJson('/api/otp/verify', [
            'email' => $user->email,
            'purpose' => 'restaurant_application',
            'code' => $otp,
        ])->assertOk();
    }

    private function fakePdf(string $name = 'permit.pdf', string $extra = ''): UploadedFile
    {
        return UploadedFile::fake()->createWithContent(
            $name,
            "%PDF-1.4\n1 0 obj\n<<>>\nendobj\n{$extra}\ntrailer\n<<>>\n%%EOF"
        );
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function baseApplicationPayload(User $user, array $overrides = []): array
    {
        return array_merge([
            'restaurant_name' => 'Permit3 Bistro',
            'registered_name' => 'Permit3 Bistro Corp',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'description' => 'Multi-branch partner application.',
            'business_phone' => '09179998888',
            'business_email' => $user->email,
            'categories' => ['Filipino · Grill & BBQ'],
            'applicant_position' => 'business_owner',
            'legal_first_name' => 'Maria',
            'legal_last_name' => 'Santos',
            'date_of_birth' => '1990-03-15',
            'contact_phone' => '09179998888',
            'contact_email' => $user->email,
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
            'payout_account_holder_name' => 'Maria Santos',
            'payout_account_number' => '1234567890',
            'terms_accepted' => true,
            'documents' => [
                'dti_certificate' => $this->fakePdf('dti.pdf'),
                'mayors_permit' => $this->fakePdf('main-permit.pdf'),
            ],
        ], $overrides);
    }

    private function branchData(string $name, array $extra = []): array
    {
        return array_merge([
            'branch_name' => $name,
            'province' => 'Metro Manila',
            'city' => 'Makati',
            'barangay' => 'Bel-Air',
            'street' => '100 Ayala Ave',
        ], $extra);
    }

    public function test_submit_application_with_required_exempt_omitted_invalid_exemption_and_5_location_limit(): void
    {
        Storage::fake('local');
        Storage::fake('public');

        // 1. Invalid exemption (< 10 chars) -> 422
        $user1 = $this->createUser('customer', 'bp3a');
        $this->verifyApplicationOtp($user1);
        $this->actingAs($user1)->post('/api/restaurant/applications', $this->baseApplicationPayload($user1, [
            'has_branches' => true,
            'main_branch_name' => 'Main QC',
            'branches' => [
                $this->branchData('Kiosk', [
                    'permit_required_locally' => false,
                    'permit_exemption_reason' => 'Too short',
                ]),
            ],
        ]), ['Accept' => 'application/json'])->assertStatus(422)
            ->assertJsonValidationErrors(['branches.0.permit_exemption_reason']);

        // 2. Over 5-location limit (1 main + 5 extra = 6) -> 422
        $fiveExtra = [];
        for ($i = 1; $i <= 5; $i++) {
            $fiveExtra[] = $this->branchData("Extra {$i}");
        }
        $this->actingAs($user1)->post('/api/restaurant/applications', $this->baseApplicationPayload($user1, [
            'has_branches' => true,
            'main_branch_name' => 'Main QC',
            'branches' => $fiveExtra,
        ]), ['Accept' => 'application/json'])->assertStatus(422)
            ->assertJsonValidationErrors(['branches']);

        // 3. Valid submission with 3 branches: required, exempt, omitted (defaults to required)
        $res = $this->actingAs($user1)->post('/api/restaurant/applications', $this->baseApplicationPayload($user1, [
            'has_branches' => true,
            'main_branch_name' => 'Main QC',
            'branches' => [
                $this->branchData('Makati', ['permit_required_locally' => true]),
                $this->branchData('Pop-Up', [
                    'permit_required_locally' => false,
                    'permit_exemption_reason' => 'Micro-stall exempt under barangay ordinance.',
                ]),
                $this->branchData('Ortigas'),
            ],
        ]), ['Accept' => 'application/json']);

        $res->assertStatus(201);
        $branches = $res->json('data.application.branches');
        $this->assertCount(3, $branches);
        $this->assertSame('pending_submission', $branches[0]['permit_status']);
        $this->assertTrue($branches[0]['is_required_locally']);
        $this->assertSame('pending_review', $branches[1]['permit_status']);
        $this->assertFalse($branches[1]['is_required_locally']);
        $this->assertSame('pending_submission', $branches[2]['permit_status']);
        $this->assertTrue($branches[2]['is_required_locally']);

        foreach ($branches as $b) {
            $this->assertDatabaseHas('branch_permits', [
                'application_branch_id' => $b['application_branch_id'],
                'restaurant_id' => null,
                'permit_status' => $b['permit_status'],
            ]);
        }
    }

    public function test_upload_per_branch_retry_content_hash_auth_terminal_state_and_failure_isolation(): void
    {
        Storage::fake('local');
        Storage::fake('public');

        $applicant = $this->createUser('customer', 'bp3b');
        $otherUser = $this->createUser('customer', 'other');
        $admin = $this->createUser('admin', 'adm');
        $this->verifyApplicationOtp($applicant);

        $submitRes = $this->actingAs($applicant)->post('/api/restaurant/applications', $this->baseApplicationPayload($applicant, [
            'has_branches' => true,
            'main_branch_name' => 'Main QC',
            'branches' => [
                $this->branchData('Makati'),
                $this->branchData('BGC'),
            ],
        ]), ['Accept' => 'application/json'])->assertStatus(201);

        $appId = (int) $submitRes->json('data.application.restaurant_application_id');
        $branch1Id = (int) $submitRes->json('data.application.branches.0.application_branch_id');
        $branch2Id = (int) $submitRes->json('data.application.branches.1.application_branch_id');

        // Non-applicant -> 403
        $this->actingAs($otherUser)
            ->post("/api/restaurant/applications/{$appId}/branches/{$branch1Id}/permit", [
                'mayors_permit' => $this->fakePdf('makati.pdf', 'AA'),
            ], ['Accept' => 'application/json'])
            ->assertStatus(403);

        // Invalid file content (spoofed .pdf with text) -> 422, leaves branch2 untouched
        $this->actingAs($applicant)
            ->post("/api/restaurant/applications/{$appId}/branches/{$branch1Id}/permit", [
                'mayors_permit' => UploadedFile::fake()->createWithContent('bad.pdf', 'not a pdf'),
            ], ['Accept' => 'application/json'])
            ->assertStatus(422);

        $this->assertDatabaseHas('branch_permits', [
            'application_branch_id' => $branch2Id,
            'permit_status' => 'pending_submission',
        ]);

        // Upload valid permit for branch 1 -> 200, admin notified
        $this->actingAs($applicant)
            ->post("/api/restaurant/applications/{$appId}/branches/{$branch1Id}/permit", [
                'mayors_permit' => $this->fakePdf('makati.pdf', 'AA'),
            ], ['Accept' => 'application/json'])
            ->assertStatus(200)
            ->assertJsonPath('data.permit.permit_status', 'pending_review');

        $permit1 = DB::table('branch_permits')->where('application_branch_id', $branch1Id)->first();
        Storage::disk('local')->assertExists($permit1->file_path);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $admin->user_id,
            'type' => 'branch_permit_submitted',
            'related_entity_id' => $permit1->permit_id,
        ]);

        // Identical bytes retry -> 200 idempotent
        $this->actingAs($applicant)
            ->post("/api/restaurant/applications/{$appId}/branches/{$branch1Id}/permit", [
                'mayors_permit' => $this->fakePdf('makati.pdf', 'AA'),
            ], ['Accept' => 'application/json'])
            ->assertStatus(200);

        // Same filename + same byte length, DIFFERENT content bytes -> 409 (not identical!)
        $this->actingAs($applicant)
            ->post("/api/restaurant/applications/{$appId}/branches/{$branch1Id}/permit", [
                'mayors_permit' => $this->fakePdf('makati.pdf', 'BB'),
            ], ['Accept' => 'application/json'])
            ->assertStatus(409);

        // Terminal application (rejected) -> 409 on branch 2
        DB::table('restaurant_applications')->where('restaurant_application_id', $appId)->update([
            'application_status' => 'rejected',
            'reviewer_note' => 'Rejected for test.',
            'reviewed_by' => $admin->user_id,
            'reviewed_at' => now(),
            'decided_at' => now(),
        ]);
        $this->actingAs($applicant)
            ->post("/api/restaurant/applications/{$appId}/branches/{$branch2Id}/permit", [
                'mayors_permit' => $this->fakePdf('bgc.pdf', 'CC'),
            ], ['Accept' => 'application/json'])
            ->assertStatus(409);
    }

    public function test_applicant_read_payloads_and_file_endpoint(): void
    {
        Storage::fake('local');
        Storage::fake('public');

        $applicant = $this->createUser('customer', 'bp3c');
        $other = $this->createUser('customer', 'other');
        $admin = $this->createUser('admin', 'adm');
        $this->verifyApplicationOtp($applicant);

        $submitRes = $this->actingAs($applicant)->post('/api/restaurant/applications', $this->baseApplicationPayload($applicant, [
            'has_branches' => true,
            'main_branch_name' => 'Main QC',
            'branches' => [
                $this->branchData('Makati'),
                $this->branchData('BGC'),
            ],
        ]), ['Accept' => 'application/json'])->assertStatus(201);

        $appId = (int) $submitRes->json('data.application.restaurant_application_id');
        $branch1Id = (int) $submitRes->json('data.application.branches.0.application_branch_id');
        $branch2Id = (int) $submitRes->json('data.application.branches.1.application_branch_id');

        $this->actingAs($applicant)
            ->post("/api/restaurant/applications/{$appId}/branches/{$branch1Id}/permit", [
                'mayors_permit' => $this->fakePdf('makati.pdf', 'F1'),
            ], ['Accept' => 'application/json'])
            ->assertStatus(200);

        $current = $this->actingAs($applicant)->getJson('/api/restaurant/applications/current')->assertStatus(200);
        $b1 = $current->json('data.application.branches.0');
        $b2 = $current->json('data.application.branches.1');

        $this->assertSame('pending_review', $b1['permit_status']);
        $this->assertTrue($b1['has_file']);
        $this->assertArrayNotHasKey('file_path', $b1);
        $this->assertSame('pending_submission', $b2['permit_status']);
        $this->assertFalse($b2['has_file']);
        $this->assertArrayNotHasKey('file_path', $b2);

        // File endpoint: 200 for applicant with file, 404 when no file, 403 for others (incl. admin)
        $this->actingAs($applicant)->get("/api/restaurant/applications/{$appId}/branches/{$branch1Id}/permit/file")->assertStatus(200);
        $this->actingAs($applicant)->get("/api/restaurant/applications/{$appId}/branches/{$branch2Id}/permit/file")->assertStatus(404);
        $this->actingAs($other)->get("/api/restaurant/applications/{$appId}/branches/{$branch1Id}/permit/file")->assertStatus(403);
        $this->actingAs($admin)->get("/api/restaurant/applications/{$appId}/branches/{$branch1Id}/permit/file")->assertStatus(403);
    }

    public function test_admin_review_pre_materialization_permit_and_self_review(): void
    {
        Storage::fake('local');
        Storage::fake('public');

        $applicant = $this->createUser('customer', 'bp3d');
        $admin = $this->createUser('admin', 'adm');
        $selfAdmin = $this->createUser('admin', 'selfadm');
        $this->verifyApplicationOtp($applicant);
        $this->verifyApplicationOtp($selfAdmin);

        $submitRes = $this->actingAs($applicant)->post('/api/restaurant/applications', $this->baseApplicationPayload($applicant, [
            'has_branches' => true,
            'main_branch_name' => 'Main QC',
            'branches' => [
                $this->branchData('Makati'),
                $this->branchData('Kiosk', [
                    'permit_required_locally' => false,
                    'permit_exemption_reason' => 'Exempt under local barangay ordinance.',
                ]),
            ],
        ]), ['Accept' => 'application/json'])->assertStatus(201);

        $appId = (int) $submitRes->json('data.application.restaurant_application_id');
        $b1Id = (int) $submitRes->json('data.application.branches.0.application_branch_id');
        $p1Id = (int) $submitRes->json('data.application.branches.0.permit_id');
        $p2Id = (int) $submitRes->json('data.application.branches.1.permit_id');

        $this->actingAs($applicant)
            ->post("/api/restaurant/applications/{$appId}/branches/{$b1Id}/permit", [
                'mayors_permit' => $this->fakePdf('makati.pdf', 'PRE'),
            ], ['Accept' => 'application/json'])
            ->assertStatus(200);

        // Admin queue & detail & file stream work with restaurant_id = null
        $this->actingAs($admin)->getJson("/api/admin/branch-permits/{$p1Id}")
            ->assertStatus(200)
            ->assertJsonPath('data.permit.restaurant_id', null)
            ->assertJsonPath('data.permit.display_name', 'Permit3 Bistro — Makati');
        $this->actingAs($admin)->get("/api/admin/branch-permits/{$p1Id}/file")->assertStatus(200);

        // Request-info -> notifies applicant in customer workspace
        $this->actingAs($admin)->postJson("/api/admin/branch-permits/{$p1Id}/request-info", [
            'review_note' => 'Please upload a clearer scan of the permit.',
        ])->assertStatus(200);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $applicant->user_id,
            'workspace' => 'customer',
            'type' => 'branch_permit_info_requested',
            'related_entity_id' => $p1Id,
        ]);

        // Re-upload -> approve
        $this->actingAs($applicant)
            ->post("/api/restaurant/applications/{$appId}/branches/{$b1Id}/permit", [
                'mayors_permit' => $this->fakePdf('makati-v2.pdf', 'PRE2'),
            ], ['Accept' => 'application/json'])
            ->assertStatus(200);
        $this->actingAs($admin)->postJson("/api/admin/branch-permits/{$p1Id}/approve")->assertStatus(200);

        // Waive p2 (with exemption) succeeds; waive p1 (required) -> 422
        $this->actingAs($admin)->postJson("/api/admin/branch-permits/{$p1Id}/waive", ['review_note' => 'Cannot waive required.'])->assertStatus(422);
        $this->actingAs($admin)->postJson("/api/admin/branch-permits/{$p2Id}/waive", ['review_note' => 'Exemption verified for kiosk.'])->assertStatus(200);

        // Self-review blocked (403) when admin is applicant
        $selfSubmit = $this->actingAs($selfAdmin)->post('/api/restaurant/applications', $this->baseApplicationPayload($selfAdmin, [
            'has_branches' => true,
            'main_branch_name' => 'Self Main',
            'branches' => [
                $this->branchData('Self Kiosk', [
                    'permit_required_locally' => false,
                    'permit_exemption_reason' => 'Exempt kiosk for self review test.',
                ]),
            ],
        ]), ['Accept' => 'application/json'])->assertStatus(201);
        $selfPermitId = (int) $selfSubmit->json('data.application.branches.0.permit_id');
        $this->actingAs($selfAdmin)->postJson("/api/admin/branch-permits/{$selfPermitId}/waive", [
            'review_note' => 'Trying to waive my own branch.',
        ])->assertStatus(403);
    }

    public function test_approval_materializes_reusing_permits_and_hands_off_to_owner_endpoint(): void
    {
        Storage::fake('local');
        Storage::fake('public');

        $applicant = $this->createUser('customer', 'bp3e');
        $admin = $this->createUser('admin', 'adm');
        $this->verifyApplicationOtp($applicant);

        $submitRes = $this->actingAs($applicant)->post('/api/restaurant/applications', $this->baseApplicationPayload($applicant, [
            'has_branches' => true,
            'main_branch_name' => 'Main QC',
            'branches' => [
                $this->branchData('PendingSub'),
                $this->branchData('RejectedBr'),
                $this->branchData('ApprovedBr'),
                $this->branchData('WaivedBr', [
                    'permit_required_locally' => false,
                    'permit_exemption_reason' => 'Exempt under barangay micro-stall ordinance.',
                ]),
            ],
        ]), ['Accept' => 'application/json'])->assertStatus(201);

        $appId = (int) $submitRes->json('data.application.restaurant_application_id');
        $branches = $submitRes->json('data.application.branches');

        // Upload & review RejectedBr, ApprovedBr, WaivedBr
        $this->actingAs($applicant)->post("/api/restaurant/applications/{$appId}/branches/{$branches[1]['application_branch_id']}/permit", [
            'mayors_permit' => $this->fakePdf('rej.pdf', 'R1'),
        ], ['Accept' => 'application/json'])->assertStatus(200);
        $this->actingAs($admin)->postJson("/api/admin/branch-permits/{$branches[1]['permit_id']}/reject", [
            'review_note' => 'Permit is blurry and expired.',
        ])->assertStatus(200);

        $this->actingAs($applicant)->post("/api/restaurant/applications/{$appId}/branches/{$branches[2]['application_branch_id']}/permit", [
            'mayors_permit' => $this->fakePdf('app.pdf', 'A1'),
        ], ['Accept' => 'application/json'])->assertStatus(200);
        $this->actingAs($admin)->postJson("/api/admin/branch-permits/{$branches[2]['permit_id']}/approve")->assertStatus(200);

        $this->actingAs($admin)->postJson("/api/admin/branch-permits/{$branches[3]['permit_id']}/waive", [
            'review_note' => 'Exemption verified.',
        ])->assertStatus(200);

        // Verify all main docs & approve application -> succeeds regardless of branch permit statuses
        DB::table('application_documents')
            ->where('restaurant_application_id', $appId)
            ->update(['document_status' => 'verified', 'reviewed_by' => $admin->user_id, 'reviewed_at' => now()]);

        DB::table('restaurant_applications')
            ->where('restaurant_application_id', $appId)
            ->update(['application_status' => 'under_review', 'reviewed_by' => $admin->user_id, 'reviewed_at' => now()]);

        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'approve',
        ])->assertStatus(200);

        // Reload branches: exact same permit_id reused, restaurant_id populated, no duplicate permit rows
        $after = $this->actingAs($applicant)->getJson('/api/restaurant/applications/current')->json('data.application.branches');
        $expectedStatuses = ['pending_submission', 'rejected', 'approved', 'waived'];
        foreach ($after as $idx => $b) {
            $this->assertSame($branches[$idx]['permit_id'], $b['permit_id']);
            $this->assertSame($expectedStatuses[$idx], $b['permit_status']);
            $this->assertNotNull($b['created_branch_restaurant_id']);
            $this->assertSame(1, DB::table('branch_permits')->where('application_branch_id', $b['application_branch_id'])->count());
            $this->assertSame(1, DB::table('branch_permits')->where('restaurant_id', $b['created_branch_restaurant_id'])->count());
        }

        // Old application upload endpoint now returns 409 pointing to owner endpoint; owner endpoint works on RejectedBr
        $rejectedRestId = (int) $after[1]['created_branch_restaurant_id'];
        $this->actingAs($applicant)->postJson("/api/restaurant/applications/{$appId}/branches/{$after[1]['application_branch_id']}/permit", [
            'mayors_permit' => $this->fakePdf('new.pdf', 'N1'),
        ])->assertStatus(409);

        $this->actingAs($applicant)->post("/api/restaurant/branches/{$rejectedRestId}/permit", [
            'mayors_permit' => $this->fakePdf('renewed.pdf', 'N2'),
        ], ['Accept' => 'application/json'])->assertStatus(200)
            ->assertJsonPath('data.permit.permit_status', 'pending_review');
    }

    public function test_branch_permit_notification_payloads_include_branch_context_and_never_leak_paths(): void
    {
        Storage::fake('local');
        Storage::fake('public');

        $applicant = $this->createUser('customer', 'bp_notif_app');
        $admin = $this->createUser('admin', 'bp_notif_adm');
        $this->verifyApplicationOtp($applicant);

        $submitRes = $this->actingAs($applicant)->post('/api/restaurant/applications', $this->baseApplicationPayload($applicant, [
            'has_branches' => true,
            'main_branch_name' => 'Main Hub',
            'branches' => [
                $this->branchData('Branch Info', ['permit_required_locally' => true]),
                $this->branchData('Branch Reject', ['permit_required_locally' => true]),
                $this->branchData('Branch Approve', ['permit_required_locally' => true]),
                $this->branchData('Branch Waive', [
                    'permit_required_locally' => false,
                    'permit_exemption_reason' => 'Exempt micro-kiosk under barangay rule.',
                ]),
            ],
        ]), ['Accept' => 'application/json'])->assertStatus(201);

        $appId = (int) $submitRes->json('data.application.restaurant_application_id');
        $branches = $submitRes->json('data.application.branches');

        // Upload permits for first 3 branches -> notifies admin with branch_permit_submitted
        foreach ([0, 1, 2] as $i) {
            $this->actingAs($applicant)->post("/api/restaurant/applications/{$appId}/branches/{$branches[$i]['application_branch_id']}/permit", [
                'mayors_permit' => $this->fakePdf("b{$i}.pdf", "PDF{$i}"),
            ], ['Accept' => 'application/json'])->assertStatus(200);
        }

        // Pre-approval admin decisions -> notifies applicant (customer workspace)
        $this->actingAs($admin)->postJson("/api/admin/branch-permits/{$branches[0]['permit_id']}/request-info", [
            'review_note' => 'Please upload a clearer scan of page 1.',
        ])->assertStatus(200);

        $this->actingAs($admin)->postJson("/api/admin/branch-permits/{$branches[1]['permit_id']}/reject", [
            'review_note' => 'Submitted permit is already expired.',
        ])->assertStatus(200);

        $this->actingAs($admin)->postJson("/api/admin/branch-permits/{$branches[2]['permit_id']}/approve")
            ->assertStatus(200);

        $this->actingAs($admin)->postJson("/api/admin/branch-permits/{$branches[3]['permit_id']}/waive", [
            'review_note' => 'Local exemption verified.',
        ])->assertStatus(200);

        // Check admin notifications (submitted)
        $adminItems = $this->actingAs($admin)
            ->getJson('/api/notifications?workspace=admin&per_page=50')
            ->assertStatus(200)
            ->json('data.items');

        $submittedItem = collect($adminItems)->first(
            fn (array $item): bool => $item['type'] === 'branch_permit_submitted'
                && $item['related_entity_id'] === $branches[0]['permit_id']
        );
        $this->assertNotNull($submittedItem);
        $this->assertSame('branch_permits', $submittedItem['related_entity_type']);
        $this->assertSame($appId, $submittedItem['application_id']);
        $this->assertSame($branches[0]['application_branch_id'], $submittedItem['application_branch_id']);
        $this->assertArrayNotHasKey('restaurant_id', $submittedItem);
        $this->assertArrayNotHasKey('file_path', $submittedItem);
        $this->assertStringNotContainsString('branch-permits/', json_encode($submittedItem));

        // Check applicant notifications (info_requested, rejected, approved, waived)
        $customerItems = $this->actingAs($applicant)
            ->getJson('/api/notifications?workspace=customer&per_page=50')
            ->assertStatus(200)
            ->json('data.items');

        $expectedCustomerTypes = [
            0 => 'branch_permit_info_requested',
            1 => 'branch_permit_rejected',
            2 => 'branch_permit_approved',
            3 => 'branch_permit_waived',
        ];
        foreach ($expectedCustomerTypes as $idx => $expectedType) {
            $item = collect($customerItems)->first(
                fn (array $n): bool => $n['type'] === $expectedType
                    && $n['related_entity_id'] === $branches[$idx]['permit_id']
            );
            $this->assertNotNull($item, "Missing customer notification for {$expectedType}");
            $this->assertSame('branch_permits', $item['related_entity_type']);
            $this->assertSame($appId, $item['application_id']);
            $this->assertSame($branches[$idx]['application_branch_id'], $item['application_branch_id']);
            $this->assertArrayNotHasKey('restaurant_id', $item);
            $this->assertArrayNotHasKey('file_path', $item);
            $this->assertStringNotContainsString('branch-permits/', json_encode($item));
        }

        // Approve application -> materializes branches, then reopen Branch Approve -> notifies owner (restaurant workspace) with restaurant_id + application_id + application_branch_id
        DB::table('application_documents')
            ->where('restaurant_application_id', $appId)
            ->update(['document_status' => 'verified', 'reviewed_by' => $admin->user_id, 'reviewed_at' => now()]);
        DB::table('restaurant_applications')
            ->where('restaurant_application_id', $appId)
            ->update(['application_status' => 'under_review', 'reviewed_by' => $admin->user_id, 'reviewed_at' => now()]);

        $this->actingAs($admin)->postJson("/api/admin/applications/restaurant/{$appId}/decision", [
            'decision' => 'approve',
        ])->assertStatus(200);

        $materializedApproveBranchId = (int) DB::table('restaurant_application_branches')
            ->where('application_branch_id', $branches[2]['application_branch_id'])
            ->value('created_branch_restaurant_id');
        $this->assertGreaterThan(0, $materializedApproveBranchId);

        $this->actingAs($admin)->postJson("/api/admin/branch-permits/{$branches[2]['permit_id']}/reopen", [
            'review_note' => 'Reopening permit for updated verification.',
        ])->assertStatus(200);

        $ownerItems = $this->actingAs($applicant)
            ->getJson('/api/notifications?workspace=restaurant&per_page=50')
            ->assertStatus(200)
            ->json('data.items');

        $reopenedItem = collect($ownerItems)->first(
            fn (array $n): bool => $n['type'] === 'branch_permit_reopened'
                && $n['related_entity_id'] === $branches[2]['permit_id']
        );
        $this->assertNotNull($reopenedItem);
        $this->assertSame('branch_permits', $reopenedItem['related_entity_type']);
        $this->assertSame($materializedApproveBranchId, $reopenedItem['restaurant_id']);
        $this->assertSame($appId, $reopenedItem['application_id']);
        $this->assertSame($branches[2]['application_branch_id'], $reopenedItem['application_branch_id']);
        $this->assertArrayNotHasKey('file_path', $reopenedItem);
        $this->assertStringNotContainsString('branch-permits/', json_encode($reopenedItem));

        // markRead returns the exact same enriched context
        $readItem = $this->actingAs($applicant)
            ->postJson("/api/notifications/{$reopenedItem['notification_id']}/read")
            ->assertStatus(200)
            ->json('data');
        $this->assertSame($materializedApproveBranchId, $readItem['restaurant_id']);
        $this->assertSame($appId, $readItem['application_id']);
        $this->assertSame($branches[2]['application_branch_id'], $readItem['application_branch_id']);

        // Owner-added branch (Add Branch, no application_branch_id) -> restaurant_id present, application_id/application_branch_id null
        $addBranchRes = $this->actingAs($applicant)->post('/api/restaurant/branches', [
            'branch_name' => 'Added Later Branch',
            'street' => '456 Ayala Ave',
            'barangay' => 'San Lorenzo',
            'city' => 'Makati',
            'province' => 'Metro Manila',
            'region' => 'NCR',
            'postal_code' => '1223',
            'contact_phone' => '09179998888',
            'offers_delivery' => true,
            'offers_pickup' => true,
            'offers_dine_in' => false,
            'mayors_permit' => $this->fakePdf('added.pdf', 'ADDED'),
        ], ['Accept' => 'application/json'])->assertStatus(201);

        $addedBranchId = (int) $addBranchRes->json('data.branch.restaurant_id');
        $addedPermitId = (int) DB::table('branch_permits')->where('restaurant_id', $addedBranchId)->value('permit_id');

        $adminItemsAfterAdd = $this->actingAs($admin)
            ->getJson('/api/notifications?workspace=admin&per_page=50')
            ->assertStatus(200)
            ->json('data.items');

        $addedSubmitted = collect($adminItemsAfterAdd)->first(
            fn (array $n): bool => $n['type'] === 'branch_permit_submitted'
                && $n['related_entity_id'] === $addedPermitId
        );
        $this->assertNotNull($addedSubmitted);
        $this->assertSame($addedBranchId, $addedSubmitted['restaurant_id']);
        $this->assertNull($addedSubmitted['application_id']);
        $this->assertNull($addedSubmitted['application_branch_id']);
    }

    public function test_duplicate_active_application_submission_returns_409_without_creating_rows(): void
    {
        Storage::fake('local');
        Storage::fake('public');

        $applicant = $this->createUser('customer', 'bp_dup_app');
        $admin = $this->createUser('admin', 'bp_dup_adm');
        $this->verifyApplicationOtp($applicant);

        $firstRes = $this->actingAs($applicant)->post('/api/restaurant/applications', $this->baseApplicationPayload($applicant, [
            'has_branches' => true,
            'main_branch_name' => 'Main One',
            'branches' => [
                $this->branchData('Branch One'),
            ],
        ]), ['Accept' => 'application/json'])->assertStatus(201);

        $firstAppId = (int) $firstRes->json('data.application.restaurant_application_id');

        $appCountBefore = DB::table('restaurant_applications')->count();
        $restCountBefore = DB::table('restaurants')->count();
        $branchCountBefore = DB::table('restaurant_application_branches')->count();
        $permitCountBefore = DB::table('branch_permits')->count();

        // Retry without re-verifying OTP -> stable 409 with error code and existing application id
        $dupRes1 = $this->actingAs($applicant)->post('/api/restaurant/applications', $this->baseApplicationPayload($applicant, [
            'has_branches' => true,
            'main_branch_name' => 'Main Two',
            'branches' => [
                $this->branchData('Branch Two'),
            ],
        ]), ['Accept' => 'application/json'])->assertStatus(409);

        $dupRes1->assertJsonPath('success', false)
            ->assertJsonPath('code', 'ACTIVE_APPLICATION_EXISTS')
            ->assertJsonPath('data.restaurant_application_id', $firstAppId)
            ->assertJsonPath('data.application_id', $firstAppId)
            ->assertJsonPath('data.application_status', 'submitted');

        // Even with a fresh verified OTP -> still 409 and no new rows
        $this->verifyApplicationOtp($applicant);
        $this->actingAs($applicant)->post('/api/restaurant/applications', $this->baseApplicationPayload($applicant, [
            'has_branches' => true,
            'main_branch_name' => 'Main Three',
            'branches' => [
                $this->branchData('Branch Three'),
            ],
        ]), ['Accept' => 'application/json'])->assertStatus(409)
            ->assertJsonPath('code', 'ACTIVE_APPLICATION_EXISTS')
            ->assertJsonPath('data.restaurant_application_id', $firstAppId);

        $this->assertSame($appCountBefore, DB::table('restaurant_applications')->count());
        $this->assertSame($restCountBefore, DB::table('restaurants')->count());
        $this->assertSame($branchCountBefore, DB::table('restaurant_application_branches')->count());
        $this->assertSame($permitCountBefore, DB::table('branch_permits')->count());

        // Once the active application reaches a terminal status (rejected), a new submission succeeds
        DB::table('restaurant_applications')
            ->where('restaurant_application_id', $firstAppId)
            ->update([
                'application_status' => 'rejected',
                'reviewer_note' => 'Rejected for reapplication test.',
                'reviewed_by' => $admin->user_id,
                'reviewed_at' => now(),
                'decided_at' => now(),
            ]);

        $this->actingAs($applicant)->post('/api/restaurant/applications', $this->baseApplicationPayload($applicant, [
            'has_branches' => false,
            'main_branch_name' => 'Main Reapply',
        ]), ['Accept' => 'application/json'])->assertStatus(201);
    }
}
