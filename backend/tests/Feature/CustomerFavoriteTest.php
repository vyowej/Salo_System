<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CustomerFavoriteTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'fav'): User
    {
        return User::forceCreate([
            'username' => "{$prefix}_".random_int(10000, 99999),
            'first_name' => 'Fav',
            'last_name' => 'Tester',
            'phone_number' => '+639171234567',
            'email' => "{$prefix}_".random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createRestaurant(string $status = 'active', int $published = 1, string $name = 'Salo Bistro'): int
    {
        $addrId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '42 Maginhawa St',
        ]);

        return (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => $name,
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09172223333',
            'business_email' => 'rest_'.random_int(1000, 9999).'@example.com',
            'address_id' => $addrId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepting_orders' => 1,
            'restaurant_status' => $status,
            'is_published' => $published,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_customer_can_add_list_idempotently_and_remove_favorites(): void
    {
        $customer = $this->createUser('customer', 'favc1');
        $rest1 = $this->createRestaurant('active', 1, 'Salo Kitchen');
        $rest2 = $this->createRestaurant('active', 1, 'Lola Cafe');

        // Add favorite
        $this->actingAs($customer)->putJson("/api/customer/favorites/{$rest1}")
            ->assertOk()
            ->assertJsonPath('data.restaurant_id', $rest1)
            ->assertJsonPath('data.favorited', true);

        // Duplicate PUT is idempotent
        $this->actingAs($customer)->putJson("/api/customer/favorites/{$rest1}")
            ->assertOk()
            ->assertJsonPath('data.favorited', true);

        $this->assertSame(1, DB::table('customer_favorites')
            ->where('user_id', $customer->user_id)
            ->where('restaurant_id', $rest1)
            ->count());

        $this->actingAs($customer)->putJson("/api/customer/favorites/{$rest2}")->assertOk();

        // List returns both
        $listRes = $this->actingAs($customer)->getJson('/api/customer/favorites')
            ->assertOk();
        $this->assertCount(2, $listRes->json('data.favorites'));
        $this->assertEqualsCanonicalizing([$rest1, $rest2], $listRes->json('data.favorite_ids'));

        // Remove favorite + idempotent repeat delete
        $this->actingAs($customer)->deleteJson("/api/customer/favorites/{$rest1}")
            ->assertOk()
            ->assertJsonPath('data.favorited', false);

        $this->actingAs($customer)->deleteJson("/api/customer/favorites/{$rest1}")
            ->assertOk()
            ->assertJsonPath('data.favorited', false);

        $afterRes = $this->actingAs($customer)->getJson('/api/customer/favorites')->assertOk();
        $this->assertSame([$rest2], $afterRes->json('data.favorite_ids'));
    }

    public function test_favorites_are_isolated_per_customer_and_deny_non_customers(): void
    {
        $customer1 = $this->createUser('customer', 'faviso1');
        $customer2 = $this->createUser('customer', 'faviso2');
        $admin = $this->createUser('admin', 'favadm');
        $restId = $this->createRestaurant('active', 1);

        $this->actingAs($customer1)->putJson("/api/customer/favorites/{$restId}")->assertOk();

        // Customer 2 cannot see Customer 1's favorites
        $this->actingAs($customer2)->getJson('/api/customer/favorites')
            ->assertOk()
            ->assertJsonPath('data.favorite_ids', []);

        // Unauthenticated denied
        $this->app['auth']->guard('web')->logout();
        $this->getJson('/api/customer/favorites')->assertStatus(401);

        // Non-customer (admin) denied
        $this->actingAs($admin)->getJson('/api/customer/favorites')->assertStatus(403);
        $this->actingAs($admin)->putJson("/api/customer/favorites/{$restId}")->assertStatus(403);
        $this->actingAs($admin)->deleteJson("/api/customer/favorites/{$restId}")->assertStatus(403);
    }

    public function test_inactive_or_unpublished_restaurant_rejected_and_later_inactive_handled(): void
    {
        $customer = $this->createUser('customer', 'favinact');
        $inactiveRest = $this->createRestaurant('suspended', 1, 'Suspended Rest');
        $unpublishedRest = $this->createRestaurant('active', 0, 'Unpublished Rest');
        $activeRest = $this->createRestaurant('active', 1, 'Active Rest');

        $this->actingAs($customer)->putJson("/api/customer/favorites/{$inactiveRest}")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['restaurant_id']);

        $this->actingAs($customer)->putJson("/api/customer/favorites/{$unpublishedRest}")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['restaurant_id']);

        $this->actingAs($customer)->putJson("/api/customer/favorites/{$activeRest}")->assertOk();

        // Later becomes suspended -> still returned on GET with is_available = false so customer can remove it
        DB::table('restaurants')->where('restaurant_id', $activeRest)->update(['restaurant_status' => 'suspended']);

        $res = $this->actingAs($customer)->getJson('/api/customer/favorites')->assertOk();
        $this->assertFalse($res->json('data.favorites.0.is_available'));

        $this->actingAs($customer)->deleteJson("/api/customer/favorites/{$activeRest}")->assertOk();
    }
}
