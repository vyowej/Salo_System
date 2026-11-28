<?php

namespace App\Features\Reservations\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Reservations\Support\ReservationBookingException;
use App\Features\Reservations\Support\ReservationReferenceGenerator;
use App\Features\Reservations\Support\ReservationStatus;
use App\Features\Restaurants\Services\OwnerInventoryService;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\Money;
use App\Support\WorkspaceAccessResolver;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ReservationPreOrderService
{
    private const TIMEZONE = 'Asia/Manila';

    private const ALLOWED_TRANSITIONS = [
        'pending' => ['accepted', 'rejected', 'cancelled'],
        'accepted' => ['preparing', 'cancelled'],
        'preparing' => ['ready', 'cancelled'],
        'ready' => ['completed'],
    ];

    private const ACTION_TO_STATUS = [
        'accept' => 'accepted',
        'reject' => 'rejected',
        'prepare' => 'preparing',
        'ready' => 'ready',
        'complete' => 'completed',
        'cancel' => 'cancelled',
    ];

    private const CUSTOMER_EDITABLE_PRE_ORDER_STATUSES = [
        'pending',
        'accepted',
    ];

    public function __construct(
        private readonly ReservationReferenceGenerator $referenceGenerator,
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
        private readonly OwnerInventoryService $ownerInventoryService,
    ) {}

    /**
     * Validate pre-order items for a specific restaurant and compute exact snapshot totals.
     *
     * @param  array<int, array<string, mixed>>  $itemsInput
     * @return array<string, mixed>
     */
    public function validateAndPrepareItems(
        int $restaurantId,
        object $restaurantRow,
        array $itemsInput,
        string $errorPrefix = 'pre_order.items',
    ): array {
        $maxQty = max(1, (int) config('salo.orders.max_item_quantity', 50));
        $errors = [];
        $preparedItems = [];
        $seenConfigIndices = [];
        $requestedStockByItemId = [];

        foreach ($itemsInput as $idx => $itemInput) {
            $menuItemId = (int) ($itemInput['menu_item_id'] ?? 0);
            $quantity = (int) ($itemInput['quantity'] ?? 0);
            $specialInstructions = isset($itemInput['special_instructions']) && is_string($itemInput['special_instructions'])
                ? trim($itemInput['special_instructions'])
                : '';
            $specialInstructions = $specialInstructions !== '' ? mb_substr($specialInstructions, 0, 500) : null;

            if ($quantity < 1 || $quantity > $maxQty) {
                $errors["{$errorPrefix}.{$idx}.quantity"][] = "Quantity must be between 1 and {$maxQty}.";
                continue;
            }

            $menuItem = DB::table('menu_items as mi')
                ->leftJoin('menu_categories as mc', 'mc.menu_category_id', '=', 'mi.published_menu_category_id')
                ->where('mi.menu_item_id', $menuItemId)
                ->where('mi.restaurant_id', $restaurantId)
                ->first([
                    'mi.menu_item_id',
                    DB::raw('COALESCE(mi.published_item_name, mi.item_name) as display_name'),
                    'mi.published_item_name as item_name',
                    'mi.published_base_price as base_price',
                    'mi.published_photo_image as photo_image',
                    'mi.stock_quantity',
                    'mi.availability_status',
                    'mi.approval_status',
                    'mi.is_published',
                    'mc.is_published as category_published',
                    'mc.published_is_active as category_active',
                ]);

            if (! $menuItem) {
                $errors["{$errorPrefix}.{$idx}.menu_item_id"][] = "Menu item #{$menuItemId} does not belong to {$restaurantRow->restaurant_name}.";
                continue;
            }

            if (
                (int) $menuItem->is_published !== 1
                || $menuItem->approval_status !== 'approved'
                || (int) $menuItem->category_published !== 1
                || (int) $menuItem->category_active !== 1
                || $menuItem->item_name === null
                || $menuItem->base_price === null
            ) {
                $errors["{$errorPrefix}.{$idx}.menu_item_id"][] = "{$menuItem->display_name} is not available for pre-ordering.";
                continue;
            }

            if ($menuItem->availability_status !== 'available') {
                $label = match ($menuItem->availability_status) {
                    'sold_out' => 'sold out',
                    'temporarily_unavailable' => 'temporarily unavailable',
                    default => 'unavailable',
                };
                $errors["{$errorPrefix}.{$idx}.menu_item_id"][] = "{$menuItem->item_name} is currently {$label}.";
                continue;
            }

            if ($menuItem->stock_quantity !== null) {
                $requestedStockByItemId[$menuItemId] = ($requestedStockByItemId[$menuItemId] ?? 0) + $quantity;
                if ($requestedStockByItemId[$menuItemId] > (int) $menuItem->stock_quantity) {
                    $remaining = max(0, (int) $menuItem->stock_quantity);
                    $errors["{$errorPrefix}.{$idx}.quantity"][] = $remaining === 0
                        ? "{$menuItem->item_name} is out of stock."
                        : "Only {$remaining} left in stock for {$menuItem->item_name}.";
                    continue;
                }
            }

            $rawAddOnIds = isset($itemInput['add_on_option_ids']) && is_array($itemInput['add_on_option_ids'])
                ? array_map('intval', $itemInput['add_on_option_ids'])
                : [];

            if (count($rawAddOnIds) !== count(array_unique($rawAddOnIds))) {
                $errors["{$errorPrefix}.{$idx}.add_on_option_ids"][] = "Duplicate add-on selection for {$menuItem->item_name}.";
                continue;
            }

            $addOnGroups = DB::table('add_on_groups')
                ->where('menu_item_id', $menuItemId)
                ->orderBy('sort_order')
                ->orderBy('add_on_group_id')
                ->get([
                    'add_on_group_id',
                    'group_name',
                    'is_required',
                    'minimum_selections',
                    'maximum_selections',
                ]);

            $addOnGroupIds = $addOnGroups->pluck('add_on_group_id')->map(fn ($id) => (int) $id)->all();
            $optionsById = $addOnGroupIds === []
                ? collect()
                : DB::table('add_on_options')
                    ->whereIn('add_on_group_id', $addOnGroupIds)
                    ->get([
                        'add_on_option_id',
                        'add_on_group_id',
                        'option_name',
                        'additional_price',
                        'is_available',
                    ])
                    ->keyBy('add_on_option_id');

            $groupsById = $addOnGroups->keyBy('add_on_group_id');
            $selectedAddOns = [];
            $selectedCountByGroup = [];
            $addOnsValid = true;

            foreach ($rawAddOnIds as $optId) {
                $opt = $optionsById->get($optId);
                if (! $opt) {
                    $errors["{$errorPrefix}.{$idx}.add_on_option_ids"][] = "Selected add-on #{$optId} is not valid for {$menuItem->item_name}.";
                    $addOnsValid = false;
                    continue;
                }
                if ((int) $opt->is_available !== 1) {
                    $errors["{$errorPrefix}.{$idx}.add_on_option_ids"][] = "Add-on \"{$opt->option_name}\" for {$menuItem->item_name} is currently unavailable.";
                    $addOnsValid = false;
                    continue;
                }

                $grp = $groupsById->get((int) $opt->add_on_group_id);
                $grpId = (int) $opt->add_on_group_id;
                $selectedCountByGroup[$grpId] = ($selectedCountByGroup[$grpId] ?? 0) + 1;
                $addOnPriceCents = Money::toCents((string) $opt->additional_price);

                $selectedAddOns[] = [
                    'add_on_option_id' => (int) $opt->add_on_option_id,
                    'group_name' => $grp ? (string) $grp->group_name : 'Add-on',
                    'option_name' => (string) $opt->option_name,
                    'additional_price_cents' => $addOnPriceCents,
                    'additional_price_decimal' => Money::fromCents($addOnPriceCents),
                ];
            }

            if ($addOnsValid) {
                foreach ($addOnGroups as $grp) {
                    $grpId = (int) $grp->add_on_group_id;
                    $count = $selectedCountByGroup[$grpId] ?? 0;
                    $minSel = (bool) $grp->is_required ? max(1, (int) $grp->minimum_selections) : (int) $grp->minimum_selections;
                    $maxSel = (int) $grp->maximum_selections;

                    if ($count < $minSel) {
                        $errors["{$errorPrefix}.{$idx}.add_on_option_ids"][] = "Select at least {$minSel} option(s) for \"{$grp->group_name}\" on {$menuItem->item_name}.";
                        $addOnsValid = false;
                    } elseif ($maxSel > 0 && $count > $maxSel) {
                        $errors["{$errorPrefix}.{$idx}.add_on_option_ids"][] = "Select no more than {$maxSel} option(s) for \"{$grp->group_name}\" on {$menuItem->item_name}.";
                        $addOnsValid = false;
                    }
                }
            }

            if (! $addOnsValid) {
                continue;
            }

            $sortedOptionIds = $rawAddOnIds;
            sort($sortedOptionIds);
            $configKey = $menuItemId.':'.implode(',', $sortedOptionIds).':'.($specialInstructions ?? '');

            $baseCents = Money::toCents((string) $menuItem->base_price);
            $addOnsCents = array_sum(array_column($selectedAddOns, 'additional_price_cents'));
            $unitWithAddOnsCents = $baseCents + $addOnsCents;

            if (isset($seenConfigIndices[$configKey])) {
                $existingIdx = $seenConfigIndices[$configKey];
                $newQty = $preparedItems[$existingIdx]['quantity'] + $quantity;
                if ($newQty > $maxQty) {
                    $errors["{$errorPrefix}.{$idx}.quantity"][] = "Combined quantity for {$menuItem->item_name} cannot exceed {$maxQty}.";
                    continue;
                }
                $preparedItems[$existingIdx]['quantity'] = $newQty;
                $preparedItems[$existingIdx]['line_total_cents'] = $unitWithAddOnsCents * $newQty;
                $preparedItems[$existingIdx]['line_total_decimal'] = Money::fromCents($preparedItems[$existingIdx]['line_total_cents']);
                continue;
            }

            $seenConfigIndices[$configKey] = count($preparedItems);
            $lineTotalCents = $unitWithAddOnsCents * $quantity;

            $preparedItems[] = [
                'menu_item_id' => $menuItemId,
                'item_name' => (string) $menuItem->item_name,
                'unit_price_cents' => $unitWithAddOnsCents,
                'unit_price_decimal' => Money::fromCents($unitWithAddOnsCents),
                'quantity' => $quantity,
                'special_instructions' => $specialInstructions,
                'line_total_cents' => $lineTotalCents,
                'line_total_decimal' => Money::fromCents($lineTotalCents),
                'add_ons' => $selectedAddOns,
            ];
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        $subtotalCents = array_sum(array_column($preparedItems, 'line_total_cents'));
        $commissionRate = ($restaurantRow->commission_rate ?? null) !== null
            ? round((float) $restaurantRow->commission_rate, 2)
            : round((float) config('salo.orders.default_commission_rate', 15.0), 2);
        $commissionCents = (int) round($subtotalCents * ($commissionRate / 100));
        $restaurantPayableCents = max(0, $subtotalCents - $commissionCents);

        return [
            'items' => $preparedItems,
            'item_count' => array_sum(array_column($preparedItems, 'quantity')),
            'subtotal_cents' => $subtotalCents,
            'subtotal_decimal' => Money::fromCents($subtotalCents),
            'total_cents' => $subtotalCents,
            'total_decimal' => Money::fromCents($subtotalCents),
            'commission_rate' => $commissionRate,
            'commission_decimal' => Money::fromCents($commissionCents),
            'restaurant_payable_decimal' => Money::fromCents($restaurantPayableCents),
        ];
    }

    /**
     * Create a dine-in pre-order linked to a reservation inside an active DB transaction.
     *
     * @param  array<string, mixed>  $prepared
     */
    public function createLinkedPreOrder(
        User $user,
        object $restaurantRow,
        int $reservationId,
        string $reservationStartSql,
        ?string $contactName,
        ?string $notes,
        array $prepared,
        string $idempotencyKey,
        CarbonInterface $now,
    ): int {
        $customerId = (int) $user->user_id;
        $customerName = trim((string) ($contactName ?: ($user->first_name.' '.$user->last_name)));
        if ($customerName === '') {
            $customerName = (string) ($user->username ?? 'Customer');
        }

        $checkoutId = (int) DB::table('checkouts')->insertGetId([
            'customer_id' => $customerId,
            'idempotency_key' => 'res-pre-'.substr(sha1($idempotencyKey.'-'.$reservationId), 0, 48),
            'checkout_status' => 'pending',
            'total_amount' => $prepared['total_decimal'],
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $orderRef = $this->generateOrderReference();

        $orderId = (int) DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => (int) $restaurantRow->restaurant_id,
            'customer_id' => $customerId,
            'reservation_id' => $reservationId,
            'restaurant_name' => (string) $restaurantRow->restaurant_name,
            'customer_name' => mb_substr($customerName, 0, 200),
            'order_reference' => $orderRef,
            'order_type' => 'dine_in',
            'order_priority' => 'scheduled',
            'order_status' => 'pending',
            'delivery_notes' => $notes !== null && trim($notes) !== '' ? mb_substr(trim($notes), 0, 500) : null,
            'subtotal_amount' => $prepared['subtotal_decimal'],
            'delivery_fee' => '0.00',
            'priority_fee' => '0.00',
            'discount_amount' => '0.00',
            'total_amount' => $prepared['total_decimal'],
            'commission_rate' => number_format((float) $prepared['commission_rate'], 2, '.', ''),
            'commission_amount' => $prepared['commission_decimal'],
            'restaurant_payable' => $prepared['restaurant_payable_decimal'],
            'scheduled_for' => $reservationStartSql,
            'placed_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $this->insertOrderItems($orderId, $prepared['items'], $now);

        return $orderId;
    }

    /**
     * Batch-load linked dine-in pre-orders for a list of reservation IDs.
     *
     * @param  array<int, int>  $reservationIds
     * @param  array<int, object>  $reservationsById
     * @return array<int, array<string, mixed>>
     */
    public function loadByReservationIds(
        array $reservationIds,
        array $reservationsById = [],
        ?CarbonInterface $now = null,
    ): array {
        $ids = array_values(array_unique(array_filter(array_map('intval', $reservationIds), fn ($id) => $id > 0)));
        if ($ids === []) {
            return [];
        }

        $orders = DB::table('orders')
            ->whereIn('reservation_id', $ids)
            ->orderByDesc('order_id')
            ->get()
            ->unique('reservation_id');

        if ($orders->isEmpty()) {
            return [];
        }

        $orderIds = $orders->pluck('order_id')->map(fn ($id) => (int) $id)->all();

        $items = DB::table('order_items as oi')
            ->leftJoin('menu_items as mi', 'mi.menu_item_id', '=', 'oi.menu_item_id')
            ->whereIn('oi.order_id', $orderIds)
            ->orderBy('oi.order_item_id')
            ->get([
                'oi.order_item_id',
                'oi.order_id',
                'oi.menu_item_id',
                'oi.item_name',
                'oi.unit_price',
                'oi.quantity',
                'oi.special_instructions',
                'oi.line_total',
                DB::raw('COALESCE(mi.published_photo_image, mi.photo_image) as photo_image'),
            ]);

        $orderItemIds = $items->pluck('order_item_id')->map(fn ($id) => (int) $id)->all();
        $addOnsByItemId = $orderItemIds === []
            ? collect()
            : DB::table('order_item_add_ons')
                ->whereIn('order_item_id', $orderItemIds)
                ->orderBy('order_item_add_on_id')
                ->get()
                ->groupBy('order_item_id');

        $itemsByOrderId = [];
        foreach ($items as $item) {
            $itemId = (int) $item->order_item_id;
            $addOns = ($addOnsByItemId->get($itemId) ?? collect())->map(static fn (object $ao): array => [
                'order_item_add_on_id' => (int) $ao->order_item_add_on_id,
                'add_on_option_id' => $ao->add_on_option_id !== null ? (int) $ao->add_on_option_id : null,
                'group_name' => (string) $ao->group_name,
                'option_name' => (string) $ao->option_name,
                'additional_price' => number_format((float) $ao->additional_price, 2, '.', ''),
            ])->values()->all();

            $itemsByOrderId[(int) $item->order_id][] = [
                'order_item_id' => $itemId,
                'menu_item_id' => $item->menu_item_id !== null ? (int) $item->menu_item_id : null,
                'item_name' => (string) $item->item_name,
                'photo_image' => $item->photo_image !== null ? (string) $item->photo_image : null,
                'unit_price' => number_format((float) $item->unit_price, 2, '.', ''),
                'quantity' => (int) $item->quantity,
                'special_instructions' => $item->special_instructions !== null ? (string) $item->special_instructions : null,
                'line_total' => number_format((float) $item->line_total, 2, '.', ''),
                'add_ons' => $addOns,
            ];
        }

        $refNow = $now !== null
            ? CarbonImmutable::instance($now)->setTimezone(self::TIMEZONE)
            : CarbonImmutable::now(self::TIMEZONE);

        $result = [];
        foreach ($orders as $order) {
            $resId = (int) $order->reservation_id;
            $resRow = $reservationsById[$resId] ?? null;
            $orderItems = $itemsByOrderId[(int) $order->order_id] ?? [];
            $itemCount = array_sum(array_column($orderItems, 'quantity'));
            [$canEdit, $editBlockedReason] = $this->evaluateCustomerEditability($resRow, $order, $refNow);

            $status = (string) $order->order_status;
            $allowedActions = array_values(array_filter(
                array_keys(self::ACTION_TO_STATUS),
                fn (string $act): bool => in_array(self::ACTION_TO_STATUS[$act], self::ALLOWED_TRANSITIONS[$status] ?? [], true),
            ));

            $result[$resId] = [
                'order_id' => (int) $order->order_id,
                'order_reference' => (string) $order->order_reference,
                'order_type' => (string) $order->order_type,
                'order_status' => $status,
                'notes' => $order->delivery_notes !== null ? (string) $order->delivery_notes : null,
                'subtotal_amount' => number_format((float) $order->subtotal_amount, 2, '.', ''),
                'delivery_fee' => '0.00',
                'total_amount' => number_format((float) $order->total_amount, 2, '.', ''),
                'item_count' => $itemCount,
                'items' => $orderItems,
                'rejection_reason' => $order->rejection_reason !== null ? (string) $order->rejection_reason : null,
                'cancellation_reason' => $order->cancellation_reason !== null ? (string) $order->cancellation_reason : null,
                'can_customer_edit' => $canEdit,
                'edit_blocked_reason' => $editBlockedReason,
                'allowed_actions' => $allowedActions,
                'placed_at' => $order->placed_at ? CarbonImmutable::parse((string) $order->placed_at, self::TIMEZONE)->toIso8601String() : null,
                'accepted_at' => $order->accepted_at ? CarbonImmutable::parse((string) $order->accepted_at, self::TIMEZONE)->toIso8601String() : null,
                'completed_at' => $order->completed_at ? CarbonImmutable::parse((string) $order->completed_at, self::TIMEZONE)->toIso8601String() : null,
                'cancelled_at' => $order->cancelled_at ? CarbonImmutable::parse((string) $order->cancelled_at, self::TIMEZONE)->toIso8601String() : null,
            ];
        }

        return $result;
    }

    /**
     * Customer creates, updates, or clears their pre-order on an existing reservation.
     *
     * @param  array<int, array<string, mixed>>  $itemsInput
     * @return array<string, mixed>|null
     */
    public function updateCustomerPreOrder(
        User $user,
        int $reservationId,
        array $itemsInput,
        ?string $notes,
        Request $request,
        ?CarbonInterface $now = null,
    ): ?array {
        $customerId = (int) $user->user_id;
        $manilaNow = $now !== null
            ? CarbonImmutable::instance($now)->setTimezone(self::TIMEZONE)
            : CarbonImmutable::now(self::TIMEZONE);

        $reservation = DB::table('reservations as r')
            ->join('restaurants as rest', 'rest.restaurant_id', '=', 'r.restaurant_id')
            ->where('r.reservation_id', $reservationId)
            ->where('r.customer_id', $customerId)
            ->first([
                'r.*',
                'rest.restaurant_name',
                'rest.reservation_cancellation_cutoff_minutes',
            ]);

        if (! $reservation) {
            throw new NotFoundHttpException('Reservation not found.');
        }

        $existingOrder = DB::table('orders')
            ->where('reservation_id', $reservationId)
            ->orderByDesc('order_id')
            ->first();

        [$canEdit, $blockedReason] = $this->evaluateCustomerEditability($reservation, $existingOrder, $manilaNow);
        if (! $canEdit) {
            throw new ReservationBookingException(
                errorCode: 'PRE_ORDER_LOCKED',
                message: $blockedReason ?: 'This pre-order can no longer be modified.',
                statusCode: 409,
            );
        }

        $prepared = $itemsInput !== []
            ? $this->validateAndPrepareItems((int) $reservation->restaurant_id, $reservation, $itemsInput, 'items')
            : null;

        $wasAcceptedReset = false;
        DB::transaction(function () use ($user, $reservation, $existingOrder, $prepared, $notes, $manilaNow, $request, &$wasAcceptedReset): void {
            $resLocked = DB::table('reservations')
                ->where('reservation_id', (int) $reservation->reservation_id)
                ->lockForUpdate()
                ->first();

            $orderLocked = DB::table('orders')
                ->where('reservation_id', (int) $reservation->reservation_id)
                ->orderByDesc('order_id')
                ->lockForUpdate()
                ->first();

            [$stillEditable, $reason] = $this->evaluateCustomerEditability($resLocked, $orderLocked, $manilaNow);
            if (! $stillEditable) {
                throw new ReservationBookingException(
                    errorCode: 'PRE_ORDER_LOCKED',
                    message: $reason ?: 'This pre-order can no longer be modified.',
                    statusCode: 409,
                );
            }

            if ($prepared === null) {
                if ($orderLocked && ! in_array((string) $orderLocked->order_status, ['cancelled', 'rejected', 'completed'], true)) {
                    DB::table('orders')
                        ->where('order_id', (int) $orderLocked->order_id)
                        ->update([
                            'order_status' => 'cancelled',
                            'cancelled_by' => 'customer',
                            'cancelled_at' => $manilaNow,
                            'cancellation_reason' => 'Customer removed pre-order items',
                            'updated_at' => $manilaNow,
                        ]);

                    $this->auditLogService->record(
                        actorUserId: (int) $user->user_id,
                        action: 'reservation_preorder_cancelled',
                        entityType: 'reservations',
                        entityId: (int) $reservation->reservation_id,
                        oldValues: ['order_status' => (string) $orderLocked->order_status],
                        newValues: ['order_status' => 'cancelled'],
                        request: $request,
                    );
                }

                return;
            }

            $cleanNotes = $notes !== null && trim($notes) !== '' ? mb_substr(trim($notes), 0, 500) : null;

            if ($orderLocked && ! in_array((string) $orderLocked->order_status, ['cancelled', 'rejected', 'completed'], true)) {
                $orderId = (int) $orderLocked->order_id;
                $oldTotal = (string) $orderLocked->total_amount;
                $previousOrderStatus = (string) $orderLocked->order_status;
                $nextOrderStatus = $previousOrderStatus === 'accepted' ? 'pending' : $previousOrderStatus;
                if ($previousOrderStatus === 'accepted') {
                    $wasAcceptedReset = true;
                }

                $orderUpdates = [
                    'order_status' => $nextOrderStatus,
                    'delivery_notes' => $cleanNotes,
                    'subtotal_amount' => $prepared['subtotal_decimal'],
                    'total_amount' => $prepared['total_decimal'],
                    'commission_rate' => number_format((float) $prepared['commission_rate'], 2, '.', ''),
                    'commission_amount' => $prepared['commission_decimal'],
                    'restaurant_payable' => $prepared['restaurant_payable_decimal'],
                    'updated_at' => $manilaNow,
                ];
                if ($nextOrderStatus === 'pending') {
                    $orderUpdates['accepted_at'] = null;
                }

                DB::table('orders')
                    ->where('order_id', $orderId)
                    ->update($orderUpdates);

                DB::table('checkouts')
                    ->where('checkout_id', (int) $orderLocked->checkout_id)
                    ->update([
                        'total_amount' => $prepared['total_decimal'],
                        'updated_at' => $manilaNow,
                    ]);

                $existingItemIds = DB::table('order_items')
                    ->where('order_id', $orderId)
                    ->pluck('order_item_id')
                    ->all();
                if ($existingItemIds !== []) {
                    DB::table('order_item_add_ons')->whereIn('order_item_id', $existingItemIds)->delete();
                    DB::table('order_items')->where('order_id', $orderId)->delete();
                }

                $this->insertOrderItems($orderId, $prepared['items'], $manilaNow);

                $this->auditLogService->record(
                    actorUserId: (int) $user->user_id,
                    action: 'reservation_preorder_updated',
                    entityType: 'reservations',
                    entityId: (int) $reservation->reservation_id,
                    oldValues: ['order_status' => $previousOrderStatus, 'total_amount' => $oldTotal],
                    newValues: ['order_status' => $nextOrderStatus, 'total_amount' => $prepared['total_decimal'], 'item_count' => $prepared['item_count']],
                    request: $request,
                );
            } else {
                $this->createLinkedPreOrder(
                    user: $user,
                    restaurantRow: $reservation,
                    reservationId: (int) $reservation->reservation_id,
                    reservationStartSql: (string) $reservation->reservation_start,
                    contactName: $reservation->contact_name ?? null,
                    notes: $cleanNotes,
                    prepared: $prepared,
                    idempotencyKey: 'upd-'.bin2hex(random_bytes(8)),
                    now: $manilaNow,
                );

                $this->auditLogService->record(
                    actorUserId: (int) $user->user_id,
                    action: 'reservation_preorder_added',
                    entityType: 'reservations',
                    entityId: (int) $reservation->reservation_id,
                    oldValues: [],
                    newValues: ['total_amount' => $prepared['total_decimal'], 'item_count' => $prepared['item_count']],
                    request: $request,
                );
            }
        });

        $notifBody = $prepared === null
            ? sprintf(
                'Customer cancelled their dine-in pre-order for reservation %s.',
                (string) ($reservation->reservation_reference ?? '#'.$reservationId),
            )
            : ($wasAcceptedReset
                ? sprintf(
                    'Customer modified their accepted dine-in pre-order for reservation %s. Please review and re-accept the updated items.',
                    (string) ($reservation->reservation_reference ?? '#'.$reservationId),
                )
                : sprintf(
                    'Customer updated their dine-in pre-order for reservation %s.',
                    (string) ($reservation->reservation_reference ?? '#'.$reservationId),
                ));

        $this->notifyRestaurantHandlers(
            restaurantId: (int) $reservation->restaurant_id,
            type: 'reservation_preorder_updated',
            title: $wasAcceptedReset ? 'Reservation pre-order requires re-acceptance' : 'Reservation pre-order updated',
            body: $notifBody,
            reservationId: $reservationId,
        );

        $map = $this->loadByReservationIds([$reservationId], [$reservationId => $reservation], $manilaNow);

        return $map[$reservationId] ?? null;
    }

    /**
     * Owner/staff updates the kitchen preparation status of a reservation's linked pre-order.
     *
     * @return array<string, mixed>
     */
    public function transitionPreOrderStatus(
        User $user,
        int $reservationId,
        string $action,
        ?string $reason,
        ?int $restaurantId,
        Request $request,
        ?CarbonInterface $now = null,
    ): array {
        $nextStatus = self::ACTION_TO_STATUS[$action] ?? null;
        if ($nextStatus === null) {
            throw ValidationException::withMessages(['action' => ['Unsupported pre-order action.']]);
        }

        $cleanReason = $reason !== null ? trim($reason) : null;
        if ($nextStatus === 'rejected' && ($cleanReason === null || $cleanReason === '')) {
            throw ValidationException::withMessages([
                'reason' => ['A rejection reason is required when rejecting a pre-order.'],
            ]);
        }

        $restaurant = $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForReservations(
            $user,
            $restaurantId,
            'reservations.updateStatus',
        );
        $targetRestaurantId = (int) $restaurant->restaurant_id;
        $manilaNow = $now !== null
            ? CarbonImmutable::instance($now)->setTimezone(self::TIMEZONE)
            : CarbonImmutable::now(self::TIMEZONE);

        $reservation = DB::table('reservations')
            ->where('reservation_id', $reservationId)
            ->where('restaurant_id', $targetRestaurantId)
            ->first();

        if (! $reservation) {
            throw new NotFoundHttpException('Reservation not found.');
        }

        DB::transaction(function () use ($reservationId, $targetRestaurantId, $nextStatus, $cleanReason, $user, $manilaNow, $request): void {
            $order = DB::table('orders')
                ->where('reservation_id', $reservationId)
                ->where('restaurant_id', $targetRestaurantId)
                ->orderByDesc('order_id')
                ->lockForUpdate()
                ->first();

            if (! $order) {
                throw new NotFoundHttpException('No pre-order is linked to this reservation.');
            }

            $currentStatus = (string) $order->order_status;
            $allowedNext = self::ALLOWED_TRANSITIONS[$currentStatus] ?? [];
            if (! in_array($nextStatus, $allowedNext, true)) {
                throw new ConflictHttpException(
                    "Invalid pre-order status transition from '{$currentStatus}' to '{$nextStatus}'."
                );
            }

            $updates = [
                'order_status' => $nextStatus,
                'updated_at' => $manilaNow,
            ];

            if ($nextStatus === 'accepted') {
                $updates['accepted_at'] = $manilaNow;
            } elseif ($nextStatus === 'completed') {
                $updates['completed_at'] = $manilaNow;
            } elseif ($nextStatus === 'rejected') {
                $updates['rejection_reason'] = mb_substr((string) $cleanReason, 0, 255);
                $updates['rejected_at'] = $manilaNow->format('Y-m-d H:i:s');
            } elseif ($nextStatus === 'cancelled') {
                $updates['cancelled_by'] = 'restaurant';
                $updates['cancelled_at'] = $manilaNow;
                $updates['cancellation_reason'] = $cleanReason !== null && $cleanReason !== ''
                    ? mb_substr($cleanReason, 0, 255)
                    : 'Cancelled by restaurant';
            }

            DB::table('orders')
                ->where('order_id', (int) $order->order_id)
                ->update($updates);

            if ($nextStatus === 'completed') {
                $this->ownerInventoryService->deductStockForOrderIfConfigured((int) $order->order_id, (int) $user->user_id);
            }

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: "reservation_preorder_{$nextStatus}",
                entityType: 'reservations',
                entityId: $reservationId,
                oldValues: ['order_status' => $currentStatus],
                newValues: ['order_status' => $nextStatus],
                request: $request,
            );
        });

        $statusLabel = match ($nextStatus) {
            'accepted' => 'accepted by the kitchen',
            'preparing' => 'now being prepared',
            'ready' => 'ready for your table',
            'completed' => 'completed',
            'rejected' => 'rejected',
            'cancelled' => 'cancelled',
            default => $nextStatus,
        };

        $this->notificationService->notifyUser(
            userId: (int) $reservation->customer_id,
            workspace: 'customer',
            type: 'reservation_preorder_status_updated',
            title: 'Reservation pre-order update',
            body: sprintf(
                'Your pre-order for reservation %s is %s.',
                (string) ($reservation->reservation_reference ?? '#'.$reservationId),
                $statusLabel,
            ),
            relatedEntityType: 'reservations',
            relatedEntityId: $reservationId,
        );

        $map = $this->loadByReservationIds([$reservationId], [$reservationId => $reservation], $manilaNow);

        return $map[$reservationId] ?? [];
    }

    /**
     * Cancel any active linked pre-order when its parent reservation is cancelled, rejected, expired, or marked no-show.
     */
    public function syncPreOrderOnReservationTerminalState(
        int $reservationId,
        string $cancelledBy,
        ?string $reason,
        ?int $actorUserId = null,
        ?CarbonInterface $now = null,
    ): void {
        $manilaNow = $now !== null
            ? CarbonImmutable::instance($now)->setTimezone(self::TIMEZONE)
            : CarbonImmutable::now(self::TIMEZONE);

        $order = DB::table('orders')
            ->where('reservation_id', $reservationId)
            ->whereIn('order_status', ['pending', 'accepted', 'preparing', 'ready'])
            ->orderByDesc('order_id')
            ->first();

        if (! $order) {
            return;
        }

        $cleanReason = $reason !== null && trim($reason) !== ''
            ? mb_substr(trim($reason), 0, 255)
            : 'Linked table reservation ended';

        DB::table('orders')
            ->where('order_id', (int) $order->order_id)
            ->update([
                'order_status' => 'cancelled',
                'cancelled_by' => in_array($cancelledBy, ['customer', 'restaurant', 'admin', 'system'], true) ? $cancelledBy : 'system',
                'cancelled_at' => $manilaNow,
                'cancellation_reason' => $cleanReason,
                'updated_at' => $manilaNow,
            ]);

        $this->auditLogService->record(
            actorUserId: $actorUserId,
            action: 'reservation_preorder_cancelled_with_reservation',
            entityType: 'reservations',
            entityId: $reservationId,
            oldValues: ['order_status' => (string) $order->order_status],
            newValues: ['order_status' => 'cancelled', 'cancelled_by' => $cancelledBy],
        );
    }

    /**
     * @return array{0: bool, 1: string|null}
     */
    private function evaluateCustomerEditability(?object $reservation, ?object $order, CarbonImmutable $manilaNow): array
    {
        if (! $reservation) {
            return [false, 'Reservation not found.'];
        }

        $resStatus = (string) ($reservation->reservation_status ?? '');
        $editableResStatuses = [
            ReservationStatus::PENDING,
            ReservationStatus::APPROVED,
            ReservationStatus::AWAITING_PAYMENT,
            ReservationStatus::CONFIRMED,
        ];

        if (! in_array($resStatus, $editableResStatuses, true)) {
            return [false, "Pre-order cannot be modified when reservation is {$resStatus}."];
        }

        if ($order !== null) {
            $orderStatus = (string) $order->order_status;
            if (! in_array($orderStatus, self::CUSTOMER_EDITABLE_PRE_ORDER_STATUSES, true)) {
                if (in_array($orderStatus, ['preparing', 'ready'], true)) {
                    return [false, 'The kitchen has already started preparing your pre-order, so items can no longer be modified.'];
                }
                if ($orderStatus === 'completed') {
                    return [false, 'This pre-order has already been completed.'];
                }
                // If previously cancelled/rejected, allow customer to create a fresh pre-order before cutoff
            }
        }

        if (isset($reservation->reservation_start)) {
            $start = CarbonImmutable::parse((string) $reservation->reservation_start, self::TIMEZONE);
            if ($manilaNow->greaterThan($start)) {
                return [false, 'Pre-order cannot be modified after the reservation start time.'];
            }
            $cutoff = max(0, (int) ($reservation->reservation_cancellation_cutoff_minutes ?? 0));
            if ($resStatus !== ReservationStatus::PENDING && $cutoff > 0 && $manilaNow->greaterThan($start->subMinutes($cutoff))) {
                return [false, "Pre-order modifications close {$cutoff} minutes before the reservation start time."];
            }
        }

        return [true, null];
    }

    /**
     * @param  array<int, array<string, mixed>>  $preparedItems
     */
    private function insertOrderItems(int $orderId, array $preparedItems, CarbonInterface $now): void
    {
        foreach ($preparedItems as $item) {
            $orderItemId = (int) DB::table('order_items')->insertGetId([
                'order_id' => $orderId,
                'menu_item_id' => $item['menu_item_id'],
                'item_name' => $item['item_name'],
                'unit_price' => $item['unit_price_decimal'],
                'quantity' => $item['quantity'],
                'special_instructions' => $item['special_instructions'],
                'line_total' => $item['line_total_decimal'],
                'created_at' => $now,
            ]);

            if ($item['add_ons'] !== []) {
                $addOnRows = [];
                foreach ($item['add_ons'] as $ao) {
                    $addOnRows[] = [
                        'order_item_id' => $orderItemId,
                        'add_on_option_id' => $ao['add_on_option_id'],
                        'group_name' => $ao['group_name'],
                        'option_name' => $ao['option_name'],
                        'additional_price' => $ao['additional_price_decimal'],
                        'created_at' => $now,
                    ];
                }
                DB::table('order_item_add_ons')->insert($addOnRows);
            }
        }
    }

    private function generateOrderReference(): string
    {
        $datePart = CarbonImmutable::now(self::TIMEZONE)->format('Ymd');
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $suffix = strtoupper(substr(bin2hex(random_bytes(3)), 0, 5));
            $ref = "SALO-PRE-{$datePart}-{$suffix}";
            if (! DB::table('orders')->where('order_reference', $ref)->exists()) {
                return $ref;
            }
        }

        return 'SALO-PRE-'.$datePart.'-'.strtoupper(substr(bin2hex(random_bytes(4)), 0, 7));
    }

    /**
     * Build a deterministic canonical fingerprint for an incoming pre_order payload
     * (ignoring frontend prices and non-meaningful item/add-on ordering).
     *
     * @param  array<string, mixed>|null  $preOrderInput
     */
    public function canonicalPreOrderFingerprint(?array $preOrderInput): string
    {
        if ($preOrderInput === null) {
            return 'NONE';
        }

        $itemsInput = is_array($preOrderInput['items'] ?? null) ? $preOrderInput['items'] : [];
        if ($itemsInput === []) {
            return 'NONE';
        }

        $notes = isset($preOrderInput['notes']) && is_string($preOrderInput['notes'])
            ? trim($preOrderInput['notes'])
            : '';

        $merged = [];
        foreach ($itemsInput as $item) {
            if (! is_array($item)) {
                continue;
            }
            $menuItemId = (int) ($item['menu_item_id'] ?? 0);
            $quantity = (int) ($item['quantity'] ?? 0);
            $addOnIds = isset($item['add_on_option_ids']) && is_array($item['add_on_option_ids'])
                ? array_values(array_unique(array_map('intval', $item['add_on_option_ids'])))
                : [];
            sort($addOnIds);
            $instructions = isset($item['special_instructions']) && is_string($item['special_instructions'])
                ? trim($item['special_instructions'])
                : '';

            $key = $menuItemId.':'.implode(',', $addOnIds).':'.$instructions;
            if (isset($merged[$key])) {
                $merged[$key]['quantity'] += $quantity;
            } else {
                $merged[$key] = [
                    'menu_item_id' => $menuItemId,
                    'quantity' => $quantity,
                    'add_on_option_ids' => $addOnIds,
                    'special_instructions' => $instructions,
                ];
            }
        }

        if ($merged === []) {
            return 'NONE';
        }

        ksort($merged);

        return hash('sha256', (string) json_encode([
            'notes' => $notes,
            'items' => array_values($merged),
        ]));
    }

    /**
     * Build the exact same canonical fingerprint from the persisted pre-order of a reservation.
     */
    public function storedPreOrderFingerprint(int $reservationId): string
    {
        $order = DB::table('orders')
            ->where('reservation_id', $reservationId)
            ->orderByDesc('order_id')
            ->first(['order_id', 'delivery_notes']);

        if (! $order) {
            return 'NONE';
        }

        $orderItems = DB::table('order_items')
            ->where('order_id', (int) $order->order_id)
            ->get(['order_item_id', 'menu_item_id', 'quantity', 'special_instructions']);

        if ($orderItems->isEmpty()) {
            return 'NONE';
        }

        $orderItemIds = $orderItems->pluck('order_item_id')->map(fn ($id) => (int) $id)->all();
        $addOnsByItem = DB::table('order_item_add_ons')
            ->whereIn('order_item_id', $orderItemIds)
            ->get(['order_item_id', 'add_on_option_id'])
            ->groupBy('order_item_id');

        $items = [];
        foreach ($orderItems as $oi) {
            $optIds = ($addOnsByItem->get((int) $oi->order_item_id) ?? collect())
                ->pluck('add_on_option_id')
                ->filter(fn ($v) => $v !== null)
                ->map(fn ($v) => (int) $v)
                ->all();

            $items[] = [
                'menu_item_id' => (int) $oi->menu_item_id,
                'quantity' => (int) $oi->quantity,
                'add_on_option_ids' => $optIds,
                'special_instructions' => $oi->special_instructions !== null ? (string) $oi->special_instructions : '',
            ];
        }

        return $this->canonicalPreOrderFingerprint([
            'notes' => $order->delivery_notes !== null ? (string) $order->delivery_notes : '',
            'items' => $items,
        ]);
    }

    private function notifyRestaurantHandlers(
        int $restaurantId,
        string $type,
        string $title,
        string $body,
        int $reservationId,
    ): void {
        $ownerIds = DB::table('restaurant_owners')
            ->where('restaurant_id', $restaurantId)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $staffIds = DB::table('restaurant_staff')
            ->where('restaurant_id', $restaurantId)
            ->where('staff_status', 'active')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        foreach (array_values(array_unique(array_merge($ownerIds, $staffIds))) as $uid) {
            if ($uid <= 0) {
                continue;
            }
            $this->notificationService->notifyUser(
                userId: $uid,
                workspace: 'restaurant',
                type: $type,
                title: $title,
                body: $body,
                relatedEntityType: 'reservations',
                relatedEntityId: $reservationId,
            );
        }
    }
}
