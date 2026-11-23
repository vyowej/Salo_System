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
use PHPUnit\Framework\Attributes\DataProvider;
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

    /**
     * @return array<string, array{0: string}>
     */
    public static function nonExpiringStatusProvider(): array
    {
        return [
            'confirmed' => [ReservationStatus::CONFIRMED],
            'seated' => [ReservationStatus::SEATED],
            'completed' => [ReservationStatus::COMPLETED],
            'expired' => [ReservationStatus::EXPIRED],
        ];
    }

    public function test_reservation_expiry_helper_computes_pending_and_awaiting_payment_deadlines(): void
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
            'reservation_start' => '2026-11-23 12:00:00',
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
    }

    #[DataProvider('nonExpiringStatusProvider')]
    public function test_reservation_expiry_helper_returns_null_for_non_expiring_statuses(string $status): void
    {
        $this->assertNull(ReservationExpiry::expiresAt((object) [
            'reservation_status' => $status,
            'reservation_start' => '2026-11-24 18:00:00',
            'created_at' => '2026-11-23 10:00:00',
        ]));
    }

    public function test_expired_pending_does_not_block_availability_or_max_pending_limit(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 12, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [$owner, , $restaurantId, $tableId] = $this->seedRestaurantWithTable(60);
        $cust1 = $this->createUser('cons1@salo.local');
        $cust2 = $this->createUser('cons2@salo.local');

        $this->insertReservation($restaurantId, $tableId, $cust1->user_id, ReservationStatus::PENDING, '2026-11-24 18:00:00', '2026-11-23 11:00:00');
        $avail = app(ReservationAvailabilityService::class)->getAvailabilityForDate($restaurantId, '2026-11-24', 2, null, null, $now);
        $slot18 = collect($avail['slots'])->firstWhere('time', '18:00');
        $this->assertTrue($slot18['available']);

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

    public function test_fresh_pending_inside_warning_window_blocks_and_flags_pending_expiring(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 12, 0, 0, 'Asia/Manila');

        $freshRow = (object) [
            'reservation_status' => ReservationStatus::PENDING,
            'created_at' => '2026-11-23 11:20:00',
            'reservation_start' => '2026-11-24 19:00:00',
            'reservation_end' => '2026-11-24 20:30:00',
        ];
        $this->assertFalse(ReservationExpiry::isExpired($freshRow, $now, 60));
        $this->assertSame('pending_expiring', ReservationAttention::compute($freshRow, (object) ['reservation_pending_expiry_minutes' => 60], $now));
    }

    public function test_expire_command_respects_dry_run_limit_and_restaurant_scoping(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 12, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [, , $restaurantId, $tableId] = $this->seedRestaurantWithTable(60);
        [, , $otherRestId, $otherTableId] = $this->seedRestaurantWithTable(60);
        $cust1 = $this->createUser('exp1@salo.local');

        $duePendingId = $this->insertReservation($restaurantId, $tableId, $cust1->user_id, ReservationStatus::PENDING, '2026-11-24 18:00:00', '2026-11-23 10:00:00', null, 'pending', '250.00');
        $dueAwaitingId = $this->insertReservation($restaurantId, null, $cust1->user_id, ReservationStatus::AWAITING_PAYMENT, '2026-11-24 20:00:00', '2026-11-22 09:00:00', '2026-11-22 10:00:00', 'pending', '300.00');
        $freshPendingId = $this->insertReservation($restaurantId, null, $cust1->user_id, ReservationStatus::PENDING, '2026-11-25 18:00:00', '2026-11-23 11:45:00');
        $confirmedId = $this->insertReservation($restaurantId, null, $cust1->user_id, ReservationStatus::CONFIRMED, '2026-11-25 19:00:00', '2026-11-23 08:00:00');
        $otherDueId = $this->insertReservation($otherRestId, $otherTableId, $cust1->user_id, ReservationStatus::PENDING, '2026-11-24 18:00:00', '2026-11-23 09:00:00');

        Artisan::call('salo:expire-stale-reservations', ['--dry-run' => true, '--restaurant' => $restaurantId]);
        $this->assertSame(ReservationStatus::PENDING, DB::table('reservations')->where('reservation_id', $duePendingId)->value('reservation_status'));

        $expiryService = app(ReservationExpiryService::class);
        $limited = $expiryService->expireDue($now, $restaurantId, null, false, 1);
        $this->assertSame(1, $limited['expired']);
        $this->assertSame(ReservationStatus::EXPIRED, DB::table('reservations')->where('reservation_id', $duePendingId)->value('reservation_status'));
        $this->assertSame(ReservationStatus::AWAITING_PAYMENT, DB::table('reservations')->where('reservation_id', $dueAwaitingId)->value('reservation_status'));

        $exit = Artisan::call('salo:expire-stale-reservations', ['--restaurant' => $restaurantId]);
        $this->assertSame(0, $exit);
        $this->assertSame(ReservationStatus::EXPIRED, DB::table('reservations')->where('reservation_id', $dueAwaitingId)->value('reservation_status'));
        $this->assertSame(ReservationStatus::PENDING, DB::table('reservations')->where('reservation_id', $otherDueId)->value('reservation_status'));
        $this->assertSame(ReservationStatus::PENDING, DB::table('reservations')->where('reservation_id', $freshPendingId)->value('reservation_status'));
        $this->assertSame(ReservationStatus::CONFIRMED, DB::table('reservations')->where('reservation_id', $confirmedId)->value('reservation_status'));
    }

    public function test_expire_command_records_history_audit_notifications_and_releases_slot(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 12, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [, , $restaurantId, $tableId] = $this->seedRestaurantWithTable(60);
        $cust1 = $this->createUser('expr1@salo.local');
        $cust2 = $this->createUser('expr2@salo.local');

        $duePendingId = $this->insertReservation($restaurantId, $tableId, $cust1->user_id, ReservationStatus::PENDING, '2026-11-24 18:00:00', '2026-11-23 10:00:00', null, 'pending', '250.00');
        $dueAwaitingId = $this->insertReservation($restaurantId, null, $cust1->user_id, ReservationStatus::AWAITING_PAYMENT, '2026-11-24 20:00:00', '2026-11-22 09:00:00', '2026-11-22 10:00:00', 'pending', '300.00');

        Artisan::call('salo:expire-stale-reservations', ['--restaurant' => $restaurantId]);

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

        $this->assertSame(1, DB::table('notifications')->where('related_entity_id', $duePendingId)->where('workspace', 'customer')->where('type', 'reservation_expired')->count());
        $this->assertSame(0, DB::table('notifications')->where('related_entity_id', $duePendingId)->where('workspace', 'restaurant')->count());
        $this->assertSame(2, DB::table('notifications')->where('related_entity_id', $dueAwaitingId)->where('workspace', 'restaurant')->where('type', 'reservation_expired')->count());

        $this->actingAs($cust2)->postJson('/api/customer/reservations', [
            'restaurant_id' => $restaurantId,
            'start' => '2026-11-24T18:00',
            'party_size' => 2,
            'idempotency_key' => 'rebook-after-exp-'.random_int(100, 999),
        ])->assertStatus(201);
    }

    public function test_expire_service_is_idempotent_and_skips_concurrently_confirmed_rows(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 12, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [, , $restaurantId, $tableId] = $this->seedRestaurantWithTable(60);
        $cust = $this->createUser('expidem@salo.local');

        $this->insertReservation($restaurantId, $tableId, $cust->user_id, ReservationStatus::PENDING, '2026-11-24 18:00:00', '2026-11-23 10:00:00');
        $confirmedId = $this->insertReservation($restaurantId, null, $cust->user_id, ReservationStatus::CONFIRMED, '2026-11-25 19:00:00', '2026-11-23 08:00:00');

        $expiryService = app(ReservationExpiryService::class);
        $this->assertSame(1, $expiryService->expireDue($now, $restaurantId)['expired']);
        $this->assertSame(0, $expiryService->expireDue($now, $restaurantId)['expired']);

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
        $this->assertSame(1, $exit);
        $this->assertSame(ReservationStatus::PENDING, DB::table('reservations')->where('reservation_id', $id1)->value('reservation_status'));
        $this->assertSame(ReservationStatus::EXPIRED, DB::table('reservations')->where('reservation_id', $id2)->value('reservation_status'));
    }

    public function test_send_expiry_warnings_marks_due_pending_and_is_idempotent(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 23, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [, , $restaurantId, $tableId] = $this->seedRestaurantWithTable(60);
        $cust = $this->createUser('warn@salo.local');

        $warnId = $this->insertReservation($restaurantId, $tableId, $cust->user_id, ReservationStatus::PENDING, '2026-11-24 18:00:00', $now->subMinutes(40)->format('Y-m-d H:i:s'));
        $noiseId = $this->insertReservation($restaurantId, null, $cust->user_id, ReservationStatus::PENDING, $now->addMinutes(20)->format('Y-m-d H:i:s'), $now->subMinutes(5)->format('Y-m-d H:i:s'));

        $expiryService = app(ReservationExpiryService::class);
        $warnRes = $expiryService->sendExpiryWarnings($now, $restaurantId);
        $this->assertSame(1, $warnRes['warned']);
        $this->assertNotNull(DB::table('reservations')->where('reservation_id', $warnId)->value('expiry_warning_sent_at'));
        $this->assertNull(DB::table('reservations')->where('reservation_id', $noiseId)->value('expiry_warning_sent_at'));
        $this->assertSame(2, DB::table('notifications')->where('related_entity_id', $warnId)->where('type', 'reservation_expiring_soon')->count());

        $this->assertSame(0, $expiryService->sendExpiryWarnings($now, $restaurantId)['warned']);
    }

    public function test_list_does_not_lazy_sweep_but_actions_and_detail_sweep_stale_rows(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 23, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [$owner, , $restaurantId, $tableId] = $this->seedRestaurantWithTable(60);
        $cust = $this->createUser('lazy@salo.local');
        $admin = $this->createUser('adm_lazy@salo.local', 'admin');

        $stale1 = $this->insertReservation($restaurantId, $tableId, $cust->user_id, ReservationStatus::PENDING, '2026-11-25 18:00:00', $now->subMinutes(90)->format('Y-m-d H:i:s'), null, 'pending', '100.00');
        $stale2 = $this->insertReservation($restaurantId, $tableId, $cust->user_id, ReservationStatus::PENDING, '2026-11-25 20:00:00', $now->subMinutes(90)->format('Y-m-d H:i:s'));
        $stale3 = $this->insertReservation($restaurantId, $tableId, $cust->user_id, ReservationStatus::PENDING, '2026-11-26 18:00:00', $now->subMinutes(90)->format('Y-m-d H:i:s'));

        $this->actingAs($owner)->getJson("/api/restaurant/reservations?restaurant_id={$restaurantId}&date=2026-11-25")
            ->assertOk();
        $this->assertSame(ReservationStatus::PENDING, DB::table('reservations')->where('reservation_id', $stale1)->value('reservation_status'));

        $this->actingAs($owner)->postJson("/api/restaurant/reservations/{$stale1}/approve", ['restaurant_id' => $restaurantId])
            ->assertStatus(409)->assertJsonPath('code', 'RESERVATION_EXPIRED');
        $this->assertSame(ReservationStatus::EXPIRED, DB::table('reservations')->where('reservation_id', $stale1)->value('reservation_status'));
        $this->actingAs($owner)->postJson("/api/restaurant/reservations/{$stale1}/reject", ['restaurant_id' => $restaurantId, 'reason' => 'Too late'])
            ->assertStatus(409)->assertJsonPath('code', 'RESERVATION_EXPIRED');
        $this->actingAs($owner)->patchJson("/api/restaurant/reservations/{$stale1}/table", ['restaurant_id' => $restaurantId, 'table_id' => $tableId])
            ->assertStatus(409)->assertJsonPath('code', 'RESERVATION_EXPIRED');
        $this->actingAs($owner)->postJson("/api/restaurant/reservations/{$stale1}/deposit", ['restaurant_id' => $restaurantId, 'deposit_status' => 'paid'])
            ->assertStatus(409)->assertJsonPath('code', 'RESERVATION_EXPIRED');

        $this->actingAs($cust)->postJson("/api/customer/reservations/{$stale2}/cancel")
            ->assertStatus(409)
            ->assertJsonPath('code', 'INVALID_TRANSITION')
            ->assertJsonPath('message', 'This reservation request has already expired.');

        $this->actingAs($admin)->getJson("/api/admin/reservations/{$stale3}")
            ->assertOk()
            ->assertJsonPath('data.reservation.reservation_status', ReservationStatus::EXPIRED);
    }

    public function test_send_reservation_reminders_respects_dry_run_lead_window_and_idempotency(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 23, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [, , $restaurantId, $tableId] = $this->seedRestaurantWithTable(60);
        $cust = $this->createUser('rem@salo.local');

        $remId = $this->insertReservation($restaurantId, $tableId, $cust->user_id, ReservationStatus::CONFIRMED, $now->addMinutes(90)->format('Y-m-d H:i:s'), $now->subHours(5)->format('Y-m-d H:i:s'));
        $justBookedId = $this->insertReservation($restaurantId, null, $cust->user_id, ReservationStatus::CONFIRMED, $now->addMinutes(60)->format('Y-m-d H:i:s'), $now->subMinutes(10)->format('Y-m-d H:i:s'));
        $this->insertReservation($restaurantId, null, $cust->user_id, ReservationStatus::PENDING, $now->addMinutes(60)->format('Y-m-d H:i:s'), $now->subMinutes(10)->format('Y-m-d H:i:s'));

        Artisan::call('salo:send-reservation-reminders', ['--dry-run' => true, '--restaurant' => $restaurantId]);
        $this->assertNull(DB::table('reservations')->where('reservation_id', $remId)->value('reminder_sent_at'));

        $remExit = Artisan::call('salo:send-reservation-reminders', ['--restaurant' => $restaurantId]);
        $this->assertSame(0, $remExit);
        $this->assertNotNull(DB::table('reservations')->where('reservation_id', $remId)->value('reminder_sent_at'));
        $this->assertNull(DB::table('reservations')->where('reservation_id', $justBookedId)->value('reminder_sent_at'));
        $this->assertSame(1, DB::table('notifications')->where('related_entity_id', $remId)->where('type', 'reservation_reminder')->count());

        $this->assertSame(0, app(ReservationReminderService::class)->sendDue($now, $restaurantId)['sent']);
    }

    public function test_scheduler_registers_expiry_and_reminder_commands_every_five_minutes(): void
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
    }

    public function test_expire_due_query_count_is_bounded_for_50_rows(): void
    {
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
