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

class OwnerReservationTest extends TestCase
{
    use DatabaseTransactions;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_full_lifecycle_happy_path_history_audit_and_notifications(): void
    {
        $this->freezeManilaTime('2026-11-23 10:00:00');
        $restaurantId = $this->createRestaurant(['reservation_deposit_required' => 0]);
        $owner = $this->createOwnerUser($restaurantId, 'own-life@salo.local');
        $customer = $this->createUser('cust-life@salo.local', 'Juan', 'Dela Cruz');
        $tableId = $this->insertTable($restaurantId, 'T-01', 4, 1, 'Indoor');

        $resId = $this->insertReservation(
            $restaurantId,
            $tableId,
            $customer->user_id,
            'SALO-RES-20261123-LF01',
            '2026-11-23 18:00:00',
            '2026-11-23 19:30:00',
            4,
            ReservationStatus::PENDING,
        );

        // 1. Approve -> confirmed (approved_at + confirmed_at set, customer notified)
        $approveResp = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$resId}/approve");
        $approveResp->assertStatus(200)
            ->assertJsonPath('data.reservation.reservation_status', 'confirmed');
        $this->assertNotNull($approveResp->json('data.reservation.approved_at'));
        $this->assertNotNull($approveResp->json('data.reservation.confirmed_at'));

        // Idempotent re-approve returns 200 without duplicate history or notification
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$resId}/approve")
            ->assertStatus(200)
            ->assertJsonPath('data.reservation.reservation_status', 'confirmed');
        $this->assertSame(
            1,
            DB::table('reservation_status_history')->where('reservation_id', $resId)->count()
        );

        // 2. Too early to mark arrived at 16:30 (> 60m before 18:00) -> 409 TOO_EARLY
        $this->freezeManilaTime('2026-11-23 16:30:00');
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$resId}/arrived")
            ->assertStatus(409)
            ->assertJsonPath('code', 'TOO_EARLY');

        // 3. Within window (17:45) -> arrived
        $this->freezeManilaTime('2026-11-23 17:45:00');
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$resId}/arrived")
            ->assertStatus(200)
            ->assertJsonPath('data.reservation.reservation_status', 'arrived');

        // 4. Seat at 18:00 (also test seating on another available table)
        $this->freezeManilaTime('2026-11-23 18:00:00');
        $table2Id = $this->insertTable($restaurantId, 'T-02', 4, 1, 'Terrace');
        $seatResp = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$resId}/seat", ['table_id' => $table2Id]);
        $seatResp->assertStatus(200)
            ->assertJsonPath('data.reservation.reservation_status', 'seated')
            ->assertJsonPath('data.reservation.table_id', $table2Id);

        // 5. Complete at 19:20 -> completed + customer notified
        $this->freezeManilaTime('2026-11-23 19:20:00');
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$resId}/complete")
            ->assertStatus(200)
            ->assertJsonPath('data.reservation.reservation_status', 'completed');

        // Verify history, audit logs, and notifications
        $this->assertSame(4, DB::table('reservation_status_history')->where('reservation_id', $resId)->count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'restaurant_reservation_approve', 'entity_id' => (string) $resId]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'restaurant_reservation_arrived', 'entity_id' => (string) $resId]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'restaurant_reservation_seat', 'entity_id' => (string) $resId]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'restaurant_reservation_complete', 'entity_id' => (string) $resId]);

        // Notifications: reservation_confirmed + reservation_completed only (arrived/seat emit none)
        $notifTypes = DB::table('notifications')
            ->where('user_id', $customer->user_id)
            ->where('workspace', 'customer')
            ->where('related_entity_id', $resId)
            ->orderBy('notification_id')
            ->pluck('type')
            ->all();
        $this->assertSame(['reservation_confirmed', 'reservation_completed'], $notifTypes);
    }

    public function test_deposit_path_reject_cancel_and_no_show_rules(): void
    {
        $this->freezeManilaTime('2026-11-23 10:00:00');
        $restaurantId = $this->createRestaurant([
            'reservation_deposit_required' => 1,
            'reservation_deposit_amount' => '400.00',
        ]);
        $owner = $this->createOwnerUser($restaurantId, 'own-dep@salo.local');
        $customer = $this->createUser('cust-dep@salo.local');
        $table1 = $this->insertTable($restaurantId, 'D-01', 4, 1, 'Indoor');
        $table2 = $this->insertTable($restaurantId, 'D-02', 4, 1, 'Indoor');

        // 1. Deposit path: approve -> awaiting_payment -> confirm-deposit -> confirmed + deposit_status='paid'
        $depResId = $this->insertReservation(
            $restaurantId,
            $table1,
            $customer->user_id,
            'SALO-RES-20261123-DP01',
            '2026-11-24 18:00:00',
            '2026-11-24 19:30:00',
            4,
            ReservationStatus::PENDING,
            '400.00',
            'pending',
        );

        $awaitResp = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$depResId}/approve");
        $awaitResp->assertStatus(200)
            ->assertJsonPath('data.reservation.reservation_status', 'awaiting_payment')
            ->assertJsonPath('data.reservation.deposit_status', 'pending')
            ->assertJsonPath('data.reservation.confirmed_at', null);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $customer->user_id,
            'type' => 'reservation_awaiting_payment',
            'related_entity_id' => $depResId,
        ]);

        $paidResp = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$depResId}/confirm-deposit");
        $paidResp->assertStatus(200)
            ->assertJsonPath('data.reservation.reservation_status', 'confirmed')
            ->assertJsonPath('data.reservation.deposit_status', 'paid');
        $this->assertNotNull($paidResp->json('data.reservation.confirmed_at'));

        // 2. Reject requires reason (422) and notifies customer with reason
        $rejResId = $this->insertReservation(
            $restaurantId,
            $table2,
            $customer->user_id,
            'SALO-RES-20261123-RJ01',
            '2026-11-25 18:00:00',
            '2026-11-25 19:30:00',
            2,
            ReservationStatus::PENDING,
        );

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$rejResId}/reject", ['reason' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['reason']);

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$rejResId}/reject", ['reason' => 'Private buyout'])
            ->assertStatus(200)
            ->assertJsonPath('data.reservation.reservation_status', 'rejected')
            ->assertJsonPath('data.reservation.rejection_reason', 'Private buyout');

        $rejNotif = DB::table('notifications')
            ->where('related_entity_id', $rejResId)
            ->where('type', 'reservation_rejected')
            ->first();
        $this->assertNotNull($rejNotif);
        $this->assertStringContainsString('Private buyout', (string) $rejNotif->body);

        // 3. Cancel by restaurant requires reason, leaves deposit_status untouched, notifies customer
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$depResId}/cancel", ['reason' => ''])
            ->assertStatus(422);

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$depResId}/cancel", ['reason' => 'Power outage'])
            ->assertStatus(200)
            ->assertJsonPath('data.reservation.reservation_status', 'cancelled')
            ->assertJsonPath('data.reservation.cancelled_by', 'restaurant')
            ->assertJsonPath('data.reservation.deposit_status', 'paid');

        // 4. No-show: too early -> 409 NO_SHOW_TOO_EARLY; after 15m grace -> no_show with both columns set
        $nsResId = $this->insertReservation(
            $restaurantId,
            $table1,
            $customer->user_id,
            'SALO-RES-20261123-NS01',
            '2026-11-23 12:00:00',
            '2026-11-23 13:30:00',
            2,
            ReservationStatus::CONFIRMED,
        );

        $this->freezeManilaTime('2026-11-23 12:10:00'); // < 12:15
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$nsResId}/no-show")
            ->assertStatus(409)
            ->assertJsonPath('code', 'NO_SHOW_TOO_EARLY');

        $this->freezeManilaTime('2026-11-23 12:16:00'); // >= 12:15
        $nsResp = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$nsResId}/no-show");
        $nsResp->assertStatus(200)
            ->assertJsonPath('data.reservation.reservation_status', 'no_show')
            ->assertJsonPath('data.reservation.no_show_marked_by', $owner->user_id);
        $this->assertNotNull($nsResp->json('data.reservation.no_show_marked_at'));
    }

    public function test_approve_guards_table_reassignment_and_invalid_transitions(): void
    {
        $this->freezeManilaTime('2026-11-23 10:00:00');
        $restaurantId = $this->createRestaurant(['reservation_pending_expiry_minutes' => 60]);
        $owner = $this->createOwnerUser($restaurantId, 'own-grd@salo.local');
        $customer1 = $this->createUser('g-c1@salo.local');
        $customer2 = $this->createUser('g-c2@salo.local');

        $t1 = $this->insertTable($restaurantId, 'G-01', 4, 2, 'Indoor', true);
        $t2 = $this->insertTable($restaurantId, 'G-02', 4, 2, 'Terrace', true);
        $tSmall = $this->insertTable($restaurantId, 'G-03', 2, 1, 'Indoor', true);
        $tArchived = $this->insertTable($restaurantId, 'G-04', 4, 1, 'Indoor', false);

        // 1. Approve past pending reservation -> swept to expired -> 409 RESERVATION_EXPIRED
        $pastId = $this->insertReservation(
            $restaurantId,
            $t1,
            $customer1->user_id,
            'SALO-RES-20261123-PS01',
            '2026-11-23 09:00:00',
            '2026-11-23 10:30:00',
            2,
            ReservationStatus::PENDING,
        );
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$pastId}/approve")
            ->assertStatus(409)
            ->assertJsonPath('code', 'RESERVATION_EXPIRED');

        // 2a. Expired pending (2h ago > 60m expiry) -> lazy sweep returns 409 RESERVATION_EXPIRED
        $expiredPendingId = $this->insertReservation(
            $restaurantId,
            $t1,
            $customer1->user_id,
            'SALO-RES-20261123-EXP1',
            '2026-11-24 18:00:00',
            '2026-11-24 19:30:00',
            4,
            ReservationStatus::PENDING,
            '0.00',
            'none',
            '2026-11-23 08:00:00', // 2h ago > 60m expiry
        );
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$expiredPendingId}/approve")
            ->assertStatus(409)
            ->assertJsonPath('code', 'RESERVATION_EXPIRED');
        $this->assertDatabaseHas('reservations', [
            'reservation_id' => $expiredPendingId,
            'reservation_status' => ReservationStatus::EXPIRED,
        ]);

        // 2b. Active pending whose table was taken by a confirmed booking -> 409 SLOT_TAKEN
        $stalePendingId = $this->insertReservation(
            $restaurantId,
            $t1,
            $customer1->user_id,
            'SALO-RES-20261123-ST01',
            '2026-11-24 18:00:00',
            '2026-11-24 19:30:00',
            4,
            ReservationStatus::PENDING,
            '0.00',
            'none',
            '2026-11-23 09:30:00', // 30m ago < 60m expiry
        );
        $this->insertReservation(
            $restaurantId,
            $t1,
            $customer2->user_id,
            'SALO-RES-20261123-CF02',
            '2026-11-24 18:00:00',
            '2026-11-24 19:30:00',
            4,
            ReservationStatus::CONFIRMED,
        );

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$stalePendingId}/approve")
            ->assertStatus(409)
            ->assertJsonPath('code', 'SLOT_TAKEN');

        // 3. Reassign table: too small or archived -> TABLE_UNAVAILABLE; valid t2 (Terrace != Indoor) -> 200 + notification
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->patchJson("/api/restaurant/reservations/{$stalePendingId}/table", ['table_id' => $tSmall])
            ->assertStatus(409)
            ->assertJsonPath('code', 'TABLE_UNAVAILABLE');

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->patchJson("/api/restaurant/reservations/{$stalePendingId}/table", ['table_id' => $tArchived])
            ->assertStatus(409)
            ->assertJsonPath('code', 'TABLE_UNAVAILABLE');

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->patchJson("/api/restaurant/reservations/{$stalePendingId}/table", ['table_id' => $t2])
            ->assertStatus(200)
            ->assertJsonPath('data.reservation.table_id', $t2);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $customer1->user_id,
            'type' => 'reservation_table_changed',
            'related_entity_id' => $stalePendingId,
        ]);

        // Now approve succeeds!
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$stalePendingId}/approve")
            ->assertStatus(200)
            ->assertJsonPath('data.reservation.reservation_status', 'confirmed');

        // Cannot complete from confirmed (must be seated) -> 409 INVALID_TRANSITION
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$stalePendingId}/complete")
            ->assertStatus(409)
            ->assertJsonPath('code', 'INVALID_TRANSITION');
    }

    public function test_list_calendar_attention_allowed_actions_and_rbac_matrix(): void
    {
        $this->freezeManilaTime('2026-11-23 18:20:00');
        $restaurantA = $this->createRestaurant(['reservation_pending_expiry_minutes' => 120]);
        $restaurantB = $this->createRestaurant();

        $ownerA = $this->createOwnerUser($restaurantA, 'rb-own-a@salo.local');
        $ownerB = $this->createOwnerUser($restaurantB, 'rb-own-b@salo.local');
        $resHandler = $this->createStaffUser($restaurantA, 'rb-res@salo.local', 'Reservation Handler');
        $orderStaff = $this->createStaffUser($restaurantA, 'rb-ord@salo.local', 'Order Staff');
        $customer = $this->createUser('rb-cust@salo.local');

        $tA = $this->insertTable($restaurantA, 'R-01', 4, 1, 'Indoor');

        // Expiring pending (created 100m ago with 120m expiry -> within 30m warning)
        $expPendingId = $this->insertReservation(
            $restaurantA,
            $tA,
            $customer->user_id,
            'SALO-RES-20261123-EX01',
            '2026-11-23 20:00:00',
            '2026-11-23 21:30:00',
            2,
            ReservationStatus::PENDING,
            '0.00',
            'none',
            '2026-11-23 16:40:00',
        );

        // No-show candidate (confirmed at 18:00, now 18:20 >= 18:15)
        $nsCandidateId = $this->insertReservation(
            $restaurantA,
            $tA,
            $customer->user_id,
            'SALO-RES-20261123-NC01',
            '2026-11-23 18:00:00',
            '2026-11-23 19:30:00',
            2,
            ReservationStatus::CONFIRMED,
        );

        // List + bounded constant query count check (independent of row count)
        DB::flushQueryLog();
        DB::enableQueryLog();
        $listResp = $this->actingAs($resHandler)
            ->withHeader('X-Restaurant-Id', (string) $restaurantA)
            ->getJson('/api/restaurant/reservations?date=2026-11-23');
        $queryCount = count(DB::getQueryLog());
        $this->assertLessThanOrEqual(14, $queryCount, "Expected bounded O(1) query count, got {$queryCount}.");

        $listResp->assertStatus(200)
            ->assertJsonPath('data.summary.total', 2)
            ->assertJsonPath('data.summary.pending', 1)
            ->assertJsonPath('data.summary.confirmed', 1)
            ->assertJsonPath('data.summary.expected_covers', 4);

        $byId = collect($listResp->json('data.items'))->keyBy('reservation_id');
        $this->assertSame('pending_expiring', $byId[$expPendingId]['attention']);
        $this->assertContains('approve', $byId[$expPendingId]['allowed_actions']);
        $this->assertSame('no_show_candidate', $byId[$nsCandidateId]['attention']);
        $this->assertContains('no_show', $byId[$nsCandidateId]['allowed_actions']);

        // Calendar endpoint
        $this->actingAs($ownerA)
            ->withHeader('X-Restaurant-Id', (string) $restaurantA)
            ->getJson('/api/restaurant/reservations/calendar?month=2026-11')
            ->assertStatus(200)
            ->assertJsonPath('data.month', '2026-11');

        // Order Staff -> 403; Customer -> 403; Cross-tenant Owner B -> 404
        $this->actingAs($orderStaff)
            ->withHeader('X-Restaurant-Id', (string) $restaurantA)
            ->getJson('/api/restaurant/reservations')
            ->assertStatus(403);

        $this->actingAs($customer)
            ->getJson('/api/restaurant/reservations')
            ->assertStatus(403);

        $this->actingAs($ownerB)
            ->withHeader('X-Restaurant-Id', (string) $restaurantB)
            ->getJson("/api/restaurant/reservations/{$expPendingId}")
            ->assertStatus(404);

        $this->actingAs($ownerB)
            ->withHeader('X-Restaurant-Id', (string) $restaurantB)
            ->postJson("/api/restaurant/reservations/{$expPendingId}/approve")
            ->assertStatus(404);
    }

    private function freezeManilaTime(string $dateTime): void
    {
        $manila = Carbon::parse($dateTime, 'Asia/Manila');
        Carbon::setTestNow($manila);
        CarbonImmutable::setTestNow(CarbonImmutable::instance($manila));
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

    private function insertReservation(
        int $restaurantId,
        int $tableId,
        int $customerId,
        string $reference,
        string $start,
        string $end,
        int $guests,
        string $status,
        string $depositAmount = '0.00',
        string $depositStatus = 'none',
        ?string $createdAt = null,
    ): int {
        return (int) DB::table('reservations')->insertGetId([
            'reservation_reference' => $reference,
            'customer_id' => $customerId,
            'restaurant_id' => $restaurantId,
            'table_id' => $tableId,
            'contact_name' => 'Guest Name',
            'contact_phone' => '+63 917 000 0000',
            'reservation_start' => $start,
            'reservation_end' => $end,
            'number_of_guests' => $guests,
            'reservation_status' => $status,
            'deposit_amount' => $depositAmount,
            'deposit_status' => $depositStatus,
            'created_at' => $createdAt ?? now('Asia/Manila')->format('Y-m-d H:i:s'),
            'updated_at' => $createdAt ?? now('Asia/Manila')->format('Y-m-d H:i:s'),
        ]);
    }

    private function createUser(
        string $email,
        string $firstName = 'Test',
        string $lastName = 'User',
    ): User {
        return User::create([
            'username' => 'user_' . substr(md5($email . uniqid()), 0, 14),
            'email' => $email,
            'password_hash' => Hash::make('Password123!'),
            'first_name' => $firstName,
            'last_name' => $lastName,
            'phone_number' => '+63 917 123 4567',
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
            'restaurant_name' => 'Owner Reservation Bistro ' . uniqid(),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'own-res-' . uniqid() . '@salo.local',
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
