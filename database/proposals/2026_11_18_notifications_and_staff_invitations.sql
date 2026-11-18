-- ============================================================================
-- PROPOSED SCHEMA CHANGES (NOT EXECUTED — FOR REVIEW & APPROVAL)
-- Feature: In-App Notifications (All Roles) & Staff Invitations
-- Target schema: database/salo_db.sql (salo_db / salo_test)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. NEW TABLE: notifications
-- Account-level in-app notifications tagged by workspace so multi-role users
-- (customer + owner/staff + rider + admin) see and count notifications per
-- workspace without mixing roles or exposing private data.
-- ----------------------------------------------------------------------------
CREATE TABLE notifications (
    notification_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id             BIGINT UNSIGNED NOT NULL,
    workspace           ENUM('customer','restaurant','rider','admin') NOT NULL,
    type                VARCHAR(80)     NOT NULL COMMENT 'Stable notification event code',
    title               VARCHAR(160)    NOT NULL,
    body                TEXT            NOT NULL,
    related_entity_type VARCHAR(50)     NULL COMMENT 'Deep-link target type (order, staff_invitation, etc.)',
    related_entity_id   BIGINT UNSIGNED NULL COMMENT 'Deep-link target primary key',
    read_at             TIMESTAMP       NULL DEFAULT NULL,
    created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notification_id),
    KEY idx_notifications_user_read_created (user_id, read_at, created_at),
    KEY idx_notifications_user_workspace_read_created (user_id, workspace, read_at, created_at),
    KEY idx_notifications_entity (related_entity_type, related_entity_id),
    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. ALTER TABLE: restaurant_staff
-- Existing columns already cover: staff_id, restaurant_id, user_id, invited_by,
-- staff_position, staff_status, invited_at, responded_at, joined_at,
-- created_at, updated_at, and UNIQUE KEY uk_restaurant_staff (restaurant_id, user_id).
--
-- Additions:
--   - staff_status ENUM: add 'cancelled' and 'expired' while preserving
--     'invited' (pending) and 'active' (accepted) used by existing queries.
--   - invitation_note: optional owner note sent with the invitation.
--   - expires_at: invitation expiry timestamp (default 7 days via config).
-- ----------------------------------------------------------------------------
ALTER TABLE restaurant_staff
    MODIFY COLUMN staff_status ENUM('invited','active','inactive','declined','cancelled','expired') NOT NULL DEFAULT 'invited',
    ADD COLUMN invitation_note VARCHAR(500) NULL DEFAULT NULL AFTER staff_position,
    ADD COLUMN expires_at TIMESTAMP NULL DEFAULT NULL AFTER invited_at,
    ADD KEY idx_restaurant_staff_status_expires (staff_status, expires_at);
