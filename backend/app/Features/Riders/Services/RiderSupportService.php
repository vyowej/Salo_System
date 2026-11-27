<?php

namespace App\Features\Riders\Services;

use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\WorkspaceAccessResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class RiderSupportService
{
    public const CATEGORIES = [
        'delivery_issue',
        'customer_issue',
        'restaurant_delay',
        'payment_cod',
        'app_technical',
        'safety_incident',
        'other',
    ];

    public const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

    public const STATUSES = ['open', 'in_review', 'resolved', 'closed'];

    public function __construct(
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
        private readonly AuditLogService $auditLogService,
    ) {}

    /**
     * List support tickets for the authenticated rider, along with summary counts and recent orders.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listTickets(User $user, array $filters = []): array
    {
        $rider = $this->workspaceAccessResolver->requireActiveRider($user);
        $riderId = (int) $rider->rider_id;

        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 20)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $status = trim((string) ($filters['status'] ?? 'all'));
        $category = trim((string) ($filters['category'] ?? 'all'));

        $countsRow = DB::table('rider_support_tickets')
            ->where('rider_id', $riderId)
            ->selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
                SUM(CASE WHEN status = 'in_review' THEN 1 ELSE 0 END) as in_review_count,
                SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved_count,
                SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_count
            ")
            ->first();

        $query = DB::table('rider_support_tickets as rst')
            ->leftJoin('orders as o', 'o.order_id', '=', 'rst.order_id')
            ->leftJoin('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->where('rst.rider_id', $riderId);

        if ($status !== '' && $status !== 'all' && in_array($status, self::STATUSES, true)) {
            $query->where('rst.status', $status);
        }

        if ($category !== '' && $category !== 'all' && in_array($category, self::CATEGORIES, true)) {
            $query->where('rst.category', $category);
        }

        $total = (int) (clone $query)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));

        $rows = $query
            ->select([
                'rst.ticket_id',
                'rst.ticket_reference',
                'rst.rider_id',
                'rst.order_id',
                'o.order_reference',
                'r.restaurant_name',
                'rst.category',
                'rst.priority',
                'rst.subject',
                'rst.description',
                'rst.status',
                'rst.admin_response',
                'rst.resolved_at',
                'rst.created_at',
                'rst.updated_at',
            ])
            ->orderByDesc('rst.created_at')
            ->orderByDesc('rst.ticket_id')
            ->forPage($page, $perPage)
            ->get();

        $recentOrders = DB::table('deliveries as d')
            ->join('orders as o', 'o.order_id', '=', 'd.order_id')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->where('d.rider_id', $riderId)
            ->orderByDesc('d.updated_at')
            ->limit(15)
            ->get([
                'o.order_id',
                'o.order_reference',
                'r.restaurant_name',
                'd.delivery_status',
            ])
            ->map(static fn (object $row): array => [
                'order_id' => (int) $row->order_id,
                'order_reference' => $row->order_reference,
                'restaurant_name' => $row->restaurant_name,
                'delivery_status' => $row->delivery_status,
            ])
            ->all();

        return [
            'tickets' => $rows->map(fn (object $row): array => $this->formatTicket($row))->all(),
            'counts' => [
                'total' => (int) ($countsRow->total ?? 0),
                'open' => (int) ($countsRow->open_count ?? 0),
                'in_review' => (int) ($countsRow->in_review_count ?? 0),
                'resolved' => (int) ($countsRow->resolved_count ?? 0),
                'closed' => (int) ($countsRow->closed_count ?? 0),
            ],
            'recent_orders' => $recentOrders,
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => $lastPage,
            ],
        ];
    }

    /**
     * Get a single support ticket belonging to the authenticated rider.
     *
     * @return array<string, mixed>
     */
    public function getTicket(User $user, int $ticketId): array
    {
        $rider = $this->workspaceAccessResolver->requireActiveRider($user);
        $riderId = (int) $rider->rider_id;

        $row = DB::table('rider_support_tickets as rst')
            ->leftJoin('orders as o', 'o.order_id', '=', 'rst.order_id')
            ->leftJoin('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->where('rst.ticket_id', $ticketId)
            ->where('rst.rider_id', $riderId)
            ->select([
                'rst.ticket_id',
                'rst.ticket_reference',
                'rst.rider_id',
                'rst.order_id',
                'o.order_reference',
                'r.restaurant_name',
                'rst.category',
                'rst.priority',
                'rst.subject',
                'rst.description',
                'rst.status',
                'rst.admin_response',
                'rst.resolved_at',
                'rst.created_at',
                'rst.updated_at',
            ])
            ->first();

        if (! $row) {
            throw new NotFoundHttpException('Support ticket not found.');
        }

        return $this->formatTicket($row);
    }

    /**
     * Create a new rider support ticket / incident report.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function createTicket(User $user, array $validated, ?Request $request = null): array
    {
        $rider = $this->workspaceAccessResolver->requireActiveRider($user);
        $riderId = (int) $rider->rider_id;

        $orderId = isset($validated['order_id']) && $validated['order_id'] !== null && $validated['order_id'] !== ''
            ? (int) $validated['order_id']
            : null;

        if ($orderId !== null) {
            $hasDelivery = DB::table('deliveries')
                ->where('rider_id', $riderId)
                ->where('order_id', $orderId)
                ->exists();

            if (! $hasDelivery) {
                throw ValidationException::withMessages([
                    'order_id' => ['Selected delivery order does not belong to your rider account.'],
                ]);
            }
        }

        $reference = $this->generateTicketReference();
        $now = now();

        $ticketId = DB::table('rider_support_tickets')->insertGetId([
            'ticket_reference' => $reference,
            'rider_id' => $riderId,
            'user_id' => (int) $user->user_id,
            'order_id' => $orderId,
            'category' => (string) $validated['category'],
            'priority' => (string) ($validated['priority'] ?? 'normal'),
            'subject' => trim((string) $validated['subject']),
            'description' => trim((string) $validated['description']),
            'status' => 'open',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $this->auditLogService->record(
            actorUserId: (int) $user->user_id,
            action: 'rider.support_ticket.created',
            entityType: 'rider_support_ticket',
            entityId: $ticketId,
            newValues: [
                'ticket_reference' => $reference,
                'category' => $validated['category'],
                'priority' => $validated['priority'] ?? 'normal',
                'order_id' => $orderId,
            ],
            request: $request,
        );

        return $this->getTicket($user, $ticketId);
    }

    /**
     * Close an open or in-review support ticket belonging to the rider.
     *
     * @return array<string, mixed>
     */
    public function closeTicket(User $user, int $ticketId, ?Request $request = null): array
    {
        $rider = $this->workspaceAccessResolver->requireActiveRider($user);
        $riderId = (int) $rider->rider_id;

        $existing = DB::table('rider_support_tickets')
            ->where('ticket_id', $ticketId)
            ->where('rider_id', $riderId)
            ->first();

        if (! $existing) {
            throw new NotFoundHttpException('Support ticket not found.');
        }

        if ($existing->status === 'closed') {
            return $this->getTicket($user, $ticketId);
        }

        DB::table('rider_support_tickets')
            ->where('ticket_id', $ticketId)
            ->update([
                'status' => 'closed',
                'updated_at' => now(),
            ]);

        $this->auditLogService->record(
            actorUserId: (int) $user->user_id,
            action: 'rider.support_ticket.closed',
            entityType: 'rider_support_ticket',
            entityId: $ticketId,
            oldValues: ['status' => $existing->status],
            newValues: ['status' => 'closed', 'ticket_reference' => $existing->ticket_reference],
            request: $request,
        );

        return $this->getTicket($user, $ticketId);
    }

    private function generateTicketReference(): string
    {
        $prefix = 'SUP-'.now('Asia/Manila')->format('Ymd').'-';
        do {
            $candidate = $prefix.strtoupper(Str::random(4));
        } while (DB::table('rider_support_tickets')->where('ticket_reference', $candidate)->exists());

        return $candidate;
    }

    /**
     * @return array<string, mixed>
     */
    private function formatTicket(object $row): array
    {
        return [
            'ticket_id' => (int) $row->ticket_id,
            'ticket_reference' => $row->ticket_reference,
            'rider_id' => (int) $row->rider_id,
            'order_id' => $row->order_id !== null ? (int) $row->order_id : null,
            'order_reference' => $row->order_reference,
            'restaurant_name' => $row->restaurant_name,
            'category' => $row->category,
            'priority' => $row->priority,
            'subject' => $row->subject,
            'description' => $row->description,
            'status' => $row->status,
            'admin_response' => $row->admin_response,
            'resolved_at' => OrderTimestampFormatter::toManilaIso($row->resolved_at),
            'created_at' => OrderTimestampFormatter::toManilaIso($row->created_at),
            'updated_at' => OrderTimestampFormatter::toManilaIso($row->updated_at),
        ];
    }
}
