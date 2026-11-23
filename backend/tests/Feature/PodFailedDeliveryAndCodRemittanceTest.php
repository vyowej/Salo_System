<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PodFailedDeliveryAndCodRemittanceTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 't034', string $firstName = 'Test'): User
    {
        return User::forceCreate([
            'username' => "{$prefix}_".random_int(10000, 99999),
            'first_name' => $firstName,
            'last_name' => 'User',
            'phone_number' => '+639171234567',
            'email' => "{$prefix}_".random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createActiveOnlineRider(User $user): int
    {
        $cityId = (int) (DB::table('cities')->value('city_id')
            ?? DB::table('cities')->insertGetId([
                'province_id' => DB::table('provinces')->value('province_id')
                    ?? DB::table('provinces')->insertGetId(['province_name' => 'Metro Manila']),
                'city_name' => 'Quezon City',
            ]));

        $riderId = (int) DB::table('riders')->insertGetId([
            'user_id' => $user->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Contact Person',
            'emergency_contact_relationship' => 'sibling',
            'emergency_contact_phone' => '09171112222',
            'base_city_id' => $cityId,
            'rider_status' => 'active',
            'approved_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $riderId;
    }

    private function createReadyOrder(User $owner, User $buyer): array
    {
        $addrId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '42 Maginhawa St',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'T034 Kitchen '.random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09172223333',
            'business_email' => 't034_'.random_int(1000, 9999).'@example.com',
            'address_id' => $addrId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepting_orders' => 1,
            'restaurant_status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        $checkoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $buyer->user_id,
            'idempotency_key' => 't034_chk_'.random_int(100000, 999999),
            'checkout_status' => 'pending',
            'total_amount' => 249.00,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $orderRef = 'ORD-T034-'.random_int(1000, 9999);
        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $restaurantId,
            'customer_id' => $buyer->user_id,
            'restaurant_name' => 'T034 Kitchen',
            'customer_name' => 'Buyer User',
            'order_reference' => $orderRef,
            'order_type' => 'delivery',
            'order_status' => 'ready',
            'delivery_recipient_name' => 'Buyer User',
            'delivery_phone' => '09171234567',
            'delivery_address_text' => '42 Maginhawa St, Diliman, Quezon City',
            'subtotal_amount' => 200.00,
            'delivery_fee' => 49.00,
            'total_amount' => 249.00,
            'placed_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $paymentId = (int) DB::table('payments')->insertGetId([
            'checkout_id' => $checkoutId,
            'customer_id' => $buyer->user_id,
            'payment_method' => 'cash',
            'payment_status' => 'pending',
            'amount' => 249.00,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('payment_allocations')->insert([
            'payment_id' => $paymentId,
            'order_id' => $orderId,
            'allocation_type' => 'order_payment',
            'amount' => 249.00,
            'created_at' => now(),
        ]);

        return ['order_id' => $orderId, 'order_reference' => $orderRef, 'total_amount' => 249.00];
    }

    public function test_pod_upload_and_cod_remittance_end_to_end(): void
    {
        Storage::fake('local');

        $owner = $this->createUser('customer', 'own');
        $buyer = $this->createUser('customer', 'buy');
        $riderUser = $this->createUser('customer', 'rid');
        $admin = $this->createUser('admin', 'adm');

        $this->createActiveOnlineRider($riderUser);
        $this->actingAs($riderUser)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();
        $order = $this->createReadyOrder($owner, $buyer);
        $orderId = $order['order_id'];

        $this->actingAs($riderUser)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertOk();
        $this->actingAs($riderUser)->postJson("/api/rider/deliveries/{$orderId}/picked-up")->assertOk();

        $proofFile = UploadedFile::fake()->image('pod.jpg', 320, 240);

        $deliveredRes = $this->actingAs($riderUser)->post("/api/rider/deliveries/{$orderId}/delivered", [
            'collected_amount' => 249.00,
            'recipient_name' => 'Juan Dela Cruz',
            'delivery_notes' => 'Handed at lobby guardhouse',
            'proof_photo' => $proofFile,
        ]);

        $deliveredRes->assertOk()
            ->assertJsonPath('data.delivery.delivery_status', 'delivered')
            ->assertJsonPath('data.delivery.recipient_name', 'Juan Dela Cruz')
            ->assertJsonPath('data.delivery.has_proof_photo', true)
            ->assertJsonPath('data.delivery.cod_remittance_status', 'pending');

        $deliveryId = (int) $deliveredRes->json('data.delivery.delivery_id');

        $this->actingAs($riderUser)->get("/api/rider/deliveries/{$orderId}/proof")->assertOk();

        $this->actingAs($riderUser)->get('/api/rider/deliveries/history?status=delivered')
            ->assertOk()
            ->assertJsonPath('data.pagination.total', 1)
            ->assertJsonPath('data.deliveries.0.order_id', $orderId)
            ->assertJsonPath('data.deliveries.0.has_proof_photo', true);

        // Rider finance summary & COD remittance submission
        $this->actingAs($riderUser)->getJson('/api/rider/finance')
            ->assertOk()
            ->assertJsonPath('data.summary.total_deliveries_completed', 1)
            ->assertJsonPath('data.summary.cod_pending_count', 1);

        $this->actingAs($riderUser)->postJson('/api/rider/finance/remit', [
            'delivery_ids' => [$deliveryId],
            'notes' => 'GCash deposit #9981',
        ])->assertOk()
            ->assertJsonPath('data.submission.submitted_count', 1)
            ->assertJsonPath('data.finance.summary.cod_submitted_count', 1)
            ->assertJsonPath('data.finance.summary.cod_pending_count', 0);

        // Admin lists COD remittances, flags discrepancy, rider resubmits, admin confirms
        $this->actingAs($admin)->getJson('/api/admin/finance/cod-remittances?remittance_status=submitted')
            ->assertOk()
            ->assertJsonPath('data.summary.submitted_count', 1)
            ->assertJsonPath('data.items.0.delivery_id', $deliveryId);

        $this->actingAs($admin)->postJson("/api/admin/finance/cod-remittances/{$deliveryId}/verify", [
            'action' => 'flag_discrepancy',
            'notes' => 'Short by 20 pesos in slip',
        ])->assertOk()
            ->assertJsonPath('data.remittance.cod_remittance_status', 'discrepancy');

        $this->actingAs($riderUser)->postJson('/api/rider/finance/remit', [
            'delivery_ids' => [$deliveryId],
            'notes' => 'Uploaded balance',
        ])->assertOk();

        $this->actingAs($admin)->postJson("/api/admin/finance/cod-remittances/{$deliveryId}/verify", [
            'action' => 'confirm',
            'notes' => 'Verified complete',
        ])->assertOk()
            ->assertJsonPath('data.remittance.cod_remittance_status', 'confirmed')
            ->assertJsonPath('data.remittance.cod_confirmed_by', $admin->user_id);
    }

    public function test_failed_delivery_and_admin_dispute_resolution(): void
    {
        $owner = $this->createUser('customer', 'ownf');
        $buyer = $this->createUser('customer', 'buyf');
        $riderUser = $this->createUser('customer', 'ridf');
        $admin = $this->createUser('admin', 'admf');

        $this->createActiveOnlineRider($riderUser);
        $this->actingAs($riderUser)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();
        $order = $this->createReadyOrder($owner, $buyer);
        $orderId = $order['order_id'];

        $this->actingAs($riderUser)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertOk();
        $this->actingAs($riderUser)->postJson("/api/rider/deliveries/{$orderId}/picked-up")->assertOk();

        $this->actingAs($riderUser)->postJson("/api/rider/deliveries/{$orderId}/fail", [
            'failure_reason' => 'Customer unreachable after 3 calls',
            'delivery_notes' => 'Gate locked, no answer',
        ])->assertOk()
            ->assertJsonPath('data.delivery.delivery_status', 'failed')
            ->assertJsonPath('data.delivery.order_status', 'failed');

        $this->actingAs($admin)->getJson('/api/admin/disputes?search='.urlencode($order['order_reference']))
            ->assertOk()
            ->assertJsonPath('data.meta.total', 1)
            ->assertJsonPath('data.items.0.order_id', $orderId);

        // Requeue for delivery
        $this->actingAs($admin)->postJson("/api/admin/disputes/{$orderId}/resolve", [
            'action' => 'requeue_for_delivery',
            'notes' => 'Customer confirmed alternate contact',
        ])->assertOk()
            ->assertJsonPath('data.resolution.order_status', 'ready')
            ->assertJsonPath('data.resolution.delivery_status', 'pending_assignment');

        // Another rider (or same rider) accepts and fails again, then admin cancels order
        $this->actingAs($riderUser)->postJson("/api/rider/deliveries/{$orderId}/accept")->assertOk();
        $this->actingAs($riderUser)->postJson("/api/rider/deliveries/{$orderId}/fail", [
            'failure_reason' => 'Customer refused order at door',
        ])->assertOk();

        $this->actingAs($admin)->postJson("/api/admin/disputes/{$orderId}/resolve", [
            'action' => 'cancel_order',
            'notes' => 'Customer refused delivery',
        ])->assertOk()
            ->assertJsonPath('data.resolution.order_status', 'cancelled')
            ->assertJsonPath('data.resolution.delivery_status', 'cancelled');
    }
}
