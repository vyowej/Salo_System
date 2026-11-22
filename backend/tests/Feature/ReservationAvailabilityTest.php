<?php

namespace Tests\Feature;

use App\Features\Reservations\Services\ReservationAvailabilityService;
use App\Features\Reservations\Support\ReservationStatus;
use App\Features\Restaurants\Services\AvailabilityService;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class ReservationAvailabilityTest extends TestCase
{
    use DatabaseTransactions;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_validate_booking_window_returns_each_reason_code_in_priority_order(): void
    {
        $this->freezeManilaTime('2026-11-23 10:00:00');
        $service = app(ReservationAvailabilityService::class);

        $restaurantId = $this->createRestaurant([
            'restaurant_status' => 'active',
            'is_published' => 1,
            'accepts_reservations' => 1,
            'accepting_reservations' => 1,
            'reservation_min_notice_hours' => 2,
            'reservation_max_party_size' => 8,
            'reservation_duration_minutes' => 90,
            'reservation_max_advance_days' => 30,
        ]);
        $this->insertDailyOperatingHours($restaurantId, '10:00:00', '22:00:00');

        $validStart = CarbonImmutable::parse('2026-11-24 18:00:00', 'Asia/Manila');
        $validEnd = $validStart->addMinutes(90);

        // 1. No active tables -> NO_TABLES
        $settingsNoTables = $service->getBookingSettings($restaurantId);
        $resNoTables = $service->validateBookingWindow($settingsNoTables, $validStart, $validEnd, 4);
        $this->assertSame(ReservationAvailabilityService::REASON_NO_TABLES, $resNoTables['code']);

        // Add tables (max table capacity = 6, even though restaurant_max_party_size = 8)
        $this->insertTable($restaurantId, 'T-01', 2, 1, 'Indoor');
        $this->insertTable($restaurantId, 'T-02', 6, 2, 'Indoor');
        $baseSettings = $service->getBookingSettings($restaurantId);

        // 2. Inactive or unpublished -> RESTAURANT_UNAVAILABLE
        $inactiveSettings = array_merge($baseSettings, ['restaurant_status' => 'suspended']);
        $this->assertSame(
            ReservationAvailabilityService::REASON_RESTAURANT_UNAVAILABLE,
            $service->validateBookingWindow($inactiveSettings, $validStart, $validEnd, 4)['code'],
        );

        $unpublishedSettings = array_merge($baseSettings, ['is_published' => false]);
        $this->assertSame(
            ReservationAvailabilityService::REASON_RESTAURANT_UNAVAILABLE,
            $service->validateBookingWindow($unpublishedSettings, $validStart, $validEnd, 4)['code'],
        );

        // 3. accepts_reservations false -> RESERVATIONS_NOT_OFFERED
        $notOfferedSettings = array_merge($baseSettings, ['accepts_reservations' => false]);
        $this->assertSame(
            ReservationAvailabilityService::REASON_RESERVATIONS_NOT_OFFERED,
            $service->validateBookingWindow($notOfferedSettings, $validStart, $validEnd, 4)['code'],
        );

        // 4. accepting_reservations false -> NOT_ACCEPTING
        $pausedSettings = array_merge($baseSettings, ['accepting_reservations' => false]);
        $this->assertSame(
            ReservationAvailabilityService::REASON_NOT_ACCEPTING,
            $service->validateBookingWindow($pausedSettings, $validStart, $validEnd, 4)['code'],
        );

        // 5. PARTY_TOO_LARGE (by largest table capacity 6, by setting 8, and < 1)
        $this->assertSame(
            ReservationAvailabilityService::REASON_PARTY_TOO_LARGE,
            $service->validateBookingWindow($baseSettings, $validStart, $validEnd, 7)['code'],
        );
        $smallSetting = array_merge($baseSettings, ['reservation_max_party_size' => 4]);
        $this->assertSame(
            ReservationAvailabilityService::REASON_PARTY_TOO_LARGE,
            $service->validateBookingWindow($smallSetting, $validStart, $validEnd, 5)['code'],
        );
        $this->assertSame(
            ReservationAvailabilityService::REASON_PARTY_TOO_LARGE,
            $service->validateBookingWindow($baseSettings, $validStart, $validEnd, 0)['code'],
        );

        // 6. PAST_TIME (start < 10:00 today)
        $pastStart = CarbonImmutable::parse('2026-11-23 09:30:00', 'Asia/Manila');
        $this->assertSame(
            ReservationAvailabilityService::REASON_PAST_TIME,
            $service->validateBookingWindow($baseSettings, $pastStart, $pastStart->addMinutes(90), 4)['code'],
        );

        // 7. TOO_SOON (start = 11:30 today < 10:00 + 2h notice)
        $tooSoonStart = CarbonImmutable::parse('2026-11-23 11:30:00', 'Asia/Manila');
        $this->assertSame(
            ReservationAvailabilityService::REASON_TOO_SOON,
            $service->validateBookingWindow($baseSettings, $tooSoonStart, $tooSoonStart->addMinutes(90), 4)['code'],
        );

        // 8. TOO_FAR_AHEAD (> today + 30 days)
        $farStart = CarbonImmutable::parse('2026-12-25 18:00:00', 'Asia/Manila');
        $this->assertSame(
            ReservationAvailabilityService::REASON_TOO_FAR_AHEAD,
            $service->validateBookingWindow($baseSettings, $farStart, $farStart->addMinutes(90), 4)['code'],
        );

        // 9. Outside operating hours (ends at 22:30 > 22:00 closing) -> CLOSED
        $lateStart = CarbonImmutable::parse('2026-11-24 21:00:00', 'Asia/Manila');
        $this->assertSame(
            ReservationAvailabilityService::REASON_CLOSED,
            $service->validateBookingWindow($baseSettings, $lateStart, $lateStart->addMinutes(90), 4)['code'],
        );

        // 10. Closure day -> CLOSED with closure reason in message
        DB::table('restaurant_closures')->insert([
            'restaurant_id' => $restaurantId,
            'closure_date' => '2026-11-25',
            'reason' => 'Annual Staff Retreat',
        ]);
        $closureStart = CarbonImmutable::parse('2026-11-25 18:00:00', 'Asia/Manila');
        $closureResult = $service->validateBookingWindow($baseSettings, $closureStart, $closureStart->addMinutes(90), 4);
        $this->assertSame(ReservationAvailabilityService::REASON_CLOSED, $closureResult['code']);
        $this->assertStringContainsString('Annual Staff Retreat', $closureResult['message']);

        // 11. Valid window returns null
        $this->assertNull($service->validateBookingWindow($baseSettings, $validStart, $validEnd, 4));
    }

    public function test_operating_hours_single_split_shift_overnight_closures_and_slot_boundaries(): void
    {
        $this->freezeManilaTime('2026-11-22 08:00:00'); // Sunday
        $service = app(ReservationAvailabilityService::class);

        $restaurantId = $this->createRestaurant([
            'reservation_duration_minutes' => 90,
        ]);
        $this->insertTable($restaurantId, 'T-01', 4, 1, 'Indoor');

        // Monday (dow 1): Split shift 11:00-14:00 and 18:00-21:00
        // Tuesday (dow 2): Overnight 21:00-02:00 (closes_next_day = 1)
        // Wednesday (dow 3): is_closed = 1
        DB::table('operating_hours')->insert([
            [
                'restaurant_id' => $restaurantId,
                'day_of_week' => 1,
                'opening_time' => '11:00:00',
                'closing_time' => '14:00:00',
                'closes_next_day' => 0,
                'is_closed' => 0,
            ],
            [
                'restaurant_id' => $restaurantId,
                'day_of_week' => 1,
                'opening_time' => '18:00:00',
                'closing_time' => '21:00:00',
                'closes_next_day' => 0,
                'is_closed' => 0,
            ],
            [
                'restaurant_id' => $restaurantId,
                'day_of_week' => 2,
                'opening_time' => '21:00:00',
                'closing_time' => '02:00:00',
                'closes_next_day' => 1,
                'is_closed' => 0,
            ],
            [
                'restaurant_id' => $restaurantId,
                'day_of_week' => 3,
                'opening_time' => '10:00:00',
                'closing_time' => '20:00:00',
                'closes_next_day' => 0,
                'is_closed' => 1,
            ],
        ]);

        $settings = $service->getBookingSettings($restaurantId);

        // Monday 2026-11-23 split shift with 90m duration and 30m step:
        // Lunch 11:00-14:00 -> 11:00, 11:30, 12:00, 12:30 (13:00+90m=14:30 > 14:00 excluded)
        // Dinner 18:00-21:00 -> 18:00, 18:30, 19:00, 19:30 (20:00+90m=21:30 > 21:00 excluded)
        $mondaySlots = $service->generateSlots($settings, '2026-11-23');
        $mondayTimes = array_map(static fn (array $s): string => $s['time'], $mondaySlots);
        $this->assertSame(['11:00', '11:30', '12:00', '12:30', '18:00', '18:30', '19:00', '19:30'], $mondayTimes);

        // Tuesday 2026-11-24 overnight 21:00 -> Wednesday 02:00 (90m duration):
        // Slots: 21:00, 21:30, 22:00, 22:30, 23:00, 23:30, 00:00 (+1d), 00:30 (+1d)
        $tuesdaySlots = $service->generateSlots($settings, '2026-11-24');
        $tuesdayIsos = array_map(static fn (array $s): string => $s['start_iso'], $tuesdaySlots);
        $this->assertContains('2026-11-24T21:00:00+08:00', $tuesdayIsos);
        $this->assertContains('2026-11-25T00:00:00+08:00', $tuesdayIsos);
        $this->assertContains('2026-11-25T00:30:00+08:00', $tuesdayIsos);
        $this->assertNotContains('2026-11-25T01:00:00+08:00', $tuesdayIsos); // 01:00 + 90m = 02:30 > 02:00

        // Wednesday 2026-11-25 is_closed = 1 -> empty
        $wedSchedule = $service->getOperatingPeriodsForDate($restaurantId, '2026-11-25');
        $this->assertTrue($wedSchedule['is_closed']);
        $this->assertSame([], $service->generateSlots($settings, '2026-11-25'));
    }

    public function test_overlap_rules_blocking_statuses_stale_pending_and_turnover_buffer(): void
    {
        $this->freezeManilaTime('2026-11-23 10:00:00');
        $service = app(ReservationAvailabilityService::class);

        $restaurantId = $this->createRestaurant([
            'reservation_pending_expiry_minutes' => 120,
        ]);
        $customer = $this->createUser('overlap-cust@salo.local');

        $t1 = $this->insertTable($restaurantId, 'T-01', 4, 2, 'Indoor');
        $t2 = $this->insertTable($restaurantId, 'T-02', 4, 2, 'Outdoor');

        // Existing confirmed reservation on T-01: 18:00 to 19:30
        $existingId = $this->insertReservation(
            $restaurantId,
            $t1,
            $customer->user_id,
            '2026-11-24 18:00:00',
            '2026-11-24 19:30:00',
            4,
            ReservationStatus::CONFIRMED,
        );

        // 1. Exact back-to-back before (16:30 to 18:00) and after (19:30 to 21:00) -> T-01 IS available
        $beforeTables = $service->getAvailableTables(
            $restaurantId,
            CarbonImmutable::parse('2026-11-24 16:30:00', 'Asia/Manila'),
            CarbonImmutable::parse('2026-11-24 18:00:00', 'Asia/Manila'),
            4,
        );
        $this->assertContains($t1, $beforeTables->pluck('table_id')->all());

        $afterTables = $service->getAvailableTables(
            $restaurantId,
            CarbonImmutable::parse('2026-11-24 19:30:00', 'Asia/Manila'),
            CarbonImmutable::parse('2026-11-24 21:00:00', 'Asia/Manila'),
            4,
        );
        $this->assertContains($t1, $afterTables->pluck('table_id')->all());

        // 2. 1-minute overlap (19:29 to 20:59) -> T-01 blocked, T-02 available
        $oneMinOverlap = $service->getAvailableTables(
            $restaurantId,
            CarbonImmutable::parse('2026-11-24 19:29:00', 'Asia/Manila'),
            CarbonImmutable::parse('2026-11-24 20:59:00', 'Asia/Manila'),
            4,
        );
        $this->assertNotContains($t1, $oneMinOverlap->pluck('table_id')->all());
        $this->assertContains($t2, $oneMinOverlap->pluck('table_id')->all());

        // 3. New reservation fully inside existing (18:15 to 19:00) -> T-01 blocked
        $insideExisting = $service->getAvailableTables(
            $restaurantId,
            CarbonImmutable::parse('2026-11-24 18:15:00', 'Asia/Manila'),
            CarbonImmutable::parse('2026-11-24 19:00:00', 'Asia/Manila'),
            4,
        );
        $this->assertNotContains($t1, $insideExisting->pluck('table_id')->all());

        // 4. Existing fully inside new (17:30 to 20:00) -> T-01 blocked
        $enclosingNew = $service->getAvailableTables(
            $restaurantId,
            CarbonImmutable::parse('2026-11-24 17:30:00', 'Asia/Manila'),
            CarbonImmutable::parse('2026-11-24 20:00:00', 'Asia/Manila'),
            4,
        );
        $this->assertNotContains($t1, $enclosingNew->pluck('table_id')->all());

        // 5. excludeReservationId ignores the reservation itself
        $withExclusion = $service->getAvailableTables(
            $restaurantId,
            CarbonImmutable::parse('2026-11-24 18:00:00', 'Asia/Manila'),
            CarbonImmutable::parse('2026-11-24 19:30:00', 'Asia/Manila'),
            4,
            null,
            $existingId,
        );
        $this->assertContains($t1, $withExclusion->pluck('table_id')->all());

        // 6. Turnover buffer config respected when set (15 minutes)
        config(['salo.reservations.turnover_buffer_minutes' => 15]);
        $blockedByBuffer = $service->getAvailableTables(
            $restaurantId,
            CarbonImmutable::parse('2026-11-24 19:30:00', 'Asia/Manila'),
            CarbonImmutable::parse('2026-11-24 21:00:00', 'Asia/Manila'),
            4,
        );
        $this->assertNotContains($t1, $blockedByBuffer->pluck('table_id')->all());

        $allowedAfterBuffer = $service->getAvailableTables(
            $restaurantId,
            CarbonImmutable::parse('2026-11-24 19:45:00', 'Asia/Manila'),
            CarbonImmutable::parse('2026-11-24 21:15:00', 'Asia/Manila'),
            4,
        );
        $this->assertContains($t1, $allowedAfterBuffer->pluck('table_id')->all());
        config(['salo.reservations.turnover_buffer_minutes' => 0]);

        // 7. Every BLOCKING status blocks; every TERMINAL status does not block
        foreach (ReservationStatus::BLOCKING as $status) {
            DB::table('reservations')->where('reservation_id', $existingId)->update([
                'reservation_status' => $status,
                'created_at' => '2026-11-23 09:30:00', // fresh (30m ago)
            ]);
            $avail = $service->getAvailableTables(
                $restaurantId,
                CarbonImmutable::parse('2026-11-24 18:00:00', 'Asia/Manila'),
                CarbonImmutable::parse('2026-11-24 19:30:00', 'Asia/Manila'),
                4,
            );
            $this->assertNotContains($t1, $avail->pluck('table_id')->all(), "Expected status {$status} to block.");
        }

        foreach (ReservationStatus::TERMINAL as $status) {
            $extra = $status === ReservationStatus::NO_SHOW
                ? ['no_show_marked_at' => '2026-11-23 09:00:00', 'no_show_marked_by' => $customer->user_id]
                : ['no_show_marked_at' => null, 'no_show_marked_by' => null];
            DB::table('reservations')->where('reservation_id', $existingId)->update(array_merge([
                'reservation_status' => $status,
            ], $extra));

            $avail = $service->getAvailableTables(
                $restaurantId,
                CarbonImmutable::parse('2026-11-24 18:00:00', 'Asia/Manila'),
                CarbonImmutable::parse('2026-11-24 19:30:00', 'Asia/Manila'),
                4,
            );
            $this->assertContains($t1, $avail->pluck('table_id')->all(), "Expected terminal status {$status} NOT to block.");
        }

        // 8. Stale pending (created 150 minutes ago > 120m expiry) does NOT block
        DB::table('reservations')->where('reservation_id', $existingId)->update([
            'reservation_status' => ReservationStatus::PENDING,
            'created_at' => '2026-11-23 07:30:00',
            'no_show_marked_at' => null,
            'no_show_marked_by' => null,
        ]);
        $staleResult = $service->getAvailableTables(
            $restaurantId,
            CarbonImmutable::parse('2026-11-24 18:00:00', 'Asia/Manila'),
            CarbonImmutable::parse('2026-11-24 19:30:00', 'Asia/Manila'),
            4,
        );
        $this->assertContains($t1, $staleResult->pluck('table_id')->all(), 'Stale pending reservation must not block.');
    }

    public function test_table_fit_ordering_only_table_id_and_lock_for_update_in_transaction(): void
    {
        $this->freezeManilaTime('2026-11-23 10:00:00');
        $service = app(ReservationAvailabilityService::class);
        $restaurantId = $this->createRestaurant();

        $t6 = $this->insertTable($restaurantId, 'T-06', 6, 1, 'Indoor');
        $t2 = $this->insertTable($restaurantId, 'T-02', 2, 1, 'Indoor');
        $t4 = $this->insertTable($restaurantId, 'T-04', 4, 2, 'Terrace');
        $t8Min5 = $this->insertTable($restaurantId, 'T-08', 8, 5, 'Indoor');
        $this->insertTable($restaurantId, 'T-ARCH', 2, 1, 'Indoor', false); // inactive

        $start = CarbonImmutable::parse('2026-11-24 18:00:00', 'Asia/Manila');
        $end = $start->addMinutes(90);

        // Best-fit ordering for party of 2: T-02 (cap 2) -> T-04 (cap 4) -> T-06 (cap 6); T-08 (min 5) and T-ARCH excluded
        $tablesFor2 = $service->getAvailableTables($restaurantId, $start, $end, 2);
        $this->assertSame([$t2, $t4, $t6], $tablesFor2->pluck('table_id')->map(fn ($id) => (int) $id)->all());

        // Dining area filter
        $terraceOnly = $service->getAvailableTables($restaurantId, $start, $end, 2, 'terrace');
        $this->assertSame([$t4], $terraceOnly->pluck('table_id')->map(fn ($id) => (int) $id)->all());

        // onlyTableId semantic + lockForUpdate inside DB::transaction
        $lockedResult = DB::transaction(function () use ($service, $restaurantId, $start, $end, $t4) {
            return $service->getAvailableTables(
                restaurantId: $restaurantId,
                start: $start,
                end: $end,
                partySize: 3,
                diningArea: null,
                excludeReservationId: null,
                lockForUpdate: true,
                onlyTableId: $t4,
            );
        });
        $this->assertCount(1, $lockedResult);
        $this->assertSame($t4, (int) $lockedResult->first()->table_id);
    }

    public function test_public_endpoints_slots_alternatives_month_overview_and_query_counts(): void
    {
        $this->freezeManilaTime('2026-11-23 11:15:00'); // Monday
        $restaurantId = $this->createRestaurant([
            'reservation_min_notice_hours' => 2,
            'reservation_max_party_size' => 8,
            'reservation_duration_minutes' => 90,
            'reservation_max_advance_days' => 10,
        ]);
        $customer = $this->createUser('ep-cust@salo.local');

        // Daily hours: 12:00 to 16:00 -> 90m slots: 12:00, 12:30, 13:00, 13:30, 14:00, 14:30 (6 slots/day)
        $this->insertDailyOperatingHours($restaurantId, '12:00:00', '16:00:00');
        $t1 = $this->insertTable($restaurantId, 'T-01', 4, 2, 'Indoor');

        // 1. GET /api/restaurants/{id}/reservation-info
        $this->getJson("/api/restaurants/{$restaurantId}/reservation-info")
            ->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.bookable', true)
            ->assertJsonPath('data.can_reserve', true)
            ->assertJsonPath('data.active_table_count', 1)
            ->assertJsonPath('data.largest_table_capacity', 4)
            ->assertJsonPath('data.dining_areas', ['Indoor']);

        // 2. On today (2026-11-23 at 11:15 with 2h notice -> earliest allowed is 13:15):
        // 12:00, 12:30, 13:00 are TOO_SOON; 13:30, 14:00, 14:30 are available
        DB::flushQueryLog();
        DB::enableQueryLog();
        $todayResp = $this->getJson("/api/restaurants/{$restaurantId}/reservation-availability?date=2026-11-23&party_size=4");
        $dayQueryCount = count(DB::getQueryLog());
        $this->assertLessThanOrEqual(5, $dayQueryCount, "Expected bounded query count (<= 5) for day availability, got {$dayQueryCount}.");

        $todayResp->assertStatus(200)
            ->assertJsonPath('data.bookable', true)
            ->assertJsonPath('data.total_slots', 6)
            ->assertJsonPath('data.available_slots', 3)
            ->assertJsonPath('data.slots.0.reason_code', ReservationAvailabilityService::REASON_TOO_SOON)
            ->assertJsonPath('data.slots.2.reason_code', ReservationAvailabilityService::REASON_TOO_SOON)
            ->assertJsonPath('data.slots.3.available', true);

        // 3. Book 13:00 on tomorrow (2026-11-24) so 12:00, 12:30, 13:00, 13:30, 14:00 overlap [13:00, 14:30], leaving ONLY 14:30 free (1/6 = 16.6% <= 25% -> 'limited')
        $this->insertReservation(
            $restaurantId,
            $t1,
            $customer->user_id,
            '2026-11-24 13:00:00',
            '2026-11-24 14:30:00',
            4,
            ReservationStatus::CONFIRMED,
        );

        // Query /reservation-availability/tables for the booked 13:00 slot -> bookable: false, FULLY_BOOKED, suggested_alternatives has 14:30
        $slotTablesResp = $this->getJson("/api/restaurants/{$restaurantId}/reservation-availability/tables?start=2026-11-24T13:00&party_size=4");
        $slotTablesResp->assertStatus(200)
            ->assertJsonPath('data.bookable', false)
            ->assertJsonPath('data.reason_code', ReservationAvailabilityService::REASON_FULLY_BOOKED)
            ->assertJsonCount(1, 'data.suggested_alternatives')
            ->assertJsonPath('data.suggested_alternatives.0.time', '14:30');

        // NO_FIT when party_size = 1 (since T-01 has min_party_size = 2)
        $noFitResp = $this->getJson("/api/restaurants/{$restaurantId}/reservation-availability?date=2026-11-25&party_size=1");
        $noFitResp->assertStatus(200)
            ->assertJsonPath('data.bookable', false)
            ->assertJsonPath('data.reason_code', ReservationAvailabilityService::REASON_NO_FIT);

        // Closure on 2026-11-26
        DB::table('restaurant_closures')->insert([
            'restaurant_id' => $restaurantId,
            'closure_date' => '2026-11-26',
            'reason' => 'Holiday Closure',
        ]);

        // 4. Month overview + bounded query count check (<= 6 SQL queries for the whole 30-day month)
        DB::flushQueryLog();
        DB::enableQueryLog();
        $monthResp = $this->getJson("/api/restaurants/{$restaurantId}/reservation-availability/month?month=2026-11&party_size=4");
        $monthQueryCount = count(DB::getQueryLog());
        $this->assertLessThanOrEqual(6, $monthQueryCount, "Expected bounded query count for month overview, got {$monthQueryCount}.");

        $monthResp->assertStatus(200)
            ->assertJsonPath('data.bookable', true);

        $daysByDate = collect($monthResp->json('data.days'))->keyBy('date');
        $this->assertSame('unavailable', $daysByDate['2026-11-22']['status']); // past
        $this->assertSame('PAST_TIME', $daysByDate['2026-11-22']['reason_code']);
        $this->assertSame('available', $daysByDate['2026-11-23']['status']); // 3/6 = 50%
        $this->assertSame('limited', $daysByDate['2026-11-24']['status']); // 1/6 = 16.7% <= 25%
        $this->assertSame('available', $daysByDate['2026-11-25']['status']); // 6/6 = 100%
        $this->assertSame('closed', $daysByDate['2026-11-26']['status']); // closure

        // 5. Malformed params -> 422; unknown/inactive restaurant -> 404
        $this->getJson("/api/restaurants/{$restaurantId}/reservation-availability?date=invalid&party_size=0")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['date', 'party_size']);

        $this->getJson("/api/restaurants/{$restaurantId}/reservation-availability/month?month=2026-13&party_size=2")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['month']);

        $this->getJson("/api/restaurants/{$restaurantId}/reservation-availability/tables?start=not-a-date&party_size=2")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['start']);

        $this->getJson('/api/restaurants/99999999/reservation-info')
            ->assertStatus(404);

        // Verify throttle:60,1 middleware is attached
        $route = collect(Route::getRoutes()->getRoutes())->first(
            static fn ($r): bool => $r->uri() === 'api/restaurants/{id}/reservation-info'
        );
        $this->assertNotNull($route);
        $this->assertContains('throttle:60,1', $route->gatherMiddleware());
    }

    public function test_restaurant_details_and_list_expose_reservation_policy_fields_and_can_reserve(): void
    {
        $this->freezeManilaTime('2026-11-23 12:00:00');
        $restaurantId = $this->createPublishedRestaurantWithMenu([
            'accepts_reservations' => 1,
            'accepting_reservations' => 1,
            'reservation_min_notice_hours' => 3,
            'reservation_max_party_size' => 10,
            'reservation_notes' => 'Valet parking available.',
            'reservation_duration_minutes' => 120,
            'reservation_deposit_required' => 1,
            'reservation_deposit_amount' => '300.00',
            'reservation_service_fee' => '50.00',
        ]);

        // Without active tables, can_reserve is false
        $this->getJson("/api/restaurants/{$restaurantId}")
            ->assertStatus(200)
            ->assertJsonPath('data.restaurant.can_reserve', false)
            ->assertJsonPath('data.restaurant.availability.can_reserve', false)
            ->assertJsonPath('data.restaurant.reservation_min_notice_hours', 3)
            ->assertJsonPath('data.restaurant.reservation_max_party_size', 10)
            ->assertJsonPath('data.restaurant.reservation_notes', 'Valet parking available.')
            ->assertJsonPath('data.restaurant.reservation_duration_minutes', 120)
            ->assertJsonPath('data.restaurant.reservation_deposit_required', true)
            ->assertJsonPath('data.restaurant.reservation_deposit_amount', '300.00')
            ->assertJsonPath('data.restaurant.reservation_service_fee', '50.00');

        // Add an active table -> can_reserve becomes true
        $this->insertTable($restaurantId, 'T-01', 4, 1, 'Indoor', true);

        $this->getJson("/api/restaurants/{$restaurantId}")
            ->assertStatus(200)
            ->assertJsonPath('data.restaurant.can_reserve', true)
            ->assertJsonPath('data.restaurant.availability.can_reserve', true);
    }

    public function test_availability_service_regression_open_closed_overnight_behavior_unchanged(): void
    {
        $service = app(AvailabilityService::class);
        $restaurant = (object) [
            'accepting_orders' => 1,
            'accepts_reservations' => 1,
            'accepting_reservations' => 1,
            'active_tables_count' => 2,
        ];

        $hours = collect([
            (object) [
                'day_of_week' => 5,
                'opening_time' => '22:00:00',
                'closing_time' => '02:00:00',
                'closes_next_day' => 1,
                'is_closed' => 0,
            ],
        ]);

        $satEarlyManila = Carbon::create(2026, 11, 21, 1, 15, 0, 'Asia/Manila');
        $computed = $service->compute($restaurant, $hours, collect(), $satEarlyManila);
        $this->assertTrue($computed['is_open']);
        $this->assertSame('Open', $computed['status_label']);
        $this->assertTrue($computed['can_reserve']);
    }

    private function freezeManilaTime(string $dateTime): void
    {
        $manila = Carbon::parse($dateTime, 'Asia/Manila');
        Carbon::setTestNow($manila);
        CarbonImmutable::setTestNow(CarbonImmutable::instance($manila));
    }

    private function insertDailyOperatingHours(int $restaurantId, string $open, string $close, bool $closesNextDay = false): void
    {
        $rows = [];
        for ($dow = 0; $dow <= 6; $dow++) {
            $rows[] = [
                'restaurant_id' => $restaurantId,
                'day_of_week' => $dow,
                'opening_time' => $open,
                'closing_time' => $close,
                'closes_next_day' => $closesNextDay ? 1 : 0,
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

    private function insertReservation(
        int $restaurantId,
        int $tableId,
        int $customerId,
        string $start,
        string $end,
        int $guests,
        string $status,
        ?string $createdAt = null,
    ): int {
        return (int) DB::table('reservations')->insertGetId([
            'reservation_reference' => 'SALO-RES-' . strtoupper(substr(md5(uniqid('', true)), 0, 8)),
            'customer_id' => $customerId,
            'restaurant_id' => $restaurantId,
            'table_id' => $tableId,
            'contact_name' => 'Test Guest',
            'contact_phone' => '+63 917 000 0000',
            'reservation_start' => $start,
            'reservation_end' => $end,
            'number_of_guests' => $guests,
            'reservation_status' => $status,
            'created_at' => $createdAt ?? now('Asia/Manila')->format('Y-m-d H:i:s'),
            'updated_at' => $createdAt ?? now('Asia/Manila')->format('Y-m-d H:i:s'),
        ]);
    }

    private function createUser(string $email): User
    {
        return User::create([
            'username' => 'user_' . substr(md5($email . uniqid()), 0, 14),
            'email' => $email,
            'password_hash' => Hash::make('Password123!'),
            'first_name' => 'Test',
            'last_name' => 'User',
            'phone_number' => '+63 917 123 4567',
            'user_role' => 'customer',
            'email_verified_at' => now(),
            'account_status' => 'active',
        ]);
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
            'restaurant_name' => 'Availability Bistro ' . uniqid(),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'avail-bistro-' . uniqid() . '@salo.local',
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

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createPublishedRestaurantWithMenu(array $overrides = []): int
    {
        $restaurantId = $this->createRestaurant($overrides);

        $catId = (int) DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $restaurantId,
            'category_name' => 'Mains',
            'published_category_name' => 'Mains',
            'sort_order' => 1,
            'published_sort_order' => 1,
            'is_active' => 1,
            'published_is_active' => 1,
            'is_published' => 1,
            'draft_state' => 'clean',
        ]);

        DB::table('menu_items')->insert([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'published_menu_category_id' => $catId,
            'item_name' => 'Adobo',
            'published_item_name' => 'Adobo',
            'base_price' => 180.00,
            'published_base_price' => 180.00,
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'sort_order' => 1,
            'published_sort_order' => 1,
            'is_published' => 1,
            'draft_state' => 'clean',
        ]);

        return $restaurantId;
    }
}
