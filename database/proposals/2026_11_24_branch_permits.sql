-- ============================================================================
-- SALO Multi-Branch: Branch Mayor's / Business Permits (Permit-1)
-- Target: MariaDB 10.11+ (apply to scratch DB first, then salo_test; salo_db only
-- after explicit approval and verified backup).
-- ============================================================================

CREATE TABLE branch_permits (
    permit_id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    restaurant_id          BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'Set for post-approval branches and materialized application branches; NULL only while application is pending',
    application_branch_id  BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'Set when branch was declared in an initial partner application',
    is_required_locally    TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '1 = permit file required; 0 = applicant/owner declared not required locally',
    exemption_reason       VARCHAR(500)    NULL DEFAULT NULL COMMENT 'Required when is_required_locally = 0',
    file_path              VARCHAR(500)    NULL DEFAULT NULL COMMENT 'Private storage path; never a public URL',
    original_filename      VARCHAR(255)    NULL DEFAULT NULL,
    mime_type              VARCHAR(50)     NULL DEFAULT NULL,
    file_size_bytes        INT UNSIGNED    NULL DEFAULT NULL,
    permit_status          ENUM('pending_submission','pending_review','under_review','additional_info_required','approved','rejected','waived') NOT NULL DEFAULT 'pending_submission',
    review_note            VARCHAR(500)    NULL DEFAULT NULL COMMENT 'Required when permit_status is rejected, additional_info_required, or waived',
    uploaded_by            BIGINT UNSIGNED NULL DEFAULT NULL,
    uploaded_at            DATETIME        NULL DEFAULT NULL,
    reviewed_by            BIGINT UNSIGNED NULL DEFAULT NULL,
    reviewed_at            DATETIME        NULL DEFAULT NULL,
    created_at             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (permit_id),
    UNIQUE KEY uk_branch_permits_restaurant (restaurant_id),
    UNIQUE KEY uk_branch_permits_app_branch (application_branch_id),
    UNIQUE KEY uk_branch_permits_path (file_path),
    KEY idx_branch_permits_rest_status (restaurant_id, permit_status),
    KEY idx_branch_permits_status (permit_status),
    KEY idx_branch_permits_uploaded_by (uploaded_by),
    KEY idx_branch_permits_reviewed_by (reviewed_by),
    CONSTRAINT fk_branch_permits_restaurant
        FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_branch_permits_app_branch
        FOREIGN KEY (application_branch_id) REFERENCES restaurant_application_branches (application_branch_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_branch_permits_uploaded_by
        FOREIGN KEY (uploaded_by) REFERENCES users (user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_branch_permits_reviewed_by
        FOREIGN KEY (reviewed_by) REFERENCES users (user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_branch_permits_owner
        CHECK (restaurant_id IS NOT NULL OR application_branch_id IS NOT NULL),
    CONSTRAINT chk_branch_permits_exemption_reason
        CHECK (is_required_locally = 1 OR CHAR_LENGTH(TRIM(COALESCE(exemption_reason, ''))) > 0),
    CONSTRAINT chk_branch_permits_pending_submission_file
        CHECK (permit_status = 'pending_submission' OR is_required_locally = 0 OR file_path IS NOT NULL),
    CONSTRAINT chk_branch_permits_mime
        CHECK (mime_type IS NULL OR mime_type IN ('application/pdf','image/jpeg','image/png')),
    CONSTRAINT chk_branch_permits_size
        CHECK (file_size_bytes IS NULL OR (file_size_bytes BETWEEN 1 AND 10485760)),
    CONSTRAINT chk_branch_permits_review_note
        CHECK (permit_status NOT IN ('rejected','additional_info_required','waived') OR CHAR_LENGTH(TRIM(COALESCE(review_note, ''))) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
