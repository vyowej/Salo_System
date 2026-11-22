<?php

namespace Tests\Feature;

use App\Features\Reservations\Support\ReservationStatus;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CustomerReservationTest extends TestCase
{
    use DatabaseTransactions;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_customer_can_create_reservation_with_best_fit_table_history_audit_and_notifications(): void
    {
        $this->freezeManilaTime('2026-11-23 10:00:00');

        $restaurantId = $this->createRestaurant([
            'reservation_duration_minutes' => 90,
            'reservation_auto_confirm' => 0,
            'reservation_deposit_required' => 0,
            'reservation_deposit_amount' => '300.00',
            'reservation_service_fee' => '25.00',
        ]);
        $this->insertDailyOperatingHours($restaurantId, '10:00:00', '22:00:00');

        $owner = $this->createOwnerUser($restaurantId, 'res-own@salo.local');
        $resStaff = $this->createStaffUser($restaurantId, 'res-staff@salo.local', 'Reservation Handler');
        $orderStaff = $this->createStaffUser($restaurantId, 'ord-staff@salo.local', 'Order Staff');

        // Tables: 6-top and 4-top in Indoor -> party of 3 should get 4-top (best-fit)
        $this->insertTable($restaurantId, 'T-06', 6, 2, 'Indoor');
        $t4 = $this->insertTable($restaurantId, 'T-04', 4, 2, 'Indoor');

        $customer = $this->createUser('cust-book@salo.local', 'Maria', 'Santos', '09171234567');

        $response = $this->actingAs($customer)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-24T18:30',
            'party_size' => 3,
            'dining_area' => 'Indoor',
            'special_requests' => '  Quiet table near window  ',
            'idempotency_key' => 'idem-key-booking-001',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.reservation.restaurant_id', $restaurantId)
            ->assertJsonPath('data.reservation.customer_id', $customer->user_id)
            ->assertJsonPath('data.reservation.table_id', $t4)
            ->assertJsonPath('data.reservation.table.table_name', 'T-04')
            ->assertJsonPath('data.reservation.number_of_guests', 3)
            ->assertJsonPath('data.reservation.reservation_status', 'pending')
            ->assertJsonPath('data.reservation.reservation_start', '2026-11-24T18:30:00+08:00')
            ->assertJsonPath('data.reservation.reservation_end', '2026-11-24T20:00:00+08:00')
            ->assertJsonPath('data.reservation.contact_name', 'Maria Santos')
            ->assertJsonPath('data.reservation.contact_phone', '09171234567')
            ->assertJsonPath('data.reservation.special_requests', 'Quiet table near window')
            ->assertJsonPath('data.reservation.deposit_amount', '0.00')
            ->assertJsonPath('data.reservation.deposit_status', 'none')
            ->assertJsonPath('data.reservation.service_fee', '25.00')
            ->assertJsonPath('data.reservation.can_cancel', true)
            ->assertJsonPath('data.reservation.assigned_dining_area_differs', false);

        $reservationId = (int) $response->json('data.reservation.reservation_id');
        $reference = (string) $response->json('data.reservation.reservation_reference');
        $this->assertMatchesRegularExpression('/^SALO-RES-20261123-[A-Z0-9]{4}$/', $reference);

        // Status history recorded
        $this->assertDatabaseHas('reservation_status_history', [
            'reservation_id' => $reservationId,
            'from_status' => null,
            'to_status' => 'pending',
            'changed_by_user_id' => $customer->user_id,
            'changed_by_role' => 'customer',
        ]);

        // Audit log recorded
        $this->assertDatabaseHas('audit_logs', [
            'actor_user_id' => $customer->user_id,
            'action' => 'customer_reservation_created',
            'entity_type' => 'reservations',
            'entity_id' => (string) $reservationId,
        ]);

        // Notifications sent to owner + reservation staff (not order staff)
        $this->assertDatabaseHas('notifications', [
            'user_id' => $owner->user_id,
            'workspace' => 'restaurant',
            'type' => 'reservation_requested',
            'related_entity_type' => 'reservation',
            'related_entity_id' => $reservationId,
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $resStaff->user_id,
            'workspace' => 'restaurant',
            'type' => 'reservation_requested',
            'related_entity_id' => $reservationId,
        ]);
        $this->assertDatabaseMissing('notifications', [
            'user_id' => $orderStaff->user_id,
            'related_entity_type' => 'reservation',
            'related_entity_id' => $reservationId,
        ]);
    }

    public function test_auto_confirm_deposit_snapshot_and_idempotency_per_customer(): void
    {
        $this->freezeManilaTime('2026-11-23 10:00:00');

        $restaurantId = $this->createRestaurant([
            'reservation_auto_confirm' => 1,
            'reservation_deposit_required' => 0,
            'reservation_deposit_amount' => '0.00',
            'reservation_service_fee' => '40.00',
        ]);
        $this->insertDailyOperatingHours($restaurantId, '10:00:00', '22:00:00');
        $this->insertTable($restaurantId, 'T-01', 4, 1, 'Indoor');
        $this->insertTable($restaurantId, 'T-02', 4, 1, 'Indoor');

        $customerA = $this->createUser('cust-a@salo.local');
        $customerB = $this->createUser('cust-b@salo.local');

        $payload = [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-24T19:00',
            'party_size' => 2,
            'idempotency_key' => 'shared-idempotency-key-123',
        ];

        $first = $this->actingAs($customerA)->postJson('/api/customer/reservations', $payload);
        $first->assertStatus(201)
            ->assertJsonPath('data.reservation.reservation_status', 'confirmed')
            ->assertJsonPath('data.reservation.deposit_amount', '0.00')
            ->assertJsonPath('data.reservation.deposit_status', 'none')
            ->assertJsonPath('data.reservation.service_fee', '40.00');

        $firstId = (int) $first->json('data.reservation.reservation_id');
        $this->assertNotNull($first->json('data.reservation.confirmed_at'));

        // Customer A also receives reservation_confirmed notification in customer workspace
        $this->assertDatabaseHas('notifications', [
            'user_id' => $customerA->user_id,
            'workspace' => 'customer',
            'type' => 'reservation_confirmed',
            'related_entity_id' => $firstId,
        ]);

        // Replay by Customer A with same idempotency_key returns same reservation (201) without duplicate
        $replay = $this->actingAs($customerA)->postJson('/api/customer/reservations', $payload);
        $replay->assertStatus(201)
            ->assertJsonPath('data.reservation.reservation_id', $firstId);

        // Customer B using the exact same idempotency_key is NOT a conflict and creates Customer B's reservation
        $second = $this->actingAs($customerB)->postJson('/api/customer/reservations', $payload);
        $second->assertStatus(201);
        $this->assertNotSame($firstId, (int) $second->json('data.reservation.reservation_id'));
    }

    public function test_self_booking_overlapping_booking_too_many_pending_and_table_conflicts(): void
    {
        $this->freezeManilaTime('2026-11-23 10:00:00');

        $restaurantA = $this->createRestaurant();
        $this->insertDailyOperatingHours($restaurantA, '10:00:00', '22:00:00');
        $tA1 = $this->insertTable($restaurantA, 'A-01', 4, 2, 'Terrace');
        $tA2 = $this->insertTable($restaurantA, 'A-02', 4, 2, 'Indoor');

        $restaurantB = $this->createRestaurant();
        $this->insertDailyOperatingHours($restaurantB, '10:00:00', '22:00:00');
        $tB1 = $this->insertTable($restaurantB, 'B-01', 4, 1, 'Indoor');

        $ownerA = $this->createOwnerUser($restaurantA, 'self-own@salo.local');
        $staffA = $this->createStaffUser($restaurantA, 'self-staff@salo.local', 'Order Staff');
        $customer1 = $this->createUser('c1-limits@salo.local');
        $customer2 = $this->createUser('c2-limits@salo.local');

        // 1. Self-booking block for owner and active staff -> 422 SELF_BOOKING
        foreach ([$ownerA, $staffA] as $selfUser) {
            $this->actingAs($selfUser)->postJson('/api/customer/reservations', [
                'restaurant_id' => $restaurantA,
                'start' => '2026-11-24T18:00',
                'party_size' => 2,
                'idempotency_key' => 'self-book-' . $selfUser->user_id,
            ])
                ->assertStatus(422)
                ->assertJsonPath('code', 'SELF_BOOKING')
                ->assertJsonValidationErrors(['restaurant_id']);
        }

        // 2. Customer 1 books A-01 explicitly at 18:00
        $this->actingAs($customer1)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantA,
            'start' => '2026-11-24T18:00',
            'party_size' => 4,
            'table_id' => $tA1,
            'idempotency_key' => 'c1-book-a01-1800',
        ])->assertStatus(201);

        // 3. Customer 1 tries to book an overlapping slot (18:30) at Restaurant B -> 409 OVERLAPPING_BOOKING
        $this->actingAs($customer1)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantB,
            'start' => '2026-11-24T18:30',
            'party_size' => 2,
            'idempotency_key' => 'c1-overlap-rest-b',
        ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'OVERLAPPING_BOOKING');

        // 4. Customer 2 tries to book explicit table A-01 at 18:00 -> 409 SLOT_TAKEN with suggested_alternatives
        $slotTaken = $this->actingAs($customer2)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantA,
            'start' => '2026-11-24T18:00',
            'party_size' => 4,
            'table_id' => $tA1,
            'idempotency_key' => 'c2-slot-taken-a01',
        ]);
        $slotTaken->assertStatus(409)
            ->assertJsonPath('code', 'SLOT_TAKEN');
        $this->assertNotEmpty($slotTaken->json('suggested_alternatives'));

        // 5. Customer 2 tries to book Restaurant B's table B-01 while specifying restaurantA -> 409 NO_FIT (no cross-tenant leak)
        $this->actingAs($customer2)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantA,
            'start' => '2026-11-24T18:00',
            'party_size' => 4,
            'table_id' => $tB1,
            'idempotency_key' => 'c2-cross-table-b01',
        ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'NO_FIT');

        // 6. Customer 2 requests dining_area='Terrace' at 18:00 (Terrace A-01 is full, Indoor A-02 is open) -> falls back to Indoor with assigned_dining_area_differs=true
        $fallbackResp = $this->actingAs($customer2)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantA,
            'start' => '2026-11-24T18:00',
            'party_size' => 4,
            'dining_area' => 'Terrace',
            'idempotency_key' => 'c2-fallback-area-1800',
        ]);
        $fallbackResp->assertStatus(201)
            ->assertJsonPath('data.reservation.table_id', $tA2)
            ->assertJsonPath('data.reservation.assigned_dining_area_differs', true);

        // 7. Now both A-01 and A-02 are booked at 18:00; Customer 3 trying to book 18:00 gets 409 FULLY_BOOKED + suggested_alternatives
        $customer3 = $this->createUser('c3-full@salo.local');
        $fullResp = $this->actingAs($customer3)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantA,
            'start' => '2026-11-24T18:00',
            'party_size' => 4,
            'idempotency_key' => 'c3-fully-booked-1800',
        ]);
        $fullResp->assertStatus(409)
            ->assertJsonPath('code', 'FULLY_BOOKED');
        $this->assertNotEmpty($fullResp->json('suggested_alternatives'));

        // 8. Max active pending per customer (3): give Customer 1 two more non-overlapping pending bookings (total 3), then 4th is blocked with 409 TOO_MANY_PENDING
        $this->actingAs($customer1)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantA,
            'start' => '2026-11-25T18:00',
            'party_size' => 2,
            'idempotency_key' => 'c1-pending-2',
        ])->assertStatus(201);

        $this->actingAs($customer1)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantA,
            'start' => '2026-11-26T18:00',
            'party_size' => 2,
            'idempotency_key' => 'c1-pending-3',
        ])->assertStatus(201);

        $this->actingAs($customer1)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantA,
            'start' => '2026-11-27T18:00',
            'party_size' => 2,
            'idempotency_key' => 'c1-pending-4-blocked',
        ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'TOO_MANY_PENDING');
    }

    public function test_list_detail_and_cancellation_cutoff_rules_and_table_release(): void
    {
        $this->freezeManilaTime('2026-11-23 10:00:00');

        $restaurantId = $this->createRestaurant([
            'reservation_cancellation_cutoff_minutes' => 120,
            'reservation_min_notice_hours' => 0,
        ]);
        $this->insertDailyOperatingHours($restaurantId, '09:00:00', '22:00:00');
        $t1 = $this->insertTable($restaurantId, 'T-01', 4, 1, 'Indoor');
        $owner = $this->createOwnerUser($restaurantId, 'cancel-own@salo.local');

        $customer = $this->createUser('cancel-cust@salo.local');
        $otherCustomer = $this->createUser('other-cust@salo.local');

        // 1. Create a PENDING reservation starting in 60 minutes (11:00 today — inside the 120m cutoff!)
        $pendingResp = $this->actingAs($customer)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-23T11:00',
            'party_size' => 2,
            'idempotency_key' => 'pending-inside-cutoff',
        ]);
        $pendingResp->assertStatus(201)
            ->assertJsonPath('data.reservation.reservation_status', 'pending')
            ->assertJsonPath('data.reservation.can_cancel', true);
        $pendingId = (int) $pendingResp->json('data.reservation.reservation_id');

        // Pending reservation CAN be cancelled inside the cutoff (before start)
        $cancelPending = $this->actingAs($customer)->postJson("/api/customer/reservations/{$pendingId}/cancel", [
            'reason' => 'Running late, need to rebook',
        ]);
        $cancelPending->assertStatus(200)
            ->assertJsonPath('data.reservation.reservation_status', 'cancelled')
            ->assertJsonPath('data.reservation.cancelled_by', 'customer')
            ->assertJsonPath('data.reservation.cancellation_reason', 'Running late, need to rebook')
            ->assertJsonPath('data.reservation.can_cancel', false);

        // Owner receives reservation_cancelled_by_customer notification
        $this->assertDatabaseHas('notifications', [
            'user_id' => $owner->user_id,
            'workspace' => 'restaurant',
            'type' => 'reservation_cancelled_by_customer',
            'related_entity_id' => $pendingId,
        ]);

        // Cancelling again returns 409 INVALID_STATUS_TRANSITION
        $this->actingAs($customer)->postJson("/api/customer/reservations/{$pendingId}/cancel")
            ->assertStatus(409)
            ->assertJsonPath('code', 'INVALID_STATUS_TRANSITION');

        // Because the table was released, otherCustomer can now book T-01 at 11:00 today!
        $rebooked = $this->actingAs($otherCustomer)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-23T11:00',
            'party_size' => 2,
            'table_id' => $t1,
            'idempotency_key' => 'rebook-released-slot',
        ]);
        $rebooked->assertStatus(201);
        $rebookedId = (int) $rebooked->json('data.reservation.reservation_id');

        // 2. CONFIRMED reservation inside the 120-minute cutoff CANNOT be cancelled -> 409 CANCELLATION_CUTOFF_PASSED
        DB::table('reservations')->where('reservation_id', $rebookedId)->update([
            'reservation_status' => ReservationStatus::CONFIRMED,
            'confirmed_at' => '2026-11-23 10:00:00',
            'deposit_status' => 'paid',
            'deposit_amount' => '200.00',
        ]);

        $this->actingAs($otherCustomer)->postJson("/api/customer/reservations/{$rebookedId}/cancel")
            ->assertStatus(409)
            ->assertJsonPath('code', 'CANCELLATION_CUTOFF_PASSED');

        // 3. CONFIRMED reservation before the 120-minute cutoff CAN be cancelled, and deposit_status is NOT touched
        $futureConfirmed = $this->actingAs($customer)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-24T19:00',
            'party_size' => 4,
            'idempotency_key' => 'confirmed-future-cancel',
        ]);
        $futureId = (int) $futureConfirmed->json('data.reservation.reservation_id');
        DB::table('reservations')->where('reservation_id', $futureId)->update([
            'reservation_status' => ReservationStatus::CONFIRMED,
            'confirmed_at' => '2026-11-23 10:00:00',
            'deposit_status' => 'paid',
            'deposit_amount' => '200.00',
        ]);

        $this->actingAs($customer)->postJson("/api/customer/reservations/{$futureId}/cancel", [
            'reason' => 'Family emergency',
        ])
            ->assertStatus(200)
            ->assertJsonPath('data.reservation.reservation_status', 'cancelled')
            ->assertJsonPath('data.reservation.deposit_status', 'paid');

        // 4. LIST and DETAIL endpoints + cross-customer 404 isolation
        $listResp = $this->actingAs($customer)->getJson('/api/customer/reservations?tab=cancelled');
        $listResp->assertStatus(200)
            ->assertJsonCount(2, 'data.items')
            ->assertJsonPath('data.summary.cancelled_or_declined', 2);

        $detailResp = $this->actingAs($customer)->getJson("/api/customer/reservations/{$futureId}");
        $detailResp->assertStatus(200)
            ->assertJsonPath('data.reservation.reservation_id', $futureId)
            ->assertJsonCount(2, 'data.reservation.status_history');

        // Cross-customer detail & cancel -> 404
        $this->actingAs($otherCustomer)->getJson("/api/customer/reservations/{$futureId}")
            ->assertStatus(404);
        $this->actingAs($otherCustomer)->postJson("/api/customer/reservations/{$futureId}/cancel")
            ->assertStatus(404);
    }

    private function freezeManilaTime(string $dateTime): void
    {
        $manila = Carbon::parse($dateTime, 'Asia/Manila');
        Carbon::setTestNow($manila);
        CarbonImmutable::setTestNow(CarbonImmutable::instance($manila));
    }

    private function insertDailyOperatingHours(int $restaurantId, string $open, string $close): void
    {
        $rows = [];
        for ($dow = 0; $dow <= 6; $dow++) {
            $rows[] = [
                'restaurant_id' => $restaurantId,
                'day_of_week' => $dow,
                'opening_time' => $open,
                'closing_time' => $close,
                'closes_next_day' => 0,
                'is_closed' => 0,
            ];
        }
        DB::table('operating_hours')->insert($rows);
    }

    private function insertTable(
        int $restaurantId,
        string $name,
        int $capacity,
        int $minParty = 1,
        ?string $area = 'Indoor',
        bool $isActive = true,
    ): int {
        return (int) DB::table('restaurant_tables')->insertGetId([
            'restaurant_id' => $restaurantId,
            'table_name' => $name,
            'dining_area' => $area,
            'seating_capacity' => $capacity,
            'min_party_size' => $minParty,
            'is_active' => $isActive ? 1 : 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function createUser(
        string $email,
        string $firstName = 'Test',
        string $lastName = 'User',
        string $phone = '+63 917 123 4567',
    ): User {
        return User::create([
            'username' => 'user_' . substr(md5($email . uniqid()), 0, 14),
            'email' => $email,
            'password_hash' => Hash::make('Password123!'),
            'first_name' => $firstName,
            'last_name' => $lastName,
            'phone_number' => $phone,
            'user_role' => 'customer',
            'email_verified_at' => now(),
            'account_status' => 'active',
        ]);
    }

    private function createOwnerUser(int $restaurantId, string $email): User
    {
        $user = $this->createUser($email);
        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $user->user_id,
            'joined_at' => now(),
        ]);

        return $user;
    }

    private function createStaffUser(int $restaurantId, string $email, string $position): User
    {
        $user = $this->createUser($email);
        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $user->user_id,
            'staff_position' => $position,
            'staff_status' => 'active',
            'joined_at' => now(),
        ]);

        return $user;
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createRestaurant(array $overrides = []): int
    {
        $provinceId = (int) DB::table('provinces')->insertGetId(['province_name' => 'Metro Manila ' . uniqid()]);
        $cityId = (int) DB::table('cities')->insertGetId(['province_id' => $provinceId, 'city_name' => 'Quezon City ' . uniqid()]);
        $barangayId = (int) DB::table('barangays')->insertGetId(['city_id' => $cityId, 'barangay_name' => 'Diliman ' . uniqid()]);
        $addressId = (int) DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '123 Katipunan Ave',
            'postal_code' => '1108',
        ]);

        return (int) DB::table('restaurants')->insertGetId(array_merge([
            'restaurant_name' => 'Customer Booking Bistro ' . uniqid(),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'cust-booking-' . uniqid() . '@salo.local',
            'address_id' => $addressId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepts_reservations' => 1,
            'accepting_orders' => 1,
            'accepting_reservations' => 1,
            'restaurant_status' => 'active',
            'is_published' => 1,
        ], $overrides));
    }
}
