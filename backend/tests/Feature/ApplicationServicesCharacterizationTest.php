<?php

namespace Tests\Feature;

use App\Features\Auth\Services\OtpService;
use App\Features\Restaurants\Services\RestaurantApplicationService;
use App\Features\Riders\Services\RiderApplicationService;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ApplicationServicesCharacterizationTest extends TestCase
{
    use DatabaseTransactions;

    private function makeUser(string $role = 'customer'): User
    {
        $suffix = random_int(10000, 99999);

        return User::forceCreate([
            'username' => $role . '_appchar_' . $suffix,
            'first_name' => ucfirst($role),
            'last_name' => 'AppChar',
            'email' => $role . '_appchar_' . $suffix . '@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function seedVerifiedOtp(User $user, string $email, string $purpose): void
    {
        Mail::fake();
        $otpService = app(OtpService::class);
        $req = Request::create('/api/otp/send', 'POST', [], [], [], ['REMOTE_ADDR' => '127.0.0.1']);
        $otpService->send($email, $purpose, $user, $req);

        $code = null;
        Mail::assertSent(\App\Features\Auth\Mail\EmailOtpMail::class, function ($mail) use (&$code): bool {
            $code = $mail->otpCode;

            return true;
        });

        $otpService->verify($email, $purpose, (string) $code, $user, $req);
    }

    public function test_restaurant_application_service_validation_submit_and_resubmission(): void
    {
        Cache::flush();
        Storage::fake('public');
        Storage::fake('local');

        $admin = $this->makeUser('admin');
        $applicant = $this->makeUser('customer');
        $otherUser = $this->makeUser('customer');
        $service = app(RestaurantApplicationService::class);
        $req = Request::create('/api/partner/applications', 'POST', [], [], [], ['REMOTE_ADDR' => '127.0.0.1']);

        // 1. All 3 service options false -> ValidationException on offers_delivery
        try {
            $service->submit($applicant, [
                'offers_delivery' => false,
                'offers_pickup' => false,
                'offers_dine_in' => false,
                'contact_email' => $applicant->email,
            ], [], null, null, [], $req);
            $this->fail('Expected ValidationException when no service option is enabled.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('offers_delivery', $e->errors());
        }

        // 2. Unsupported document code -> ValidationException on documents.bad_code
        $this->seedVerifiedOtp($applicant, $applicant->email, 'restaurant_application');
        try {
            $service->submit($applicant, [
                'offers_delivery' => true,
                'offers_pickup' => false,
                'offers_dine_in' => false,
                'contact_email' => $applicant->email,
            ], ['bad_code' => UploadedFile::fake()->create('doc.pdf', 10, 'application/pdf')], null, null, [], $req);
            $this->fail('Expected ValidationException for unsupported document code.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('documents.bad_code', $e->errors());
        }

        // 3. Full valid submit with categories, hours, menu items, logo, document
        $logo = UploadedFile::fake()->image('logo.png', 100, 100);
        $menuPhoto = UploadedFile::fake()->image('dish.jpg', 100, 100);
        $dtiDoc = UploadedFile::fake()->image('dti.png', 100, 100);

        $created = $service->submit(
            user: $applicant,
            validated: [
                'restaurant_name' => 'Char Grill',
                'business_type' => 'restaurant',
                'ownership_structure' => 'sole_proprietorship',
                'business_phone' => '09171234567',
                'business_email' => 'grill_' . random_int(100, 999) . '@example.com',
                'province' => 'Misamis Oriental',
                'city' => 'Cagayan de Oro City',
                'barangay' => 'Carmen',
                'street' => 'Rizal St',
                'offers_delivery' => true,
                'offers_pickup' => true,
                'offers_dine_in' => false,
                'accepts_reservations' => false,
                'categories' => ['Filipino', 'Grill'],
                'operating_hours' => [
                    ['day_of_week' => 1, 'opening_time' => '09:00:00', 'closing_time' => '21:00:00', 'is_closed' => false],
                ],
                'menu_items' => [
                    ['name' => 'Inasal', 'category' => 'Mains', 'price' => 150, 'available' => false],
                ],
                'applicant_position' => 'business_owner',
                'legal_first_name' => 'Juan',
                'legal_last_name' => 'Dela Cruz',
                'date_of_birth' => '1990-01-01',
                'contact_phone' => '09171234567',
                'contact_email' => $applicant->email,
                'payout_provider' => 'GCash',
                'payout_account_type' => 'e_wallet',
                'payout_account_holder_name' => 'Juan Dela Cruz',
                'payout_account_number' => '09171234567',
            ],
            documentFiles: ['dti_certificate' => $dtiDoc],
            logoFile: $logo,
            coverFile: null,
            menuItemPhotos: [0 => $menuPhoto],
            request: $req,
        );

        $appId = (int) $created['restaurant_application_id'];
        $this->assertSame('submitted', $created['application_status']);
        $this->assertSame(['Filipino', 'Grill'], $created['categories']);
        $this->assertCount(1, $created['menu_items']);
        $this->assertSame('temporarily_unavailable', $created['menu_items'][0]['availability_status']);
        $this->assertCount(1, $created['documents']);
        $this->assertNotNull($created['logo_image']);

        // OTP verified flag is forgotten after submit
        try {
            $this->otpAssertAfterSubmit($applicant->email, 'restaurant_application', (int) $applicant->user_id);
            $this->fail('Expected ValidationException after OTP verified flag cleared.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('contact_email', $e->errors());
        }

        // 4. Unauthorized uploadDocument -> 403
        try {
            $service->uploadDocument(
                $otherUser,
                $appId,
                'requested_document',
                UploadedFile::fake()->image('extra.png', 100, 100),
                null,
                $req,
            );
            $this->fail('Expected 403 for non-owner document upload.');
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
        }

        // 5. Resubmission from additional_documents_required fulfills request_id and notifies admin
        DB::table('restaurant_applications')
            ->where('restaurant_application_id', $appId)
            ->update(['application_status' => 'additional_documents_required']);

        $requestId = (int) DB::table('application_document_requests')->insertGetId([
            'restaurant_application_id' => $appId,
            'document_name' => 'Updated Permit',
            'reason' => 'Blurry',
            'request_status' => 'open',
            'requested_by' => $admin->user_id,
            'created_at' => now(),
        ]);

        $resubmitted = $service->uploadDocument(
            $applicant,
            $appId,
            'requested_document',
            UploadedFile::fake()->image('permit_clear.png', 100, 100),
            $requestId,
            $req,
        );

        $this->assertSame('resubmitted', $resubmitted['application_status']);
        $this->assertDatabaseHas('application_document_requests', [
            'request_id' => $requestId,
            'request_status' => 'submitted',
        ]);
    }

    private function otpAssertAfterSubmit(string $email, string $purpose, int $userId): void
    {
        app(OtpService::class)->assertVerified($email, $purpose, $userId);
    }

    public function test_rider_application_service_validation_submit_and_resubmission(): void
    {
        Cache::flush();
        Storage::fake('local');

        $admin = $this->makeUser('admin');
        $applicant = $this->makeUser('customer');
        $otherUser = $this->makeUser('customer');
        $service = app(RiderApplicationService::class);
        $req = Request::create('/api/rider/applications', 'POST', [], [], [], ['REMOTE_ADDR' => '127.0.0.1']);

        $this->seedVerifiedOtp($applicant, $applicant->email, 'rider_application');

        // 1. Non-personally owned vehicle missing owner details -> ValidationException
        try {
            $service->submit($applicant, [
                'contact_email' => $applicant->email,
                'vehicle_type' => 'motorcycle',
                'vehicle_ownership' => 'borrowed',
            ], [], $req);
            $this->fail('Expected ValidationException when vehicle owner details are missing.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('vehicle_owner_name', $e->errors());
        }

        // 2. Walking courier clears vehicle fields and submits cleanly
        $govDoc = UploadedFile::fake()->image('gov.png', 100, 100);
        $selfieDoc = UploadedFile::fake()->image('selfie.png', 100, 100);
        $created = $service->submit($applicant, [
            'province' => 'Misamis Oriental',
            'city' => 'Cagayan de Oro City',
            'barangay' => 'Carmen',
            'street' => 'Main St',
            'base_city' => 'Cagayan de Oro City',
            'vehicle_type' => 'walking',
            'vehicle_brand' => 'IgnoredBrand',
            'plate_number' => 'ABC123',
            'emergency_contact_name' => 'Maria',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09171234567',
            'preferred_shifts' => ['lunch', 'dinner'],
            'available_days' => ['mon', 'tue'],
            'legal_first_name' => 'Pedro',
            'legal_last_name' => 'Penduko',
            'date_of_birth' => '1995-05-05',
            'contact_phone' => '09171234567',
            'contact_email' => $applicant->email,
            'gov_id_type' => 'philid',
            'gov_id_number' => '1234-5678-9012',
            'gov_id_is_permanent' => true,
            'payout_provider' => 'GCash',
            'payout_account_type' => 'e_wallet',
            'payout_account_holder_name' => 'Pedro Penduko',
            'payout_account_number' => '09171234567',
        ], ['government_id_front' => $govDoc, 'selfie' => $selfieDoc], $req);

        $appId = (int) $created['rider_application_id'];
        $this->assertSame('submitted', $created['application_status']);
        $this->assertSame('walking', $created['vehicle_type']);
        $this->assertNull($created['vehicle_brand']);
        $this->assertNull($created['plate_number']);
        $this->assertSame(['lunch', 'dinner'], $created['preferred_shifts']);
        $this->assertCount(2, $created['documents']);

        // 3. Duplicate active application rejected with 409 ACTIVE_APPLICATION_EXISTS
        try {
            $service->submit($applicant, [
                'contact_email' => $applicant->email,
                'vehicle_type' => 'walking',
            ], [], $req);
            $this->fail('Expected HttpResponseException for duplicate active rider application.');
        } catch (\Illuminate\Http\Exceptions\HttpResponseException $e) {
            $this->assertSame(409, $e->getResponse()->getStatusCode());
        }

        // 4. Other user uploadDocument -> 404
        try {
            $service->uploadDocument(
                $otherUser,
                $appId,
                'requested_document',
                UploadedFile::fake()->create('extra.pdf', 10, 'application/pdf'),
                null,
                $req,
            );
            $this->fail('Expected 404 for unrelated user.');
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->assertSame(404, $e->getStatusCode());
        }

        // 5. Resubmission from needs_correction
        DB::table('rider_applications')
            ->where('rider_application_id', $appId)
            ->update([
                'application_status' => 'needs_correction',
                'reviewer_note' => 'Please upload clearer NBI',
            ]);

        $requestId = (int) DB::table('application_document_requests')->insertGetId([
            'rider_application_id' => $appId,
            'document_name' => 'NBI Clearance',
            'reason' => 'Expired',
            'request_status' => 'open',
            'requested_by' => $admin->user_id,
            'created_at' => now(),
        ]);

        $resubmitted = $service->uploadDocument(
            $applicant,
            $appId,
            'requested_document',
            UploadedFile::fake()->image('nbi.png', 100, 100),
            $requestId,
            $req,
        );

        $this->assertSame('resubmitted', $resubmitted['application_status']);
        $this->assertDatabaseHas('application_document_requests', [
            'request_id' => $requestId,
            'request_status' => 'submitted',
        ]);
    }
}
