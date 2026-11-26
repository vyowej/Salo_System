<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class RiderPhase4Test extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'rp4'): User
    {
        return User::forceCreate([
            'username' => "{$prefix}_".random_int(10000, 99999),
            'first_name' => 'Marco',
            'last_name' => 'Reyes',
            'phone_number' => '+639171234567',
            'email' => "{$prefix}_".random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createRiderRecord(User $user, string $status = 'active'): int
    {
        $cityId = (int) (DB::table('cities')->value('city_id')
            ?? DB::table('cities')->insertGetId([
                'province_id' => DB::table('provinces')->value('province_id')
                    ?? DB::table('provinces')->insertGetId(['province_name' => 'Metro Manila']),
                'city_name' => 'Quezon City',
            ]));

        return (int) DB::table('riders')->insertGetId([
            'user_id' => $user->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Elena Reyes',
            'emergency_contact_relationship' => 'sibling',
            'emergency_contact_phone' => '09171112222',
            'base_city_id' => $cityId,
            'rider_status' => $status,
            'approved_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_rider_can_upload_replace_and_remove_profile_photo_with_cleanup(): void
    {
        Storage::fake('public');

        $user = $this->createUser('customer', 'rider_photo');
        $riderId = $this->createRiderRecord($user, 'active');

        $firstUpload = $this->actingAs($user)
            ->post('/api/rider/profile/photo', [
                'photo' => UploadedFile::fake()->image('selfie.jpg', 400, 400),
            ]);

        $firstUpload->assertOk();
        $firstUrl = $firstUpload->json('data.profile.profile_photo');
        $this->assertNotEmpty($firstUrl);

        $firstStoredPath = (string) DB::table('riders')->where('rider_id', $riderId)->value('profile_photo');
        $this->assertNotSame('', $firstStoredPath);
        Storage::disk('public')->assertExists($firstStoredPath);

        $meRes = $this->actingAs($user)->getJson('/api/auth/me');
        $meRes->assertOk();
        $this->assertSame($firstUrl, $meRes->json('data.user.avatar'));
        $this->assertSame($firstUrl, $meRes->json('data.user.rider_profile.profile_photo'));

        $secondUpload = $this->actingAs($user)
            ->post('/api/rider/profile/photo', [
                'photo' => UploadedFile::fake()->image('selfie2.png', 400, 400),
            ]);

        $secondUpload->assertOk();
        $secondStoredPath = (string) DB::table('riders')->where('rider_id', $riderId)->value('profile_photo');
        $this->assertNotSame($firstStoredPath, $secondStoredPath);
        Storage::disk('public')->assertMissing($firstStoredPath);
        Storage::disk('public')->assertExists($secondStoredPath);

        $removeRes = $this->actingAs($user)->deleteJson('/api/rider/profile/photo');
        $removeRes->assertOk();
        $this->assertNull($removeRes->json('data.profile.profile_photo'));
        $this->assertNull(DB::table('riders')->where('rider_id', $riderId)->value('profile_photo'));
        Storage::disk('public')->assertMissing($secondStoredPath);
    }

    public function test_rider_profile_photo_rejects_non_image_files(): void
    {
        Storage::fake('public');

        $user = $this->createUser('customer', 'rider_bad_photo');
        $this->createRiderRecord($user, 'active');

        $res = $this->actingAs($user)
            ->withHeader('Accept', 'application/json')
            ->post('/api/rider/profile/photo', [
                'photo' => UploadedFile::fake()->create('not-an-image.pdf', 100, 'application/pdf'),
            ]);

        $res->assertStatus(422);
    }

    public function test_available_deliveries_includes_payment_method_and_cod_amount(): void
    {
        $riderUser = $this->createUser('customer', 'rider_avail');
        $this->createRiderRecord($riderUser, 'active');

        $owner = $this->createUser('customer', 'owner_avail');
        $buyer = $this->createUser('customer', 'buyer_avail');

        $addrId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '42 Maginhawa St',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Maginhawa Grill',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09172223333',
            'business_email' => 'grill_'.random_int(1000, 9999).'@example.com',
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
        ]);

        $codCheckoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $buyer->user_id,
            'idempotency_key' => 'rp4-cod-'.random_int(100000, 999999),
            'checkout_status' => 'pending',
            'total_amount' => '345.00',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $codOrderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $codCheckoutId,
            'order_reference' => 'ORD-COD-'.random_int(10000, 99999),
            'customer_id' => $buyer->user_id,
            'customer_name' => 'Buyer Test',
            'restaurant_id' => $restaurantId,
            'order_type' => 'delivery',
            'order_status' => 'ready',
            'restaurant_name' => 'Maginhawa Grill',
            'delivery_address_text' => '18 Katipunan Ave, Brgy. Loyola Heights, Quezon City, Metro Manila',
            'subtotal_amount' => 300.00,
            'delivery_fee' => 45.00,
            'total_amount' => 345.00,
            'placed_at' => now()->subMinutes(5),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('payments')->insert([
            'checkout_id' => $codCheckoutId,
            'customer_id' => $buyer->user_id,
            'payment_method' => 'cash',
            'payment_status' => 'pending',
            'amount' => 345.00,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $ewalletCheckoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $buyer->user_id,
            'idempotency_key' => 'rp4-ew-'.random_int(100000, 999999),
            'checkout_status' => 'pending',
            'total_amount' => '290.00',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $gcashOrderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $ewalletCheckoutId,
            'order_reference' => 'ORD-EW-'.random_int(10000, 99999),
            'customer_id' => $buyer->user_id,
            'customer_name' => 'Buyer Test',
            'restaurant_id' => $restaurantId,
            'order_type' => 'delivery',
            'order_status' => 'ready',
            'restaurant_name' => 'Maginhawa Grill',
            'delivery_address_text' => '25 Timog Ave, Brgy. South Triangle, Quezon City, Metro Manila',
            'subtotal_amount' => 250.00,
            'delivery_fee' => 40.00,
            'total_amount' => 290.00,
            'placed_at' => now()->subMinutes(2),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('payments')->insert([
            'checkout_id' => $ewalletCheckoutId,
            'customer_id' => $buyer->user_id,
            'payment_method' => 'e_wallet',
            'payment_status' => 'paid',
            'amount' => 290.00,
            'paid_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($riderUser)->patchJson('/api/rider/availability', ['status' => 'online'])->assertOk();

        $availRes = $this->actingAs($riderUser)->getJson('/api/rider/deliveries/available');
        $availRes->assertOk();

        $deliveries = collect($availRes->json('data.deliveries'));
        $codDelivery = $deliveries->firstWhere('order_id', $codOrderId);
        $gcashDelivery = $deliveries->firstWhere('order_id', $gcashOrderId);

        $this->assertNotNull($codDelivery);
        $this->assertSame('cod', $codDelivery['payment_method']);
        $this->assertEquals(345.0, $codDelivery['cod_amount']);

        $this->assertNotNull($gcashDelivery);
        $this->assertSame('e_wallet', $gcashDelivery['payment_method']);
        $this->assertNull($gcashDelivery['cod_amount']);
    }
}
