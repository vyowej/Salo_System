<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Composite unique keys matching SALO's existing uk_orders_review_ref convention,
        // enabling composite FKs on rider_reviews to guarantee order/customer/delivery/rider alignment.
        $hasOrderCustomerKey = DB::selectOne("
            SELECT 1 AS found
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'orders'
              AND INDEX_NAME = 'uk_orders_id_customer'
            LIMIT 1
        ");
        if (! $hasOrderCustomerKey) {
            DB::statement('ALTER TABLE orders ADD UNIQUE KEY uk_orders_id_customer (order_id, customer_id)');
        }

        $hasDeliveryReviewKey = DB::selectOne("
            SELECT 1 AS found
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'deliveries'
              AND INDEX_NAME = 'uk_deliveries_review_ref'
            LIMIT 1
        ");
        if (! $hasDeliveryReviewKey) {
            DB::statement('ALTER TABLE deliveries ADD UNIQUE KEY uk_deliveries_review_ref (delivery_id, order_id, rider_id)');
        }

        if (! Schema::hasTable('rider_reviews')) {
            DB::statement("
                CREATE TABLE rider_reviews (
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
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('rider_reviews');

        $hasDeliveryReviewKey = DB::selectOne("
            SELECT 1 AS found
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'deliveries'
              AND INDEX_NAME = 'uk_deliveries_review_ref'
            LIMIT 1
        ");
        if ($hasDeliveryReviewKey) {
            DB::statement('ALTER TABLE deliveries DROP KEY uk_deliveries_review_ref');
        }

        $hasOrderCustomerKey = DB::selectOne("
            SELECT 1 AS found
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'orders'
              AND INDEX_NAME = 'uk_orders_id_customer'
            LIMIT 1
        ");
        if ($hasOrderCustomerKey) {
            DB::statement('ALTER TABLE orders DROP KEY uk_orders_id_customer');
        }
    }
};
