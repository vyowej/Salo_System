<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('platform_settings')) {
            DB::statement("
                CREATE TABLE platform_settings (
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
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
        }

        $defaults = [
            [
                'setting_key' => 'featured_restaurant.min_review_threshold',
                'setting_value' => '10',
                'value_type' => 'integer',
                'setting_group' => 'featured_restaurant',
                'description' => 'Minimum eligible restaurant reviews (m) required within the evaluation window to qualify.',
            ],
            [
                'setting_key' => 'featured_restaurant.evaluation_period_days',
                'setting_value' => '30',
                'value_type' => 'integer',
                'setting_group' => 'featured_restaurant',
                'description' => 'Rolling evaluation period duration in days prior to weekly selection.',
            ],
            [
                'setting_key' => 'featured_restaurant.feature_period_days',
                'setting_value' => '7',
                'value_type' => 'integer',
                'setting_group' => 'featured_restaurant',
                'description' => 'Duration in days for each Featured Restaurant of the Week period.',
            ],
            [
                'setting_key' => 'featured_restaurant.week_start_day',
                'setting_value' => 'monday',
                'value_type' => 'string',
                'setting_group' => 'featured_restaurant',
                'description' => 'Day of the week on which each weekly featured period begins.',
            ],
            [
                'setting_key' => 'featured_restaurant.fallback_baseline_rating',
                'setting_value' => '4.0000',
                'value_type' => 'decimal',
                'setting_group' => 'featured_restaurant',
                'description' => 'Fallback platform baseline rating (C) when platform-wide eligible reviews are insufficient.',
            ],
            [
                'setting_key' => 'featured_restaurant.min_platform_reviews_for_baseline',
                'setting_value' => '10',
                'value_type' => 'integer',
                'setting_group' => 'featured_restaurant',
                'description' => 'Minimum platform-wide eligible reviews in the window required before using live mean C.',
            ],
            [
                'setting_key' => 'featured_restaurant.auto_selection_enabled',
                'setting_value' => '1',
                'value_type' => 'boolean',
                'setting_group' => 'featured_restaurant',
                'description' => 'Whether automatic weekly featured restaurant selection is enabled.',
            ],
            [
                'setting_key' => 'reviews.flagged_counts_toward_rating',
                'setting_value' => '0',
                'value_type' => 'boolean',
                'setting_group' => 'reviews',
                'description' => 'Whether reviews currently in flagged status remain eligible for rating calculations pending moderation.',
            ],
        ];

        DB::table('platform_settings')->insertOrIgnore($defaults);
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_settings');
    }
};
