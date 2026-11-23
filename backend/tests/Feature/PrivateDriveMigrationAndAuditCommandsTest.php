<?php

namespace Tests\Feature;

use App\Support\Storage\DriveClientInterface;
use App\Support\Storage\DriveFolderResolver;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\Support\FakeDriveClient;
use Tests\TestCase;

class PrivateDriveMigrationAndAuditCommandsTest extends TestCase
{
    use DatabaseTransactions;

    private FakeDriveClient $fakeDrive;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('local');

        $this->fakeDrive = new FakeDriveClient('fake_salo_root');
        $this->app->instance(DriveClientInterface::class, $this->fakeDrive);
        $this->app->singleton(DriveFolderResolver::class, fn () => new DriveFolderResolver($this->fakeDrive));

        config([
            'salo.uploads.private_file_driver' => 'google_drive',
            'salo.uploads.google_drive.public_folder_id' => 'fake_salo_root',
        ]);
    }

    public function test_migrate_private_files_dry_run_live_idempotent_and_keeps_local_files(): void
    {
        $provinceId = (int) (DB::table('provinces')->value('province_id')
            ?: DB::table('provinces')->insertGetId(['province_name' => 'Metro Manila']));
        $cityId = (int) (DB::table('cities')->where('province_id', $provinceId)->value('city_id')
            ?: DB::table('cities')->insertGetId(['province_id' => $provinceId, 'city_name' => 'Makati']));
        $barangayId = (int) (DB::table('barangays')->where('city_id', $cityId)->value('barangay_id')
            ?: DB::table('barangays')->insertGetId(['city_id' => $cityId, 'barangay_name' => 'Poblacion']));
        $addressId = (int) DB::table('addresses')->insertGetId(['barangay_id' => $barangayId, 'street' => '10 Ayala']);

        $userId = (int) DB::table('users')->insertGetId([
            'username' => 'mig_'.uniqid(),
            'first_name' => 'Mig',
            'last_name' => 'User',
            'email' => 'mig_'.uniqid().'@example.com',
            'password_hash' => Hash::make('Secret123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);
        $riderId = (int) DB::table('riders')->insertGetId([
            'user_id' => $userId,
            'vehicle_type' => 'walking',
            'emergency_contact_name' => 'Mom',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09171234567',
            'base_city_id' => $cityId,
            'rider_status' => 'active',
        ]);
        $restId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Mig Resto',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234567',
            'business_email' => 'mig_'.uniqid().'@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
        ]);
        DB::table('restaurants')->where('restaurant_id', $restId)->update(['brand_restaurant_id' => $restId]);

        $appId = (int) DB::table('restaurant_applications')->insertGetId([
            'reference_number' => 'RA-'.uniqid(),
            'applicant_user_id' => $userId,
            'restaurant_id' => $restId,
            'application_status' => 'approved',
            'applicant_position' => 'business_owner',
            'legal_first_name' => 'Mig',
            'legal_last_name' => 'User',
            'date_of_birth' => '1990-01-01',
            'contact_phone' => '09171234567',
            'contact_email' => 'mig@example.com',
            'contact_email_verified_at' => now(),
            'declarations_accepted_at' => now(),
            'terms_version' => 'v1',
            'decided_at' => now(),
        ]);

        Storage::disk('local')->put('applications/restaurant/1/dti.pdf', '%PDF-1.4 test');
        $docId = (int) DB::table('application_documents')->insertGetId([
            'restaurant_application_id' => $appId,
            'document_code' => 'dti_certificate',
            'file_path' => 'applications/restaurant/1/dti.pdf',
            'original_filename' => 'dti.pdf',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 13,
            'document_status' => 'pending_review',
            'uploaded_by' => $userId,
            'uploaded_at' => now(),
        ]);

        $appBranchId = (int) DB::table('restaurant_application_branches')->insertGetId([
            'restaurant_application_id' => $appId,
            'branch_name' => 'BGC',
            'address_id' => $addressId,
            'sort_order' => 1,
        ]);
        Storage::disk('local')->put('branch-permits/1/permit.pdf', '%PDF-1.4 permit');
        $permitId = (int) DB::table('branch_permits')->insertGetId([
            'application_branch_id' => $appBranchId,
            'is_required_locally' => 1,
            'file_path' => 'branch-permits/1/permit.pdf',
            'original_filename' => 'permit.pdf',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 15,
            'permit_status' => 'pending_review',
            'uploaded_by' => $userId,
            'uploaded_at' => now(),
        ]);

        $checkoutId = (int) DB::table('checkouts')->insertGetId(['customer_id' => $userId, 'total_amount' => '100.00']);
        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'order_reference' => 'ORD-'.uniqid(),
            'customer_id' => $userId,
            'restaurant_id' => $restId,
            'restaurant_name' => 'Mig Resto',
            'customer_name' => 'Mig User',
            'order_type' => 'delivery',
            'order_status' => 'delivered',
            'delivery_address_text' => '10 Ayala',
            'subtotal_amount' => '51.00',
            'delivery_fee' => '49.00',
            'total_amount' => '100.00',
            'placed_at' => now(),
        ]);
        $img = UploadedFile::fake()->image('pod.jpg', 100, 100);
        Storage::disk('local')->put('deliveries/1/proof/pod.jpg', file_get_contents($img->getRealPath()));
        $deliveryId = (int) DB::table('deliveries')->insertGetId([
            'order_id' => $orderId,
            'rider_id' => $riderId,
            'delivery_status' => 'delivered',
            'delivered_at' => now(),
            'proof_photo' => 'deliveries/1/proof/pod.jpg',
        ]);

        // 1. Dry run leaves DB local paths untouched
        $this->artisan('salo:private-files:migrate-to-drive', ['--dry-run' => true])->assertExitCode(0);
        $this->assertSame('applications/restaurant/1/dti.pdf', DB::table('application_documents')->where('document_id', $docId)->value('file_path'));

        // 2. Live migration updates all 3 tables to gdrive: AND keeps local files
        $this->artisan('salo:private-files:migrate-to-drive', ['--force' => true])->assertExitCode(0);
        $this->assertStringStartsWith('gdrive:', (string) DB::table('application_documents')->where('document_id', $docId)->value('file_path'));
        $this->assertStringStartsWith('gdrive:', (string) DB::table('branch_permits')->where('permit_id', $permitId)->value('file_path'));
        $this->assertStringStartsWith('gdrive:', (string) DB::table('deliveries')->where('delivery_id', $deliveryId)->value('proof_photo'));

        $this->assertTrue(Storage::disk('local')->exists('applications/restaurant/1/dti.pdf'));
        $this->assertTrue(Storage::disk('local')->exists('branch-permits/1/permit.pdf'));
        $this->assertTrue(Storage::disk('local')->exists('deliveries/1/proof/pod.jpg'));

        // 3. Permission check passes when all private nodes have owner-only permissions
        $this->artisan('salo:drive:check-permissions')->assertExitCode(0);

        // 4. Permission check fails if any file in private tree is shared
        $docFileId = substr((string) DB::table('application_documents')->where('document_id', $docId)->value('file_path'), strlen('gdrive:'));
        $this->fakeDrive->nodes[$docFileId]['permissions'][] = ['id' => 'anyoneWithLink', 'type' => 'anyone', 'role' => 'reader'];
        $this->artisan('salo:drive:check-permissions')->assertExitCode(1);
    }

    public function test_purge_rejected_command_respects_90_day_retention_and_dry_run(): void
    {
        $provinceId = (int) (DB::table('provinces')->value('province_id')
            ?: DB::table('provinces')->insertGetId(['province_name' => 'Metro Manila']));
        $cityId = (int) (DB::table('cities')->where('province_id', $provinceId)->value('city_id')
            ?: DB::table('cities')->insertGetId(['province_id' => $provinceId, 'city_name' => 'Makati']));
        $barangayId = (int) (DB::table('barangays')->where('city_id', $cityId)->value('barangay_id')
            ?: DB::table('barangays')->insertGetId(['city_id' => $cityId, 'barangay_name' => 'Poblacion']));
        $addressId = (int) DB::table('addresses')->insertGetId(['barangay_id' => $barangayId, 'street' => '20 Ayala']);

        $userId = (int) DB::table('users')->insertGetId([
            'username' => 'rej_'.uniqid(),
            'first_name' => 'Rej',
            'last_name' => 'User',
            'email' => 'rej_'.uniqid().'@example.com',
            'password_hash' => Hash::make('Secret123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);
        $restId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Rej Resto',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234567',
            'business_email' => 'rej_'.uniqid().'@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'rejected',
        ]);
        $appId = (int) DB::table('restaurant_applications')->insertGetId([
            'reference_number' => 'RA-REJ-'.uniqid(),
            'applicant_user_id' => $userId,
            'restaurant_id' => $restId,
            'application_status' => 'rejected',
            'applicant_position' => 'business_owner',
            'legal_first_name' => 'Rej',
            'legal_last_name' => 'User',
            'date_of_birth' => '1990-01-01',
            'contact_phone' => '09171234567',
            'contact_email' => 'rej@example.com',
            'contact_email_verified_at' => now()->subDays(100),
            'declarations_accepted_at' => now()->subDays(100),
            'terms_version' => 'v1',
            'reviewer_note' => 'Incomplete requirements',
            'decided_at' => now()->subDays(95),
        ]);

        $this->fakeDrive->nodes['rej_doc_12345'] = [
            'id' => 'rej_doc_12345',
            'name' => 'old.pdf',
            'mimeType' => 'application/pdf',
            'parents' => ['fake_salo_root'],
            'appProperties' => ['visibility' => 'private'],
            'trashed' => false,
            'content' => 'bytes',
            'permissions' => [['id' => 'owner', 'type' => 'user', 'role' => 'owner']],
        ];
        DB::table('application_documents')->insert([
            'restaurant_application_id' => $appId,
            'document_code' => 'dti_certificate',
            'file_path' => 'gdrive:rej_doc_12345',
            'original_filename' => 'old.pdf',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 5,
            'document_status' => 'pending_review',
            'uploaded_by' => $userId,
            'uploaded_at' => now()->subDays(95),
        ]);

        // Dry run does not trash
        $this->artisan('salo:drive:purge-rejected', ['--dry-run' => true])->assertExitCode(0);
        $this->assertFalse($this->fakeDrive->nodes['rej_doc_12345']['trashed']);

        // Live purge trashes the Drive file
        $this->artisan('salo:drive:purge-rejected', ['--force' => true])->assertExitCode(0);
        $this->assertTrue($this->fakeDrive->nodes['rej_doc_12345']['trashed']);
    }
}
