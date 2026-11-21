<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $addedRestaurantPublishCol = false;

        if (Schema::hasTable('restaurants') && ! Schema::hasColumn('restaurants', 'is_published')) {
            DB::statement(<<<'SQL'
                ALTER TABLE restaurants
                    ADD COLUMN is_published TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Owner-controlled customer visibility; restaurant_status still wins' AFTER restaurant_status,
                    ADD COLUMN first_published_at TIMESTAMP NULL DEFAULT NULL AFTER is_published,
                    ADD COLUMN last_published_at TIMESTAMP NULL DEFAULT NULL AFTER first_published_at,
                    ADD COLUMN last_published_by BIGINT UNSIGNED NULL DEFAULT NULL AFTER last_published_at,
                    ADD KEY idx_restaurants_public (restaurant_status, is_published),
                    ADD CONSTRAINT fk_restaurants_last_published_by FOREIGN KEY (last_published_by) REFERENCES users (user_id) ON DELETE SET NULL ON UPDATE RESTRICT
            SQL);
            $addedRestaurantPublishCol = true;
        }

        $addedCategoryPublishCol = false;

        if (Schema::hasTable('menu_categories') && ! Schema::hasColumn('menu_categories', 'draft_state')) {
            DB::statement(<<<'SQL'
                ALTER TABLE menu_categories
                    ADD COLUMN draft_state ENUM('new','modified','pending_delete','clean') NOT NULL DEFAULT 'new' AFTER is_active,
                    ADD COLUMN is_published TINYINT(1) NOT NULL DEFAULT 0 AFTER draft_state,
                    ADD COLUMN published_category_name VARCHAR(100) NULL DEFAULT NULL AFTER is_published,
                    ADD COLUMN published_description VARCHAR(255) NULL DEFAULT NULL AFTER published_category_name,
                    ADD COLUMN published_sort_order INT NULL DEFAULT NULL AFTER published_description,
                    ADD COLUMN published_is_active TINYINT(1) NULL DEFAULT NULL AFTER published_sort_order,
                    ADD KEY idx_menu_categories_public (restaurant_id, is_published, published_is_active, published_sort_order)
            SQL);
            $addedCategoryPublishCol = true;
        }

        $addedItemPublishCol = false;

        if (Schema::hasTable('menu_items') && ! Schema::hasColumn('menu_items', 'draft_state')) {
            DB::statement(<<<'SQL'
                ALTER TABLE menu_items
                    ADD COLUMN draft_state ENUM('new','modified','pending_delete','clean') NOT NULL DEFAULT 'new' AFTER sort_order,
                    ADD COLUMN is_published TINYINT(1) NOT NULL DEFAULT 0 AFTER draft_state,
                    ADD COLUMN published_menu_category_id BIGINT UNSIGNED NULL DEFAULT NULL AFTER is_published,
                    ADD COLUMN published_item_name VARCHAR(200) NULL DEFAULT NULL AFTER published_menu_category_id,
                    ADD COLUMN published_description TEXT NULL DEFAULT NULL AFTER published_item_name,
                    ADD COLUMN published_photo_image VARCHAR(500) NULL DEFAULT NULL AFTER published_description,
                    ADD COLUMN published_base_price DECIMAL(10,2) NULL DEFAULT NULL AFTER published_photo_image,
                    ADD COLUMN published_sort_order INT NULL DEFAULT NULL AFTER published_base_price,
                    ADD COLUMN published_at TIMESTAMP NULL DEFAULT NULL AFTER published_sort_order,
                    ADD KEY idx_menu_items_public (restaurant_id, is_published, availability_status),
                    ADD CONSTRAINT chk_menu_items_published_price CHECK (published_base_price IS NULL OR published_base_price >= 0)
            SQL);
            $addedItemPublishCol = true;
        }

        // Backfill existing live (and suspended/inactive) restaurants and their approved menu
        // so live storefronts remain visible after deploying the publish gate.
        if ($addedRestaurantPublishCol) {
            DB::statement(<<<'SQL'
                UPDATE restaurants
                SET is_published = 1,
                    first_published_at = COALESCE(first_published_at, updated_at, created_at, CURRENT_TIMESTAMP),
                    last_published_at = COALESCE(last_published_at, updated_at, created_at, CURRENT_TIMESTAMP)
                WHERE restaurant_status IN ('active', 'suspended', 'inactive')
            SQL);
        }

        if ($addedCategoryPublishCol && Schema::hasTable('restaurants') && Schema::hasColumn('restaurants', 'is_published')) {
            DB::statement(<<<'SQL'
                UPDATE menu_categories mc
                INNER JOIN restaurants r ON r.restaurant_id = mc.restaurant_id
                SET mc.published_category_name = mc.category_name,
                    mc.published_description = mc.description,
                    mc.published_sort_order = mc.sort_order,
                    mc.published_is_active = mc.is_active,
                    mc.is_published = 1,
                    mc.draft_state = 'clean'
                WHERE r.is_published = 1
            SQL);
        }

        if ($addedItemPublishCol && Schema::hasTable('restaurants') && Schema::hasColumn('restaurants', 'is_published')) {
            DB::statement(<<<'SQL'
                UPDATE menu_items mi
                INNER JOIN restaurants r ON r.restaurant_id = mi.restaurant_id
                SET mi.published_menu_category_id = mi.menu_category_id,
                    mi.published_item_name = mi.item_name,
                    mi.published_description = mi.description,
                    mi.published_photo_image = mi.photo_image,
                    mi.published_base_price = mi.base_price,
                    mi.published_sort_order = mi.sort_order,
                    mi.is_published = 1,
                    mi.draft_state = 'clean',
                    mi.published_at = COALESCE(mi.updated_at, mi.created_at, CURRENT_TIMESTAMP)
                WHERE r.is_published = 1
                  AND mi.approval_status = 'approved'
            SQL);
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('menu_items') && Schema::hasColumn('menu_items', 'draft_state')) {
            DB::statement(<<<'SQL'
                ALTER TABLE menu_items
                    DROP CHECK chk_menu_items_published_price,
                    DROP KEY idx_menu_items_public,
                    DROP COLUMN published_at,
                    DROP COLUMN published_sort_order,
                    DROP COLUMN published_base_price,
                    DROP COLUMN published_photo_image,
                    DROP COLUMN published_description,
                    DROP COLUMN published_item_name,
                    DROP COLUMN published_menu_category_id,
                    DROP COLUMN is_published,
                    DROP COLUMN draft_state
            SQL);
        }

        if (Schema::hasTable('menu_categories') && Schema::hasColumn('menu_categories', 'draft_state')) {
            DB::statement(<<<'SQL'
                ALTER TABLE menu_categories
                    DROP KEY idx_menu_categories_public,
                    DROP COLUMN published_is_active,
                    DROP COLUMN published_sort_order,
                    DROP COLUMN published_description,
                    DROP COLUMN published_category_name,
                    DROP COLUMN is_published,
                    DROP COLUMN draft_state
            SQL);
        }

        if (Schema::hasTable('restaurants') && Schema::hasColumn('restaurants', 'is_published')) {
            DB::statement(<<<'SQL'
                ALTER TABLE restaurants
                    DROP FOREIGN KEY fk_restaurants_last_published_by,
                    DROP KEY idx_restaurants_public,
                    DROP COLUMN last_published_by,
                    DROP COLUMN last_published_at,
                    DROP COLUMN first_published_at,
                    DROP COLUMN is_published
            SQL);
        }
    }
};
