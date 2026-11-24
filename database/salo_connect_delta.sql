-- SALO Connect Delta SQL (for fresh installs after importing database/salo_db.sql)
-- Do NOT edit database/salo_db.sql.

ALTER TABLE orders
    MODIFY COLUMN order_status ENUM(
        'pending','accepted','preparing','ready','out_for_delivery',
        'arrived','customer_reached','delivered','completed','cancelled','failed','rejected'
    ) NOT NULL DEFAULT 'pending',
    ADD COLUMN arrived_at TIMESTAMP NULL AFTER accepted_at,
    ADD COLUMN call_attempts INT UNSIGNED NOT NULL DEFAULT 0 AFTER arrived_at,
    ADD COLUMN last_call_resolved_at TIMESTAMP NULL AFTER call_attempts;

ALTER TABLE users
    ADD COLUMN ordering_suspended_until TIMESTAMP NULL AFTER account_status,
    ADD COLUMN suspension_reason VARCHAR(255) NULL AFTER ordering_suspended_until;

CREATE TABLE IF NOT EXISTS call_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    rider_id BIGINT UNSIGNED NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    attempt_no INT UNSIGNED NOT NULL,
    status ENUM('pending','answered','declined','timed_out') NOT NULL DEFAULT 'pending',
    counted_as_strike TINYINT(1) NOT NULL DEFAULT 0,
    customer_was_offline TINYINT(1) NULL DEFAULT NULL,
    created_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    responded_at TIMESTAMP NULL,
    PRIMARY KEY (id),
    KEY idx_call_logs_order_status (order_id, status),
    KEY idx_call_logs_order_attempt (order_id, attempt_no),
    KEY idx_call_logs_customer_created (customer_id, created_at),
    KEY idx_call_logs_rider_created (rider_id, created_at),
    CONSTRAINT fk_call_logs_order FOREIGN KEY (order_id) REFERENCES orders (order_id) ON DELETE CASCADE,
    CONSTRAINT fk_call_logs_rider FOREIGN KEY (rider_id) REFERENCES riders (rider_id) ON DELETE CASCADE,
    CONSTRAINT fk_call_logs_customer FOREIGN KEY (customer_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_incidents (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED NOT NULL,
    type ENUM('rider_declined_wait','unreachable_cancelled') NOT NULL,
    details TEXT NULL,
    created_at TIMESTAMP NULL,
    PRIMARY KEY (id),
    KEY idx_customer_incidents_user_created (user_id, created_at),
    KEY idx_customer_incidents_order_type (order_id, type),
    CONSTRAINT fk_customer_incidents_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_incidents_order FOREIGN KEY (order_id) REFERENCES orders (order_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    rider_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_conversations_order (order_id),
    KEY idx_conversations_customer (customer_id, updated_at),
    KEY idx_conversations_rider (rider_id, updated_at),
    CONSTRAINT fk_conversations_order FOREIGN KEY (order_id) REFERENCES orders (order_id) ON DELETE CASCADE,
    CONSTRAINT fk_conversations_customer FOREIGN KEY (customer_id) REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_conversations_rider FOREIGN KEY (rider_id) REFERENCES riders (rider_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    conversation_id BIGINT UNSIGNED NOT NULL,
    sender_id BIGINT UNSIGNED NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP NULL,
    read_at TIMESTAMP NULL,
    PRIMARY KEY (id),
    KEY idx_messages_conv_created (conversation_id, created_at),
    KEY idx_messages_conv_read (conversation_id, read_at),
    CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
    CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS waiting_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    rider_id BIGINT UNSIGNED NOT NULL,
    request_no TINYINT UNSIGNED NOT NULL,
    status ENUM('pending','accepted','declined','expired') NOT NULL DEFAULT 'pending',
    requested_minutes INT UNSIGNED NOT NULL DEFAULT 5,
    requested_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    responded_at TIMESTAMP NULL,
    wait_ends_at TIMESTAMP NULL,
    PRIMARY KEY (id),
    KEY idx_waiting_requests_order_status (order_id, status),
    KEY idx_waiting_requests_order_no (order_id, request_no),
    CONSTRAINT fk_waiting_requests_order FOREIGN KEY (order_id) REFERENCES orders (order_id) ON DELETE CASCADE,
    CONSTRAINT fk_waiting_requests_customer FOREIGN KEY (customer_id) REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_waiting_requests_rider FOREIGN KEY (rider_id) REFERENCES riders (rider_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS jobs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    queue VARCHAR(255) NOT NULL,
    payload LONGTEXT NOT NULL,
    attempts TINYINT UNSIGNED NOT NULL,
    reserved_at INT UNSIGNED NULL,
    available_at INT UNSIGNED NOT NULL,
    created_at INT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY jobs_queue_index (queue)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
