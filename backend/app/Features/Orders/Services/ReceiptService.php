<?php

namespace App\Features\Orders\Services;

use App\Features\Orders\Support\OrderPaymentSnapshotLoader;
use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Models\User;
use App\Support\AddressFormatter;
use App\Support\RestaurantBranchService;
use App\Support\WorkspaceAccessResolver;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ReceiptService
{
    public function __construct(
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function getCustomerReceipt(User $user, int $orderId): array
    {
        $row = DB::table('orders as o')
            ->leftJoin('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->leftJoin('deliveries as d', 'd.order_id', '=', 'o.order_id')
            ->leftJoin('riders as rd', 'rd.rider_id', '=', 'd.rider_id')
            ->leftJoin('users as ru', 'ru.user_id', '=', 'rd.user_id')
            ->where('o.order_id', $orderId)
            ->where('o.customer_id', $user->user_id)
            ->whereNull('o.reservation_id')
            ->select([
                'o.*',
                'r.restaurant_name as live_restaurant_name',
                'r.branch_name as live_branch_name',
                'd.delivery_status',
                'd.delivered_at',
                'ru.first_name as rider_first_name',
            ])
            ->first();

        if (! $row) {
            throw new NotFoundHttpException('Order not found.');
        }

        $this->assertFinalizedForReceipt($row);

        $items = $this->loadSnapshotItems($orderId);
        $payment = OrderPaymentSnapshotLoader::loadByOrderIds([$orderId])->get($orderId);
        [$method, $status, $statusLabel] = $this->formatPaymentMeta($payment);

        $siblingOrders = [];
        if (! empty($row->checkout_id)) {
            $siblingOrders = DB::table('orders as so')
                ->leftJoin('restaurants as sr', 'sr.restaurant_id', '=', 'so.restaurant_id')
                ->where('so.checkout_id', $row->checkout_id)
                ->where('so.customer_id', $user->user_id)
                ->where('so.order_id', '!=', $orderId)
                ->orderBy('so.order_id')
                ->get([
                    'so.order_id',
                    'so.order_reference',
                    'so.order_type',
                    'so.order_status',
                    'so.restaurant_name',
                    'sr.restaurant_name as live_restaurant_name',
                    'sr.branch_name as live_branch_name',
                ])
                ->map(fn ($s) => [
                    'order_id' => (int) $s->order_id,
                    'order_reference' => $s->order_reference,
                    'restaurant_name' => $s->live_restaurant_name
                        ? RestaurantBranchService::formatDisplayName((string) $s->live_restaurant_name, $s->live_branch_name ?? null)
                        : $s->restaurant_name,
                    'order_status' => $s->order_status,
                    'has_receipt' => $this->isOrderFinalized($s->order_type, $s->order_status),
                ])
                ->values()
                ->all();
        }

        $restaurantName = $row->live_restaurant_name
            ? RestaurantBranchService::formatDisplayName((string) $row->live_restaurant_name, $row->live_branch_name ?? null)
            : $row->restaurant_name;

        $finalizedRaw = $row->delivered_at ?? $row->completed_at ?? $row->updated_at;

        return [
            'role' => 'customer',
            'receipt_number' => 'RCP-'.$row->order_reference,
            'order_id' => (int) $row->order_id,
            'order_reference' => $row->order_reference,
            'restaurant_name' => $restaurantName,
            'order_type' => $row->order_type,
            'order_status' => $row->order_status,
            'placed_at' => OrderTimestampFormatter::toManilaIso($row->placed_at),
            'finalized_at' => OrderTimestampFormatter::toManilaIso($finalizedRaw),
            'delivery_address_text' => $row->order_type === 'delivery' ? $row->delivery_address_text : null,
            'rider_first_name' => $row->order_type === 'delivery' ? ($row->rider_first_name ?: null) : null,
            'items' => $items,
            'subtotal_amount' => (float) $row->subtotal_amount,
            'delivery_fee' => (float) $row->delivery_fee,
            'total_amount' => (float) $row->total_amount,
            'payment_method' => $method,
            'payment_status' => $status,
            'payment_status_label' => $statusLabel,
            'sibling_orders' => $siblingOrders,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function getRestaurantReceipt(User $user, int $orderId, ?int $restaurantId = null): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForOrders($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $row = DB::table('orders as o')
            ->leftJoin('deliveries as d', 'd.order_id', '=', 'o.order_id')
            ->where('o.order_id', $orderId)
            ->where('o.restaurant_id', $targetId)
            ->whereNull('o.reservation_id')
            ->select([
                'o.*',
                'd.delivery_status',
                'd.delivered_at',
                'd.cod_remittance_status',
            ])
            ->first();

        if (! $row) {
            throw new NotFoundHttpException('Order not found.');
        }

        $this->assertFinalizedForReceipt($row);

        $items = $this->loadSnapshotItems($orderId);
        $payment = OrderPaymentSnapshotLoader::loadByOrderIds([$orderId])->get($orderId);
        [$method, $status, $statusLabel] = $this->formatPaymentMeta($payment);

        $restaurantName = RestaurantBranchService::formatDisplayName(
            (string) ($restaurant->restaurant_name ?? $row->restaurant_name),
            $restaurant->branch_name ?? null,
        );
        $finalizedRaw = $row->delivered_at ?? $row->completed_at ?? $row->updated_at;

        return [
            'role' => 'restaurant',
            'receipt_number' => 'RCP-'.$row->order_reference,
            'order_id' => (int) $row->order_id,
            'order_reference' => $row->order_reference,
            'restaurant_name' => $restaurantName,
            'customer_name' => $row->customer_name,
            'order_type' => $row->order_type,
            'order_status' => $row->order_status,
            'placed_at' => OrderTimestampFormatter::toManilaIso($row->placed_at),
            'finalized_at' => OrderTimestampFormatter::toManilaIso($finalizedRaw),
            'items' => $items,
            'subtotal_amount' => (float) $row->subtotal_amount,
            'delivery_fee' => (float) $row->delivery_fee,
            'total_amount' => (float) $row->total_amount,
            'payment_method' => $method,
            'payment_status' => $status,
            'payment_status_label' => $statusLabel,
            'cod_remittance_status' => $method === 'cod' ? ($row->cod_remittance_status ?? null) : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function getRiderReceipt(User $user, int $orderId): array
    {
        $rider = DB::table('riders')
            ->where('user_id', $user->user_id)
            ->where('rider_status', 'active')
            ->first();

        abort_unless($rider !== null, 403, 'Forbidden: active rider account required.');

        $row = DB::table('deliveries as d')
            ->join('orders as o', 'o.order_id', '=', 'd.order_id')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->leftJoin('addresses as ra', 'ra.address_id', '=', 'r.address_id')
            ->leftJoin('barangays as rb', 'rb.barangay_id', '=', 'ra.barangay_id')
            ->leftJoin('cities as rc', 'rc.city_id', '=', 'rb.city_id')
            ->leftJoin('provinces as rp', 'rp.province_id', '=', 'rc.province_id')
            ->where('d.order_id', $orderId)
            ->where('d.rider_id', $rider->rider_id)
            ->select([
                'd.delivery_id',
                'd.delivery_status',
                'd.delivered_at',
                'd.rider_compensation',
                'd.cod_amount_collected',
                'd.cod_remittance_status',
                'o.order_id',
                'o.order_reference',
                'o.order_type',
                'o.order_status',
                'o.delivery_address_text',
                'o.delivery_fee',
                'o.total_amount',
                'o.placed_at',
                'r.restaurant_name',
                'r.branch_name',
                'ra.street as pickup_street',
                'rb.barangay_name as pickup_barangay',
                'rc.city_name as pickup_city',
                'rp.province_name as pickup_province',
            ])
            ->first();

        if (! $row) {
            throw new NotFoundHttpException('Delivery not found.');
        }

        if ($row->delivery_status !== 'delivered') {
            throw new ConflictHttpException('Receipt is only available after the delivery is marked delivered.');
        }

        $payment = OrderPaymentSnapshotLoader::loadByOrderIds([$orderId])->get($orderId);
        [$method, $status, $statusLabel] = $this->formatPaymentMeta($payment);

        $restaurantName = RestaurantBranchService::formatDisplayName((string) $row->restaurant_name, $row->branch_name ?? null);
        $pickupAddressText = AddressFormatter::format([
            'street' => $row->pickup_street ?? null,
            'barangay' => $row->pickup_barangay ?? null,
            'city' => $row->pickup_city ?? null,
            'province' => $row->pickup_province ?? null,
        ]) ?: $restaurantName;

        return [
            'role' => 'rider',
            'receipt_number' => 'RCP-'.$row->order_reference,
            'order_id' => (int) $row->order_id,
            'order_reference' => $row->order_reference,
            'restaurant_name' => $restaurantName,
            'pickup_address_text' => $pickupAddressText,
            'dropoff_address_text' => $row->delivery_address_text,
            'order_type' => $row->order_type,
            'order_status' => $row->order_status,
            'delivery_status' => $row->delivery_status,
            'placed_at' => OrderTimestampFormatter::toManilaIso($row->placed_at),
            'finalized_at' => OrderTimestampFormatter::toManilaIso($row->delivered_at),
            'delivery_fee' => (float) $row->delivery_fee,
            'total_amount' => (float) $row->total_amount,
            'payment_method' => $method,
            'payment_status' => $status,
            'payment_status_label' => $statusLabel,
            'cod_amount_collected' => $method === 'cod' && $row->cod_amount_collected !== null
                ? (float) $row->cod_amount_collected
                : null,
            'cod_remittance_status' => $method === 'cod' ? ($row->cod_remittance_status ?? null) : null,
        ];
    }

    private function isOrderFinalized(?string $orderType, ?string $orderStatus): bool
    {
        $type = (string) $orderType;
        $status = (string) $orderStatus;

        if ($type === 'delivery') {
            return $status === 'delivered';
        }

        return $status === 'completed';
    }

    private function assertFinalizedForReceipt(object $row): void
    {
        if (! $this->isOrderFinalized($row->order_type ?? null, $row->order_status ?? null)) {
            throw new ConflictHttpException('Receipt is only available after the order is delivered or completed.');
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function loadSnapshotItems(int $orderId): array
    {
        $rawItems = DB::table('order_items')
            ->where('order_id', $orderId)
            ->orderBy('order_item_id')
            ->get(['order_item_id', 'item_name', 'unit_price', 'quantity', 'line_total']);

        $itemIds = $rawItems->pluck('order_item_id')->map(fn ($id) => (int) $id)->all();
        $addOnsByItem = $itemIds === []
            ? collect()
            : DB::table('order_item_add_ons')
                ->whereIn('order_item_id', $itemIds)
                ->orderBy('order_item_add_on_id')
                ->get(['order_item_id', 'group_name', 'option_name', 'additional_price'])
                ->groupBy('order_item_id');

        return $rawItems->map(fn ($it) => [
            'order_item_id' => (int) $it->order_item_id,
            'item_name' => $it->item_name,
            'unit_price' => (float) $it->unit_price,
            'quantity' => (int) $it->quantity,
            'line_total' => (float) $it->line_total,
            'add_ons' => $addOnsByItem->get($it->order_item_id, collect())
                ->map(fn ($ao) => [
                    'group_name' => $ao->group_name,
                    'option_name' => $ao->option_name,
                    'additional_price' => (float) $ao->additional_price,
                ])
                ->values()
                ->all(),
        ])->values()->all();
    }

    /**
     * @return array{0: string, 1: string, 2: string}
     */
    private function formatPaymentMeta(?object $payment): array
    {
        $rawMethod = $payment?->payment_method ?? 'cash';
        $method = $rawMethod === 'cash' ? 'cod' : (string) $rawMethod;
        $status = (string) ($payment?->payment_status ?? 'pending');

        if ($method === 'cod') {
            $label = $status === 'paid' ? 'Paid in cash' : 'Cash on Delivery (Pending)';
        } elseif ($status === 'paid') {
            $label = 'Paid';
        } else {
            $label = ucfirst(str_replace('_', ' ', $status));
        }

        return [$method, $status, $label];
    }
}
