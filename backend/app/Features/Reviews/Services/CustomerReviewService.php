<?php

namespace App\Features\Reviews\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;

class CustomerReviewService
{
    /**
     * Order statuses that indicate a customer has received/completed their order.
     */
    private const ELIGIBLE_ORDER_STATUSES = ['delivered', 'completed'];

    public function __construct(
        private readonly ReviewAggregationService $aggregationService,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * Return review eligibility and any existing restaurant/rider reviews for an order owned by the customer.
     *
     * @return array<string, mixed>
     */
    public function getOrderReviewStatus(User $customer, int $orderId): array
    {
        $order = $this->findOwnedOrderOrFail($customer, $orderId);
        $delivery = DB::table('deliveries as d')
            ->leftJoin('riders as rd', 'rd.rider_id', '=', 'd.rider_id')
            ->leftJoin('users as ru', 'ru.user_id', '=', 'rd.user_id')
            ->where('d.order_id', $orderId)
            ->select([
                'd.delivery_id',
                'd.rider_id',
                'd.delivery_status',
                'ru.first_name as rider_first_name',
            ])
            ->first();

        $existingRestaurantReview = DB::table('reviews')
            ->where('order_id', $orderId)
            ->first();

        $existingRiderReview = $delivery
            ? DB::table('rider_reviews')->where('delivery_id', $delivery->delivery_id)->first()
            : null;

        $orderEligible = in_array($order->order_status, self::ELIGIBLE_ORDER_STATUSES, true);
        $deliveryEligible = $order->order_type === 'delivery'
            && $delivery !== null
            && $delivery->rider_id !== null
            && $delivery->delivery_status === 'delivered';

        return [
            'order_id' => (int) $order->order_id,
            'order_reference' => $order->order_reference,
            'restaurant_id' => (int) $order->restaurant_id,
            'restaurant_name' => $order->restaurant_name,
            'order_type' => $order->order_type,
            'order_status' => $order->order_status,
            'rider' => $delivery && $delivery->rider_id ? [
                'rider_id' => (int) $delivery->rider_id,
                'first_name' => $delivery->rider_first_name,
            ] : null,
            'can_review_restaurant' => $orderEligible && $existingRestaurantReview === null,
            'can_review_rider' => $deliveryEligible && $existingRiderReview === null,
            'restaurant_review' => $existingRestaurantReview ? $this->formatCustomerReview($existingRestaurantReview, 'review_id') : null,
            'rider_review' => $existingRiderReview ? $this->formatCustomerReview($existingRiderReview, 'rider_review_id') : null,
        ];
    }

    /**
     * Submit an independent restaurant review for an eligible completed/delivered order.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function submitRestaurantReview(User $customer, int $orderId, array $data): array
    {
        $rating = (int) ($data['rating'] ?? 0);
        $comment = isset($data['comment']) && trim((string) $data['comment']) !== ''
            ? trim((string) $data['comment'])
            : null;

        try {
            $review = DB::transaction(function () use ($customer, $orderId, $rating, $comment): object {
                $order = DB::table('orders')
                    ->where('order_id', $orderId)
                    ->where('customer_id', $customer->user_id)
                    ->lockForUpdate()
                    ->first();

                if (! $order) {
                    throw new NotFoundHttpException('Order not found.');
                }

                if (! in_array($order->order_status, self::ELIGIBLE_ORDER_STATUSES, true)) {
                    throw new UnprocessableEntityHttpException('Only delivered or completed orders can be reviewed.');
                }

                $alreadyExists = DB::table('reviews')
                    ->where('order_id', $orderId)
                    ->exists();

                if ($alreadyExists) {
                    throw new ConflictHttpException('You have already submitted a restaurant review for this order.');
                }

                $now = now();
                $reviewId = (int) DB::table('reviews')->insertGetId([
                    'customer_id' => $customer->user_id,
                    'restaurant_id' => $order->restaurant_id,
                    'order_id' => $order->order_id,
                    'rating' => $rating,
                    'comment' => $comment,
                    'is_visible' => 1,
                    'moderation_status' => 'published',
                    'counts_toward_rating' => 1,
                    'moderation_action' => 'none',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                $this->notificationService->notifyUser(
                    userId: (int) $customer->user_id,
                    workspace: 'customer',
                    type: 'restaurant_review_submitted',
                    title: 'Restaurant review submitted',
                    body: "Thank you for rating {$order->restaurant_name} ({$rating}/5 stars).",
                    relatedEntityType: 'order',
                    relatedEntityId: (int) $order->order_id,
                );

                return DB::table('reviews')->where('review_id', $reviewId)->first();
            });
        } catch (QueryException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) === 1062) {
                throw new ConflictHttpException('You have already submitted a restaurant review for this order.');
            }
            throw $e;
        }

        $summary = $this->aggregationService->getRestaurantRatingSummary((int) $review->restaurant_id);

        return [
            'review' => $this->formatCustomerReview($review, 'review_id'),
            'rating_summary' => $summary,
        ];
    }

    /**
     * Submit an independent rider review for a completed delivery order.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function submitRiderReview(User $customer, int $orderId, array $data): array
    {
        $rating = (int) ($data['rating'] ?? 0);
        $comment = isset($data['comment']) && trim((string) $data['comment']) !== ''
            ? trim((string) $data['comment'])
            : null;

        try {
            $review = DB::transaction(function () use ($customer, $orderId, $rating, $comment): object {
                $order = DB::table('orders')
                    ->where('order_id', $orderId)
                    ->where('customer_id', $customer->user_id)
                    ->lockForUpdate()
                    ->first();

                if (! $order) {
                    throw new NotFoundHttpException('Order not found.');
                }

                if ($order->order_type !== 'delivery') {
                    throw new UnprocessableEntityHttpException('Rider reviews are only available for delivery orders.');
                }

                $delivery = DB::table('deliveries')
                    ->where('order_id', $orderId)
                    ->lockForUpdate()
                    ->first();

                if (! $delivery || ! $delivery->rider_id || $delivery->delivery_status !== 'delivered') {
                    throw new UnprocessableEntityHttpException('Only completed deliveries with an assigned rider can be reviewed.');
                }

                $alreadyExists = DB::table('rider_reviews')
                    ->where('delivery_id', $delivery->delivery_id)
                    ->orWhere('order_id', $orderId)
                    ->exists();

                if ($alreadyExists) {
                    throw new ConflictHttpException('You have already submitted a rider review for this delivery.');
                }

                $now = now();
                $riderReviewId = (int) DB::table('rider_reviews')->insertGetId([
                    'customer_id' => $customer->user_id,
                    'rider_id' => $delivery->rider_id,
                    'order_id' => $order->order_id,
                    'delivery_id' => $delivery->delivery_id,
                    'rating' => $rating,
                    'comment' => $comment,
                    'is_visible' => 1,
                    'moderation_status' => 'published',
                    'counts_toward_rating' => 1,
                    'moderation_action' => 'none',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                $this->notificationService->notifyUser(
                    userId: (int) $customer->user_id,
                    workspace: 'customer',
                    type: 'rider_review_submitted',
                    title: 'Rider review submitted',
                    body: "Thank you for rating your delivery rider ({$rating}/5 stars).",
                    relatedEntityType: 'order',
                    relatedEntityId: (int) $order->order_id,
                );

                return DB::table('rider_reviews')->where('rider_review_id', $riderReviewId)->first();
            });
        } catch (QueryException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) === 1062) {
                throw new ConflictHttpException('You have already submitted a rider review for this delivery.');
            }
            throw $e;
        }

        $summary = $this->aggregationService->getRiderRatingSummary((int) $review->rider_id);

        return [
            'review' => $this->formatCustomerReview($review, 'rider_review_id'),
            'rating_summary' => $summary,
        ];
    }

    private function findOwnedOrderOrFail(User $customer, int $orderId): object
    {
        $order = DB::table('orders')
            ->where('order_id', $orderId)
            ->where('customer_id', $customer->user_id)
            ->first();

        if (! $order) {
            throw new NotFoundHttpException('Order not found.');
        }

        return $order;
    }

    /**
     * @return array<string, mixed>
     */
    private function formatCustomerReview(object $row, string $idKey): array
    {
        return [
            $idKey => (int) $row->{$idKey},
            'rating' => (int) $row->rating,
            'comment' => $row->comment,
            'moderation_status' => $row->moderation_status,
            'is_visible' => (bool) $row->is_visible,
            'created_at' => $row->created_at,
        ];
    }
}
