<?php

namespace App\Features\Notifications\Services;

use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class NotificationService
{
    /**
     * Supported workspace tags matching notifications.workspace ENUM.
     *
     * @var array<int, string>
     */
    public const WORKSPACES = ['customer', 'restaurant', 'rider', 'admin'];

    /**
     * Create a single in-app notification for one SALO user account.
     * Intended to be called inside the caller's DB transaction.
     */
    public function notifyUser(
        int $userId,
        string $workspace,
        string $type,
        string $title,
        string $body,
        ?string $relatedEntityType = null,
        ?int $relatedEntityId = null,
    ): int {
        $this->assertValidWorkspace($workspace);

        return (int) DB::table('notifications')->insertGetId([
            'user_id' => $userId,
            'workspace' => $workspace,
            'type' => mb_substr(trim($type), 0, 80),
            'title' => mb_substr(trim($title), 0, 160),
            'body' => trim($body),
            'related_entity_type' => $relatedEntityType !== null ? mb_substr(trim($relatedEntityType), 0, 50) : null,
            'related_entity_id' => $relatedEntityId,
            'read_at' => null,
            'created_at' => now(),
        ]);
    }

    /**
     * Create identical in-app notifications for multiple SALO user accounts.
     * Deduplicates user IDs and skips non-positive IDs.
     *
     * @param  array<int, int|string>  $userIds
     */
    public function notifyUsers(
        array $userIds,
        string $workspace,
        string $type,
        string $title,
        string $body,
        ?string $relatedEntityType = null,
        ?int $relatedEntityId = null,
    ): void {
        $this->assertValidWorkspace($workspace);

        $uniqueIds = array_values(array_unique(array_filter(
            array_map(static fn (mixed $id): int => (int) $id, $userIds),
            static fn (int $id): bool => $id > 0,
        )));

        if ($uniqueIds === []) {
            return;
        }

        $now = now();
        $cleanType = mb_substr(trim($type), 0, 80);
        $cleanTitle = mb_substr(trim($title), 0, 160);
        $cleanBody = trim($body);
        $cleanEntityType = $relatedEntityType !== null ? mb_substr(trim($relatedEntityType), 0, 50) : null;

        $rows = array_map(static fn (int $userId): array => [
            'user_id' => $userId,
            'workspace' => $workspace,
            'type' => $cleanType,
            'title' => $cleanTitle,
            'body' => $cleanBody,
            'related_entity_type' => $cleanEntityType,
            'related_entity_id' => $relatedEntityId,
            'read_at' => null,
            'created_at' => $now,
        ], $uniqueIds);

        DB::table('notifications')->insert($rows);
    }

    public function resolveOrderCustomerUserId(int $orderId): ?int
    {
        $customerId = DB::table('orders')->where('order_id', $orderId)->value('customer_id');

        return $customerId !== null ? (int) $customerId : null;
    }

    /**
     * Resolve active owners + active order-handler staff for a specific restaurant.
     *
     * @return array<int, int>
     */
    public function resolveRestaurantOrderHandlerUserIds(int $restaurantId): array
    {
        $ownerIds = $this->resolveRestaurantOwnerUserIds($restaurantId);

        $staffRows = DB::table('restaurant_staff as rs')
            ->join('users as u', 'u.user_id', '=', 'rs.user_id')
            ->where('rs.restaurant_id', $restaurantId)
            ->where('rs.staff_status', 'active')
            ->where('u.account_status', 'active')
            ->get(['rs.user_id', 'rs.staff_position']);

        $handlerStaffIds = [];
        foreach ($staffRows as $row) {
            if (User::isOrderHandlerPosition($row->staff_position)) {
                $handlerStaffIds[] = (int) $row->user_id;
            }
        }

        return array_values(array_unique(array_merge($ownerIds, $handlerStaffIds)));
    }

    /**
     * Resolve active owner user IDs for a specific restaurant.
     *
     * @return array<int, int>
     */
    public function resolveRestaurantOwnerUserIds(int $restaurantId): array
    {
        return DB::table('restaurant_owners as ro')
            ->join('users as u', 'u.user_id', '=', 'ro.user_id')
            ->where('ro.restaurant_id', $restaurantId)
            ->where('u.account_status', 'active')
            ->pluck('ro.user_id')
            ->map(static fn (mixed $id): int => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    public function resolveApplicationApplicantUserId(string $type, int $applicationId): ?int
    {
        $table = $type === 'rider' ? 'rider_applications' : 'restaurant_applications';
        $pk = $type === 'rider' ? 'rider_application_id' : 'restaurant_application_id';

        $userId = DB::table($table)->where($pk, $applicationId)->value('applicant_user_id');

        return $userId !== null ? (int) $userId : null;
    }

    public function resolveRiderUserId(int $riderId): ?int
    {
        $userId = DB::table('riders')->where('rider_id', $riderId)->value('user_id');

        return $userId !== null ? (int) $userId : null;
    }

    /**
     * Resolve all active admin user IDs (excluding optional actor user ID).
     * Limitation: no granular admin permissions exist yet, so all active admins are notified.
     *
     * @return array<int, int>
     */
    public function resolveActiveAdminUserIds(?int $excludeUserId = null): array
    {
        $query = DB::table('users')
            ->where('user_role', 'admin')
            ->where('account_status', 'active');

        if ($excludeUserId !== null) {
            $query->where('user_id', '!=', $excludeUserId);
        }

        return $query->pluck('user_id')
            ->map(static fn (mixed $id): int => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    public function listForUser(
        User $user,
        ?string $workspace = null,
        bool $unreadOnly = false,
        int $perPage = 20,
    ): array {
        if ($workspace !== null && $workspace !== '') {
            $this->assertValidWorkspace($workspace);
        } else {
            $workspace = null;
        }

        $safePerPage = max(1, min(100, $perPage));

        $query = DB::table('notifications')
            ->where('user_id', $user->user_id);

        if ($workspace !== null) {
            $query->where('workspace', $workspace);
        }

        if ($unreadOnly) {
            $query->whereNull('read_at');
        }

        $paginator = $query
            ->orderByDesc('created_at')
            ->orderByDesc('notification_id')
            ->paginate($safePerPage);

        $items = collect($paginator->items())
            ->map(fn (object $row): array => $this->formatNotification($row))
            ->values()
            ->all();

        return [
            'items' => $items,
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function unreadCountForUser(User $user): array
    {
        $rows = DB::table('notifications')
            ->where('user_id', $user->user_id)
            ->whereNull('read_at')
            ->select('workspace', DB::raw('COUNT(*) as cnt'))
            ->groupBy('workspace')
            ->get();

        $byWorkspace = [
            'customer' => 0,
            'restaurant' => 0,
            'rider' => 0,
            'admin' => 0,
        ];

        $total = 0;
        foreach ($rows as $row) {
            $ws = (string) $row->workspace;
            $count = (int) $row->cnt;
            if (array_key_exists($ws, $byWorkspace)) {
                $byWorkspace[$ws] = $count;
            }
            $total += $count;
        }

        return [
            'total' => $total,
            'by_workspace' => $byWorkspace,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function markRead(User $user, int $notificationId): array
    {
        $row = DB::table('notifications')
            ->where('notification_id', $notificationId)
            ->where('user_id', $user->user_id)
            ->first();

        if (! $row) {
            throw new NotFoundHttpException('Notification not found.');
        }

        if ($row->read_at === null) {
            $now = now();
            DB::table('notifications')
                ->where('notification_id', $notificationId)
                ->where('user_id', $user->user_id)
                ->whereNull('read_at')
                ->update(['read_at' => $now]);

            $row = DB::table('notifications')
                ->where('notification_id', $notificationId)
                ->where('user_id', $user->user_id)
                ->first();
        }

        return $this->formatNotification($row);
    }

    public function markAllRead(User $user, ?string $workspace = null): int
    {
        if ($workspace !== null && $workspace !== '') {
            $this->assertValidWorkspace($workspace);
        } else {
            $workspace = null;
        }

        $query = DB::table('notifications')
            ->where('user_id', $user->user_id)
            ->whereNull('read_at');

        if ($workspace !== null) {
            $query->where('workspace', $workspace);
        }

        return (int) $query->update(['read_at' => now()]);
    }

    /**
     * @return array<string, mixed>
     */
    private function formatNotification(object $row): array
    {
        return [
            'notification_id' => (int) $row->notification_id,
            'workspace' => $row->workspace,
            'type' => $row->type,
            'title' => $row->title,
            'body' => $row->body,
            'related_entity_type' => $row->related_entity_type,
            'related_entity_id' => $row->related_entity_id !== null ? (int) $row->related_entity_id : null,
            'is_read' => $row->read_at !== null,
            'read_at' => OrderTimestampFormatter::toManilaIso($row->read_at),
            'created_at' => OrderTimestampFormatter::toManilaIso($row->created_at),
        ];
    }

    private function assertValidWorkspace(string $workspace): void
    {
        if (! in_array($workspace, self::WORKSPACES, true)) {
            throw ValidationException::withMessages([
                'workspace' => ['Invalid workspace. Allowed values: customer, restaurant, rider, admin.'],
            ]);
        }
    }
}
