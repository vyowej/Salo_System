<?php

namespace App\Features\Restaurants\Services;

use App\Features\Reviews\Services\ReviewAggregationService;
use App\Models\User;
use App\Support\FileStorageService;
use App\Support\PublicRestaurantVisibility;
use App\Support\RestaurantBranchService;
use App\Support\SqlLike;
use Carbon\Carbon;
use Illuminate\Database\Query\Builder;
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
        private readonly FileStorageService $fileStorageService,
        private readonly ReviewAggregationService $reviewAggregationService,
        private readonly PublicRestaurantVisibility $visibility,
        private readonly MenuPublishService $menuPublishService,
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

        $query = $this->buildPublicRestaurantListQuery($filters);
        $paginator = $query->paginate($perPage, ['*'], 'page', $page);
        $rows = collect($paginator->items());
        $ids = $rows->pluck('restaurant_id')->map(fn ($id) => (int) $id)->all();

        $categoriesByRestaurant = $this->loadCategoriesForRestaurants($ids);
        $hoursByRestaurant = $this->loadOperatingHoursForRestaurants($ids);
        $closuresByRestaurant = $this->loadRelevantClosuresForRestaurants($ids);
        $ratingsByRestaurant = $this->loadRatingSummariesForRestaurants($ids);

        $items = $rows->map(fn (object $row): array => $this->formatPublicRestaurantListItem(
            $row,
            $categoriesByRestaurant,
            $hoursByRestaurant,
            $closuresByRestaurant,
            $ratingsByRestaurant,
        ))->all();

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
     * @param  array<string, mixed>  $filters
     */
    private function buildPublicRestaurantListQuery(array $filters): Builder
    {
        $query = DB::table('restaurants as r')
            ->join('addresses as a', 'a.address_id', '=', 'r.address_id')
            ->join('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->join('cities as c', 'c.city_id', '=', 'b.city_id');

        $branchCountSub = $this->visibility->applyVisibleRestaurantScope(
            DB::table('restaurants as rb')
                ->whereColumn('rb.brand_restaurant_id', 'r.brand_restaurant_id')
                ->selectRaw('COUNT(*)'),
            'rb',
        );

        $activeTablesSub = DB::table('restaurant_tables as rt')
            ->whereColumn('rt.restaurant_id', 'r.restaurant_id')
            ->where('rt.is_active', 1)
            ->selectRaw('COUNT(*)');

        $this->visibility->applyVisibleRestaurantScope($query, 'r')
            ->select([
                'r.restaurant_id', 'r.restaurant_name', 'r.branch_name', 'r.brand_restaurant_id', 'r.business_type', 'r.description',
                'r.logo_image', 'r.cover_image', 'r.offers_delivery', 'r.offers_pickup',
                'r.offers_dine_in', 'r.accepts_reservations', 'r.accepting_orders',
                'r.accepting_reservations', 'r.created_at', 'b.barangay_name', 'c.city_name',
            ])
            ->selectSub($branchCountSub, 'visible_branch_count')
            ->selectSub($activeTablesSub, 'active_tables_count');

        $this->applyPublicListSearchAndCategory($query, $filters);

        foreach (['offers_delivery', 'offers_pickup', 'offers_dine_in'] as $flag) {
            if (array_key_exists($flag, $filters) && $filters[$flag] !== null && $filters[$flag] !== '') {
                $boolVal = filter_var($filters[$flag], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
                if ($boolVal !== null) {
                    $query->where('r.'.$flag, $boolVal ? 1 : 0);
                }
            }
        }

        return (string) ($filters['sort'] ?? 'name') === 'newest'
            ? $query->orderByDesc('r.created_at')->orderByDesc('r.restaurant_id')
            : $query->orderBy('r.restaurant_name')->orderBy('r.restaurant_id');
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    private function applyPublicListSearchAndCategory(Builder $query, array $filters): void
    {
        $search = trim((string) ($filters['search'] ?? ''));
        if ($search !== '') {
            $pattern = '%'.SqlLike::escape($search).'%';
            $query->where(function ($sub) use ($pattern): void {
                $sub->where('r.restaurant_name', 'like', $pattern)
                    ->orWhere('r.branch_name', 'like', $pattern)
                    ->orWhere('b.barangay_name', 'like', $pattern)
                    ->orWhere('c.city_name', 'like', $pattern)
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

                ctype_digit($category)
                    ? $catSub->where('rc.category_id', (int) $category)
                    : $catSub->where('rc.category_name', $category);
            });
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function formatPublicRestaurantListItem(
        object $row,
        Collection $categoriesByRestaurant,
        Collection $hoursByRestaurant,
        Collection $closuresByRestaurant,
        Collection $ratingsByRestaurant,
    ): array {
        $id = (int) $row->restaurant_id;
        $brandId = (int) ($row->brand_restaurant_id ?? $id);
        $branchName = property_exists($row, 'branch_name') ? $row->branch_name : null;
        $availability = $this->availabilityService->compute(
            $row,
            $hoursByRestaurant->get($id, collect()),
            $closuresByRestaurant->get($id, collect()),
        );

        $item = [
            'id' => $id,
            'name' => $row->restaurant_name,
            'branch_name' => $branchName,
            'brand_restaurant_id' => $brandId,
            'display_name' => RestaurantBranchService::formatDisplayName((string) $row->restaurant_name, $branchName),
            'branch_count' => max(1, (int) ($row->visible_branch_count ?? 1)),
            'business_type' => $row->business_type,
            'description' => $row->description,
            'logo_path' => $this->fileStorageService->publicUrl($row->logo_image),
            'cover_path' => $this->fileStorageService->publicUrl($row->cover_image),
            'categories' => $categoriesByRestaurant->get($id, collect())->values()->all(),
            'short_address' => implode(', ', array_filter([$row->barangay_name, $row->city_name])),
            'offers' => [
                'delivery' => (bool) $row->offers_delivery,
                'pickup' => (bool) $row->offers_pickup,
                'dine_in' => (bool) $row->offers_dine_in,
                'reservations' => (bool) $row->accepts_reservations,
            ],
            'can_reserve' => (bool) $row->accepts_reservations
                && (bool) $row->accepting_reservations
                && ((int) ($row->active_tables_count ?? 0) > 0),
            'availability' => $availability,
        ];

        $ratingSummary = $ratingsByRestaurant->get($id);
        if ($ratingSummary && (int) $ratingSummary->review_count > 0) {
            $item['average_rating'] = round((float) $ratingSummary->average_rating, 1);
            $item['review_count'] = (int) $ratingSummary->review_count;
        }

        return $item;
    }

    /**
     * Return public details for a single approved & active restaurant.
     *
     * @return array<string, mixed>
     */
    public function getRestaurantDetails(int $restaurantId): array
    {
        $query = DB::table('restaurants as r')
            ->join('addresses as a', 'a.address_id', '=', 'r.address_id')
            ->join('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->join('cities as c', 'c.city_id', '=', 'b.city_id')
            ->join('provinces as p', 'p.province_id', '=', 'c.province_id')
            ->where('r.restaurant_id', $restaurantId);

        $activeTablesSub = DB::table('restaurant_tables as rt')
            ->whereColumn('rt.restaurant_id', 'r.restaurant_id')
            ->where('rt.is_active', 1)
            ->selectRaw('COUNT(*)');

        $row = $this->visibility->applyVisibleRestaurantScope($query, 'r')
            ->select([
                'r.restaurant_id',
                'r.restaurant_name',
                'r.branch_name',
                'r.brand_restaurant_id',
                'r.parent_restaurant_id',
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
                'r.reservation_min_notice_hours',
                'r.reservation_max_party_size',
                'r.reservation_notes',
                'r.reservation_duration_minutes',
                'r.reservation_max_advance_days',
                'r.reservation_cancellation_cutoff_minutes',
                'r.reservation_deposit_required',
                'r.reservation_deposit_amount',
                'r.reservation_service_fee',
                'a.street',
                'a.building_name',
                'a.landmark',
                'a.postal_code',
                'b.barangay_name',
                'c.city_name',
                'p.province_name',
            ])
            ->selectSub($activeTablesSub, 'active_tables_count')
            ->first();

        if (! $row) {
            throw new NotFoundHttpException('Restaurant not found.');
        }

        $brandId = (int) ($row->brand_restaurant_id ?? $restaurantId);
        $categories = $this->loadCategoriesForRestaurants([$restaurantId])->get($restaurantId, collect())->values()->all();
        $hours = $this->loadOperatingHoursForRestaurants([$restaurantId])->get($restaurantId, collect());
        $closures = $this->loadRelevantClosuresForRestaurants([$restaurantId])->get($restaurantId, collect());
        $ratingSummary = $this->loadRatingSummariesForRestaurants([$restaurantId])->get($restaurantId);
        $siblings = $this->loadVisibleSiblings($brandId, $restaurantId);

        return $this->formatPublicRestaurantDetails(
            $row,
            $categories,
            $hours,
            $this->availabilityService->compute($row, $hours, $closures),
            $ratingSummary,
            $siblings,
        );
    }

    /**
     * Return full customer-view preview details (including draft menu) for an owner or authorized staff.
     * Never exposed to public routes or other users.
     *
     * @return array<string, mixed>
     */
    public function getOwnerPreviewDetails(User $user, ?int $restaurantId = null): array
    {
        $ownerQuery = DB::table('restaurants as r')
            ->leftJoin('restaurant_owners as ro', function ($join) use ($user): void {
                $join->on('ro.restaurant_id', '=', 'r.restaurant_id')
                    ->where('ro.user_id', '=', $user->user_id);
            })
            ->leftJoin('restaurant_staff as rs', function ($join) use ($user): void {
                $join->on('rs.restaurant_id', '=', 'r.restaurant_id')
                    ->where('rs.user_id', '=', $user->user_id)
                    ->where('rs.staff_status', '=', 'active');
            })
            ->where(function ($q): void {
                $q->whereNotNull('ro.user_id')->orWhereNotNull('rs.user_id');
            });

        if ($restaurantId !== null) {
            $ownerQuery->where('r.restaurant_id', $restaurantId);
        } else {
            $ownerQuery->orderBy('r.restaurant_id');
        }

        $authorizedRest = $ownerQuery->select('r.restaurant_id')->first();
        if (! $authorizedRest) {
            abort(403, 'You are not authorized to preview this restaurant.');
        }

        $targetId = (int) $authorizedRest->restaurant_id;

        $activeTablesSub = DB::table('restaurant_tables as rt')
            ->whereColumn('rt.restaurant_id', 'r.restaurant_id')
            ->where('rt.is_active', 1)
            ->selectRaw('COUNT(*)');

        $row = DB::table('restaurants as r')
            ->join('addresses as a', 'a.address_id', '=', 'r.address_id')
            ->join('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->join('cities as c', 'c.city_id', '=', 'b.city_id')
            ->join('provinces as p', 'p.province_id', '=', 'c.province_id')
            ->where('r.restaurant_id', $targetId)
            ->select([
                'r.restaurant_id',
                'r.restaurant_name',
                'r.branch_name',
                'r.brand_restaurant_id',
                'r.parent_restaurant_id',
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
                'r.is_published',
                'r.restaurant_status',
                'r.reservation_min_notice_hours',
                'r.reservation_max_party_size',
                'r.reservation_notes',
                'r.reservation_duration_minutes',
                'r.reservation_max_advance_days',
                'r.reservation_cancellation_cutoff_minutes',
                'r.reservation_deposit_required',
                'r.reservation_deposit_amount',
                'r.reservation_service_fee',
                'a.street',
                'a.building_name',
                'a.landmark',
                'a.postal_code',
                'b.barangay_name',
                'c.city_name',
                'p.province_name',
            ])
            ->selectSub($activeTablesSub, 'active_tables_count')
            ->first();

        if (! $row) {
            throw new NotFoundHttpException('Restaurant not found.');
        }

        $brandId = (int) ($row->brand_restaurant_id ?? $targetId);
        $categories = $this->loadCategoriesForRestaurants([$targetId])->get($targetId, collect())->values()->all();
        $hours = $this->loadOperatingHoursForRestaurants([$targetId])->get($targetId, collect());
        $closures = $this->loadRelevantClosuresForRestaurants([$targetId])->get($targetId, collect());
        $availability = $this->availabilityService->compute($row, $hours, $closures);
        $ratingSummary = $this->loadRatingSummariesForRestaurants([$targetId])->get($targetId);
        $siblings = $this->loadVisibleSiblings($brandId, $targetId);

        $details = $this->formatPublicRestaurantDetails(
            $row,
            $categories,
            $hours,
            $availability,
            $ratingSummary,
            $siblings,
        );

        $menuCategories = DB::table('menu_categories')
            ->where('restaurant_id', $targetId)
            ->where('is_active', 1)
            ->where('draft_state', '!=', 'pending_delete')
            ->orderBy('sort_order')
            ->orderBy('menu_category_id')
            ->get(['menu_category_id', 'category_name', 'description', 'sort_order']);

        $categoryIds = $menuCategories->pluck('menu_category_id')->map(fn ($id) => (int) $id)->all();
        $menuItems = $categoryIds === []
            ? collect()
            : DB::table('menu_items')
                ->where('restaurant_id', $targetId)
                ->whereIn('menu_category_id', $categoryIds)
                ->where('draft_state', '!=', 'pending_delete')
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

        $itemIds = $menuItems->pluck('menu_item_id')->map(fn ($id) => (int) $id)->all();
        $addOnGroupsByItem = $this->loadAddOnGroupsForItems($itemIds);

        return [
            'restaurant' => $details,
            'categories' => $this->formatPublicMenuCategories($menuCategories, $menuItems, $addOnGroupsByItem),
            'is_preview' => true,
            'is_published' => (bool) ($row->is_published ?? false),
            'restaurant_status' => (string) ($row->restaurant_status ?? ''),
        ];
    }

    /**
     * @param  array<int, int>  $brandIds
     * @return Collection<int, int>
     */
    private function loadVisibleBranchCountsForBrands(array $brandIds): Collection
    {
        if ($brandIds === []) {
            return collect();
        }

        return $this->visibility->applyVisibleRestaurantScope(DB::table('restaurants as r'), 'r')
            ->whereIn('r.brand_restaurant_id', $brandIds)
            ->selectRaw('r.brand_restaurant_id, COUNT(*) as total')
            ->groupBy('r.brand_restaurant_id')
            ->pluck('total', 'brand_restaurant_id')
            ->map(fn ($count): int => (int) $count);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function loadVisibleSiblings(int $brandId, int $excludeRestaurantId): array
    {
        $siblingRows = $this->visibility->applyVisibleRestaurantScope(
            DB::table('restaurants as r')
                ->join('addresses as a', 'a.address_id', '=', 'r.address_id')
                ->join('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
                ->join('cities as c', 'c.city_id', '=', 'b.city_id')
                ->where('r.brand_restaurant_id', $brandId)
                ->where('r.restaurant_id', '!=', $excludeRestaurantId),
            'r',
        )
            ->orderByRaw('CASE WHEN r.parent_restaurant_id IS NULL THEN 0 ELSE 1 END ASC')
            ->orderBy('r.restaurant_id')
            ->get([
                'r.restaurant_id',
                'r.restaurant_name',
                'r.branch_name',
                'r.accepts_reservations',
                'r.accepting_orders',
                'r.accepting_reservations',
                'b.barangay_name',
                'c.city_name',
            ]);

        if ($siblingRows->isEmpty()) {
            return [];
        }

        $sibIds = $siblingRows->pluck('restaurant_id')->map(fn ($id): int => (int) $id)->all();
        $hoursBySib = $this->loadOperatingHoursForRestaurants($sibIds);
        $closuresBySib = $this->loadRelevantClosuresForRestaurants($sibIds);

        return $siblingRows->map(function (object $sib) use ($hoursBySib, $closuresBySib): array {
            $sibId = (int) $sib->restaurant_id;

            return [
                'id' => $sibId,
                'branch_name' => $sib->branch_name,
                'display_name' => RestaurantBranchService::formatDisplayName((string) $sib->restaurant_name, $sib->branch_name),
                'short_address' => implode(', ', array_filter([$sib->barangay_name, $sib->city_name])),
                'availability' => $this->availabilityService->compute(
                    $sib,
                    $hoursBySib->get($sibId, collect()),
                    $closuresBySib->get($sibId, collect()),
                ),
            ];
        })->values()->all();
    }

    /**
     * @param  array<int, string>  $categories
     * @param  array<string, mixed>  $availability
     * @param  array<int, array<string, mixed>>  $siblings
     * @return array<string, mixed>
     */
    private function formatPublicRestaurantDetails(
        object $row,
        array $categories,
        Collection $hours,
        array $availability,
        ?object $ratingSummary,
        array $siblings = [],
    ): array {
        $formattedPublicAddress = \App\Support\AddressFormatter::format($row);
        $publicAddressParts = $formattedPublicAddress !== '' ? [$formattedPublicAddress] : [];
        $shortAddress = implode(', ', array_filter([$row->barangay_name, $row->city_name]));
        $id = (int) $row->restaurant_id;
        $brandId = (int) ($row->brand_restaurant_id ?? $id);
        $branchName = property_exists($row, 'branch_name') ? $row->branch_name : null;

        $payload = [
            'id' => $id,
            'name' => $row->restaurant_name,
            'branch_name' => $branchName,
            'brand_restaurant_id' => $brandId,
            'display_name' => RestaurantBranchService::formatDisplayName((string) $row->restaurant_name, $branchName),
            'branch_count' => 1 + count($siblings),
            'short_address' => $shortAddress,
            'siblings' => $siblings,
            'business_type' => $row->business_type,
            'description' => $row->description,
            'logo_path' => $this->fileStorageService->publicUrl($row->logo_image),
            'cover_path' => $this->fileStorageService->publicUrl($row->cover_image),
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
            'can_reserve' => (bool) $row->accepts_reservations
                && (bool) $row->accepting_reservations
                && ((int) ($row->active_tables_count ?? 0) > 0),
            'reservation_min_notice_hours' => (int) ($row->reservation_min_notice_hours ?? 2),
            'reservation_max_party_size' => (int) ($row->reservation_max_party_size ?? 8),
            'reservation_notes' => $row->reservation_notes,
            'reservation_duration_minutes' => (int) ($row->reservation_duration_minutes ?? config('salo.reservations.default_duration_minutes', 90)),
            'reservation_max_advance_days' => (int) ($row->reservation_max_advance_days ?? 30),
            'reservation_cancellation_cutoff_minutes' => (int) ($row->reservation_cancellation_cutoff_minutes ?? 120),
            'reservation_deposit_required' => (bool) ($row->reservation_deposit_required ?? false),
            'reservation_deposit_amount' => number_format((float) ($row->reservation_deposit_amount ?? 0), 2, '.', ''),
            'reservation_service_fee' => number_format((float) ($row->reservation_service_fee ?? 0), 2, '.', ''),
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
        if (! $this->visibility->isVisible($restaurantId)) {
            throw new NotFoundHttpException('Restaurant not found.');
        }

        $categories = $this->visibility->publishedCategoriesQuery($restaurantId)
            ->get([
                'menu_category_id',
                'published_category_name as category_name',
                'published_description as description',
                'published_sort_order as sort_order',
            ]);

        $categoryIds = $categories->pluck('menu_category_id')->map(fn ($id) => (int) $id)->all();

        $items = $categoryIds === []
            ? collect()
            : $this->visibility->publishedItemsQuery($restaurantId, $categoryIds)
                ->get([
                    'menu_item_id',
                    'published_menu_category_id as menu_category_id',
                    'published_item_name as item_name',
                    'published_description as description',
                    'published_photo_image as photo_image',
                    'published_base_price as base_price',
                    'availability_status',
                    'published_sort_order as sort_order',
                ]);

        $itemIds = $items->pluck('menu_item_id')->map(fn ($id) => (int) $id)->all();
        $addOnGroupsByItem = $this->loadAddOnGroupsForItems($itemIds);

        return [
            'restaurant_id' => $restaurantId,
            'categories' => $this->formatPublicMenuCategories($categories, $items, $addOnGroupsByItem),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function formatPublicMenuCategories(Collection $categories, Collection $items, Collection $addOnGroupsByItem): array
    {
        $itemsByCategory = $items->groupBy('menu_category_id');

        return $categories->map(function (object $category) use ($itemsByCategory, $addOnGroupsByItem): array {
            $categoryItems = $itemsByCategory->get($category->menu_category_id, collect())
                ->map(function (object $item) use ($addOnGroupsByItem): array {
                    $status = (string) $item->availability_status;

                    return [
                        'id' => (int) $item->menu_item_id,
                        'name' => $item->item_name,
                        'description' => $item->description,
                        'price' => (float) $item->base_price,
                        'photo_path' => $this->fileStorageService->publicUrl($item->photo_image),
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
    }

    /**
     * Return derived setup checklist status for an approved restaurant owner's restaurant.
     *
     * @return array<string, mixed>
     */
    public function getOwnerSetupStatus(User $user, ?int $restaurantId = null): array
    {
        $restaurant = $this->findSetupRestaurant($user, $restaurantId);
        $address = DB::table('addresses as a')
            ->join('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->join('cities as c', 'c.city_id', '=', 'b.city_id')
            ->join('provinces as p', 'p.province_id', '=', 'c.province_id')
            ->where('a.address_id', $restaurant->address_id)
            ->select(['a.street', 'b.barangay_name', 'c.city_name', 'p.province_name'])
            ->first();

        $targetRestaurantId = (int) $restaurant->restaurant_id;
        $countsRow = DB::selectOne(
            'SELECT
                (SELECT COUNT(*) FROM operating_hours WHERE restaurant_id = ? AND is_closed = 0) as open_periods_count,
                (SELECT COUNT(*) FROM menu_categories WHERE restaurant_id = ? AND is_active = 1 AND draft_state != ?) as menu_categories_count,
                (SELECT COUNT(*) FROM menu_items WHERE restaurant_id = ? AND availability_status != ? AND draft_state != ?) as menu_items_count,
                (SELECT COUNT(*) FROM restaurant_tables WHERE restaurant_id = ? AND is_active = 1) as tables_count',
            [$targetRestaurantId, $targetRestaurantId, 'pending_delete', $targetRestaurantId, 'hidden', 'pending_delete', $targetRestaurantId]
        );

        return $this->formatOwnerSetupStatus($restaurant, $address, $countsRow);
    }

    private function findSetupRestaurant(User $user, ?int $restaurantId): object
    {
        $query = DB::table('restaurants as r')
            ->join('restaurant_owners as ro', 'ro.restaurant_id', '=', 'r.restaurant_id')
            ->where('ro.user_id', $user->user_id)
            ->select('r.*');

        if ($restaurantId !== null) {
            $query->where('r.restaurant_id', $restaurantId);
        } else {
            $query->whereIn('r.restaurant_status', ['approved', 'active'])->orderBy('r.restaurant_id');
        }

        $restaurant = $query->first();
        if (! $restaurant) {
            abort(403, 'You are not authorized to access this restaurant setup status.');
        }

        if (! in_array($restaurant->restaurant_status, ['approved', 'active'], true)) {
            abort(403, 'Restaurant is not approved yet.');
        }

        return $restaurant;
    }

    /**
     * @return array<string, mixed>
     */
    private function formatOwnerSetupStatus(object $restaurant, ?object $address, object $countsRow): array
    {
        $hasLogo = ! empty($restaurant->logo_image);
        $hasCover = ! empty($restaurant->cover_image);
        $hasInfo = ! empty($restaurant->restaurant_name) && ! empty($restaurant->description)
            && ! empty($restaurant->contact_phone) && ! empty($restaurant->business_email);
        $hasAddress = $address !== null && ! empty($address->street) && ! empty($address->barangay_name)
            && ! empty($address->city_name) && ! empty($address->province_name);

        $openPeriodsCount = (int) ($countsRow->open_periods_count ?? 0);
        $menuCategoriesCount = (int) ($countsRow->menu_categories_count ?? 0);
        $menuItemsCount = (int) ($countsRow->menu_items_count ?? 0);
        $tablesCount = (int) ($countsRow->tables_count ?? 0);
        $offersDineIn = (bool) $restaurant->offers_dine_in;
        $acceptsReservations = (bool) $restaurant->accepts_reservations;
        $tablesApplicable = $offersDineIn || $acceptsReservations;
        $acceptingOrders = (bool) $restaurant->accepting_orders;

        return [
            'restaurant_id' => (int) $restaurant->restaurant_id,
            'restaurant_name' => $restaurant->restaurant_name,
            'restaurant_status' => $restaurant->restaurant_status,
            'business_profile' => [
                'has_logo' => $hasLogo, 'has_cover' => $hasCover, 'has_info' => $hasInfo,
                'has_address' => $hasAddress, 'complete' => $hasLogo && $hasCover && $hasInfo && $hasAddress,
            ],
            'operating_hours' => ['open_periods_count' => $openPeriodsCount, 'complete' => $openPeriodsCount > 0],
            'menu' => [
                'categories_count' => $menuCategoriesCount, 'items_count' => $menuItemsCount,
                'complete' => $menuCategoriesCount >= 1 && $menuItemsCount >= 1,
            ],
            'tables' => [
                'applicable' => $tablesApplicable, 'offers_dine_in' => $offersDineIn,
                'accepts_reservations' => $acceptsReservations, 'tables_count' => $tablesCount,
                'complete' => ! $tablesApplicable || $tablesCount >= 1,
            ],
            'availability_toggles' => [
                'accepting_orders' => $acceptingOrders,
                'accepting_reservations' => $acceptsReservations ? (bool) $restaurant->accepting_reservations : null,
                'complete' => $acceptingOrders && (! $acceptsReservations || (bool) $restaurant->accepting_reservations),
            ],
            'publish' => $this->menuPublishService->buildPublishStatusForRestaurant($restaurant, $address),
        ];
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
        return $this->reviewAggregationService->getBatchRestaurantRatingSummaries($restaurantIds);
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
        $optionsByGroup = $this->loadAddOnOptionsByGroup($groupIds);

        return $groups->groupBy('menu_item_id')->map(function (Collection $itemGroups) use ($optionsByGroup): array {
            return $itemGroups->map(fn (object $group): array => [
                'id' => (int) $group->add_on_group_id,
                'name' => $group->group_name,
                'is_required' => (bool) $group->is_required,
                'minimum_selections' => (int) $group->minimum_selections,
                'maximum_selections' => (int) $group->maximum_selections,
                'options' => $optionsByGroup->get($group->add_on_group_id, []),
            ])->values()->all();
        });
    }

    /**
     * @param  array<int, int>  $groupIds
     */
    private function loadAddOnOptionsByGroup(array $groupIds): Collection
    {
        if ($groupIds === []) {
            return collect();
        }

        return DB::table('add_on_options')
            ->whereIn('add_on_group_id', $groupIds)
            ->orderBy('sort_order')
            ->orderBy('add_on_option_id')
            ->get(['add_on_option_id', 'add_on_group_id', 'option_name', 'additional_price', 'is_available'])
            ->groupBy('add_on_group_id')
            ->map(fn (Collection $opts): array => $opts->map(fn (object $opt): array => [
                'id' => (int) $opt->add_on_option_id,
                'name' => $opt->option_name,
                'additional_price' => (float) $opt->additional_price,
                'is_available' => (bool) $opt->is_available,
            ])->values()->all());
    }
}
