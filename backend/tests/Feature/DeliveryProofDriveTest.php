<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\FileStorageService;
use App\Support\Storage\DriveClientInterface;
use App\Support\Storage\DriveFolderResolver;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\Support\FakeDriveClient;
use Tests\TestCase;

class DeliveryProofDriveTest extends TestCase
{
    use DatabaseTransactions;

    private FakeDriveClient $fakeDrive;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('local');
        Storage::fake('public');

        $this->fakeDrive = new FakeDriveClient('fake_salo_root');
        $this->app->instance(DriveClientInterface::class, $this->fakeDrive);
        $this->app->singleton(DriveFolderResolver::class, fn () => new DriveFolderResolver($this->fakeDrive));
        $this->app->forgetInstance(FileStorageService::class);

        config([
            'salo.uploads.private_file_driver' => 'google_drive',
            'salo.uploads.google_drive.public_folder_id' => 'fake_salo_root',
            'salo.uploads.delivery_proof_required' => false,
        ]);
    }

    private function createUser(string $role, string $first, string $last): User
    {
        $id = (int) DB::table('users')->insertGetId([
            'username' => 'u_'.uniqid(),
            'first_name' => $first,
            'last_name' => $last,
            'email' => 'u_'.uniqid().'@example.com',
            'password_hash' => Hash::make('Secret123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);

        return User::query()->findOrFail($id);
    }

    private function seedPickedUpDelivery(): array
    {
        $provinceId = (int) (DB::table('provinces')->value('province_id')
            ?: DB::table('provinces')->insertGetId(['province_name' => 'Metro Manila']));
        $cityId = (int) (DB::table('cities')->where('province_id', $provinceId)->value('city_id')
            ?: DB::table('cities')->insertGetId(['province_id' => $provinceId, 'city_name' => 'Makati']));
        $barangayId = (int) (DB::table('barangays')->where('city_id', $cityId)->value('barangay_id')
            ?: DB::table('barangays')->insertGetId(['city_id' => $cityId, 'barangay_name' => 'Poblacion']));
        $addressId = (int) DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '100 Ayala Ave',
        ]);

        $customer = $this->createUser('customer', 'Liza', 'Soberano');
        $otherCustomer = $this->createUser('customer', 'Other', 'Cust');
        $riderUser = $this->createUser('customer', 'Mark', 'Reyes');
        $otherRiderUser = $this->createUser('customer', 'Other', 'Rider');
        $ownerUser = $this->createUser('customer', 'Resto', 'Owner');
        $admin = $this->createUser('admin', 'Admin', 'Salo');

        $riderId = (int) DB::table('riders')->insertGetId([
            'user_id' => $riderUser->user_id,
            'vehicle_type' => 'walking',
            'emergency_contact_name' => 'Mom Reyes',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09171234567',
            'base_city_id' => $cityId,
            'rider_status' => 'active',
        ]);
        DB::table('riders')->insert([
            'user_id' => $otherRiderUser->user_id,
            'vehicle_type' => 'walking',
            'emergency_contact_name' => 'Dad Rider',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09171234567',
            'base_city_id' => $cityId,
            'rider_status' => 'active',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Proof Kitchen',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09171234567',
            'business_email' => 'proof_'.uniqid().'@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
        ]);
        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $ownerUser->user_id,
            'joined_at' => now(),
        ]);

        $checkoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $customer->user_id,
            'total_amount' => '250.00',
        ]);
        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'order_reference' => 'ORD-'.uniqid(),
            'customer_id' => $customer->user_id,
            'restaurant_id' => $restaurantId,
            'restaurant_name' => 'Proof Kitchen',
            'customer_name' => 'Liza Soberano',
            'order_type' => 'delivery',
            'order_status' => 'out_for_delivery',
            'delivery_address_text' => '100 Ayala Ave, Makati',
            'subtotal_amount' => '201.00',
            'delivery_fee' => '49.00',
            'total_amount' => '250.00',
            'placed_at' => now(),
        ]);
        $deliveryId = (int) DB::table('deliveries')->insertGetId([
            'order_id' => $orderId,
            'rider_id' => $riderId,
            'delivery_status' => 'picked_up',
            'picked_up_at' => now(),
        ]);

        return compact('customer', 'otherCustomer', 'riderUser', 'otherRiderUser', 'ownerUser', 'admin', 'orderId', 'deliveryId');
    }

    public function test_delivery_proof_rejects_pdf_and_respects_required_flag_and_transaction_rollback(): void
    {
        $ctx = $this->seedPickedUpDelivery();

        // 1. PDF rejected (images only)
        $this->actingAs($ctx['riderUser'])
            ->post("/api/rider/deliveries/{$ctx['orderId']}/delivered", [
                'proof_photo' => UploadedFile::fake()->createWithContent('proof.pdf', "%PDF-1.4\n"),
            ])
            ->assertStatus(422);

        // 2. Required flag enforces proof_photo
        config(['salo.uploads.delivery_proof_required' => true]);
        $this->actingAs($ctx['riderUser'])
            ->post("/api/rider/deliveries/{$ctx['orderId']}/delivered", [])
            ->assertStatus(422);
        config(['salo.uploads.delivery_proof_required' => false]);

        // 3. Upload alone cannot complete a delivery if delivery_status is not picked_up
        DB::table('deliveries')->where('delivery_id', $ctx['deliveryId'])->update(['delivery_status' => 'accepted']);
        $this->actingAs($ctx['riderUser'])
            ->post("/api/rider/deliveries/{$ctx['orderId']}/delivered", [
                'proof_photo' => UploadedFile::fake()->image('pod.jpg', 400, 300),
            ])
            ->assertStatus(409);

        // Uploaded Drive file must have been trashed on rollback
        $this->assertNotEmpty($this->fakeDrive->trashCalls);
        $this->assertNull(DB::table('deliveries')->where('delivery_id', $ctx['deliveryId'])->value('proof_photo'));
    }

    public function test_delivery_proof_stores_in_rider_month_folder_and_enforces_authorized_viewing(): void
    {
        $ctx = $this->seedPickedUpDelivery();

        $this->actingAs($ctx['riderUser'])
            ->post("/api/rider/deliveries/{$ctx['orderId']}/delivered", [
                'recipient_name' => 'Liza',
                'proof_photo' => UploadedFile::fake()->image('pod.png', 500, 400),
            ])
            ->assertOk();

        $proofPath = (string) DB::table('deliveries')->where('delivery_id', $ctx['deliveryId'])->value('proof_photo');
        $this->assertStringStartsWith('gdrive:', $proofPath);

        $fileId = substr($proofPath, strlen('gdrive:'));
        $fileNode = $this->fakeDrive->nodes[$fileId];
        $this->assertSame('private', $fileNode['appProperties']['visibility']);
        $monthFolder = $this->fakeDrive->nodes[$fileNode['parents'][0]];
        $this->assertSame(now()->format('Y-m'), $monthFolder['name']);

        // Permitted: assigned rider, order customer, admin
        $this->actingAs($ctx['riderUser'])->get("/api/rider/deliveries/{$ctx['orderId']}/proof")->assertOk();
        $this->actingAs($ctx['customer'])->get("/api/customer/orders/{$ctx['orderId']}/delivery-proof")->assertOk();
        $this->actingAs($ctx['admin'])->get("/api/admin/orders/{$ctx['orderId']}/delivery-proof")->assertOk();

        // Denied: other rider, other customer, restaurant owner
        $this->actingAs($ctx['otherRiderUser'])->get("/api/rider/deliveries/{$ctx['orderId']}/proof")->assertStatus(403);
        $this->actingAs($ctx['otherCustomer'])->get("/api/customer/orders/{$ctx['orderId']}/delivery-proof")->assertStatus(403);
        $this->actingAs($ctx['ownerUser'])->get("/api/customer/orders/{$ctx['orderId']}/delivery-proof")->assertStatus(403);
        $this->actingAs($ctx['ownerUser'])->get("/api/admin/orders/{$ctx['orderId']}/delivery-proof")->assertStatus(403);
    }
}
