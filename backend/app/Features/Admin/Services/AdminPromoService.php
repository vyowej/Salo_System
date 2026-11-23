<?php

namespace App\Features\Admin\Services;

use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Models\User;
use App\Support\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class AdminPromoService
{
    public function __construct(
        private readonly AuditLogService $auditLogService,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listPromos(array $filters = []): array
    {
        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 20)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $search = trim((string) ($filters['search'] ?? ''));
        $status = trim((string) ($filters['status'] ?? ''));

        $baseQuery = DB::table('promos as p')
            ->leftJoin('restaurants as r', 'r.restaurant_id', '=', 'p.restaurant_id');

        if ($search !== '') {
            $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $search).'%';
            $baseQuery->where(function ($q) use ($like): void {
                $q->where('p.promo_code', 'like', $like)
                    ->orWhere('p.promo_name', 'like', $like);
            });
        }

        if ($status === 'active') {
            $baseQuery->where('p.is_active', 1);
        } elseif ($status === 'inactive') {
            $baseQuery->where('p.is_active', 0);
        }

        $total = (int) (clone $baseQuery)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));

        $rows = $baseQuery
            ->select(['p.*', 'r.restaurant_name'])
            ->orderByDesc('p.created_at')
            ->orderByDesc('p.promo_id')
            ->forPage($page, $perPage)
            ->get();

        $items = $rows->map(fn (object $row): array => $this->formatPromo($row))->all();

        return [
            'items' => $items,
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
    public function createPromo(array $data, User $admin, Request $request): array
    {
        $code = isset($data['promo_code']) ? strtoupper(trim((string) $data['promo_code'])) : null;
        if ($code === '') {
            $code = null;
        }
        $autoApply = (bool) ($data['auto_apply'] ?? false);
        if ($code === null && ! $autoApply) {
            throw ValidationException::withMessages([
                'promo_code' => ['Promo code is required unless auto_apply is enabled.'],
            ]);
        }

        if ($code !== null && DB::table('promos')->where('promo_code', $code)->exists()) {
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

        $startsAt = (string) ($data['starts_at'] ?? now()->toDateTimeString());
        $endsAt = (string) ($data['ends_at'] ?? now()->addDays(30)->toDateTimeString());
        if (strtotime($endsAt) <= strtotime($startsAt)) {
            throw ValidationException::withMessages([
                'ends_at' => ['End date/time must be after start date/time.'],
            ]);
        }

        $fundingSource = (string) ($data['funding_source'] ?? 'platform');
        $platformShare = $fundingSource === 'joint' ? (float) ($data['platform_share_percent'] ?? 50) : null;
        $restaurantShare = $fundingSource === 'joint' ? (float) ($data['restaurant_share_percent'] ?? 50) : null;

        $promoId = DB::transaction(function () use (
            $data,
            $code,
            $autoApply,
            $discountType,
            $discountValue,
            $fundingSource,
            $platformShare,
            $restaurantShare,
            $startsAt,
            $endsAt,
            $admin,
            $request,
        ): int {
            $now = now();
            $id = (int) DB::table('promos')->insertGetId([
                'promo_code' => $code,
                'auto_apply' => $autoApply ? 1 : 0,
                'promo_name' => trim((string) $data['promo_name']),
                'description' => isset($data['description']) ? trim((string) $data['description']) : null,
                'discount_type' => $discountType,
                'funding_source' => $fundingSource,
                'platform_share_percent' => $platformShare,
                'restaurant_share_percent' => $restaurantShare,
                'discount_value' => number_format($discountValue, 2, '.', ''),
                'minimum_order_amount' => number_format((float) ($data['minimum_order_amount'] ?? 0), 2, '.', ''),
                'maximum_discount' => isset($data['maximum_discount']) && $data['maximum_discount'] !== ''
                    ? number_format((float) $data['maximum_discount'], 2, '.', '')
                    : null,
                'restaurant_id' => ! empty($data['restaurant_id']) ? (int) $data['restaurant_id'] : null,
                'starts_at' => date('Y-m-d H:i:s', strtotime($startsAt)),
                'ends_at' => date('Y-m-d H:i:s', strtotime($endsAt)),
                'usage_limit' => isset($data['usage_limit']) && $data['usage_limit'] !== '' ? (int) $data['usage_limit'] : null,
                'per_customer_limit' => isset($data['per_customer_limit']) && $data['per_customer_limit'] !== '' ? (int) $data['per_customer_limit'] : null,
                'is_active' => array_key_exists('is_active', $data) ? ((bool) $data['is_active'] ? 1 : 0) : 1,
                'created_by' => (int) $admin->user_id,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: 'admin_promo_created',
                entityType: 'promos',
                entityId: $id,
                newValues: ['promo_code' => $code, 'promo_name' => trim((string) $data['promo_name'])],
                request: $request,
            );

            return $id;
        });

        $row = DB::table('promos as p')
            ->leftJoin('restaurants as r', 'r.restaurant_id', '=', 'p.restaurant_id')
            ->where('p.promo_id', $promoId)
            ->select(['p.*', 'r.restaurant_name'])
            ->first();

        return $this->formatPromo($row);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function updatePromo(int $promoId, array $data, User $admin, Request $request): array
    {
        $existing = DB::table('promos')->where('promo_id', $promoId)->first();
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
            DB::transaction(function () use ($promoId, $updates, $existing, $admin, $request): void {
                DB::table('promos')->where('promo_id', $promoId)->update($updates);
                $this->auditLogService->record(
                    actorUserId: (int) $admin->user_id,
                    action: 'admin_promo_updated',
                    entityType: 'promos',
                    entityId: $promoId,
                    oldValues: ['is_active' => (bool) $existing->is_active],
                    newValues: $updates,
                    request: $request,
                );
            });
        }

        $row = DB::table('promos as p')
            ->leftJoin('restaurants as r', 'r.restaurant_id', '=', 'p.restaurant_id')
            ->where('p.promo_id', $promoId)
            ->select(['p.*', 'r.restaurant_name'])
            ->first();

        return $this->formatPromo($row);
    }

    /**
     * Validate a promo code for a customer order subtotal and compute the discount amount.
     *
     * @return array<string, mixed>
     */
    public function validateCodeForCustomer(string $promoCode, float $subtotal, ?int $restaurantId = null, ?int $customerId = null): array
    {
        $code = strtoupper(trim($promoCode));
        if ($code === '') {
            throw ValidationException::withMessages(['promo_code' => ['Promo code is required.']]);
        }

        $promo = DB::table('promos')
            ->where('promo_code', $code)
            ->where('is_active', 1)
            ->first();

        if (! $promo) {
            throw ValidationException::withMessages(['promo_code' => ['Promo code is invalid or inactive.']]);
        }

        $nowTs = time();
        if ($nowTs < strtotime((string) $promo->starts_at) || $nowTs > strtotime((string) $promo->ends_at)) {
            throw ValidationException::withMessages(['promo_code' => ['This promo code has expired or is not yet active.']]);
        }

        if ($promo->usage_limit !== null && (int) $promo->used_count >= (int) $promo->usage_limit) {
            throw ValidationException::withMessages(['promo_code' => ['This promo code has reached its usage limit.']]);
        }

        if ($customerId !== null && $promo->per_customer_limit !== null) {
            $customerUses = (int) DB::table('orders')
                ->where('promo_id', $promo->promo_id)
                ->where('customer_id', $customerId)
                ->whereNotIn('order_status', ['cancelled', 'rejected'])
                ->distinct()
                ->count('checkout_id');

            if ($customerUses >= (int) $promo->per_customer_limit) {
                throw ValidationException::withMessages(['promo_code' => ['You have already reached the redemption limit for this promo code.']]);
            }
        }

        if ($promo->restaurant_id !== null && $restaurantId !== null && (int) $promo->restaurant_id !== $restaurantId) {
            throw ValidationException::withMessages(['promo_code' => ['This promo code is not valid for the selected restaurant.']]);
        }

        $minOrder = (float) $promo->minimum_order_amount;
        if ($subtotal < $minOrder) {
            throw ValidationException::withMessages([
                'promo_code' => ['Minimum order amount of PHP '.number_format($minOrder, 2).' is required for this promo.'],
            ]);
        }

        $discount = $promo->discount_type === 'percentage'
            ? $subtotal * ((float) $promo->discount_value / 100.0)
            : (float) $promo->discount_value;

        if ($promo->maximum_discount !== null) {
            $discount = min($discount, (float) $promo->maximum_discount);
        }

        $discount = round(min($discount, $subtotal), 2);

        return [
            'promo_id' => (int) $promo->promo_id,
            'promo_code' => $promo->promo_code,
            'promo_name' => $promo->promo_name,
            'discount_type' => $promo->discount_type,
            'discount_value' => (float) $promo->discount_value,
            'discount_amount' => $discount,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function formatPromo(object $row): array
    {
        return [
            'promo_id' => (int) $row->promo_id,
            'promo_code' => $row->promo_code,
            'auto_apply' => (bool) $row->auto_apply,
            'promo_name' => $row->promo_name,
            'description' => $row->description,
            'discount_type' => $row->discount_type,
            'funding_source' => $row->funding_source,
            'discount_value' => (float) $row->discount_value,
            'minimum_order_amount' => (float) $row->minimum_order_amount,
            'maximum_discount' => $row->maximum_discount !== null ? (float) $row->maximum_discount : null,
            'restaurant_id' => $row->restaurant_id !== null ? (int) $row->restaurant_id : null,
            'restaurant_name' => $row->restaurant_name ?? 'Platform-wide',
            'starts_at' => OrderTimestampFormatter::toManilaIso($row->starts_at),
            'ends_at' => OrderTimestampFormatter::toManilaIso($row->ends_at),
            'usage_limit' => $row->usage_limit !== null ? (int) $row->usage_limit : null,
            'per_customer_limit' => $row->per_customer_limit !== null ? (int) $row->per_customer_limit : null,
            'used_count' => (int) $row->used_count,
            'is_active' => (bool) $row->is_active,
        ];
    }
}
