<?php

namespace Tests\Feature;

use App\Features\Applications\Services\ProfileChangeRequestService;
use App\Features\Restaurants\Services\BranchPermitService;
use App\Features\Restaurants\Services\RestaurantApplicationService;
use App\Features\Riders\Services\RiderApplicationService;
use App\Models\User;
use App\Support\FileStorageService;
use App\Support\Storage\DriveClientInterface;
use App\Support\Storage\DriveFolderResolver;
use App\Support\Storage\ImageStorageUnavailableException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\Support\FakeDriveClient;
use Tests\TestCase;

class PrivateDriveDocumentsAndPermitsTest extends TestCase
{
    use DatabaseTransactions;

    private FakeDriveClient $fakeDrive;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('local');
        Storage::fake('public');

        $this->fakeDrive = new FakeDriveClient('fake_salo_root');
        $this->app->instance(DriveClientInterface::class, $this->fakeDrive);
        $this->app->singleton(DriveFolderResolver::class, fn () => new DriveFolderResolver($this->fakeDrive));
        $this->app->forgetInstance(FileStorageService::class);

        config([
            'salo.uploads.public_image_driver' => 'google_drive',
            'salo.uploads.private_file_driver' => 'google_drive',
            'salo.uploads.google_drive.public_folder_id' => 'fake_salo_root',
            'salo.uploads.google_drive.proxy_cache' => false,
        ]);
    }

    private function createUser(string $role = 'customer', string $first = 'Juan', string $last = 'Dela Cruz'): User
    {
        $id = (int) DB::table('users')->insertGetId([
            'username' => 'u_'.uniqid(),
            'first_name' => $first,
            'last_name' => $last,
            'email' => 'u_'.uniqid().'@example.com',
            'password_hash' => Hash::make('Secret123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);

        return User::query()->findOrFail($id);
    }

    private function createAddressId(): int
    {
        $provinceId = (int) (DB::table('provinces')->value('province_id')
            ?: DB::table('provinces')->insertGetId(['province_name' => 'Metro Manila']));
        $cityId = (int) (DB::table('cities')->where('province_id', $provinceId)->value('city_id')
            ?: DB::table('cities')->insertGetId(['province_id' => $provinceId, 'city_name' => 'Makati']));
        $barangayId = (int) (DB::table('barangays')->where('city_id', $cityId)->value('barangay_id')
            ?: DB::table('barangays')->insertGetId(['city_id' => $cityId, 'barangay_name' => 'Poblacion']));

        return (int) DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '789 Rizal Ave',
        ]);
    }

    public function test_application_documents_and_branch_permits_store_in_private_drive_and_enforce_authz_and_audit(): void
    {
        $applicant = $this->createUser('customer', 'Ana', 'Reyes');
        $otherUser = $this->createUser('customer', 'Pedro', 'Cruz');
        $admin = $this->createUser('admin', 'Admin', 'User');
        $addressId = $this->createAddressId();

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Ana Kitchen',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234567',
            'business_email' => 'ana_'.uniqid().'@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'pending',
        ]);
        DB::table('restaurants')->where('restaurant_id', $restaurantId)->update(['brand_restaurant_id' => $restaurantId]);

        $appId = (int) DB::table('restaurant_applications')->insertGetId([
            'reference_number' => 'RA-'.uniqid(),
            'applicant_user_id' => $applicant->user_id,
            'restaurant_id' => $restaurantId,
            'application_status' => 'pending_review',
            'applicant_position' => 'business_owner',
            'legal_first_name' => 'Ana',
            'legal_last_name' => 'Reyes',
            'date_of_birth' => '1990-01-01',
            'contact_phone' => '09171234567',
            'contact_email' => $applicant->email,
            'contact_email_verified_at' => now(),
            'declarations_accepted_at' => now(),
            'terms_version' => 'v1',
            'submitted_at' => now(),
        ]);

        // Upload restaurant application document via RestaurantApplicationService
        $docResp = app(RestaurantApplicationService::class)->uploadDocument(
            user: $applicant,
            applicationId: $appId,
            documentCode: 'dti_certificate',
            file: UploadedFile::fake()->createWithContent('dti.pdf', "%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"),
            requestId: null,
            request: Request::create('/api/restaurant/applications/'.$appId.'/documents', 'POST'),
        );
        $this->assertNotEmpty($docResp);

        $docRow = DB::table('application_documents')->where('restaurant_application_id', $appId)->first();
        $this->assertStringStartsWith('gdrive:', (string) $docRow->file_path);

        $docFileId = substr((string) $docRow->file_path, strlen('gdrive:'));
        $this->assertSame('private', $this->fakeDrive->nodes[$docFileId]['appProperties']['visibility']);
        $this->assertCount(1, $this->fakeDrive->listPermissions($docFileId));

        // Denied access for unrelated user -> 403 + logged
        $this->actingAs($otherUser)->get("/api/applications/documents/{$docRow->document_id}/file")->assertStatus(403);
        $this->assertSame(1, DB::table('audit_logs')
            ->where('actor_user_id', $otherUser->user_id)
            ->where('action', 'private_file_access_denied')
            ->where('entity_type', 'application_documents')
            ->where('entity_id', (string) $docRow->document_id)
            ->count());

        // Allowed access for applicant & admin -> 200 + logged (deduped)
        $this->actingAs($applicant)->get("/api/applications/documents/{$docRow->document_id}/file")->assertOk();
        $this->actingAs($applicant)->get("/api/applications/documents/{$docRow->document_id}/file")->assertOk();
        $this->assertSame(1, DB::table('audit_logs')
            ->where('actor_user_id', $applicant->user_id)
            ->where('action', 'private_file_viewed')
            ->where('entity_type', 'application_documents')
            ->where('entity_id', (string) $docRow->document_id)
            ->count());

        $this->actingAs($admin)->get("/api/applications/documents/{$docRow->document_id}/file")->assertOk();

        // Application branch permit upload & stream
        $appBranchId = (int) DB::table('restaurant_application_branches')->insertGetId([
            'restaurant_application_id' => $appId,
            'branch_name' => 'BGC Branch',
            'address_id' => $addressId,
            'sort_order' => 1,
        ]);
        $permitId = (int) DB::table('branch_permits')->insertGetId([
            'application_branch_id' => $appBranchId,
            'is_required_locally' => 1,
            'permit_status' => 'pending_submission',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        app(BranchPermitService::class)->submitOrUpdateForApplicationBranch(
            applicant: $applicant,
            applicationId: $appId,
            applicationBranchId: $appBranchId,
            file: UploadedFile::fake()->createWithContent('bgc-permit.pdf', "%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"),
            validated: ['is_required_locally' => true],
            request: Request::create('/api/test', 'POST'),
        );

        $permitRow = DB::table('branch_permits')->where('permit_id', $permitId)->first();
        $this->assertStringStartsWith('gdrive:', (string) $permitRow->file_path);

        $this->actingAs($otherUser)->get("/api/restaurant/applications/{$appId}/branches/{$appBranchId}/permit/file")->assertStatus(403);
        $this->actingAs($applicant)->get("/api/restaurant/applications/{$appId}/branches/{$appBranchId}/permit/file")->assertOk();
        $this->actingAs($admin)->get("/api/admin/branch-permits/{$permitId}/file")->assertOk();
    }

    private function createRiderApplication(User $user, int $addressId): int
    {
        $cityId = (int) DB::table('cities')->value('city_id');
        $riderId = (int) DB::table('riders')->insertGetId([
            'user_id' => $user->user_id,
            'vehicle_type' => 'walking',
            'emergency_contact_name' => 'Maria Cruz',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09171234567',
            'base_city_id' => $cityId,
            'rider_status' => 'pending',
        ]);

        return (int) DB::table('rider_applications')->insertGetId([
            'reference_number' => 'RDA-'.uniqid(),
            'applicant_user_id' => $user->user_id,
            'rider_id' => $riderId,
            'application_status' => 'pending_review',
            'legal_first_name' => $user->first_name,
            'legal_last_name' => $user->last_name,
            'date_of_birth' => '1992-05-05',
            'contact_phone' => '09171234567',
            'contact_email' => $user->email,
            'contact_email_verified_at' => now(),
            'residence_address_id' => $addressId,
            'gov_id_type' => 'drivers_license',
            'gov_id_number_encrypted' => 'enc_12345',
            'gov_id_is_permanent' => 1,
            'declarations_accepted_at' => now(),
            'terms_version' => 'v1',
            'submitted_at' => now(),
        ]);
    }

    public function test_rider_application_document_and_legacy_local_fallback_and_profile_change_stays_local(): void
    {
        $riderUser = $this->createUser('customer', 'Carlo', 'Mendoza');
        $otherUser = $this->createUser('customer', 'Other', 'User');
        $addressId = $this->createAddressId();

        $riderAppId = $this->createRiderApplication($riderUser, $addressId);

        app(RiderApplicationService::class)->uploadDocument(
            user: $riderUser,
            applicationId: $riderAppId,
            documentCode: 'driver_license',
            file: UploadedFile::fake()->image('license.jpg', 300, 200),
            requestId: null,
            request: Request::create('/api/test', 'POST'),
        );

        $docRow = DB::table('application_documents')->where('rider_application_id', $riderAppId)->first();
        $this->assertStringStartsWith('gdrive:', (string) $docRow->file_path);
        $this->actingAs($riderUser)->get("/api/applications/documents/{$docRow->document_id}/file")->assertOk();
        $this->actingAs($otherUser)->get("/api/applications/documents/{$docRow->document_id}/file")->assertStatus(403);

        // Legacy local file still streams seamlessly when PRIVATE_FILE_STORAGE=google_drive
        Storage::disk('local')->put('applications/rider/legacy/old.pdf', '%PDF-1.4 legacy');
        $legacyDocId = (int) DB::table('application_documents')->insertGetId([
            'rider_application_id' => $riderAppId,
            'document_code' => 'nbi_clearance',
            'file_path' => 'applications/rider/legacy/old.pdf',
            'original_filename' => 'old.pdf',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 15,
            'document_status' => 'pending_review',
            'uploaded_by' => $riderUser->user_id,
            'uploaded_at' => now(),
        ]);
        $this->actingAs($riderUser)->get("/api/applications/documents/{$legacyDocId}/file")->assertOk();

        // Profile change request supporting documents stay local even when PRIVATE_FILE_STORAGE=google_drive
        $addressId = $this->createAddressId();
        $restId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Local Doc Resto',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234567',
            'business_email' => 'localdoc_'.uniqid().'@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
        ]);
        DB::table('restaurants')->where('restaurant_id', $restId)->update(['brand_restaurant_id' => $restId]);
        DB::table('restaurant_owners')->insert(['restaurant_id' => $restId, 'user_id' => $riderUser->user_id, 'joined_at' => now()]);

        $pcr = app(ProfileChangeRequestService::class)->submitRestaurantRequest(
            user: $riderUser,
            validated: ['restaurant_name' => 'Renamed Resto'],
            documents: [UploadedFile::fake()->createWithContent('dti.pdf', "%PDF-1.4\n1 0 obj\n<<>>\nendobj\n")],
            restaurantId: $restId,
            request: Request::create('/api/test', 'POST'),
        );
        $rawDocs = json_decode((string) DB::table('profile_change_requests')->where('request_id', $pcr['request_id'])->value('document_paths'), true);
        $this->assertStringStartsWith('change-requests/', $rawDocs[0]['path']);
        $this->assertTrue(Storage::disk('local')->exists($rawDocs[0]['path']));
    }

    public function test_drive_failure_on_private_upload_leaves_no_orphan_db_rows(): void
    {
        $applicant = $this->createUser('customer', 'Fail', 'User');
        $riderAppId = $this->createRiderApplication($applicant, $this->createAddressId());

        $this->fakeDrive->failNextPutWith = ImageStorageUnavailableException::temporarilyUnavailable();

        try {
            app(RiderApplicationService::class)->uploadDocument(
                user: $applicant,
                applicationId: $riderAppId,
                documentCode: 'driver_license',
                file: UploadedFile::fake()->image('license.jpg', 200, 200),
                requestId: null,
                request: Request::create('/api/test', 'POST'),
            );
            $this->fail('Expected ImageStorageUnavailableException');
        } catch (ImageStorageUnavailableException $e) {
            $this->assertSame(503, $e->statusCode());
            $this->assertSame(0, DB::table('application_documents')->where('rider_application_id', $riderAppId)->count());
        }
    }
}
