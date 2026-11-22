<?php

namespace Tests\Feature;

use App\Features\Reservations\Support\ReservationStatus;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OwnerTableTest extends TestCase
{
    use DatabaseTransactions;

    public function test_owner_can_create_table_with_audit_log_and_validation_rules(): void
    {
        $restaurantId = $this->createRestaurant('active');
        $owner = $this->createOwnerUser($restaurantId, 'table-owner@salo.local');

        $response = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson('/api/restaurant/tables', [
                'table_name' => '  T-01  ',
                'seating_capacity' => 6,
                'min_party_size' => 2,
                'dining_area' => '  Terrace  ',
                'description' => '  Corner view table  ',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.table.table_name', 'T-01')
            ->assertJsonPath('data.table.seating_capacity', 6)
            ->assertJsonPath('data.table.min_party_size', 2)
            ->assertJsonPath('data.table.dining_area', 'Terrace')
            ->assertJsonPath('data.table.description', 'Corner view table')
            ->assertJsonPath('data.table.is_active', true)
            ->assertJsonPath('data.table.table_status', 'available');

        $tableId = (int) $response->json('data.table.table_id');
        $this->assertGreaterThan(0, $tableId);

        $auditExists = DB::table('audit_logs')
            ->where('actor_user_id', $owner->user_id)
            ->where('action', 'owner_table_created')
            ->where('entity_type', 'restaurant_tables')
            ->where('entity_id', (string) $tableId)
            ->exists();
        $this->assertTrue($auditExists, 'Expected owner_table_created audit log entry.');

        // Case-insensitive duplicate table_name in same restaurant -> 422 on table_name
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson('/api/restaurant/tables', [
                'table_name' => 't-01',
                'seating_capacity' => 4,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['table_name']);

        // Same table_name in a different restaurant is allowed
        $otherRestaurantId = $this->createRestaurant('active');
        $otherOwner = $this->createOwnerUser($otherRestaurantId, 'other-owner@salo.local');
        $this->actingAs($otherOwner)
            ->withHeader('X-Restaurant-Id', (string) $otherRestaurantId)
            ->postJson('/api/restaurant/tables', [
                'table_name' => 'T-01',
                'seating_capacity' => 4,
                'dining_area' => '   ',
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.table.dining_area', null)
            ->assertJsonPath('data.table.min_party_size', 1);

        // Invalid capacity and min_party_size > seating_capacity -> 422
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson('/api/restaurant/tables', [
                'table_name' => 'T-99',
                'seating_capacity' => 4,
                'min_party_size' => 6,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['min_party_size']);

        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson('/api/restaurant/tables', [
                'table_name' => '',
                'seating_capacity' => 105,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['table_name', 'seating_capacity']);
    }

    public function test_list_tables_computes_live_statuses_summary_dining_areas_and_filters_in_single_query(): void
    {
        $restaurantId = $this->createRestaurant('active');
        $owner = $this->createOwnerUser($restaurantId, 'list-owner@salo.local');
        $customer = $this->createUser('list-cust@salo.local');

        $now = CarbonImmutable::now('Asia/Manila');
        $todayDate = $now->format('Y-m-d');
        $futureDate = $now->addDays(2)->format('Y-m-d');

        // Table 1: Available active table (Indoor, cap 2)
        $tAvailable = $this->insertTable($restaurantId, 'T-01', 2, 1, 'Indoor', 'Window two-seater', true);

        // Table 2: Reserved today (Outdoor, cap 4) — use a start time guaranteed to fall on $todayDate
        $tReserved = $this->insertTable($restaurantId, 'T-02', 4, 2, 'Outdoor', 'Garden patio table', true);
        $reservedStartToday = $now->hour < 22
            ? $now->addHours(1)
            : $now->startOfDay()->setTime(12, 0);
        $this->insertReservation(
            $restaurantId,
            $tReserved,
            $customer->user_id,
            'SALO-RES-20261123-RV01',
            $reservedStartToday,
            $reservedStartToday->addMinutes(90),
            4,
            ReservationStatus::CONFIRMED,
        );
        // Also add a future reservation tomorrow on T-02 so upcoming_reservations_count >= 1 at any hour of day
        $tomorrowStart = $now->addDay()->setTime(18, 0);
        $this->insertReservation(
            $restaurantId,
            $tReserved,
            $customer->user_id,
            'SALO-RES-20261124-RV02',
            $tomorrowStart,
            $tomorrowStart->addMinutes(90),
            4,
            ReservationStatus::CONFIRMED,
        );

        // Table 3: Occupied right now (Indoor, cap 6)
        $tOccupied = $this->insertTable($restaurantId, 'T-03', 6, 3, 'Indoor', 'Main dining family table', true);
        $this->insertReservation(
            $restaurantId,
            $tOccupied,
            $customer->user_id,
            'SALO-RES-20261123-OC01',
            $now->subMinutes(30),
            $now->addMinutes(60),
            5,
            ReservationStatus::SEATED,
        );

        // Table 4: Archived table (Terrace, cap 8)
        $this->insertTable($restaurantId, 'T-04', 8, 4, 'Terrace', 'Archived terrace table', false);

        $response = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->getJson("/api/restaurant/tables?date={$todayDate}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.summary.total_tables', 4)
            ->assertJsonPath('data.summary.active_tables', 3)
            ->assertJsonPath('data.summary.archived_tables', 1)
            ->assertJsonPath('data.summary.total_seats', 12) // 2 + 4 + 6 (active only)
            ->assertJsonPath('data.summary.available_now', 1)
            ->assertJsonPath('data.summary.reserved_count', 1)
            ->assertJsonPath('data.summary.occupied_count', 1)
            ->assertJsonPath('data.dining_areas', ['Indoor', 'Outdoor', 'Terrace']);

        $itemsById = collect($response->json('data.items'))->keyBy('table_id');
        $this->assertSame('available', $itemsById[$tAvailable]['table_status']);
        $this->assertSame('reserved', $itemsById[$tReserved]['table_status']);
        $this->assertSame(1, $itemsById[$tReserved]['reservations_count']);
        $this->assertSame('SALO-RES-20261123-RV01', $itemsById[$tReserved]['next_reservation']['reservation_reference']);
        $this->assertGreaterThanOrEqual(1, $itemsById[$tReserved]['upcoming_reservations_count']);
        $this->assertSame('occupied', $itemsById[$tOccupied]['table_status']);

        // Filtering by status=active, dining_area=Indoor, and search=Window
        $filtered = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->getJson('/api/restaurant/tables?status=active&dining_area=Indoor&search=Window');

        $filtered->assertStatus(200)
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.table_id', $tAvailable);

        // On a future date with no bookings, T-03 is not occupied (occupied only applies when selected date is today)
        $futureRes = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->getJson("/api/restaurant/tables?date={$futureDate}&status=active");

        $futureRes->assertStatus(200);
        foreach ($futureRes->json('data.items') as $item) {
            $this->assertSame('available', $item['table_status']);
            $this->assertSame(0, $item['reservations_count']);
        }
    }

    public function test_update_table_enforces_partial_update_capacity_conflicts_and_audit_log(): void
    {
        $restaurantId = $this->createRestaurant('active');
        $owner = $this->createOwnerUser($restaurantId, 'upd-owner@salo.local');
        $customer = $this->createUser('upd-cust@salo.local');

        $tableId = $this->insertTable($restaurantId, 'T-10', 6, 2, 'Indoor', 'Original description', true);
        $this->insertTable($restaurantId, 'T-11', 4, 1, 'Indoor', 'Second table', true);

        // Partial update of description and same name (case change allowed on self)
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->patchJson("/api/restaurant/tables/{$tableId}", [
                'table_name' => 't-10',
                'description' => 'Updated window description',
            ])
            ->assertStatus(200)
            ->assertJsonPath('data.table.table_name', 't-10')
            ->assertJsonPath('data.table.seating_capacity', 6)
            ->assertJsonPath('data.table.description', 'Updated window description');

        // Updating min_party_size above EXISTING capacity (6) -> 422
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->patchJson("/api/restaurant/tables/{$tableId}", [
                'min_party_size' => 8,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['min_party_size']);

        // Colliding with T-11 name -> 422
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->patchJson("/api/restaurant/tables/{$tableId}", [
                'table_name' => 'T-11',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['table_name']);

        // Add future blocking reservation for 5 guests on T-10
        $now = CarbonImmutable::now('Asia/Manila');
        $this->insertReservation(
            $restaurantId,
            $tableId,
            $customer->user_id,
            'SALO-RES-20261125-CF01',
            $now->addDays(1)->setTime(19, 0),
            $now->addDays(1)->setTime(20, 30),
            5,
            ReservationStatus::CONFIRMED,
        );

        // Reducing seating_capacity to 4 (< 5 guests) must block with 409 and mention reference
        $conflictCap = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->patchJson("/api/restaurant/tables/{$tableId}", [
                'seating_capacity' => 4,
            ]);
        $conflictCap->assertStatus(409);
        $this->assertStringContainsString('SALO-RES-20261125-CF01', (string) $conflictCap->json('message'));

        // Raising min_party_size to 6 (> 5 guests) must also block with 409
        $conflictMin = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->patchJson("/api/restaurant/tables/{$tableId}", [
                'min_party_size' => 6,
            ]);
        $conflictMin->assertStatus(409);
        $this->assertStringContainsString('SALO-RES-20261125-CF01', (string) $conflictMin->json('message'));

        // Reducing seating_capacity to 5 (still fits 5 guests) succeeds
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->patchJson("/api/restaurant/tables/{$tableId}", [
                'seating_capacity' => 5,
            ])
            ->assertStatus(200)
            ->assertJsonPath('data.table.seating_capacity', 5);

        $auditExists = DB::table('audit_logs')
            ->where('actor_user_id', $owner->user_id)
            ->where('action', 'owner_table_updated')
            ->where('entity_type', 'restaurant_tables')
            ->where('entity_id', (string) $tableId)
            ->exists();
        $this->assertTrue($auditExists);
    }

    public function test_archive_and_reactivate_rules_idempotency_and_blocking_conflicts(): void
    {
        $restaurantId = $this->createRestaurant('active');
        $owner = $this->createOwnerUser($restaurantId, 'arch-owner@salo.local');
        $customer = $this->createUser('arch-cust@salo.local');
        $now = CarbonImmutable::now('Asia/Manila');

        $tableWithFuture = $this->insertTable($restaurantId, 'T-20', 4, 1, 'Indoor', null, true);
        $this->insertReservation(
            $restaurantId,
            $tableWithFuture,
            $customer->user_id,
            'SALO-RES-20261126-BL01',
            $now->addDays(2),
            $now->addDays(2)->addMinutes(90),
            4,
            ReservationStatus::PENDING,
        );

        // Archiving table with future blocking reservation -> 409
        $blockedResp = $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/tables/{$tableWithFuture}/archive");
        $blockedResp->assertStatus(409);
        $this->assertStringContainsString('1 upcoming active reservation', (string) $blockedResp->json('message'));

        // Table with only past completed and future cancelled reservations CAN be archived
        $tableArchivable = $this->insertTable($restaurantId, 'T-21', 4, 1, 'Outdoor', null, true);
        $this->insertReservation(
            $restaurantId,
            $tableArchivable,
            $customer->user_id,
            'SALO-RES-20261120-CP01',
            $now->subDays(2),
            $now->subDays(2)->addMinutes(90),
            2,
            ReservationStatus::COMPLETED,
        );
        $this->insertReservation(
            $restaurantId,
            $tableArchivable,
            $customer->user_id,
            'SALO-RES-20261127-CN01',
            $now->addDays(3),
            $now->addDays(3)->addMinutes(90),
            2,
            ReservationStatus::CANCELLED,
        );

        // First archive -> 200, is_active = false, status = archived
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/tables/{$tableArchivable}/archive")
            ->assertStatus(200)
            ->assertJsonPath('data.table.is_active', false)
            ->assertJsonPath('data.table.table_status', 'archived');

        // Idempotent second archive -> 200
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/tables/{$tableArchivable}/archive")
            ->assertStatus(200)
            ->assertJsonPath('data.table.is_active', false);

        $archiveAuditCount = DB::table('audit_logs')
            ->where('action', 'owner_table_archived')
            ->where('entity_id', (string) $tableArchivable)
            ->count();
        $this->assertSame(1, $archiveAuditCount, 'Idempotent re-archive should not duplicate audit log.');

        // Reactivate -> 200, is_active = true
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/tables/{$tableArchivable}/reactivate")
            ->assertStatus(200)
            ->assertJsonPath('data.table.is_active', true)
            ->assertJsonPath('data.table.table_status', 'available');

        // Idempotent second reactivate -> 200
        $this->actingAs($owner)
            ->withHeader('X-Restaurant-Id', (string) $restaurantId)
            ->postJson("/api/restaurant/tables/{$tableArchivable}/reactivate")
            ->assertStatus(200)
            ->assertJsonPath('data.table.is_active', true);

        $reactivateAuditCount = DB::table('audit_logs')
            ->where('action', 'owner_table_reactivated')
            ->where('entity_id', (string) $tableArchivable)
            ->count();
        $this->assertSame(1, $reactivateAuditCount);
    }

    public function test_rbac_permissions_and_cross_tenant_404_isolation(): void
    {
        $restaurantA = $this->createRestaurant('active');
        $ownerA = $this->createOwnerUser($restaurantA, 'owner-a@salo.local');
        $tableA = $this->insertTable($restaurantA, 'A-01', 4, 1, 'Indoor', null, true);

        $restaurantB = $this->createRestaurant('active');
        $ownerB = $this->createOwnerUser($restaurantB, 'owner-b@salo.local');

        // Cross-tenant access by Owner B on Table A -> 404 (never 403)
        $this->actingAs($ownerB)
            ->withHeader('X-Restaurant-Id', (string) $restaurantB)
            ->getJson("/api/restaurant/tables/{$tableA}")
            ->assertStatus(404);

        $this->actingAs($ownerB)
            ->withHeader('X-Restaurant-Id', (string) $restaurantB)
            ->patchJson("/api/restaurant/tables/{$tableA}", ['table_name' => 'Hacked'])
            ->assertStatus(404);

        $this->actingAs($ownerB)
            ->withHeader('X-Restaurant-Id', (string) $restaurantB)
            ->postJson("/api/restaurant/tables/{$tableA}/archive")
            ->assertStatus(404);

        $this->actingAs($ownerB)
            ->withHeader('X-Restaurant-Id', (string) $restaurantB)
            ->postJson("/api/restaurant/tables/{$tableA}/reactivate")
            ->assertStatus(404);

        // Staff with Reservation Handler / Manager position can view, add, edit, archive, reactivate
        $resHandler = $this->createStaffUser($restaurantA, 'res-handler@salo.local', 'Reservation Handler');
        $this->actingAs($resHandler)
            ->withHeader('X-Restaurant-Id', (string) $restaurantA)
            ->getJson('/api/restaurant/tables')
            ->assertStatus(200);

        $createdByStaff = $this->actingAs($resHandler)
            ->withHeader('X-Restaurant-Id', (string) $restaurantA)
            ->postJson('/api/restaurant/tables', [
                'table_name' => 'A-02',
                'seating_capacity' => 4,
            ]);
        $createdByStaff->assertStatus(201);
        $staffTableId = (int) $createdByStaff->json('data.table.table_id');

        $this->actingAs($resHandler)
            ->withHeader('X-Restaurant-Id', (string) $restaurantA)
            ->patchJson("/api/restaurant/tables/{$staffTableId}", ['seating_capacity' => 6])
            ->assertStatus(200);

        $this->actingAs($resHandler)
            ->withHeader('X-Restaurant-Id', (string) $restaurantA)
            ->postJson("/api/restaurant/tables/{$staffTableId}/archive")
            ->assertStatus(200);

        $this->actingAs($resHandler)
            ->withHeader('X-Restaurant-Id', (string) $restaurantA)
            ->postJson("/api/restaurant/tables/{$staffTableId}/reactivate")
            ->assertStatus(200);

        // Staff WITHOUT table permissions (Order Staff, Menu Manager) -> 403
        $orderStaff = $this->createStaffUser($restaurantA, 'order-only@salo.local', 'Order Staff');
        $this->actingAs($orderStaff)
            ->withHeader('X-Restaurant-Id', (string) $restaurantA)
            ->getJson('/api/restaurant/tables')
            ->assertStatus(403);

        $this->actingAs($orderStaff)
            ->withHeader('X-Restaurant-Id', (string) $restaurantA)
            ->postJson('/api/restaurant/tables', ['table_name' => 'A-99', 'seating_capacity' => 2])
            ->assertStatus(403);

        // Customer-only user -> 403
        $customerOnly = $this->createUser('pure-customer@salo.local');
        $this->actingAs($customerOnly)
            ->getJson('/api/restaurant/tables')
            ->assertStatus(403);
    }

    private function insertTable(
        int $restaurantId,
        string $name,
        int $capacity,
        int $minParty,
        ?string $area,
        ?string $description,
        bool $isActive,
    ): int {
        return (int) DB::table('restaurant_tables')->insertGetId([
            'restaurant_id' => $restaurantId,
            'table_name' => $name,
            'dining_area' => $area,
            'description' => $description,
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
        CarbonImmutable $start,
        CarbonImmutable $end,
        int $guests,
        string $status,
    ): int {
        return (int) DB::table('reservations')->insertGetId([
            'reservation_reference' => $reference,
            'customer_id' => $customerId,
            'restaurant_id' => $restaurantId,
            'table_id' => $tableId,
            'contact_name' => 'Guest User',
            'contact_phone' => '+63 917 000 0000',
            'reservation_start' => $start->format('Y-m-d H:i:s'),
            'reservation_end' => $end->format('Y-m-d H:i:s'),
            'number_of_guests' => $guests,
            'reservation_status' => $status,
            'created_at' => now(),
            'updated_at' => now(),
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

    private function createStaffUser(
        int $restaurantId,
        string $email,
        string $position,
        string $staffStatus = 'active',
    ): User {
        $user = $this->createUser($email);

        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $user->user_id,
            'staff_position' => $position,
            'staff_status' => $staffStatus,
            'joined_at' => now(),
        ]);

        return $user;
    }

    private function createRestaurant(string $status = 'active'): int
    {
        $provinceId = (int) DB::table('provinces')->insertGetId(['province_name' => 'Metro Manila ' . uniqid()]);
        $cityId = (int) DB::table('cities')->insertGetId(['province_id' => $provinceId, 'city_name' => 'Quezon City ' . uniqid()]);
        $barangayId = (int) DB::table('barangays')->insertGetId(['city_id' => $cityId, 'barangay_name' => 'Diliman ' . uniqid()]);
        $addressId = (int) DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '123 Katipunan Ave',
            'postal_code' => '1108',
        ]);

        return (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Table Test Bistro ' . uniqid(),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'table-bistro-' . uniqid() . '@salo.local',
            'address_id' => $addressId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepts_reservations' => 1,
            'accepting_orders' => 1,
            'accepting_reservations' => 1,
            'restaurant_status' => $status,
        ]);
    }
}
