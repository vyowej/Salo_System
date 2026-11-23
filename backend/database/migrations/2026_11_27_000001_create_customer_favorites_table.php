<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS customer_favorites (
                favorite_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                user_id        BIGINT UNSIGNED NOT NULL,
                restaurant_id  BIGINT UNSIGNED NOT NULL,
                created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (favorite_id),
                UNIQUE KEY uk_customer_favorites_user_restaurant (user_id, restaurant_id),
                KEY idx_customer_favorites_user (user_id, created_at),
                KEY idx_customer_favorites_restaurant (restaurant_id),
                CONSTRAINT fk_customer_favorites_user
                    FOREIGN KEY (user_id) REFERENCES users (user_id)
                    ON DELETE CASCADE ON UPDATE RESTRICT,
                CONSTRAINT fk_customer_favorites_restaurant
                    FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id)
                    ON DELETE CASCADE ON UPDATE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS customer_favorites');
    }
};
