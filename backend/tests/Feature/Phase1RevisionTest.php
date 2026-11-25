<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class Phase1RevisionTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'phase1'): User
    {
        $suffix = random_int(10000, 99999);
        $userId = DB::table('users')->insertGetId([
            'username' => "{$prefix}_{$suffix}",
            'first_name' => 'Phase',
            'last_name' => 'One',
            'email' => "{$prefix}_{$suffix}@example.com",
            'password_hash' => Hash::make('Password123!'),
            'user_role' => $role,
            'account_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return User::findOrFail($userId);
    }

    public function test_owner_can_create_menu_category_immediately(): void
    {
        $owner = $this->createUser('customer', 'owner_cat');
        $suffix = random_int(10000, 99999);
        $provinceId = DB::table('provinces')->insertGetId(['province_name' => "Test Province {$suffix}"]);
        $cityId = DB::table('cities')->insertGetId(['province_id' => $provinceId, 'city_name' => "Test City {$suffix}"]);
        $barangayId = DB::table('barangays')->insertGetId(['city_id' => $cityId, 'barangay_name' => "Test Brgy {$suffix}"]);
        $addressId = DB::table('addresses')->insertGetId(['barangay_id' => $barangayId, 'street' => '123 Test St']);

        $restaurantId = DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Instant Category Bistro',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => "cat_{$suffix}@example.com",
            'contact_phone' => '09171234567',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        $response = $this->actingAs($owner)->postJson('/api/restaurant/menu/categories', [
            'restaurant_id' => $restaurantId,
            'category_name' => 'Rice Bowls',
        ]);

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.category.name', 'Rice Bowls');

        $dup = $this->actingAs($owner)->postJson('/api/restaurant/menu/categories', [
            'restaurant_id' => $restaurantId,
            'category_name' => 'Rice Bowls',
        ]);

        $dup->assertStatus(422);
    }

    public function test_admin_application_document_thumbnail_supports_private_caching_and_blocks_unauthorized(): void
    {
        Storage::fake('local');

        $admin = $this->createUser('admin', 'admin_doc');
        $other = $this->createUser('customer', 'other_doc');
        $applicant = $this->createUser('customer', 'app_doc');

        $suffix = random_int(10000, 99999);
        $provinceId = DB::table('provinces')->insertGetId(['province_name' => "Doc Province {$suffix}"]);
        $cityId = DB::table('cities')->insertGetId(['province_id' => $provinceId, 'city_name' => "Doc City {$suffix}"]);
        $barangayId = DB::table('barangays')->insertGetId(['city_id' => $cityId, 'barangay_name' => "Doc Brgy {$suffix}"]);
        $addressId = DB::table('addresses')->insertGetId(['barangay_id' => $barangayId, 'street' => '456 Doc St']);
        $restaurantId = DB::table('restaurants')->insertGetId([
            'restaurant_name' => "Doc Bistro {$suffix}",
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => "doc_{$suffix}@example.com",
            'contact_phone' => '09171234567',
            'address_id' => $addressId,
            'restaurant_status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $appId = DB::table('restaurant_applications')->insertGetId([
            'reference_number' => "SALO-APP-TEST-{$suffix}",
            'applicant_user_id' => $applicant->user_id,
            'restaurant_id' => $restaurantId,
            'application_status' => 'submitted',
            'applicant_position' => 'business_owner',
            'legal_first_name' => 'Test',
            'legal_last_name' => 'Applicant',
            'date_of_birth' => '1990-01-01',
            'contact_phone' => '09171234567',
            'contact_email' => $applicant->email,
            'contact_email_verified_at' => now(),
            'declarations_accepted_at' => now(),
            'terms_version' => 'v1.0',
            'submitted_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $relPath = 'applications/test/doc_sample.png';
        // 1x1 valid PNG
        $pngBytes = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
        Storage::disk('local')->put($relPath, $pngBytes);

        $docId = DB::table('application_documents')->insertGetId([
            'restaurant_application_id' => $appId,
            'document_code' => 'government_id',
            'file_path' => $relPath,
            'original_filename' => 'doc_sample.png',
            'mime_type' => 'image/png',
            'file_size_bytes' => strlen($pngBytes),
            'document_status' => 'pending_review',
            'uploaded_by' => $applicant->user_id,
            'uploaded_at' => now(),
        ]);

        $this->actingAs($other)
            ->get("/api/applications/documents/{$docId}/file?variant=thumb")
            ->assertForbidden();

        $res = $this->actingAs($admin)
            ->get("/api/applications/documents/{$docId}/file?variant=thumb");

        $res->assertOk();
        $cacheControl = (string) $res->headers->get('Cache-Control');
        $this->assertStringContainsString('private', $cacheControl);
        $this->assertStringContainsString('max-age=300', $cacheControl);
        $etag = $res->headers->get('ETag');
        $this->assertNotEmpty($etag);

        $this->actingAs($admin)
            ->withHeaders(['If-None-Match' => $etag])
            ->get("/api/applications/documents/{$docId}/file?variant=thumb")
            ->assertStatus(304);
    }
}
