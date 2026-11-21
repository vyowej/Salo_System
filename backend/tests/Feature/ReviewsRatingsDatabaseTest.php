<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ReviewsRatingsDatabaseTest extends TestCase
{
    use DatabaseTransactions;

    private function createLocation(): array
    {
        $suffix = (string) mt_rand(100000, 999999);
        $provinceId = (int) DB::table('provinces')->insertGetId([
            'province_name' => 'RevTest Province '.$suffix,
        ]);
        $cityId = (int) DB::table('cities')->insertGetId([
            'province_id' => $provinceId,
            'city_name' => 'RevTest City '.$suffix,
        ]);
        $barangayId = (int) DB::table('barangays')->insertGetId([
            'city_id' => $cityId,
            'barangay_name' => 'RevTest Brgy '.$suffix,
        ]);
        $addressId = (int) DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '100 Review St',
            'postal_code' => '1000',
        ]);

        return compact('provinceId', 'cityId', 'barangayId', 'addressId');
    }

    private function createUser(string $role = 'customer'): int
    {
        $suffix = uniqid('rev_', true);

        return (int) DB::table('users')->insertGetId([
            'username' => substr(str_replace('.', '', $suffix), 0, 45),
            'first_name' => 'Test',
            'last_name' => 'User',
            'email' => str_replace('.', '', $suffix).'@example.com',
            'password_hash' => Hash::make('Password123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createRestaurant(int $addressId, string $name = 'Review Test Bistro'): int
    {
        return (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => $name,
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => uniqid('rest_', false).'@example.com',
            'address_id' => $addressId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'restaurant_status' => 'active',
        ]);
    }

    private function createRider(int $userId, int $cityId): int
    {
        return (int) DB::table('riders')->insertGetId([
            'user_id' => $userId,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Emergency Contact',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09171234567',
            'base_city_id' => $cityId,
            'rider_status' => 'active',
        ]);
    }

    private function createOrderWithDelivery(
        int $customerId,
        int $restaurantId,
        ?int $riderId = null,
        string $orderType = 'delivery',
    ): array {
        $checkoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $customerId,
            'checkout_status' => 'paid',
            'total_amount' => 350.00,
        ]);

        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $restaurantId,
            'customer_id' => $customerId,
            'restaurant_name' => 'Review Test Bistro',
            'customer_name' => 'Test User',
            'order_reference' => 'SALO-ORD-'.strtoupper(substr(uniqid(), -8)),
            'order_type' => $orderType,
            'order_status' => 'completed',
            'subtotal_amount' => 301.00,
            'delivery_fee' => $orderType === 'delivery' ? 49.00 : 0.00,
            'total_amount' => 350.00,
            'completed_at' => now(),
        ]);

        $deliveryId = null;
        if ($riderId !== null) {
            $deliveryId = (int) DB::table('deliveries')->insertGetId([
                'order_id' => $orderId,
                'rider_id' => $riderId,
                'delivery_status' => 'delivered',
                'delivered_at' => now(),
            ]);
        }

        return compact('checkoutId', 'orderId', 'deliveryId');
    }

    public function test_database_connection_targets_salo_test(): void
    {
        $activeDb = DB::selectOne('SELECT DATABASE() AS db')?->db;
        $this->assertSame('salo_test', $activeDb);
    }

    public function test_restaurant_and_rider_reviews_are_independent_and_enforce_relationships(): void
    {
        $loc = $this->createLocation();
        $customerId = $this->createUser('customer');
        $otherCustomerId = $this->createUser('customer');
        $riderUserId = $this->createUser('customer');
        $otherRiderUserId = $this->createUser('customer');
        $restaurantId = $this->createRestaurant($loc['addressId'], 'Bistro One');
        $otherRestaurantId = $this->createRestaurant($loc['addressId'], 'Bistro Two');
        $riderId = $this->createRider($riderUserId, $loc['cityId']);
        $otherRiderId = $this->createRider($otherRiderUserId, $loc['cityId']);

        // Order 1: restaurant review ONLY (no rider review)
        $order1 = $this->createOrderWithDelivery($customerId, $restaurantId, $riderId);
        $restReviewId = DB::table('reviews')->insertGetId([
            'customer_id' => $customerId,
            'restaurant_id' => $restaurantId,
            'order_id' => $order1['orderId'],
            'rating' => 5,
            'comment' => 'Delicious meal!',
        ]);
        $this->assertGreaterThan(0, $restReviewId);
        $this->assertSame(0, DB::table('rider_reviews')->where('order_id', $order1['orderId'])->count());

        // Order 2: rider review ONLY (no restaurant review)
        $order2 = $this->createOrderWithDelivery($customerId, $restaurantId, $riderId);
        $riderReviewId = DB::table('rider_reviews')->insertGetId([
            'customer_id' => $customerId,
            'rider_id' => $riderId,
            'order_id' => $order2['orderId'],
            'delivery_id' => $order2['deliveryId'],
            'rating' => 4,
            'comment' => 'Fast and polite delivery.',
        ]);
        $this->assertGreaterThan(0, $riderReviewId);
        $this->assertSame(0, DB::table('reviews')->where('order_id', $order2['orderId'])->count());

        // Composite FK rejects restaurant review with mismatched customer or restaurant
        $order3 = $this->createOrderWithDelivery($customerId, $restaurantId, $riderId);
        try {
            DB::table('reviews')->insert([
                'customer_id' => $otherCustomerId,
                'restaurant_id' => $restaurantId,
                'order_id' => $order3['orderId'],
                'rating' => 5,
            ]);
            $this->fail('Expected composite FK failure for mismatched customer_id on reviews.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('fk_reviews_order', $e->getMessage());
        }

        try {
            DB::table('reviews')->insert([
                'customer_id' => $customerId,
                'restaurant_id' => $otherRestaurantId,
                'order_id' => $order3['orderId'],
                'rating' => 5,
            ]);
            $this->fail('Expected composite FK failure for mismatched restaurant_id on reviews.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('fk_reviews_order', $e->getMessage());
        }

        // Composite FKs reject rider review with mismatched customer or mismatched rider
        try {
            DB::table('rider_reviews')->insert([
                'customer_id' => $otherCustomerId,
                'rider_id' => $riderId,
                'order_id' => $order3['orderId'],
                'delivery_id' => $order3['deliveryId'],
                'rating' => 5,
            ]);
            $this->fail('Expected composite FK failure for mismatched customer_id on rider_reviews.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('fk_rider_reviews_order_customer', $e->getMessage());
        }

        try {
            DB::table('rider_reviews')->insert([
                'customer_id' => $customerId,
                'rider_id' => $otherRiderId,
                'order_id' => $order3['orderId'],
                'delivery_id' => $order3['deliveryId'],
                'rating' => 5,
            ]);
            $this->fail('Expected composite FK failure for mismatched rider_id on rider_reviews.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('fk_rider_reviews_delivery', $e->getMessage());
        }
    }

    public function test_invalid_ratings_are_rejected_on_both_review_tables(): void
    {
        $loc = $this->createLocation();
        $customerId = $this->createUser('customer');
        $riderUserId = $this->createUser('customer');
        $restaurantId = $this->createRestaurant($loc['addressId']);
        $riderId = $this->createRider($riderUserId, $loc['cityId']);
        $order = $this->createOrderWithDelivery($customerId, $restaurantId, $riderId);

        foreach ([0, 6] as $invalidRating) {
            try {
                DB::table('reviews')->insert([
                    'customer_id' => $customerId,
                    'restaurant_id' => $restaurantId,
                    'order_id' => $order['orderId'],
                    'rating' => $invalidRating,
                ]);
                $this->fail("Expected CHECK failure for restaurant review rating {$invalidRating}.");
            } catch (QueryException $e) {
                $this->assertStringContainsString('chk_reviews_rating', $e->getMessage());
            }

            try {
                DB::table('rider_reviews')->insert([
                    'customer_id' => $customerId,
                    'rider_id' => $riderId,
                    'order_id' => $order['orderId'],
                    'delivery_id' => $order['deliveryId'],
                    'rating' => $invalidRating,
                ]);
                $this->fail("Expected CHECK failure for rider review rating {$invalidRating}.");
            } catch (QueryException $e) {
                $this->assertStringContainsString('chk_rider_reviews_rating', $e->getMessage());
            }
        }
    }

    public function test_duplicate_reviews_are_prevented_for_same_order_and_delivery(): void
    {
        $loc = $this->createLocation();
        $customerId = $this->createUser('customer');
        $riderUserId = $this->createUser('customer');
        $restaurantId = $this->createRestaurant($loc['addressId']);
        $riderId = $this->createRider($riderUserId, $loc['cityId']);
        $order = $this->createOrderWithDelivery($customerId, $restaurantId, $riderId);

        DB::table('reviews')->insert([
            'customer_id' => $customerId,
            'restaurant_id' => $restaurantId,
            'order_id' => $order['orderId'],
            'rating' => 5,
        ]);

        try {
            DB::table('reviews')->insert([
                'customer_id' => $customerId,
                'restaurant_id' => $restaurantId,
                'order_id' => $order['orderId'],
                'rating' => 4,
            ]);
            $this->fail('Expected unique constraint failure for duplicate restaurant review on same order.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('uk_reviews_order', $e->getMessage());
        }

        DB::table('rider_reviews')->insert([
            'customer_id' => $customerId,
            'rider_id' => $riderId,
            'order_id' => $order['orderId'],
            'delivery_id' => $order['deliveryId'],
            'rating' => 5,
        ]);

        try {
            DB::table('rider_reviews')->insert([
                'customer_id' => $customerId,
                'rider_id' => $riderId,
                'order_id' => $order['orderId'],
                'delivery_id' => $order['deliveryId'],
                'rating' => 3,
            ]);
            $this->fail('Expected unique constraint failure for duplicate rider review on same delivery.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('uk_rider_reviews_delivery', $e->getMessage());
        }
    }

    public function test_moderation_constraints_audit_logs_and_rating_eligibility_queries(): void
    {
        $loc = $this->createLocation();
        $customerId = $this->createUser('customer');
        $adminId = $this->createUser('admin');
        $riderUserId = $this->createUser('customer');
        $restaurantId = $this->createRestaurant($loc['addressId']);
        $riderId = $this->createRider($riderUserId, $loc['cityId']);

        $o1 = $this->createOrderWithDelivery($customerId, $restaurantId, $riderId);
        $o2 = $this->createOrderWithDelivery($customerId, $restaurantId, $riderId);
        $o3 = $this->createOrderWithDelivery($customerId, $restaurantId, $riderId);

        // Eligible reviews
        $r1 = DB::table('reviews')->insertGetId([
            'customer_id' => $customerId,
            'restaurant_id' => $restaurantId,
            'order_id' => $o1['orderId'],
            'rating' => 5,
            'comment' => 'Great!',
        ]);
        DB::table('reviews')->insert([
            'customer_id' => $customerId,
            'restaurant_id' => $restaurantId,
            'order_id' => $o2['orderId'],
            'rating' => 4,
            'comment' => 'Solid!',
        ]);
        $r3 = DB::table('reviews')->insertGetId([
            'customer_id' => $customerId,
            'restaurant_id' => $restaurantId,
            'order_id' => $o3['orderId'],
            'rating' => 1,
            'comment' => 'Abusive spam content',
        ]);

        // Reject hiding without moderation metadata or while still counting toward rating
        try {
            DB::table('reviews')->where('review_id', $r3)->update([
                'moderation_status' => 'hidden',
                'is_visible' => 1,
                'counts_toward_rating' => 1,
            ]);
            $this->fail('Expected CHECK failure when hidden review remains visible/eligible.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_reviews_visibility_eligibility', $e->getMessage());
        }

        try {
            DB::table('reviews')->where('review_id', $r3)->update([
                'moderation_status' => 'hidden',
                'is_visible' => 0,
                'counts_toward_rating' => 0,
                'moderation_action' => 'hidden',
            ]);
            $this->fail('Expected CHECK failure when hidden review lacks moderator/reason/timestamp.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_reviews_moderated', $e->getMessage());
        }

        // Valid moderation: hide review (preserved in DB, excluded from rating calculations)
        DB::table('reviews')->where('review_id', $r3)->update([
            'moderation_status' => 'hidden',
            'is_visible' => 0,
            'counts_toward_rating' => 0,
            'moderated_by' => $adminId,
            'moderated_at' => now(),
            'moderation_action' => 'hidden',
            'moderation_reason' => 'Violates community guidelines.',
        ]);

        // Record moderation event in existing audit_logs table
        DB::table('audit_logs')->insert([
            'actor_user_id' => $adminId,
            'action' => 'review.hidden',
            'entity_type' => 'restaurant_review',
            'entity_id' => (string) $r3,
            'old_values' => json_encode(['moderation_status' => 'published', 'counts_toward_rating' => 1]),
            'new_values' => json_encode(['moderation_status' => 'hidden', 'counts_toward_rating' => 0]),
            'reason' => 'Violates community guidelines.',
        ]);

        // Review is preserved in DB, not erased
        $this->assertDatabaseHas('reviews', [
            'review_id' => $r3,
            'moderation_status' => 'hidden',
            'is_visible' => 0,
            'counts_toward_rating' => 0,
            'moderated_by' => $adminId,
        ]);

        // Rating summary & 1-5 star distribution exclude the hidden review
        $summary = DB::table('reviews')
            ->where('restaurant_id', $restaurantId)
            ->where('counts_toward_rating', 1)
            ->where('is_visible', 1)
            ->selectRaw('COUNT(*) AS total, AVG(rating) AS avg_rating')
            ->first();

        $this->assertSame(2, (int) $summary->total);
        $this->assertEqualsWithDelta(4.5, (float) $summary->avg_rating, 0.0001);

        $distribution = DB::table('reviews')
            ->where('restaurant_id', $restaurantId)
            ->where('counts_toward_rating', 1)
            ->groupBy('rating')
            ->pluck(DB::raw('COUNT(*)'), 'rating')
            ->all();
        $this->assertSame([4 => 1, 5 => 1], $distribution);

        // Flagging check on rider_reviews
        $rrId = DB::table('rider_reviews')->insertGetId([
            'customer_id' => $customerId,
            'rider_id' => $riderId,
            'order_id' => $o1['orderId'],
            'delivery_id' => $o1['deliveryId'],
            'rating' => 5,
            'comment' => 'Awesome rider!',
        ]);
        try {
            DB::table('rider_reviews')->where('rider_review_id', $rrId)->update([
                'moderation_status' => 'flagged',
            ]);
            $this->fail('Expected CHECK failure when flagged rider review lacks flagged_at.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_rider_reviews_flagged', $e->getMessage());
        }

        // Review history is protected by ON DELETE RESTRICT (cannot cascade-delete restaurant/rider)
        try {
            DB::table('restaurants')->where('restaurant_id', $restaurantId)->delete();
            $this->fail('Expected RESTRICT FK failure when deleting restaurant with reviews.');
        } catch (QueryException $e) {
            $this->assertNotEmpty($e->getMessage());
        }

        $this->assertDatabaseHas('reviews', ['review_id' => $r1]);
    }

    public function test_featured_restaurant_weeks_history_uniqueness_and_override_constraints(): void
    {
        $loc = $this->createLocation();
        $adminId = $this->createUser('admin');
        $restA = $this->createRestaurant($loc['addressId'], 'Featured Kitchen A');
        $restB = $this->createRestaurant($loc['addressId'], 'Featured Kitchen B');

        // Week 1 automatic selection
        $week1Id = DB::table('featured_restaurant_weeks')->insertGetId([
            'restaurant_id' => $restA,
            'feature_start_date' => '2026-11-16',
            'feature_end_date' => '2026-11-22',
            'evaluation_start_at' => '2026-10-17 00:00:00',
            'evaluation_end_at' => '2026-11-15 23:59:59',
            'evaluation_review_count' => 15,
            'raw_average_rating' => 4.8000,
            'bayesian_score' => 4.4800,
            'platform_baseline_rating' => 4.0000,
            'min_review_threshold' => 10,
            'last_eligible_review_at' => '2026-11-15 20:15:00',
            'selection_method' => 'automatic',
            'selection_status' => 'active',
        ]);

        // Week 2 automatic selection (historical week 1 is preserved!)
        $week2Id = DB::table('featured_restaurant_weeks')->insertGetId([
            'restaurant_id' => $restB,
            'feature_start_date' => '2026-11-23',
            'feature_end_date' => '2026-11-29',
            'evaluation_start_at' => '2026-10-24 00:00:00',
            'evaluation_end_at' => '2026-11-22 23:59:59',
            'evaluation_review_count' => 12,
            'raw_average_rating' => 4.7500,
            'bayesian_score' => 4.4091,
            'platform_baseline_rating' => 4.0000,
            'min_review_threshold' => 10,
            'last_eligible_review_at' => '2026-11-22 19:00:00',
            'selection_method' => 'automatic',
            'selection_status' => 'active',
        ]);

        $this->assertDatabaseHas('featured_restaurant_weeks', ['featured_week_id' => $week1Id]);
        $this->assertDatabaseHas('featured_restaurant_weeks', ['featured_week_id' => $week2Id]);

        // Duplicate active selection for the same week is prevented
        try {
            DB::table('featured_restaurant_weeks')->insert([
                'restaurant_id' => $restA,
                'feature_start_date' => '2026-11-23',
                'feature_end_date' => '2026-11-29',
                'evaluation_start_at' => '2026-10-24 00:00:00',
                'evaluation_end_at' => '2026-11-22 23:59:59',
                'evaluation_review_count' => 14,
                'raw_average_rating' => 4.6000,
                'bayesian_score' => 4.3500,
                'platform_baseline_rating' => 4.0000,
                'min_review_threshold' => 10,
                'selection_method' => 'automatic',
                'selection_status' => 'active',
            ]);
            $this->fail('Expected unique constraint failure for duplicate active featured week.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('uk_featured_weeks_active_start', $e->getMessage());
        }

        // Automatic selection below minimum review threshold is rejected
        try {
            DB::table('featured_restaurant_weeks')->insert([
                'restaurant_id' => $restA,
                'feature_start_date' => '2026-11-30',
                'feature_end_date' => '2026-12-06',
                'evaluation_start_at' => '2026-10-31 00:00:00',
                'evaluation_end_at' => '2026-11-29 23:59:59',
                'evaluation_review_count' => 9,
                'raw_average_rating' => 5.0000,
                'bayesian_score' => 4.4737,
                'platform_baseline_rating' => 4.0000,
                'min_review_threshold' => 10,
                'selection_method' => 'automatic',
                'selection_status' => 'active',
            ]);
            $this->fail('Expected CHECK failure for automatic selection below min_review_threshold.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_featured_weeks_auto_qualifies', $e->getMessage());
        }

        // Admin override without selected_by or override_reason is rejected
        DB::table('featured_restaurant_weeks')
            ->where('featured_week_id', $week2Id)
            ->update(['selection_status' => 'superseded']);

        try {
            DB::table('featured_restaurant_weeks')->insert([
                'restaurant_id' => $restA,
                'feature_start_date' => '2026-11-23',
                'feature_end_date' => '2026-11-29',
                'evaluation_start_at' => '2026-10-24 00:00:00',
                'evaluation_end_at' => '2026-11-22 23:59:59',
                'evaluation_review_count' => 14,
                'raw_average_rating' => 4.7000,
                'bayesian_score' => 4.4083,
                'platform_baseline_rating' => 4.0000,
                'min_review_threshold' => 10,
                'selection_method' => 'admin_override',
                'selection_status' => 'active',
                'supersedes_featured_week_id' => $week2Id,
                'selected_by' => $adminId,
                'override_reason' => '   ',
            ]);
            $this->fail('Expected CHECK failure for admin_override with blank override_reason.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_featured_weeks_override', $e->getMessage());
        }

        // Valid admin override preserves superseded automatic record and links via supersedes_featured_week_id
        $overrideId = DB::table('featured_restaurant_weeks')->insertGetId([
            'restaurant_id' => $restA,
            'feature_start_date' => '2026-11-23',
            'feature_end_date' => '2026-11-29',
            'evaluation_start_at' => '2026-10-24 00:00:00',
            'evaluation_end_at' => '2026-11-22 23:59:59',
            'evaluation_review_count' => 14,
            'raw_average_rating' => 4.7000,
            'bayesian_score' => 4.4083,
            'platform_baseline_rating' => 4.0000,
            'min_review_threshold' => 10,
            'selection_method' => 'admin_override',
            'selection_status' => 'active',
            'supersedes_featured_week_id' => $week2Id,
            'selected_by' => $adminId,
            'override_reason' => 'Previous winner temporarily closed for kitchen renovation.',
        ]);

        $this->assertDatabaseHas('featured_restaurant_weeks', [
            'featured_week_id' => $week2Id,
            'selection_status' => 'superseded',
        ]);
        $this->assertDatabaseHas('featured_restaurant_weeks', [
            'featured_week_id' => $overrideId,
            'selection_method' => 'admin_override',
            'selection_status' => 'active',
            'supersedes_featured_week_id' => $week2Id,
            'selected_by' => $adminId,
        ]);
    }

    public function test_platform_settings_defaults_exist_and_can_be_updated(): void
    {
        $adminId = $this->createUser('admin');

        $expected = [
            'featured_restaurant.min_review_threshold' => '10',
            'featured_restaurant.evaluation_period_days' => '30',
            'featured_restaurant.feature_period_days' => '7',
            'featured_restaurant.week_start_day' => 'monday',
            'featured_restaurant.fallback_baseline_rating' => '4.0000',
            'featured_restaurant.min_platform_reviews_for_baseline' => '10',
            'featured_restaurant.auto_selection_enabled' => '1',
            'reviews.flagged_counts_toward_rating' => '0',
        ];

        foreach ($expected as $key => $value) {
            $this->assertDatabaseHas('platform_settings', [
                'setting_key' => $key,
                'setting_value' => $value,
            ]);
        }

        DB::table('platform_settings')
            ->where('setting_key', 'featured_restaurant.min_review_threshold')
            ->update([
                'setting_value' => '15',
                'updated_by' => $adminId,
            ]);

        $this->assertDatabaseHas('platform_settings', [
            'setting_key' => 'featured_restaurant.min_review_threshold',
            'setting_value' => '15',
            'updated_by' => $adminId,
        ]);
    }
}
