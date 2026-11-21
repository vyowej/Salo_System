-- ============================================================================
-- PROPOSED SCHEMA CHANGES (NOT EXECUTED ON PRODUCTION salo_db)
-- Feature: Customer Reviews, Ratings & Featured Restaurant of the Week
-- Target schema: database/salo_db.sql (validated on salo_test)
-- Corresponding Laravel migrations:
--   backend/database/migrations/2026_11_21_000001_extend_reviews_table_for_moderation_and_ratings.php
--   backend/database/migrations/2026_11_21_000002_create_rider_reviews_table.php
--   backend/database/migrations/2026_11_21_000003_create_featured_restaurant_weeks_table.php
--   backend/database/migrations/2026_11_21_000004_create_platform_settings_table.php
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ALTER TABLE: reviews (Restaurant Reviews — Moderation & Rating Support)
-- ----------------------------------------------------------------------------
ALTER TABLE reviews
    ADD COLUMN moderation_status ENUM('published','flagged','hidden','removed') NOT NULL DEFAULT 'published' AFTER is_visible,
    ADD COLUMN counts_toward_rating TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = eligible for rating and featured calculations; 0 = excluded' AFTER moderation_status,
    ADD COLUMN flagged_at TIMESTAMP NULL DEFAULT NULL AFTER counts_toward_rating,
    ADD COLUMN flagged_by BIGINT UNSIGNED NULL AFTER flagged_at,
    ADD COLUMN flag_reason VARCHAR(255) NULL AFTER flagged_by,
    ADD COLUMN moderated_by BIGINT UNSIGNED NULL AFTER flag_reason,
    ADD COLUMN moderated_at TIMESTAMP NULL DEFAULT NULL AFTER moderated_by,
    ADD COLUMN moderation_action ENUM('none','approved','flagged','hidden','restored','removed') NOT NULL DEFAULT 'none' AFTER moderated_at,
    ADD COLUMN moderation_reason VARCHAR(500) NULL AFTER moderation_action;

ALTER TABLE reviews DROP FOREIGN KEY fk_reviews_restaurant;
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
        (moderation_status NOT IN ('hidden','removed') OR (is_visible = 0 AND counts_toward_rating = 0))
        AND (is_visible = 1 OR counts_toward_rating = 0)
    ),
    ADD CONSTRAINT chk_reviews_flagged CHECK (
        moderation_status <> 'flagged' OR flagged_at IS NOT NULL
    ),
    ADD CONSTRAINT chk_reviews_moderated CHECK (
        moderation_status NOT IN ('hidden','removed')
        OR (
            moderated_by IS NOT NULL
            AND moderated_at IS NOT NULL
            AND moderation_reason IS NOT NULL
            AND CHAR_LENGTH(TRIM(moderation_reason)) > 0
        )
    );

-- ----------------------------------------------------------------------------
-- 2. SUPPORTING COMPOSITE UNIQUE KEYS FOR RIDER REVIEW INTEGRITY
-- ----------------------------------------------------------------------------
ALTER TABLE orders
    ADD UNIQUE KEY uk_orders_id_customer (order_id, customer_id);

ALTER TABLE deliveries
    ADD UNIQUE KEY uk_deliveries_review_ref (delivery_id, order_id, rider_id);

-- ----------------------------------------------------------------------------
-- 3. NEW TABLE: rider_reviews (Independent Customer Reviews for Riders)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rider_reviews (
    rider_review_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id          BIGINT UNSIGNED NOT NULL,
    rider_id             BIGINT UNSIGNED NOT NULL,
    order_id             BIGINT UNSIGNED NOT NULL,
    delivery_id          BIGINT UNSIGNED NOT NULL,
    rating               TINYINT UNSIGNED NOT NULL,
    comment              TEXT            NULL,
    is_visible           TINYINT(1)      NOT NULL DEFAULT 1,
    moderation_status    ENUM('published','flagged','hidden','removed') NOT NULL DEFAULT 'published',
    counts_toward_rating TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '1 = eligible for rider rating calculations; 0 = excluded',
    flagged_at           TIMESTAMP       NULL DEFAULT NULL,
    flagged_by           BIGINT UNSIGNED NULL,
    flag_reason          VARCHAR(255)    NULL,
    moderated_by         BIGINT UNSIGNED NULL,
    moderated_at         TIMESTAMP       NULL DEFAULT NULL,
    moderation_action    ENUM('none','approved','flagged','hidden','restored','removed') NOT NULL DEFAULT 'none',
    moderation_reason    VARCHAR(500)    NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (rider_review_id),
    UNIQUE KEY uk_rider_reviews_delivery (delivery_id),
    UNIQUE KEY uk_rider_reviews_order (order_id),
    KEY idx_rider_reviews_rider_eligible_created (rider_id, counts_toward_rating, is_visible, created_at),
    KEY idx_rider_reviews_rider_rating (rider_id, counts_toward_rating, rating),
    KEY idx_rider_reviews_customer (customer_id),
    KEY idx_rider_reviews_order_customer (order_id, customer_id),
    KEY idx_rider_reviews_delivery_ref (delivery_id, order_id, rider_id),
    KEY idx_rider_reviews_moderation_status (moderation_status, created_at),
    KEY idx_rider_reviews_flagged_by (flagged_by),
    KEY idx_rider_reviews_moderated_by (moderated_by),
    CONSTRAINT fk_rider_reviews_customer
        FOREIGN KEY (customer_id) REFERENCES users (user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_rider_reviews_rider
        FOREIGN KEY (rider_id) REFERENCES riders (rider_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_rider_reviews_order_customer
        FOREIGN KEY (order_id, customer_id) REFERENCES orders (order_id, customer_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_rider_reviews_delivery
        FOREIGN KEY (delivery_id, order_id, rider_id) REFERENCES deliveries (delivery_id, order_id, rider_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_rider_reviews_flagged_by
        FOREIGN KEY (flagged_by) REFERENCES users (user_id)
        ON DELETE SET NULL ON UPDATE RESTRICT,
    CONSTRAINT fk_rider_reviews_moderated_by
        FOREIGN KEY (moderated_by) REFERENCES users (user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_rider_reviews_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT chk_rider_reviews_visibility_eligibility CHECK (
        (moderation_status NOT IN ('hidden','removed') OR (is_visible = 0 AND counts_toward_rating = 0))
        AND (is_visible = 1 OR counts_toward_rating = 0)
    ),
    CONSTRAINT chk_rider_reviews_flagged CHECK (
        moderation_status <> 'flagged' OR flagged_at IS NOT NULL
    ),
    CONSTRAINT chk_rider_reviews_moderated CHECK (
        moderation_status NOT IN ('hidden','removed')
        OR (
            moderated_by IS NOT NULL
            AND moderated_at IS NOT NULL
            AND moderation_reason IS NOT NULL
            AND CHAR_LENGTH(TRIM(moderation_reason)) > 0
        )
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. NEW TABLE: featured_restaurant_weeks (Weekly Featured Restaurant History)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS featured_restaurant_weeks (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. NEW TABLE: platform_settings (Maintainable Policy Configuration)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_settings (
    setting_key   VARCHAR(100)    NOT NULL,
    setting_value VARCHAR(255)    NOT NULL,
    value_type    ENUM('integer','decimal','boolean','string','json') NOT NULL DEFAULT 'string',
    setting_group VARCHAR(50)     NOT NULL,
    description   VARCHAR(255)    NULL,
    updated_by    BIGINT UNSIGNED NULL,
    created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (setting_key),
    KEY idx_platform_settings_group (setting_group),
    KEY idx_platform_settings_updated_by (updated_by),
    CONSTRAINT fk_platform_settings_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (user_id)
        ON DELETE SET NULL ON UPDATE RESTRICT,
    CONSTRAINT chk_platform_settings_key CHECK (CHAR_LENGTH(TRIM(setting_key)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO platform_settings (setting_key, setting_value, value_type, setting_group, description) VALUES
    ('featured_restaurant.min_review_threshold', '10', 'integer', 'featured_restaurant', 'Minimum eligible restaurant reviews (m) required within the evaluation window to qualify.'),
    ('featured_restaurant.evaluation_period_days', '30', 'integer', 'featured_restaurant', 'Rolling evaluation period duration in days prior to weekly selection.'),
    ('featured_restaurant.feature_period_days', '7', 'integer', 'featured_restaurant', 'Duration in days for each Featured Restaurant of the Week period.'),
    ('featured_restaurant.week_start_day', 'monday', 'string', 'featured_restaurant', 'Day of the week on which each weekly featured period begins.'),
    ('featured_restaurant.fallback_baseline_rating', '4.0000', 'decimal', 'featured_restaurant', 'Fallback platform baseline rating (C) when platform-wide eligible reviews are insufficient.'),
    ('featured_restaurant.min_platform_reviews_for_baseline', '10', 'integer', 'featured_restaurant', 'Minimum platform-wide eligible reviews in the window required before using live mean C.'),
    ('featured_restaurant.auto_selection_enabled', '1', 'boolean', 'featured_restaurant', 'Whether automatic weekly featured restaurant selection is enabled.'),
    ('reviews.flagged_counts_toward_rating', '0', 'boolean', 'reviews', 'Whether reviews currently in flagged status remain eligible for rating calculations pending moderation.');
