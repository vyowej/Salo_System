<?php

namespace App\Features\Orders\Services;

use App\Models\User;
use App\Support\FileStorageService;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class CustomerOrderService
{
    public function __construct(
        private readonly FileStorageService $fileStorageService,
    ) {}

    /**
     * Return paginated orders for the authenticated customer, newest first.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listOrders(User $user, array $filters = []): array
    {
        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 15)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $status = trim((string) ($filters['status'] ?? ''));

        $query = DB::table('orders as o')
            ->leftJoin('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->where('o.customer_id', $user->user_id)
            ->select([
                'o.order_id',
                'o.checkout_id',
                'o.restaurant_id',
                'o.restaurant_name',
                'o.order_reference',
                'o.order_type',
                'o.order_status',
                'o.subtotal_amount',
                'o.delivery_fee',
                'o.total_amount',
                'o.delivery_address_text',
                'o.placed_at',
                'r.logo_image',
            ]);

        if ($status !== '' && $status !== 'all') {
            $query->where('o.order_status', $status);
        }

        $paginator = $query
            ->orderByDesc('o.placed_at')
            ->orderByDesc('o.order_id')
            ->paginate($perPage, ['*'], 'page', $page);

        $rows = collect($paginator->items());
        $orderIds = $rows->pluck('order_id')->map(fn ($id) => (int) $id)->all();

        $itemCounts = $orderIds === []
            ? collect()
            : DB::table('order_items')
                ->whereIn('order_id', $orderIds)
                ->selectRaw('order_id, COUNT(*) as line_count, SUM(quantity) as total_qty')
                ->groupBy('order_id')
                ->get()
                ->keyBy('order_id');

        $paymentsByOrder = $this->loadPaymentsByOrder($orderIds);

        $orders = $rows->map(function (object $row) use ($itemCounts, $paymentsByOrder): array {
            $orderId = (int) $row->order_id;
            $counts = $itemCounts->get($orderId);
            $payment = $paymentsByOrder->get($orderId);

            return [
                'order_id' => $orderId,
                'checkout_id' => (int) $row->checkout_id,
                'order_reference' => $row->order_reference,
                'restaurant_id' => (int) $row->restaurant_id,
                'restaurant_name' => $row->restaurant_name,
                'restaurant_logo_url' => $this->fileStorageService->publicUrl($row->logo_image),
                'fulfillment' => $row->order_type,
                'order_status' => $row->order_status,
                'subtotal_amount' => (float) $row->subtotal_amount,
                'delivery_fee' => (float) $row->delivery_fee,
                'total_amount' => (float) $row->total_amount,
                'delivery_address_text' => $row->delivery_address_text,
                'items_count' => (int) ($counts->line_count ?? 0),
                'total_quantity' => (int) ($counts->total_qty ?? 0),
                'payment_method' => $payment?->payment_method === 'cash' ? 'cod' : ($payment?->payment_method ?? 'cod'),
                'payment_status' => $payment?->payment_status ?? 'pending',
                'placed_at' => $row->placed_at,
            ];
        })->all();

        return [
            'orders' => $orders,
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ];
    }

    /**
     * Return full order detail for the authenticated customer.
     * Returns 404 if the order does not exist or belongs to another customer.
     *
     * @return array<string, mixed>
     */
    public function getOrderDetail(User $user, int $orderId): array
    {
        $row = DB::table('orders as o')
            ->leftJoin('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->where('o.order_id', $orderId)
            ->where('o.customer_id', $user->user_id)
            ->select([
                'o.*',
                'r.logo_image',
            ])
            ->first();

        if (! $row) {
            throw new NotFoundHttpException('Order not found.');
        }

        $items = DB::table('order_items')
            ->where('order_id', $orderId)
            ->orderBy('order_item_id')
            ->get([
                'order_item_id',
                'menu_item_id',
                'item_name',
                'unit_price',
                'quantity',
                'line_total',
            ])
            ->map(fn ($item) => [
                'order_item_id' => (int) $item->order_item_id,
                'menu_item_id' => $item->menu_item_id !== null ? (int) $item->menu_item_id : null,
                'item_name' => $item->item_name,
                'unit_price' => (float) $item->unit_price,
                'quantity' => (int) $item->quantity,
                'line_total' => (float) $item->line_total,
            ])
            ->values()
            ->all();

        $payment = $this->loadPaymentsByOrder([$orderId])->get($orderId);

        return [
            'order_id' => (int) $row->order_id,
            'checkout_id' => (int) $row->checkout_id,
            'order_reference' => $row->order_reference,
            'restaurant_id' => (int) $row->restaurant_id,
            'restaurant_name' => $row->restaurant_name,
            'restaurant_logo_url' => $this->fileStorageService->publicUrl($row->logo_image),
            'customer_name' => $row->customer_name,
            'fulfillment' => $row->order_type,
            'order_status' => $row->order_status,
            'subtotal_amount' => (float) $row->subtotal_amount,
            'delivery_fee' => (float) $row->delivery_fee,
            'total_amount' => (float) $row->total_amount,
            'delivery_address' => $row->order_type === 'delivery' ? [
                'address_id' => $row->delivery_address_id !== null ? (int) $row->delivery_address_id : null,
                'recipient_name' => $row->delivery_recipient_name,
                'phone' => $row->delivery_phone,
                'address_text' => $row->delivery_address_text,
                'latitude' => $row->delivery_latitude !== null ? (float) $row->delivery_latitude : null,
                'longitude' => $row->delivery_longitude !== null ? (float) $row->delivery_longitude : null,
                'notes' => $row->delivery_notes,
            ] : null,
            'payment' => [
                'payment_id' => $payment ? (int) $payment->payment_id : null,
                'payment_reference' => $payment?->payment_reference,
                'method' => $payment?->payment_method === 'cash' ? 'cod' : ($payment?->payment_method ?? 'cod'),
                'status' => $payment?->payment_status ?? 'pending',
                'amount' => $payment ? (float) $payment->amount : (float) $row->total_amount,
            ],
            'items' => $items,
            'placed_at' => $row->placed_at,
        ];
    }

    /**
     * @param  array<int, int>  $orderIds
     */
    private function loadPaymentsByOrder(array $orderIds)
    {
        if ($orderIds === []) {
            return collect();
        }

        return DB::table('payment_allocations as pa')
            ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
            ->whereIn('pa.order_id', $orderIds)
            ->where('pa.allocation_type', 'order_payment')
            ->select([
                'pa.order_id',
                'p.payment_id',
                'p.payment_reference',
                'p.payment_method',
                'p.payment_status',
                'p.amount',
            ])
            ->get()
            ->keyBy('order_id');
    }
}
