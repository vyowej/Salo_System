<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS rider_delivery_declines (
                decline_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                rider_id     BIGINT UNSIGNED NOT NULL,
                order_id     BIGINT UNSIGNED NOT NULL,
                declined_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (decline_id),
                UNIQUE KEY uk_rider_delivery_declines_rider_order (rider_id, order_id),
                KEY idx_rider_delivery_declines_order (order_id),
                CONSTRAINT fk_rider_delivery_declines_rider
                    FOREIGN KEY (rider_id) REFERENCES riders (rider_id)
                    ON DELETE CASCADE ON UPDATE RESTRICT,
                CONSTRAINT fk_rider_delivery_declines_order
                    FOREIGN KEY (order_id) REFERENCES orders (order_id)
                    ON DELETE CASCADE ON UPDATE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS rider_delivery_declines');
    }
};
