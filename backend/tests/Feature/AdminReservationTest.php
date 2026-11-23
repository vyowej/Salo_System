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

class AdminReservationTest extends TestCase
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
    public static function adminEndpointProvider(): array
    {
        return [
            'list' => ['/api/admin/reservations'],
            'stats' => ['/api/admin/reservations/stats'],
            'detail' => ['/api/admin/reservations/1'],
        ];
    }

    /**
     * @return array<string, array{0: string, 1: string, 2: int}>
     */
    public static function readOnlyMutationProvider(): array
    {
        return [
            'post collection' => ['postJson', '/api/admin/reservations', 405],
            'patch detail' => ['patchJson', '/api/admin/reservations/1', 405],
            'delete detail' => ['deleteJson', '/api/admin/reservations/1', 405],
            'post cancel' => ['postJson', '/api/admin/reservations/1/cancel', 404],
        ];
    }

    #[DataProvider('adminEndpointProvider')]
    public function test_unauthenticated_requests_are_rejected(string $uri): void
    {
        $this->getJson($uri)->assertStatus(401);
    }

    #[DataProvider('adminEndpointProvider')]
    public function test_non_admin_users_are_rejected(string $uri): void
    {
        $customer = $this->createUser('customer');
        $owner = $this->createUser('customer');
        $staff = $this->createUser('customer');

        foreach ([$customer, $owner, $staff] as $user) {
            $this->actingAs($user)->getJson($uri)->assertStatus(403);
        }
    }

    public function test_list_returns_default_window_summary_and_disables_admin_cancel(): void
    {
        $fixedNow = $this->freezeNow();
        [$admin, $fixtures] = $this->seedFixtures($fixedNow);

        $defaultRes = $this->actingAs($admin)
            ->getJson('/api/admin/reservations?restaurant_id='.$fixtures['rest1Id'])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.meta.date_from', $fixedNow->subDays(30)->format('Y-m-d'))
            ->assertJsonPath('data.meta.date_to', $fixedNow->addDays(30)->format('Y-m-d'))
            ->assertJsonPath('data.summary.total', 4);

        foreach ($defaultRes->json('data.items') as $item) {
            $this->assertFalse($item['can_admin_cancel']);
        }
    }

    public function test_list_rejects_date_ranges_exceeding_366_days(): void
    {
        $admin = $this->createUser('admin');

        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?date_from=2025-01-01&date_to=2026-01-05')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['date_to']);
    }

    public function test_list_supports_search_across_reference_guest_phone_email_and_restaurant(): void
    {
        $fixedNow = $this->freezeNow();
        [$admin, $fixtures] = $this->seedFixtures($fixedNow);

        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?search='.urlencode($fixtures['ref1']))
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.reservation_id', $fixtures['res1Id']);

        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?search='.urlencode('Mateo Guest'))
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.reservation_id', $fixtures['res2Id']);

        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?search='.urlencode('09173334444'))
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.reservation_id', $fixtures['res3Id']);

        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?search='.urlencode($fixtures['customerEmail']))
            ->assertOk()
            ->assertJsonPath('data.meta.total', 5);

        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?search='.urlencode('Intramuros Bistro'))
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.reservation_id', $fixtures['res3Id']);
    }

    public function test_list_filters_by_status_and_deposit_status(): void
    {
        $fixedNow = $this->freezeNow();
        [$admin, $fixtures] = $this->seedFixtures($fixedNow);

        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?status=completed&restaurant_id='.$fixtures['rest1Id'])
            ->assertOk()
            ->assertJsonCount(1, 'data.items');

        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?status=completed,seated&restaurant_id='.$fixtures['rest1Id'])
            ->assertOk()
            ->assertJsonCount(2, 'data.items');

        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?deposit_status=paid&restaurant_id='.$fixtures['rest1Id'])
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.reservation_id', $fixtures['res1Id']);
    }

    public function test_list_filters_by_group_including_attention_rules(): void
    {
        $fixedNow = $this->freezeNow();
        [$admin, $fixtures] = $this->seedFixtures($fixedNow);

        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?group=pending&restaurant_id='.$fixtures['rest1Id'])
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.reservation_id', $fixtures['res2Id']);

        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?group=active&restaurant_id='.$fixtures['rest1Id'])
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.reservation_id', $fixtures['res4Id']);

        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?group=history&restaurant_id='.$fixtures['rest1Id'])
            ->assertOk()
            ->assertJsonCount(2, 'data.items');

        // Attention group contains ONLY stale pending (res2), no-show candidate (res3), overdue seated (res4)
        $attRes = $this->actingAs($admin)
            ->getJson('/api/admin/reservations?group=attention&search='.urlencode($fixtures['customerEmail']))
            ->assertOk()
            ->assertJsonCount(3, 'data.items');

        $attIds = collect($attRes->json('data.items'))->pluck('reservation_id')->sort()->values()->all();
        $expectedAttIds = [$fixtures['res2Id'], $fixtures['res3Id'], $fixtures['res4Id']];
        sort($expectedAttIds);
        $this->assertSame($expectedAttIds, $attIds);
    }

    public function test_list_supports_sorting_and_pagination_with_independent_summary(): void
    {
        $fixedNow = $this->freezeNow();
        [$admin, $fixtures] = $this->seedFixtures($fixedNow);

        $sortedAsc = $this->actingAs($admin)
            ->getJson('/api/admin/reservations?restaurant_id='.$fixtures['rest1Id'].'&sort=party_size&direction=asc')
            ->assertOk();
        $this->assertSame(2, $sortedAsc->json('data.items.0.party_size'));

        $paged = $this->actingAs($admin)
            ->getJson('/api/admin/reservations?restaurant_id='.$fixtures['rest1Id'].'&per_page=1&page=2')
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.meta.total', 4)
            ->assertJsonPath('data.meta.last_page', 4)
            ->assertJsonPath('data.summary.total', 4)
            ->assertJsonPath('data.summary.completed_count', 1)
            ->assertJsonPath('data.summary.pending_count', 1);

        $this->assertSame(15, $paged->json('data.summary.total_guests'));
    }

    public function test_list_query_count_is_bounded_for_20_rows(): void
    {
        $fixedNow = $this->freezeNow();
        [$admin, $fixtures] = $this->seedFixtures($fixedNow);
        $this->insertBulkReservations($fixtures['rest1Id'], $fixtures['customerId'], $fixedNow, 20);

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?per_page=20&restaurant_id='.$fixtures['rest1Id'])
            ->assertOk()
            ->assertJsonCount(20, 'data.items');
        $queryCount = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertLessThanOrEqual(4, $queryCount);
    }

    public function test_detail_returns_ordered_history_with_actor_name_customer_history_and_settings(): void
    {
        $fixedNow = $this->freezeNow();
        [$admin, $fixtures] = $this->seedFixtures($fixedNow);

        $detail = $this->actingAs($admin)
            ->getJson('/api/admin/reservations/'.$fixtures['res1Id'])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.reservation.reservation_id', $fixtures['res1Id'])
            ->assertJsonPath('data.reservation.can_admin_cancel', false)
            ->assertJsonPath('data.reservation.status_history.0.actor_name', 'Admin Tester')
            ->assertJsonPath('data.reservation.customer_history.total_reservations', 5)
            ->assertJsonPath('data.reservation.customer_history.visits', 1)
            ->assertJsonPath('data.reservation.customer_history.cancellations', 1)
            ->assertJsonPath('data.reservation.restaurant_settings.duration_minutes', 90);

        $this->assertNotNull($detail->json('data.reservation.completed_at'));
    }

    public function test_detail_returns_404_for_missing_reservation(): void
    {
        $admin = $this->createUser('admin');

        $this->actingAs($admin)
            ->getJson('/api/admin/reservations/999999999')
            ->assertStatus(404);
    }

    public function test_stats_computes_exact_rates_zero_filled_days_by_hour_top_restaurants_and_deposits(): void
    {
        $fixedNow = $this->freezeNow();
        [$admin, $fixtures] = $this->seedFixtures($fixedNow);

        $dateFrom = $fixedNow->subDays(3)->format('Y-m-d');
        $dateTo = $fixedNow->addDays(1)->format('Y-m-d');

        // Hand-computed expectations for rest1 (4 reservations in range: 1 completed, 1 pending, 1 seated, 1 cancelled):
        // completed=1, no_show=0, cancelled_total=1, total=4, covers=15, avg_party=3.8
        // no_show_rate = 0/(1+0)*100 = 0.0
        // cancellation_rate = 1/4*100 = 25.0
        // completion_rate = 1/(1+0+1)*100 = 50.0
        // confirmation_rate = (0+0+1+1+0)/4*100 = 50.0
        $stats = $this->actingAs($admin)
            ->getJson("/api/admin/reservations/stats?date_from={$dateFrom}&date_to={$dateTo}&restaurant_id={$fixtures['rest1Id']}")
            ->assertOk()
            ->assertJsonPath('data.totals.total', 4)
            ->assertJsonPath('data.totals.completed', 1)
            ->assertJsonPath('data.totals.no_show', 0)
            ->assertJsonPath('data.totals.cancelled_total', 1)
            ->assertJsonPath('data.totals.covers_total', 15)
            ->assertJsonPath('data.totals.average_party_size', 3.8)
            ->assertJsonPath('data.rates.no_show_rate', 0)
            ->assertJsonPath('data.rates.cancellation_rate', 25)
            ->assertJsonPath('data.rates.completion_rate', 50)
            ->assertJsonPath('data.rates.confirmation_rate', 50)
            ->assertJsonPath('data.by_cancelled_by.customer', 1)
            ->assertJsonPath('data.deposits.paid_count', 1)
            ->assertJsonPath('data.deposits.total_deposit_amount_paid', 500)
            ->assertJsonPath('data.service_fee_total', 50)
            ->assertJsonPath('data.attention_count', 2)
            ->assertJsonCount(5, 'data.by_day')
            ->assertJsonCount(24, 'data.by_hour');

        $this->assertArrayHasKey('expired', $stats->json('data.totals.by_status'));
        $this->assertArrayHasKey('no_show_rate', $stats->json('data.rates.definitions'));
        $this->assertSame('Malate Heritage Kitchen', $stats->json('data.top_restaurants.0.name'));
    }

    public function test_stats_handles_zero_data_range_without_division_errors(): void
    {
        $fixedNow = $this->freezeNow();
        [$admin, $fixtures] = $this->seedFixtures($fixedNow);

        $this->actingAs($admin)
            ->getJson('/api/admin/reservations/stats?date_from=2024-01-01&date_to=2024-01-03&restaurant_id='.$fixtures['rest1Id'])
            ->assertOk()
            ->assertJsonPath('data.totals.total', 0)
            ->assertJsonPath('data.rates.no_show_rate', 0)
            ->assertJsonPath('data.rates.cancellation_rate', 0)
            ->assertJsonPath('data.rates.completion_rate', 0)
            ->assertJsonPath('data.rates.confirmation_rate', 0)
            ->assertJsonCount(3, 'data.by_day')
            // attention_count ignores date range
            ->assertJsonPath('data.attention_count', 2);
    }

    public function test_stats_uses_fixed_query_count_regardless_of_reservation_volume(): void
    {
        $fixedNow = $this->freezeNow();
        [$admin, $fixtures] = $this->seedFixtures($fixedNow);

        $dateFrom = $fixedNow->subDays(3)->format('Y-m-d');
        $dateTo = $fixedNow->addDays(1)->format('Y-m-d');

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($admin)
            ->getJson("/api/admin/reservations/stats?date_from={$dateFrom}&date_to={$dateTo}&restaurant_id={$fixtures['rest1Id']}")
            ->assertOk();
        $queriesBefore = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->insertBulkReservations($fixtures['rest1Id'], $fixtures['customerId'], $fixedNow, 46);

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($admin)
            ->getJson("/api/admin/reservations/stats?date_from={$dateFrom}&date_to={$dateTo}&restaurant_id={$fixtures['rest1Id']}")
            ->assertOk()
            ->assertJsonPath('data.totals.total', 50);
        $queriesAfter = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertSame($queriesBefore, $queriesAfter);
    }

    #[DataProvider('readOnlyMutationProvider')]
    public function test_admin_reservation_routes_are_strictly_read_only(string $method, string $uri, int $expectedStatus): void
    {
        $admin = $this->createUser('admin');

        $response = $method === 'deleteJson'
            ? $this->actingAs($admin)->deleteJson($uri)
            : $this->actingAs($admin)->{$method}($uri, []);

        $response->assertStatus($expectedStatus);
    }

    private function freezeNow(): CarbonImmutable
    {
        $fixedNow = CarbonImmutable::create(2026, 11, 22, 14, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($fixedNow);
        CarbonImmutable::setTestNow($fixedNow);

        return $fixedNow;
    }

    private function createUser(string $role): User
    {
        $suffix = random_int(10000, 99999);

        return User::create([
            'username' => "{$role}_admres_{$suffix}",
            'first_name' => ucfirst($role),
            'last_name' => 'Tester',
            'email' => "{$role}_admres_{$suffix}@example.com",
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    /**
     * @return array{0: User, 1: array<string, mixed>}
     */
    private function seedFixtures(CarbonImmutable $now): array
    {
        $admin = $this->createUser('admin');
        $customer = $this->createUser('customer');

        $barangayId = (int) DB::table('barangays')->value('barangay_id');
        $addressId = DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '100 Test St',
            'postal_code' => '1000',
        ]);

        $rest1Id = DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Malate Heritage Kitchen',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'malate_'.random_int(100, 999).'@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
            'accepts_reservations' => 1,
            'accepting_reservations' => 1,
            'reservation_pending_expiry_minutes' => 120,
            'reservation_duration_minutes' => 90,
        ]);

        $rest2Id = DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Intramuros Bistro',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'intra_'.random_int(100, 999).'@example.com',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
            'accepts_reservations' => 1,
            'accepting_reservations' => 1,
            'reservation_pending_expiry_minutes' => 120,
        ]);

        $ref1 = 'SALO-RES-ADM-'.random_int(1000, 9999);
        $res1Id = DB::table('reservations')->insertGetId([
            'reservation_reference' => $ref1,
            'customer_id' => $customer->user_id,
            'restaurant_id' => $rest1Id,
            'contact_name' => 'Clara Santos',
            'contact_phone' => '09171112222',
            'reservation_start' => $now->subDays(1)->setTime(18, 0)->format('Y-m-d H:i:s'),
            'reservation_end' => $now->subDays(1)->setTime(19, 30)->format('Y-m-d H:i:s'),
            'number_of_guests' => 4,
            'reservation_status' => ReservationStatus::COMPLETED,
            'deposit_amount' => 500.00,
            'deposit_status' => 'paid',
            'service_fee' => 50.00,
            'completed_at' => $now->subDays(1)->setTime(19, 30)->format('Y-m-d H:i:s'),
            'created_at' => $now->subDays(2)->format('Y-m-d H:i:s'),
        ]);

        DB::table('reservation_status_history')->insert([
            'reservation_id' => $res1Id,
            'from_status' => null,
            'to_status' => ReservationStatus::COMPLETED,
            'changed_by_user_id' => $admin->user_id,
            'changed_by_role' => 'restaurant',
            'note' => 'Completed dining',
            'created_at' => $now->subDays(1)->setTime(19, 30)->format('Y-m-d H:i:s'),
        ]);

        // Pending expiring (created 100 mins ago with 120m expiry & 30m warning)
        $res2Id = DB::table('reservations')->insertGetId([
            'reservation_reference' => 'SALO-RES-ADM-'.random_int(1000, 9999),
            'customer_id' => $customer->user_id,
            'restaurant_id' => $rest1Id,
            'contact_name' => 'Mateo Guest',
            'contact_phone' => '09172223333',
            'reservation_start' => $now->addHours(3)->format('Y-m-d H:i:s'),
            'reservation_end' => $now->addHours(4)->addMinutes(30)->format('Y-m-d H:i:s'),
            'number_of_guests' => 2,
            'reservation_status' => ReservationStatus::PENDING,
            'created_at' => $now->subMinutes(100)->format('Y-m-d H:i:s'),
        ]);

        // No-show candidate (confirmed 30 mins ago)
        $res3Id = DB::table('reservations')->insertGetId([
            'reservation_reference' => 'SALO-RES-ADM-'.random_int(1000, 9999),
            'customer_id' => $customer->user_id,
            'restaurant_id' => $rest2Id,
            'contact_name' => 'Sofia Diner',
            'contact_phone' => '09173334444',
            'reservation_start' => $now->subMinutes(30)->format('Y-m-d H:i:s'),
            'reservation_end' => $now->addMinutes(60)->format('Y-m-d H:i:s'),
            'number_of_guests' => 3,
            'reservation_status' => ReservationStatus::CONFIRMED,
            'created_at' => $now->subHours(5)->format('Y-m-d H:i:s'),
        ]);

        // Overdue seated (ended 90 mins ago)
        $res4Id = DB::table('reservations')->insertGetId([
            'reservation_reference' => 'SALO-RES-ADM-'.random_int(1000, 9999),
            'customer_id' => $customer->user_id,
            'restaurant_id' => $rest1Id,
            'contact_name' => 'Lucas Seated',
            'contact_phone' => '09174445555',
            'reservation_start' => $now->subMinutes(180)->format('Y-m-d H:i:s'),
            'reservation_end' => $now->subMinutes(90)->format('Y-m-d H:i:s'),
            'number_of_guests' => 6,
            'reservation_status' => ReservationStatus::SEATED,
            'created_at' => $now->subHours(6)->format('Y-m-d H:i:s'),
        ]);

        // Cancelled by customer (rest1)
        DB::table('reservations')->insert([
            'reservation_reference' => 'SALO-RES-ADM-'.random_int(1000, 9999),
            'customer_id' => $customer->user_id,
            'restaurant_id' => $rest1Id,
            'contact_name' => 'Elena Cancelled',
            'contact_phone' => '09175556666',
            'reservation_start' => $now->subDays(2)->setTime(12, 0)->format('Y-m-d H:i:s'),
            'reservation_end' => $now->subDays(2)->setTime(13, 30)->format('Y-m-d H:i:s'),
            'number_of_guests' => 3,
            'reservation_status' => ReservationStatus::CANCELLED,
            'cancelled_by' => 'customer',
            'cancelled_at' => $now->subDays(2)->setTime(10, 0)->format('Y-m-d H:i:s'),
            'created_at' => $now->subDays(3)->format('Y-m-d H:i:s'),
        ]);

        return [
            $admin,
            [
                'customerId' => $customer->user_id,
                'customerEmail' => $customer->email,
                'rest1Id' => $rest1Id,
                'rest2Id' => $rest2Id,
                'res1Id' => $res1Id,
                'res2Id' => $res2Id,
                'res3Id' => $res3Id,
                'res4Id' => $res4Id,
                'ref1' => $ref1,
            ],
        ];
    }

    private function insertBulkReservations(int $restaurantId, int $customerId, CarbonImmutable $now, int $count): void
    {
        $rows = [];
        for ($i = 0; $i < $count; $i++) {
            $rows[] = [
                'reservation_reference' => 'SALO-RES-BLK-'.random_int(100000, 999999).'-'.$i,
                'customer_id' => $customerId,
                'restaurant_id' => $restaurantId,
                'contact_name' => "Bulk Guest {$i}",
                'contact_phone' => '09170000000',
                'reservation_start' => $now->setTime(18, 0)->format('Y-m-d H:i:s'),
                'reservation_end' => $now->setTime(19, 30)->format('Y-m-d H:i:s'),
                'number_of_guests' => 2,
                'reservation_status' => ReservationStatus::COMPLETED,
                'created_at' => $now->subHours(4)->format('Y-m-d H:i:s'),
            ];
        }
        DB::table('reservations')->insert($rows);
    }
}
