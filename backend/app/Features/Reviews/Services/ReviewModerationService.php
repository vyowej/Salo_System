<?php

namespace App\Features\Reviews\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\SqlLike;
use App\Support\WorkspaceAccessResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;

class ReviewModerationService
{
    public function __construct(
        private readonly WorkspaceAccessResolver $accessResolver,
        private readonly ReviewAggregationService $aggregationService,
        private readonly PlatformSettingsService $settingsService,
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * Restaurant owner or authorized staff: list reviews & rating summary for their restaurant.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listRestaurantFeedback(User $user, array $filters = []): array
    {
        $requestedRestaurantId = isset($filters['restaurant_id']) ? (int) $filters['restaurant_id'] : null;
        $restaurant = $this->accessResolver->requireActiveAuthorizedRestaurantForOrders($user, $requestedRestaurantId);
        $restaurantId = (int) $restaurant->restaurant_id;

        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 15)));
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

        if ($days !== null) {
            $baseQuery->where('rv.created_at', '>=', now()->subDays($days));
        }
        if ($rating !== null && $rating >= 1 && $rating <= 5) {
            $baseQuery->where('rv.rating', $rating);
        }

        $total = (int) (clone $baseQuery)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));

        $rows = $baseQuery
            ->select([
                'rv.review_id',
                'rv.restaurant_id',
                'rv.order_id',
                'rv.rating',
                'rv.comment',
                'rv.is_visible',
                'rv.moderation_status',
                'rv.counts_toward_rating',
                'rv.flagged_at',
                'rv.flag_reason',
                'rv.moderation_reason',
                'rv.created_at',
                'cu.first_name as customer_first_name',
                'cu.last_name as customer_last_name',
                'o.order_reference',
            ])
            ->orderByDesc('rv.created_at')
            ->orderByDesc('rv.review_id')
            ->forPage($page, $perPage)
            ->get();

        $summary = $this->aggregationService->getRestaurantRatingSummary($restaurantId, $days);

        $featured = DB::table('featured_restaurant_weeks')
            ->where('restaurant_id', $restaurantId)
            ->where('selection_status', 'active')
            ->orderByDesc('feature_start_date')
            ->first(['featured_week_id', 'feature_start_date', 'feature_end_date', 'bayesian_score']);

        return [
            'restaurant' => [
                'restaurant_id' => $restaurantId,
                'restaurant_name' => $restaurant->restaurant_name,
            ],
            'featured_week' => $featured ? [
                'featured_week_id' => (int) $featured->featured_week_id,
                'feature_start_date' => $featured->feature_start_date,
                'feature_end_date' => $featured->feature_end_date,
                'bayesian_score' => (float) $featured->bayesian_score,
            ] : null,
            'rating_summary' => $summary,
            'reviews' => $rows->map(function (object $row): array {
                $first = trim((string) ($row->customer_first_name ?? ''));
                $last = trim((string) ($row->customer_last_name ?? ''));
                $customerName = $first !== ''
                    ? ($last !== '' ? "{$first} ".mb_strtoupper(mb_substr($last, 0, 1)).'.' : $first)
                    : 'Verified Customer';

                return [
                    'review_id' => (int) $row->review_id,
                    'restaurant_id' => (int) $row->restaurant_id,
                    'order_reference' => $row->order_reference,
                    'customer_name' => $customerName,
                    'rating' => (int) $row->rating,
                    'comment' => $row->comment,
                    'is_visible' => (bool) $row->is_visible,
                    'moderation_status' => $row->moderation_status,
                    'counts_toward_rating' => (bool) $row->counts_toward_rating,
                    'flagged_at' => $row->flagged_at,
                    'flag_reason' => $row->flag_reason,
                    'moderation_reason' => $row->moderation_reason,
                    'created_at' => $row->created_at,
                ];
            })->values()->all(),
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => $lastPage,
            ],
        ];
    }

    /**
     * Authorized restaurant owner/staff flags a review for admin moderation.
     *
     * @return array<string, mixed>
     */
    public function flagRestaurantReview(User $user, int $reviewId, string $reason, ?Request $request = null): array
    {
        $trimmedReason = trim($reason);
        if ($trimmedReason === '') {
            throw new UnprocessableEntityHttpException('A flag reason is required.');
        }

        $review = DB::table('reviews')->where('review_id', $reviewId)->first();
        if (! $review) {
            throw new NotFoundHttpException('Review not found.');
        }

        $this->accessResolver->requireActiveAuthorizedRestaurantForOrders($user, (int) $review->restaurant_id);

        if ($review->moderation_status !== 'published') {
            throw new ConflictHttpException("Only published reviews can be flagged (current status: {$review->moderation_status}).");
        }

        $flaggedCounts = $this->settingsService->flaggedCountsTowardRating();
        $now = now();

        DB::transaction(function () use ($review, $user, $trimmedReason, $flaggedCounts, $now, $request): void {
            $updated = DB::table('reviews')
                ->where('review_id', $review->review_id)
                ->where('moderation_status', 'published')
                ->update([
                    'moderation_status' => 'flagged',
                    'counts_toward_rating' => $flaggedCounts ? 1 : 0,
                    'flagged_at' => $now,
                    'flagged_by' => $user->user_id,
                    'flag_reason' => mb_substr($trimmedReason, 0, 255),
                    'moderation_action' => 'flagged',
                    'updated_at' => $now,
                ]);

            if ($updated === 0) {
                throw new ConflictHttpException('Review could not be flagged because its status changed.');
            }

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'review.flagged',
                entityType: 'restaurant_review',
                entityId: (string) $review->review_id,
                oldValues: ['moderation_status' => 'published', 'counts_toward_rating' => (int) $review->counts_toward_rating],
                newValues: ['moderation_status' => 'flagged', 'counts_toward_rating' => $flaggedCounts ? 1 : 0],
                reason: $trimmedReason,
                request: $request,
            );
        });

        $updatedReview = DB::table('reviews')->where('review_id', $reviewId)->first();

        return [
            'review' => [
                'review_id' => (int) $updatedReview->review_id,
                'moderation_status' => $updatedReview->moderation_status,
                'counts_toward_rating' => (bool) $updatedReview->counts_toward_rating,
                'flagged_at' => $updatedReview->flagged_at,
                'flag_reason' => $updatedReview->flag_reason,
            ],
            'rating_summary' => $this->aggregationService->getRestaurantRatingSummary((int) $review->restaurant_id),
        ];
    }

    /**
     * Authenticated rider views only their own rating summary and published delivery reviews.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listMyRiderFeedback(User $user, array $filters = []): array
    {
        $rider = $this->accessResolver->requireActiveRider($user);
        $riderId = (int) $rider->rider_id;
        $days = isset($filters['days']) && is_numeric($filters['days']) && (int) $filters['days'] > 0
            ? (int) $filters['days']
            : null;

        $summary = $this->aggregationService->getRiderRatingSummary($riderId, $days);
        $list = $this->aggregationService->listPublishedRiderReviews($riderId, $filters);

        return [
            'rider_id' => $riderId,
            'rating_summary' => $summary,
            'reviews' => $list['reviews'],
            'pagination' => $list['pagination'],
        ];
    }

    /**
     * Admin: list restaurant or rider reviews with search, status, rating, and date filters.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listAdminReviews(array $filters = []): array
    {
        $type = ($filters['type'] ?? 'restaurant') === 'rider' ? 'rider' : 'restaurant';
        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 15)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $status = trim((string) ($filters['status'] ?? 'all'));
        $rating = isset($filters['rating']) && $filters['rating'] !== '' && $filters['rating'] !== 'all'
            ? (int) $filters['rating']
            : null;
        $days = isset($filters['days']) && is_numeric($filters['days']) && (int) $filters['days'] > 0
            ? (int) $filters['days']
            : null;
        $search = trim((string) ($filters['search'] ?? ''));

        if ($type === 'restaurant') {
            $query = DB::table('reviews as rv')
                ->join('restaurants as r', 'r.restaurant_id', '=', 'rv.restaurant_id')
                ->join('users as cu', 'cu.user_id', '=', 'rv.customer_id')
                ->leftJoin('orders as o', 'o.order_id', '=', 'rv.order_id')
                ->select([
                    'rv.review_id as id',
                    'rv.restaurant_id as target_id',
                    'r.restaurant_name as target_name',
                    'rv.order_id',
                    'o.order_reference',
                    'rv.customer_id',
                    DB::raw("CONCAT(cu.first_name, ' ', cu.last_name) as customer_name"),
                    'rv.rating',
                    'rv.comment',
                    'rv.is_visible',
                    'rv.moderation_status',
                    'rv.counts_toward_rating',
                    'rv.flagged_at',
                    'rv.flag_reason',
                    'rv.moderated_by',
                    'rv.moderated_at',
                    'rv.moderation_action',
                    'rv.moderation_reason',
                    'rv.created_at',
                ]);
        } else {
            $query = DB::table('rider_reviews as rv')
                ->join('riders as rd', 'rd.rider_id', '=', 'rv.rider_id')
                ->join('users as ru', 'ru.user_id', '=', 'rd.user_id')
                ->join('users as cu', 'cu.user_id', '=', 'rv.customer_id')
                ->leftJoin('orders as o', 'o.order_id', '=', 'rv.order_id')
                ->select([
                    'rv.rider_review_id as id',
                    'rv.rider_id as target_id',
                    DB::raw("CONCAT(ru.first_name, ' ', ru.last_name) as target_name"),
                    'rv.order_id',
                    'rv.delivery_id',
                    'o.order_reference',
                    'rv.customer_id',
                    DB::raw("CONCAT(cu.first_name, ' ', cu.last_name) as customer_name"),
                    'rv.rating',
                    'rv.comment',
                    'rv.is_visible',
                    'rv.moderation_status',
                    'rv.counts_toward_rating',
                    'rv.flagged_at',
                    'rv.flag_reason',
                    'rv.moderated_by',
                    'rv.moderated_at',
                    'rv.moderation_action',
                    'rv.moderation_reason',
                    'rv.created_at',
                ]);
        }

        if ($status !== '' && $status !== 'all') {
            $query->where('rv.moderation_status', $status);
        }
        if ($rating !== null && $rating >= 1 && $rating <= 5) {
            $query->where('rv.rating', $rating);
        }
        if ($days !== null) {
            $query->where('rv.created_at', '>=', now()->subDays($days));
        }
        if ($search !== '') {
            $like = SqlLike::contains($search);
            $query->where(function ($q) use ($like, $type): void {
                $q->where('rv.comment', 'LIKE', $like)
                    ->orWhere('o.order_reference', 'LIKE', $like)
                    ->orWhere('cu.first_name', 'LIKE', $like)
                    ->orWhere('cu.last_name', 'LIKE', $like);
                if ($type === 'restaurant') {
                    $q->orWhere('r.restaurant_name', 'LIKE', $like);
                } else {
                    $q->orWhere('ru.first_name', 'LIKE', $like)
                        ->orWhere('ru.last_name', 'LIKE', $like);
                }
            });
        }

        $total = (int) (clone $query)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));

        $rows = $query
            ->orderByRaw("CASE WHEN rv.moderation_status = 'flagged' THEN 0 ELSE 1 END")
            ->orderByDesc('rv.created_at')
            ->forPage($page, $perPage)
            ->get();

        $flaggedRestaurant = (int) DB::table('reviews')->where('moderation_status', 'flagged')->count();
        $flaggedRider = (int) DB::table('rider_reviews')->where('moderation_status', 'flagged')->count();
        $publishedRestaurant = (int) DB::table('reviews')->where('moderation_status', 'published')->count();
        $publishedRider = (int) DB::table('rider_reviews')->where('moderation_status', 'published')->count();

        return [
            'type' => $type,
            'counts' => [
                'flagged_total' => $flaggedRestaurant + $flaggedRider,
                'flagged_restaurant' => $flaggedRestaurant,
                'flagged_rider' => $flaggedRider,
                'published_restaurant' => $publishedRestaurant,
                'published_rider' => $publishedRider,
            ],
            'items' => $rows->map(fn (object $r): array => [
                'id' => (int) $r->id,
                'type' => $type,
                'target_id' => (int) $r->target_id,
                'target_name' => $r->target_name,
                'order_id' => $r->order_id ? (int) $r->order_id : null,
                'delivery_id' => property_exists($r, 'delivery_id') && $r->delivery_id ? (int) $r->delivery_id : null,
                'order_reference' => $r->order_reference,
                'customer_id' => (int) $r->customer_id,
                'customer_name' => $r->customer_name,
                'rating' => (int) $r->rating,
                'comment' => $r->comment,
                'is_visible' => (bool) $r->is_visible,
                'moderation_status' => $r->moderation_status,
                'counts_toward_rating' => (bool) $r->counts_toward_rating,
                'flagged_at' => $r->flagged_at,
                'flag_reason' => $r->flag_reason,
                'moderated_by' => $r->moderated_by ? (int) $r->moderated_by : null,
                'moderated_at' => $r->moderated_at,
                'moderation_action' => $r->moderation_action,
                'moderation_reason' => $r->moderation_reason,
                'created_at' => $r->created_at,
            ])->values()->all(),
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => $lastPage,
            ],
        ];
    }

    /**
     * Admin: moderate a restaurant or rider review (approve/restore, hide, remove).
     *
     * @return array<string, mixed>
     */
    public function moderateReview(
        User $admin,
        string $type,
        int $reviewId,
        string $action,
        ?string $reason = null,
        ?Request $request = null,
    ): array {
        $normalizedType = $type === 'rider' ? 'rider' : 'restaurant';
        $table = $normalizedType === 'rider' ? 'rider_reviews' : 'reviews';
        $idCol = $normalizedType === 'rider' ? 'rider_review_id' : 'review_id';
        $entityType = $normalizedType === 'rider' ? 'rider_review' : 'restaurant_review';

        $cleanReason = trim((string) $reason);
        $normalizedAction = strtolower(trim($action));

        [$nextStatus, $isVisible, $countsTowardRating, $dbAction] = match ($normalizedAction) {
            'approve', 'restore', 'published' => ['published', 1, 1, 'restored'],
            'hide', 'hidden' => ['hidden', 0, 0, 'hidden'],
            'remove', 'removed' => ['removed', 0, 0, 'removed'],
            default => throw new UnprocessableEntityHttpException('Invalid moderation action.'),
        };

        if (in_array($nextStatus, ['hidden', 'removed'], true) && $cleanReason === '') {
            throw new UnprocessableEntityHttpException('A moderation reason is required when hiding or removing a review.');
        }

        $now = now();

        $updated = DB::transaction(function () use (
            $table,
            $idCol,
            $reviewId,
            $entityType,
            $admin,
            $nextStatus,
            $isVisible,
            $countsTowardRating,
            $dbAction,
            $cleanReason,
            $now,
            $request,
        ): object {
            $review = DB::table($table)->where($idCol, $reviewId)->lockForUpdate()->first();
            if (! $review) {
                throw new NotFoundHttpException('Review not found.');
            }

            if ($review->moderation_status === $nextStatus) {
                throw new ConflictHttpException("Review is already in '{$nextStatus}' status.");
            }

            $storedReason = $cleanReason !== ''
                ? mb_substr($cleanReason, 0, 500)
                : 'Approved / restored by administrator.';

            DB::table($table)->where($idCol, $reviewId)->update([
                'moderation_status' => $nextStatus,
                'is_visible' => $isVisible,
                'counts_toward_rating' => $countsTowardRating,
                'moderated_by' => $admin->user_id,
                'moderated_at' => $now,
                'moderation_action' => $dbAction,
                'moderation_reason' => $storedReason,
                'updated_at' => $now,
            ]);

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: "review.{$dbAction}",
                entityType: $entityType,
                entityId: (string) $reviewId,
                oldValues: [
                    'moderation_status' => $review->moderation_status,
                    'is_visible' => (int) $review->is_visible,
                    'counts_toward_rating' => (int) $review->counts_toward_rating,
                ],
                newValues: [
                    'moderation_status' => $nextStatus,
                    'is_visible' => $isVisible,
                    'counts_toward_rating' => $countsTowardRating,
                ],
                reason: $storedReason,
                request: $request,
            );

            $this->notificationService->notifyUser(
                userId: (int) $review->customer_id,
                workspace: 'customer',
                type: "review_{$dbAction}",
                title: $nextStatus === 'published' ? 'Your review is live' : 'Review moderation update',
                body: $nextStatus === 'published'
                    ? 'Your review has been approved and is visible on SALO.'
                    : "Your review was {$nextStatus} by moderation. Reason: {$storedReason}",
                relatedEntityType: $entityType,
                relatedEntityId: $reviewId,
            );

            return DB::table($table)->where($idCol, $reviewId)->first();
        });

        return [
            'id' => (int) $updated->{$idCol},
            'type' => $normalizedType,
            'moderation_status' => $updated->moderation_status,
            'is_visible' => (bool) $updated->is_visible,
            'counts_toward_rating' => (bool) $updated->counts_toward_rating,
            'moderated_at' => $updated->moderated_at,
            'moderation_action' => $updated->moderation_action,
            'moderation_reason' => $updated->moderation_reason,
        ];
    }
}
