<?php

namespace Tests\Feature;

use App\Features\Reservations\Support\ReservationAttention;
use App\Features\Reservations\Support\ReservationStatus;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminReservationTest extends TestCase
{
    use DatabaseTransactions;

    public function test_unauthenticated_and_non_admin_users_are_rejected(): void
    {
        $this->getJson('/api/admin/reservations')->assertStatus(401);
        $this->getJson('/api/admin/reservations/stats')->assertStatus(401);
        $this->getJson('/api/admin/reservations/1')->assertStatus(401);

        $customer = $this->createUser('customer');

        $this->actingAs($customer)->getJson('/api/admin/reservations')->assertStatus(403);
        $this->actingAs($customer)->getJson('/api/admin/reservations/stats')->assertStatus(403);
        $this->actingAs($customer)->getJson('/api/admin/reservations/1')->assertStatus(403);
    }

    public function test_admin_can_list_search_filter_and_paginate_reservations(): void
    {
        [$admin, $fixtures] = $this->seedFixtures();

        $res = $this->actingAs($admin)
            ->getJson('/api/admin/reservations')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'message',
                'data' => [
                    'items' => [
                        '*' => [
                            'reservation_id',
                            'reservation_reference',
                            'reference',
                            'status',
                            'status_label',
                            'party_size',
                            'attention',
                            'can_admin_cancel',
                            'restaurant' => ['restaurant_id', 'name'],
                        ],
                    ],
                    'meta' => ['current_page', 'last_page', 'per_page', 'total'],
                ],
            ]);

        $this->assertGreaterThanOrEqual(4, $res->json('data.meta.total'));

        // Search by reference
        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?search='.urlencode($fixtures['ref1']))
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.reservation_id', $fixtures['res1Id'])
            ->assertJsonPath('data.items.0.can_admin_cancel', false);

        // Search by guest contact name
        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?search='.urlencode('Mateo Guest'))
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.reservation_id', $fixtures['res2Id']);

        // Search by restaurant name
        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?search='.urlencode('Intramuros Bistro'))
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.reservation_id', $fixtures['res3Id']);

        // Filter by status
        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?status=completed&restaurant_id='.$fixtures['rest1Id'])
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.reservation_id', $fixtures['res1Id']);

        // Filter by attention=any and specific attention flags
        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?attention='.ReservationAttention::PENDING_EXPIRING.'&restaurant_id='.$fixtures['rest1Id'])
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.reservation_id', $fixtures['res2Id'])
            ->assertJsonPath('data.items.0.attention', ReservationAttention::PENDING_EXPIRING);

        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?attention='.ReservationAttention::NO_SHOW_CANDIDATE.'&restaurant_id='.$fixtures['rest2Id'])
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.reservation_id', $fixtures['res3Id'])
            ->assertJsonPath('data.items.0.attention', ReservationAttention::NO_SHOW_CANDIDATE);

        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?attention='.ReservationAttention::OVERDUE_SEATED.'&restaurant_id='.$fixtures['rest1Id'])
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.reservation_id', $fixtures['res4Id'])
            ->assertJsonPath('data.items.0.attention', ReservationAttention::OVERDUE_SEATED);

        // Pagination
        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?per_page=2&page=1&restaurant_id='.$fixtures['rest1Id'])
            ->assertOk()
            ->assertJsonCount(2, 'data.items')
            ->assertJsonPath('data.meta.total', 3)
            ->assertJsonPath('data.meta.last_page', 2);

        $this->actingAs($admin)
            ->getJson('/api/admin/reservations?per_page=2&page=2&restaurant_id='.$fixtures['rest1Id'])
            ->assertOk()
            ->assertJsonCount(1, 'data.items');
    }

    public function test_list_and_stats_reject_invalid_query_parameters(): void
    {
        $admin = $this->createUser('admin');

        $this->actingAs($admin)->getJson('/api/admin/reservations?status=bogus')->assertStatus(422);
        $this->actingAs($admin)->getJson('/api/admin/reservations?attention=magic')->assertStatus(422);
        $this->actingAs($admin)->getJson('/api/admin/reservations?per_page=500')->assertStatus(422);
        $this->actingAs($admin)->getJson('/api/admin/reservations?page=0')->assertStatus(422);
        $this->actingAs($admin)->getJson('/api/admin/reservations?direction=sideways')->assertStatus(422);
        $this->actingAs($admin)->getJson('/api/admin/reservations?date_from=2026-10-20&date_to=2026-10-01')->assertStatus(422);

        $this->actingAs($admin)->getJson('/api/admin/reservations/stats?date_from=2026-10-20&date_to=2026-10-01')->assertStatus(422);
    }

    public function test_admin_can_fetch_stats_and_detail_with_404_on_missing(): void
    {
        [$admin, $fixtures] = $this->seedFixtures();

        $dateFrom = $fixtures['dateFrom'];
        $dateTo = $fixtures['dateTo'];

        $stats = $this->actingAs($admin)
            ->getJson("/api/admin/reservations/stats?date_from={$dateFrom}&date_to={$dateTo}&restaurant_id={$fixtures['rest1Id']}")
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.total_reservations', 3)
            ->assertJsonPath('data.status_counts.completed', 1)
            ->assertJsonPath('data.status_counts.pending', 1)
            ->assertJsonPath('data.status_counts.seated', 1)
            ->assertJsonPath('data.attention_counts.pending_expiring', 1)
            ->assertJsonPath('data.attention_counts.overdue_seated', 1);

        $this->assertNotEmpty($stats->json('data.daily_trend'));
        $this->assertNotEmpty($stats->json('data.top_restaurants'));

        // Detail endpoint
        $this->actingAs($admin)
            ->getJson('/api/admin/reservations/'.$fixtures['res1Id'])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.reservation.reservation_id', $fixtures['res1Id'])
            ->assertJsonPath('data.reservation.can_admin_cancel', false)
            ->assertJsonCount(1, 'data.reservation.status_history');

        // Missing reservation returns 404
        $this->actingAs($admin)
            ->getJson('/api/admin/reservations/999999999')
            ->assertStatus(404);
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
    private function seedFixtures(): array
    {
        $admin = $this->createUser('admin');
        $customer = $this->createUser('customer');
        $now = CarbonImmutable::now('Asia/Manila');

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

        return [
            $admin,
            [
                'rest1Id' => $rest1Id,
                'rest2Id' => $rest2Id,
                'res1Id' => $res1Id,
                'res2Id' => $res2Id,
                'res3Id' => $res3Id,
                'res4Id' => $res4Id,
                'ref1' => $ref1,
                'dateFrom' => $now->subDays(2)->format('Y-m-d'),
                'dateTo' => $now->addDays(1)->format('Y-m-d'),
            ],
        ];
    }
}
