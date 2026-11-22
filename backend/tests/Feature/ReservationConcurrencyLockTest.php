<?php

namespace Tests\Feature;

use PDO;
use PDOException;
use Tests\TestCase;

/**
 * Two-session InnoDB row-locking test WITHOUT DatabaseTransactions.
 * Opens two independent PDO connections to salo_test and proves:
 *  1. Conn 2 blocks/times out on FOR UPDATE while Conn 1 holds the table row lock.
 *  2. After Conn 1 commits a reservation, Conn 2 immediately sees it (no stale snapshot).
 */
class ReservationConcurrencyLockTest extends TestCase
{
    private ?int $restaurantId = null;

    private ?int $tableId = null;

    private ?int $customerId = null;

    private ?int $addressId = null;

    protected function tearDown(): void
    {
        try {
            $pdo = $this->openPdo();
            if ($this->restaurantId !== null) {
                $pdo->prepare('DELETE FROM reservations WHERE restaurant_id = ?')->execute([$this->restaurantId]);
                $pdo->prepare('DELETE FROM restaurant_tables WHERE restaurant_id = ?')->execute([$this->restaurantId]);
                $pdo->prepare('DELETE FROM restaurants WHERE restaurant_id = ?')->execute([$this->restaurantId]);
            }
            if ($this->addressId !== null) {
                $pdo->prepare('DELETE FROM addresses WHERE address_id = ?')->execute([$this->addressId]);
            }
            if ($this->customerId !== null) {
                $pdo->prepare('DELETE FROM users WHERE user_id = ?')->execute([$this->customerId]);
            }
        } catch (\Throwable) {
            // Best-effort cleanup
        }

        parent::tearDown();
    }

    public function test_two_independent_connections_serialize_on_table_lock_and_prevent_double_booking(): void
    {
        try {
            $pdo1 = $this->openPdo();
            $pdo2 = $this->openPdo();
        } catch (\Throwable $e) {
            $this->markTestSkipped('Cannot open two independent MySQL connections: '.$e->getMessage());
        }

        $pdo1->exec('SET SESSION innodb_lock_wait_timeout = 1');
        $pdo2->exec('SET SESSION innodb_lock_wait_timeout = 1');

        // Seed minimal fixtures committed in salo_test
        $suffix = random_int(100000, 999999);
        $pdo1->prepare("INSERT INTO users (username, first_name, last_name, email, password_hash, user_role, account_status) VALUES (?, 'Lock', 'Test', ?, 'hash', 'customer', 'active')")
            ->execute(["lock_u_{$suffix}", "lock_{$suffix}@salo.local"]);
        $this->customerId = (int) $pdo1->lastInsertId();

        $barangayId = (int) $pdo1->query('SELECT barangay_id FROM barangays LIMIT 1')->fetchColumn();
        $pdo1->prepare("INSERT INTO addresses (barangay_id, street, postal_code) VALUES (?, '1 Lock St', '1000')")
            ->execute([$barangayId]);
        $this->addressId = (int) $pdo1->lastInsertId();

        $pdo1->prepare("INSERT INTO restaurants (restaurant_name, business_type, ownership_structure, business_email, address_id, restaurant_status, accepts_reservations, accepting_reservations, is_published) VALUES (?, 'restaurant', 'sole_proprietorship', ?, ?, 'active', 1, 1, 1)")
            ->execute(["Lock Bistro {$suffix}", "lockb_{$suffix}@salo.local", $this->addressId]);
        $this->restaurantId = (int) $pdo1->lastInsertId();

        $pdo1->prepare("INSERT INTO restaurant_tables (restaurant_id, table_name, dining_area, seating_capacity, min_party_size, is_active) VALUES (?, 'L1', 'Main', 4, 1, 1)")
            ->execute([$this->restaurantId]);
        $this->tableId = (int) $pdo1->lastInsertId();

        // Conn 1 starts transaction and locks the table row FOR UPDATE
        $pdo1->beginTransaction();
        $stmt1 = $pdo1->prepare('SELECT table_id FROM restaurant_tables WHERE table_id = ? FOR UPDATE');
        $stmt1->execute([$this->tableId]);
        $this->assertSame($this->tableId, (int) $stmt1->fetchColumn());

        // Conn 2 starts transaction and tries to lock the same table row -> must block & time out (1205)
        $pdo2->beginTransaction();
        $timedOut = false;
        try {
            $stmt2 = $pdo2->prepare('SELECT table_id FROM restaurant_tables WHERE table_id = ? FOR UPDATE');
            $stmt2->execute([$this->tableId]);
        } catch (PDOException $e) {
            $timedOut = str_contains($e->getMessage(), '1205') || str_contains($e->getMessage(), 'Lock wait timeout');
        }
        $this->assertTrue($timedOut, 'Expected Connection 2 to block on the restaurant_tables row lock.');
        $pdo2->rollBack();

        // Conn 1 inserts confirmed reservation and commits
        $pdo1->prepare("INSERT INTO reservations (reservation_reference, customer_id, restaurant_id, table_id, reservation_start, reservation_end, number_of_guests, reservation_status) VALUES (?, ?, ?, ?, '2026-11-28 18:00:00', '2026-11-28 19:30:00', 2, 'confirmed')")
            ->execute(["SALO-RES-LCK-{$suffix}", $this->customerId, $this->restaurantId, $this->tableId]);
        $pdo1->commit();

        // Conn 2 starts a fresh transaction, locks table first, and immediately sees Conn 1's committed reservation
        $pdo2->beginTransaction();
        $stmt2Lock = $pdo2->prepare('SELECT table_id FROM restaurant_tables WHERE table_id = ? FOR UPDATE');
        $stmt2Lock->execute([$this->tableId]);
        $stmt2Overlap = $pdo2->prepare("SELECT COUNT(*) FROM reservations WHERE restaurant_id = ? AND table_id = ? AND reservation_status IN ('pending','approved','awaiting_payment','confirmed','arrived','seated') AND reservation_start < '2026-11-28 19:30:00' AND reservation_end > '2026-11-28 18:00:00' FOR UPDATE");
        $stmt2Overlap->execute([$this->restaurantId, $this->tableId]);
        $this->assertSame(1, (int) $stmt2Overlap->fetchColumn());
        $pdo2->commit();
    }

    private function openPdo(): PDO
    {
        $cfg = config('database.connections.mysql');
        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $cfg['host'], $cfg['port'], $cfg['database']);

        return new PDO($dsn, $cfg['username'], $cfg['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
    }
}
