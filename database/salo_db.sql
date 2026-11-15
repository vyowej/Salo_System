-- ============================================================================
-- SALO database: final schema baseline
-- Online food ordering, delivery, and table reservation platform (Philippines)
-- ============================================================================
-- Load on a server that has no `salo` database yet:
--   mariadb -u root -p < salo_database.sql
-- The script creates the database with 41 tables, one reconciliation view, and
-- immutability triggers. Requires MariaDB 10.2.1+ or MySQL 8.0.16+ (CHECK constraints).
-- If a table already exists, the load stops at that table and drops nothing.
--
-- Design principles
--   • 3NF. Historical snapshots (names, prices, addresses, fees, identity on
--     applications) are stored on the rows that need them, so past transactions never change.
--   • Money is DECIMAL only. Finance is a paired journal: ledger_journals and
--     ledger_entries. Journals and entries are immutable; corrections are reversals.
--   • Required ENUM columns are nullable with CHECK ... IS NOT NULL, because MariaDB
--     fills an omitted NOT NULL ENUM with its first value.
--   • Composite foreign keys keep child rows inside their restaurant, application,
--     table, or order.
--   • Government ID numbers and bank / e-wallet account numbers are stored encrypted
--     (*_encrypted columns). The application encrypts and decrypts them.
--   • Documents: PDF, JPEG, PNG; 10 MB maximum; kept in private storage.
--   • Dine-in is on by default for new restaurants (requirements report). The
--     onboarding wizard shows the checkbox, checked by default.
--
-- Reservations
--   A booking transaction locks the restaurants row (SELECT ... FOR UPDATE) before it
--   checks availability. restaurant_tables rows are locked only when a table is assigned.
--   table_id stays nullable until the business decides how tables are assigned.
--
-- Ledger rules (enforced by the application)
--   • Post each journal and its entries in one transaction. Each journal needs at least
--     two entries, and its debits must equal its credits.
--   • Idempotency keys are required for payment, refund, payout, cod_remittance, and provider_settlement journals.
--   • Run ledger_unbalanced_journals as a reconciliation check. It must return no rows.
--
-- Open items (not blocking the baseline)
--   • Starter chart of accounts: ledger_accounts rows are added by a seed script.
--   • Refunds are payment rows with payment_type = 'refund'. A dedicated table may follow.
--   • Payout and COD remittance batch tables (their journal types already exist).
--   • Promo stacking beyond one promo per order; enforcement of per-customer limits.
--   • Dispatch offer history, rider reapplication history, payout account history.
--   • Reviews for reservations; account deletion and retention.
-- ============================================================================

SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS salo_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE salo_db;



-- ============================================================================
-- LOCATION (normalized, Philippines only — no countries table)
-- Hierarchy: province → city → barangay → address
-- street and house_number stay on addresses (house_number is optional = NULL)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROVINCES
-- ----------------------------------------------------------------------------
CREATE TABLE provinces (
    province_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    province_name        VARCHAR(100)    NOT NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (province_id),
    UNIQUE KEY uk_provinces_name (province_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. CITIES (City or Municipality)
-- ----------------------------------------------------------------------------
CREATE TABLE cities (
    city_id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    province_id          BIGINT UNSIGNED NOT NULL,
    city_name            VARCHAR(100)    NOT NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (city_id),
    UNIQUE KEY uk_cities_province_name (province_id, city_name),
    KEY idx_cities_province (province_id),
    CONSTRAINT fk_cities_province FOREIGN KEY (province_id) REFERENCES provinces (province_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. BARANGAYS
-- uk_barangays_id_city exists only so other tables can reference
-- (barangay_id, city_id) and guarantee the barangay belongs to that city.
-- ----------------------------------------------------------------------------
CREATE TABLE barangays (
    barangay_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    city_id              BIGINT UNSIGNED NOT NULL,
    barangay_name        VARCHAR(100)    NOT NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (barangay_id),
    UNIQUE KEY uk_barangays_city_name (city_id, barangay_name),
    UNIQUE KEY uk_barangays_id_city (barangay_id, city_id),
    KEY idx_barangays_city (city_id),
    CONSTRAINT fk_barangays_city FOREIGN KEY (city_id) REFERENCES cities (city_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. ADDRESSES
-- Points to a barangay. Street is free text. House number is optional (NULL).
-- Used by customers (via user_addresses), restaurants and rider residences.
-- ----------------------------------------------------------------------------
CREATE TABLE addresses (
    address_id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    barangay_id          BIGINT UNSIGNED NOT NULL,
    street               VARCHAR(255)    NULL,
    house_number         VARCHAR(50)     NULL COMMENT 'Optional — NULL if none / unknown',
    building_name        VARCHAR(150)    NULL,
    landmark             TEXT            NULL COMMENT 'Landmarks and courier directions',
    postal_code          CHAR(4)         NULL,
    latitude             DECIMAL(10,8)   NULL,
    longitude            DECIMAL(11,8)   NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (address_id),
    KEY idx_addresses_barangay (barangay_id),
    CONSTRAINT fk_addresses_barangay FOREIGN KEY (barangay_id) REFERENCES barangays (barangay_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_addresses_postal_code CHECK (postal_code IS NULL OR postal_code REGEXP '^[0-9]{4}$'),
    CONSTRAINT chk_addresses_coordinates CHECK (
        (latitude IS NULL OR latitude BETWEEN -90 AND 90) AND
        (longitude IS NULL OR longitude BETWEEN -180 AND 180)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- USERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 5. USERS
-- user_role only distinguishes admin vs regular account.
-- Rider / owner status is derived from riders and restaurant_owners.
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    user_id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    username             VARCHAR(50)     NOT NULL,
    first_name           VARCHAR(100)    NOT NULL,
    middle_initial       CHAR(1)         NULL,
    last_name            VARCHAR(100)    NOT NULL,
    email                VARCHAR(255)    NOT NULL,
    password_hash        VARCHAR(255)    NOT NULL,
    phone_number         VARCHAR(30)     NULL,
    date_of_birth        DATE            NULL COMMENT 'Customer profile DOB. Rider applications keep their own copy on rider_applications.date_of_birth',
    user_role            ENUM('customer','admin') NOT NULL DEFAULT 'customer',
    account_status       ENUM('active','inactive','suspended','pending') NOT NULL DEFAULT 'active',
    email_verified_at    TIMESTAMP       NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uk_users_username (username),
    UNIQUE KEY uk_users_email (email),
    KEY idx_users_role (user_role),
    KEY idx_users_status (account_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. USER ADDRESSES
-- Links a user to an address with a label (Home, Work, etc.) and default flag.
-- ----------------------------------------------------------------------------
CREATE TABLE user_addresses (
    user_address_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id              BIGINT UNSIGNED NOT NULL,
    address_id           BIGINT UNSIGNED NOT NULL,
    address_label        VARCHAR(50)     NOT NULL COMMENT 'Home, Work, School, Other',
    is_default           TINYINT(1)      NOT NULL DEFAULT 0,
    recipient_name       VARCHAR(150)    NULL COMMENT 'Recipient name for this saved address',
    recipient_phone      VARCHAR(30)     NULL,
    default_user_key     BIGINT UNSIGNED GENERATED ALWAYS AS (IF(is_default = 1, user_id, NULL)) STORED COMMENT 'user_id when default, else NULL; UNIQUE = one default per user',
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_address_id),
    UNIQUE KEY uk_user_address (user_id, address_id),
    UNIQUE KEY uk_user_addresses_default (default_user_key),
    KEY idx_user_addresses_user (user_id),
    CONSTRAINT fk_user_addresses_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_user_addresses_address FOREIGN KEY (address_id) REFERENCES addresses (address_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- RESTAURANTS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 7. RESTAURANTS
-- A restaurant row is created when its application is submitted.
-- ----------------------------------------------------------------------------
CREATE TABLE restaurants (
    restaurant_id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    restaurant_name              VARCHAR(200)    NOT NULL,
    registered_name              VARCHAR(200)    NULL COMMENT 'Legal name on SEC / DTI papers; NULL = same as restaurant_name',
    business_type                ENUM('restaurant','cafe','bakery','fast_food','food_stall','food_kiosk','cloud_kitchen','other') NULL COMMENT 'Required; see chk_restaurants_required',
    ownership_structure          ENUM('sole_proprietorship','partnership','corporation','cooperative','other') NULL COMMENT 'Required; see chk_restaurants_required',
    description                  TEXT            NULL,
    contact_phone                VARCHAR(30)     NULL,
    business_email               VARCHAR(255)    NOT NULL,
    address_id                   BIGINT UNSIGNED NOT NULL,
    logo_image                   VARCHAR(500)    NULL COMMENT 'Local file path',
    cover_image                  VARCHAR(500)    NULL COMMENT 'Local file path',
    delivery_radius              DECIMAL(6,2)    NULL COMMENT 'Radius in kilometers',
    offers_delivery              TINYINT(1)      NOT NULL DEFAULT 1,
    offers_pickup                TINYINT(1)      NOT NULL DEFAULT 1,
    offers_dine_in               TINYINT(1)      NOT NULL DEFAULT 1,
    accepts_reservations         TINYINT(1)      NOT NULL DEFAULT 0,
    accepting_orders             TINYINT(1)      NOT NULL DEFAULT 1 COMMENT 'Manual pause; delivery/pickup/dine-in flags are the capabilities',
    accepting_reservations       TINYINT(1)      NOT NULL DEFAULT 1 COMMENT 'Manual pause; accepts_reservations is the capability',
    reservation_min_notice_hours SMALLINT UNSIGNED NOT NULL DEFAULT 2,
    reservation_max_party_size   SMALLINT UNSIGNED NOT NULL DEFAULT 8,
    reservation_notes            TEXT            NULL,
    restaurant_status            ENUM('pending','approved','rejected','active','inactive','suspended') NOT NULL DEFAULT 'pending',
    created_at                   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (restaurant_id),
    KEY idx_restaurants_status (restaurant_status),
    KEY idx_restaurants_address (address_id),
    CONSTRAINT fk_restaurants_address FOREIGN KEY (address_id) REFERENCES addresses (address_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_restaurants_one_service CHECK (offers_delivery = 1 OR offers_pickup = 1 OR offers_dine_in = 1),
    CONSTRAINT chk_restaurants_required CHECK (business_type IS NOT NULL AND ownership_structure IS NOT NULL),
    CONSTRAINT chk_restaurants_reservation_party CHECK (reservation_max_party_size > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 8. RESTAURANT OWNERS (many-to-many)
-- ----------------------------------------------------------------------------
CREATE TABLE restaurant_owners (
    restaurant_id        BIGINT UNSIGNED NOT NULL,
    user_id              BIGINT UNSIGNED NOT NULL,
    joined_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (restaurant_id, user_id),
    KEY idx_restaurant_owners_user (user_id),
    CONSTRAINT fk_restaurant_owners_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_restaurant_owners_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 9. RESTAURANT CATEGORIES (fully dynamic)
-- ----------------------------------------------------------------------------
CREATE TABLE restaurant_categories (
    category_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    category_name        VARCHAR(100)    NOT NULL,
    description          VARCHAR(255)    NULL,
    is_active            TINYINT(1)      NOT NULL DEFAULT 1,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (category_id),
    UNIQUE KEY uk_restaurant_categories_name (category_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 10. RESTAURANT CATEGORY MAP
-- ----------------------------------------------------------------------------
CREATE TABLE restaurant_category_map (
    restaurant_id        BIGINT UNSIGNED NOT NULL,
    category_id          BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (restaurant_id, category_id),
    KEY idx_rcm_category (category_id),
    CONSTRAINT fk_rcm_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_rcm_category FOREIGN KEY (category_id) REFERENCES restaurant_categories (category_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 11. RESTAURANT STAFF
-- Owner invites by username/email. Active only after the user accepts.
-- ----------------------------------------------------------------------------
CREATE TABLE restaurant_staff (
    staff_id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    restaurant_id        BIGINT UNSIGNED NOT NULL,
    user_id              BIGINT UNSIGNED NOT NULL,
    invited_by           BIGINT UNSIGNED NULL COMMENT 'Owner who sent the invitation',
    staff_position       VARCHAR(100)    NOT NULL COMMENT 'Manager, Reservation Staff, Order Staff, etc.',
    staff_status         ENUM('invited','active','inactive','declined') NOT NULL DEFAULT 'invited',
    invited_at           TIMESTAMP       NULL,
    responded_at         TIMESTAMP       NULL,
    joined_at            TIMESTAMP       NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (staff_id),
    UNIQUE KEY uk_restaurant_staff (restaurant_id, user_id),
    KEY idx_restaurant_staff_user (user_id),
    KEY idx_restaurant_staff_invited_by (invited_by),
    CONSTRAINT fk_restaurant_staff_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_restaurant_staff_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_restaurant_staff_invited_by FOREIGN KEY (invited_by) REFERENCES users (user_id) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 12. SERVICE AREAS
-- Coverage by city / barangay. Province is derived through cities.
-- barangay_id NULL = entire city.
-- barangay_key = 0 for "entire city", so the UNIQUE key below really blocks
-- duplicates (a UNIQUE index treats NULLs as distinct).
-- The composite FK (barangay_id, city_id) guarantees the barangay belongs to
-- the city. When barangay_id is NULL that FK is skipped (MATCH SIMPLE).
-- ----------------------------------------------------------------------------
CREATE TABLE service_areas (
    service_area_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    restaurant_id        BIGINT UNSIGNED NOT NULL,
    city_id              BIGINT UNSIGNED NOT NULL,
    barangay_id          BIGINT UNSIGNED NULL COMMENT 'NULL = entire city',
    barangay_key         BIGINT UNSIGNED GENERATED ALWAYS AS (IFNULL(barangay_id, 0)) STORED,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (service_area_id),
    UNIQUE KEY uk_service_area (restaurant_id, city_id, barangay_key),
    KEY idx_service_areas_city (city_id),
    KEY idx_service_areas_barangay_city (barangay_id, city_id),
    CONSTRAINT fk_service_areas_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_service_areas_city FOREIGN KEY (city_id) REFERENCES cities (city_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_service_areas_barangay_city FOREIGN KEY (barangay_id, city_id) REFERENCES barangays (barangay_id, city_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 13. OPERATING HOURS
-- (Several rows per day are allowed on purpose, e.g. split shifts.)
-- ----------------------------------------------------------------------------
CREATE TABLE operating_hours (
    operating_hour_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    restaurant_id        BIGINT UNSIGNED NOT NULL,
    day_of_week          TINYINT UNSIGNED NOT NULL COMMENT '0 = Sunday ... 6 = Saturday',
    opening_time         TIME            NOT NULL,
    closing_time         TIME            NOT NULL,
    closes_next_day      TINYINT(1)      NOT NULL DEFAULT 0,
    is_closed            TINYINT(1)      NOT NULL DEFAULT 0,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (operating_hour_id),
    KEY idx_operating_hours_restaurant_day (restaurant_id, day_of_week),
    CONSTRAINT fk_operating_hours_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT chk_operating_hours_day CHECK (day_of_week BETWEEN 0 AND 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 14. RESTAURANT CLOSURES
-- ----------------------------------------------------------------------------
CREATE TABLE restaurant_closures (
    closure_id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    restaurant_id        BIGINT UNSIGNED NOT NULL,
    closure_date         DATE            NOT NULL,
    reason               VARCHAR(255)    NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (closure_id),
    UNIQUE KEY uk_restaurant_closure (restaurant_id, closure_date),
    CONSTRAINT fk_closures_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 15. RESTAURANT TABLES
-- uk_restaurant_tables_id_restaurant lets reservations reference
-- (table_id, restaurant_id) so a reservation can only use its own
-- restaurant's table.
-- ----------------------------------------------------------------------------
CREATE TABLE restaurant_tables (
    table_id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    restaurant_id        BIGINT UNSIGNED NOT NULL,
    table_name           VARCHAR(50)     NOT NULL,
    seating_capacity     SMALLINT UNSIGNED NOT NULL,
    is_active            TINYINT(1)      NOT NULL DEFAULT 1,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (table_id),
    UNIQUE KEY uk_restaurant_table_name (restaurant_id, table_name),
    UNIQUE KEY uk_restaurant_tables_id_restaurant (table_id, restaurant_id),
    KEY idx_restaurant_tables_active (restaurant_id, is_active),
    CONSTRAINT fk_restaurant_tables_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT chk_restaurant_tables_capacity CHECK (seating_capacity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- RIDERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 16. RIDERS
-- A rider row is created when the application is submitted. riders.user_id is
-- unique, so a rejected rider who reapplies reuses this row (see open decisions).
-- ----------------------------------------------------------------------------
CREATE TABLE riders (
    rider_id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id                        BIGINT UNSIGNED NOT NULL,
    vehicle_type                   ENUM('motorcycle','bicycle','e_bike','e_scooter','walking') NULL COMMENT 'Delivery method (required). walking = no vehicle fields',
    vehicle_brand                  VARCHAR(100)    NULL,
    vehicle_model                  VARCHAR(100)    NULL COMMENT 'Model / battery / max speed, as entered',
    vehicle_color                  VARCHAR(50)     NULL,
    vehicle_year                   SMALLINT UNSIGNED NULL COMMENT 'Motorcycles',
    plate_number                   VARCHAR(30)     NULL COMMENT 'Motorcycles; stored uppercase',
    mv_file_number                 VARCHAR(20)     NULL COMMENT 'LTO MV file number, motorcycles',
    vehicle_ownership              ENUM('personally_owned','family_owned','borrowed','rented_leased','company_owned') NULL,
    vehicle_owner_name             VARCHAR(150)    NULL,
    vehicle_owner_relationship     VARCHAR(100)    NULL,
    bicycle_type                   ENUM('road','mountain','city_commuter','folding','gravel','cargo','other') NULL,
    motor_wattage                  VARCHAR(50)     NULL COMMENT 'E-bike motor output, optional',
    emergency_contact_name         VARCHAR(150)    NOT NULL,
    emergency_contact_relationship ENUM('parent','spouse_partner','sibling','child','relative','friend','colleague','other') NULL COMMENT 'Required (checked)',
    emergency_contact_phone        VARCHAR(30)     NOT NULL,
    emergency_contact_alt_phone    VARCHAR(30)     NULL,
    base_city_id                   BIGINT UNSIGNED NOT NULL COMMENT 'Primary city where shifts begin',
    preferred_hubs                 VARCHAR(255)    NULL,
    preferred_shifts               SET('breakfast','lunch','afternoon','dinner','late_night','flexible') NULL,
    available_days                 SET('mon','tue','wed','thu','fri','sat','sun') NULL,
    rider_status                   ENUM('pending','approved','rejected','active','inactive','suspended') NOT NULL DEFAULT 'pending',
    approved_at                    TIMESTAMP       NULL,
    created_at                     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (rider_id),
    UNIQUE KEY uk_riders_user (user_id),
    KEY idx_riders_status (rider_status),
    KEY idx_riders_base_city (base_city_id),
    CONSTRAINT fk_riders_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_riders_base_city FOREIGN KEY (base_city_id) REFERENCES cities (city_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_riders_required CHECK (vehicle_type IS NOT NULL AND emergency_contact_relationship IS NOT NULL),
    CONSTRAINT chk_riders_walking_no_vehicle CHECK (
        vehicle_type <> 'walking' OR (
            plate_number IS NULL AND vehicle_brand IS NULL AND vehicle_model IS NULL AND
            vehicle_color IS NULL AND vehicle_year IS NULL AND vehicle_ownership IS NULL AND
            bicycle_type IS NULL AND motor_wattage IS NULL AND mv_file_number IS NULL AND
            vehicle_owner_name IS NULL AND vehicle_owner_relationship IS NULL
        )
    ),
    CONSTRAINT chk_riders_motorcycle_fields CHECK (
        vehicle_type <> 'motorcycle' OR (plate_number IS NOT NULL AND vehicle_year IS NOT NULL AND vehicle_ownership IS NOT NULL)
    ),
    CONSTRAINT chk_riders_owner_fields CHECK (
        vehicle_ownership IS NULL OR vehicle_ownership = 'personally_owned' OR
        (vehicle_owner_name IS NOT NULL AND vehicle_owner_relationship IS NOT NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- PARTNER & RIDER APPLICATIONS
-- Restaurant and rider applications have separate tables. Document and
-- request tables are shared; each row points to exactly one application.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 17. RESTAURANT APPLICATIONS
-- One application per restaurant row (restaurant_id is unique).
-- ----------------------------------------------------------------------------
CREATE TABLE restaurant_applications (
    restaurant_application_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    reference_number          VARCHAR(40)     NOT NULL COMMENT 'SALO-APP-YYYYMMDD-XXXX',
    applicant_user_id         BIGINT UNSIGNED NOT NULL COMMENT 'Account that submitted the application',
    restaurant_id             BIGINT UNSIGNED NOT NULL COMMENT 'One application per restaurant row',
    application_status        ENUM('submitted','pending_review','under_review','additional_documents_required','needs_correction','resubmitted','approved','rejected') NOT NULL DEFAULT 'submitted',
    applicant_position        ENUM('business_owner','co_owner','authorized_representative','manager') NULL COMMENT 'Required; see chk_restaurant_applications_required',
    legal_first_name          VARCHAR(100)    NOT NULL,
    legal_middle_name         VARCHAR(100)    NULL,
    legal_last_name           VARCHAR(100)    NOT NULL,
    legal_suffix              VARCHAR(20)     NULL COMMENT 'Jr., III, etc.',
    date_of_birth             DATE            NOT NULL COMMENT 'Must be 18+; checked in the application',
    contact_phone             VARCHAR(30)     NOT NULL,
    contact_email             VARCHAR(255)    NOT NULL,
    contact_email_verified_at DATETIME        NOT NULL COMMENT 'Set when the email OTP is verified; required to submit',
    declarations_accepted_at  DATETIME        NOT NULL,
    terms_version             VARCHAR(20)     NOT NULL,
    submitted_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewer_note             TEXT            NULL COMMENT 'Current note shown to the applicant (correction or rejection reason)',
    reviewed_by               BIGINT UNSIGNED NULL,
    reviewed_at               DATETIME        NULL,
    decided_at                DATETIME        NULL COMMENT 'Set when approved or rejected',
    created_at                TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (restaurant_application_id),
    UNIQUE KEY uk_restaurant_applications_reference (reference_number),
    UNIQUE KEY uk_restaurant_applications_restaurant (restaurant_id),
    KEY idx_restaurant_applications_user (applicant_user_id),
    KEY idx_restaurant_applications_status (application_status),
    KEY idx_restaurant_applications_reviewer (reviewed_by),
    CONSTRAINT fk_restaurant_applications_user FOREIGN KEY (applicant_user_id) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_restaurant_applications_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_restaurant_applications_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_restaurant_applications_required CHECK (applicant_position IS NOT NULL),
    CONSTRAINT chk_restaurant_applications_note_required CHECK (
        application_status NOT IN ('needs_correction','rejected') OR
        (reviewer_note IS NOT NULL AND CHAR_LENGTH(TRIM(reviewer_note)) > 0)
    ),
    CONSTRAINT chk_restaurant_applications_decided CHECK (
        application_status NOT IN ('approved','rejected') OR decided_at IS NOT NULL
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 18. RIDER APPLICATIONS
-- rider_id is not unique: a rider who reapplies reuses the riders row.
-- ----------------------------------------------------------------------------
CREATE TABLE rider_applications (
    rider_application_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    reference_number          VARCHAR(40)     NOT NULL COMMENT 'SALO-RIDER-YYYYMMDD-XXXX',
    applicant_user_id         BIGINT UNSIGNED NOT NULL COMMENT 'Account that submitted the application',
    rider_id                  BIGINT UNSIGNED NOT NULL COMMENT 'Not unique: reapplications reuse the riders row',
    application_status        ENUM('submitted','pending_review','under_review','additional_documents_required','needs_correction','resubmitted','approved','rejected') NOT NULL DEFAULT 'submitted',
    legal_first_name          VARCHAR(100)    NOT NULL,
    legal_middle_name         VARCHAR(100)    NULL,
    legal_last_name           VARCHAR(100)    NOT NULL,
    legal_suffix              VARCHAR(20)     NULL,
    date_of_birth             DATE            NOT NULL COMMENT 'Must be 18+; checked in the application',
    gender                    ENUM('prefer_not_to_say','male','female','non_binary_other') NULL,
    contact_phone             VARCHAR(30)     NOT NULL,
    contact_email             VARCHAR(255)    NOT NULL,
    contact_email_verified_at DATETIME        NOT NULL,
    company_name              VARCHAR(200)    NULL COMMENT 'Fleet or agency name, if any',
    residence_address_id      BIGINT UNSIGNED NOT NULL,
    gov_id_type               ENUM('philid','drivers_license','passport','umid','sss','postal_id','prc','voters_comelec','other') NULL COMMENT 'Required; see chk_rider_applications_required',
    gov_id_number_encrypted   VARCHAR(512)    NOT NULL COMMENT 'Encrypted by the application',
    gov_id_is_permanent       TINYINT(1)      NOT NULL DEFAULT 0,
    gov_id_expires_on         DATE            NULL,
    flagged_section           VARCHAR(100)    NULL COMMENT 'Section flagged by Needs Correction (rider report)',
    flagged_document          VARCHAR(150)    NULL COMMENT 'Document flagged by Needs Correction (rider report)',
    declarations_accepted_at  DATETIME        NOT NULL,
    terms_version             VARCHAR(20)     NOT NULL,
    submitted_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewer_note             TEXT            NULL COMMENT 'Current note shown to the applicant (correction or rejection reason)',
    reviewed_by               BIGINT UNSIGNED NULL,
    reviewed_at               DATETIME        NULL,
    decided_at                DATETIME        NULL COMMENT 'Set when approved or rejected',
    created_at                TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (rider_application_id),
    UNIQUE KEY uk_rider_applications_reference (reference_number),
    KEY idx_rider_applications_rider (rider_id),
    KEY idx_rider_applications_user (applicant_user_id),
    KEY idx_rider_applications_status (application_status),
    KEY idx_rider_applications_residence (residence_address_id),
    KEY idx_rider_applications_reviewer (reviewed_by),
    CONSTRAINT fk_rider_applications_user FOREIGN KEY (applicant_user_id) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_rider_applications_rider FOREIGN KEY (rider_id) REFERENCES riders (rider_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_rider_applications_residence FOREIGN KEY (residence_address_id) REFERENCES addresses (address_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_rider_applications_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_rider_applications_required CHECK (gov_id_type IS NOT NULL),
    CONSTRAINT chk_rider_applications_id_expiry CHECK (gov_id_is_permanent = 1 OR gov_id_expires_on IS NOT NULL),
    CONSTRAINT chk_rider_applications_note_required CHECK (
        application_status NOT IN ('needs_correction','rejected') OR
        (reviewer_note IS NOT NULL AND CHAR_LENGTH(TRIM(reviewer_note)) > 0)
    ),
    CONSTRAINT chk_rider_applications_decided CHECK (
        application_status NOT IN ('approved','rejected') OR decided_at IS NOT NULL
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 19. APPLICATION DOCUMENT REQUESTS
-- Admin asks the applicant for an extra document. Exactly one of the two
-- application FKs is set.
-- ----------------------------------------------------------------------------
CREATE TABLE application_document_requests (
    request_id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    restaurant_application_id BIGINT UNSIGNED NULL,
    rider_application_id      BIGINT UNSIGNED NULL,
    requested_by              BIGINT UNSIGNED NOT NULL,
    document_name             VARCHAR(150)    NOT NULL COMMENT 'Preset name or custom name from the admin',
    reason                    TEXT            NOT NULL COMMENT 'Required. Shown to the applicant',
    instructions              TEXT            NULL COMMENT 'Optional clarifications for the applicant',
    due_date                  DATE            NULL,
    request_status            ENUM('open','submitted','cancelled') NOT NULL DEFAULT 'open',
    created_at                TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fulfilled_at              DATETIME        NULL,
    PRIMARY KEY (request_id),
    KEY idx_doc_requests_restaurant_app (restaurant_application_id),
    KEY idx_doc_requests_rider_app (rider_application_id),
    KEY idx_doc_requests_requested_by (requested_by),
    UNIQUE KEY uk_doc_requests_restaurant (request_id, restaurant_application_id),
    UNIQUE KEY uk_doc_requests_rider (request_id, rider_application_id),
    CONSTRAINT fk_doc_requests_restaurant_app FOREIGN KEY (restaurant_application_id) REFERENCES restaurant_applications (restaurant_application_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_doc_requests_rider_app FOREIGN KEY (rider_application_id) REFERENCES rider_applications (rider_application_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_doc_requests_requested_by FOREIGN KEY (requested_by) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_doc_requests_one_owner CHECK ((restaurant_application_id IS NULL) <> (rider_application_id IS NULL)),
    CONSTRAINT chk_doc_requests_reason CHECK (CHAR_LENGTH(TRIM(reason)) > 0),
    CONSTRAINT chk_doc_requests_fulfilled CHECK (request_status <> 'submitted' OR fulfilled_at IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 20. APPLICATION DOCUMENTS
-- Every uploaded file. Re-uploads add a new row; the latest upload per code is
-- current. Exactly one of the two application FKs is set. The per-type CHECKs
-- below keep each code with the right application type. Files live in private
-- storage. Required-document rules (per ownership, position or delivery
-- method) are enforced in the application.
-- ----------------------------------------------------------------------------
CREATE TABLE application_documents (
    document_id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    restaurant_application_id BIGINT UNSIGNED NULL,
    rider_application_id      BIGINT UNSIGNED NULL,
    request_id                BIGINT UNSIGNED NULL COMMENT 'Set when uploaded in response to an admin request',
    document_code             ENUM('dti_certificate','sec_certificate','cda_certificate','other_registration','government_id','mayors_permit','proof_of_address','authorization_letter','bir_2303','barangay_clearance','sanitary_permit','fire_safety_permit','bank_proof','government_id_front','government_id_back','selfie','driver_license','lto_or','lto_cr','motorcycle_photo','vehicle_authorization','motor_insurance','bicycle_photo','bicycle_proof','ebike_photo','ebike_proof','escooter_photo','escooter_proof','nbi_clearance','police_clearance','medical_clearance','requested_document') NULL COMMENT 'Required; see chk_application_documents_code and the per-type checks',
    file_path                 VARCHAR(500)    NOT NULL COMMENT 'Private storage path. Never a public URL',
    original_filename         VARCHAR(255)    NOT NULL,
    mime_type                 VARCHAR(50)     NOT NULL,
    file_size_bytes           INT UNSIGNED    NOT NULL,
    document_status           ENUM('pending_review','verified','rejected') NOT NULL DEFAULT 'pending_review',
    review_note               VARCHAR(500)    NULL COMMENT 'Required when rejected. Shown to the applicant',
    uploaded_by               BIGINT UNSIGNED NOT NULL,
    uploaded_at               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by               BIGINT UNSIGNED NULL,
    reviewed_at               DATETIME        NULL,
    PRIMARY KEY (document_id),
    UNIQUE KEY uk_application_documents_path (file_path),
    KEY idx_application_documents_restaurant_code (restaurant_application_id, document_code),
    KEY idx_application_documents_rider_code (rider_application_id, document_code),
    KEY idx_application_documents_request (request_id),
    KEY idx_application_documents_uploaded_by (uploaded_by),
    KEY idx_application_documents_reviewed_by (reviewed_by),
    CONSTRAINT fk_application_documents_restaurant_app FOREIGN KEY (restaurant_application_id) REFERENCES restaurant_applications (restaurant_application_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_application_documents_rider_app FOREIGN KEY (rider_application_id) REFERENCES rider_applications (rider_application_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_application_documents_request FOREIGN KEY (request_id) REFERENCES application_document_requests (request_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_application_documents_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_application_documents_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_application_documents_request_restaurant FOREIGN KEY (request_id, restaurant_application_id) REFERENCES application_document_requests (request_id, restaurant_application_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_application_documents_request_rider FOREIGN KEY (request_id, rider_application_id) REFERENCES application_document_requests (request_id, rider_application_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_application_documents_one_owner CHECK ((restaurant_application_id IS NULL) <> (rider_application_id IS NULL)),
    CONSTRAINT chk_application_documents_code CHECK (document_code IS NOT NULL),
    CONSTRAINT chk_application_documents_restaurant_codes CHECK (
        restaurant_application_id IS NULL OR document_code IN ('dti_certificate','sec_certificate','cda_certificate','other_registration','government_id','mayors_permit','proof_of_address','authorization_letter','bir_2303','barangay_clearance','sanitary_permit','fire_safety_permit','bank_proof','requested_document')
    ),
    CONSTRAINT chk_application_documents_rider_codes CHECK (
        rider_application_id IS NULL OR document_code IN ('government_id_front','government_id_back','selfie','driver_license','lto_or','lto_cr','motorcycle_photo','vehicle_authorization','motor_insurance','bicycle_photo','bicycle_proof','ebike_photo','ebike_proof','escooter_photo','escooter_proof','nbi_clearance','police_clearance','medical_clearance','barangay_clearance','bank_proof','requested_document')
    ),
    CONSTRAINT chk_application_documents_request_code CHECK (
        document_code <> 'requested_document' OR request_id IS NOT NULL
    ),
    CONSTRAINT chk_application_documents_mime CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
    CONSTRAINT chk_application_documents_size CHECK (file_size_bytes BETWEEN 1 AND 10485760),
    CONSTRAINT chk_application_documents_rejected_note CHECK (
        document_status <> 'rejected' OR (review_note IS NOT NULL AND CHAR_LENGTH(TRIM(review_note)) > 0)
    ),
    CONSTRAINT chk_application_documents_reviewed CHECK (
        document_status = 'pending_review' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 21. PAYOUT ACCOUNTS
-- Bank or e-wallet account that receives payouts. One per restaurant and one
-- per rider. Shared by both so the bank fields are not duplicated.
-- The account number is stored encrypted; display is masked by the application.
-- ----------------------------------------------------------------------------
CREATE TABLE payout_accounts (
    payout_account_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    restaurant_id           BIGINT UNSIGNED NULL,
    rider_id                BIGINT UNSIGNED NULL,
    provider                VARCHAR(100)    NOT NULL COMMENT 'Bank or e-wallet name; the list is validated by the application',
    account_type            ENUM('savings','current_checking','e_wallet','other') NULL COMMENT 'Required; see chk_payout_accounts_required',
    account_holder_name     VARCHAR(150)    NOT NULL,
    account_number_encrypted VARCHAR(512)   NOT NULL COMMENT 'Encrypted by the application',
    created_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (payout_account_id),
    UNIQUE KEY uk_payout_accounts_restaurant (restaurant_id),
    UNIQUE KEY uk_payout_accounts_rider (rider_id),
    CONSTRAINT fk_payout_accounts_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_payout_accounts_rider FOREIGN KEY (rider_id) REFERENCES riders (rider_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_payout_accounts_required CHECK (account_type IS NOT NULL),
    CONSTRAINT chk_payout_accounts_one_owner CHECK ((restaurant_id IS NULL) <> (rider_id IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MENU
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 22. MENU CATEGORIES
-- uk_menu_categories_id_restaurant lets menu_items reference
-- (menu_category_id, restaurant_id) so an item's category always belongs to
-- the item's restaurant.
-- ----------------------------------------------------------------------------
CREATE TABLE menu_categories (
    menu_category_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    restaurant_id        BIGINT UNSIGNED NOT NULL,
    category_name        VARCHAR(100)    NOT NULL,
    description          VARCHAR(255)    NULL,
    sort_order           INT             NOT NULL DEFAULT 0,
    is_active            TINYINT(1)      NOT NULL DEFAULT 1,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (menu_category_id),
    UNIQUE KEY uk_menu_category (restaurant_id, category_name),
    UNIQUE KEY uk_menu_categories_id_restaurant (menu_category_id, restaurant_id),
    KEY idx_menu_categories_restaurant (restaurant_id, is_active, sort_order),
    CONSTRAINT fk_menu_categories_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 23. MENU ITEMS
-- restaurant_id is kept for fast per-restaurant queries; the composite FK
-- keeps it consistent with the category's restaurant.
-- ----------------------------------------------------------------------------
CREATE TABLE menu_items (
    menu_item_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    restaurant_id        BIGINT UNSIGNED NOT NULL,
    menu_category_id     BIGINT UNSIGNED NOT NULL,
    item_name            VARCHAR(200)    NOT NULL,
    description          TEXT            NULL,
    photo_image          VARCHAR(500)    NULL,
    base_price           DECIMAL(10,2)   NOT NULL,
    availability_status  ENUM('available','temporarily_unavailable','sold_out','hidden') NOT NULL DEFAULT 'available',
    approval_status      ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    sort_order           INT             NOT NULL DEFAULT 0,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (menu_item_id),
    KEY idx_menu_items_restaurant (restaurant_id, availability_status),
    KEY idx_menu_items_category (menu_category_id, restaurant_id),
    KEY idx_menu_items_approval (approval_status),
    CONSTRAINT fk_menu_items_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_menu_items_category FOREIGN KEY (menu_category_id, restaurant_id) REFERENCES menu_categories (menu_category_id, restaurant_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_menu_items_price CHECK (base_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 24. ADD-ON GROUPS
-- ----------------------------------------------------------------------------
CREATE TABLE add_on_groups (
    add_on_group_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    menu_item_id         BIGINT UNSIGNED NOT NULL,
    group_name           VARCHAR(100)    NOT NULL,
    is_required          TINYINT(1)      NOT NULL DEFAULT 0,
    minimum_selections   TINYINT UNSIGNED NOT NULL DEFAULT 0,
    maximum_selections   TINYINT UNSIGNED NOT NULL DEFAULT 1,
    sort_order           INT             NOT NULL DEFAULT 0,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (add_on_group_id),
    KEY idx_add_on_groups_item (menu_item_id),
    CONSTRAINT fk_add_on_groups_item FOREIGN KEY (menu_item_id) REFERENCES menu_items (menu_item_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT chk_add_on_groups_selections CHECK (minimum_selections <= maximum_selections)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 25. ADD-ON OPTIONS
-- ----------------------------------------------------------------------------
CREATE TABLE add_on_options (
    add_on_option_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    add_on_group_id      BIGINT UNSIGNED NOT NULL,
    option_name          VARCHAR(100)    NOT NULL,
    additional_price     DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
    is_available         TINYINT(1)      NOT NULL DEFAULT 1,
    sort_order           INT             NOT NULL DEFAULT 0,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (add_on_option_id),
    KEY idx_add_on_options_group (add_on_group_id),
    CONSTRAINT fk_add_on_options_group FOREIGN KEY (add_on_group_id) REFERENCES add_on_groups (add_on_group_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT chk_add_on_options_price CHECK (additional_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- ORDERS & PAYMENTS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 26. CHECKOUTS
-- ----------------------------------------------------------------------------
CREATE TABLE checkouts (
    checkout_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id          BIGINT UNSIGNED NOT NULL,
    idempotency_key      VARCHAR(64)     NULL,
    checkout_status      ENUM('pending','paid','failed','cancelled','refunded','partially_refunded') NOT NULL DEFAULT 'pending',
    total_amount         DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (checkout_id),
    UNIQUE KEY uk_checkouts_idempotency (idempotency_key),
    KEY idx_checkouts_customer (customer_id),
    CONSTRAINT fk_checkouts_customer FOREIGN KEY (customer_id) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_checkouts_total CHECK (total_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 27. ORDERS
-- total_amount is a snapshot only (derived in application, not a source entity)
-- uk_orders_review_ref lets reviews reference (order_id, restaurant_id,
-- customer_id) so a review always matches its order.
-- ----------------------------------------------------------------------------
CREATE TABLE orders (
    order_id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    checkout_id              BIGINT UNSIGNED NOT NULL,
    restaurant_id            BIGINT UNSIGNED NOT NULL,
    customer_id              BIGINT UNSIGNED NOT NULL,
    reservation_id           BIGINT UNSIGNED NULL,
    restaurant_name          VARCHAR(200)    NOT NULL COMMENT 'Historical snapshot',
    customer_name            VARCHAR(200)    NOT NULL COMMENT 'Historical snapshot',
    order_reference          VARCHAR(40)     NOT NULL COMMENT 'Unique reference shown to customer and restaurant',
    order_type               ENUM('delivery','pickup','dine_in') NULL COMMENT 'Required; see chk_orders_required',
    order_priority           ENUM('standard','priority','scheduled') NOT NULL DEFAULT 'standard',
    order_status             ENUM('pending','accepted','preparing','ready','out_for_delivery','delivered','completed','cancelled','failed','rejected') NOT NULL DEFAULT 'pending',
    delivery_address_id      BIGINT UNSIGNED NULL,
    delivery_recipient_name  VARCHAR(150)    NULL,
    delivery_phone           VARCHAR(30)     NULL,
    delivery_address_text    TEXT            NULL COMMENT 'Full address snapshot at order time',
    delivery_latitude        DECIMAL(10,8)   NULL,
    delivery_longitude       DECIMAL(11,8)   NULL,
    delivery_notes           TEXT            NULL,
    subtotal_amount          DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    delivery_fee             DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
    priority_fee             DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
    discount_amount          DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
    total_amount             DECIMAL(12,2)   NOT NULL DEFAULT 0.00 COMMENT 'Snapshot only — calculated in app',
    commission_rate          DECIMAL(5,2)    NULL,
    commission_amount        DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
    restaurant_payable       DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    scheduled_for            DATETIME        NULL,
    placed_at                TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at              TIMESTAMP       NULL,
    completed_at             TIMESTAMP       NULL,
    cancelled_at             TIMESTAMP       NULL,
    cancelled_by             ENUM('customer','restaurant','admin','system') NULL,
    cancellation_reason      VARCHAR(255)    NULL,
    rejection_reason         VARCHAR(255)    NULL COMMENT 'Required when order_status = rejected',
    rejected_at              DATETIME        NULL COMMENT 'Set when order_status = rejected',
    tip_amount               DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT 'Recorded separately from commission',
    platform_discount_amount DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT 'Part of discount_amount funded by the platform',
    restaurant_discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Part of discount_amount funded by the restaurant',
    provider_discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Part of discount_amount funded by the payment provider',
    promo_id                 BIGINT UNSIGNED NULL COMMENT 'Promo applied to this order (FK added after promos)',
    created_at               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (order_id),
    UNIQUE KEY uk_orders_review_ref (order_id, restaurant_id, customer_id),
    UNIQUE KEY uk_orders_reference (order_reference),
    KEY idx_orders_checkout (checkout_id),
    KEY idx_orders_restaurant (restaurant_id),
    KEY idx_orders_customer (customer_id),
    KEY idx_orders_reservation (reservation_id),
    KEY idx_orders_status (order_status),
    KEY idx_orders_priority (order_priority),
    KEY idx_orders_placed_at (placed_at),
    CONSTRAINT fk_orders_checkout FOREIGN KEY (checkout_id) REFERENCES checkouts (checkout_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_orders_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_orders_delivery_address FOREIGN KEY (delivery_address_id) REFERENCES addresses (address_id) ON DELETE SET NULL ON UPDATE RESTRICT,
    CONSTRAINT chk_orders_required CHECK (order_type IS NOT NULL),
    CONSTRAINT chk_orders_rejection_reason CHECK (
        order_status <> 'rejected' OR (rejection_reason IS NOT NULL AND CHAR_LENGTH(TRIM(rejection_reason)) > 0 AND rejected_at IS NOT NULL)
    ),
    CONSTRAINT chk_orders_discount_split CHECK (platform_discount_amount + restaurant_discount_amount + provider_discount_amount = discount_amount),
    CONSTRAINT chk_orders_discount_shares_non_negative CHECK (
        platform_discount_amount >= 0 AND restaurant_discount_amount >= 0 AND provider_discount_amount >= 0
    ),
    CONSTRAINT chk_orders_tip CHECK (tip_amount >= 0),
    CONSTRAINT chk_orders_coordinates CHECK (
        (delivery_latitude IS NULL OR delivery_latitude BETWEEN -90 AND 90) AND
        (delivery_longitude IS NULL OR delivery_longitude BETWEEN -180 AND 180)
    ),
    CONSTRAINT chk_orders_amounts CHECK (
        subtotal_amount >= 0 AND delivery_fee >= 0 AND priority_fee >= 0 AND
        discount_amount >= 0 AND total_amount >= 0 AND commission_amount >= 0 AND
        restaurant_payable >= 0
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 28. ORDER ITEMS
-- ----------------------------------------------------------------------------
CREATE TABLE order_items (
    order_item_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id             BIGINT UNSIGNED NOT NULL,
    menu_item_id         BIGINT UNSIGNED NULL,
    item_name            VARCHAR(200)    NOT NULL COMMENT 'Historical snapshot',
    unit_price           DECIMAL(10,2)   NOT NULL COMMENT 'Historical snapshot',
    quantity             SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    special_instructions TEXT            NULL,
    line_total           DECIMAL(12,2)   NOT NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (order_item_id),
    KEY idx_order_items_order (order_id),
    KEY idx_order_items_menu_item (menu_item_id),
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (order_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_order_items_menu_item FOREIGN KEY (menu_item_id) REFERENCES menu_items (menu_item_id) ON DELETE SET NULL ON UPDATE RESTRICT,
    CONSTRAINT chk_order_items_values CHECK (quantity > 0 AND unit_price >= 0 AND line_total >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 29. ORDER ITEM ADD-ONS
-- ----------------------------------------------------------------------------
CREATE TABLE order_item_add_ons (
    order_item_add_on_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_item_id           BIGINT UNSIGNED NOT NULL,
    add_on_option_id        BIGINT UNSIGNED NULL,
    group_name              VARCHAR(100)    NOT NULL COMMENT 'Historical snapshot',
    option_name             VARCHAR(100)    NOT NULL COMMENT 'Historical snapshot',
    additional_price        DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT 'Historical snapshot',
    created_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (order_item_add_on_id),
    KEY idx_order_item_add_ons_item (order_item_id),
    CONSTRAINT fk_order_item_add_ons_item FOREIGN KEY (order_item_id) REFERENCES order_items (order_item_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_order_item_add_ons_option FOREIGN KEY (add_on_option_id) REFERENCES add_on_options (add_on_option_id) ON DELETE SET NULL ON UPDATE RESTRICT,
    CONSTRAINT chk_order_item_add_ons_price CHECK (additional_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 30. PAYMENTS
-- amount is always positive; payment_type says whether it is money in or out.
-- ----------------------------------------------------------------------------
CREATE TABLE payments (
    payment_id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    payment_reference    VARCHAR(100)    NULL,
    checkout_id          BIGINT UNSIGNED NULL,
    customer_id          BIGINT UNSIGNED NOT NULL,
    payment_method       ENUM('cash','card','e_wallet','online_banking','other') NULL COMMENT 'Required; see chk_payments_required',
    payment_type         ENUM('payment','refund') NOT NULL DEFAULT 'payment',
    payment_status       ENUM('pending','requires_customer_action','processing','authorized','partially_captured','paid','declined','failed','expired','voided','cancelled','partially_refunded','refunded','disputed','reversed') NOT NULL DEFAULT 'pending',
    refund_status        ENUM('requested','approved','submitted','processing','successful','failed','manual') NULL COMMENT 'Refund rows only; see chk_payments_refund_status',
    amount               DECIMAL(12,2)   NOT NULL,
    related_payment_id   BIGINT UNSIGNED NULL,
    provider_response    TEXT            NULL,
    paid_at              TIMESTAMP       NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (payment_id),
    UNIQUE KEY uk_payments_reference (payment_reference),
    KEY idx_payments_checkout (checkout_id),
    KEY idx_payments_customer (customer_id),
    KEY idx_payments_status (payment_status),
    KEY idx_payments_related (related_payment_id),
    CONSTRAINT fk_payments_checkout FOREIGN KEY (checkout_id) REFERENCES checkouts (checkout_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_payments_related FOREIGN KEY (related_payment_id) REFERENCES payments (payment_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_payments_required CHECK (payment_method IS NOT NULL),
    CONSTRAINT chk_payments_refund_fields CHECK (
        payment_type <> 'refund' OR (payment_status = 'pending' AND related_payment_id IS NOT NULL)
    ),
    CONSTRAINT chk_payments_refund_status CHECK ((payment_type = 'refund') = (refund_status IS NOT NULL)),
    CONSTRAINT chk_payments_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 31. PAYMENT ALLOCATIONS
-- ----------------------------------------------------------------------------
CREATE TABLE payment_allocations (
    allocation_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    payment_id           BIGINT UNSIGNED NOT NULL,
    order_id             BIGINT UNSIGNED NULL,
    reservation_id       BIGINT UNSIGNED NULL,
    allocation_type      ENUM('order_payment','reservation_payment','order_refund','reservation_refund') NULL COMMENT 'Required; see chk_payment_allocations_required',
    amount               DECIMAL(12,2)   NOT NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (allocation_id),
    KEY idx_payment_allocations_payment (payment_id),
    KEY idx_payment_allocations_order (order_id),
    KEY idx_payment_allocations_reservation (reservation_id),
    CONSTRAINT fk_payment_allocations_payment FOREIGN KEY (payment_id) REFERENCES payments (payment_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_payment_allocations_order FOREIGN KEY (order_id) REFERENCES orders (order_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_payment_allocations_target CHECK (
        (order_id IS NOT NULL AND reservation_id IS NULL) OR
        (order_id IS NULL AND reservation_id IS NOT NULL)
    ),
    CONSTRAINT chk_payment_allocations_required CHECK (allocation_type IS NOT NULL),
    CONSTRAINT chk_payment_allocations_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 32. DELIVERIES
-- ----------------------------------------------------------------------------
CREATE TABLE deliveries (
    delivery_id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id                 BIGINT UNSIGNED NOT NULL,
    rider_id                 BIGINT UNSIGNED NULL,
    delivery_status          ENUM('pending_assignment','offered','accepted','picked_up','in_transit','delivered','failed','cancelled') NOT NULL DEFAULT 'pending_assignment',
    rider_compensation       DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
    cod_amount_collected     DECIMAL(12,2)   NULL,
    cod_collected_at         TIMESTAMP       NULL,
    cod_remittance_status    ENUM('not_applicable','pending','submitted','confirmed','discrepancy') NOT NULL DEFAULT 'not_applicable',
    cod_remitted_at          TIMESTAMP       NULL,
    cod_confirmed_by         BIGINT UNSIGNED NULL,
    assigned_at              TIMESTAMP       NULL,
    accepted_at              TIMESTAMP       NULL,
    picked_up_at             TIMESTAMP       NULL,
    delivered_at             TIMESTAMP       NULL,
    failed_at                TIMESTAMP       NULL,
    failure_reason           VARCHAR(255)    NULL,
    proof_photo              VARCHAR(500)    NULL,
    recipient_name           VARCHAR(150)    NULL,
    proof_captured_at        DATETIME        NULL,
    proof_latitude           DECIMAL(10,8)   NULL,
    proof_longitude          DECIMAL(11,8)   NULL,
    delivery_notes           TEXT            NULL,
    created_at               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (delivery_id),
    UNIQUE KEY uk_deliveries_order (order_id),
    KEY idx_deliveries_rider (rider_id),
    KEY idx_deliveries_status (delivery_status),
    CONSTRAINT fk_deliveries_order FOREIGN KEY (order_id) REFERENCES orders (order_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_deliveries_rider FOREIGN KEY (rider_id) REFERENCES riders (rider_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_deliveries_cod_confirmed_by FOREIGN KEY (cod_confirmed_by) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_deliveries_proof_range CHECK (
        (proof_latitude IS NULL OR proof_latitude BETWEEN -90 AND 90) AND
        (proof_longitude IS NULL OR proof_longitude BETWEEN -180 AND 180)
    ),
    CONSTRAINT chk_deliveries_amounts CHECK (rider_compensation >= 0 AND (cod_amount_collected IS NULL OR cod_amount_collected >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 33. RESERVATIONS
-- The composite FK (table_id, restaurant_id) guarantees the table belongs to
-- the reservation's restaurant. table_id NULL (not yet assigned) skips it.
-- is_fee_refundable defaults to 1: set 0 only when non-refundable terms were
-- disclosed and accepted at booking.
-- Double booking is prevented in the application (transaction + row lock).
-- ----------------------------------------------------------------------------
CREATE TABLE reservations (
    reservation_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id          BIGINT UNSIGNED NOT NULL,
    restaurant_id        BIGINT UNSIGNED NOT NULL,
    table_id             BIGINT UNSIGNED NULL,
    reservation_start    DATETIME        NOT NULL,
    reservation_end      DATETIME        NOT NULL,
    number_of_guests     SMALLINT UNSIGNED NOT NULL,
    reservation_status   ENUM('pending','approved','awaiting_payment','confirmed','arrived','seated','completed','cancelled','no_show','rejected','expired') NOT NULL DEFAULT 'pending',
    deposit_amount       DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
    service_fee          DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
    is_fee_refundable    TINYINT(1)      NOT NULL DEFAULT 1 COMMENT 'Default refundable; 0 only if non-refundable terms were disclosed and accepted',
    cancellation_fee     DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
    special_requests     TEXT            NULL,
    cancelled_by         ENUM('customer','restaurant','admin','system') NULL,
    cancelled_at         TIMESTAMP       NULL,
    cancellation_reason  VARCHAR(255)    NULL,
    no_show_marked_at    DATETIME        NULL COMMENT 'Set with no_show, after the grace period',
    no_show_marked_by    BIGINT UNSIGNED NULL COMMENT 'Staff user who marked the no-show',
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (reservation_id),
    KEY idx_reservations_restaurant_start (restaurant_id, reservation_start),
    KEY idx_reservations_customer (customer_id),
    KEY idx_reservations_table (table_id, restaurant_id),
    KEY idx_reservations_status (reservation_status),
    CONSTRAINT fk_reservations_customer FOREIGN KEY (customer_id) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_reservations_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_reservations_table FOREIGN KEY (table_id, restaurant_id) REFERENCES restaurant_tables (table_id, restaurant_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_reservations_no_show_marked_by FOREIGN KEY (no_show_marked_by) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_reservations_no_show CHECK (
        reservation_status <> 'no_show' OR (no_show_marked_at IS NOT NULL AND no_show_marked_by IS NOT NULL)
    ),
    CONSTRAINT chk_reservations_time CHECK (reservation_end > reservation_start),
    CONSTRAINT chk_reservations_guests CHECK (number_of_guests > 0),
    CONSTRAINT chk_reservations_amounts CHECK (deposit_amount >= 0 AND service_fee >= 0 AND cancellation_fee >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE payment_allocations
    ADD CONSTRAINT fk_payment_allocations_reservation
    FOREIGN KEY (reservation_id) REFERENCES reservations (reservation_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE orders
    ADD CONSTRAINT fk_orders_reservation
    FOREIGN KEY (reservation_id) REFERENCES reservations (reservation_id)
    ON DELETE SET NULL ON UPDATE RESTRICT;

-- ----------------------------------------------------------------------------
-- 34. PAYMENT EVENTS
-- ----------------------------------------------------------------------------
CREATE TABLE payment_events (
    event_id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    provider_name        VARCHAR(50)     NOT NULL,
    event_key            VARCHAR(191)    NOT NULL,
    payment_id           BIGINT UNSIGNED NULL,
    payload              JSON            NULL,
    processing_status    ENUM('received','processed','ignored','failed') NOT NULL DEFAULT 'received',
    processed_at         TIMESTAMP       NULL,
    error_message        VARCHAR(500)    NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id),
    UNIQUE KEY uk_payment_events_key (provider_name, event_key),
    KEY idx_payment_events_payment (payment_id),
    CONSTRAINT fk_payment_events_payment FOREIGN KEY (payment_id) REFERENCES payments (payment_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- SUPPORT
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 35. AUDIT LOGS
-- Also holds the application timelines (entity_type = 'restaurant_application' or 'rider_application').
-- ----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    log_id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    actor_user_id        BIGINT UNSIGNED NULL,
    action               VARCHAR(100)    NOT NULL,
    entity_type          VARCHAR(50)     NOT NULL,
    entity_id            VARCHAR(100)    NOT NULL COMMENT 'Text keys allowed (e.g. platform settings)',
    old_values           JSON            NULL,
    new_values           JSON            NULL,
    reason               VARCHAR(255)    NULL,
    ip_address           VARCHAR(45)     NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (log_id),
    KEY idx_audit_logs_entity (entity_type, entity_id),
    KEY idx_audit_logs_actor (actor_user_id),
    KEY idx_audit_logs_created (created_at),
    CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 36. PASSWORD RESET TOKENS
-- expires_at is DATETIME (not TIMESTAMP) so older MariaDB does not attach an
-- implicit DEFAULT / ON UPDATE CURRENT_TIMESTAMP to it. The app must always
-- write it in one consistent timezone (UTC recommended).
-- ----------------------------------------------------------------------------
CREATE TABLE password_reset_tokens (
    reset_token_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id              BIGINT UNSIGNED NOT NULL,
    token_hash           VARCHAR(255)    NOT NULL,
    expires_at           DATETIME        NOT NULL,
    used_at              TIMESTAMP       NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (reset_token_id),
    UNIQUE KEY uk_password_reset_token_hash (token_hash),
    KEY idx_password_reset_user (user_id),
    CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 37. REVIEWS
-- One review per order (UNIQUE order_id; NULLs allowed for non-order reviews).
-- The composite FK makes restaurant_id and customer_id match the order.
-- ----------------------------------------------------------------------------
CREATE TABLE reviews (
    review_id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id          BIGINT UNSIGNED NOT NULL,
    restaurant_id        BIGINT UNSIGNED NOT NULL,
    order_id             BIGINT UNSIGNED NULL,
    rating               TINYINT UNSIGNED NOT NULL,
    comment              TEXT            NULL,
    is_visible           TINYINT(1)      NOT NULL DEFAULT 1,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (review_id),
    UNIQUE KEY uk_reviews_order (order_id),
    KEY idx_reviews_restaurant (restaurant_id),
    KEY idx_reviews_customer (customer_id),
    KEY idx_reviews_order_ref (order_id, restaurant_id, customer_id),
    CONSTRAINT fk_reviews_customer FOREIGN KEY (customer_id) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_reviews_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_reviews_order FOREIGN KEY (order_id, restaurant_id, customer_id) REFERENCES orders (order_id, restaurant_id, customer_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 38. PROMOS
-- ----------------------------------------------------------------------------
CREATE TABLE promos (
    promo_id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    promo_code           VARCHAR(50)     NULL COMMENT 'NULL only for automatic promos (auto_apply = 1)',
    auto_apply           TINYINT(1)      NOT NULL DEFAULT 0,
    promo_name           VARCHAR(150)    NOT NULL,
    description          VARCHAR(255)    NULL,
    discount_type        ENUM('percentage','fixed_amount') NULL COMMENT 'Required; see chk_promos_discount_type',
    funding_source       ENUM('platform','restaurant','joint','provider') NULL COMMENT 'Required; see chk_promos_funding_source',
    platform_share_percent   DECIMAL(5,2) NULL COMMENT 'Joint funding only',
    restaurant_share_percent DECIMAL(5,2) NULL COMMENT 'Joint funding only',
    discount_value       DECIMAL(10,2)   NOT NULL,
    minimum_order_amount DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    maximum_discount     DECIMAL(10,2)   NULL,
    restaurant_id        BIGINT UNSIGNED NULL COMMENT 'NULL = platform-wide',
    starts_at            DATETIME        NOT NULL,
    ends_at              DATETIME        NOT NULL,
    usage_limit          INT UNSIGNED    NULL,
    per_customer_limit   INT UNSIGNED    NULL COMMENT 'Enforced once promo_redemptions exists',
    used_count           INT UNSIGNED    NOT NULL DEFAULT 0,
    is_active            TINYINT(1)      NOT NULL DEFAULT 1,
    created_by           BIGINT UNSIGNED NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (promo_id),
    UNIQUE KEY uk_promos_code (promo_code),
    KEY idx_promos_restaurant (restaurant_id),
    KEY idx_promos_active (is_active, starts_at, ends_at),
    CONSTRAINT fk_promos_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_promos_created_by FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL ON UPDATE RESTRICT,
    CONSTRAINT chk_promos_funding_source CHECK (funding_source IS NOT NULL),
    CONSTRAINT chk_promos_discount_type CHECK (discount_type IS NOT NULL),
    CONSTRAINT chk_promos_code_or_auto CHECK (promo_code IS NOT NULL OR auto_apply = 1),
    CONSTRAINT chk_promos_joint_split CHECK (
        funding_source <> 'joint' OR (
            platform_share_percent IS NOT NULL AND restaurant_share_percent IS NOT NULL AND
            platform_share_percent BETWEEN 0 AND 100 AND restaurant_share_percent BETWEEN 0 AND 100 AND
            platform_share_percent + restaurant_share_percent = 100
        )
    ),
    CONSTRAINT chk_promos_value CHECK (discount_value > 0 AND (discount_type <> 'percentage' OR discount_value <= 100)),
    CONSTRAINT chk_promos_dates CHECK (ends_at > starts_at),
    CONSTRAINT chk_promos_amounts CHECK (minimum_order_amount >= 0 AND (maximum_discount IS NULL OR maximum_discount >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Orders reference promos, so this FK is added after the promos table.
ALTER TABLE orders
    ADD CONSTRAINT fk_orders_promo
    FOREIGN KEY (promo_id) REFERENCES promos (promo_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ============================================================================
-- FINANCE LEDGER (paired journal) — added in v9
-- Every money event is one journal. A journal has two or more entries, and its
-- debit total must equal its credit total. Journals and entries are immutable:
-- a correction is a reversal journal, never an edit or a delete.
-- Only verified events are posted (provider-confirmed payments, approved COD
-- remittances). Pending states stay in payments.
-- The database cannot check row by row that a journal balances. The application
-- posts each journal and its entries in one transaction. ledger_unbalanced_journals
-- must return no rows; run it as a reconciliation check.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 39. LEDGER ACCOUNTS
-- Chart of accounts. Rows rather than enum values, so accounts can be added
-- without a migration.
-- ----------------------------------------------------------------------------
CREATE TABLE ledger_accounts (
    account_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    account_code    VARCHAR(40)     NOT NULL,
    account_name    VARCHAR(150)    NOT NULL,
    account_type    ENUM('asset','liability','revenue','expense') NULL COMMENT 'Required; see chk_ledger_accounts_required',
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (account_id),
    UNIQUE KEY uk_ledger_accounts_code (account_code),
    CONSTRAINT chk_ledger_accounts_required CHECK (account_type IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 40. LEDGER JOURNALS
-- One row per money event. A reversal links to the journal it reverses; each
-- journal can be reversed once.
-- ----------------------------------------------------------------------------
CREATE TABLE ledger_journals (
    journal_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    journal_reference   VARCHAR(40)     NOT NULL COMMENT 'Unique, human-readable, traceable',
    journal_type        ENUM('payment','sales','commission','delivery_fee','rider_pay','tip','discount_funding','deposit','service_fee','refund','cod_collection','cod_remittance','provider_settlement','payout','adjustment','reversal') NULL COMMENT 'Required; see chk_ledger_journals_required',
    idempotency_key     VARCHAR(64)     NULL COMMENT 'Required for payment, refund, payout, cod_remittance, and provider_settlement journals',
    currency            CHAR(3)         NOT NULL DEFAULT 'PHP',
    description         VARCHAR(255)    NULL,
    checkout_id         BIGINT UNSIGNED NULL,
    order_id            BIGINT UNSIGNED NULL,
    reservation_id      BIGINT UNSIGNED NULL,
    payment_id          BIGINT UNSIGNED NULL COMMENT 'Required for payment and refund journals',
    payout_account_id   BIGINT UNSIGNED NULL,
    reverses_journal_id BIGINT UNSIGNED NULL COMMENT 'Set only on reversal journals; each journal can be reversed once',
    provider_reference  VARCHAR(100)    NULL,
    posted_by           BIGINT UNSIGNED NULL COMMENT 'NULL for system postings',
    posted_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (journal_id),
    UNIQUE KEY uk_ledger_journals_reference (journal_reference),
    UNIQUE KEY uk_ledger_journals_idempotency (idempotency_key),
    UNIQUE KEY uk_ledger_journals_reverses (reverses_journal_id),
    KEY idx_ledger_journals_checkout (checkout_id),
    KEY idx_ledger_journals_order (order_id),
    KEY idx_ledger_journals_reservation (reservation_id),
    KEY idx_ledger_journals_payment (payment_id),
    KEY idx_ledger_journals_payout_account (payout_account_id),
    KEY idx_ledger_journals_posted_by (posted_by),
    CONSTRAINT fk_ledger_journals_checkout FOREIGN KEY (checkout_id) REFERENCES checkouts (checkout_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_ledger_journals_order FOREIGN KEY (order_id) REFERENCES orders (order_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_ledger_journals_reservation FOREIGN KEY (reservation_id) REFERENCES reservations (reservation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_ledger_journals_payment FOREIGN KEY (payment_id) REFERENCES payments (payment_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_ledger_journals_payout_account FOREIGN KEY (payout_account_id) REFERENCES payout_accounts (payout_account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_ledger_journals_reverses FOREIGN KEY (reverses_journal_id) REFERENCES ledger_journals (journal_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_ledger_journals_posted_by FOREIGN KEY (posted_by) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_ledger_journals_required CHECK (journal_type IS NOT NULL AND CHAR_LENGTH(TRIM(journal_reference)) > 0),
    CONSTRAINT chk_ledger_journals_idempotency CHECK (
        journal_type NOT IN ('payment','refund','payout','cod_remittance','provider_settlement') OR idempotency_key IS NOT NULL
    ),
    CONSTRAINT chk_ledger_journals_payment_link CHECK (
        journal_type NOT IN ('payment','refund') OR payment_id IS NOT NULL
    ),
    CONSTRAINT chk_ledger_journals_reversal CHECK (
        (journal_type <> 'reversal' OR reverses_journal_id IS NOT NULL) AND
        (reverses_journal_id IS NULL OR journal_type = 'reversal')
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 41. LEDGER ENTRIES
-- Debit and credit lines. Amounts are always positive; the direction gives the
-- sign. A line names at most one party: a restaurant, a rider, or a customer.
-- ----------------------------------------------------------------------------
CREATE TABLE ledger_entries (
    entry_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    journal_id        BIGINT UNSIGNED NOT NULL,
    account_id        BIGINT UNSIGNED NOT NULL,
    direction         ENUM('debit','credit') NULL COMMENT 'Required; see chk_ledger_entries_required',
    amount            DECIMAL(12,2)   NOT NULL,
    restaurant_id     BIGINT UNSIGNED NULL,
    rider_id          BIGINT UNSIGNED NULL,
    customer_user_id  BIGINT UNSIGNED NULL,
    created_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (entry_id),
    KEY idx_ledger_entries_journal (journal_id),
    KEY idx_ledger_entries_account (account_id),
    KEY idx_ledger_entries_restaurant (restaurant_id),
    KEY idx_ledger_entries_rider (rider_id),
    KEY idx_ledger_entries_customer (customer_user_id),
    CONSTRAINT fk_ledger_entries_journal FOREIGN KEY (journal_id) REFERENCES ledger_journals (journal_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_ledger_entries_account FOREIGN KEY (account_id) REFERENCES ledger_accounts (account_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_ledger_entries_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_ledger_entries_rider FOREIGN KEY (rider_id) REFERENCES riders (rider_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_ledger_entries_customer FOREIGN KEY (customer_user_id) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_ledger_entries_required CHECK (direction IS NOT NULL),
    CONSTRAINT chk_ledger_entries_amount CHECK (amount > 0),
    CONSTRAINT chk_ledger_entries_one_party CHECK (
        (restaurant_id IS NOT NULL) + (rider_id IS NOT NULL) + (customer_user_id IS NOT NULL) <= 1
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Reconciliation view: journals that do not balance, or have fewer than two
-- entries. This must return no rows. Run it after each posting batch.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW ledger_unbalanced_journals AS
SELECT j.journal_id,
       j.journal_reference,
       COUNT(e.entry_id) AS entry_count,
       COALESCE(SUM(CASE WHEN e.direction = 'debit' THEN e.amount ELSE 0 END), 0) AS total_debit,
       COALESCE(SUM(CASE WHEN e.direction = 'credit' THEN e.amount ELSE 0 END), 0) AS total_credit
FROM ledger_journals j
LEFT JOIN ledger_entries e ON e.journal_id = j.journal_id
GROUP BY j.journal_id, j.journal_reference
HAVING COUNT(e.entry_id) < 2
    OR COALESCE(SUM(CASE WHEN e.direction = 'debit' THEN e.amount ELSE 0 END), 0)
       <> COALESCE(SUM(CASE WHEN e.direction = 'credit' THEN e.amount ELSE 0 END), 0);

-- ----------------------------------------------------------------------------
-- Immutability: posted journals and entries cannot be changed or deleted.
-- ----------------------------------------------------------------------------
CREATE TRIGGER trg_ledger_journals_no_update BEFORE UPDATE ON ledger_journals FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ledger_journals rows are immutable; post a reversal instead';
CREATE TRIGGER trg_ledger_journals_no_delete BEFORE DELETE ON ledger_journals FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ledger_journals rows are immutable; post a reversal instead';
CREATE TRIGGER trg_ledger_entries_no_update BEFORE UPDATE ON ledger_entries FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ledger_entries rows are immutable; post a reversal instead';
CREATE TRIGGER trg_ledger_entries_no_delete BEFORE DELETE ON ledger_entries FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ledger_entries rows are immutable; post a reversal instead';

-- ============================================================================
-- END OF SALO DATABASE SCHEMA
-- Total tables: 41
-- ============================================================================
-- Location hierarchy:
--   provinces → cities → barangays → addresses  (Philippines only)
--   house_number is optional (NULL); postal_code is 4 digits when present
--   street is free text on addresses
--
-- Invoice/order total is NOT a source entity — only a historical snapshot.
-- Rider 18+ is validated from rider_applications.date_of_birth in the application.
-- ============================================================================