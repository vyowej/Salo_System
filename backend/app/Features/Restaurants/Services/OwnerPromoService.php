<?php

namespace App\Features\Restaurants\Services;

use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\WorkspaceAccessResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class OwnerPromoService
{
    public function __construct(
        private readonly AuditLogService $auditLogService,
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listPromos(User $user, array $filters = [], ?int $restaurantId = null): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveOwnedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 20)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $search = trim((string) ($filters['search'] ?? ''));
        $status = trim((string) ($filters['status'] ?? ''));

        $baseQuery = DB::table('promos')->where('restaurant_id', $targetId);

        if ($search !== '') {
            $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $search).'%';
            $baseQuery->where(function ($q) use ($like): void {
                $q->where('promo_code', 'like', $like)
                    ->orWhere('promo_name', 'like', $like);
            });
        }

        if ($status === 'active') {
            $baseQuery->where('is_active', 1);
        } elseif ($status === 'inactive') {
            $baseQuery->where('is_active', 0);
        }

        $total = (int) (clone $baseQuery)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));

        $rows = $baseQuery
            ->orderByDesc('created_at')
            ->orderByDesc('promo_id')
            ->forPage($page, $perPage)
            ->get();

        return [
            'items' => $rows->map(fn (object $row): array => $this->formatPromo($row))->all(),
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => $lastPage,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function createPromo(User $user, array $data, ?int $restaurantId = null, ?Request $request = null): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveOwnedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $code = isset($data['promo_code']) ? strtoupper(trim((string) $data['promo_code'])) : null;
        if ($code === '') {
            $code = null;
        }

        if ($code === null) {
            throw ValidationException::withMessages([
                'promo_code' => ['Promo code is required.'],
            ]);
        }

        if (DB::table('promos')->where('promo_code', $code)->exists()) {
            throw ValidationException::withMessages([
                'promo_code' => ['This promo code already exists.'],
            ]);
        }

        $discountType = (string) ($data['discount_type'] ?? 'percentage');
        $discountValue = (float) ($data['discount_value'] ?? 0);
        if ($discountValue <= 0 || ($discountType === 'percentage' && $discountValue > 100)) {
            throw ValidationException::withMessages([
                'discount_value' => ['Discount value must be > 0 (and <= 100 for percentage promos).'],
            ]);
        }

        $startsAt = (string) $data['starts_at'];
        $endsAt = (string) $data['ends_at'];
        if (strtotime($endsAt) <= strtotime($startsAt)) {
            throw ValidationException::withMessages([
                'ends_at' => ['End date/time must be after start date/time.'],
            ]);
        }

        $promoId = DB::transaction(function () use ($data, $code, $discountType, $discountValue, $targetId, $startsAt, $endsAt, $user, $request): int {
            $now = now();
            $id = (int) DB::table('promos')->insertGetId([
                'promo_code' => $code,
                'auto_apply' => 0,
                'promo_name' => trim((string) $data['promo_name']),
                'description' => isset($data['description']) ? trim((string) $data['description']) : null,
                'discount_type' => $discountType,
                'funding_source' => 'restaurant',
                'platform_share_percent' => null,
                'restaurant_share_percent' => null,
                'discount_value' => number_format($discountValue, 2, '.', ''),
                'minimum_order_amount' => number_format((float) ($data['minimum_order_amount'] ?? 0), 2, '.', ''),
                'maximum_discount' => isset($data['maximum_discount']) && $data['maximum_discount'] !== ''
                    ? number_format((float) $data['maximum_discount'], 2, '.', '')
                    : null,
                'restaurant_id' => $targetId,
                'starts_at' => date('Y-m-d H:i:s', strtotime($startsAt)),
                'ends_at' => date('Y-m-d H:i:s', strtotime($endsAt)),
                'usage_limit' => isset($data['usage_limit']) && $data['usage_limit'] !== '' ? (int) $data['usage_limit'] : null,
                'used_count' => 0,
                'is_active' => array_key_exists('is_active', $data) ? ((bool) $data['is_active'] ? 1 : 0) : 1,
                'created_by' => (int) $user->user_id,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'owner_promo_created',
                entityType: 'promos',
                entityId: $id,
                newValues: ['promo_code' => $code, 'restaurant_id' => $targetId],
                request: $request,
            );

            return $id;
        });

        $row = DB::table('promos')->where('promo_id', $promoId)->first();

        return $this->formatPromo($row);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function updatePromo(User $user, int $promoId, array $data, ?int $restaurantId = null, ?Request $request = null): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveOwnedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $existing = DB::table('promos')
            ->where('promo_id', $promoId)
            ->where('restaurant_id', $targetId)
            ->first();

        if (! $existing) {
            throw new NotFoundHttpException('Promo not found.');
        }

        $updates = [];
        if (array_key_exists('is_active', $data)) {
            $updates['is_active'] = (bool) $data['is_active'] ? 1 : 0;
        }
        if (array_key_exists('promo_name', $data)) {
            $updates['promo_name'] = trim((string) $data['promo_name']);
        }
        if (array_key_exists('usage_limit', $data)) {
            $updates['usage_limit'] = $data['usage_limit'] !== null && $data['usage_limit'] !== ''
                ? (int) $data['usage_limit']
                : null;
        }

        if ($updates !== []) {
            $updates['updated_at'] = now();
            DB::transaction(function () use ($promoId, $updates, $existing, $user, $request): void {
                DB::table('promos')->where('promo_id', $promoId)->update($updates);
                $this->auditLogService->record(
                    actorUserId: (int) $user->user_id,
                    action: 'owner_promo_updated',
                    entityType: 'promos',
                    entityId: $promoId,
                    oldValues: ['is_active' => (bool) $existing->is_active],
                    newValues: $updates,
                    request: $request,
                );
            });
        }

        $row = DB::table('promos')->where('promo_id', $promoId)->first();

        return $this->formatPromo($row);
    }

    /**
     * @return array<string, mixed>
     */
    private function formatPromo(object $row): array
    {
        return [
            'promo_id' => (int) $row->promo_id,
            'promo_code' => $row->promo_code,
            'promo_name' => $row->promo_name,
            'description' => $row->description,
            'discount_type' => $row->discount_type,
            'funding_source' => $row->funding_source,
            'discount_value' => (float) $row->discount_value,
            'minimum_order_amount' => (float) $row->minimum_order_amount,
            'maximum_discount' => $row->maximum_discount !== null ? (float) $row->maximum_discount : null,
            'restaurant_id' => (int) $row->restaurant_id,
            'starts_at' => OrderTimestampFormatter::toManilaIso($row->starts_at),
            'ends_at' => OrderTimestampFormatter::toManilaIso($row->ends_at),
            'usage_limit' => $row->usage_limit !== null ? (int) $row->usage_limit : null,
            'used_count' => (int) $row->used_count,
            'is_active' => (bool) $row->is_active,
        ];
    }
}
