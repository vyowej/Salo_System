<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('featured_restaurant_weeks')) {
            return;
        }

        DB::statement("
            CREATE TABLE featured_restaurant_weeks (
                featured_week_id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                restaurant_id               BIGINT UNSIGNED NOT NULL,
                feature_start_date          DATE            NOT NULL COMMENT 'Inclusive start date of the weekly feature period',
                feature_end_date            DATE            NOT NULL COMMENT 'Inclusive end date of the weekly feature period',
                evaluation_start_at         DATETIME        NOT NULL COMMENT 'Start of rolling evaluation period (e.g. 30 days prior)',
                evaluation_end_at           DATETIME        NOT NULL COMMENT 'End of rolling evaluation period',
                evaluation_review_count     INT UNSIGNED    NOT NULL COMMENT 'v: eligible restaurant reviews within evaluation period',
                raw_average_rating          DECIMAL(5,4)    NOT NULL COMMENT 'R: raw average eligible rating within evaluation period',
                bayesian_score              DECIMAL(6,4)    NOT NULL COMMENT 'Bayesian-adjusted score = (v/(v+m))*R + (m/(v+m))*C',
                platform_baseline_rating    DECIMAL(5,4)    NOT NULL COMMENT 'C: platform-wide baseline average rating used at selection time',
                min_review_threshold        INT UNSIGNED    NOT NULL COMMENT 'm: minimum qualifying review threshold used at selection time',
                last_eligible_review_at     TIMESTAMP       NULL DEFAULT NULL COMMENT 'Tie-breaker #4: most recent eligible review timestamp in window',
                selection_method            ENUM('automatic','admin_override') NOT NULL DEFAULT 'automatic',
                selection_status            ENUM('active','superseded','cancelled') NOT NULL DEFAULT 'active',
                active_week_start_key       DATE GENERATED ALWAYS AS (IF(selection_status = 'active', feature_start_date, NULL)) STORED COMMENT 'feature_start_date when active, else NULL; UNIQUE = one active selection per week',
                supersedes_featured_week_id BIGINT UNSIGNED NULL COMMENT 'Points to the prior weekly record replaced by an admin override',
                selected_at                 TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
                selected_by                 BIGINT UNSIGNED NULL COMMENT 'NULL for automatic selection; admin user_id for override',
                override_reason             VARCHAR(500)    NULL COMMENT 'Required when selection_method = admin_override',
                created_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (featured_week_id),
                UNIQUE KEY uk_featured_weeks_active_start (active_week_start_key),
                UNIQUE KEY uk_featured_weeks_supersedes (supersedes_featured_week_id),
                KEY idx_featured_weeks_period (feature_start_date, feature_end_date, selection_status),
                KEY idx_featured_weeks_restaurant (restaurant_id, feature_start_date),
                KEY idx_featured_weeks_selected_by (selected_by),
                CONSTRAINT fk_featured_weeks_restaurant
                    FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id)
                    ON DELETE RESTRICT ON UPDATE RESTRICT,
                CONSTRAINT fk_featured_weeks_supersedes
                    FOREIGN KEY (supersedes_featured_week_id) REFERENCES featured_restaurant_weeks (featured_week_id)
                    ON DELETE RESTRICT ON UPDATE RESTRICT,
                CONSTRAINT fk_featured_weeks_selected_by
                    FOREIGN KEY (selected_by) REFERENCES users (user_id)
                    ON DELETE RESTRICT ON UPDATE RESTRICT,
                CONSTRAINT chk_featured_weeks_feature_dates CHECK (feature_end_date >= feature_start_date),
                CONSTRAINT chk_featured_weeks_eval_dates CHECK (evaluation_end_at > evaluation_start_at),
                CONSTRAINT chk_featured_weeks_ratings CHECK (
                    raw_average_rating BETWEEN 0 AND 5
                    AND bayesian_score BETWEEN 0 AND 5
                    AND platform_baseline_rating BETWEEN 0 AND 5
                ),
                CONSTRAINT chk_featured_weeks_threshold CHECK (min_review_threshold > 0),
                CONSTRAINT chk_featured_weeks_auto_qualifies CHECK (
                    selection_method <> 'automatic' OR evaluation_review_count >= min_review_threshold
                ),
                CONSTRAINT chk_featured_weeks_override CHECK (
                    selection_method <> 'admin_override'
                    OR (
                        selected_by IS NOT NULL
                        AND override_reason IS NOT NULL
                        AND CHAR_LENGTH(TRIM(override_reason)) > 0
                    )
                )
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    }

    public function down(): void
    {
        Schema::dropIfExists('featured_restaurant_weeks');
    }
};
