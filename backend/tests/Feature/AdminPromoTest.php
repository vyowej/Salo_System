<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminPromoTest extends TestCase
{
    use DatabaseTransactions;

    public function test_admin_can_manage_promos_and_customer_can_validate_promo_code(): void
    {
        $admin = User::forceCreate([
            'username' => 'promo_adm_'.random_int(100, 999),
            'first_name' => 'Promo',
            'last_name' => 'Admin',
            'email' => 'promoadm_'.random_int(100, 999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'admin',
            'account_status' => 'active',
        ]);

        $customer = User::forceCreate([
            'username' => 'promo_cust_'.random_int(100, 999),
            'first_name' => 'Promo',
            'last_name' => 'Customer',
            'email' => 'promocust_'.random_int(100, 999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $code = 'SALO'.random_int(100, 999);

        $createRes = $this->actingAs($admin)->postJson('/api/admin/promos', [
            'promo_code' => $code,
            'promo_name' => 'Test 20% Off',
            'discount_type' => 'percentage',
            'funding_source' => 'platform',
            'discount_value' => 20,
            'minimum_order_amount' => 100,
            'maximum_discount' => 80,
            'starts_at' => now()->subHour()->toDateTimeString(),
            'ends_at' => now()->addDays(7)->toDateTimeString(),
            'usage_limit' => 50,
        ])->assertStatus(201)
            ->assertJsonPath('data.promo.promo_code', $code);

        $promoId = (int) $createRes->json('data.promo.promo_id');

        $this->actingAs($admin)->getJson('/api/admin/promos?search='.$code)
            ->assertOk()
            ->assertJsonPath('data.items.0.promo_id', $promoId);

        // Customer validates promo code (20% of 500 = 100, capped at maximum_discount 80)
        $this->actingAs($customer)->postJson('/api/customer/promos/validate', [
            'promo_code' => $code,
            'subtotal' => 500,
        ])->assertOk()
            ->assertJsonPath('data.promo.discount_amount', 80);

        // Admin deactivates promo -> customer validation returns 422
        $this->actingAs($admin)->patchJson("/api/admin/promos/{$promoId}", [
            'is_active' => false,
        ])->assertOk()
            ->assertJsonPath('data.promo.is_active', false);

        $this->actingAs($customer)->postJson('/api/customer/promos/validate', [
            'promo_code' => $code,
            'subtotal' => 500,
        ])->assertStatus(422);
    }

    public function test_promo_per_customer_limit_blocks_re_redemption(): void
    {
        $admin = User::forceCreate([
            'username' => 'plim_adm_'.random_int(100, 999),
            'first_name' => 'Limit',
            'last_name' => 'Admin',
            'email' => 'plimadm_'.random_int(100, 999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'admin',
            'account_status' => 'active',
        ]);

        $customer = User::forceCreate([
            'username' => 'plim_cust_'.random_int(100, 999),
            'first_name' => 'Limit',
            'last_name' => 'Customer',
            'email' => 'plimcust_'.random_int(100, 999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        $code = 'ONCE'.random_int(100, 999);
        $createRes = $this->actingAs($admin)->postJson('/api/admin/promos', [
            'promo_code' => $code,
            'promo_name' => 'Once Per Customer',
            'discount_type' => 'fixed_amount',
            'funding_source' => 'platform',
            'discount_value' => 50,
            'minimum_order_amount' => 100,
            'starts_at' => now()->subHour()->toDateTimeString(),
            'ends_at' => now()->addDays(7)->toDateTimeString(),
            'per_customer_limit' => 1,
        ])->assertStatus(201)
            ->assertJsonPath('data.promo.per_customer_limit', 1);

        $promoId = (int) $createRes->json('data.promo.promo_id');

        // Insert a non-cancelled order using this promo for the customer
        $addrId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '101 Katipunan Ave',
        ]);
        $restId = (int) \Illuminate\Support\Facades\DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Promo Test Resto '.random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09172223333',
            'business_email' => 'promotst_'.random_int(1000, 9999).'@example.com',
            'address_id' => $addrId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepting_orders' => 1,
            'restaurant_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $checkoutId = (int) \Illuminate\Support\Facades\DB::table('checkouts')->insertGetId([
            'customer_id' => $customer->user_id,
            'idempotency_key' => 'plim_chk_'.random_int(100000, 999999),
            'checkout_status' => 'pending',
            'total_amount' => 200.00,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        \Illuminate\Support\Facades\DB::table('orders')->insert([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $restId,
            'customer_id' => $customer->user_id,
            'promo_id' => $promoId,
            'restaurant_name' => 'Promo Test Resto',
            'customer_name' => 'Limit Customer',
            'order_reference' => 'ORD-PLIM-'.random_int(1000, 9999),
            'order_type' => 'delivery',
            'order_status' => 'completed',
            'subtotal_amount' => 250.00,
            'delivery_fee' => 0.00,
            'discount_amount' => 50.00,
            'platform_discount_amount' => 50.00,
            'total_amount' => 200.00,
            'placed_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Re-validation for same customer is blocked (422)
        $this->actingAs($customer)->postJson('/api/customer/promos/validate', [
            'promo_code' => $code,
            'subtotal' => 500,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['promo_code']);
    }
}
