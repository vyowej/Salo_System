<?php

namespace App\Features\Restaurants\Services;

use App\Models\User;
use App\Support\WorkspaceAccessResolver;
use Illuminate\Support\Facades\DB;

class OwnerReportsService
{
    public function __construct(
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function salesReport(User $user, array $filters = [], ?int $restaurantId = null): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveOwnedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $from = isset($filters['from']) && trim((string) $filters['from']) !== ''
            ? date('Y-m-d 00:00:00', strtotime((string) $filters['from']))
            : now()->subDays(29)->startOfDay()->toDateTimeString();
        $to = isset($filters['to']) && trim((string) $filters['to']) !== ''
            ? date('Y-m-d 23:59:59', strtotime((string) $filters['to']))
            : now()->endOfDay()->toDateTimeString();

        $orders = DB::table('orders')
            ->where('restaurant_id', $targetId)
            ->whereBetween('placed_at', [$from, $to])
            ->get([
                'order_id',
                'order_status',
                'order_type',
                'subtotal_amount',
                'delivery_fee',
                'discount_amount',
                'total_amount',
                'placed_at',
            ]);

        $completedStatuses = ['delivered', 'completed'];
        $cancelledStatuses = ['cancelled', 'rejected', 'failed'];

        $ordersCount = $orders->count();
        $completedOrders = $orders->filter(static fn (object $o): bool => in_array($o->order_status, $completedStatuses, true));
        $cancelledCount = $orders->filter(static fn (object $o): bool => in_array($o->order_status, $cancelledStatuses, true))->count();

        $grossSales = 0.0;
        $discountTotal = 0.0;
        $netRevenue = 0.0;
        $dailyMap = [];
        $completedOrderIds = [];

        foreach ($completedOrders as $o) {
            $completedOrderIds[] = (int) $o->order_id;
            $gross = (float) $o->subtotal_amount + (float) $o->delivery_fee;
            $discount = (float) $o->discount_amount;
            $net = (float) $o->total_amount;

            $grossSales += $gross;
            $discountTotal += $discount;
            $netRevenue += $net;

            $day = substr((string) $o->placed_at, 0, 10);
            if (! isset($dailyMap[$day])) {
                $dailyMap[$day] = ['date' => $day, 'orders_count' => 0, 'net_revenue' => 0.0];
            }
            $dailyMap[$day]['orders_count']++;
            $dailyMap[$day]['net_revenue'] = round($dailyMap[$day]['net_revenue'] + $net, 2);
        }

        $codSales = 0.0;
        $onlineSales = 0.0;
        if ($completedOrderIds !== []) {
            $paymentRows = DB::table('payment_allocations as pa')
                ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
                ->whereIn('pa.order_id', $completedOrderIds)
                ->where('pa.allocation_type', 'order_payment')
                ->where('p.payment_type', 'payment')
                ->select(['p.payment_method', 'pa.amount'])
                ->get();

            foreach ($paymentRows as $pr) {
                if ($pr->payment_method === 'cash') {
                    $codSales += (float) $pr->amount;
                } else {
                    $onlineSales += (float) $pr->amount;
                }
            }
        }

        $topItems = $completedOrderIds !== []
            ? DB::table('order_items')
                ->whereIn('order_id', $completedOrderIds)
                ->select([
                    'menu_item_id',
                    'item_name',
                    DB::raw('SUM(quantity) as units_sold'),
                    DB::raw('SUM(line_total) as revenue'),
                ])
                ->groupBy('menu_item_id', 'item_name')
                ->orderByDesc('units_sold')
                ->limit(10)
                ->get()
                ->map(static fn (object $row): array => [
                    'menu_item_id' => (int) $row->menu_item_id,
                    'item_name' => $row->item_name,
                    'units_sold' => (int) $row->units_sold,
                    'revenue' => round((float) $row->revenue, 2),
                ])
                ->all()
            : [];

        ksort($dailyMap);

        return [
            'restaurant_id' => $targetId,
            'range' => [
                'from' => substr($from, 0, 10),
                'to' => substr($to, 0, 10),
            ],
            'summary' => [
                'orders_count' => $ordersCount,
                'completed_count' => $completedOrders->count(),
                'cancelled_count' => $cancelledCount,
                'gross_sales' => round($grossSales, 2),
                'discount_total' => round($discountTotal, 2),
                'net_revenue' => round($netRevenue, 2),
                'cod_sales' => round($codSales, 2),
                'online_sales' => round($onlineSales, 2),
            ],
            'top_items' => $topItems,
            'daily_breakdown' => array_values($dailyMap),
        ];
    }
}
