<?php

namespace Tests\Feature;

use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PublicRestaurantsTest extends TestCase
{
    use DatabaseTransactions;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_only_active_restaurants_appear_in_list_and_non_active_return_404(): void
    {
        [, , , $addressId] = $this->createLocationFixture();

        $activeId = $this->createRestaurant($addressId, 'Active Kitchen', 'active');
        $pendingId = $this->createRestaurant($addressId, 'Pending Kitchen', 'pending');
        $approvedId = $this->createRestaurant($addressId, 'Approved Only Kitchen', 'approved');
        $rejectedId = $this->createRestaurant($addressId, 'Rejected Kitchen', 'rejected');
        $inactiveId = $this->createRestaurant($addressId, 'Inactive Kitchen', 'inactive');
        $suspendedId = $this->createRestaurant($addressId, 'Suspended Kitchen', 'suspended');

        $listResponse = $this->getJson('/api/restaurants');
        $listResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.restaurants')
            ->assertJsonPath('data.restaurants.0.id', $activeId)
            ->assertJsonPath('data.restaurants.0.name', 'Active Kitchen');

        $this->getJson("/api/restaurants/{$activeId}")->assertStatus(200);
        $this->getJson("/api/restaurants/{$activeId}/menu")->assertStatus(200);

        foreach ([$pendingId, $approvedId, $rejectedId, $inactiveId, $suspendedId] as $hiddenId) {
            $this->getJson("/api/restaurants/{$hiddenId}")->assertStatus(404);
            $this->getJson("/api/restaurants/{$hiddenId}/menu")->assertStatus(404);
        }
    }

    public function test_hidden_menu_items_excluded_and_sold_out_and_addons_included(): void
    {
        [, , , $addressId] = $this->createLocationFixture();
        $restaurantId = $this->createRestaurant($addressId, 'Menu Test Bistro', 'active');

        $catMains = DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $restaurantId,
            'category_name' => 'Mains',
            'sort_order' => 1,
            'is_active' => 1,
        ]);

        $catHidden = DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $restaurantId,
            'category_name' => 'Archived',
            'sort_order' => 2,
            'is_active' => 0,
        ]);

        $availItemId = DB::table('menu_items')->insertGetId([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catMains,
            'item_name' => 'Chicken Inasal',
            'description' => 'Chargrilled chicken.',
            'base_price' => 195.00,
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'sort_order' => 1,
        ]);

        DB::table('menu_items')->insert([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catMains,
            'item_name' => 'Crispy Pata',
            'description' => 'Crispy pork leg.',
            'base_price' => 650.00,
            'availability_status' => 'sold_out',
            'approval_status' => 'approved',
            'sort_order' => 2,
        ]);

        DB::table('menu_items')->insert([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catMains,
            'item_name' => 'Seasonal Halo-Halo',
            'description' => 'Temporarily out of ingredients.',
            'base_price' => 145.00,
            'availability_status' => 'temporarily_unavailable',
            'approval_status' => 'approved',
            'sort_order' => 3,
        ]);

        DB::table('menu_items')->insert([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catMains,
            'item_name' => 'Secret Draft Dish',
            'base_price' => 99.00,
            'availability_status' => 'hidden',
            'approval_status' => 'pending',
            'sort_order' => 4,
        ]);

        DB::table('menu_items')->insert([
            [
                'restaurant_id' => $restaurantId,
                'menu_category_id' => $catMains,
                'item_name' => 'Pending Approval Dish',
                'base_price' => 150.00,
                'availability_status' => 'available',
                'approval_status' => 'pending',
                'sort_order' => 5,
            ],
            [
                'restaurant_id' => $restaurantId,
                'menu_category_id' => $catMains,
                'item_name' => 'Rejected Approval Dish',
                'base_price' => 160.00,
                'availability_status' => 'available',
                'approval_status' => 'rejected',
                'sort_order' => 6,
            ],
            [
                'restaurant_id' => $restaurantId,
                'menu_category_id' => $catMains,
                'item_name' => 'Approved Hidden Dish',
                'base_price' => 170.00,
                'availability_status' => 'hidden',
                'approval_status' => 'approved',
                'sort_order' => 7,
            ],
        ]);

        DB::table('menu_items')->insert([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catHidden,
            'item_name' => 'Inactive Category Dish',
            'base_price' => 120.00,
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'sort_order' => 1,
        ]);

        $groupId = DB::table('add_on_groups')->insertGetId([
            'menu_item_id' => $availItemId,
            'group_name' => 'Choice of Rice',
            'is_required' => 1,
            'minimum_selections' => 1,
            'maximum_selections' => 1,
            'sort_order' => 1,
        ]);

        DB::table('add_on_options')->insert([
            [
                'add_on_group_id' => $groupId,
                'option_name' => 'Garlic Rice',
                'additional_price' => 0.00,
                'is_available' => 1,
                'sort_order' => 1,
            ],
            [
                'add_on_group_id' => $groupId,
                'option_name' => 'Java Rice',
                'additional_price' => 25.00,
                'is_available' => 1,
                'sort_order' => 2,
            ],
        ]);

        $response = $this->getJson("/api/restaurants/{$restaurantId}/menu");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.categories')
            ->assertJsonCount(3, 'data.categories.0.items')
            ->assertJsonPath('data.categories.0.items.0.name', 'Chicken Inasal')
            ->assertJsonPath('data.categories.0.items.0.availability', 'Available')
            ->assertJsonPath('data.categories.0.items.0.add_on_groups.0.name', 'Choice of Rice')
            ->assertJsonPath('data.categories.0.items.0.add_on_groups.0.is_required', true)
            ->assertJsonCount(2, 'data.categories.0.items.0.add_on_groups.0.options')
            ->assertJsonPath('data.categories.0.items.1.name', 'Crispy Pata')
            ->assertJsonPath('data.categories.0.items.1.availability', 'Sold Out')
            ->assertJsonPath('data.categories.0.items.2.name', 'Seasonal Halo-Halo')
            ->assertJsonPath('data.categories.0.items.2.availability', 'Temporarily Unavailable');

        $content = $response->getContent();
        $this->assertStringNotContainsString('Secret Draft Dish', (string) $content);
        $this->assertStringNotContainsString('Pending Approval Dish', (string) $content);
        $this->assertStringNotContainsString('Rejected Approval Dish', (string) $content);
        $this->assertStringNotContainsString('Approved Hidden Dish', (string) $content);
        $this->assertStringNotContainsString('Inactive Category Dish', (string) $content);
    }

    public function test_pagination_search_category_filter_and_like_wildcard_escaping(): void
    {
        [, , , $addressId] = $this->createLocationFixture();

        $catFilipino = DB::table('restaurant_categories')->insertGetId([
            'category_name' => 'Filipino',
            'is_active' => 1,
        ]);
        $catCafe = DB::table('restaurant_categories')->insertGetId([
            'category_name' => 'Cafe',
            'is_active' => 1,
        ]);
        DB::table('restaurant_categories')->insert([
            'category_name' => 'Inactive Category',
            'is_active' => 0,
        ]);

        $r1 = $this->createRestaurant($addressId, '100% Pinoy Grill', 'active', ['offers_delivery' => 1, 'offers_pickup' => 1]);
        $r2 = $this->createRestaurant($addressId, 'Normal_Kitchen', 'active', ['offers_delivery' => 0, 'offers_pickup' => 1]);
        $r3 = $this->createRestaurant($addressId, 'Kape Barako', 'active', ['offers_delivery' => 1, 'offers_pickup' => 0]);

        DB::table('restaurant_category_map')->insert([
            ['restaurant_id' => $r1, 'category_id' => $catFilipino],
            ['restaurant_id' => $r2, 'category_id' => $catFilipino],
            ['restaurant_id' => $r3, 'category_id' => $catCafe],
        ]);

        $this->getJson('/api/restaurant-categories')
            ->assertStatus(200)
            ->assertJsonCount(2, 'data.categories');

        // Cap per_page at 50 and test per_page=2
        $this->getJson('/api/restaurants?per_page=100')
            ->assertStatus(200)
            ->assertJsonPath('data.pagination.per_page', 50);

        $this->getJson('/api/restaurants?per_page=2&page=1')
            ->assertStatus(200)
            ->assertJsonCount(2, 'data.restaurants')
            ->assertJsonPath('data.pagination.total', 3)
            ->assertJsonPath('data.pagination.last_page', 2);

        // Escaped '%' search only matches '100% Pinoy Grill', not all restaurants
        $this->getJson('/api/restaurants?search='.urlencode('100%'))
            ->assertStatus(200)
            ->assertJsonCount(1, 'data.restaurants')
            ->assertJsonPath('data.restaurants.0.id', $r1);

        // Escaped '_' search only matches 'Normal_Kitchen'
        $this->getJson('/api/restaurants?search='.urlencode('Normal_'))
            ->assertStatus(200)
            ->assertJsonCount(1, 'data.restaurants')
            ->assertJsonPath('data.restaurants.0.id', $r2);

        // Category + delivery filter
        $this->getJson('/api/restaurants?category=Filipino&offers_delivery=true')
            ->assertStatus(200)
            ->assertJsonCount(1, 'data.restaurants')
            ->assertJsonPath('data.restaurants.0.id', $r1);
    }

    public function test_availability_handles_open_closed_multiple_periods_overnight_and_toggles(): void
    {
        [, , , $addressId] = $this->createLocationFixture();

        $restaurantId = $this->createRestaurant($addressId, 'Night Owl Grill', 'active', [
            'accepts_reservations' => 1,
            'accepting_orders' => 0,
            'accepting_reservations' => 0,
        ]);

        // Monday (day 1): 10:00-14:00 and 18:00-02:00 next day
        DB::table('operating_hours')->insert([
            [
                'restaurant_id' => $restaurantId,
                'day_of_week' => 1,
                'opening_time' => '10:00:00',
                'closing_time' => '14:00:00',
                'closes_next_day' => 0,
                'is_closed' => 0,
            ],
            [
                'restaurant_id' => $restaurantId,
                'day_of_week' => 1,
                'opening_time' => '18:00:00',
                'closing_time' => '02:00:00',
                'closes_next_day' => 1,
                'is_closed' => 0,
            ],
        ]);

        // Monday 11:30 Manila -> Open (first period), but paused toggles reported
        Carbon::setTestNow(Carbon::create(2026, 11, 16, 11, 30, 0, 'Asia/Manila'));
        $this->getJson("/api/restaurants/{$restaurantId}")
            ->assertStatus(200)
            ->assertJsonPath('data.restaurant.availability.is_open', true)
            ->assertJsonPath('data.restaurant.availability.status_label', 'Open')
            ->assertJsonPath('data.restaurant.availability.not_accepting_orders', true)
            ->assertJsonPath('data.restaurant.availability.not_accepting_reservations', true);

        // Monday 15:30 Manila -> Closed (between split periods)
        Carbon::setTestNow(Carbon::create(2026, 11, 16, 15, 30, 0, 'Asia/Manila'));
        $this->getJson("/api/restaurants/{$restaurantId}")
            ->assertStatus(200)
            ->assertJsonPath('data.restaurant.availability.is_open', false)
            ->assertJsonPath('data.restaurant.availability.status_label', 'Closed');

        // Tuesday 01:15 Manila -> Open (Monday's overnight spillover)
        Carbon::setTestNow(Carbon::create(2026, 11, 17, 1, 15, 0, 'Asia/Manila'));
        $this->getJson("/api/restaurants/{$restaurantId}")
            ->assertStatus(200)
            ->assertJsonPath('data.restaurant.availability.is_open', true);

        // Tuesday 02:30 Manila -> Closed
        Carbon::setTestNow(Carbon::create(2026, 11, 17, 2, 30, 0, 'Asia/Manila'));
        $this->getJson("/api/restaurants/{$restaurantId}")
            ->assertStatus(200)
            ->assertJsonPath('data.restaurant.availability.is_open', false);

        // Closure date overrides regular operating hours
        DB::table('restaurant_closures')->insert([
            'restaurant_id' => $restaurantId,
            'closure_date' => '2026-11-16',
            'reason' => 'Kitchen maintenance',
        ]);

        Carbon::setTestNow(Carbon::create(2026, 11, 16, 11, 30, 0, 'Asia/Manila'));
        $this->getJson("/api/restaurants/{$restaurantId}")
            ->assertStatus(200)
            ->assertJsonPath('data.restaurant.availability.is_open', false)
            ->assertJsonPath('data.restaurant.availability.temporarily_unavailable', true)
            ->assertJsonPath('data.restaurant.availability.closure_reason', 'Kitchen maintenance');
    }

    public function test_no_private_fields_and_rating_omitted_without_reviews_then_shown_with_reviews(): void
    {
        [, , , $addressId] = $this->createLocationFixture();
        $restaurantId = $this->createRestaurant($addressId, 'Private Check Kitchen', 'active');

        $noReviewsList = $this->getJson('/api/restaurants');
        $noReviewsList->assertStatus(200)
            ->assertJsonMissingPath('data.restaurants.0.average_rating')
            ->assertJsonMissingPath('data.restaurants.0.review_count');

        $noReviewsDetail = $this->getJson("/api/restaurants/{$restaurantId}");
        $noReviewsDetail->assertStatus(200)
            ->assertJsonMissingPath('data.restaurant.rating_summary')
            ->assertJsonMissingPath('data.restaurant.business_email')
            ->assertJsonMissingPath('data.restaurant.registered_name')
            ->assertJsonMissingPath('data.restaurant.ownership_structure')
            ->assertJsonMissingPath('data.restaurant.restaurant_status');

        $this->assertStringNotContainsString('secret-owner@example.com', (string) $noReviewsDetail->getContent());

        // Add visible review
        $customerId = DB::table('users')->insertGetId([
            'username' => 'reviewer_cust',
            'first_name' => 'Lina',
            'last_name' => 'Cruz',
            'email' => 'lina@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'customer',
            'account_status' => 'active',
        ]);

        DB::table('reviews')->insert([
            'customer_id' => $customerId,
            'restaurant_id' => $restaurantId,
            'rating' => 5,
            'comment' => 'Great food!',
            'is_visible' => 1,
        ]);

        $this->getJson('/api/restaurants')
            ->assertStatus(200)
            ->assertJsonPath('data.restaurants.0.average_rating', 5)
            ->assertJsonPath('data.restaurants.0.review_count', 1);

        $this->getJson("/api/restaurants/{$restaurantId}")
            ->assertStatus(200)
            ->assertJsonPath('data.restaurant.rating_summary.average_rating', 5)
            ->assertJsonPath('data.restaurant.rating_summary.review_count', 1);
    }

    public function test_public_endpoints_are_rate_limited(): void
    {
        for ($i = 0; $i < 60; $i++) {
            $this->getJson('/api/restaurant-categories')->assertStatus(200);
        }

        $this->getJson('/api/restaurant-categories')
            ->assertStatus(429)
            ->assertJsonPath('success', false);
    }

    public function test_restaurant_details_formats_public_image_urls_and_handles_missing_images(): void
    {
        [, , , $addressId] = $this->createLocationFixture();

        $withImagesId = $this->createRestaurant($addressId, 'Image Kitchen', 'active', [
            'logo_image' => 'restaurants/10/logo.png',
            'cover_image' => 'restaurants/10/cover.jpg',
        ]);

        $missingImagesId = $this->createRestaurant($addressId, 'No Image Kitchen', 'active', [
            'logo_image' => null,
            'cover_image' => '   ',
        ]);

        $appUrl = rtrim((string) config('app.url', 'http://localhost:8000'), '/');

        $this->getJson("/api/restaurants/{$withImagesId}")
            ->assertStatus(200)
            ->assertJsonPath('data.restaurant.logo_path', "{$appUrl}/storage/restaurants/10/logo.png")
            ->assertJsonPath('data.restaurant.cover_path', "{$appUrl}/storage/restaurants/10/cover.jpg");

        $this->getJson("/api/restaurants/{$missingImagesId}")
            ->assertStatus(200)
            ->assertJsonPath('data.restaurant.logo_path', null)
            ->assertJsonPath('data.restaurant.cover_path', null);
    }

    private function createRestaurant(int $addressId, string $name, string $status, array $overrides = []): int
    {
        return DB::table('restaurants')->insertGetId(array_merge([
            'restaurant_name' => $name,
            'registered_name' => $name.' Legal Corp',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'description' => 'Authentic local dishes.',
            'contact_phone' => '09170001111',
            'business_email' => 'secret-owner@example.com',
            'address_id' => $addressId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepts_reservations' => 1,
            'accepting_orders' => 1,
            'accepting_reservations' => 1,
            'restaurant_status' => $status,
        ], $overrides));
    }

    /**
     * @return array{0:int,1:int,2:int,3:int}
     */
    private function createLocationFixture(): array
    {
        $provinceId = DB::table('provinces')->insertGetId([
            'province_name' => 'Metro Manila Public Test',
        ]);

        $cityId = DB::table('cities')->insertGetId([
            'province_id' => $provinceId,
            'city_name' => 'Quezon City Public Test',
        ]);

        $barangayId = DB::table('barangays')->insertGetId([
            'city_id' => $cityId,
            'barangay_name' => 'Tomas Morato Test',
        ]);

        $addressId = DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '42 Scout Gandia St.',
            'postal_code' => '1103',
        ]);

        return [$provinceId, $cityId, $barangayId, $addressId];
    }
}
