<?php

namespace App\Features\Reviews\Services;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ReviewAggregationService
{
    public function __construct(
        private readonly PlatformSettingsService $settingsService,
    ) {}

    /**
     * Apply the authoritative eligibility filter to a reviews or rider_reviews query
     * in a single SQL query (avoiding extra round-trips on listing endpoints).
     */
    public function applyEligibilityFilter(Builder $query, string $alias = ''): Builder
    {
        $prefix = $alias !== '' ? "{$alias}." : '';

        return $query
            ->where("{$prefix}is_visible", 1)
            ->where(function (Builder $q) use ($prefix): void {
                $q->where(function (Builder $sub) use ($prefix): void {
                    $sub->where("{$prefix}counts_toward_rating", 1)
                        ->where("{$prefix}moderation_status", 'published');
                })->orWhere(function (Builder $sub) use ($prefix): void {
                    $sub->where("{$prefix}moderation_status", 'flagged')
                        ->whereExists(function ($ex): void {
                            $ex->select(DB::raw(1))
                                ->from('platform_settings')
                                ->where('setting_key', 'reviews.flagged_counts_toward_rating')
                                ->whereIn('setting_value', ['1', 'true', 'yes']);
                        });
                });
            });
    }

    /**
     * Batch-load authoritative rating summaries for restaurant listings.
     *
     * @param  array<int, int>  $restaurantIds
     * @return Collection<int, object>
     */
    public function getBatchRestaurantRatingSummaries(array $restaurantIds): Collection
    {
        if ($restaurantIds === []) {
            return collect();
        }

        $query = DB::table('reviews')
            ->whereIn('restaurant_id', $restaurantIds);

        $this->applyEligibilityFilter($query);

        return $query
            ->groupBy('restaurant_id')
            ->get([
                'restaurant_id',
                DB::raw('AVG(rating) as average_rating'),
                DB::raw('COUNT(*) as review_count'),
            ])
            ->keyBy('restaurant_id');
    }

    /**
     * Authoritative restaurant rating summary + 1-5 star distribution.
     *
     * @return array<string, mixed>
     */
    public function getRestaurantRatingSummary(int $restaurantId, ?int $days = null): array
    {
        $query = DB::table('reviews')->where('restaurant_id', $restaurantId);
        $this->applyEligibilityFilter($query);
        $this->applyDateRangeFilter($query, $days);

        return $this->aggregateSummaryFromQuery($query);
    }

    /**
     * Authoritative rider rating summary + 1-5 star distribution.
     *
     * @return array<string, mixed>
     */
    public function getRiderRatingSummary(int $riderId, ?int $days = null): array
    {
        $query = DB::table('rider_reviews')->where('rider_id', $riderId);
        $this->applyEligibilityFilter($query);
        $this->applyDateRangeFilter($query, $days);

        return $this->aggregateSummaryFromQuery($query);
    }

    /**
     * Paginated published restaurant reviews for public/customer view.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listPublishedRestaurantReviews(int $restaurantId, array $filters = []): array
    {
        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 10)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $rating = isset($filters['rating']) && $filters['rating'] !== '' && $filters['rating'] !== 'all'
            ? (int) $filters['rating']
            : null;
        $days = isset($filters['days']) && is_numeric($filters['days']) && (int) $filters['days'] > 0
            ? (int) $filters['days']
            : null;

        $baseQuery = DB::table('reviews as rv')
            ->leftJoin('users as cu', 'cu.user_id', '=', 'rv.customer_id')
            ->leftJoin('orders as o', 'o.order_id', '=', 'rv.order_id')
            ->where('rv.restaurant_id', $restaurantId);

        $this->applyEligibilityFilter($baseQuery, 'rv');
        $this->applyDateRangeFilter($baseQuery, $days, 'rv');

        if ($rating !== null && $rating >= 1 && $rating <= 5) {
            $baseQuery->where('rv.rating', $rating);
        }

        $total = (int) (clone $baseQuery)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));

        $rows = $baseQuery
            ->select([
                'rv.review_id',
                'rv.restaurant_id',
                'rv.rating',
                'rv.comment',
                'rv.moderation_status',
                'rv.created_at',
                'cu.first_name as customer_first_name',
                'cu.last_name as customer_last_name',
                'o.order_reference',
            ])
            ->orderByDesc('rv.created_at')
            ->orderByDesc('rv.review_id')
            ->forPage($page, $perPage)
            ->get();

        return [
            'reviews' => $rows->map(fn (object $r): array => $this->formatPublicReviewRow($r, 'review_id'))->values()->all(),
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => $lastPage,
            ],
        ];
    }

    /**
     * Paginated published rider reviews.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listPublishedRiderReviews(int $riderId, array $filters = []): array
    {
        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 10)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $rating = isset($filters['rating']) && $filters['rating'] !== '' && $filters['rating'] !== 'all'
            ? (int) $filters['rating']
            : null;
        $days = isset($filters['days']) && is_numeric($filters['days']) && (int) $filters['days'] > 0
            ? (int) $filters['days']
            : null;

        $baseQuery = DB::table('rider_reviews as rv')
            ->leftJoin('users as cu', 'cu.user_id', '=', 'rv.customer_id')
            ->leftJoin('orders as o', 'o.order_id', '=', 'rv.order_id')
            ->where('rv.rider_id', $riderId);

        $this->applyEligibilityFilter($baseQuery, 'rv');
        $this->applyDateRangeFilter($baseQuery, $days, 'rv');

        if ($rating !== null && $rating >= 1 && $rating <= 5) {
            $baseQuery->where('rv.rating', $rating);
        }

        $total = (int) (clone $baseQuery)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));

        $rows = $baseQuery
            ->select([
                'rv.rider_review_id',
                'rv.rider_id',
                'rv.delivery_id',
                'rv.rating',
                'rv.comment',
                'rv.moderation_status',
                'rv.created_at',
                'cu.first_name as customer_first_name',
                'cu.last_name as customer_last_name',
                'o.order_reference',
            ])
            ->orderByDesc('rv.created_at')
            ->orderByDesc('rv.rider_review_id')
            ->forPage($page, $perPage)
            ->get();

        return [
            'reviews' => $rows->map(fn (object $r): array => $this->formatPublicReviewRow($r, 'rider_review_id'))->values()->all(),
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => $lastPage,
            ],
        ];
    }

    private function applyDateRangeFilter(Builder $query, ?int $days, string $alias = ''): void
    {
        if ($days !== null && $days > 0) {
            $prefix = $alias !== '' ? "{$alias}." : '';
            $query->where("{$prefix}created_at", '>=', now()->subDays($days));
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function aggregateSummaryFromQuery(Builder $query): array
    {
        $rows = $query
            ->selectRaw('rating, COUNT(*) as cnt')
            ->groupBy('rating')
            ->get();

        $distribution = [5 => 0, 4 => 0, 3 => 0, 2 => 0, 1 => 0];
        $totalCount = 0;
        $weightedSum = 0;

        foreach ($rows as $row) {
            $stars = (int) $row->rating;
            $count = (int) $row->cnt;
            if ($stars >= 1 && $stars <= 5) {
                $distribution[$stars] = $count;
                $totalCount += $count;
                $weightedSum += $stars * $count;
            }
        }

        return [
            'average_rating' => $totalCount > 0 ? round($weightedSum / $totalCount, 2) : null,
            'total_count' => $totalCount,
            'distribution' => $distribution,
        ];
    }

    /**
     * Privacy-safe customer display name (First Name + Last Initial) for public/partner views.
     *
     * @return array<string, mixed>
     */
    private function formatPublicReviewRow(object $row, string $idColumn): array
    {
        $first = trim((string) ($row->customer_first_name ?? ''));
        $last = trim((string) ($row->customer_last_name ?? ''));
        $displayName = $first !== ''
            ? ($last !== '' ? "{$first} ".mb_strtoupper(mb_substr($last, 0, 1)).'.' : $first)
            : 'Verified Customer';

        return [
            $idColumn => (int) $row->{$idColumn},
            'customer_name' => $displayName,
            'order_reference' => $row->order_reference ?? null,
            'rating' => (int) $row->rating,
            'comment' => $row->comment,
            'created_at' => $row->created_at,
        ];
    }
}
