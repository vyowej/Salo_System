<?php

namespace Tests\Feature;

use App\Features\Reservations\Support\ReservationStatus;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ReservationEndToEndVerificationTest extends TestCase
{
    use DatabaseTransactions;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_workflow_1_customer_discovery_availability_and_booking(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 10, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [, , , $cust1, $cust2, $restaurantId, $t1Id] = $this->seedFullEnvironment();

        $this->getJson("/api/restaurants/{$restaurantId}/reservation-info")
            ->assertOk()
            ->assertJsonPath('data.can_reserve', true)
            ->assertJsonPath('data.reservation_deposit_required', true)
            ->assertJsonPath('data.reservation_deposit_amount', '300.00');

        $this->getJson("/api/restaurants/{$restaurantId}/reservation-availability?date=2026-11-24&party_size=2")
            ->assertOk()
            ->assertJsonPath('data.bookable', true);

        $this->getJson("/api/restaurants/{$restaurantId}/reservation-availability/tables?start=2026-11-24T18:00&party_size=2")
            ->assertOk()
            ->assertJsonPath('data.bookable', true)
            ->assertJsonCount(2, 'data.available_tables');

        $created = $this->actingAs($cust1)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-24T18:00',
            'party_size' => 2,
            'table_id' => $t1Id,
            'contact_name' => 'Juan E2E',
            'contact_phone' => '09171234567',
            'special_requests' => 'Window seat please',
            'idempotency_key' => 'e2e-w1-key-'.random_int(1000, 9999),
        ])->assertStatus(201);

        $resId = (int) $created->json('data.reservation.reservation_id');
        $ref = (string) $created->json('data.reservation.reservation_reference');
        $this->assertMatchesRegularExpression('/^SALO-RES-\d{8}-[A-Z0-9]{4}$/', $ref);

        $this->actingAs($cust1)->getJson("/api/customer/reservations/{$resId}")->assertOk();
        $this->actingAs($cust2)->getJson("/api/customer/reservations/{$resId}")->assertStatus(404);
    }

    public function test_workflow_2_duplicate_booking_idempotency_and_payload_mismatch(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 10, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [, , , $cust1, , $restaurantId, $t1Id] = $this->seedFullEnvironment();

        $bookPayload = [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-24T18:00',
            'party_size' => 2,
            'table_id' => $t1Id,
            'contact_name' => 'Juan E2E',
            'contact_phone' => '09171234567',
            'special_requests' => 'Window seat please',
            'idempotency_key' => 'e2e-w2-key-'.random_int(1000, 9999),
        ];

        $created = $this->actingAs($cust1)->postJson('/api/customer/reservations', $bookPayload)->assertStatus(201);
        $resId = (int) $created->json('data.reservation.reservation_id');

        $replay = $this->actingAs($cust1)->postJson('/api/customer/reservations', $bookPayload)->assertStatus(201);
        $this->assertSame($resId, (int) $replay->json('data.reservation.reservation_id'));

        $this->actingAs($cust1)->postJson('/api/customer/reservations', array_merge($bookPayload, ['party_size' => 4]))
            ->assertStatus(409)
            ->assertJsonPath('code', 'IDEMPOTENCY_KEY_REUSED');
    }

    public function test_workflow_3_restaurant_management_lifecycle_and_staff_rbac(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 10, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [$owner, $handlerStaff, $unpermittedStaff, $cust1, , $restaurantId, $t1Id, $t2Id] = $this->seedFullEnvironment();

        $created = $this->actingAs($cust1)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-24T18:00',
            'party_size' => 2,
            'table_id' => $t1Id,
            'idempotency_key' => 'e2e-w3-key-'.random_int(1000, 9999),
        ])->assertStatus(201);
        $resId = (int) $created->json('data.reservation.reservation_id');

        $this->actingAs($unpermittedStaff)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$resId}/approve")
            ->assertStatus(403);

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$resId}/approve")
            ->assertOk()
            ->assertJsonPath('data.reservation.reservation_status', ReservationStatus::AWAITING_PAYMENT);

        $this->actingAs($handlerStaff)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$resId}/deposit", [
                'deposit_status' => 'paid',
                'note' => 'Settled via cash',
            ])
            ->assertOk()
            ->assertJsonPath('data.reservation.reservation_status', ReservationStatus::CONFIRMED)
            ->assertJsonPath('data.reservation.deposit_status', 'paid');

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->patchJson("/api/restaurant/reservations/{$resId}/table", ['table_id' => $t2Id])
            ->assertOk()
            ->assertJsonPath('data.reservation.table_id', $t2Id);

        $this->assertDatabaseHas('notifications', [
            'related_entity_id' => $resId,
            'type' => 'reservation_table_changed',
        ]);

        $arrivalTime = CarbonImmutable::create(2026, 11, 24, 17, 45, 0, 'Asia/Manila');
        Carbon::setTestNow($arrivalTime);
        CarbonImmutable::setTestNow($arrivalTime);

        $this->actingAs($handlerStaff)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$resId}/arrived")
            ->assertOk()
            ->assertJsonPath('data.reservation.reservation_status', ReservationStatus::ARRIVED);

        $this->actingAs($handlerStaff)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$resId}/seat")
            ->assertOk()
            ->assertJsonPath('data.reservation.reservation_status', ReservationStatus::SEATED);

        $this->actingAs($handlerStaff)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/reservations/{$resId}/complete")
            ->assertOk()
            ->assertJsonPath('data.reservation.reservation_status', ReservationStatus::COMPLETED);
    }

    public function test_workflow_4_customer_cancellation_before_and_inside_cutoff(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 10, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [, , , , $cust2, $restaurantId, $t1Id] = $this->seedFullEnvironment();

        $cancelRes = $this->actingAs($cust2)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-25T18:00',
            'party_size' => 2,
            'table_id' => $t1Id,
            'idempotency_key' => 'e2e-w4-cancel-'.random_int(1000, 9999),
        ])->assertStatus(201);
        $cancelId = (int) $cancelRes->json('data.reservation.reservation_id');

        $this->actingAs($cust2)->postJson("/api/customer/reservations/{$cancelId}/cancel", [
            'reason' => 'Change of plans',
        ])->assertOk()
            ->assertJsonPath('data.reservation.reservation_status', ReservationStatus::CANCELLED)
            ->assertJsonPath('data.reservation.cancelled_by', 'customer');

        $cutoffRes = $this->actingAs($cust2)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-26T18:00',
            'party_size' => 2,
            'table_id' => $t1Id,
            'idempotency_key' => 'e2e-w4-cut-'.random_int(1000, 9999),
        ])->assertStatus(201);
        $cutoffId = (int) $cutoffRes->json('data.reservation.reservation_id');
        DB::table('reservations')->where('reservation_id', $cutoffId)->update([
            'reservation_status' => ReservationStatus::CONFIRMED,
        ]);

        $insideCutoff = CarbonImmutable::create(2026, 11, 26, 17, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($insideCutoff);
        CarbonImmutable::setTestNow($insideCutoff);

        $this->actingAs($cust2)->postJson("/api/customer/reservations/{$cutoffId}/cancel")
            ->assertStatus(409)
            ->assertJsonPath('code', 'CANCELLATION_CUTOFF_PASSED');
    }

    public function test_workflow_5_table_management_and_archive_guards(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 10, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [$owner, , , $cust1, , $restaurantId, $t1Id] = $this->seedFullEnvironment();

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson('/api/restaurant/tables', [
                'table_name' => 'VIP-9',
                'seating_capacity' => 2,
                'min_party_size' => 4,
            ])
            ->assertStatus(422);

        $newTableRes = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson('/api/restaurant/tables', [
                'table_name' => 'VIP-1',
                'seating_capacity' => 6,
                'min_party_size' => 2,
                'dining_area' => 'VIP Room',
            ])
            ->assertStatus(201);
        $vipTableId = (int) $newTableRes->json('data.table.table_id');

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->patchJson("/api/restaurant/tables/{$vipTableId}", ['seating_capacity' => 8])
            ->assertOk()
            ->assertJsonPath('data.table.seating_capacity', 8);

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/tables/{$vipTableId}/archive")
            ->assertOk()
            ->assertJsonPath('data.table.is_active', false);

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/tables/{$vipTableId}/reactivate")
            ->assertOk()
            ->assertJsonPath('data.table.is_active', true);

        $this->actingAs($cust1)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-24T18:00',
            'party_size' => 2,
            'table_id' => $t1Id,
            'idempotency_key' => 'e2e-w5-lock-'.random_int(1000, 9999),
        ])->assertStatus(201);

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/tables/{$t1Id}/archive")
            ->assertStatus(409);
    }

    public function test_workflow_6_availability_custom_duration_and_booking_conflicts(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 10, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [$owner, , , $cust1, $cust2, $restaurantId, $t1Id] = $this->seedFullEnvironment();

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->patchJson('/api/restaurant/settings', ['reservation_duration_minutes' => 120])
            ->assertOk();

        $this->actingAs($cust1)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-24T18:00',
            'party_size' => 2,
            'table_id' => $t1Id,
            'idempotency_key' => 'e2e-w6-b1-'.random_int(1000, 9999),
        ])->assertStatus(201)
            ->assertJsonPath('data.reservation.duration_minutes', 120);

        $this->actingAs($cust2)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-24T19:00',
            'party_size' => 2,
            'table_id' => $t1Id,
            'idempotency_key' => 'e2e-w6-overlap-'.random_int(1000, 9999),
        ])->assertStatus(409)
            ->assertJsonPath('code', 'SLOT_TAKEN');

        $this->actingAs($cust2)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-24T20:00',
            'party_size' => 2,
            'table_id' => $t1Id,
            'idempotency_key' => 'e2e-w6-nonoverlap-'.random_int(1000, 9999),
        ])->assertStatus(201);
    }

    public function test_workflow_7_admin_monitoring_and_rbac(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 10, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [, , , $cust1, $cust2, $restaurantId, $t1Id] = $this->seedFullEnvironment();
        $admin = $this->createUser('e2e_admin@salo.local', 'admin');

        $b1 = $this->actingAs($cust1)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-24T18:00',
            'party_size' => 2,
            'table_id' => $t1Id,
            'idempotency_key' => 'e2e-w7-b1-'.random_int(1000, 9999),
        ])->assertStatus(201);
        $b1Id = (int) $b1->json('data.reservation.reservation_id');

        $this->actingAs($cust2)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-24T20:00',
            'party_size' => 2,
            'table_id' => $t1Id,
            'idempotency_key' => 'e2e-w7-b2-'.random_int(1000, 9999),
        ])->assertStatus(201);

        $this->actingAs($cust1)->getJson('/api/admin/reservations')->assertStatus(403);
        $this->actingAs($admin)->getJson('/api/admin/reservations?restaurant_id='.$restaurantId)
            ->assertOk()
            ->assertJsonPath('data.meta.total', 2);
        $this->actingAs($admin)->getJson("/api/admin/reservations/stats?restaurant_id={$restaurantId}&date_from=2026-11-23&date_to=2026-11-25")
            ->assertOk()
            ->assertJsonPath('data.totals.total', 2);
        $this->actingAs($admin)->getJson("/api/admin/reservations/{$b1Id}")
            ->assertOk()
            ->assertJsonPath('data.reservation.can_admin_cancel', false);
    }

    public function test_workflow_8_scheduled_expiry_releases_table_slot(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 10, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [, , , $cust1, $cust2, $restaurantId, $t1Id, $t2Id] = $this->seedFullEnvironment();

        $b1 = $this->actingAs($cust1)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-24T18:00',
            'party_size' => 2,
            'table_id' => $t1Id,
            'idempotency_key' => 'e2e-w8-b1-'.random_int(1000, 9999),
        ])->assertStatus(201);
        $b1Id = (int) $b1->json('data.reservation.reservation_id');

        $afterExpiry = $now->addHours(3);
        Carbon::setTestNow($afterExpiry);
        CarbonImmutable::setTestNow($afterExpiry);

        Artisan::call('salo:expire-stale-reservations', ['--restaurant' => $restaurantId]);
        $this->assertSame(ReservationStatus::EXPIRED, DB::table('reservations')->where('reservation_id', $b1Id)->value('reservation_status'));

        $this->actingAs($cust2)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-24T18:00',
            'party_size' => 2,
            'table_id' => $t1Id,
            'idempotency_key' => 'e2e-w8-rebook-'.random_int(1000, 9999),
        ])->assertStatus(201);
        $this->assertNotNull($t2Id);
    }

    /**
     * @return array{0: User, 1: User, 2: User, 3: User, 4: User, 5: int, 6: int, 7: int}
     */
    private function seedFullEnvironment(): array
    {
        $owner = $this->createUser('e2e_own_'.random_int(100, 999).'@salo.local');
        $handlerStaff = $this->createUser('e2e_stf_'.random_int(100, 999).'@salo.local');
        $unpermittedStaff = $this->createUser('e2e_nop_'.random_int(100, 999).'@salo.local');
        $cust1 = $this->createUser('e2e_c1_'.random_int(100, 999).'@salo.local');
        $cust2 = $this->createUser('e2e_c2_'.random_int(100, 999).'@salo.local');

        $barangayId = (int) DB::table('barangays')->value('barangay_id');
        $addressId = DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '100 E2E Blvd',
            'postal_code' => '1000',
        ]);

        $restaurantId = DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'E2E Grand Kitchen '.random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'e2e_'.random_int(1000, 9999).'@salo.local',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
            'offers_dine_in' => 1,
            'accepts_reservations' => 1,
            'accepting_reservations' => 1,
            'is_published' => 1,
            'reservation_min_notice_hours' => 2,
            'reservation_max_party_size' => 8,
            'reservation_duration_minutes' => 90,
            'reservation_max_advance_days' => 30,
            'reservation_cancellation_cutoff_minutes' => 120,
            'reservation_pending_expiry_minutes' => 120,
            'reservation_auto_confirm' => 0,
            'reservation_deposit_required' => 1,
            'reservation_deposit_amount' => '300.00',
            'reservation_service_fee' => '25.00',
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
        ]);

        DB::table('restaurant_staff')->insert([
            ['restaurant_id' => $restaurantId, 'user_id' => $handlerStaff->user_id, 'staff_position' => 'Reservation Handler', 'staff_status' => 'active'],
            ['restaurant_id' => $restaurantId, 'user_id' => $unpermittedStaff->user_id, 'staff_position' => 'Inventory Manager', 'staff_status' => 'active'],
        ]);

        for ($d = 0; $d < 7; $d++) {
            DB::table('operating_hours')->insert([
                'restaurant_id' => $restaurantId,
                'day_of_week' => $d,
                'opening_time' => '10:00:00',
                'closing_time' => '23:00:00',
                'closes_next_day' => 0,
                'is_closed' => 0,
            ]);
        }

        $t1Id = DB::table('restaurant_tables')->insertGetId([
            'restaurant_id' => $restaurantId,
            'table_name' => 'T1',
            'dining_area' => 'Indoor',
            'seating_capacity' => 4,
            'min_party_size' => 1,
            'is_active' => 1,
        ]);

        $t2Id = DB::table('restaurant_tables')->insertGetId([
            'restaurant_id' => $restaurantId,
            'table_name' => 'T2',
            'dining_area' => 'Terrace',
            'seating_capacity' => 4,
            'min_party_size' => 1,
            'is_active' => 1,
        ]);

        return [$owner, $handlerStaff, $unpermittedStaff, $cust1, $cust2, $restaurantId, $t1Id, $t2Id];
    }

    private function createUser(string $email, string $role = 'customer'): User
    {
        return User::create([
            'username' => explode('@', $email)[0].'_'.random_int(100, 999),
            'first_name' => 'E2E',
            'last_name' => 'User',
            'email' => $email,
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }
}
