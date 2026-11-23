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
}
