<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\RestaurantBranchService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class BranchPermitsSchemaTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $prefix = 'bp'): User
    {
        return User::create([
            'username' => "{$prefix}_" . random_int(10000, 99999),
            'first_name' => 'Permit',
            'last_name' => 'Tester',
            'email' => "{$prefix}_" . random_int(10000, 99999) . '@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);
    }

    private function createRootAndChild(User $owner): array
    {
        $addressService = app(\App\Support\AddressService::class);
        $branchService = app(RestaurantBranchService::class);

        $rootId = $branchService->createRootRestaurant([
            'restaurant_name' => 'Permit Bistro',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234567',
            'business_email' => $owner->email,
            'address_id' => $addressService->createAddress([
                'province' => 'Metro Manila',
                'city' => 'Quezon City',
                'barangay' => 'Diliman',
                'street' => '101 Main St',
            ]),
            'branch_name' => 'Main',
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'restaurant_status' => 'active',
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $rootId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        $childId = $branchService->createChildBranch($rootId, [
            'restaurant_name' => 'Permit Bistro',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234568',
            'business_email' => $owner->email,
            'branch_name' => 'BGC',
            'address_id' => $addressService->createAddress([
                'province' => 'Metro Manila',
                'city' => 'Taguig',
                'barangay' => 'Fort Bonifacio',
                'street' => '202 High St',
            ]),
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'restaurant_status' => 'active',
        ]);

        return [$rootId, $childId];
    }

    public function test_branch_permits_table_constraints_unique_keys_and_fk_restrict(): void
    {
        $this->assertTrue(Schema::hasTable('branch_permits'));
        $owner = $this->createUser('bpown');
        [$rootId, $childId] = $this->createRootAndChild($owner);
        // Remove auto-created Permit-2a row so we can test raw DB constraints from scratch
        DB::table('branch_permits')->where('restaurant_id', $childId)->delete();

        // 1. Neither restaurant_id nor application_branch_id -> chk_branch_permits_owner fails
        $this->expectExceptionOnce(function (): void {
            DB::table('branch_permits')->insert([
                'is_required_locally' => 1,
                'permit_status' => 'pending_submission',
            ]);
        });

        // 2. is_required_locally = 0 without exemption_reason -> fails
        $this->expectExceptionOnce(function () use ($childId): void {
            DB::table('branch_permits')->insert([
                'restaurant_id' => $childId,
                'is_required_locally' => 0,
                'exemption_reason' => '   ',
                'permit_status' => 'pending_review',
            ]);
        });

        // 3. pending_review with is_required_locally = 1 and NULL file_path -> fails
        $this->expectExceptionOnce(function () use ($childId): void {
            DB::table('branch_permits')->insert([
                'restaurant_id' => $childId,
                'is_required_locally' => 1,
                'permit_status' => 'pending_review',
                'file_path' => null,
            ]);
        });

        // 4. Invalid MIME type -> fails
        $this->expectExceptionOnce(function () use ($childId, $owner): void {
            DB::table('branch_permits')->insert([
                'restaurant_id' => $childId,
                'is_required_locally' => 1,
                'file_path' => 'private/permits/bad_mime_' . random_int(100, 999) . '.txt',
                'original_filename' => 'permit.txt',
                'mime_type' => 'text/plain',
                'file_size_bytes' => 1024,
                'permit_status' => 'pending_review',
                'uploaded_by' => $owner->user_id,
                'uploaded_at' => now(),
            ]);
        });

        // 5. File size > 10MB -> fails
        $this->expectExceptionOnce(function () use ($childId, $owner): void {
            DB::table('branch_permits')->insert([
                'restaurant_id' => $childId,
                'is_required_locally' => 1,
                'file_path' => 'private/permits/too_big_' . random_int(100, 999) . '.pdf',
                'original_filename' => 'permit.pdf',
                'mime_type' => 'application/pdf',
                'file_size_bytes' => 10485761,
                'permit_status' => 'pending_review',
                'uploaded_by' => $owner->user_id,
                'uploaded_at' => now(),
            ]);
        });

        // 6. rejected without review_note -> fails
        $this->expectExceptionOnce(function () use ($childId, $owner): void {
            DB::table('branch_permits')->insert([
                'restaurant_id' => $childId,
                'is_required_locally' => 1,
                'file_path' => 'private/permits/no_note_' . random_int(100, 999) . '.pdf',
                'original_filename' => 'permit.pdf',
                'mime_type' => 'application/pdf',
                'file_size_bytes' => 2048,
                'permit_status' => 'rejected',
                'review_note' => '',
                'uploaded_by' => $owner->user_id,
                'uploaded_at' => now(),
            ]);
        });

        // 7. Valid insert succeeds, duplicate restaurant_id fails, duplicate file_path fails, FK RESTRICT blocks delete
        $filePath = 'private/permits/valid_' . random_int(1000, 9999) . '.pdf';
        DB::table('branch_permits')->insert([
            'restaurant_id' => $childId,
            'is_required_locally' => 1,
            'file_path' => $filePath,
            'original_filename' => 'mayors-permit.pdf',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 4096,
            'permit_status' => 'approved',
            'uploaded_by' => $owner->user_id,
            'uploaded_at' => now(),
            'reviewed_by' => $owner->user_id,
            'reviewed_at' => now(),
        ]);

        // Duplicate restaurant_id -> uk_branch_permits_restaurant
        $this->expectExceptionOnce(function () use ($childId): void {
            DB::table('branch_permits')->insert([
                'restaurant_id' => $childId,
                'is_required_locally' => 0,
                'exemption_reason' => 'Exempt',
                'permit_status' => 'pending_review',
            ]);
        });

        // Duplicate file_path -> uk_branch_permits_path
        $this->expectExceptionOnce(function () use ($rootId, $filePath): void {
            DB::table('branch_permits')->insert([
                'restaurant_id' => $rootId,
                'is_required_locally' => 1,
                'file_path' => $filePath,
                'original_filename' => 'dup.pdf',
                'mime_type' => 'application/pdf',
                'file_size_bytes' => 4096,
                'permit_status' => 'pending_review',
            ]);
        });

        // ON DELETE RESTRICT blocks deleting child restaurant while branch_permits references it
        $this->expectExceptionOnce(function () use ($childId): void {
            DB::table('restaurants')->where('restaurant_id', $childId)->delete();
        });
    }

    public function test_check_branch_integrity_detects_permit_anomalies(): void
    {
        $owner = $this->createUser('bpint');
        [$rootId, $childId] = $this->createRootAndChild($owner);

        // Delete auto-created permit row -> non-root branch without a permit row -> failure (exit 1)
        DB::table('branch_permits')->where('restaurant_id', $childId)->delete();
        $this->assertSame(1, Artisan::call('salo:check-branch-integrity'));

        // Attach pending_review permit and publish child -> published_unverified_branch -> failure (exit 1)
        DB::table('branch_permits')->insert([
            'restaurant_id' => $childId,
            'is_required_locally' => 1,
            'file_path' => 'private/permits/int_' . random_int(1000, 9999) . '.pdf',
            'original_filename' => 'permit.pdf',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 2048,
            'permit_status' => 'pending_review',
            'uploaded_by' => $owner->user_id,
            'uploaded_at' => now(),
        ]);
        DB::table('restaurants')->where('restaurant_id', $childId)->update(['is_published' => 1]);
        $this->assertSame(1, Artisan::call('salo:check-branch-integrity'));

        // Approve permit -> passes (exit 0)
        DB::table('branch_permits')->where('restaurant_id', $childId)->update([
            'permit_status' => 'approved',
            'reviewed_by' => $owner->user_id,
            'reviewed_at' => now(),
        ]);
        $this->assertSame(0, Artisan::call('salo:check-branch-integrity'));

        // Permit attached to root restaurant -> root_with_branch_permit -> failure (exit 1)
        DB::table('branch_permits')->insert([
            'restaurant_id' => $rootId,
            'is_required_locally' => 1,
            'permit_status' => 'pending_submission',
        ]);
        $this->assertSame(1, Artisan::call('salo:check-branch-integrity'));
    }

    private function expectExceptionOnce(callable $fn): void
    {
        try {
            $fn();
            $this->fail('Expected QueryException was not thrown.');
        } catch (QueryException $e) {
            $this->assertInstanceOf(QueryException::class, $e);
        }
    }
}
