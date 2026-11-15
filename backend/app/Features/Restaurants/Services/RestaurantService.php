<?php

namespace App\Features\Restaurants\Services;

use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class RestaurantService
{
    private const DAY_NAMES = [
        0 => 'Sunday',
        1 => 'Monday',
        2 => 'Tuesday',
        3 => 'Wednesday',
        4 => 'Thursday',
        5 => 'Friday',
        6 => 'Saturday',
    ];

    private const AVAILABILITY_LABELS = [
        'available' => 'Available',
        'sold_out' => 'Sold Out',
        'temporarily_unavailable' => 'Temporarily Unavailable',
    ];

    public function __construct(
        private readonly AvailabilityService $availabilityService,
    ) {}

    /**
     * Return active restaurant categories in display order.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getActiveCategories(): array
    {
        return DB::table('restaurant_categories')
            ->where('is_active', 1)
            ->orderBy('category_name')
            ->orderBy('category_id')
            ->get(['category_id', 'category_name', 'description'])
            ->map(fn (object $row): array => [
                'id' => (int) $row->category_id,
                'name' => $row->category_name,
                'description' => $row->description,
            ])
            ->all();
    }

    /**
     * Return paginated list of approved & active public restaurants.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listRestaurants(array $filters): array
    {
        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 12)));
        $page = max(1, (int) ($filters['page'] ?? 1));

        $query = DB::table('restaurants as r')
            ->join('addresses as a', 'a.address_id', '=', 'r.address_id')
            ->join('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->join('cities as c', 'c.city_id', '=', 'b.city_id')
            ->where('r.restaurant_status', 'active')
            ->select([
                'r.restaurant_id',
                'r.restaurant_name',
                'r.business_type',
                'r.description',
                'r.logo_image',
                'r.cover_image',
                'r.offers_delivery',
                'r.offers_pickup',
                'r.offers_dine_in',
                'r.accepts_reservations',
                'r.accepting_orders',
                'r.accepting_reservations',
                'r.created_at',
                'b.barangay_name',
                'c.city_name',
            ]);

        $search = trim((string) ($filters['search'] ?? ''));
        if ($search !== '') {
            $escaped = $this->escapeLike($search);
            $pattern = '%'.$escaped.'%';

            $query->where(function ($sub) use ($pattern): void {
                $sub->where('r.restaurant_name', 'like', $pattern)
                    ->orWhereExists(function ($catSub) use ($pattern): void {
                        $catSub->selectRaw('1')
                            ->from('restaurant_category_map as rcm')
                            ->join('restaurant_categories as rc', 'rc.category_id', '=', 'rcm.category_id')
                            ->whereColumn('rcm.restaurant_id', 'r.restaurant_id')
                            ->where('rc.is_active', 1)
                            ->where('rc.category_name', 'like', $pattern);
                    });
            });
        }

        $category = trim((string) ($filters['category'] ?? ''));
        if ($category !== '') {
            $query->whereExists(function ($catSub) use ($category): void {
                $catSub->selectRaw('1')
                    ->from('restaurant_category_map as rcm')
                    ->join('restaurant_categories as rc', 'rc.category_id', '=', 'rcm.category_id')
                    ->whereColumn('rcm.restaurant_id', 'r.restaurant_id')
                    ->where('rc.is_active', 1);

                if (ctype_digit($category)) {
                    $catSub->where('rc.category_id', (int) $category);
                } else {
                    $catSub->whereRaw('LOWER(rc.category_name) = ?', [mb_strtolower($category)]);
                }
            });
        }

        foreach (['offers_delivery', 'offers_pickup', 'offers_dine_in'] as $flag) {
            if (array_key_exists($flag, $filters) && $filters[$flag] !== null && $filters[$flag] !== '') {
                $boolVal = filter_var($filters[$flag], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
                if ($boolVal !== null) {
                    $query->where('r.'.$flag, $boolVal ? 1 : 0);
                }
            }
        }

        $sort = (string) ($filters['sort'] ?? 'name');
        if ($sort === 'newest') {
            $query->orderByDesc('r.created_at')->orderByDesc('r.restaurant_id');
        } else {
            $query->orderBy('r.restaurant_name')->orderBy('r.restaurant_id');
        }

        $paginator = $query->paginate($perPage, ['*'], 'page', $page);
        $rows = collect($paginator->items());
        $ids = $rows->pluck('restaurant_id')->map(fn ($id) => (int) $id)->all();

        $categoriesByRestaurant = $this->loadCategoriesForRestaurants($ids);
        $hoursByRestaurant = $this->loadOperatingHoursForRestaurants($ids);
        $closuresByRestaurant = $this->loadRelevantClosuresForRestaurants($ids);
        $ratingsByRestaurant = $this->loadRatingSummariesForRestaurants($ids);

        $items = $rows->map(function (object $row) use (
            $categoriesByRestaurant,
            $hoursByRestaurant,
            $closuresByRestaurant,
            $ratingsByRestaurant
        ): array {
            $id = (int) $row->restaurant_id;
            $categories = $categoriesByRestaurant->get($id, collect())->values()->all();
            $availability = $this->availabilityService->compute(
                $row,
                $hoursByRestaurant->get($id, collect()),
                $closuresByRestaurant->get($id, collect()),
            );

            $item = [
                'id' => $id,
                'name' => $row->restaurant_name,
                'business_type' => $row->business_type,
                'description' => $row->description,
                'logo_path' => $row->logo_image,
                'cover_path' => $row->cover_image,
                'categories' => $categories,
                'short_address' => implode(', ', array_filter([$row->barangay_name, $row->city_name])),
                'offers' => [
                    'delivery' => (bool) $row->offers_delivery,
                    'pickup' => (bool) $row->offers_pickup,
                    'dine_in' => (bool) $row->offers_dine_in,
                    'reservations' => (bool) $row->accepts_reservations,
                ],
                'availability' => $availability,
            ];

            $ratingSummary = $ratingsByRestaurant->get($id);
            if ($ratingSummary && (int) $ratingSummary->review_count > 0) {
                $item['average_rating'] = round((float) $ratingSummary->average_rating, 1);
                $item['review_count'] = (int) $ratingSummary->review_count;
            }

            return $item;
        })->all();

        return [
            'restaurants' => $items,
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ];
    }

    /**
     * Return public details for a single approved & active restaurant.
     *
     * @return array<string, mixed>
     */
    public function getRestaurantDetails(int $restaurantId): array
    {
        $row = DB::table('restaurants as r')
            ->join('addresses as a', 'a.address_id', '=', 'r.address_id')
            ->join('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->join('cities as c', 'c.city_id', '=', 'b.city_id')
            ->join('provinces as p', 'p.province_id', '=', 'c.province_id')
            ->where('r.restaurant_id', $restaurantId)
            ->where('r.restaurant_status', 'active')
            ->first([
                'r.restaurant_id',
                'r.restaurant_name',
                'r.business_type',
                'r.description',
                'r.contact_phone',
                'r.logo_image',
                'r.cover_image',
                'r.offers_delivery',
                'r.offers_pickup',
                'r.offers_dine_in',
                'r.accepts_reservations',
                'r.accepting_orders',
                'r.accepting_reservations',
                'a.street',
                'a.building_name',
                'a.landmark',
                'a.postal_code',
                'b.barangay_name',
                'c.city_name',
                'p.province_name',
            ]);

        if (! $row) {
            throw new NotFoundHttpException('Restaurant not found.');
        }

        $categories = $this->loadCategoriesForRestaurants([$restaurantId])->get($restaurantId, collect())->values()->all();
        $hours = $this->loadOperatingHoursForRestaurants([$restaurantId])->get($restaurantId, collect());
        $closures = $this->loadRelevantClosuresForRestaurants([$restaurantId])->get($restaurantId, collect());
        $ratingSummary = $this->loadRatingSummariesForRestaurants([$restaurantId])->get($restaurantId);

        $availability = $this->availabilityService->compute($row, $hours, $closures);

        $publicAddressParts = array_filter([
            $row->building_name,
            $row->street,
            $row->barangay_name ? 'Brgy. '.$row->barangay_name : null,
            $row->city_name,
            $row->province_name,
            $row->postal_code,
        ]);

        $payload = [
            'id' => (int) $row->restaurant_id,
            'name' => $row->restaurant_name,
            'business_type' => $row->business_type,
            'description' => $row->description,
            'logo_path' => $row->logo_image,
            'cover_path' => $row->cover_image,
            'categories' => $categories,
            'address' => [
                'full' => implode(', ', $publicAddressParts),
                'short' => implode(', ', array_filter([$row->barangay_name, $row->city_name])),
                'barangay' => $row->barangay_name,
                'city' => $row->city_name,
                'province' => $row->province_name,
                'landmark' => $row->landmark,
            ],
            'contact_phone' => $row->contact_phone,
            'offers' => [
                'delivery' => (bool) $row->offers_delivery,
                'pickup' => (bool) $row->offers_pickup,
                'dine_in' => (bool) $row->offers_dine_in,
                'reservations' => (bool) $row->accepts_reservations,
            ],
            'availability' => $availability,
            'operating_hours' => $hours->map(fn (object $h): array => [
                'day_of_week' => (int) $h->day_of_week,
                'day_name' => self::DAY_NAMES[(int) $h->day_of_week] ?? '',
                'opening_time' => substr((string) $h->opening_time, 0, 5),
                'closing_time' => substr((string) $h->closing_time, 0, 5),
                'closes_next_day' => (bool) $h->closes_next_day,
                'is_closed' => (bool) $h->is_closed,
            ])->values()->all(),
        ];

        if ($ratingSummary && (int) $ratingSummary->review_count > 0) {
            $payload['rating_summary'] = [
                'average_rating' => round((float) $ratingSummary->average_rating, 1),
                'review_count' => (int) $ratingSummary->review_count,
            ];
        }

        return $payload;
    }

    /**
     * Return active menu categories and non-hidden menu items with add-on groups/options.
     *
     * @return array<string, mixed>
     */
    public function getRestaurantMenu(int $restaurantId): array
    {
        $exists = DB::table('restaurants')
            ->where('restaurant_id', $restaurantId)
            ->where('restaurant_status', 'active')
            ->exists();

        if (! $exists) {
            throw new NotFoundHttpException('Restaurant not found.');
        }

        $categories = DB::table('menu_categories')
            ->where('restaurant_id', $restaurantId)
            ->where('is_active', 1)
            ->orderBy('sort_order')
            ->orderBy('menu_category_id')
            ->get(['menu_category_id', 'category_name', 'description', 'sort_order']);

        $categoryIds = $categories->pluck('menu_category_id')->map(fn ($id) => (int) $id)->all();

        $items = $categoryIds === []
            ? collect()
            : DB::table('menu_items')
                ->where('restaurant_id', $restaurantId)
                ->whereIn('menu_category_id', $categoryIds)
                ->where('approval_status', 'approved')
                ->where('availability_status', '!=', 'hidden')
                ->orderBy('sort_order')
                ->orderBy('menu_item_id')
                ->get([
                    'menu_item_id',
                    'menu_category_id',
                    'item_name',
                    'description',
                    'photo_image',
                    'base_price',
                    'availability_status',
                    'sort_order',
                ]);

        $itemIds = $items->pluck('menu_item_id')->map(fn ($id) => (int) $id)->all();
        $addOnGroupsByItem = $this->loadAddOnGroupsForItems($itemIds);

        $itemsByCategory = $items->groupBy('menu_category_id');

        $formattedCategories = $categories->map(function (object $category) use ($itemsByCategory, $addOnGroupsByItem): array {
            $categoryItems = $itemsByCategory->get($category->menu_category_id, collect())
                ->map(function (object $item) use ($addOnGroupsByItem): array {
                    $status = (string) $item->availability_status;

                    return [
                        'id' => (int) $item->menu_item_id,
                        'name' => $item->item_name,
                        'description' => $item->description,
                        'price' => (float) $item->base_price,
                        'photo_path' => $item->photo_image,
                        'availability' => self::AVAILABILITY_LABELS[$status] ?? 'Available',
                        'availability_status' => $status,
                        'add_on_groups' => $addOnGroupsByItem->get((int) $item->menu_item_id, []),
                    ];
                })
                ->values()
                ->all();

            return [
                'id' => (int) $category->menu_category_id,
                'name' => $category->category_name,
                'description' => $category->description,
                'items' => $categoryItems,
            ];
        })->values()->all();

        return [
            'restaurant_id' => $restaurantId,
            'categories' => $formattedCategories,
        ];
    }

    private function escapeLike(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
    }

    /**
     * @param  array<int, int>  $restaurantIds
     * @return Collection<int, Collection<int, array<string, mixed>>>
     */
    private function loadCategoriesForRestaurants(array $restaurantIds): Collection
    {
        if ($restaurantIds === []) {
            return collect();
        }

        return DB::table('restaurant_category_map as rcm')
            ->join('restaurant_categories as rc', 'rc.category_id', '=', 'rcm.category_id')
            ->whereIn('rcm.restaurant_id', $restaurantIds)
            ->where('rc.is_active', 1)
            ->orderBy('rc.category_name')
            ->get(['rcm.restaurant_id', 'rc.category_id', 'rc.category_name'])
            ->groupBy('restaurant_id')
            ->map(fn (Collection $group) => $group->map(fn (object $row): array => [
                'id' => (int) $row->category_id,
                'name' => $row->category_name,
            ]));
    }

    /**
     * @param  array<int, int>  $restaurantIds
     * @return Collection<int, Collection<int, object>>
     */
    private function loadOperatingHoursForRestaurants(array $restaurantIds): Collection
    {
        if ($restaurantIds === []) {
            return collect();
        }

        return DB::table('operating_hours')
            ->whereIn('restaurant_id', $restaurantIds)
            ->orderBy('day_of_week')
            ->orderBy('opening_time')
            ->get([
                'restaurant_id',
                'day_of_week',
                'opening_time',
                'closing_time',
                'closes_next_day',
                'is_closed',
            ])
            ->groupBy('restaurant_id');
    }

    /**
     * @param  array<int, int>  $restaurantIds
     * @return Collection<int, Collection<int, object>>
     */
    private function loadRelevantClosuresForRestaurants(array $restaurantIds): Collection
    {
        if ($restaurantIds === []) {
            return collect();
        }

        $manilaNow = Carbon::now(AvailabilityService::TIMEZONE);
        $dates = [
            $manilaNow->copy()->subDay()->toDateString(),
            $manilaNow->toDateString(),
        ];

        return DB::table('restaurant_closures')
            ->whereIn('restaurant_id', $restaurantIds)
            ->whereIn('closure_date', $dates)
            ->get(['restaurant_id', 'closure_date', 'reason'])
            ->groupBy('restaurant_id');
    }

    /**
     * @param  array<int, int>  $restaurantIds
     * @return Collection<int, object>
     */
    private function loadRatingSummariesForRestaurants(array $restaurantIds): Collection
    {
        if ($restaurantIds === []) {
            return collect();
        }

        return DB::table('reviews')
            ->whereIn('restaurant_id', $restaurantIds)
            ->where('is_visible', 1)
            ->groupBy('restaurant_id')
            ->get([
                'restaurant_id',
                DB::raw('AVG(rating) as average_rating'),
                DB::raw('COUNT(*) as review_count'),
            ])
            ->keyBy('restaurant_id');
    }

    /**
     * @param  array<int, int>  $itemIds
     * @return Collection<int, array<int, array<string, mixed>>>
     */
    private function loadAddOnGroupsForItems(array $itemIds): Collection
    {
        if ($itemIds === []) {
            return collect();
        }

        $groups = DB::table('add_on_groups')
            ->whereIn('menu_item_id', $itemIds)
            ->orderBy('sort_order')
            ->orderBy('add_on_group_id')
            ->get([
                'add_on_group_id',
                'menu_item_id',
                'group_name',
                'is_required',
                'minimum_selections',
                'maximum_selections',
            ]);

        $groupIds = $groups->pluck('add_on_group_id')->map(fn ($id) => (int) $id)->all();

        $optionsByGroup = $groupIds === []
            ? collect()
            : DB::table('add_on_options')
                ->whereIn('add_on_group_id', $groupIds)
                ->orderBy('sort_order')
                ->orderBy('add_on_option_id')
                ->get([
                    'add_on_option_id',
                    'add_on_group_id',
                    'option_name',
                    'additional_price',
                    'is_available',
                ])
                ->groupBy('add_on_group_id');

        return $groups->groupBy('menu_item_id')->map(function (Collection $itemGroups) use ($optionsByGroup): array {
            return $itemGroups->map(function (object $group) use ($optionsByGroup): array {
                $options = $optionsByGroup->get($group->add_on_group_id, collect())
                    ->map(fn (object $opt): array => [
                        'id' => (int) $opt->add_on_option_id,
                        'name' => $opt->option_name,
                        'additional_price' => (float) $opt->additional_price,
                        'is_available' => (bool) $opt->is_available,
                    ])
                    ->values()
                    ->all();

                return [
                    'id' => (int) $group->add_on_group_id,
                    'name' => $group->group_name,
                    'is_required' => (bool) $group->is_required,
                    'minimum_selections' => (int) $group->minimum_selections,
                    'maximum_selections' => (int) $group->maximum_selections,
                    'options' => $options,
                ];
            })->values()->all();
        });
    }
}
