<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Extend restaurant_tables
        if (Schema::hasTable('restaurant_tables')) {
            if (!Schema::hasColumn('restaurant_tables', 'dining_area')) {
                DB::statement('ALTER TABLE restaurant_tables ADD COLUMN dining_area VARCHAR(100) NULL DEFAULT NULL AFTER table_name');
            }

            if (!Schema::hasColumn('restaurant_tables', 'description')) {
                DB::statement('ALTER TABLE restaurant_tables ADD COLUMN description VARCHAR(255) NULL DEFAULT NULL AFTER dining_area');
            }

            if (!Schema::hasColumn('restaurant_tables', 'min_party_size')) {
                DB::statement('ALTER TABLE restaurant_tables ADD COLUMN min_party_size SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER seating_capacity');
            }

            if (!$this->hasCheckConstraint('restaurant_tables', 'chk_restaurant_tables_min_party')) {
                try {
                    DB::statement('ALTER TABLE restaurant_tables ADD CONSTRAINT chk_restaurant_tables_min_party CHECK (min_party_size >= 1 AND min_party_size <= seating_capacity)');
                } catch (\Throwable) {
                    // Fallback: enforced by FormRequest and Service validation if DB engine rejects cross-column CHECK.
                }
            }
        }

        // 2. Extend reservations
        if (Schema::hasTable('reservations')) {
            if (!Schema::hasColumn('reservations', 'reservation_reference')) {
                DB::statement('ALTER TABLE reservations ADD COLUMN reservation_reference VARCHAR(40) NULL DEFAULT NULL AFTER reservation_id');
            }

            if (!Schema::hasColumn('reservations', 'contact_name')) {
                DB::statement('ALTER TABLE reservations ADD COLUMN contact_name VARCHAR(150) NULL DEFAULT NULL AFTER table_id');
            }

            if (!Schema::hasColumn('reservations', 'contact_phone')) {
                DB::statement('ALTER TABLE reservations ADD COLUMN contact_phone VARCHAR(30) NULL DEFAULT NULL AFTER contact_name');
            }

            if (!Schema::hasColumn('reservations', 'deposit_status')) {
                DB::statement("ALTER TABLE reservations ADD COLUMN deposit_status ENUM('none','pending','paid','waived','refunded') NOT NULL DEFAULT 'none' AFTER deposit_amount");
            }

            if (!Schema::hasColumn('reservations', 'idempotency_key')) {
                DB::statement('ALTER TABLE reservations ADD COLUMN idempotency_key VARCHAR(64) NULL DEFAULT NULL AFTER special_requests');
            }

            if (!Schema::hasColumn('reservations', 'rejection_reason')) {
                DB::statement('ALTER TABLE reservations ADD COLUMN rejection_reason VARCHAR(255) NULL DEFAULT NULL AFTER cancellation_reason');
            }

            if (!Schema::hasColumn('reservations', 'rejected_at')) {
                DB::statement('ALTER TABLE reservations ADD COLUMN rejected_at DATETIME NULL DEFAULT NULL AFTER rejection_reason');
            }

            if (!Schema::hasColumn('reservations', 'approved_at')) {
                DB::statement('ALTER TABLE reservations ADD COLUMN approved_at DATETIME NULL DEFAULT NULL AFTER rejected_at');
            }

            if (!Schema::hasColumn('reservations', 'confirmed_at')) {
                DB::statement('ALTER TABLE reservations ADD COLUMN confirmed_at DATETIME NULL DEFAULT NULL AFTER approved_at');
            }

            if (!Schema::hasColumn('reservations', 'arrived_at')) {
                DB::statement('ALTER TABLE reservations ADD COLUMN arrived_at DATETIME NULL DEFAULT NULL AFTER confirmed_at');
            }

            if (!Schema::hasColumn('reservations', 'seated_at')) {
                DB::statement('ALTER TABLE reservations ADD COLUMN seated_at DATETIME NULL DEFAULT NULL AFTER arrived_at');
            }

            if (!Schema::hasColumn('reservations', 'completed_at')) {
                DB::statement('ALTER TABLE reservations ADD COLUMN completed_at DATETIME NULL DEFAULT NULL AFTER seated_at');
            }

            if (!Schema::hasColumn('reservations', 'expired_at')) {
                DB::statement('ALTER TABLE reservations ADD COLUMN expired_at DATETIME NULL DEFAULT NULL AFTER completed_at');
            }

            // Backfill reservation_reference for any existing rows before adding UNIQUE index
            DB::statement("
                UPDATE reservations
                SET reservation_reference = CONCAT(
                    'SALO-RES-',
                    DATE_FORMAT(COALESCE(created_at, reservation_start, NOW()), '%Y%m%d'),
                    '-',
                    UPPER(LPAD(CONV(reservation_id, 10, 36), 4, '0'))
                )
                WHERE reservation_reference IS NULL OR TRIM(reservation_reference) = ''
            ");

            if (!$this->hasIndex('reservations', 'uk_reservations_reference')) {
                DB::statement('ALTER TABLE reservations ADD UNIQUE KEY uk_reservations_reference (reservation_reference)');
            }

            if (!$this->hasIndex('reservations', 'uk_reservations_customer_idempotency')) {
                DB::statement('ALTER TABLE reservations ADD UNIQUE KEY uk_reservations_customer_idempotency (customer_id, idempotency_key)');
            }

            if (!$this->hasIndex('reservations', 'idx_reservations_table_window')) {
                DB::statement('ALTER TABLE reservations ADD KEY idx_reservations_table_window (table_id, reservation_start, reservation_end)');
            }

            if (!$this->hasIndex('reservations', 'idx_reservations_customer_start')) {
                DB::statement('ALTER TABLE reservations ADD KEY idx_reservations_customer_start (customer_id, reservation_start)');
            }

            if (!$this->hasIndex('reservations', 'idx_reservations_restaurant_status_start')) {
                DB::statement('ALTER TABLE reservations ADD KEY idx_reservations_restaurant_status_start (restaurant_id, reservation_status, reservation_start)');
            }
        }

        // 3. Extend restaurants with reservation policy columns
        if (Schema::hasTable('restaurants')) {
            if (!Schema::hasColumn('restaurants', 'reservation_duration_minutes')) {
                DB::statement('ALTER TABLE restaurants ADD COLUMN reservation_duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 90 AFTER reservation_max_party_size');
            }

            if (!Schema::hasColumn('restaurants', 'reservation_max_advance_days')) {
                DB::statement('ALTER TABLE restaurants ADD COLUMN reservation_max_advance_days SMALLINT UNSIGNED NOT NULL DEFAULT 30 AFTER reservation_duration_minutes');
            }

            if (!Schema::hasColumn('restaurants', 'reservation_cancellation_cutoff_minutes')) {
                DB::statement('ALTER TABLE restaurants ADD COLUMN reservation_cancellation_cutoff_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 120 AFTER reservation_max_advance_days');
            }

            if (!Schema::hasColumn('restaurants', 'reservation_auto_confirm')) {
                DB::statement('ALTER TABLE restaurants ADD COLUMN reservation_auto_confirm TINYINT(1) NOT NULL DEFAULT 0 AFTER reservation_cancellation_cutoff_minutes');
            }

            if (!Schema::hasColumn('restaurants', 'reservation_pending_expiry_minutes')) {
                DB::statement('ALTER TABLE restaurants ADD COLUMN reservation_pending_expiry_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 120 AFTER reservation_auto_confirm');
            }

            if (!Schema::hasColumn('restaurants', 'reservation_deposit_required')) {
                DB::statement('ALTER TABLE restaurants ADD COLUMN reservation_deposit_required TINYINT(1) NOT NULL DEFAULT 0 AFTER reservation_pending_expiry_minutes');
            }

            if (!Schema::hasColumn('restaurants', 'reservation_deposit_amount')) {
                DB::statement('ALTER TABLE restaurants ADD COLUMN reservation_deposit_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER reservation_deposit_required');
            }

            if (!Schema::hasColumn('restaurants', 'reservation_service_fee')) {
                DB::statement('ALTER TABLE restaurants ADD COLUMN reservation_service_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER reservation_deposit_amount');
            }
        }

        // 4. Create reservation_status_history table
        if (!Schema::hasTable('reservation_status_history')) {
            DB::statement("
                CREATE TABLE reservation_status_history (
                    history_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    reservation_id      BIGINT UNSIGNED NOT NULL,
                    from_status         ENUM('pending','approved','awaiting_payment','confirmed','arrived','seated','completed','cancelled','no_show','rejected','expired') NULL DEFAULT NULL,
                    to_status           ENUM('pending','approved','awaiting_payment','confirmed','arrived','seated','completed','cancelled','no_show','rejected','expired') NOT NULL,
                    changed_by_user_id  BIGINT UNSIGNED NULL DEFAULT NULL,
                    changed_by_role     ENUM('customer','restaurant','admin','system') NOT NULL,
                    note                VARCHAR(255) NULL DEFAULT NULL,
                    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (history_id),
                    KEY idx_res_status_history_reservation (reservation_id, created_at),
                    KEY idx_res_status_history_actor (changed_by_user_id),
                    CONSTRAINT fk_res_status_history_reservation FOREIGN KEY (reservation_id) REFERENCES reservations (reservation_id) ON DELETE CASCADE ON UPDATE RESTRICT,
                    CONSTRAINT fk_res_status_history_actor FOREIGN KEY (changed_by_user_id) REFERENCES users (user_id) ON DELETE SET NULL ON UPDATE RESTRICT
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('reservation_status_history')) {
            DB::statement('DROP TABLE IF EXISTS reservation_status_history');
        }

        if (Schema::hasTable('restaurants')) {
            $restaurantCols = [
                'reservation_service_fee',
                'reservation_deposit_amount',
                'reservation_deposit_required',
                'reservation_pending_expiry_minutes',
                'reservation_auto_confirm',
                'reservation_cancellation_cutoff_minutes',
                'reservation_max_advance_days',
                'reservation_duration_minutes',
            ];

            foreach ($restaurantCols as $col) {
                if (Schema::hasColumn('restaurants', $col)) {
                    DB::statement("ALTER TABLE restaurants DROP COLUMN {$col}");
                }
            }
        }

        if (Schema::hasTable('reservations')) {
            $indexes = [
                'idx_reservations_restaurant_status_start',
                'idx_reservations_customer_start',
                'idx_reservations_table_window',
                'uk_reservations_customer_idempotency',
                'uk_reservations_reference',
            ];

            foreach ($indexes as $index) {
                if ($this->hasIndex('reservations', $index)) {
                    DB::statement("ALTER TABLE reservations DROP INDEX {$index}");
                }
            }

            $reservationCols = [
                'expired_at',
                'completed_at',
                'seated_at',
                'arrived_at',
                'confirmed_at',
                'approved_at',
                'rejected_at',
                'rejection_reason',
                'idempotency_key',
                'deposit_status',
                'contact_phone',
                'contact_name',
                'reservation_reference',
            ];

            foreach ($reservationCols as $col) {
                if (Schema::hasColumn('reservations', $col)) {
                    DB::statement("ALTER TABLE reservations DROP COLUMN {$col}");
                }
            }
        }

        if (Schema::hasTable('restaurant_tables')) {
            if ($this->hasCheckConstraint('restaurant_tables', 'chk_restaurant_tables_min_party')) {
                try {
                    DB::statement('ALTER TABLE restaurant_tables DROP CONSTRAINT chk_restaurant_tables_min_party');
                } catch (\Throwable) {
                    try {
                        DB::statement('ALTER TABLE restaurant_tables DROP CHECK chk_restaurant_tables_min_party');
                    } catch (\Throwable) {
                        // Ignore if constraint cannot be dropped separately
                    }
                }
            }

            foreach (['min_party_size', 'description', 'dining_area'] as $col) {
                if (Schema::hasColumn('restaurant_tables', $col)) {
                    DB::statement("ALTER TABLE restaurant_tables DROP COLUMN {$col}");
                }
            }
        }
    }

    private function hasIndex(string $table, string $indexName): bool
    {
        $database = DB::getDatabaseName();

        return DB::table('information_schema.STATISTICS')
            ->where('TABLE_SCHEMA', $database)
            ->where('TABLE_NAME', $table)
            ->where('INDEX_NAME', $indexName)
            ->exists();
    }

    private function hasCheckConstraint(string $table, string $constraintName): bool
    {
        $database = DB::getDatabaseName();

        return DB::table('information_schema.TABLE_CONSTRAINTS')
            ->where('CONSTRAINT_SCHEMA', $database)
            ->where('TABLE_NAME', $table)
            ->where('CONSTRAINT_NAME', $constraintName)
            ->where('CONSTRAINT_TYPE', 'CHECK')
            ->exists();
    }
};
