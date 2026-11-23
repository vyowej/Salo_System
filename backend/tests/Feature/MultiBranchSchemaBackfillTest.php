<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\AddressService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class MultiBranchSchemaBackfillTest extends TestCase
{
    use DatabaseTransactions;

    private function createAddress(string $street = '101 Branch Ave'): int
    {
        return app(AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => $street,
        ]);
    }

    private function createUser(string $prefix = 'mb'): User
    {
        return User::forceCreate([
            'username' => "{$prefix}_" . random_int(10000, 99999),
            'first_name' => 'Multi',
            'last_name' => 'Branch',
            'email' => "{$prefix}_" . random_int(10000, 99999) . '@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);
    }

    private function createRootRestaurant(string $name, ?string $branchName = null): int
    {
        $addressId = $this->createAddress($name . ' Street');

        // brand_restaurant_id stays NULLable because a root row references its own
        // auto-increment restaurant_id; callers set brand_restaurant_id right after insertGetId.
        $id = (int) DB::table('restaurants')->insertGetId([
            'parent_restaurant_id' => null,
            'brand_restaurant_id' => null,
            'restaurant_name' => $name,
            'branch_name' => $branchName,
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234567',
            'business_email' => strtolower(str_replace(' ', '', $name)) . random_int(100, 999) . '@example.com',
            'address_id' => $addressId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'restaurant_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('restaurants')
            ->where('restaurant_id', $id)
            ->update(['brand_restaurant_id' => $id]);

        return $id;
    }

    private function createChildBranch(int $rootId, string $name, string $branchName): int
    {
        return (int) DB::table('restaurants')->insertGetId([
            'parent_restaurant_id' => $rootId,
            'brand_restaurant_id' => $rootId,
            'restaurant_name' => $name,
            'branch_name' => $branchName,
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234568',
            'business_email' => 'branch_' . random_int(1000, 9999) . '@example.com',
            'address_id' => $this->createAddress($branchName . ' St'),
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'restaurant_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_schema_columns_and_existing_backfill_values(): void
    {
        $this->assertTrue(Schema::hasColumns('restaurants', [
            'parent_restaurant_id',
            'brand_restaurant_id',
            'branch_name',
        ]));
        $this->assertTrue(Schema::hasTable('restaurant_application_branches'));

        $column = DB::selectOne(
            "SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'restaurants' AND COLUMN_NAME = 'brand_restaurant_id'"
        );
        $this->assertNotNull($column);
        $this->assertSame('YES', $column->IS_NULLABLE);

        $integrityRow = DB::selectOne('SELECT COUNT(*) AS cnt FROM restaurants WHERE brand_restaurant_id IS NULL');
        $this->assertSame(0, (int) ($integrityRow->cnt ?? -1));

        $mismatchedRootCount = DB::table('restaurants')
            ->whereNull('parent_restaurant_id')
            ->whereColumn('brand_restaurant_id', '!=', 'restaurant_id')
            ->count();
        $this->assertSame(0, $mismatchedRootCount);

        $this->artisan('salo:check-branch-integrity')->assertSuccessful();
    }

    public function test_duplicate_branch_name_blocked_within_same_brand(): void
    {
        $rootId = $this->createRootRestaurant('Brand Alpha', 'Main Branch');
        $this->createChildBranch($rootId, 'Brand Alpha', 'BGC High Street');

        $this->expectException(QueryException::class);
        $this->createChildBranch($rootId, 'Brand Alpha', 'BGC High Street');
    }

    public function test_same_branch_name_allowed_across_two_different_brands(): void
    {
        $brandA = $this->createRootRestaurant('Brand Alpha', 'Main Branch');
        $brandB = $this->createRootRestaurant('Brand Beta', 'Main Branch');

        $branchA = $this->createChildBranch($brandA, 'Brand Alpha', 'SM North EDSA');
        $branchB = $this->createChildBranch($brandB, 'Brand Beta', 'SM North EDSA');

        $this->assertGreaterThan(0, $branchA);
        $this->assertGreaterThan(0, $branchB);
        $this->assertNotSame($branchA, $branchB);
    }

    public function test_fk_restrict_blocks_deleting_root_restaurant_with_child_branch(): void
    {
        $rootId = $this->createRootRestaurant('Brand Gamma', 'Main Branch');
        $this->createChildBranch($rootId, 'Brand Gamma', 'Makati Branch');

        $this->expectException(QueryException::class);
        DB::table('restaurants')->where('restaurant_id', $rootId)->delete();
    }

    public function test_invalid_parent_or_brand_fk_is_rejected(): void
    {
        $this->expectException(QueryException::class);
        DB::table('restaurants')->insert([
            'parent_restaurant_id' => 999999999,
            'brand_restaurant_id' => 999999999,
            'restaurant_name' => 'Orphan Branch',
            'branch_name' => 'Nowhere',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09170000000',
            'business_email' => 'orphan@example.com',
            'address_id' => $this->createAddress('Orphan St'),
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'restaurant_status' => 'active',
        ]);
    }

    public function test_restaurant_application_branches_blocks_duplicate_branch_names_per_application(): void
    {
        $user = $this->createUser('appbr');
        $rootId = $this->createRootRestaurant('Pending Brand', 'Main');

        $appId = (int) DB::table('restaurant_applications')->insertGetId([
            'reference_number' => 'SALO-APP-TEST-' . random_int(10000, 99999),
            'applicant_user_id' => $user->user_id,
            'restaurant_id' => $rootId,
            'application_status' => 'submitted',
            'applicant_position' => 'business_owner',
            'legal_first_name' => 'Test',
            'legal_last_name' => 'Owner',
            'date_of_birth' => '1990-01-01',
            'contact_phone' => '09171234567',
            'contact_email' => $user->email,
            'contact_email_verified_at' => now(),
            'declarations_accepted_at' => now(),
            'terms_version' => 'v1.0',
            'submitted_at' => now(),
        ]);

        DB::table('restaurant_application_branches')->insert([
            'restaurant_application_id' => $appId,
            'branch_name' => 'Ortigas Branch',
            'address_id' => $this->createAddress('Ortigas Ave'),
            'sort_order' => 1,
        ]);

        $this->expectException(QueryException::class);
        DB::table('restaurant_application_branches')->insert([
            'restaurant_application_id' => $appId,
            'branch_name' => 'Ortigas Branch',
            'address_id' => $this->createAddress('Ortigas Ave 2'),
            'sort_order' => 2,
        ]);
    }
}
