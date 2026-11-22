<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('restaurants') && ! Schema::hasColumn('restaurants', 'parent_restaurant_id')) {
            // Step 1: Add nullable branch columns and parent self-FK
            DB::statement(<<<'SQL'
                ALTER TABLE restaurants
                    ADD COLUMN parent_restaurant_id BIGINT UNSIGNED NULL DEFAULT NULL
                        COMMENT 'NULL = main/root restaurant row for the business; set to root restaurant_id for additional branches'
                        AFTER restaurant_id,
                    ADD COLUMN brand_restaurant_id BIGINT UNSIGNED NULL DEFAULT NULL
                        COMMENT 'Plain column: equals restaurant_id for root, or parent_restaurant_id for child branches'
                        AFTER parent_restaurant_id,
                    ADD COLUMN branch_name VARCHAR(150) NULL DEFAULT NULL
                        COMMENT 'Branch label (e.g. Main Branch, SM North EDSA, BGC). NULL for single-location restaurants'
                        AFTER restaurant_name,
                    ADD KEY idx_restaurants_parent (parent_restaurant_id),
                    ADD CONSTRAINT fk_restaurants_parent
                        FOREIGN KEY (parent_restaurant_id) REFERENCES restaurants (restaurant_id)
                        ON DELETE RESTRICT ON UPDATE RESTRICT
            SQL);

            // Step 2: Backfill existing rows before adding brand FK + unique index
            DB::statement(<<<'SQL'
                UPDATE restaurants
                SET brand_restaurant_id = COALESCE(parent_restaurant_id, restaurant_id)
                WHERE brand_restaurant_id IS NULL
            SQL);

            // Step 3: Add brand self-FK, status index, and per-brand unique branch_name
            // (brand_restaurant_id stays NULLable permanently; app sets it right after insertGetId)
            DB::statement(<<<'SQL'
                ALTER TABLE restaurants
                    ADD KEY idx_restaurants_brand_status (brand_restaurant_id, restaurant_status),
                    ADD UNIQUE KEY uk_restaurants_brand_branch_name (brand_restaurant_id, branch_name),
                    ADD CONSTRAINT fk_restaurants_brand
                        FOREIGN KEY (brand_restaurant_id) REFERENCES restaurants (restaurant_id)
                        ON DELETE RESTRICT ON UPDATE RESTRICT
            SQL);
        }

        // Step 4: Create restaurant_application_branches
        if (! Schema::hasTable('restaurant_application_branches')) {
            DB::statement(<<<'SQL'
                CREATE TABLE restaurant_application_branches (
                    application_branch_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    restaurant_application_id    BIGINT UNSIGNED NOT NULL,
                    branch_name                  VARCHAR(150)    NOT NULL COMMENT 'e.g. SM North EDSA Branch, BGC Branch',
                    address_id                   BIGINT UNSIGNED NOT NULL COMMENT 'Normalized Philippine address + coordinates in addresses table',
                    contact_phone                VARCHAR(30)     NULL DEFAULT NULL COMMENT 'Optional branch-specific phone; falls back to business phone',
                    sort_order                   SMALLINT UNSIGNED NOT NULL DEFAULT 1,
                    created_branch_restaurant_id BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'Populated with the new restaurants.restaurant_id when approved',
                    created_at                   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at                   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (application_branch_id),
                    UNIQUE KEY uk_app_branch_name (restaurant_application_id, branch_name),
                    KEY idx_app_branches_application (restaurant_application_id, sort_order),
                    KEY idx_app_branches_address (address_id),
                    CONSTRAINT fk_app_branches_application
                        FOREIGN KEY (restaurant_application_id) REFERENCES restaurant_applications (restaurant_application_id)
                        ON DELETE CASCADE ON UPDATE RESTRICT,
                    CONSTRAINT fk_app_branches_address
                        FOREIGN KEY (address_id) REFERENCES addresses (address_id)
                        ON DELETE RESTRICT ON UPDATE RESTRICT,
                    CONSTRAINT fk_app_branches_created_restaurant
                        FOREIGN KEY (created_branch_restaurant_id) REFERENCES restaurants (restaurant_id)
                        ON DELETE SET NULL ON UPDATE RESTRICT
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            SQL);
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('restaurant_application_branches')) {
            DB::statement('DROP TABLE restaurant_application_branches');
        }

        if (Schema::hasTable('restaurants') && Schema::hasColumn('restaurants', 'parent_restaurant_id')) {
            DB::statement(<<<'SQL'
                ALTER TABLE restaurants
                    DROP FOREIGN KEY fk_restaurants_brand,
                    DROP FOREIGN KEY fk_restaurants_parent,
                    DROP KEY uk_restaurants_brand_branch_name,
                    DROP KEY idx_restaurants_brand_status,
                    DROP KEY idx_restaurants_parent,
                    DROP COLUMN branch_name,
                    DROP COLUMN brand_restaurant_id,
                    DROP COLUMN parent_restaurant_id
            SQL);
        }
    }
};
