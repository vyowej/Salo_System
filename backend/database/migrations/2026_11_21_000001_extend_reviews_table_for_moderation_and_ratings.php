<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('reviews', 'moderation_status')) {
            DB::statement("
                ALTER TABLE reviews
                    ADD COLUMN moderation_status ENUM('published','flagged','hidden','removed') NOT NULL DEFAULT 'published' AFTER is_visible,
                    ADD COLUMN counts_toward_rating TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = eligible for rating and featured calculations; 0 = excluded' AFTER moderation_status,
                    ADD COLUMN flagged_at TIMESTAMP NULL DEFAULT NULL AFTER counts_toward_rating,
                    ADD COLUMN flagged_by BIGINT UNSIGNED NULL AFTER flagged_at,
                    ADD COLUMN flag_reason VARCHAR(255) NULL AFTER flagged_by,
                    ADD COLUMN moderated_by BIGINT UNSIGNED NULL AFTER flag_reason,
                    ADD COLUMN moderated_at TIMESTAMP NULL DEFAULT NULL AFTER moderated_by,
                    ADD COLUMN moderation_action ENUM('none','approved','flagged','hidden','restored','removed') NOT NULL DEFAULT 'none' AFTER moderated_at,
                    ADD COLUMN moderation_reason VARCHAR(500) NULL AFTER moderation_action
            ");
        }

        // Preserve review history: replace ON DELETE CASCADE on restaurant FK with ON DELETE RESTRICT.
        DB::statement('ALTER TABLE reviews DROP FOREIGN KEY fk_reviews_restaurant');
        DB::statement('
            ALTER TABLE reviews
                ADD CONSTRAINT fk_reviews_restaurant
                    FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id)
                    ON DELETE RESTRICT ON UPDATE RESTRICT,
                ADD CONSTRAINT fk_reviews_flagged_by
                    FOREIGN KEY (flagged_by) REFERENCES users (user_id)
                    ON DELETE SET NULL ON UPDATE RESTRICT,
                ADD CONSTRAINT fk_reviews_moderated_by
                    FOREIGN KEY (moderated_by) REFERENCES users (user_id)
                    ON DELETE RESTRICT ON UPDATE RESTRICT,
                ADD KEY idx_reviews_restaurant_eligible_created (restaurant_id, counts_toward_rating, is_visible, created_at),
                ADD KEY idx_reviews_restaurant_rating (restaurant_id, counts_toward_rating, rating),
                ADD KEY idx_reviews_moderation_status (moderation_status, created_at),
                ADD KEY idx_reviews_eligible_created (counts_toward_rating, is_visible, created_at),
                ADD KEY idx_reviews_flagged_by (flagged_by),
                ADD KEY idx_reviews_moderated_by (moderated_by),
                ADD CONSTRAINT chk_reviews_visibility_eligibility CHECK (
                    (moderation_status NOT IN (\'hidden\',\'removed\') OR (is_visible = 0 AND counts_toward_rating = 0))
                    AND (is_visible = 1 OR counts_toward_rating = 0)
                ),
                ADD CONSTRAINT chk_reviews_flagged CHECK (
                    moderation_status <> \'flagged\' OR flagged_at IS NOT NULL
                ),
                ADD CONSTRAINT chk_reviews_moderated CHECK (
                    moderation_status NOT IN (\'hidden\',\'removed\')
                    OR (
                        moderated_by IS NOT NULL
                        AND moderated_at IS NOT NULL
                        AND moderation_reason IS NOT NULL
                        AND CHAR_LENGTH(TRIM(moderation_reason)) > 0
                    )
                )
        ');
    }

    public function down(): void
    {
        if (! Schema::hasColumn('reviews', 'moderation_status')) {
            return;
        }

        DB::statement('
            ALTER TABLE reviews
                DROP CONSTRAINT chk_reviews_moderated,
                DROP CONSTRAINT chk_reviews_flagged,
                DROP CONSTRAINT chk_reviews_visibility_eligibility,
                DROP FOREIGN KEY fk_reviews_moderated_by,
                DROP FOREIGN KEY fk_reviews_flagged_by,
                DROP FOREIGN KEY fk_reviews_restaurant,
                DROP KEY idx_reviews_moderated_by,
                DROP KEY idx_reviews_flagged_by,
                DROP KEY idx_reviews_eligible_created,
                DROP KEY idx_reviews_moderation_status,
                DROP KEY idx_reviews_restaurant_rating,
                DROP KEY idx_reviews_restaurant_eligible_created,
                DROP COLUMN moderation_reason,
                DROP COLUMN moderation_action,
                DROP COLUMN moderated_at,
                DROP COLUMN moderated_by,
                DROP COLUMN flag_reason,
                DROP COLUMN flagged_by,
                DROP COLUMN flagged_at,
                DROP COLUMN counts_toward_rating,
                DROP COLUMN moderation_status
        ');

        DB::statement('
            ALTER TABLE reviews
                ADD CONSTRAINT fk_reviews_restaurant
                    FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id)
                    ON DELETE CASCADE ON UPDATE RESTRICT
        ');
    }
};
