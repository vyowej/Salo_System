-- =============================================================================
-- SALO Schema Proposal: Multi-Branch Restaurants (Phase 1)
-- =============================================================================
-- Adds self-referential multi-branch columns to `restaurants` and creates
-- `restaurant_application_branches` for pending partner applications.
--
-- Exact execution order:
--   1. ALTER TABLE restaurants: add nullable `parent_restaurant_id`,
--      nullable `brand_restaurant_id`, and nullable `branch_name`, plus
--      `fk_restaurants_parent` (RESTRICT) and `idx_restaurants_parent`.
--   2. Backfill existing rows: `brand_restaurant_id = COALESCE(parent_restaurant_id, restaurant_id)`.
--   3. ALTER TABLE restaurants: add `fk_restaurants_brand` (RESTRICT),
--      `idx_restaurants_brand_status`, and
--      `uk_restaurants_brand_branch_name (brand_restaurant_id, branch_name)`.
--      (`brand_restaurant_id` remains BIGINT UNSIGNED NULL permanently because
--      a root row references its own AUTO_INCREMENT `restaurant_id`, which is
--      unknown before INSERT, and MariaDB has no deferred FK constraints.)
--   4. CREATE TABLE restaurant_application_branches.
--
-- Note on self-parent & single-level hierarchy (no grandchildren):
--   MariaDB 10.11 rejects CHECK constraints referencing AUTO_INCREMENT
--   columns (ERROR 1901). Both self-parent and no-grandchildren checks are
--   enforced at the service layer (Phase 2a).
-- =============================================================================

-- Step 1: Add nullable branch columns and parent self-FK
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
        ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Step 2: Backfill existing rows so every restaurant points to its brand root
UPDATE restaurants
SET brand_restaurant_id = COALESCE(parent_restaurant_id, restaurant_id)
WHERE brand_restaurant_id IS NULL;

-- Step 3: Add brand self-FK, status index, and per-brand unique branch_name
-- (brand_restaurant_id stays NULLable; app sets it right after insertGetId)
ALTER TABLE restaurants
    ADD KEY idx_restaurants_brand_status (brand_restaurant_id, restaurant_status),
    ADD UNIQUE KEY uk_restaurants_brand_branch_name (brand_restaurant_id, branch_name),
    ADD CONSTRAINT fk_restaurants_brand
        FOREIGN KEY (brand_restaurant_id) REFERENCES restaurants (restaurant_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Step 4: Create restaurant_application_branches for pending Partner Applications
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
