<?php

namespace App\Features\Restaurants\Services;

use App\Models\User;
use App\Support\FileStorageService;
use App\Support\RestaurantBranchService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class CustomerFavoriteService
{
    public function __construct(
        private readonly FileStorageService $fileStorageService,
    ) {}

    private function assertCustomerAccount(User $user): void
    {
        if ((string) $user->user_role !== 'customer') {
            abort(403, 'Forbidden: only customer accounts can manage favorites.');
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function listFavorites(User $user): array
    {
        $this->assertCustomerAccount($user);
        $rows = DB::table('customer_favorites as cf')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'cf.restaurant_id')
            ->leftJoin('addresses as a', 'a.address_id', '=', 'r.address_id')
            ->leftJoin('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->leftJoin('cities as c', 'c.city_id', '=', 'b.city_id')
            ->leftJoin('provinces as p', 'p.province_id', '=', 'c.province_id')
            ->where('cf.user_id', $user->user_id)
            ->select([
                'cf.favorite_id',
                'cf.created_at as favorited_at',
                'r.restaurant_id',
                'r.restaurant_name',
                'r.branch_name',
                'r.business_type',
                'r.description',
                'r.logo_image',
                'r.cover_image',
                'r.restaurant_status',
                'r.is_published',
                'r.offers_delivery',
                'r.offers_pickup',
                'r.offers_dine_in',
                'r.accepting_orders',
                'r.accepts_reservations',
                'r.accepting_reservations',
                'b.barangay_name',
                'c.city_name',
                'p.province_name',
            ])
            ->orderByDesc('cf.created_at')
            ->orderByDesc('cf.favorite_id')
            ->get();

        $restaurantIds = $rows->pluck('restaurant_id')->map(fn ($id) => (int) $id)->all();
        $ratingsByRestaurant = $restaurantIds === []
            ? collect()
            : DB::table('reviews')
                ->whereIn('restaurant_id', $restaurantIds)
                ->where('moderation_status', 'visible')
                ->selectRaw('restaurant_id, AVG(rating) as avg_rating, COUNT(*) as review_count')
                ->groupBy('restaurant_id')
                ->get()
                ->keyBy('restaurant_id');

        $categoriesByRestaurant = $restaurantIds === []
            ? collect()
            : DB::table('restaurant_category_map as rcm')
                ->join('restaurant_categories as rc', 'rc.category_id', '=', 'rcm.category_id')
                ->whereIn('rcm.restaurant_id', $restaurantIds)
                ->select(['rcm.restaurant_id', 'rc.category_name'])
                ->get()
                ->groupBy('restaurant_id');

        $favorites = $rows->map(function (object $row) use ($ratingsByRestaurant, $categoriesByRestaurant): array {
            $restaurantId = (int) $row->restaurant_id;
            $ratingRow = $ratingsByRestaurant->get($restaurantId);
            $categoryRow = $categoriesByRestaurant->get($restaurantId)?->first();
            $isAvailable = $row->restaurant_status === 'active' && (int) $row->is_published === 1;

            return [
                'favorite_id' => (int) $row->favorite_id,
                'restaurant_id' => $restaurantId,
                'restaurant_name' => (string) $row->restaurant_name,
                'branch_name' => $row->branch_name,
                'display_name' => RestaurantBranchService::formatDisplayName((string) $row->restaurant_name, $row->branch_name ?? null),
                'cuisine_type' => $categoryRow?->category_name ?? ($row->business_type ? ucfirst((string) $row->business_type) : 'Filipino'),
                'description' => $row->description,
                'logo_url' => $this->fileStorageService->publicUrl($row->logo_image),
                'cover_url' => $this->fileStorageService->publicUrl($row->cover_image),
                'restaurant_status' => (string) $row->restaurant_status,
                'is_published' => (int) $row->is_published === 1,
                'is_available' => $isAvailable,
                'offers_delivery' => (int) $row->offers_delivery === 1,
                'offers_pickup' => (int) $row->offers_pickup === 1,
                'offers_dine_in' => (int) $row->offers_dine_in === 1,
                'accepting_orders' => (int) $row->accepting_orders === 1,
                'accepts_reservations' => (int) $row->accepts_reservations === 1,
                'accepting_reservations' => (int) $row->accepting_reservations === 1,
                'city_name' => $row->city_name,
                'barangay_name' => $row->barangay_name,
                'province_name' => $row->province_name,
                'average_rating' => $ratingRow && (int) $ratingRow->review_count > 0 ? round((float) $ratingRow->avg_rating, 2) : null,
                'review_count' => $ratingRow ? (int) $ratingRow->review_count : 0,
                'favorited_at' => $row->favorited_at,
            ];
        })->values()->all();

        return [
            'favorites' => $favorites,
            'favorite_ids' => array_map(static fn (array $item): int => $item['restaurant_id'], $favorites),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function addFavorite(User $user, int $restaurantId): array
    {
        $this->assertCustomerAccount($user);
        $restaurant = DB::table('restaurants')
            ->where('restaurant_id', $restaurantId)
            ->first(['restaurant_id', 'restaurant_status', 'is_published']);

        if (! $restaurant) {
            throw new NotFoundHttpException('Restaurant not found.');
        }

        if ($restaurant->restaurant_status !== 'active' || (int) $restaurant->is_published !== 1) {
            throw ValidationException::withMessages([
                'restaurant_id' => ['Only active, published restaurants can be added to favorites.'],
            ]);
        }

        DB::table('customer_favorites')->insertOrIgnore([
            'user_id' => (int) $user->user_id,
            'restaurant_id' => $restaurantId,
            'created_at' => now(),
        ]);

        return [
            'restaurant_id' => $restaurantId,
            'favorited' => true,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function removeFavorite(User $user, int $restaurantId): array
    {
        $this->assertCustomerAccount($user);
        DB::table('customer_favorites')
            ->where('user_id', (int) $user->user_id)
            ->where('restaurant_id', $restaurantId)
            ->delete();

        return [
            'restaurant_id' => $restaurantId,
            'favorited' => false,
        ];
    }
}
