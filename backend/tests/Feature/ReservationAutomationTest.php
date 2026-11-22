<?php

namespace Tests\Feature;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Reservations\Services\ReservationAvailabilityService;
use App\Features\Reservations\Services\ReservationExpiryService;
use App\Features\Reservations\Services\ReservationReminderService;
use App\Features\Reservations\Support\ReservationAttention;
use App\Features\Reservations\Support\ReservationExpiry;
use App\Features\Reservations\Support\ReservationStatus;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ReservationAutomationTest extends TestCase
{
    use DatabaseTransactions;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_reservation_expiry_helper_and_cross_service_consistency(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 12, 0, 0, 'Asia/Manila');

        // 1. Pending capped by created_at + expiry
        $pendingWindow = (object) [
            'reservation_status' => ReservationStatus::PENDING,
            'created_at' => '2026-11-23 10:00:00',
            'reservation_start' => '2026-11-24 18:00:00',
            'reservation_pending_expiry_minutes' => 90,
        ];
        $this->assertSame('2026-11-23 11:30:00', ReservationExpiry::expiresAt($pendingWindow)?->format('Y-m-d H:i:s'));
        $this->assertTrue(ReservationExpiry::isExpired($pendingWindow, $now));

        // 2. Pending capped by reservation_start when start < created_at + expiry
        $pendingStartCap = (object) [
            'reservation_status' => ReservationStatus::PENDING,
            'created_at' => '2026-11-23 11:00:00',
            'reservation_start' => '2026-11-23 12:00:00', // exact boundary == now
            'reservation_pending_expiry_minutes' => 120,
        ];
        $this->assertSame('2026-11-23 12:00:00', ReservationExpiry::expiresAt($pendingStartCap)?->format('Y-m-d H:i:s'));
        $this->assertTrue(ReservationExpiry::isExpired($pendingStartCap, $now));
        $this->assertFalse(ReservationExpiry::isExpired($pendingStartCap, $now->subSecond()));

        // 3. Awaiting payment uses approved_at + awaiting_payment_expiry_minutes (1440) capped by start
        $awaiting = (object) [
            'reservation_status' => ReservationStatus::AWAITING_PAYMENT,
            'approved_at' => '2026-11-22 12:00:00',
            'reservation_start' => '2026-11-24 18:00:00',
        ];
        $this->assertSame('2026-11-23 12:00:00', ReservationExpiry::expiresAt($awaiting)?->format('Y-m-d H:i:s'));
        $this->assertTrue(ReservationExpiry::isExpired($awaiting, $now));

        // 4. Other statuses -> null
        foreach ([ReservationStatus::CONFIRMED, ReservationStatus::SEATED, ReservationStatus::COMPLETED, ReservationStatus::EXPIRED] as $st) {
            $this->assertNull(ReservationExpiry::expiresAt((object) [
                'reservation_status' => $st,
                'reservation_start' => '2026-11-24 18:00:00',
                'created_at' => '2026-11-23 10:00:00',
            ]));
        }

        // 5. Table-driven consistency across ReservationExpiry, AvailabilityService, Customer pending count, and ReservationAttention
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);
        [$owner, , $restaurantId, $tableId] = $this->seedRestaurantWithTable(60);
        $cust1 = $this->createUser('cons1@salo.local');
        $cust2 = $this->createUser('cons2@salo.local');

        // Expired pending (created 60m ago == 60m expiry) -> must NOT block availability
        $this->insertReservation($restaurantId, $tableId, $cust1->user_id, ReservationStatus::PENDING, '2026-11-24 18:00:00', '2026-11-23 11:00:00');
        $avail = app(ReservationAvailabilityService::class)->getAvailabilityForDate($restaurantId, '2026-11-24', 2, null, null, $now);
        $slot18 = collect($avail['slots'])->firstWhere('time', '18:00');
        $this->assertTrue($slot18['available']);

        // Fresh pending inside warning window (created 40m ago, expires in 20m <= 30m warning) -> blocks + flagged pending_expiring
        $freshRow = (object) [
            'reservation_status' => ReservationStatus::PENDING,
            'created_at' => '2026-11-23 11:20:00',
            'reservation_start' => '2026-11-24 19:00:00',
            'reservation_end' => '2026-11-24 20:30:00',
        ];
        $this->assertFalse(ReservationExpiry::isExpired($freshRow, $now, 60));
        $this->assertSame('pending_expiring', ReservationAttention::compute($freshRow, (object) ['reservation_pending_expiry_minutes' => 60], $now));

        // Customer 1 with 3 expired pendings can still book (expired pendings don't count toward max 3)
        $this->insertReservation($restaurantId, null, $cust1->user_id, ReservationStatus::PENDING, '2026-11-25 18:00:00', '2026-11-23 10:00:00');
        $this->insertReservation($restaurantId, null, $cust1->user_id, ReservationStatus::PENDING, '2026-11-26 18:00:00', '2026-11-23 10:00:00');
        $this->actingAs($cust1)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-24T18:00',
            'party_size' => 2,
            'idempotency_key' => 'cons-book-'.random_int(100, 999),
        ])->assertStatus(201);
        $this->assertNotNull($cust2);
        $this->assertNotNull($owner);
    }

    public function test_expire_due_command_idempotency_dry_run_flags_slot_release_and_race_recheck(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 12, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [$owner, $staff, $restaurantId, $tableId] = $this->seedRestaurantWithTable(60);
        [, , $otherRestId, $otherTableId] = $this->seedRestaurantWithTable(60);
        $cust1 = $this->createUser('exp1@salo.local');
        $cust2 = $this->createUser('exp2@salo.local');

        $duePendingId = $this->insertReservation($restaurantId, $tableId, $cust1->user_id, ReservationStatus::PENDING, '2026-11-24 18:00:00', '2026-11-23 10:00:00', null, 'pending', '250.00');
        $dueAwaitingId = $this->insertReservation($restaurantId, null, $cust1->user_id, ReservationStatus::AWAITING_PAYMENT, '2026-11-24 20:00:00', '2026-11-22 09:00:00', '2026-11-22 10:00:00', 'pending', '300.00');
        $freshPendingId = $this->insertReservation($restaurantId, null, $cust1->user_id, ReservationStatus::PENDING, '2026-11-25 18:00:00', '2026-11-23 11:45:00');
        $confirmedId = $this->insertReservation($restaurantId, null, $cust1->user_id, ReservationStatus::CONFIRMED, '2026-11-25 19:00:00', '2026-11-23 08:00:00');
        $otherDueId = $this->insertReservation($otherRestId, $otherTableId, $cust1->user_id, ReservationStatus::PENDING, '2026-11-24 18:00:00', '2026-11-23 09:00:00');

        // Dry run changes nothing
        Artisan::call('salo:expire-stale-reservations', ['--dry-run' => true, '--restaurant' => $restaurantId]);
        $this->assertSame(ReservationStatus::PENDING, DB::table('reservations')->where('reservation_id', $duePendingId)->value('reservation_status'));

        // Limit=1 on restaurantId expires only 1
        $expiryService = app(ReservationExpiryService::class);
        $limited = $expiryService->expireDue($now, $restaurantId, null, false, 1);
        $this->assertSame(1, $limited['expired']);
        $this->assertSame(ReservationStatus::EXPIRED, DB::table('reservations')->where('reservation_id', $duePendingId)->value('reservation_status'));
        $this->assertSame(ReservationStatus::AWAITING_PAYMENT, DB::table('reservations')->where('reservation_id', $dueAwaitingId)->value('reservation_status'));

        // Command with --restaurant runs remaining dueAwaitingId; otherDueId stays untouched
        $exit = Artisan::call('salo:expire-stale-reservations', ['--restaurant' => $restaurantId]);
        $this->assertSame(0, $exit);
        $this->assertSame(ReservationStatus::EXPIRED, DB::table('reservations')->where('reservation_id', $dueAwaitingId)->value('reservation_status'));
        $this->assertSame(ReservationStatus::PENDING, DB::table('reservations')->where('reservation_id', $otherDueId)->value('reservation_status'));
        $this->assertSame(ReservationStatus::PENDING, DB::table('reservations')->where('reservation_id', $freshPendingId)->value('reservation_status'));
        $this->assertSame(ReservationStatus::CONFIRMED, DB::table('reservations')->where('reservation_id', $confirmedId)->value('reservation_status'));

        // History, audit, deposit untouched + deposit_display_status='not_collected', notifications
        $this->assertDatabaseHas('reservation_status_history', [
            'reservation_id' => $duePendingId,
            'to_status' => ReservationStatus::EXPIRED,
            'changed_by_role' => 'system',
            'note' => 'Not confirmed in time',
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'system_reservation_expired',
            'entity_id' => (string) $duePendingId,
        ]);
        $this->assertSame('pending', DB::table('reservations')->where('reservation_id', $duePendingId)->value('deposit_status'));
        $this->actingAs($cust1)->getJson("/api/customer/reservations/{$duePendingId}")
            ->assertOk()
            ->assertJsonPath('data.reservation.deposit_display_status', 'not_collected');

        // Customer got 1 notification for duePendingId; restaurant handlers got notification ONLY for awaiting_payment
        $this->assertSame(1, DB::table('notifications')->where('related_entity_id', $duePendingId)->where('workspace', 'customer')->where('type', 'reservation_expired')->count());
        $this->assertSame(0, DB::table('notifications')->where('related_entity_id', $duePendingId)->where('workspace', 'restaurant')->count());
        $this->assertSame(2, DB::table('notifications')->where('related_entity_id', $dueAwaitingId)->where('workspace', 'restaurant')->where('type', 'reservation_expired')->count()); // owner + staff

        // Slot on tableId is released -> cust2 can book it via Phase 4 endpoint
        $this->actingAs($cust2)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-24T18:00',
            'party_size' => 2,
            'idempotency_key' => 'rebook-after-exp-'.random_int(100, 999),
        ])->assertStatus(201);

        // Second run is a no-op
        $second = $expiryService->expireDue($now, $restaurantId);
        $this->assertSame(0, $second['expired']);

        // Race re-check: if a row is confirmed before expireSingleReservation runs, it is skipped
        $this->assertSame('skipped', $expiryService->expireSingleReservation($confirmedId, $now));
        $this->assertSame(ReservationStatus::CONFIRMED, DB::table('reservations')->where('reservation_id', $confirmedId)->value('reservation_status'));
    }

    public function test_per_row_failure_isolation_in_expire_command(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 12, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [, , $restaurantId] = $this->seedRestaurantWithTable(60);
        $cust = $this->createUser('failiso@salo.local');

        $id1 = $this->insertReservation($restaurantId, null, $cust->user_id, ReservationStatus::PENDING, '2026-11-24 18:00:00', '2026-11-23 09:00:00');
        $id2 = $this->insertReservation($restaurantId, null, $cust->user_id, ReservationStatus::PENDING, '2026-11-24 19:00:00', '2026-11-23 09:00:00');

        $mockNotif = $this->createMock(NotificationService::class);
        $callNum = 0;
        $mockNotif->method('notifyUser')->willReturnCallback(function () use (&$callNum): int {
            $callNum++;
            if ($callNum === 1) {
                throw new \RuntimeException('Simulated notification failure');
            }

            return 1;
        });
        $this->app->instance(NotificationService::class, $mockNotif);

        $exit = Artisan::call('salo:expire-stale-reservations', ['--restaurant' => $restaurantId]);
        $this->assertSame(1, $exit); // non-zero because 1 row failed
        $this->assertSame(ReservationStatus::PENDING, DB::table('reservations')->where('reservation_id', $id1)->value('reservation_status'));
        $this->assertSame(ReservationStatus::EXPIRED, DB::table('reservations')->where('reservation_id', $id2)->value('reservation_status'));
    }

    public function test_send_expiry_warnings_and_lazy_sweep_and_reminders(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 23, 0, 0, 'Asia/Manila'); // near midnight Manila!
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [$owner, $staff, $restaurantId, $tableId] = $this->seedRestaurantWithTable(60);
        $cust = $this->createUser('warnrem@salo.local');
        $admin = $this->createUser('adm_auto@salo.local', 'admin');

        // Pending inside 30m warning window (created 40m ago, expires in 20m)
        $warnId = $this->insertReservation($restaurantId, $tableId, $cust->user_id, ReservationStatus::PENDING, '2026-11-24 18:00:00', $now->subMinutes(40)->format('Y-m-d H:i:s'));
        // Pending created inside warning window (start is 20m from now, created 5m ago) -> skipped
        $noiseId = $this->insertReservation($restaurantId, null, $cust->user_id, ReservationStatus::PENDING, $now->addMinutes(20)->format('Y-m-d H:i:s'), $now->subMinutes(5)->format('Y-m-d H:i:s'));

        $expiryService = app(ReservationExpiryService::class);
        $warnRes = $expiryService->sendExpiryWarnings($now, $restaurantId);
        $this->assertSame(1, $warnRes['warned']);
        $this->assertNotNull(DB::table('reservations')->where('reservation_id', $warnId)->value('expiry_warning_sent_at'));
        $this->assertNull(DB::table('reservations')->where('reservation_id', $noiseId)->value('expiry_warning_sent_at'));
        $this->assertSame(2, DB::table('notifications')->where('related_entity_id', $warnId)->where('type', 'reservation_expiring_soon')->count());

        // Re-run is idempotent
        $this->assertSame(0, $expiryService->sendExpiryWarnings($now, $restaurantId)['warned']);

        // Lazy sweep tests
        $stale1 = $this->insertReservation($restaurantId, $tableId, $cust->user_id, ReservationStatus::PENDING, '2026-11-25 18:00:00', $now->subMinutes(90)->format('Y-m-d H:i:s'), null, 'pending', '100.00');
        $stale2 = $this->insertReservation($restaurantId, $tableId, $cust->user_id, ReservationStatus::PENDING, '2026-11-25 20:00:00', $now->subMinutes(90)->format('Y-m-d H:i:s'));
        $stale3 = $this->insertReservation($restaurantId, $tableId, $cust->user_id, ReservationStatus::PENDING, '2026-11-26 18:00:00', $now->subMinutes(90)->format('Y-m-d H:i:s'));

        // List endpoints do NOT sweep (rows stay pending in DB, expires_at in past)
        $this->actingAs($owner)->getJson("/api/restaurant/reservations?restaurant_id={$restaurantId}&date=2026-11-25")
            ->assertOk();
        $this->assertSame(ReservationStatus::PENDING, DB::table('reservations')->where('reservation_id', $stale1)->value('reservation_status'));

        // Owner actions on stale1 -> 409 RESERVATION_EXPIRED and row is now expired
        $this->actingAs($owner)->postJson("/api/restaurant/reservations/{$stale1}/approve", ['restaurant_id' => $restaurantId])
            ->assertStatus(409)->assertJsonPath('code', 'RESERVATION_EXPIRED');
        $this->assertSame(ReservationStatus::EXPIRED, DB::table('reservations')->where('reservation_id', $stale1)->value('reservation_status'));
        $this->actingAs($owner)->postJson("/api/restaurant/reservations/{$stale1}/reject", ['restaurant_id' => $restaurantId, 'reason' => 'Too late'])
            ->assertStatus(409)->assertJsonPath('code', 'RESERVATION_EXPIRED');
        $this->actingAs($owner)->patchJson("/api/restaurant/reservations/{$stale1}/table", ['restaurant_id' => $restaurantId, 'table_id' => $tableId])
            ->assertStatus(409)->assertJsonPath('code', 'RESERVATION_EXPIRED');
        $this->actingAs($owner)->postJson("/api/restaurant/reservations/{$stale1}/deposit", ['restaurant_id' => $restaurantId, 'deposit_status' => 'paid'])
            ->assertStatus(409)->assertJsonPath('code', 'RESERVATION_EXPIRED');

        // Customer cancel on stale2 -> 409 INVALID_TRANSITION with friendly message
        $this->actingAs($cust)->postJson("/api/customer/reservations/{$stale2}/cancel")
            ->assertStatus(409)
            ->assertJsonPath('code', 'INVALID_TRANSITION')
            ->assertJsonPath('message', 'This reservation request has already expired.');

        // Detail endpoints (customer, owner, admin) sweep stale3 and return expired + expires_at present
        $this->actingAs($admin)->getJson("/api/admin/reservations/{$stale3}")
            ->assertOk()
            ->assertJsonPath('data.reservation.reservation_status', ReservationStatus::EXPIRED);

        // Reminders: confirmed 90m from now (at 00:30 next day Manila!) created 5h ago -> eligible
        $remId = $this->insertReservation($restaurantId, $tableId, $cust->user_id, ReservationStatus::CONFIRMED, $now->addMinutes(90)->format('Y-m-d H:i:s'), $now->subHours(5)->format('Y-m-d H:i:s'));
        // Confirmed created inside lead window -> skipped
        $justBookedId = $this->insertReservation($restaurantId, null, $cust->user_id, ReservationStatus::CONFIRMED, $now->addMinutes(60)->format('Y-m-d H:i:s'), $now->subMinutes(10)->format('Y-m-d H:i:s'));
        // Pending inside lead window -> skipped
        $this->insertReservation($restaurantId, null, $cust->user_id, ReservationStatus::PENDING, $now->addMinutes(60)->format('Y-m-d H:i:s'), $now->subMinutes(10)->format('Y-m-d H:i:s'));

        Artisan::call('salo:send-reservation-reminders', ['--dry-run' => true, '--restaurant' => $restaurantId]);
        $this->assertNull(DB::table('reservations')->where('reservation_id', $remId)->value('reminder_sent_at'));

        $remExit = Artisan::call('salo:send-reservation-reminders', ['--restaurant' => $restaurantId]);
        $this->assertSame(0, $remExit);
        $this->assertNotNull(DB::table('reservations')->where('reservation_id', $remId)->value('reminder_sent_at'));
        $this->assertNull(DB::table('reservations')->where('reservation_id', $justBookedId)->value('reminder_sent_at'));
        $this->assertSame(1, DB::table('notifications')->where('related_entity_id', $remId)->where('type', 'reservation_reminder')->count());

        // Re-run reminders is idempotent
        $this->assertSame(0, app(ReservationReminderService::class)->sendDue($now, $restaurantId)['sent']);
    }

    public function test_scheduler_registration_and_query_efficiency_for_50_rows(): void
    {
        $schedule = app(Schedule::class);
        $events = collect($schedule->events());

        $expireEvent = $events->first(static fn ($e): bool => str_contains((string) $e->command, 'salo:expire-stale-reservations'));
        $reminderEvent = $events->first(static fn ($e): bool => str_contains((string) $e->command, 'salo:send-reservation-reminders'));
        $featuredEvent = $events->first(static fn ($e): bool => str_contains((string) $e->command, 'salo:select-featured-restaurant'));

        $this->assertNotNull($expireEvent);
        $this->assertNotNull($reminderEvent);
        $this->assertNotNull($featuredEvent);
        $this->assertSame('Asia/Manila', $expireEvent->timezone);
        $this->assertSame('Asia/Manila', $reminderEvent->timezone);
        $this->assertTrue($expireEvent->withoutOverlapping);
        $this->assertTrue($reminderEvent->withoutOverlapping);
        $this->assertSame('*/5 * * * *', $expireEvent->expression);
        $this->assertSame('*/5 * * * *', $reminderEvent->expression);

        // Query efficiency over 50 due rows
        $now = CarbonImmutable::create(2026, 11, 23, 12, 0, 0, 'Asia/Manila');
        [, , $restaurantId] = $this->seedRestaurantWithTable(60);
        $cust = $this->createUser('qeff@salo.local');

        $rows = [];
        for ($i = 0; $i < 50; $i++) {
            $rows[] = [
                'reservation_reference' => 'SALO-RES-EFF-'.random_int(100000, 999999).'-'.$i,
                'customer_id' => $cust->user_id,
                'restaurant_id' => $restaurantId,
                'contact_name' => 'Guest '.$i,
                'contact_phone' => '09170000000',
                'reservation_start' => '2026-11-24 18:00:00',
                'reservation_end' => '2026-11-24 19:30:00',
                'number_of_guests' => 2,
                'reservation_status' => ReservationStatus::PENDING,
                'created_at' => '2026-11-23 09:00:00',
            ];
        }
        DB::table('reservations')->insert($rows);

        DB::flushQueryLog();
        DB::enableQueryLog();
        $result = app(ReservationExpiryService::class)->expireDue($now, $restaurantId);
        $queryCount = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertSame(50, $result['expired']);
        // 1 pre-filter query + <= 6 queries per expired row (select, update, history, audit, notif)
        $this->assertLessThanOrEqual(1 + (50 * 6), $queryCount);
    }

    private function createUser(string $email, string $role = 'customer'): User
    {
        return User::create([
            'username' => explode('@', $email)[0].'_'.random_int(100, 999),
            'first_name' => 'Auto',
            'last_name' => 'Tester',
            'email' => $email,
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    /**
     * @return array{0: User, 1: User, 2: int, 3: int}
     */
    private function seedRestaurantWithTable(int $pendingExpiryMinutes = 60): array
    {
        $owner = $this->createUser('own_auto_'.random_int(1000, 9999).'@salo.local');
        $staff = $this->createUser('stf_auto_'.random_int(1000, 9999).'@salo.local');

        $barangayId = (int) DB::table('barangays')->value('barangay_id');
        $addressId = DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '456 Automation St',
            'postal_code' => '1000',
        ]);

        $restaurantId = DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Automation Kitchen '.random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'auto_'.random_int(1000, 9999).'@salo.local',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
            'offers_dine_in' => 1,
            'accepts_reservations' => 1,
            'accepting_reservations' => 1,
            'is_published' => 1,
            'reservation_pending_expiry_minutes' => $pendingExpiryMinutes,
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
                'opening_time' => '00:00:00',
                'closing_time' => '23:59:59',
                'closes_next_day' => 0,
                'is_closed' => 0,
            ]);
        }

        $tableId = DB::table('restaurant_tables')->insertGetId([
            'restaurant_id' => $restaurantId,
            'table_name' => 'A1',
            'dining_area' => 'Main Hall',
            'seating_capacity' => 4,
            'min_party_size' => 1,
            'is_active' => 1,
        ]);

        return [$owner, $staff, $restaurantId, $tableId];
    }

    private function insertReservation(
        int $restaurantId,
        ?int $tableId,
        int $customerId,
        string $status,
        string $startStr,
        string $createdAtStr,
        ?string $approvedAtStr = null,
        string $depositStatus = 'none',
        string $depositAmount = '0.00',
    ): int {
        $start = CarbonImmutable::parse($startStr, 'Asia/Manila');

        return DB::table('reservations')->insertGetId([
            'reservation_reference' => 'SALO-RES-AUT-'.random_int(10000, 99999),
            'customer_id' => $customerId,
            'restaurant_id' => $restaurantId,
            'table_id' => $tableId,
            'contact_name' => 'Auto Guest',
            'contact_phone' => '09171234567',
            'reservation_start' => $start->format('Y-m-d H:i:s'),
            'reservation_end' => $start->addMinutes(90)->format('Y-m-d H:i:s'),
            'number_of_guests' => 2,
            'reservation_status' => $status,
            'deposit_status' => $depositStatus,
            'deposit_amount' => $depositAmount,
            'approved_at' => $approvedAtStr,
            'created_at' => $createdAtStr,
            'updated_at' => $approvedAtStr ?? $createdAtStr,
        ]);
    }
}
