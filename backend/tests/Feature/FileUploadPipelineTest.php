<?php

namespace Tests\Feature;

use App\Features\Auth\Mail\EmailOtpMail;
use App\Models\User;
use App\Support\FileStorageService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class FileUploadPipelineTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('local');
        Storage::fake('public');
    }

    private function createVerifiedUser(string $email, string $purpose): User
    {
        Mail::fake();

        $user = User::forceCreate([
            'username' => 'u_'.random_int(10000, 99999),
            'first_name' => 'Test',
            'last_name' => 'User',
            'email' => $email,
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $this->actingAs($user)->postJson('/api/otp/send', [
            'email' => $email,
            'purpose' => $purpose,
        ])->assertOk();

        $otp = null;
        Mail::assertSent(EmailOtpMail::class, function (EmailOtpMail $mail) use (&$otp) {
            $otp = $mail->otpCode;

            return true;
        });

        $this->actingAs($user)->postJson('/api/otp/verify', [
            'email' => $email,
            'purpose' => $purpose,
            'code' => $otp,
        ])->assertOk();

        return $user;
    }

    private function baseRestaurantPayload(string $email): array
    {
        return [
            'restaurant_name' => 'Upload Test Kitchen',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_phone' => '09171112222',
            'business_email' => $email,
            'applicant_position' => 'business_owner',
            'legal_first_name' => 'Test',
            'legal_last_name' => 'User',
            'date_of_birth' => '1992-05-10',
            'contact_phone' => '09171112222',
            'contact_email' => $email,
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '123 Test St',
            'offers_delivery' => true,
            'offers_pickup' => true,
            'offers_dine_in' => true,
            'payout_provider' => 'BPI',
            'payout_account_type' => 'savings',
            'payout_account_holder_name' => 'Test User',
            'payout_account_number' => '1234567890',
            'terms_accepted' => true,
        ];
    }

    public function test_restaurant_uploads_store_relative_paths_return_resolved_urls_and_hide_pending_menu(): void
    {
        $owner = $this->createVerifiedUser('upload_owner@example.com', 'restaurant_application');

        $payload = array_merge($this->baseRestaurantPayload('upload_owner@example.com'), [
            'logo_image' => UploadedFile::fake()->image('logo.png', 200, 200),
            'cover_image' => UploadedFile::fake()->image('cover.jpg', 800, 400),
            'menu_items' => [
                [
                    'name' => 'Chicken Inasal',
                    'description' => 'Grilled chicken',
                    'category' => 'Main Dishes',
                    'price' => '199.00',
                    'available' => true,
                ],
            ],
            'menu_item_photos' => [
                0 => UploadedFile::fake()->image('inasal.jpg', 300, 300),
            ],
            'documents' => [
                'dti_certificate' => UploadedFile::fake()->createWithContent('dti.pdf', "%PDF-1.4\n%test\n"),
            ],
        ]);

        $res = $this->actingAs($owner)->post('/api/restaurant/applications', $payload, ['Accept' => 'application/json']);
        $res->assertStatus(201);

        $app = $res->json('data.application');
        $restaurantId = $app['restaurant_id'];

        $dbRestaurant = DB::table('restaurants')->where('restaurant_id', $restaurantId)->first();
        $this->assertNotNull($dbRestaurant->logo_image);
        $this->assertNotNull($dbRestaurant->cover_image);
        $this->assertStringStartsWith("restaurants/{$restaurantId}/", $dbRestaurant->logo_image);
        $this->assertStringNotContainsString('/storage/', $dbRestaurant->logo_image);
        $this->assertStringStartsWith("restaurants/{$restaurantId}/", $dbRestaurant->cover_image);

        Storage::disk('public')->assertExists($dbRestaurant->logo_image);
        Storage::disk('public')->assertExists($dbRestaurant->cover_image);

        $dbMenuItem = DB::table('menu_items')->where('restaurant_id', $restaurantId)->first();
        $this->assertNotNull($dbMenuItem);
        $this->assertSame('pending', $dbMenuItem->approval_status);
        $this->assertStringStartsWith("restaurants/{$restaurantId}/menu/", $dbMenuItem->photo_image);
        Storage::disk('public')->assertExists($dbMenuItem->photo_image);

        // API returns full resolved URLs built from APP_URL
        $appUrl = rtrim((string) config('app.url'), '/');
        $this->assertStringStartsWith("{$appUrl}/storage/restaurants/{$restaurantId}/", $app['logo_image']);
        $this->assertStringStartsWith("{$appUrl}/storage/restaurants/{$restaurantId}/", $app['cover_image']);
        $this->assertCount(1, $app['menu_items']);
        $this->assertStringStartsWith("{$appUrl}/storage/restaurants/{$restaurantId}/menu/", $app['menu_items'][0]['photo_url']);

        // Private document stored on local disk (not public)
        $docRow = DB::table('application_documents')->where('document_id', $app['documents'][0]['document_id'])->first();
        Storage::disk('local')->assertExists($docRow->file_path);
        Storage::disk('public')->assertMissing($docRow->file_path);

        // Pending restaurant & its menu items are NOT publicly visible
        $this->getJson('/api/restaurants?search='.urlencode('Upload Test Kitchen'))
            ->assertOk()
            ->assertJsonCount(0, 'data.restaurants');
        $this->getJson("/api/restaurants/{$restaurantId}")->assertStatus(404);
        $this->getJson("/api/restaurants/{$restaurantId}/menu")->assertStatus(404);
    }

    public function test_orphan_files_are_deleted_when_transaction_rolls_back_mid_flight(): void
    {
        $owner = $this->createVerifiedUser('orphan_owner@example.com', 'restaurant_application');

        $payload = array_merge($this->baseRestaurantPayload('orphan_owner@example.com'), [
            'logo_image' => UploadedFile::fake()->image('logo.png', 100, 100),
            'cover_image' => UploadedFile::fake()->image('cover.jpg', 200, 100),
            'menu_items' => [
                [
                    'name' => 'Test Dish',
                    'category' => 'Main Dishes',
                    'price' => '150.00',
                ],
            ],
            'menu_item_photos' => [
                0 => UploadedFile::fake()->image('dish.jpg', 100, 100),
            ],
            'documents' => [
                'dti_certificate' => UploadedFile::fake()->createWithContent('dti.pdf', "%PDF-1.4\n%valid\n"),
                // Fails content validation inside DB::transaction AFTER logo, cover, menu photo, and dti were stored
                'mayors_permit' => UploadedFile::fake()->createWithContent('permit.pdf', 'not-a-real-pdf-header'),
            ],
        ]);

        $this->actingAs($owner)
            ->post('/api/restaurant/applications', $payload, ['Accept' => 'application/json'])
            ->assertStatus(422);

        $this->assertSame([], Storage::disk('public')->allFiles());
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_rejects_more_than_eight_initial_menu_items(): void
    {
        $owner = $this->createVerifiedUser('cap_owner@example.com', 'restaurant_application');

        $menuItems = [];
        for ($i = 0; $i < 9; $i++) {
            $menuItems[] = [
                'name' => "Dish {$i}",
                'category' => 'Main Dishes',
                'price' => '100.00',
            ];
        }

        $payload = array_merge($this->baseRestaurantPayload('cap_owner@example.com'), [
            'menu_items' => $menuItems,
            'documents' => [
                'dti_certificate' => UploadedFile::fake()->createWithContent('dti.pdf', "%PDF-1.4\n%valid\n"),
            ],
        ]);

        $this->actingAs($owner)
            ->post('/api/restaurant/applications', $payload, ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['menu_items']);
    }

    public function test_rejects_oversized_wrong_type_fake_image_double_extension_and_missing_file(): void
    {
        $owner = $this->createVerifiedUser('invalid_uploads@example.com', 'restaurant_application');
        $base = $this->baseRestaurantPayload('invalid_uploads@example.com');

        // 1. Missing required documents
        $this->actingAs($owner)
            ->post('/api/restaurant/applications', $base, ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['documents']);

        // 2. Oversized file (> 5120 KB)
        $oversized = UploadedFile::fake()->createWithContent('big.pdf', "%PDF-1.4\n".str_repeat('A', 5200 * 1024));
        $this->actingAs($owner)
            ->post('/api/restaurant/applications', array_merge($base, [
                'documents' => ['dti_certificate' => $oversized],
            ]), ['Accept' => 'application/json'])
            ->assertStatus(422);

        // 3. Wrong file type (.txt)
        $wrongType = UploadedFile::fake()->createWithContent('notes.txt', 'hello world');
        $this->actingAs($owner)
            ->post('/api/restaurant/applications', array_merge($base, [
                'documents' => ['dti_certificate' => $wrongType],
            ]), ['Accept' => 'application/json'])
            ->assertStatus(422);

        // 4. Fake image (PHP script renamed to .jpg)
        $fakeImage = UploadedFile::fake()->createWithContent('avatar.jpg', '<?php system($_GET["cmd"]); ?>');
        $this->actingAs($owner)
            ->post('/api/restaurant/applications', array_merge($base, [
                'logo_image' => $fakeImage,
                'documents' => ['dti_certificate' => UploadedFile::fake()->createWithContent('dti.pdf', "%PDF-1.4\n%ok\n")],
            ]), ['Accept' => 'application/json'])
            ->assertStatus(422);

        // 5. Double extension (shell.php.jpg)
        $doubleExt = UploadedFile::fake()->image('shell.php.jpg', 50, 50);
        $this->actingAs($owner)
            ->post('/api/restaurant/applications', array_merge($base, [
                'logo_image' => $doubleExt,
                'documents' => ['dti_certificate' => UploadedFile::fake()->createWithContent('dti.pdf', "%PDF-1.4\n%ok\n")],
            ]), ['Accept' => 'application/json'])
            ->assertStatus(422);
    }

    public function test_unauthenticated_cannot_upload_or_view_private_files(): void
    {
        $this->postJson('/api/restaurant/applications/1/documents', [])->assertStatus(401);
        $this->getJson('/api/applications/documents/1/file')->assertStatus(401);
    }

    public function test_unauthenticated_and_unauthorized_private_file_and_reupload_access(): void
    {
        $owner = $this->createVerifiedUser('priv_owner@example.com', 'restaurant_application');
        $otherUser = User::forceCreate([
            'username' => 'other_'.random_int(10000, 99999),
            'first_name' => 'Other',
            'last_name' => 'User',
            'email' => 'other_priv@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $res = $this->actingAs($owner)->post('/api/restaurant/applications', array_merge(
            $this->baseRestaurantPayload('priv_owner@example.com'),
            [
                'documents' => [
                    'dti_certificate' => UploadedFile::fake()->createWithContent('dti.pdf', "%PDF-1.4\n%private\n"),
                ],
            ]
        ), ['Accept' => 'application/json']);

        $res->assertStatus(201);
        $appId = $res->json('data.application.restaurant_application_id');
        $docId = $res->json('data.application.documents.0.document_id');

        // Another user cannot view private file or upload to another user's application
        $this->actingAs($otherUser)->get("/api/applications/documents/{$docId}/file")->assertStatus(403);
        $this->actingAs($otherUser)->post("/api/restaurant/applications/{$appId}/documents", [
            'document_code' => 'mayors_permit',
            'file' => UploadedFile::fake()->createWithContent('permit.pdf', "%PDF-1.4\n%other\n"),
        ], ['Accept' => 'application/json'])->assertStatus(403);

        // Owner CAN view private file and re-upload document
        $this->actingAs($owner)->get("/api/applications/documents/{$docId}/file")->assertOk();
        $this->actingAs($owner)->post("/api/restaurant/applications/{$appId}/documents", [
            'document_code' => 'mayors_permit',
            'file' => UploadedFile::fake()->createWithContent('permit.pdf', "%PDF-1.4\n%owner\n"),
        ], ['Accept' => 'application/json'])->assertOk();
    }

    public function test_safe_file_replacement_never_deletes_still_referenced_files(): void
    {
        /** @var FileStorageService $service */
        $service = app(FileStorageService::class);

        $first = $service->storePublicImage(
            UploadedFile::fake()->image('first.png', 100, 100),
            'restaurants/999',
            'logo_image'
        );
        Storage::disk('public')->assertExists($first['path']);

        // Replace when old file is STILL referenced -> old file must NOT be deleted
        $second = $service->replacePublicImage(
            newFile: UploadedFile::fake()->image('second.png', 100, 100),
            directory: 'restaurants/999',
            oldPath: $first['path'],
            isOldPathReferenced: static fn (string $path): bool => true,
            fieldName: 'logo_image',
        );
        Storage::disk('public')->assertExists($first['path']);
        Storage::disk('public')->assertExists($second['path']);

        // Replace when old file is NO LONGER referenced -> old file MUST be deleted
        $third = $service->replacePublicImage(
            newFile: UploadedFile::fake()->image('third.png', 100, 100),
            directory: 'restaurants/999',
            oldPath: $second['path'],
            isOldPathReferenced: static fn (string $path): bool => false,
            fieldName: 'logo_image',
        );
        Storage::disk('public')->assertMissing($second['path']);
        Storage::disk('public')->assertExists($third['path']);
    }
}
