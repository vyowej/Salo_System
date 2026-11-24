<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('riders', 'schedule_effective_date')) {
            DB::statement(<<<'SQL'
                ALTER TABLE riders
                ADD COLUMN schedule_effective_date DATE NULL AFTER available_days
            SQL);
        }

        DB::statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS rider_schedule_change_requests (
                schedule_request_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                rider_id                   BIGINT UNSIGNED NOT NULL,
                entry_type                 ENUM('rider_request', 'admin_update') NOT NULL DEFAULT 'rider_request',
                status                     ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
                previous_available_days    VARCHAR(100) NULL,
                previous_preferred_shifts  VARCHAR(150) NULL,
                previous_preferred_hubs    VARCHAR(255) NULL,
                previous_effective_date    DATE NULL,
                requested_available_days   VARCHAR(100) NOT NULL,
                requested_preferred_shifts VARCHAR(150) NOT NULL,
                requested_preferred_hubs   VARCHAR(255) NULL,
                effective_date             DATE NOT NULL,
                reason                     TEXT NOT NULL,
                submitted_by_user_id       BIGINT UNSIGNED NOT NULL,
                submitted_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                reviewed_by_user_id        BIGINT UNSIGNED NULL,
                reviewed_at                TIMESTAMP NULL,
                admin_remarks              TEXT NULL,
                applied_at                 TIMESTAMP NULL,
                created_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (schedule_request_id),
                KEY idx_rscr_rider_status (rider_id, status),
                KEY idx_rscr_status_submitted (status, submitted_at),
                KEY idx_rscr_rider_applied (rider_id, status, applied_at, effective_date),
                CONSTRAINT fk_rscr_rider
                    FOREIGN KEY (rider_id) REFERENCES riders (rider_id)
                    ON DELETE CASCADE ON UPDATE RESTRICT,
                CONSTRAINT fk_rscr_submitted_by
                    FOREIGN KEY (submitted_by_user_id) REFERENCES users (user_id)
                    ON DELETE RESTRICT ON UPDATE RESTRICT,
                CONSTRAINT fk_rscr_reviewed_by
                    FOREIGN KEY (reviewed_by_user_id) REFERENCES users (user_id)
                    ON DELETE SET NULL ON UPDATE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS rider_schedule_change_requests');

        if (Schema::hasColumn('riders', 'schedule_effective_date')) {
            DB::statement(<<<'SQL'
                ALTER TABLE riders
                DROP COLUMN schedule_effective_date
            SQL);
        }
    }
};
