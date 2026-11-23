<?php

namespace Tests\Feature;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Reservations\Services\ReservationAvailabilityService;
use App\Features\Reservations\Support\ReservationStatus;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ReservationSecurityTest extends TestCase
{
    use DatabaseTransactions;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    /**
     * @return array<string, array{0: string, 1: string, 2: string, 3: int}>
     */
    public static function routeMatrixProvider(): array
    {
        return [
            'public info unauth' => ['GET', '/api/restaurants/{restA}/reservation-info', 'anon', 200],
            'customer list unauth' => ['GET', '/api/customer/reservations', 'anon', 401],
            'customer list suspended' => ['GET', '/api/customer/reservations', 'suspended_customer', 403],
            'owner list unauth' => ['GET', '/api/restaurant/reservations', 'anon', 401],
            'owner list plain customer' => ['GET', '/api/restaurant/reservations', 'customer', 403],
            'owner list permitted staff' => ['GET', '/api/restaurant/reservations', 'staff_ok', 200],
            'owner list unpermitted staff' => ['GET', '/api/restaurant/reservations', 'staff_no_perm', 403],
            'owner list inactive staff' => ['GET', '/api/restaurant/reservations', 'staff_inactive', 403],
            'owner settings patch staff forbidden' => ['PATCH', '/api/restaurant/settings', 'staff_ok', 403],
            'owner settings patch owner ok' => ['PATCH', '/api/restaurant/settings', 'ownerA', 200],
            'admin list plain customer' => ['GET', '/api/admin/reservations', 'customer', 403],
            'admin list admin ok' => ['GET', '/api/admin/reservations', 'admin', 200],
        ];
    }

    #[DataProvider('routeMatrixProvider')]
    public function test_route_rbac_matrix(string $method, string $uriTemplate, string $actorKey, int $expectedStatus): void
    {
        [$actors, $restAId] = $this->seedSecurityActors();
        $uri = str_replace('{restA}', (string) $restAId, $uriTemplate);

        $payload = $method === 'PATCH' ? ['reservation_duration_minutes' => 90] : [];

        if ($actorKey === 'anon') {
            $res = $this->json($method, $uri, $payload);
        } else {
            $res = $this->actingAs($actors[$actorKey])
                ->withHeader('X-Restaurant-Id', (string) $restAId)
                ->json($method, $uri, $payload);
        }

        $res->assertStatus($expectedStatus);
    }

    public function test_header_spoofing_cross_tenant_404_and_no_table_id_leak(): void
    {
        [$actors, $restAId, $restBId, $tableAId, $tableBId] = $this->seedSecurityActors();

        // Owner A spoofing X-Restaurant-Id = restB -> 403
        $this->actingAs($actors['ownerA'])
            ->withHeader('X-Restaurant-Id', (string) $restBId)
            ->getJson('/api/restaurant/reservations')
            ->assertStatus(403);

        // Staff of A spoofing restaurant_id = restB -> 403
        $this->actingAs($actors['staff_ok'])
            ->getJson('/api/restaurant/tables?restaurant_id='.$restBId)
            ->assertStatus(403);

        // Customer cannot pass restB's table_id to restA booking -> 409 NO_FIT (no leak)
        $now = CarbonImmutable::create(2026, 11, 23, 10, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        $this->actingAs($actors['customer'])
            ->postJson('/api/customer/reservations', [
                'restaurant_id' => $restAId,
                'start' => '2026-11-24T18:00',
                'party_size' => 2,
                'table_id' => $tableBId,
                'idempotency_key' => 'noleak-'.random_int(1000, 9999),
            ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'NO_FIT');

        // Create valid reservation at restA and verify cross-tenant 404
        $created = $this->actingAs($actors['customer'])
            ->postJson('/api/customer/reservations', [
                'restaurant_id' => $restAId,
                'start' => '2026-11-24T18:00',
                'party_size' => 2,
                'idempotency_key' => 'cross-'.random_int(1000, 9999),
            ])
            ->assertStatus(201);
        $resId = (int) $created->json('data.reservation.reservation_id');

        // Owner B accessing restA's reservation or table -> 404
        $this->actingAs($actors['ownerB'])
            ->withHeader('X-Restaurant-Id', (string) $restBId)
            ->getJson("/api/restaurant/reservations/{$resId}")
            ->assertStatus(404);

        $this->actingAs($actors['ownerB'])
            ->withHeader('X-Restaurant-Id', (string) $restBId)
            ->getJson("/api/restaurant/tables/{$tableAId}")
            ->assertStatus(404);

        // Owner A trying to assign restB's table to restA's reservation -> 409 TABLE_UNAVAILABLE (no leak)
        $this->actingAs($actors['ownerA'])
            ->withHeader('X-Restaurant-Id', (string) $restAId)
            ->patchJson("/api/restaurant/reservations/{$resId}/table", ['table_id' => $tableBId])
            ->assertStatus(409)
            ->assertJsonPath('code', 'TABLE_UNAVAILABLE');

        // Another customer accessing this reservation -> 404
        $this->actingAs($actors['other_customer'])
            ->getJson("/api/customer/reservations/{$resId}")
            ->assertStatus(404);
    }

    public function test_mass_assignment_and_idempotency_key_reuse_and_privacy(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 10, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [$actors, $restAId, $restBId] = $this->seedSecurityActors();

        $key = 'idem-sec-'.random_int(1000, 9999);
        $res = $this->actingAs($actors['customer'])
            ->postJson('/api/customer/reservations', [
                'restaurant_id' => $restAId,
                'start' => '2026-11-24T18:00',
                'party_size' => 2,
                'idempotency_key' => $key,
                // Attempted mass-assignment spoofs:
                'reservation_status' => 'confirmed',
                'deposit_status' => 'paid',
                'deposit_amount' => 0,
                'service_fee' => 0,
                'customer_id' => $actors['other_customer']->user_id,
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.reservation.reservation_status', ReservationStatus::PENDING)
            ->assertJsonPath('data.reservation.deposit_status', 'none');

        $payload = $res->json('data.reservation');
        $this->assertArrayNotHasKey('no_show_marked_by', $payload);
        if (! empty($payload['status_history'])) {
            $this->assertArrayNotHasKey('changed_by_user_id', $payload['status_history'][0]);
        }

        // Same key + different payload -> 409 IDEMPOTENCY_KEY_REUSED
        $this->actingAs($actors['customer'])
            ->postJson('/api/customer/reservations', [
                'restaurant_id' => $restBId,
                'start' => '2026-11-24T18:00',
                'party_size' => 2,
                'idempotency_key' => $key,
            ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'IDEMPOTENCY_KEY_REUSED');

        // Same key + different customer -> independent 201
        $this->actingAs($actors['other_customer'])
            ->postJson('/api/customer/reservations', [
                'restaurant_id' => $restBId,
                'start' => '2026-11-24T18:00',
                'party_size' => 2,
                'idempotency_key' => $key,
            ])
            ->assertStatus(201);
    }

    public function test_input_bounds_corrupt_hours_guard_public_privacy_and_midnight_booking(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 22, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [$actors, $restAId, $restBId] = $this->seedSecurityActors();

        // Owner list 366-day cap
        $this->actingAs($actors['ownerA'])
            ->withHeader('X-Restaurant-Id', (string) $restAId)
            ->getJson('/api/restaurant/reservations?date_from=2025-01-01&date_to=2026-01-05')
            ->assertStatus(422);

        // Invalid phone & party_size bounds
        $this->actingAs($actors['customer'])
            ->postJson('/api/customer/reservations', [
                'restaurant_id' => $restAId,
                'start' => '2026-11-25T18:00',
                'party_size' => 101,
                'contact_phone' => 'invalid<script>',
                'idempotency_key' => 'bounds-'.random_int(1000, 9999),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['party_size', 'contact_phone']);

        // Corrupt operating_hours guard: slot generation capped at <= 96 and finishes fast
        $avail = app(ReservationAvailabilityService::class)->generateSlots([
            'restaurant_id' => $restAId,
            'reservation_duration_minutes' => 15,
            'slot_interval_minutes' => 15,
        ], '2026-11-25');
        $this->assertLessThanOrEqual(96, count($avail));

        // Unpublished restaurant -> 404 on public availability
        DB::table('restaurants')->where('restaurant_id', $restBId)->update(['is_published' => 0]);
        $this->getJson("/api/restaurants/{$restBId}/reservation-info")->assertStatus(404);
        $this->getJson("/api/restaurants/{$restBId}/reservation-availability?date=2026-11-25&party_size=2")->assertStatus(404);

        // Public availability response leaks no customer fields
        $pub = $this->getJson("/api/restaurants/{$restAId}/reservation-availability?date=2026-11-25&party_size=2")
            ->assertOk();
        $json = json_encode($pub->json('data'));
        $this->assertStringNotContainsString('customer_id', (string) $json);
        $this->assertStringNotContainsString('contact_phone', (string) $json);

        // Midnight booking in Asia/Manila (23:30 on 2026-11-25 -> ends 01:00 on 2026-11-26)
        $this->actingAs($actors['customer'])
            ->postJson('/api/customer/reservations', [
                'restaurant_id' => $restAId,
                'start' => '2026-11-25T23:30',
                'party_size' => 2,
                'idempotency_key' => 'midnight-'.random_int(1000, 9999),
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.reservation.reservation_date', '2026-11-25');
    }

    public function test_atomic_rollback_on_notification_failure_and_throttles_registered(): void
    {
        $now = CarbonImmutable::create(2026, 11, 23, 10, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        [$actors, $restAId] = $this->seedSecurityActors();

        $created = $this->actingAs($actors['customer'])
            ->postJson('/api/customer/reservations', [
                'restaurant_id' => $restAId,
                'start' => '2026-11-24T18:00',
                'party_size' => 2,
                'idempotency_key' => 'atomic-'.random_int(1000, 9999),
            ])
            ->assertStatus(201);
        $resId = (int) $created->json('data.reservation.reservation_id');

        // Force NotificationService::notifyUser to throw during approve -> whole transaction rolls back
        $mockNotif = $this->createMock(NotificationService::class);
        $mockNotif->method('notifyUser')->willThrowException(new \RuntimeException('Forced notification failure'));
        $this->app->instance(NotificationService::class, $mockNotif);

        $this->actingAs($actors['ownerA'])
            ->withHeader('X-Restaurant-Id', (string) $restAId)
            ->postJson("/api/restaurant/reservations/{$resId}/approve")
            ->assertStatus(500);

        $this->assertSame(ReservationStatus::PENDING, DB::table('reservations')->where('reservation_id', $resId)->value('reservation_status'));
        $this->assertSame(0, DB::table('reservation_status_history')->where('reservation_id', $resId)->where('to_status', ReservationStatus::CONFIRMED)->count());

        // Verify mutation throttles are registered
        $routes = collect(Route::getRoutes()->getRoutes());
        $cancelRoute = $routes->first(static fn ($r): bool => $r->uri() === 'api/customer/reservations/{id}/cancel');
        $approveRoute = $routes->first(static fn ($r): bool => $r->uri() === 'api/restaurant/reservations/{id}/approve');
        $this->assertContains('throttle:30,1', $cancelRoute->gatherMiddleware());
        $this->assertContains('throttle:60,1', $approveRoute->gatherMiddleware());
    }

    /**
     * @return array{0: array<string, User>, 1: int, 2: int, 3: int, 4: int}
     */
    private function seedSecurityActors(): array
    {
        $ownerA = $this->createUser('sec_own_a@salo.local');
        $ownerB = $this->createUser('sec_own_b@salo.local');
        $staffOk = $this->createUser('sec_stf_ok@salo.local');
        $staffNoPerm = $this->createUser('sec_stf_nop@salo.local');
        $staffInactive = $this->createUser('sec_stf_in@salo.local');
        $customer = $this->createUser('sec_cust@salo.local');
        $otherCust = $this->createUser('sec_cust2@salo.local');
        $suspCust = $this->createUser('sec_susp@salo.local', 'customer', 'suspended');
        $admin = $this->createUser('sec_adm@salo.local', 'admin');

        $barangayId = (int) DB::table('barangays')->value('barangay_id');
        $addressId = DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '789 Security St',
            'postal_code' => '1000',
        ]);

        $restAId = DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Sec Rest A '.random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'seca_'.random_int(1000, 9999).'@salo.local',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
            'offers_dine_in' => 1,
            'accepts_reservations' => 1,
            'accepting_reservations' => 1,
            'is_published' => 1,
            'reservation_min_notice_hours' => 0,
        ]);

        $restBId = DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Sec Rest B '.random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'secb_'.random_int(1000, 9999).'@salo.local',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
            'offers_dine_in' => 1,
            'accepts_reservations' => 1,
            'accepting_reservations' => 1,
            'is_published' => 1,
            'reservation_min_notice_hours' => 0,
        ]);

        DB::table('restaurant_owners')->insert([
            ['restaurant_id' => $restAId, 'user_id' => $ownerA->user_id],
            ['restaurant_id' => $restBId, 'user_id' => $ownerB->user_id],
        ]);

        DB::table('restaurant_staff')->insert([
            ['restaurant_id' => $restAId, 'user_id' => $staffOk->user_id, 'staff_position' => 'Reservation Handler', 'staff_status' => 'active'],
            ['restaurant_id' => $restAId, 'user_id' => $staffNoPerm->user_id, 'staff_position' => 'Inventory Manager', 'staff_status' => 'active'],
            ['restaurant_id' => $restAId, 'user_id' => $staffInactive->user_id, 'staff_position' => 'Reservation Handler', 'staff_status' => 'inactive'],
        ]);

        foreach ([$restAId, $restBId] as $rid) {
            for ($d = 0; $d < 7; $d++) {
                DB::table('operating_hours')->insert([
                    'restaurant_id' => $rid,
                    'day_of_week' => $d,
                    'opening_time' => '00:00:00',
                    'closing_time' => '23:59:59',
                    'closes_next_day' => 1,
                    'is_closed' => 0,
                ]);
            }
        }

        $tableAId = DB::table('restaurant_tables')->insertGetId([
            'restaurant_id' => $restAId,
            'table_name' => 'SA-1',
            'dining_area' => 'Indoor',
            'seating_capacity' => 4,
            'min_party_size' => 1,
            'is_active' => 1,
        ]);

        $tableBId = DB::table('restaurant_tables')->insertGetId([
            'restaurant_id' => $restBId,
            'table_name' => 'SB-1',
            'dining_area' => 'Indoor',
            'seating_capacity' => 4,
            'min_party_size' => 1,
            'is_active' => 1,
        ]);

        return [
            [
                'ownerA' => $ownerA,
                'ownerB' => $ownerB,
                'staff_ok' => $staffOk,
                'staff_no_perm' => $staffNoPerm,
                'staff_inactive' => $staffInactive,
                'customer' => $customer,
                'other_customer' => $otherCust,
                'suspended_customer' => $suspCust,
                'admin' => $admin,
            ],
            $restAId,
            $restBId,
            $tableAId,
            $tableBId,
        ];
    }

    private function createUser(string $email, string $role = 'customer', string $status = 'active'): User
    {
        return User::forceCreate([
            'username' => explode('@', $email)[0].'_'.random_int(100, 999),
            'first_name' => 'Sec',
            'last_name' => 'Tester',
            'email' => $email,
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => $status,
        ]);
    }
}
