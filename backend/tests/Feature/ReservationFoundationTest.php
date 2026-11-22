<?php

namespace Tests\Feature;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Reservations\Support\ReservationFormatter;
use App\Features\Reservations\Support\ReservationReferenceGenerator;
use App\Features\Reservations\Support\ReservationStatus;
use App\Features\Reservations\Support\ReservationStatusHistoryRecorder;
use App\Models\User;
use App\Support\WorkspaceAccessResolver;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class ReservationFoundationTest extends TestCase
{
    use DatabaseTransactions;

    public function test_migration_columns_tables_and_indexes_exist(): void
    {
        $this->assertTrue(Schema::hasTable('restaurant_tables'));
        foreach ([
            'table_id',
            'restaurant_id',
            'table_name',
            'dining_area',
            'description',
            'seating_capacity',
            'min_party_size',
            'is_active',
        ] as $column) {
            $this->assertTrue(
                Schema::hasColumn('restaurant_tables', $column),
                "Expected restaurant_tables.{$column} to exist."
            );
        }

        $this->assertTrue(Schema::hasTable('reservations'));
        foreach ([
            'reservation_id',
            'reservation_reference',
            'customer_id',
            'restaurant_id',
            'table_id',
            'contact_name',
            'contact_phone',
            'reservation_start',
            'reservation_end',
            'number_of_guests',
            'reservation_status',
            'deposit_amount',
            'deposit_status',
            'service_fee',
            'is_fee_refundable',
            'cancellation_fee',
            'special_requests',
            'idempotency_key',
            'cancelled_by',
            'cancelled_at',
            'cancellation_reason',
            'rejection_reason',
            'rejected_at',
            'approved_at',
            'confirmed_at',
            'arrived_at',
            'seated_at',
            'completed_at',
            'expired_at',
            'no_show_marked_at',
            'no_show_marked_by',
        ] as $column) {
            $this->assertTrue(
                Schema::hasColumn('reservations', $column),
                "Expected reservations.{$column} to exist."
            );
        }

        $this->assertTrue(Schema::hasTable('restaurants'));
        foreach ([
            'offers_dine_in',
            'accepts_reservations',
            'accepting_reservations',
            'reservation_min_notice_hours',
            'reservation_max_party_size',
            'reservation_duration_minutes',
            'reservation_max_advance_days',
            'reservation_cancellation_cutoff_minutes',
            'reservation_auto_confirm',
            'reservation_pending_expiry_minutes',
            'reservation_deposit_required',
            'reservation_deposit_amount',
            'reservation_service_fee',
            'reservation_notes',
        ] as $column) {
            $this->assertTrue(
                Schema::hasColumn('restaurants', $column),
                "Expected restaurants.{$column} to exist."
            );
        }

        $this->assertTrue(Schema::hasTable('reservation_status_history'));
        foreach ([
            'history_id',
            'reservation_id',
            'from_status',
            'to_status',
            'changed_by_user_id',
            'changed_by_role',
            'note',
            'created_at',
        ] as $column) {
            $this->assertTrue(
                Schema::hasColumn('reservation_status_history', $column),
                "Expected reservation_status_history.{$column} to exist."
            );
        }

        $dbName = DB::getDatabaseName();
        $existingIndexes = DB::table('information_schema.STATISTICS')
            ->where('TABLE_SCHEMA', $dbName)
            ->where('TABLE_NAME', 'reservations')
            ->pluck('INDEX_NAME')
            ->unique()
            ->values()
            ->all();

        foreach ([
            'uk_reservations_reference',
            'uk_reservations_customer_idempotency',
            'idx_reservations_table_window',
            'idx_reservations_customer_start',
            'idx_reservations_restaurant_status_start',
        ] as $expectedIndex) {
            $this->assertContains($expectedIndex, $existingIndexes, "Expected index {$expectedIndex} on reservations.");
        }
    }

    public function test_reservation_reference_generator_returns_unique_valid_references(): void
    {
        $generator = new ReservationReferenceGenerator();
        $fixedDate = CarbonImmutable::parse('2026-11-23 15:30:00', 'Asia/Manila');

        $seen = [];
        for ($i = 0; $i < 40; $i++) {
            $ref = $generator->generate($fixedDate);
            $this->assertMatchesRegularExpression('/^SALO-RES-20261123-[A-Z0-9]{4}$/', $ref);
            $this->assertArrayNotHasKey($ref, $seen, "Duplicate reservation reference generated: {$ref}");
            $seen[$ref] = true;
        }
    }

    public function test_reservation_status_transition_matrix_matches_specification(): void
    {
        $expectedAllowed = [
            'pending' => ['approved', 'confirmed', 'awaiting_payment', 'rejected', 'cancelled', 'expired'],
            'approved' => ['confirmed', 'awaiting_payment', 'cancelled'],
            'awaiting_payment' => ['confirmed', 'cancelled', 'expired'],
            'confirmed' => ['arrived', 'seated', 'no_show', 'cancelled'],
            'arrived' => ['seated', 'no_show', 'cancelled'],
            'seated' => ['completed'],
            'rejected' => [],
            'completed' => [],
            'cancelled' => [],
            'no_show' => [],
            'expired' => [],
        ];

        $allStatuses = ReservationStatus::ALL;
        $this->assertCount(11, $allStatuses);

        foreach ($allStatuses as $from) {
            $allowedTargets = $expectedAllowed[$from];

            foreach ($allStatuses as $to) {
                $shouldAllow = in_array($to, $allowedTargets, true);
                $this->assertSame(
                    $shouldAllow,
                    ReservationStatus::canTransition($from, $to),
                    sprintf(
                        'Expected canTransition(%s -> %s) to be %s.',
                        $from,
                        $to,
                        $shouldAllow ? 'true' : 'false'
                    )
                );
            }
        }

        foreach (['pending', 'approved', 'awaiting_payment', 'confirmed', 'arrived', 'seated'] as $blocking) {
            $this->assertTrue(ReservationStatus::isBlocking($blocking));
            $this->assertFalse(ReservationStatus::isTerminal($blocking));
        }

        foreach (['rejected', 'completed', 'cancelled', 'no_show', 'expired'] as $terminal) {
            $this->assertTrue(ReservationStatus::isTerminal($terminal));
            $this->assertFalse(ReservationStatus::isBlocking($terminal));
        }

        $this->assertFalse(ReservationStatus::canTransition('unknown', 'confirmed'));
        $this->assertFalse(ReservationStatus::canTransition('pending', 'unknown'));
    }

    public function test_manager_and_reservation_positions_have_reservation_and_table_permissions(): void
    {
        foreach (['Manager', 'Reservation Handler', 'Reservation Staff'] as $position) {
            $this->assertTrue(User::positionHasPermission($position, 'reservations.view'), "{$position} should have reservations.view");
            $this->assertTrue(User::positionHasPermission($position, 'reservations.approve'), "{$position} should have reservations.approve");
            $this->assertTrue(User::positionHasPermission($position, 'reservations.reject'), "{$position} should have reservations.reject");
            $this->assertTrue(User::positionHasPermission($position, 'reservations.assignTables'), "{$position} should have reservations.assignTables");
            $this->assertTrue(User::positionHasPermission($position, 'reservations.updateStatus'), "{$position} should have reservations.updateStatus");
            $this->assertTrue(User::positionHasPermission($position, 'reservations.manageArrival'), "{$position} should have reservations.manageArrival");
            $this->assertTrue(User::positionHasPermission($position, 'tables.view'), "{$position} should have tables.view");
            $this->assertTrue(User::positionHasPermission($position, 'tables.add'), "{$position} should have tables.add");
            $this->assertTrue(User::positionHasPermission($position, 'tables.edit'), "{$position} should have tables.edit");
            $this->assertTrue(User::positionHasPermission($position, 'tables.manageAvailability'), "{$position} should have tables.manageAvailability");

            $this->assertTrue(User::isReservationHandlerPosition($position));
            $this->assertTrue(User::canViewReservationsPosition($position));
            $this->assertTrue(User::canManageReservationsPosition($position));
            $this->assertTrue(User::isTableManagerPosition($position));
            $this->assertTrue(User::canViewTablesPosition($position));
            $this->assertTrue(User::canManageTablesPosition($position));
        }

        foreach (['Order Staff', 'Order Handler', 'Inventory Manager', 'Menu Manager'] as $unpermitted) {
            $this->assertFalse(User::positionHasPermission($unpermitted, 'reservations.view'));
            $this->assertFalse(User::positionHasPermission($unpermitted, 'tables.view'));
            $this->assertFalse(User::isReservationHandlerPosition($unpermitted));
            $this->assertFalse(User::isTableManagerPosition($unpermitted));
        }
    }

    public function test_workspace_access_resolver_reservation_and_table_guards_enforce_permissions(): void
    {
        $restaurantId = $this->createRestaurant('active');
        $owner = $this->createUser('owner-res@salo.local');
        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        $manager = $this->createStaffUser($restaurantId, 'manager-res@salo.local', 'Manager');
        $resHandler = $this->createStaffUser($restaurantId, 'handler-res@salo.local', 'Reservation Handler');
        $resStaff = $this->createStaffUser($restaurantId, 'staff-res@salo.local', 'Reservation Staff');
        $orderStaff = $this->createStaffUser($restaurantId, 'order-staff@salo.local', 'Order Staff');
        $menuManager = $this->createStaffUser($restaurantId, 'menu-mgr@salo.local', 'Menu Manager');
        $outsider = $this->createUser('outsider-res@salo.local');

        $resolver = app(WorkspaceAccessResolver::class);

        // Allowed users for both reservations and tables
        foreach ([$owner, $manager, $resHandler, $resStaff] as $allowedUser) {
            $resolvedRes = $resolver->requireActiveAuthorizedRestaurantForReservations($allowedUser, $restaurantId);
            $this->assertSame($restaurantId, (int) $resolvedRes->restaurant_id);

            $resolvedTables = $resolver->requireActiveAuthorizedRestaurantForTables($allowedUser, $restaurantId);
            $this->assertSame($restaurantId, (int) $resolvedTables->restaurant_id);
        }

        // Rejected users (unpermitted positions and non-members)
        foreach ([$orderStaff, $menuManager, $outsider] as $deniedUser) {
            $this->assertAbortsWith403(fn () => $resolver->requireActiveAuthorizedRestaurantForReservations($deniedUser, $restaurantId));
            $this->assertAbortsWith403(fn () => $resolver->requireActiveAuthorizedRestaurantForTables($deniedUser, $restaurantId));
        }

        // Inactive restaurant should also abort with 403 even for owner
        $inactiveRestaurantId = $this->createRestaurant('suspended');
        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $inactiveRestaurantId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);
        $this->assertAbortsWith403(fn () => $resolver->requireActiveAuthorizedRestaurantForReservations($owner, $inactiveRestaurantId));
        $this->assertAbortsWith403(fn () => $resolver->requireActiveAuthorizedRestaurantForTables($owner, $inactiveRestaurantId));
    }

    public function test_notification_service_resolves_restaurant_reservation_handler_user_ids(): void
    {
        $restaurantId = $this->createRestaurant('active');

        $owner = $this->createUser('notify-owner@salo.local');
        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
            'joined_at' => now(),
        ]);

        $manager = $this->createStaffUser($restaurantId, 'notify-mgr@salo.local', 'Manager');
        $resHandler = $this->createStaffUser($restaurantId, 'notify-reshandler@salo.local', 'Reservation Handler');
        $resStaff = $this->createStaffUser($restaurantId, 'notify-resstaff@salo.local', 'Reservation Staff');
        $orderStaff = $this->createStaffUser($restaurantId, 'notify-order@salo.local', 'Order Staff');
        $inactiveResStaff = $this->createStaffUser($restaurantId, 'notify-inactive@salo.local', 'Reservation Staff', 'inactive');

        $service = app(NotificationService::class);
        $userIds = $service->resolveRestaurantReservationHandlerUserIds($restaurantId);

        $this->assertContains((int) $owner->user_id, $userIds);
        $this->assertContains((int) $manager->user_id, $userIds);
        $this->assertContains((int) $resHandler->user_id, $userIds);
        $this->assertContains((int) $resStaff->user_id, $userIds);
        $this->assertNotContains((int) $orderStaff->user_id, $userIds);
        $this->assertNotContains((int) $inactiveResStaff->user_id, $userIds);
    }

    public function test_chk_reservations_no_show_constraint_is_enforced(): void
    {
        $restaurantId = $this->createRestaurant('active');
        $customer = $this->createUser('noshow-cust@salo.local');
        $staff = $this->createUser('noshow-staff@salo.local');

        $tableId = (int) DB::table('restaurant_tables')->insertGetId([
            'restaurant_id' => $restaurantId,
            'table_name' => 'NS-01',
            'dining_area' => 'Indoor',
            'seating_capacity' => 4,
            'min_party_size' => 1,
            'is_active' => 1,
        ]);

        // 1. Inserting no_show without no_show_marked_at and no_show_marked_by must fail
        $failedWithoutMetadata = false;
        try {
            DB::table('reservations')->insert([
                'reservation_reference' => 'SALO-RES-20261123-NS01',
                'customer_id' => $customer->user_id,
                'restaurant_id' => $restaurantId,
                'table_id' => $tableId,
                'reservation_start' => '2026-11-23 18:00:00',
                'reservation_end' => '2026-11-23 19:30:00',
                'number_of_guests' => 2,
                'reservation_status' => ReservationStatus::NO_SHOW,
                'no_show_marked_at' => null,
                'no_show_marked_by' => null,
            ]);
        } catch (QueryException) {
            $failedWithoutMetadata = true;
        }
        $this->assertTrue($failedWithoutMetadata, 'Expected chk_reservations_no_show to reject no_show without metadata.');

        // 2. Inserting no_show with BOTH no_show_marked_at and no_show_marked_by succeeds
        $reservationId = (int) DB::table('reservations')->insertGetId([
            'reservation_reference' => 'SALO-RES-20261123-NS02',
            'customer_id' => $customer->user_id,
            'restaurant_id' => $restaurantId,
            'table_id' => $tableId,
            'reservation_start' => '2026-11-23 18:00:00',
            'reservation_end' => '2026-11-23 19:30:00',
            'number_of_guests' => 2,
            'reservation_status' => ReservationStatus::NO_SHOW,
            'no_show_marked_at' => '2026-11-23 18:20:00',
            'no_show_marked_by' => $staff->user_id,
        ]);

        $this->assertGreaterThan(0, $reservationId);
    }

    public function test_reservation_formatter_and_status_history_recorder_work_in_manila_timezone(): void
    {
        $restaurantId = $this->createRestaurant('active');
        $customer = $this->createUser('fmt-cust@salo.local');
        $staff = $this->createUser('fmt-staff@salo.local');

        $tableId = (int) DB::table('restaurant_tables')->insertGetId([
            'restaurant_id' => $restaurantId,
            'table_name' => 'FMT-01',
            'dining_area' => 'Terrace',
            'description' => 'Sunset terrace table',
            'seating_capacity' => 6,
            'min_party_size' => 2,
            'is_active' => 1,
        ]);

        $reservationId = (int) DB::table('reservations')->insertGetId([
            'reservation_reference' => 'SALO-RES-20261123-FM01',
            'customer_id' => $customer->user_id,
            'restaurant_id' => $restaurantId,
            'table_id' => $tableId,
            'contact_name' => 'Maria Clara',
            'contact_phone' => '+63 917 000 1122',
            'reservation_start' => '2026-11-25 19:00:00',
            'reservation_end' => '2026-11-25 20:30:00',
            'number_of_guests' => 4,
            'reservation_status' => ReservationStatus::CONFIRMED,
            'deposit_amount' => '250.00',
            'deposit_status' => 'paid',
            'service_fee' => '25.00',
            'is_fee_refundable' => 1,
            'cancellation_fee' => '0.00',
            'special_requests' => 'Anniversary cake on arrival',
            'approved_at' => '2026-11-23 10:00:00',
            'confirmed_at' => '2026-11-23 10:05:00',
        ]);

        $recorder = new ReservationStatusHistoryRecorder();
        $h1 = $recorder->record($reservationId, null, ReservationStatus::PENDING, $customer->user_id, 'customer', 'Created');
        $h2 = $recorder->record($reservationId, ReservationStatus::PENDING, ReservationStatus::CONFIRMED, $staff->user_id, 'restaurant', 'Confirmed');

        $this->assertGreaterThan(0, $h1);
        $this->assertGreaterThan($h1, $h2);

        $joinedRow = DB::table('reservations as res')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'res.restaurant_id')
            ->leftJoin('restaurant_tables as rt', function ($join): void {
                $join->on('rt.table_id', '=', 'res.table_id')
                    ->on('rt.restaurant_id', '=', 'res.restaurant_id');
            })
            ->where('res.reservation_id', $reservationId)
            ->select([
                'res.*',
                'r.restaurant_name',
                'r.reservation_cancellation_cutoff_minutes',
                'rt.table_name',
                'rt.dining_area',
                'rt.description as table_description',
                'rt.seating_capacity',
                'rt.min_party_size',
            ])
            ->first();

        $historyRows = DB::table('reservation_status_history')
            ->where('reservation_id', $reservationId)
            ->orderBy('history_id')
            ->get()
            ->all();

        $nowBeforeCutoff = CarbonImmutable::parse('2026-11-25 14:00:00', 'Asia/Manila');
        $formatted = ReservationFormatter::format($joinedRow, $nowBeforeCutoff, null, $historyRows);

        $this->assertSame($reservationId, $formatted['reservation_id']);
        $this->assertSame('SALO-RES-20261123-FM01', $formatted['reservation_reference']);
        $this->assertSame($restaurantId, $formatted['restaurant_id']);
        $this->assertSame('Maria Clara', $formatted['contact_name']);
        $this->assertSame('+63 917 000 1122', $formatted['contact_phone']);
        $this->assertSame('2026-11-25T19:00:00+08:00', $formatted['reservation_start']);
        $this->assertSame('2026-11-25T20:30:00+08:00', $formatted['reservation_end']);
        $this->assertSame('2026-11-25', $formatted['reservation_date']);
        $this->assertSame('19:00', $formatted['reservation_time']);
        $this->assertSame(90, $formatted['duration_minutes']);
        $this->assertSame(4, $formatted['number_of_guests']);
        $this->assertSame('confirmed', $formatted['reservation_status']);
        $this->assertSame('250.00', $formatted['deposit_amount']);
        $this->assertSame('paid', $formatted['deposit_status']);
        $this->assertSame('FMT-01', $formatted['table']['table_name']);
        $this->assertSame('Terrace', $formatted['table']['dining_area']);
        $this->assertSame(6, $formatted['table']['seating_capacity']);
        $this->assertTrue($formatted['is_upcoming']);
        $this->assertTrue($formatted['can_cancel']);
        $this->assertCount(2, $formatted['status_history']);

        // Inside the 120-minute cancellation cutoff (e.g. 60 minutes before start), can_cancel becomes false
        $nowInsideCutoff = CarbonImmutable::parse('2026-11-25 18:00:00', 'Asia/Manila');
        $formattedLate = ReservationFormatter::format($joinedRow, $nowInsideCutoff);
        $this->assertTrue($formattedLate['is_upcoming']);
        $this->assertFalse($formattedLate['can_cancel']);
    }

    private function assertAbortsWith403(callable $callback): void
    {
        try {
            $callback();
            $this->fail('Expected 403 HttpException was not thrown.');
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
        }
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
            'restaurant_name' => 'Reservation Test Bistro ' . uniqid(),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'res-bistro-' . uniqid() . '@salo.local',
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
