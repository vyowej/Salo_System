<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class Phase3RevisionTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $prefix = 'p3'): User
    {
        $suffix = random_int(10000, 99999);
        $userId = DB::table('users')->insertGetId([
            'username' => "{$prefix}_{$suffix}",
            'first_name' => 'Phase',
            'last_name' => 'Three',
            'email' => "{$prefix}_{$suffix}@example.com",
            'password_hash' => Hash::make('SaloStrong#2026'),
            'user_role' => 'customer',
            'account_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return User::findOrFail($userId);
    }

    private function createRestaurantOwnedBy(User $owner, bool $published = true, string $status = 'active'): int
    {
        $suffix = random_int(10000, 99999);
        $provinceId = DB::table('provinces')->insertGetId(['province_name' => "P3 Prov {$suffix}"]);
        $cityId = DB::table('cities')->insertGetId(['province_id' => $provinceId, 'city_name' => "P3 City {$suffix}"]);
        $barangayId = DB::table('barangays')->insertGetId(['city_id' => $cityId, 'barangay_name' => "P3 Brgy {$suffix}"]);
        $addressId = DB::table('addresses')->insertGetId(['barangay_id' => $barangayId, 'street' => '123 Rizal St']);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => "P3 Kitchen {$suffix}",
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => "p3rest_{$suffix}@example.com",
            'contact_phone' => '09171234567',
            'address_id' => $addressId,
            'restaurant_status' => $status,
            'is_published' => $published ? 1 : 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        return $restaurantId;
    }

    public function test_bulk_categories_validates_atomically_and_enforces_authorization(): void
    {
        $owner = $this->createUser('p3_cat_own');
        $other = $this->createUser('p3_cat_oth');
        $restaurantId = $this->createRestaurantOwnedBy($owner);

        // Unauthorized user blocked
        $this->actingAs($other)->postJson('/api/restaurant/menu/categories/bulk', [
            'restaurant_id' => $restaurantId,
            'categories' => [['category_name' => 'Soups']],
        ])->assertForbidden();

        // Success batch
        $this->actingAs($owner)->postJson('/api/restaurant/menu/categories/bulk', [
            'restaurant_id' => $restaurantId,
            'categories' => [
                ['category_name' => 'Rice Bowls'],
                ['category_name' => 'Drinks'],
            ],
        ])->assertCreated()
            ->assertJsonCount(2, 'data.categories');

        // Duplicate within batch -> 422 and nothing saved
        $this->actingAs($owner)->postJson('/api/restaurant/menu/categories/bulk', [
            'restaurant_id' => $restaurantId,
            'categories' => [
                ['category_name' => 'Desserts'],
                ['category_name' => 'desserts'],
            ],
        ])->assertStatus(422);
        $this->assertFalse(DB::table('menu_categories')->where('restaurant_id', $restaurantId)->where('category_name', 'Desserts')->exists());

        // Duplicate with existing -> 422 and nothing saved
        $this->actingAs($owner)->postJson('/api/restaurant/menu/categories/bulk', [
            'restaurant_id' => $restaurantId,
            'categories' => [
                ['category_name' => 'Appetizers'],
                ['category_name' => 'rice bowls'],
            ],
        ])->assertStatus(422);
        $this->assertFalse(DB::table('menu_categories')->where('restaurant_id', $restaurantId)->where('category_name', 'Appetizers')->exists());

        // Over 30 limit -> 422
        $tooMany = array_map(fn ($i) => ['category_name' => "Cat {$i}"], range(1, 31));
        $this->actingAs($owner)->postJson('/api/restaurant/menu/categories/bulk', [
            'restaurant_id' => $restaurantId,
            'categories' => $tooMany,
        ])->assertStatus(422);
    }

    public function test_bulk_items_saves_atomically_and_preserves_items_when_photo_fails(): void
    {
        $owner = $this->createUser('p3_item_own');
        $other = $this->createUser('p3_item_oth');
        $restaurantId = $this->createRestaurantOwnedBy($owner);

        $catId = (int) DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $restaurantId,
            'category_name' => 'Mains',
            'sort_order' => 1,
            'is_active' => 1,
            'draft_state' => 'new',
            'is_published' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Unauthorized blocked
        $this->actingAs($other)->postJson('/api/restaurant/menu/items/bulk', [
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'items' => [['item_name' => 'Adobo', 'base_price' => 150]],
        ])->assertForbidden();

        // Invalid row rolls back whole batch
        $this->actingAs($owner)->postJson('/api/restaurant/menu/items/bulk', [
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'items' => [
                ['item_name' => 'Adobo', 'base_price' => 150],
                ['item_name' => 'Sinigang', 'base_price' => 0],
            ],
        ])->assertStatus(422);
        $this->assertSame(0, DB::table('menu_items')->where('restaurant_id', $restaurantId)->count());

        // Valid batch with a corrupt/non-image photo (if validated or fails during processing) -> items saved
        $badImage = UploadedFile::fake()->create('corrupt.jpg', 10, 'image/jpeg');
        $res = $this->actingAs($owner)->post('/api/restaurant/menu/items/bulk', [
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'items' => [
                ['item_name' => 'Pork Sisig', 'base_price' => '199.00', 'description' => 'Crispy'],
                ['item_name' => 'Beef Kare-Kare', 'base_price' => '250.00'],
            ],
            'photos' => [0 => $badImage],
        ], ['Accept' => 'application/json']);

        $res->assertCreated()
            ->assertJsonCount(2, 'data.items');
        $this->assertSame(2, DB::table('menu_items')->where('restaurant_id', $restaurantId)->count());
    }

    public function test_preview_endpoint_shows_unpublished_restaurant_to_owner_only(): void
    {
        $owner = $this->createUser('p3_prev_own');
        $otherOwner = $this->createUser('p3_prev_oth');
        $customer = $this->createUser('p3_prev_cust');
        $restaurantId = $this->createRestaurantOwnedBy($owner, published: false, status: 'active');

        $catId = (int) DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $restaurantId,
            'category_name' => 'Draft Specials',
            'sort_order' => 1,
            'is_active' => 1,
            'draft_state' => 'new',
            'is_published' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('menu_items')->insert([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'item_name' => 'Draft Lechon',
            'base_price' => '450.00',
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'sort_order' => 1,
            'draft_state' => 'new',
            'is_published' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Public route MUST still hide unpublished restaurant
        $this->getJson("/api/restaurants/{$restaurantId}")->assertNotFound();

        // Other owner & customer MUST be blocked from preview
        $this->actingAs($otherOwner)->getJson("/api/restaurant/preview?restaurant_id={$restaurantId}")->assertForbidden();
        $this->actingAs($customer)->getJson("/api/restaurant/preview?restaurant_id={$restaurantId}")->assertForbidden();

        // Owner sees unpublished restaurant & draft menu with private no-store cache
        $res = $this->actingAs($owner)->getJson("/api/restaurant/preview?restaurant_id={$restaurantId}");
        $res->assertOk()
            ->assertJsonPath('data.is_preview', true)
            ->assertJsonPath('data.is_published', false)
            ->assertJsonPath('data.categories.0.name', 'Draft Specials')
            ->assertJsonPath('data.categories.0.items.0.name', 'Draft Lechon');

        $cacheControl = (string) $res->headers->get('Cache-Control');
        $this->assertStringContainsString('no-store', $cacheControl);
    }
}
