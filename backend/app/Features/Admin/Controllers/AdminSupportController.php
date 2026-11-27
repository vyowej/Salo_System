<?php

namespace App\Features\Admin\Controllers;

use App\Features\Admin\Services\AdminReservationService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class AdminSupportController extends Controller
{
    public function __construct(
        private readonly AdminReservationService $reservationService,
    ) {}

    public function overview(): JsonResponse
    {
        $openDisputes = DB::table('orders as o')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->join('users as u', 'u.user_id', '=', 'o.customer_id')
            ->leftJoin('deliveries as d', 'd.order_id', '=', 'o.order_id')
            ->where('o.order_status', 'failed')
            ->orderByDesc('o.updated_at')
            ->limit(25)
            ->get([
                'o.order_id',
                'o.order_reference',
                'r.restaurant_name',
                DB::raw("TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) as customer_name"),
                'd.failure_reason',
                'o.updated_at',
            ]);

        $flaggedReservations = $this->reservationService->listReservations([
            'needs_review' => true,
            'per_page' => 25,
            'page' => 1,
        ]);

        $changeRequests = DB::table('profile_change_requests as pcr')
            ->join('users as u', 'u.user_id', '=', 'pcr.requested_by_user_id')
            ->where('pcr.status', 'pending')
            ->orderByDesc('pcr.created_at')
            ->limit(25)
            ->get([
                'pcr.request_id',
                'pcr.entity_type',
                'pcr.entity_id',
                'pcr.category as request_type',
                DB::raw("TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) as requester_name"),
                'pcr.created_at',
            ]);

        $lifecycleRequests = DB::table('account_lifecycle_requests as alr')
            ->join('users as u', 'u.user_id', '=', 'alr.user_id')
            ->where('alr.status', 'pending')
            ->orderByDesc('alr.created_at')
            ->limit(25)
            ->get([
                'alr.lifecycle_request_id as request_id',
                'alr.request_type',
                'alr.reason',
                DB::raw("TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) as requester_name"),
                'alr.created_at',
            ]);

        $riderTickets = DB::table('rider_support_tickets as rst')
            ->join('riders as rd', 'rd.rider_id', '=', 'rst.rider_id')
            ->join('users as u', 'u.user_id', '=', 'rst.user_id')
            ->whereIn('rst.status', ['open', 'in_review'])
            ->orderByDesc('rst.created_at')
            ->limit(25)
            ->get([
                'rst.ticket_id',
                'rst.ticket_reference',
                'rst.rider_id',
                'rst.category',
                'rst.priority',
                'rst.subject',
                'rst.status',
                DB::raw("TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) as rider_name"),
                'rst.created_at',
            ]);

        return ApiResponse::success([
            'counts' => [
                'disputes' => $openDisputes->count(),
                'reservation_reviews' => (int) ($flaggedReservations['meta']['total'] ?? 0),
                'change_requests' => $changeRequests->count(),
                'lifecycle_requests' => $lifecycleRequests->count(),
                'rider_tickets' => $riderTickets->count(),
            ],
            'disputes' => $openDisputes->map(static fn (object $row): array => [
                'order_id' => (int) $row->order_id,
                'reference' => $row->order_reference,
                'restaurant_name' => $row->restaurant_name,
                'customer_name' => $row->customer_name,
                'reason' => $row->failure_reason ?: 'Failed delivery dispute awaiting resolution',
                'updated_at' => $row->updated_at,
                'target_route' => "/admin/orders/disputes/{$row->order_id}",
            ])->values()->all(),
            'reservation_reviews' => array_map(static fn (array $item): array => [
                'reservation_id' => $item['reservation_id'],
                'reference' => $item['reservation_reference'],
                'restaurant_name' => $item['restaurant_name'] ?? '',
                'customer_name' => $item['customer_name'] ?? '',
                'reason' => $item['admin_review_reason'] ?? 'Paid reservation requires admin review',
                'updated_at' => $item['updated_at'] ?? $item['created_at'] ?? null,
                'target_route' => "/admin/reservations/{$item['reservation_id']}",
            ], $flaggedReservations['items'] ?? []),
            'change_requests' => $changeRequests->map(static fn (object $row): array => [
                'request_id' => (int) $row->request_id,
                'entity_type' => $row->entity_type,
                'request_type' => $row->request_type,
                'requester_name' => $row->requester_name,
                'created_at' => $row->created_at,
                'target_route' => '/admin/restaurants',
            ])->values()->all(),
            'lifecycle_requests' => $lifecycleRequests->map(static fn (object $row): array => [
                'request_id' => (int) $row->request_id,
                'request_type' => $row->request_type,
                'requester_name' => $row->requester_name,
                'reason' => $row->reason,
                'created_at' => $row->created_at,
                'target_route' => '/admin/accounts',
            ])->values()->all(),
            'rider_tickets' => $riderTickets->map(static fn (object $row): array => [
                'ticket_id' => (int) $row->ticket_id,
                'reference' => $row->ticket_reference,
                'rider_id' => (int) $row->rider_id,
                'rider_name' => $row->rider_name,
                'category' => $row->category,
                'priority' => $row->priority,
                'subject' => $row->subject,
                'status' => $row->status,
                'created_at' => $row->created_at,
                'target_route' => "/admin/riders/{$row->rider_id}",
            ])->values()->all(),
        ], 'Admin support escalations retrieved.');
    }
}
