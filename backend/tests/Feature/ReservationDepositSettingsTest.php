<?php

namespace Tests\Feature;

use App\Features\Reservations\Support\ReservationStatus;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ReservationDepositSettingsTest extends TestCase
{
    use DatabaseTransactions;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function invalidSettingsProvider(): array
    {
        return [
            'duration not multiple of 15' => [
                ['reservation_duration_minutes' => 40],
                'reservation_duration_minutes',
            ],
            'duration below 30' => [
                ['reservation_duration_minutes' => 15],
                'reservation_duration_minutes',
            ],
            'duration above 240' => [
                ['reservation_duration_minutes' => 255],
                'reservation_duration_minutes',
            ],
            'max advance days above 365' => [
                ['reservation_max_advance_days' => 366],
                'reservation_max_advance_days',
            ],
            'pending expiry below 15' => [
                ['reservation_pending_expiry_minutes' => 14],
                'reservation_pending_expiry_minutes',
            ],
            'deposit required without positive amount' => [
                ['reservation_deposit_required' => true, 'reservation_deposit_amount' => 0],
                'reservation_deposit_amount',
            ],
            'deposit required with auto confirm' => [
                ['reservation_deposit_required' => true, 'reservation_deposit_amount' => 300, 'reservation_auto_confirm' => true],
                'reservation_auto_confirm',
            ],
            'min notice exceeds max advance window' => [
                ['reservation_max_advance_days' => 1, 'reservation_min_notice_hours' => 25],
                'reservation_min_notice_hours',
            ],
        ];
    }

    public function test_owner_settings_rejects_unauthenticated_and_non_owner_staff(): void
    {
        [, $staff, $restaurantId] = $this->seedRestaurantWithStaff();

        $this->getJson('/api/restaurant/settings')->assertStatus(401);
        $this->actingAs($staff)->getJson('/api/restaurant/settings?restaurant_id='.$restaurantId)->assertStatus(403);
        $this->actingAs($staff)->patchJson('/api/restaurant/settings', [
            'restaurant_id' => $restaurantId,
            'reservation_duration_minutes' => 60,
        ])->assertStatus(403);
    }

    public function test_owner_settings_get_returns_default_reservation_fields(): void
    {
        [$owner, , $restaurantId] = $this->seedRestaurantWithStaff();

        $this->actingAs($owner)
            ->getJson('/api/restaurant/settings?restaurant_id='.$restaurantId)
            ->assertOk()
            ->assertJsonPath('data.profile.reservation_duration_minutes', 90)
            ->assertJsonPath('data.profile.reservation_max_advance_days', 30)
            ->assertJsonPath('data.profile.reservation_cancellation_cutoff_minutes', 120)
            ->assertJsonPath('data.profile.reservation_pending_expiry_minutes', 120)
            ->assertJsonPath('data.profile.reservation_auto_confirm', false)
            ->assertJsonPath('data.profile.reservation_deposit_required', false);
    }

    /**
     * @param array<string, mixed> $payload
     */
    #[DataProvider('invalidSettingsProvider')]
    public function test_owner_settings_patch_rejects_invalid_values(array $payload, string $errorField): void
    {
        [$owner, , $restaurantId] = $this->seedRestaurantWithStaff();

        $this->actingAs($owner)
            ->patchJson('/api/restaurant/settings', array_merge(['restaurant_id' => $restaurantId], $payload))
            ->assertStatus(422)
            ->assertJsonValidationErrors([$errorField]);
    }

    public function test_owner_settings_patch_updates_fields_and_writes_audit_log(): void
    {
        [$owner, , $restaurantId] = $this->seedRestaurantWithStaff();

        $this->actingAs($owner)->patchJson('/api/restaurant/settings', [
            'restaurant_id' => $restaurantId,
            'reservation_duration_minutes' => 120,
            'reservation_max_advance_days' => 60,
            'reservation_cancellation_cutoff_minutes' => 180,
            'reservation_pending_expiry_minutes' => 90,
            'reservation_deposit_required' => true,
            'reservation_deposit_amount' => 500.50,
            'reservation_service_fee' => 25.00,
            'reservation_auto_confirm' => false,
        ])->assertOk()
            ->assertJsonPath('data.profile.reservation_duration_minutes', 120)
            ->assertJsonPath('data.profile.reservation_deposit_required', true)
            ->assertJsonPath('data.profile.reservation_deposit_amount', 500.5)
            ->assertJsonPath('data.profile.reservation_service_fee', 25);

        $audit = DB::table('audit_logs')
            ->where('action', 'owner_settings_updated')
            ->where('entity_id', $restaurantId)
            ->latest('created_at')
            ->first();
        $this->assertNotNull($audit);
        $oldVals = json_decode((string) $audit->old_values, true);
        $newVals = json_decode((string) $audit->new_values, true);
        $this->assertSame(90, $oldVals['reservation_duration_minutes']);
        $this->assertSame(120, $newVals['reservation_duration_minutes']);
    }

    public function test_deposit_required_restaurant_never_auto_confirms_and_preserves_existing_snapshots(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 10, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [$owner, , $restaurantId] = $this->seedRestaurantWithStaff();
        $customer = $this->createUser('cust_snap@salo.local');

        DB::table('restaurants')->where('restaurant_id', $restaurantId)->update([
            'reservation_auto_confirm' => 1,
            'reservation_deposit_required' => 1,
            'reservation_deposit_amount' => '250.00',
            'reservation_service_fee' => '30.00',
            'reservation_duration_minutes' => 90,
        ]);

        $firstBooking = $this->actingAs($customer)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-24T18:00',
            'party_size' => 2,
            'idempotency_key' => 'snap-test-1-'.random_int(1000, 9999),
        ])->assertStatus(201);

        $firstBooking
            ->assertJsonPath('data.reservation.reservation_status', ReservationStatus::PENDING)
            ->assertJsonPath('data.reservation.deposit_amount', '250.00')
            ->assertJsonPath('data.reservation.deposit_status', 'pending')
            ->assertJsonPath('data.reservation.service_fee', '30.00');
        $firstId = (int) $firstBooking->json('data.reservation.reservation_id');

        $this->actingAs($owner)->patchJson('/api/restaurant/settings', [
            'restaurant_id' => $restaurantId,
            'reservation_deposit_required' => false,
            'reservation_deposit_amount' => 0,
            'reservation_service_fee' => 75,
            'reservation_duration_minutes' => 120,
            'reservation_auto_confirm' => true,
        ])->assertOk();

        $this->getJson("/api/restaurants/{$restaurantId}/reservation-info")
            ->assertOk()
            ->assertJsonPath('data.reservation_deposit_required', false)
            ->assertJsonPath('data.reservation_duration_minutes', 120)
            ->assertJsonPath('data.reservation_auto_confirm', true);

        $existing = DB::table('reservations')->where('reservation_id', $firstId)->first();
        $this->assertSame('250.00', $existing->deposit_amount);
        $this->assertSame('30.00', $existing->service_fee);

        $secondBooking = $this->actingAs($customer)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-25T18:00',
            'party_size' => 2,
            'idempotency_key' => 'snap-test-2-'.random_int(1000, 9999),
        ])->assertStatus(201);

        $secondBooking
            ->assertJsonPath('data.reservation.reservation_status', ReservationStatus::CONFIRMED)
            ->assertJsonPath('data.reservation.deposit_status', 'none')
            ->assertJsonPath('data.reservation.service_fee', '75.00');
    }

    public function test_deposit_endpoint_rejects_cross_tenant_and_unpermitted_staff(): void
    {
        [$owner, , $restaurantId] = $this->seedRestaurantWithStaff();
        [, , $otherRestaurantId] = $this->seedRestaurantWithStaff();
        $customer = $this->createUser('cust_dep_rbac@salo.local');

        $awaitingId = $this->insertReservation($restaurantId, $customer->user_id, ReservationStatus::AWAITING_PAYMENT, 'pending', '500.00');
        $otherResId = $this->insertReservation($otherRestaurantId, $customer->user_id, ReservationStatus::CONFIRMED, 'pending', '200.00');

        $this->actingAs($owner)->postJson("/api/restaurant/reservations/{$otherResId}/deposit", [
            'restaurant_id' => $restaurantId,
            'deposit_status' => 'paid',
        ])->assertStatus(404);

        $kitchenStaff = $this->createUser('staff_k@salo.local');
        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $kitchenStaff->user_id,
            'staff_position' => 'Inventory Manager',
            'staff_status' => 'active',
        ]);

        $this->actingAs($kitchenStaff)->postJson("/api/restaurant/reservations/{$awaitingId}/deposit", [
            'restaurant_id' => $restaurantId,
            'deposit_status' => 'paid',
        ])->assertStatus(403);
    }

    public function test_deposit_endpoint_rejects_reservation_without_deposit(): void
    {
        [$owner, , $restaurantId] = $this->seedRestaurantWithStaff();
        $customer = $this->createUser('cust_nodep@salo.local');
        $noDepositId = $this->insertReservation($restaurantId, $customer->user_id, ReservationStatus::CONFIRMED, 'none', '0.00');

        $this->actingAs($owner)->postJson("/api/restaurant/reservations/{$noDepositId}/deposit", [
            'restaurant_id' => $restaurantId,
            'deposit_status' => 'paid',
        ])->assertStatus(409)->assertJsonPath('code', 'NO_DEPOSIT');
    }

    public function test_deposit_endpoint_marks_awaiting_payment_paid_and_is_idempotent(): void
    {
        [$owner, $staff, $restaurantId] = $this->seedRestaurantWithStaff();
        $customer = $this->createUser('cust_paid@salo.local');
        $awaitingId = $this->insertReservation($restaurantId, $customer->user_id, ReservationStatus::AWAITING_PAYMENT, 'pending', '500.00');

        $this->actingAs($staff)->postJson("/api/restaurant/reservations/{$awaitingId}/deposit", [
            'restaurant_id' => $restaurantId,
            'deposit_status' => 'paid',
            'note' => 'GCash #1234',
        ])->assertOk()
            ->assertJsonPath('data.reservation.reservation_status', ReservationStatus::CONFIRMED)
            ->assertJsonPath('data.reservation.deposit_status', 'paid')
            ->assertJsonPath('data.reservation.allowed_deposit_actions', ['refund']);

        $this->assertNotNull(DB::table('reservations')->where('reservation_id', $awaitingId)->value('confirmed_at'));
        $this->assertSame(1, DB::table('notifications')->where('related_entity_id', $awaitingId)->where('user_id', $customer->user_id)->count());
        $this->assertDatabaseHas('notifications', [
            'related_entity_id' => $awaitingId,
            'type' => 'reservation_confirmed',
        ]);

        $histBefore = DB::table('reservation_status_history')->where('reservation_id', $awaitingId)->count();
        $this->actingAs($owner)->postJson("/api/restaurant/reservations/{$awaitingId}/deposit", [
            'restaurant_id' => $restaurantId,
            'deposit_status' => 'paid',
        ])->assertOk();
        $this->assertSame($histBefore, DB::table('reservation_status_history')->where('reservation_id', $awaitingId)->count());
    }

    public function test_deposit_endpoint_waives_pending_deposit_and_blocks_invalid_transitions(): void
    {
        [$owner, , $restaurantId] = $this->seedRestaurantWithStaff();
        $customer = $this->createUser('cust_waive@salo.local');

        $paidId = $this->insertReservation($restaurantId, $customer->user_id, ReservationStatus::CONFIRMED, 'paid', '500.00');
        $confirmedPendingId = $this->insertReservation($restaurantId, $customer->user_id, ReservationStatus::CONFIRMED, 'pending', '400.00');

        $this->actingAs($owner)->postJson("/api/restaurant/reservations/{$paidId}/deposit", [
            'restaurant_id' => $restaurantId,
            'deposit_status' => 'waived',
        ])->assertStatus(409)->assertJsonPath('code', 'INVALID_DEPOSIT_TRANSITION');

        $this->actingAs($owner)->postJson("/api/restaurant/reservations/{$confirmedPendingId}/deposit", [
            'restaurant_id' => $restaurantId,
            'deposit_status' => 'waived',
        ])->assertOk()
            ->assertJsonPath('data.reservation.reservation_status', ReservationStatus::CONFIRMED)
            ->assertJsonPath('data.reservation.deposit_status', 'waived')
            ->assertJsonPath('data.reservation.allowed_deposit_actions', []);

        $this->assertDatabaseHas('notifications', [
            'related_entity_id' => $confirmedPendingId,
            'type' => 'reservation_deposit_waived',
        ]);

        $this->actingAs($owner)->postJson("/api/restaurant/reservations/{$confirmedPendingId}/deposit", [
            'restaurant_id' => $restaurantId,
            'deposit_status' => 'refunded',
        ])->assertStatus(409)->assertJsonPath('code', 'INVALID_DEPOSIT_TRANSITION');
    }

    public function test_deposit_endpoint_refunds_paid_deposit_with_amount_notification(): void
    {
        [$owner, , $restaurantId] = $this->seedRestaurantWithStaff();
        $customer = $this->createUser('cust_ref@salo.local');
        $paidId = $this->insertReservation($restaurantId, $customer->user_id, ReservationStatus::CONFIRMED, 'paid', '500.00');

        $this->actingAs($owner)->postJson("/api/restaurant/reservations/{$paidId}/deposit", [
            'restaurant_id' => $restaurantId,
            'deposit_status' => 'refunded',
        ])->assertOk()
            ->assertJsonPath('data.reservation.deposit_status', 'refunded')
            ->assertJsonPath('data.reservation.allowed_deposit_actions', []);

        $refundNotif = DB::table('notifications')
            ->where('related_entity_id', $paidId)
            ->where('type', 'reservation_deposit_refunded')
            ->first();
        $this->assertNotNull($refundNotif);
        $this->assertStringContainsString('500.00', (string) $refundNotif->body);
    }

    public function test_cancelled_pending_deposit_presents_as_not_collected_for_all_roles(): void
    {
        [$owner, , $restaurantId] = $this->seedRestaurantWithStaff();
        $customer = $this->createUser('cust_pres@salo.local');
        $admin = $this->createUser('adm_dep@salo.local', 'admin');
        $cancelledPendingId = $this->insertReservation($restaurantId, $customer->user_id, ReservationStatus::CANCELLED, 'pending', '300.00');

        $this->actingAs($owner)->getJson("/api/restaurant/reservations/{$cancelledPendingId}?restaurant_id={$restaurantId}")
            ->assertOk()
            ->assertJsonPath('data.reservation.deposit_display_status', 'not_collected');

        $this->actingAs($customer)->getJson("/api/customer/reservations/{$cancelledPendingId}")
            ->assertOk()
            ->assertJsonPath('data.reservation.deposit_display_status', 'not_collected');

        $this->actingAs($admin)->getJson("/api/admin/reservations/{$cancelledPendingId}")
            ->assertOk()
            ->assertJsonPath('data.reservation.deposit_display_status', 'not_collected');
    }

    public function test_restaurant_cancel_respects_refund_deposit_flag(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 10, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [$owner, , $restaurantId] = $this->seedRestaurantWithStaff();
        $customer = $this->createUser('cust_oc@salo.local');

        $paidRes1 = $this->insertReservation($restaurantId, $customer->user_id, ReservationStatus::CONFIRMED, 'paid', '500.00', $now->addDays(2));
        $paidRes2 = $this->insertReservation($restaurantId, $customer->user_id, ReservationStatus::CONFIRMED, 'paid', '600.00', $now->addDays(3));

        $this->actingAs($owner)->postJson("/api/restaurant/reservations/{$paidRes1}/cancel", [
            'restaurant_id' => $restaurantId,
            'reason' => 'Kitchen maintenance',
            'refund_deposit' => false,
        ])->assertOk()
            ->assertJsonPath('data.reservation.deposit_status', 'paid')
            ->assertJsonPath('data.reservation.deposit_action_needed', true);

        $this->actingAs($owner)->postJson("/api/restaurant/reservations/{$paidRes2}/cancel", [
            'restaurant_id' => $restaurantId,
            'reason' => 'Private buyout',
            'refund_deposit' => true,
        ])->assertOk()
            ->assertJsonPath('data.reservation.deposit_status', 'refunded')
            ->assertJsonPath('data.reservation.deposit_action_needed', false);
    }

    public function test_customer_cancel_on_paid_reservation_notifies_handler_with_deposit_reminder(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 10, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [, , $restaurantId] = $this->seedRestaurantWithStaff();
        $customer = $this->createUser('cust_cc@salo.local');
        $paidRes = $this->insertReservation($restaurantId, $customer->user_id, ReservationStatus::CONFIRMED, 'paid', '700.00', $now->addDays(4));

        $this->actingAs($customer)->postJson("/api/customer/reservations/{$paidRes}/cancel", [
            'reason' => 'Plans changed',
        ])->assertOk()
            ->assertJsonPath('data.reservation.deposit_status', 'paid');

        $handlerNotif = DB::table('notifications')
            ->where('related_entity_id', $paidRes)
            ->where('type', 'reservation_cancelled_by_customer')
            ->first();
        $this->assertNotNull($handlerNotif);
        $this->assertStringContainsString('Deposit already received', (string) $handlerNotif->body);
    }

    private function createUser(string $email, string $role = 'customer'): User
    {
        return User::create([
            'username' => explode('@', $email)[0].'_'.random_int(100, 999),
            'first_name' => 'Test',
            'last_name' => 'User',
            'email' => $email,
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    /**
     * @return array{0: User, 1: User, 2: int}
     */
    private function seedRestaurantWithStaff(): array
    {
        $owner = $this->createUser('owner_'.random_int(1000, 9999).'@salo.local');
        $staff = $this->createUser('staff_'.random_int(1000, 9999).'@salo.local');

        $barangayId = (int) DB::table('barangays')->value('barangay_id');
        $addressId = DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '123 Deposit Ave',
            'postal_code' => '1000',
        ]);

        $restaurantId = DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Deposit Bistro '.random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'bistro_'.random_int(1000, 9999).'@salo.local',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
            'offers_dine_in' => 1,
            'accepts_reservations' => 1,
            'accepting_reservations' => 1,
            'is_published' => 1,
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
        ]);

        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $staff->user_id,
            'staff_position' => 'Reservation Handler',
            'staff_status' => 'active',
        ]);

        for ($d = 0; $d < 7; $d++) {
            DB::table('operating_hours')->insert([
                'restaurant_id' => $restaurantId,
                'day_of_week' => $d,
                'opening_time' => '10:00:00',
                'closing_time' => '22:00:00',
                'closes_next_day' => 0,
                'is_closed' => 0,
            ]);
        }

        DB::table('restaurant_tables')->insert([
            'restaurant_id' => $restaurantId,
            'table_name' => 'T1',
            'dining_area' => 'Indoor',
            'seating_capacity' => 4,
            'min_party_size' => 1,
            'is_active' => 1,
        ]);

        return [$owner, $staff, $restaurantId];
    }

    private function insertReservation(
        int $restaurantId,
        int $customerId,
        string $status,
        string $depositStatus,
        string $depositAmount,
        ?CarbonImmutable $start = null,
    ): int {
        $startAt = $start ?? CarbonImmutable::create(2026, 11, 24, 18, 0, 0, 'Asia/Manila');

        return DB::table('reservations')->insertGetId([
            'reservation_reference' => 'SALO-RES-DEP-'.random_int(10000, 99999),
            'customer_id' => $customerId,
            'restaurant_id' => $restaurantId,
            'contact_name' => 'Deposit Guest',
            'contact_phone' => '09171234567',
            'reservation_start' => $startAt->format('Y-m-d H:i:s'),
            'reservation_end' => $startAt->addMinutes(90)->format('Y-m-d H:i:s'),
            'number_of_guests' => 2,
            'reservation_status' => $status,
            'deposit_amount' => $depositAmount,
            'deposit_status' => $depositStatus,
            'service_fee' => '25.00',
        ]);
    }
}
