<?php

namespace Tests\Feature;

use App\Features\Reviews\Services\FeaturedRestaurantService;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ReviewsAndFeaturedSystemTest extends TestCase
{
    use DatabaseTransactions;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function createLocation(): array
    {
        $suffix = (string) mt_rand(100000, 999999);
        $provinceId = (int) DB::table('provinces')->insertGetId(['province_name' => 'RF Province '.$suffix]);
        $cityId = (int) DB::table('cities')->insertGetId(['province_id' => $provinceId, 'city_name' => 'RF City '.$suffix]);
        $barangayId = (int) DB::table('barangays')->insertGetId(['city_id' => $cityId, 'barangay_name' => 'RF Brgy '.$suffix]);
        $addressId = (int) DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '42 Review Ave',
            'postal_code' => '1000',
        ]);

        return compact('provinceId', 'cityId', 'barangayId', 'addressId');
    }

    private function createUser(string $role = 'customer'): User
    {
        $suffix = str_replace('.', '', uniqid('rf_', true));

        return User::create([
            'username' => substr($suffix, 0, 45),
            'first_name' => 'Test',
            'last_name' => 'User',
            'email' => "{$suffix}@example.com",
            'password_hash' => Hash::make('Password123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createRestaurant(int $addressId, int $ownerUserId, string $name = 'Test Bistro', string $status = 'active'): int
    {
        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => $name,
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => uniqid('rest_', false).'@example.com',
            'address_id' => $addressId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'restaurant_status' => $status,
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $ownerUserId,
        ]);

        return $restaurantId;
    }

    private function createRider(int $userId, int $cityId, string $status = 'active'): int
    {
        return (int) DB::table('riders')->insertGetId([
            'user_id' => $userId,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Contact',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '09171234567',
            'base_city_id' => $cityId,
            'rider_status' => $status,
        ]);
    }

    private function createOrder(
        int $customerId,
        int $restaurantId,
        string $orderStatus = 'completed',
        string $orderType = 'delivery',
        ?int $riderId = null,
        string $deliveryStatus = 'delivered',
    ): array {
        $checkoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $customerId,
            'checkout_status' => 'paid',
            'total_amount' => 250.00,
        ]);

        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $restaurantId,
            'customer_id' => $customerId,
            'restaurant_name' => 'Test Bistro',
            'customer_name' => 'Test User',
            'order_reference' => 'SALO-ORD-'.strtoupper(substr(uniqid(), -8)),
            'order_type' => $orderType,
            'order_status' => $orderStatus,
            'subtotal_amount' => 201.00,
            'delivery_fee' => $orderType === 'delivery' ? 49.00 : 0.00,
            'total_amount' => 250.00,
            'completed_at' => $orderStatus === 'completed' ? now() : null,
        ]);

        $deliveryId = null;
        if ($orderType === 'delivery' && $riderId !== null) {
            $deliveryId = (int) DB::table('deliveries')->insertGetId([
                'order_id' => $orderId,
                'rider_id' => $riderId,
                'delivery_status' => $deliveryStatus,
                'delivered_at' => $deliveryStatus === 'delivered' ? now() : null,
            ]);
        }

        return compact('orderId', 'deliveryId');
    }

    public function test_customer_restaurant_and_rider_reviews_are_independent_and_enforced(): void
    {
        $loc = $this->createLocation();
        $customer = $this->createUser();
        $otherCustomer = $this->createUser();
        $owner = $this->createUser();
        $riderUser = $this->createUser();

        $restaurantId = $this->createRestaurant($loc['addressId'], $owner->user_id, 'Dalisay Kitchen');
        $riderId = $this->createRider($riderUser->user_id, $loc['cityId']);

        $completedOrder = $this->createOrder($customer->user_id, $restaurantId, 'completed', 'delivery', $riderId, 'delivered');
        $pendingOrder = $this->createOrder($customer->user_id, $restaurantId, 'pending', 'delivery', $riderId, 'pending_assignment');
        $pickupOrder = $this->createOrder($customer->user_id, $restaurantId, 'completed', 'pickup');

        // Unauthenticated rejected
        $this->postJson("/api/customer/orders/{$completedOrder['orderId']}/reviews/restaurant", ['rating' => 5])
            ->assertStatus(401);

        // Non-owner rejected
        $this->actingAs($otherCustomer)
            ->postJson("/api/customer/orders/{$completedOrder['orderId']}/reviews/restaurant", ['rating' => 5])
            ->assertStatus(404);

        // Ineligible status rejected
        $this->actingAs($customer)
            ->postJson("/api/customer/orders/{$pendingOrder['orderId']}/reviews/restaurant", ['rating' => 5])
            ->assertStatus(422);

        // Invalid rating rejected
        $this->actingAs($customer)
            ->postJson("/api/customer/orders/{$completedOrder['orderId']}/reviews/restaurant", ['rating' => 6])
            ->assertStatus(422);

        // Valid restaurant review submission (without rider review)
        $this->actingAs($customer)
            ->postJson("/api/customer/orders/{$completedOrder['orderId']}/reviews/restaurant", [
                'rating' => 5,
                'comment' => 'Outstanding Sinigang!',
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.review.rating', 5)
            ->assertJsonPath('data.rating_summary.average_rating', 5)
            ->assertJsonPath('data.rating_summary.total_count', 1);

        // Duplicate restaurant review prevented
        $this->actingAs($customer)
            ->postJson("/api/customer/orders/{$completedOrder['orderId']}/reviews/restaurant", ['rating' => 4])
            ->assertStatus(409);

        // Eligibility shows restaurant reviewed, rider still eligible
        $this->actingAs($customer)
            ->getJson("/api/customer/orders/{$completedOrder['orderId']}/reviews")
            ->assertOk()
            ->assertJsonPath('data.can_review_restaurant', false)
            ->assertJsonPath('data.can_review_rider', true);

        // Pickup order cannot submit rider review
        $this->actingAs($customer)
            ->postJson("/api/customer/orders/{$pickupOrder['orderId']}/reviews/rider", ['rating' => 5])
            ->assertStatus(422);

        // Valid rider review submission
        $this->actingAs($customer)
            ->postJson("/api/customer/orders/{$completedOrder['orderId']}/reviews/rider", [
                'rating' => 1,
                'comment' => null,
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.review.rating', 1)
            ->assertJsonPath('data.rating_summary.average_rating', 1)
            ->assertJsonPath('data.rating_summary.total_count', 1);

        // Duplicate rider review prevented
        $this->actingAs($customer)
            ->postJson("/api/customer/orders/{$completedOrder['orderId']}/reviews/rider", ['rating' => 5])
            ->assertStatus(409);
    }

    public function test_owner_staff_flagging_rider_privacy_and_admin_moderation_workflow(): void
    {
        $loc = $this->createLocation();
        $customer = $this->createUser();
        $owner = $this->createUser();
        $otherOwner = $this->createUser();
        $staff = $this->createUser();
        $riderUser = $this->createUser();
        $otherRiderUser = $this->createUser();
        $admin = $this->createUser('admin');

        $restaurantId = $this->createRestaurant($loc['addressId'], $owner->user_id, 'Owner Kitchen');
        $this->createRestaurant($loc['addressId'], $otherOwner->user_id, 'Other Kitchen');
        $riderId = $this->createRider($riderUser->user_id, $loc['cityId']);
        $this->createRider($otherRiderUser->user_id, $loc['cityId']);

        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $staff->user_id,
            'invited_by' => $owner->user_id,
            'staff_position' => 'Order Handler',
            'staff_status' => 'active',
        ]);

        $order = $this->createOrder($customer->user_id, $restaurantId, 'completed', 'delivery', $riderId, 'delivered');

        $restResp = $this->actingAs($customer)
            ->postJson("/api/customer/orders/{$order['orderId']}/reviews/restaurant", [
                'rating' => 2,
                'comment' => 'Suspicious spam review',
            ])
            ->assertStatus(201);
        $reviewId = $restResp->json('data.review.review_id');

        $this->actingAs($customer)
            ->postJson("/api/customer/orders/{$order['orderId']}/reviews/rider", [
                'rating' => 4,
                'comment' => 'Polite rider',
            ])
            ->assertStatus(201);

        // Rider sees only their own reviews
        $this->actingAs($riderUser)
            ->getJson('/api/rider/reviews')
            ->assertOk()
            ->assertJsonPath('data.rider_id', $riderId)
            ->assertJsonPath('data.rating_summary.total_count', 1);

        $this->actingAs($otherRiderUser)
            ->getJson('/api/rider/reviews')
            ->assertOk()
            ->assertJsonPath('data.rating_summary.total_count', 0);

        // Other owner cannot access or flag this restaurant's review
        $this->actingAs($otherOwner)
            ->getJson("/api/restaurant/reviews?restaurant_id={$restaurantId}")
            ->assertStatus(403);

        $this->actingAs($otherOwner)
            ->postJson("/api/restaurant/reviews/{$reviewId}/flag", ['reason' => 'Spam'])
            ->assertStatus(403);

        // Authorized staff can view and flag review with reason
        $this->actingAs($staff)
            ->getJson('/api/restaurant/reviews')
            ->assertOk()
            ->assertJsonPath('data.rating_summary.total_count', 1);

        $this->actingAs($staff)
            ->postJson("/api/restaurant/reviews/{$reviewId}/flag", ['reason' => 'Promotional spam link'])
            ->assertOk()
            ->assertJsonPath('data.review.moderation_status', 'flagged')
            ->assertJsonPath('data.review.counts_toward_rating', false)
            ->assertJsonPath('data.rating_summary.total_count', 0);

        // Double flagging prevented
        $this->actingAs($owner)
            ->postJson("/api/restaurant/reviews/{$reviewId}/flag", ['reason' => 'Duplicate flag'])
            ->assertStatus(409);

        // Non-admin cannot moderate
        $this->actingAs($owner)
            ->postJson("/api/admin/reviews/restaurant/{$reviewId}/moderate", [
                'action' => 'hide',
                'reason' => 'Not allowed',
            ])
            ->assertStatus(403);

        // Admin hide requires reason
        $this->actingAs($admin)
            ->postJson("/api/admin/reviews/restaurant/{$reviewId}/moderate", [
                'action' => 'hide',
                'reason' => '',
            ])
            ->assertStatus(422);

        // Admin hides review -> preserved in DB, excluded from public ratings
        $this->actingAs($admin)
            ->postJson("/api/admin/reviews/restaurant/{$reviewId}/moderate", [
                'action' => 'hide',
                'reason' => 'Confirmed spam content.',
            ])
            ->assertOk()
            ->assertJsonPath('data.review.moderation_status', 'hidden')
            ->assertJsonPath('data.review.is_visible', false);

        $this->getJson("/api/restaurants/{$restaurantId}/reviews")
            ->assertOk()
            ->assertJsonPath('data.rating_summary.total_count', 0)
            ->assertJsonCount(0, 'data.reviews');

        // Admin restores review -> visible and eligible again
        $this->actingAs($admin)
            ->postJson("/api/admin/reviews/restaurant/{$reviewId}/moderate", [
                'action' => 'restore',
                'reason' => 'False positive after review.',
            ])
            ->assertOk()
            ->assertJsonPath('data.review.moderation_status', 'published')
            ->assertJsonPath('data.review.counts_toward_rating', true);

        $this->getJson("/api/restaurants/{$restaurantId}/reviews")
            ->assertOk()
            ->assertJsonPath('data.rating_summary.total_count', 1);
    }

    public function test_featured_restaurant_bayesian_selection_override_and_settings(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 11, 18, 10, 0, 0, 'Asia/Manila'));

        $loc = $this->createLocation();
        $owner = $this->createUser();
        $admin = $this->createUser('admin');
        $customer = $this->createUser();

        $restA = $this->createRestaurant($loc['addressId'], $owner->user_id, 'Winner Kitchen');
        $restB = $this->createRestaurant($loc['addressId'], $owner->user_id, 'Runner Up Kitchen');
        $restInactive = $this->createRestaurant($loc['addressId'], $owner->user_id, 'Inactive Kitchen', 'inactive');

        // Lower threshold to 3 for deterministic test fixture, fallback C = 4.0
        $settingsResp = $this->actingAs($admin)
            ->putJson('/api/admin/reviews/settings', [
                'featured_restaurant.min_review_threshold' => 3,
                'featured_restaurant.min_platform_reviews_for_baseline' => 100,
                'featured_restaurant.fallback_baseline_rating' => 4.0,
            ])
            ->assertOk();
        $this->assertSame(3, $settingsResp->json('data.settings')['featured_restaurant.min_review_threshold']);

        // Seed 3 reviews for restA (avg 5.0) and 3 reviews for restB (avg 4.0) inside the 30-day window before Monday 2026-11-16
        $evalTime = Carbon::create(2026, 11, 14, 15, 0, 0, 'Asia/Manila');
        foreach ([$restA => [5, 5, 5], $restB => [4, 4, 4], $restInactive => [5, 5, 5]] as $rId => $ratings) {
            foreach ($ratings as $rating) {
                $ord = $this->createOrder($customer->user_id, $rId, 'completed', 'pickup');
                DB::table('reviews')->insert([
                    'customer_id' => $customer->user_id,
                    'restaurant_id' => $rId,
                    'order_id' => $ord['orderId'],
                    'rating' => $rating,
                    'is_visible' => 1,
                    'moderation_status' => 'published',
                    'counts_toward_rating' => 1,
                    'created_at' => $evalTime,
                    'updated_at' => $evalTime,
                ]);
            }
        }

        /** @var FeaturedRestaurantService $featuredService */
        $featuredService = app(FeaturedRestaurantService::class);
        $result = $featuredService->runAutomaticSelection();

        $this->assertSame('selected', $result['status']);
        $this->assertSame($restA, $result['featured_week']['restaurant_id']);
        // Score = (3 / (3 + 3)) * 5.0 + (3 / (3 + 3)) * 4.0 = 4.5000
        $this->assertEqualsWithDelta(4.5, $result['featured_week']['bayesian_score'], 0.0001);

        // Idempotent re-run does not duplicate or overwrite
        $secondRun = $featuredService->runAutomaticSelection();
        $this->assertSame('already_selected', $secondRun['status']);
        $this->assertSame(1, DB::table('featured_restaurant_weeks')->where('feature_start_date', '2026-11-16')->where('selection_status', 'active')->count());

        // Public endpoint returns active featured restaurant
        $this->getJson('/api/featured-restaurant')
            ->assertOk()
            ->assertJsonPath('data.featured_restaurant.restaurant_id', $restA);

        // Admin override supersedes automatic selection and preserves history
        $this->actingAs($admin)
            ->postJson('/api/admin/featured-restaurants/override', [
                'restaurant_id' => $restB,
                'reason' => 'Spotlight local newcomer this week.',
            ])
            ->assertOk()
            ->assertJsonPath('data.featured_week.restaurant_id', $restB)
            ->assertJsonPath('data.featured_week.selection_method', 'admin_override');

        $this->assertSame(
            2,
            DB::table('featured_restaurant_weeks')->where('feature_start_date', '2026-11-16')->count(),
        );
        $this->assertSame(
            1,
            DB::table('featured_restaurant_weeks')->where('feature_start_date', '2026-11-16')->where('selection_status', 'superseded')->count(),
        );
    }

    public function test_public_restaurant_reviews_rejects_nonexistent_and_inactive_restaurants(): void
    {
        $loc = $this->createLocation();
        $owner = $this->createUser();
        $customer = $this->createUser();

        $activeId = $this->createRestaurant($loc['addressId'], $owner->user_id, 'Active Review Bistro', 'active');
        $inactiveId = $this->createRestaurant($loc['addressId'], $owner->user_id, 'Inactive Review Bistro', 'inactive');
        $pendingId = $this->createRestaurant($loc['addressId'], $owner->user_id, 'Pending Review Bistro', 'pending');

        $ord = $this->createOrder($customer->user_id, $activeId, 'completed', 'pickup');
        $this->actingAs($customer)
            ->postJson("/api/customer/orders/{$ord['orderId']}/reviews/restaurant", [
                'rating' => 5,
                'comment' => 'Great!',
            ])
            ->assertStatus(201);

        // Active restaurant returns 200 with privacy-safe review
        $this->getJson("/api/restaurants/{$activeId}/reviews")
            ->assertOk()
            ->assertJsonPath('data.rating_summary.total_count', 1)
            ->assertJsonPath('data.reviews.0.customer_name', 'Test U.');

        // Non-existent, inactive, and pending restaurants return 404
        $this->getJson('/api/restaurants/999999999/reviews')->assertStatus(404);
        $this->getJson("/api/restaurants/{$inactiveId}/reviews")->assertStatus(404);
        $this->getJson("/api/restaurants/{$pendingId}/reviews")->assertStatus(404);
    }

    public function test_featured_evaluation_boundaries_are_timezone_safe_under_utc_mysql_session(): void
    {
        // Reference date: Wednesday Nov 18, 2026 (Asia/Manila).
        // Feature week: Mon 2026-11-16 .. Sun 2026-11-22.
        // Evaluation window (30 days prior): 2026-10-17 00:00:00 .. 2026-11-15 23:59:59 Asia/Manila
        // In UTC, that is: 2026-10-16 16:00:00 .. 2026-11-15 15:59:59 UTC.
        Carbon::setTestNow(Carbon::create(2026, 11, 18, 10, 0, 0, 'Asia/Manila'));

        $loc = $this->createLocation();
        $owner = $this->createUser();
        $customer = $this->createUser();
        $restId = $this->createRestaurant($loc['addressId'], $owner->user_id, 'Timezone Boundary Bistro', 'active');

        $oBefore = $this->createOrder($customer->user_id, $restId, 'completed', 'pickup');
        $oInsideStart = $this->createOrder($customer->user_id, $restId, 'completed', 'pickup');
        $oInsideEnd = $this->createOrder($customer->user_id, $restId, 'completed', 'pickup');
        $oAfter = $this->createOrder($customer->user_id, $restId, 'completed', 'pickup');

        try {
            // Switch MySQL session to UTC (+00:00) to verify session-timezone independence
            DB::statement("SET time_zone = '+00:00'");

            // 1. Before window: 2026-10-16 23:59:59 Asia/Manila = 2026-10-16 15:59:59 UTC (EXCLUDED)
            DB::table('reviews')->insert([
                'customer_id' => $customer->user_id,
                'restaurant_id' => $restId,
                'order_id' => $oBefore['orderId'],
                'rating' => 1,
                'is_visible' => 1,
                'moderation_status' => 'published',
                'counts_toward_rating' => 1,
                'created_at' => '2026-10-16 15:59:59',
                'updated_at' => '2026-10-16 15:59:59',
            ]);

            // 2. Inside start boundary: 2026-10-17 00:00:00 Asia/Manila = 2026-10-16 16:00:00 UTC (INCLUDED)
            DB::table('reviews')->insert([
                'customer_id' => $customer->user_id,
                'restaurant_id' => $restId,
                'order_id' => $oInsideStart['orderId'],
                'rating' => 5,
                'is_visible' => 1,
                'moderation_status' => 'published',
                'counts_toward_rating' => 1,
                'created_at' => '2026-10-16 16:00:00',
                'updated_at' => '2026-10-16 16:00:00',
            ]);

            // 3. Inside end boundary: 2026-11-15 23:59:59 Asia/Manila = 2026-11-15 15:59:59 UTC (INCLUDED)
            DB::table('reviews')->insert([
                'customer_id' => $customer->user_id,
                'restaurant_id' => $restId,
                'order_id' => $oInsideEnd['orderId'],
                'rating' => 4,
                'is_visible' => 1,
                'moderation_status' => 'published',
                'counts_toward_rating' => 1,
                'created_at' => '2026-11-15 15:59:59',
                'updated_at' => '2026-11-15 15:59:59',
            ]);

            // 4. After window: 2026-11-16 00:00:00 Asia/Manila = 2026-11-15 16:00:00 UTC (EXCLUDED)
            DB::table('reviews')->insert([
                'customer_id' => $customer->user_id,
                'restaurant_id' => $restId,
                'order_id' => $oAfter['orderId'],
                'rating' => 2,
                'is_visible' => 1,
                'moderation_status' => 'published',
                'counts_toward_rating' => 1,
                'created_at' => '2026-11-15 16:00:00',
                'updated_at' => '2026-11-15 16:00:00',
            ]);

            /** @var FeaturedRestaurantService $featuredService */
            $featuredService = app(FeaturedRestaurantService::class);
            $computed = $featuredService->computeCandidates();

            $candidate = collect($computed['candidates'])->firstWhere('restaurant_id', $restId);
            $this->assertNotNull($candidate);
            $this->assertSame(2, $candidate['evaluation_review_count']);
            $this->assertEqualsWithDelta(4.5, $candidate['raw_average_rating'], 0.0001);
        } finally {
            DB::statement("SET time_zone = 'SYSTEM'");
        }
    }
}
