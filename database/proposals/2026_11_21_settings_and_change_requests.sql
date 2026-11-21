-- ============================================================================
-- SALO Settings, Contact Numbers, Profile Change Requests & Lifecycle Requests
-- Non-destructive migration (CREATE TABLE IF NOT EXISTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_settings (
    user_id                  BIGINT UNSIGNED NOT NULL,
    notification_preferences JSON            NULL,
    privacy_preferences      JSON            NULL,
    security_preferences     JSON            NULL,
    appearance_preferences   JSON            NULL,
    created_at               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_user_settings_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_contact_numbers (
    contact_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id       BIGINT UNSIGNED NOT NULL,
    label         VARCHAR(40)     NOT NULL DEFAULT 'Personal',
    phone_number  VARCHAR(30)     NOT NULL,
    is_default    TINYINT(1)      NOT NULL DEFAULT 0,
    created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (contact_id),
    KEY idx_user_contact_numbers_user (user_id, is_default),
    CONSTRAINT fk_user_contact_numbers_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS profile_change_requests (
    request_id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    entity_type          ENUM('restaurant','rider') NOT NULL,
    entity_id            BIGINT UNSIGNED NOT NULL,
    requested_by_user_id BIGINT UNSIGNED NOT NULL,
    category             VARCHAR(60)     NOT NULL,
    payload              JSON            NOT NULL,
    document_paths       JSON            NULL,
    reason               TEXT            NULL,
    status               ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
    reviewed_by_user_id  BIGINT UNSIGNED NULL,
    review_note          TEXT            NULL,
    reviewed_at          TIMESTAMP       NULL DEFAULT NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (request_id),
    KEY idx_pcr_entity_status (entity_type, entity_id, status),
    KEY idx_pcr_requester (requested_by_user_id),
    KEY idx_pcr_status_created (status, created_at),
    CONSTRAINT fk_pcr_requester FOREIGN KEY (requested_by_user_id) REFERENCES users (user_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_pcr_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users (user_id) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS account_lifecycle_requests (
    lifecycle_request_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id              BIGINT UNSIGNED NOT NULL,
    request_type         ENUM('deactivation','reactivation','deletion') NOT NULL,
    reason               TEXT            NULL,
    status               ENUM('pending','approved','rejected','completed','cancelled') NOT NULL DEFAULT 'pending',
    reviewed_by_user_id  BIGINT UNSIGNED NULL,
    review_note          TEXT            NULL,
    reviewed_at          TIMESTAMP       NULL DEFAULT NULL,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (lifecycle_request_id),
    KEY idx_alr_user_type_status (user_id, request_type, status),
    KEY idx_alr_status_created (status, created_at),
    CONSTRAINT fk_alr_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_alr_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users (user_id) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
