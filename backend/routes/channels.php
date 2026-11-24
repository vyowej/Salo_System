<?php

use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\DB;

Broadcast::channel('order.{orderId}', function ($user, int $orderId): array|bool {
    $order = DB::table('orders as o')
        ->leftJoin('deliveries as d', 'd.order_id', '=', 'o.order_id')
        ->leftJoin('riders as r', 'r.rider_id', '=', 'd.rider_id')
        ->where('o.order_id', $orderId)
        ->select([
            'o.order_id',
            'o.customer_id',
            'r.user_id as rider_user_id',
        ])
        ->first();

    if (! $order) {
        return false;
    }

    $userId = (int) $user->user_id;
    $isCustomer = (int) $order->customer_id === $userId;
    $isAssignedRider = $order->rider_user_id !== null && (int) $order->rider_user_id === $userId;

    if (! $isCustomer && ! $isAssignedRider) {
        return false;
    }

    return [
        'id' => $userId,
        'role' => $isCustomer ? 'customer' : 'rider',
    ];
});
