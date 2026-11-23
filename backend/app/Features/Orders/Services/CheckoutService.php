<?php

namespace App\Features\Orders\Services;

use App\Features\Account\Requests\UpdateProfileRequest;
use App\Features\Locations\Services\ServiceAreaValidationService;
use App\Features\Notifications\Services\NotificationService;
use App\Features\Payments\Services\PaymentService;
use App\Features\Restaurants\Services\AvailabilityService;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\Money;
use App\Support\PublicRestaurantVisibility;
use App\Support\RestaurantBranchService;
use Illuminate\Database\QueryException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class CheckoutService
{
    public function __construct(
        private readonly AvailabilityService $availabilityService,
        private readonly ServiceAreaValidationService $serviceAreaValidationService,
        private readonly CustomerOrderService $customerOrderService,
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
        private readonly PublicRestaurantVisibility $visibility,
        private readonly PaymentService $paymentService,
    ) {}

    /**
     * Validate and create a COD checkout with one order per restaurant group in a single DB transaction.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function placeOrder(User $user, array $validated, Request $request): array
    {
        $idempotencyKey = trim((string) $validated['idempotency_key']);
        $paymentChannel = strtolower(trim((string) ($validated['payment_method'] ?? 'cod')));
        $promoCode = isset($validated['promo_code']) ? strtoupper(trim((string) $validated['promo_code'])) : '';

        $existingCheckout = DB::table('checkouts')
            ->where('idempotency_key', $idempotencyKey)
            ->first();

        if ($existingCheckout) {
            if ((int) $existingCheckout->customer_id !== (int) $user->user_id) {
                throw new ConflictHttpException('Idempotency key is already in use.');
            }

            return $this->formatCheckoutResult($user, $existingCheckout);
        }

        $groupsInput = $validated['groups'];
        $groupErrors = [];
        $preparedGroups = [];

        $selectedContactPhone = null;
        if (array_key_exists('contact_number_id', $validated) && $validated['contact_number_id'] !== null) {
            $contactId = (int) $validated['contact_number_id'];
            $contactRow = DB::table('user_contact_numbers')
                ->where('contact_id', $contactId)
                ->where('user_id', $user->user_id)
                ->first(['contact_id', 'phone_number']);

            if (! $contactRow) {
                throw ValidationException::withMessages([
                    'contact_number_id' => ['The selected contact number was not found in your saved contact numbers.'],
                ]);
            }

            $normalizedSelected = UpdateProfileRequest::normalizePhilippineMobile((string) $contactRow->phone_number);
            if ($normalizedSelected === '' || preg_match('/^09\d{9}$/', $normalizedSelected) !== 1) {
                throw ValidationException::withMessages([
                    'contact_number_id' => ['The selected contact number is invalid.'],
                ]);
            }
            $selectedContactPhone = $normalizedSelected;
        }

        $deliveryFeeCents = Money::toCents((string) config('salo.orders.flat_delivery_fee', '49.00'));
        $maxQty = max(1, (int) config('salo.orders.max_item_quantity', 50));

        foreach ($groupsInput as $gIdx => $group) {
            $restaurantId = (int) $group['restaurant_id'];
            $fulfillment = (string) $group['fulfillment'];
            $addressId = isset($group['address_id']) ? (int) $group['address_id'] : null;
            $deliveryNotes = isset($group['delivery_notes']) && trim((string) $group['delivery_notes']) !== ''
                ? trim((string) $group['delivery_notes'])
                : null;
            $itemsInput = is_array($group['items']) ? $group['items'] : [];

            $restaurant = DB::table('restaurants')->where('restaurant_id', $restaurantId)->first();
            if (! $restaurant || ! $this->visibility->isVisible($restaurantId)) {
                $groupErrors["groups.{$gIdx}.restaurant_id"][] = 'This restaurant is currently unavailable for ordering.';
                continue;
            }

            $isOwnerOrStaff = DB::table('restaurant_owners')
                ->where('restaurant_id', $restaurantId)
                ->where('user_id', $user->user_id)
                ->exists()
                || DB::table('restaurant_staff')
                    ->where('restaurant_id', $restaurantId)
                    ->where('user_id', $user->user_id)
                    ->where('staff_status', 'active')
                    ->exists();

            $displayName = RestaurantBranchService::formatDisplayName((string) $restaurant->restaurant_name, $restaurant->branch_name ?? null);

            if ($isOwnerOrStaff) {
                $groupErrors["groups.{$gIdx}.restaurant_id"][] = "You cannot place an order from {$displayName} because you own or work at it.";
            }

            if ((int) $restaurant->accepting_orders !== 1) {
                $groupErrors["groups.{$gIdx}.restaurant_id"][] = "{$displayName} is not accepting orders right now.";
            }

            $operatingHours = DB::table('operating_hours')
                ->where('restaurant_id', $restaurantId)
                ->get();
            $todayDate = now(AvailabilityService::TIMEZONE)->toDateString();
            $yesterdayDate = now(AvailabilityService::TIMEZONE)->subDay()->toDateString();
            $closures = DB::table('restaurant_closures')
                ->where('restaurant_id', $restaurantId)
                ->whereIn('closure_date', [$todayDate, $yesterdayDate])
                ->get();

            $availability = $this->availabilityService->compute($restaurant, $operatingHours, $closures);
            if (! $availability['is_open']) {
                $groupErrors["groups.{$gIdx}.restaurant_id"][] = "{$displayName} is currently closed.";
            }

            if ($fulfillment === 'delivery' && (int) $restaurant->offers_delivery !== 1) {
                $groupErrors["groups.{$gIdx}.fulfillment"][] = "{$displayName} does not offer delivery.";
            } elseif ($fulfillment === 'pickup' && (int) $restaurant->offers_pickup !== 1) {
                $groupErrors["groups.{$gIdx}.fulfillment"][] = "{$displayName} does not offer pickup.";
            }

            $addressSnapshot = null;
            if ($fulfillment === 'delivery') {
                if (! $addressId) {
                    $groupErrors["groups.{$gIdx}.address_id"][] = 'A delivery address is required for delivery orders.';
                } else {
                    $addressRow = DB::table('user_addresses as ua')
                        ->join('addresses as a', 'a.address_id', '=', 'ua.address_id')
                        ->join('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
                        ->join('cities as c', 'c.city_id', '=', 'b.city_id')
                        ->join('provinces as p', 'p.province_id', '=', 'c.province_id')
                        ->where('ua.user_id', $user->user_id)
                        ->where('ua.address_id', $addressId)
                        ->first([
                            'a.address_id',
                            'a.street',
                            'a.house_number',
                            'a.building_name',
                            'a.landmark',
                            'a.postal_code',
                            'a.latitude',
                            'a.longitude',
                            'b.barangay_name',
                            'c.city_name',
                            'p.province_name',
                        ]);

                    if (! $addressRow) {
                        $groupErrors["groups.{$gIdx}.address_id"][] = 'The selected delivery address was not found in your saved addresses.';
                    } else {
                        $coverage = $this->serviceAreaValidationService->checkRestaurantSupport(
                            restaurantId: $restaurantId,
                            province: (string) $addressRow->province_name,
                            city: (string) $addressRow->city_name,
                            barangay: (string) $addressRow->barangay_name,
                        );

                        if (! $coverage['supported']) {
                            $groupErrors["groups.{$gIdx}.address_id"][] = $coverage['reason'];
                        } else {
                            $fallbackPhone = $user->phone_number;
                            if (! $fallbackPhone) {
                                $fallbackPhone = DB::table('user_contact_numbers')
                                    ->where('user_id', $user->user_id)
                                    ->orderByDesc('is_default')
                                    ->orderBy('contact_id')
                                    ->value('phone_number');
                            }
                            $contactPhone = $selectedContactPhone ?? UpdateProfileRequest::normalizePhilippineMobile(
                                (string) ($fallbackPhone ?: '')
                            );
                            if ($contactPhone === '' || preg_match('/^09\d{9}$/', $contactPhone) !== 1) {
                                $groupErrors["groups.{$gIdx}.address_id"][] = 'A valid contact phone number is required for delivery orders.';
                            } else {
                                $addressParts = array_filter([
                                    $addressRow->house_number,
                                    $addressRow->building_name,
                                    $addressRow->street,
                                    $addressRow->barangay_name ? 'Brgy. '.$addressRow->barangay_name : null,
                                    $addressRow->city_name,
                                    $addressRow->province_name,
                                    $addressRow->postal_code,
                                ]);

                                $accountHolderName = trim("{$user->first_name} {$user->last_name}");
                                if ($accountHolderName === '') {
                                    $accountHolderName = (string) $user->username;
                                }

                                $addressSnapshot = [
                                    'address_id' => (int) $addressRow->address_id,
                                    'recipient_name' => mb_substr($accountHolderName, 0, 150),
                                    'phone' => $contactPhone,
                                    'address_text' => implode(', ', $addressParts),
                                    'latitude' => $addressRow->latitude,
                                    'longitude' => $addressRow->longitude,
                                    'notes' => $deliveryNotes,
                                ];
                            }
                        }
                    }
                }
            }

            $seenConfigIndices = [];
            $preparedItems = [];
            $subtotalCents = 0;
            $requestedStockByItemId = [];

            foreach ($itemsInput as $iIdx => $itemInput) {
                $menuItemId = (int) $itemInput['menu_item_id'];
                $quantity = (int) $itemInput['quantity'];

                if ($quantity < 1 || $quantity > $maxQty) {
                    $groupErrors["groups.{$gIdx}.items.{$iIdx}.quantity"][] = "Quantity must be between 1 and {$maxQty}.";
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
                        'mi.stock_quantity',
                        'mi.availability_status',
                        'mi.approval_status',
                        'mi.is_published',
                        'mc.is_published as category_published',
                        'mc.published_is_active as category_active',
                    ]);

                if (! $menuItem) {
                    $groupErrors["groups.{$gIdx}.items.{$iIdx}.menu_item_id"][] = "Menu item #{$menuItemId} does not belong to {$restaurant->restaurant_name}.";
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
                    $groupErrors["groups.{$gIdx}.items.{$iIdx}.menu_item_id"][] = "{$menuItem->display_name} is not available for ordering.";
                    continue;
                }

                if ($menuItem->availability_status !== 'available') {
                    $label = match ($menuItem->availability_status) {
                        'sold_out' => 'sold out',
                        'temporarily_unavailable' => 'temporarily unavailable',
                        default => 'unavailable',
                    };
                    $groupErrors["groups.{$gIdx}.items.{$iIdx}.menu_item_id"][] = "{$menuItem->item_name} is currently {$label}.";
                    continue;
                }

                if ($menuItem->stock_quantity !== null) {
                    $requestedStockByItemId[$menuItemId] = ($requestedStockByItemId[$menuItemId] ?? 0) + $quantity;
                    if ($requestedStockByItemId[$menuItemId] > (int) $menuItem->stock_quantity) {
                        $remaining = max(0, (int) $menuItem->stock_quantity);
                        $groupErrors["groups.{$gIdx}.items.{$iIdx}.quantity"][] = $remaining === 0
                            ? "{$menuItem->item_name} is out of stock."
                            : "Only {$remaining} left in stock for {$menuItem->item_name}.";
                        continue;
                    }
                }

                $rawAddOnIds = isset($itemInput['add_on_option_ids']) && is_array($itemInput['add_on_option_ids'])
                    ? array_map('intval', $itemInput['add_on_option_ids'])
                    : [];

                if (count($rawAddOnIds) !== count(array_unique($rawAddOnIds))) {
                    $groupErrors["groups.{$gIdx}.items.{$iIdx}.add_on_option_ids"][] = "Duplicate add-on selection for {$menuItem->item_name}.";
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
                        $groupErrors["groups.{$gIdx}.items.{$iIdx}.add_on_option_ids"][] = "Selected add-on #{$optId} is not valid for {$menuItem->item_name}.";
                        $addOnsValid = false;
                        continue;
                    }
                    if ((int) $opt->is_available !== 1) {
                        $groupErrors["groups.{$gIdx}.items.{$iIdx}.add_on_option_ids"][] = "Add-on \"{$opt->option_name}\" for {$menuItem->item_name} is currently unavailable.";
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
                            $groupErrors["groups.{$gIdx}.items.{$iIdx}.add_on_option_ids"][] = "Select at least {$minSel} option(s) for \"{$grp->group_name}\" on {$menuItem->item_name}.";
                            $addOnsValid = false;
                        } elseif ($maxSel > 0 && $count > $maxSel) {
                            $groupErrors["groups.{$gIdx}.items.{$iIdx}.add_on_option_ids"][] = "Select no more than {$maxSel} option(s) for \"{$grp->group_name}\" on {$menuItem->item_name}.";
                            $addOnsValid = false;
                        }
                    }
                }

                if (! $addOnsValid) {
                    continue;
                }

                $sortedOptionIds = $rawAddOnIds;
                sort($sortedOptionIds);
                $configKey = $menuItemId.':'.implode(',', $sortedOptionIds);

                $baseCents = Money::toCents((string) $menuItem->base_price);
                $addOnsCents = array_sum(array_column($selectedAddOns, 'additional_price_cents'));
                $unitWithAddOnsCents = $baseCents + $addOnsCents;

                if (isset($seenConfigIndices[$configKey])) {
                    $existingIdx = $seenConfigIndices[$configKey];
                    $combinedQty = $preparedItems[$existingIdx]['quantity'] + $quantity;
                    if ($combinedQty > $maxQty) {
                        $groupErrors["groups.{$gIdx}.items.{$iIdx}.quantity"][] = "Quantity must be between 1 and {$maxQty}.";
                        continue;
                    }
                    $oldLineCents = $preparedItems[$existingIdx]['line_total_cents'];
                    $newLineCents = $unitWithAddOnsCents * $combinedQty;
                    $preparedItems[$existingIdx]['quantity'] = $combinedQty;
                    $preparedItems[$existingIdx]['line_total_cents'] = $newLineCents;
                    $preparedItems[$existingIdx]['line_total_decimal'] = Money::fromCents($newLineCents);
                    $subtotalCents += ($newLineCents - $oldLineCents);
                    continue;
                }

                $lineTotalCents = $unitWithAddOnsCents * $quantity;
                $subtotalCents += $lineTotalCents;

                $seenConfigIndices[$configKey] = count($preparedItems);
                $preparedItems[] = [
                    'menu_item_id' => (int) $menuItem->menu_item_id,
                    'item_name' => $menuItem->item_name,
                    'unit_price_decimal' => Money::fromCents($baseCents),
                    'quantity' => $quantity,
                    'line_total_cents' => $lineTotalCents,
                    'line_total_decimal' => Money::fromCents($lineTotalCents),
                    'add_ons' => $selectedAddOns,
                ];
            }

            $feeCents = $fulfillment === 'delivery' ? $deliveryFeeCents : 0;
            $totalCents = $subtotalCents + $feeCents;

            $preparedGroups[] = [
                'restaurant' => $restaurant,
                'fulfillment' => $fulfillment,
                'address_snapshot' => $addressSnapshot,
                'items' => $preparedItems,
                'subtotal_cents' => $subtotalCents,
                'delivery_fee_cents' => $feeCents,
                'total_cents' => $totalCents,
                'expected_total' => array_key_exists('expected_total', $group) && $group['expected_total'] !== null
                    ? (string) $group['expected_total']
                    : null,
            ];
        }

        if ($groupErrors !== []) {
            throw ValidationException::withMessages($groupErrors);
        }

        $appliedPromo = null;
        if ($promoCode !== '') {
            $appliedPromo = $this->applyPromoToPreparedGroups($promoCode, $preparedGroups);
        }

        $totalMismatch = false;
        $computedGroupsSummary = [];
        foreach ($preparedGroups as $group) {
            $groupRest = $group['restaurant'];
            $computedGroupsSummary[] = [
                'restaurant_id' => (int) $groupRest->restaurant_id,
                'restaurant_name' => RestaurantBranchService::formatDisplayName((string) $groupRest->restaurant_name, $groupRest->branch_name ?? null),
                'subtotal_amount' => (float) Money::fromCents($group['subtotal_cents']),
                'delivery_fee' => (float) Money::fromCents($group['delivery_fee_cents']),
                'discount_amount' => (float) Money::fromCents($group['discount_cents'] ?? 0),
                'total_amount' => (float) Money::fromCents($group['total_cents']),
            ];
            if ($group['expected_total'] !== null && Money::toCents($group['expected_total']) !== $group['total_cents']) {
                $totalMismatch = true;
            }
        }

        if ($totalMismatch) {
            throw new HttpResponseException(
                response()->json([
                    'success' => false,
                    'message' => 'Prices or fees changed. Please review the updated totals.',
                    'data' => ['groups' => $computedGroupsSummary],
                ], 409)
            );
        }

        $checkoutTotalCents = array_sum(array_column($preparedGroups, 'total_cents'));
        $customerName = trim("{$user->first_name} {$user->last_name}") ?: $user->username;

        try {
            $checkoutId = DB::transaction(function () use (
                $user,
                $idempotencyKey,
                $checkoutTotalCents,
                $preparedGroups,
                $customerName,
                $paymentChannel,
                $appliedPromo,
                $request
            ): int {
            $now = now();

            if ($appliedPromo !== null) {
                $lockedPromo = DB::table('promos')
                    ->where('promo_id', $appliedPromo['promo_id'])
                    ->lockForUpdate()
                    ->first();

                if (
                    ! $lockedPromo
                    || (int) $lockedPromo->is_active !== 1
                    || ($lockedPromo->usage_limit !== null && (int) $lockedPromo->used_count >= (int) $lockedPromo->usage_limit)
                ) {
                    throw ValidationException::withMessages([
                        'promo_code' => ['This promo code is no longer available or has reached its usage limit.'],
                    ]);
                }

                DB::table('promos')
                    ->where('promo_id', $lockedPromo->promo_id)
                    ->update([
                        'used_count' => (int) $lockedPromo->used_count + 1,
                        'updated_at' => $now,
                    ]);
            }

            $checkoutId = (int) DB::table('checkouts')->insertGetId([
                'customer_id' => $user->user_id,
                'idempotency_key' => $idempotencyKey,
                'checkout_status' => 'pending',
                'total_amount' => Money::fromCents($checkoutTotalCents),
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $createdOrderIds = [];
            $orderTotalsById = [];

            foreach ($preparedGroups as $group) {
                $rest = $group['restaurant'];
                $restDisplayName = RestaurantBranchService::formatDisplayName((string) $rest->restaurant_name, $rest->branch_name ?? null);
                $addr = $group['address_snapshot'];
                $orderRef = $this->generateUniqueReference('orders', 'order_reference', 'SALO-ORD');
                $orderTotalDecimal = Money::fromCents($group['total_cents']);

                $orderId = (int) DB::table('orders')->insertGetId([
                    'checkout_id' => $checkoutId,
                    'restaurant_id' => $rest->restaurant_id,
                    'customer_id' => $user->user_id,
                    'restaurant_name' => mb_substr($restDisplayName, 0, 200),
                    'customer_name' => mb_substr($customerName, 0, 200),
                    'order_reference' => $orderRef,
                    'order_type' => $group['fulfillment'],
                    'order_priority' => 'standard',
                    'order_status' => 'pending',
                    'delivery_address_id' => $addr['address_id'] ?? null,
                    'delivery_recipient_name' => $addr['recipient_name'] ?? null,
                    'delivery_phone' => $addr['phone'] ?? null,
                    'delivery_address_text' => $addr['address_text'] ?? null,
                    'delivery_latitude' => $addr['latitude'] ?? null,
                    'delivery_longitude' => $addr['longitude'] ?? null,
                    'delivery_notes' => $addr['notes'] ?? null,
                    'subtotal_amount' => Money::fromCents($group['subtotal_cents']),
                    'delivery_fee' => Money::fromCents($group['delivery_fee_cents']),
                    'discount_amount' => Money::fromCents($group['discount_cents'] ?? 0),
                    'platform_discount_amount' => Money::fromCents($group['platform_discount_cents'] ?? 0),
                    'restaurant_discount_amount' => Money::fromCents($group['restaurant_discount_cents'] ?? 0),
                    'provider_discount_amount' => Money::fromCents($group['provider_discount_cents'] ?? 0),
                    'promo_id' => $group['promo_id'] ?? null,
                    'total_amount' => $orderTotalDecimal,
                    'placed_at' => $now,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                $createdOrderIds[] = $orderId;
                $orderTotalsById[$orderId] = $orderTotalDecimal;

                foreach ($group['items'] as $item) {
                    $orderItemId = (int) DB::table('order_items')->insertGetId([
                        'order_id' => $orderId,
                        'menu_item_id' => $item['menu_item_id'],
                        'item_name' => $item['item_name'],
                        'unit_price' => $item['unit_price_decimal'],
                        'quantity' => $item['quantity'],
                        'line_total' => $item['line_total_decimal'],
                        'created_at' => $now,
                    ]);

                    foreach ($item['add_ons'] ?? [] as $addOn) {
                        DB::table('order_item_add_ons')->insert([
                            'order_item_id' => $orderItemId,
                            'add_on_option_id' => $addOn['add_on_option_id'],
                            'group_name' => $addOn['group_name'],
                            'option_name' => $addOn['option_name'],
                            'additional_price' => $addOn['additional_price_decimal'],
                            'created_at' => $now,
                        ]);
                    }
                }

                if ($paymentChannel === 'cod') {
                    $paymentRef = $this->generateUniqueReference('payments', 'payment_reference', 'SALO-PAY');
                    $paymentId = (int) DB::table('payments')->insertGetId([
                        'payment_reference' => $paymentRef,
                        'checkout_id' => $checkoutId,
                        'customer_id' => $user->user_id,
                        'payment_method' => 'cash',
                        'payment_type' => 'payment',
                        'payment_status' => 'pending',
                        'amount' => $orderTotalDecimal,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);

                    DB::table('payment_allocations')->insert([
                        'payment_id' => $paymentId,
                        'order_id' => $orderId,
                        'allocation_type' => 'order_payment',
                        'amount' => $orderTotalDecimal,
                        'created_at' => $now,
                    ]);
                }

                $this->auditLogService->record(
                    actorUserId: (int) $user->user_id,
                    action: 'customer_order_placed',
                    entityType: 'orders',
                    entityId: $orderId,
                    newValues: [
                        'order_reference' => $orderRef,
                        'restaurant_id' => (int) $rest->restaurant_id,
                        'order_type' => $group['fulfillment'],
                        'total_amount' => $orderTotalDecimal,
                        'payment_method' => $paymentChannel,
                    ],
                    request: $request,
                );

                if ($paymentChannel === 'cod' || $checkoutTotalCents === 0) {
                    $recipientIds = $this->notificationService->resolveRestaurantOrderHandlerUserIds((int) $rest->restaurant_id);
                    $customerFirstName = trim((string) ($user->first_name ?? '')) ?: 'A customer';
                    $this->notificationService->notifyUsers(
                        userIds: $recipientIds,
                        workspace: 'restaurant',
                        type: 'order_received',
                        title: "New order {$orderRef}",
                        body: "{$customerFirstName} placed a {$group['fulfillment']} order ({$orderRef}) at {$restDisplayName}.",
                        relatedEntityType: 'order',
                        relatedEntityId: $orderId,
                    );
                }
            }

            if ($paymentChannel !== 'cod' && $checkoutTotalCents > 0) {
                $paymentRef = $this->generateUniqueReference('payments', 'payment_reference', 'SALO-PAY');
                $preparedOnlinePayment = $this->paymentService->prepareOnlinePaymentPayload([
                    'payment_reference' => $paymentRef,
                    'checkout_id' => $checkoutId,
                    'customer_id' => (int) $user->user_id,
                    'channel' => $paymentChannel,
                    'amount' => Money::fromCents($checkoutTotalCents),
                    'currency' => 'PHP',
                ]);

                $onlinePaymentId = (int) DB::table('payments')->insertGetId([
                    'payment_reference' => $paymentRef,
                    'checkout_id' => $checkoutId,
                    'customer_id' => $user->user_id,
                    'payment_method' => PaymentService::mapChannelToDbMethod($paymentChannel),
                    'payment_type' => 'payment',
                    'payment_status' => $preparedOnlinePayment['payment_status'],
                    'amount' => Money::fromCents($checkoutTotalCents),
                    'provider_response' => json_encode($preparedOnlinePayment['meta'], JSON_UNESCAPED_SLASHES),
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                foreach ($orderTotalsById as $orderId => $orderTotalDecimal) {
                    if ((float) $orderTotalDecimal > 0) {
                        DB::table('payment_allocations')->insert([
                            'payment_id' => $onlinePaymentId,
                            'order_id' => $orderId,
                            'allocation_type' => 'order_payment',
                            'amount' => $orderTotalDecimal,
                            'created_at' => $now,
                        ]);
                    }
                }

                DB::table('payment_events')->insertOrIgnore([
                    'provider_name' => $paymentChannel,
                    'event_key' => "init_{$onlinePaymentId}",
                    'payment_id' => $onlinePaymentId,
                    'payload' => json_encode([
                        'status' => $preparedOnlinePayment['payment_status'],
                        'channel' => $paymentChannel,
                        'provider' => $preparedOnlinePayment['provider_name'],
                    ]),
                    'processing_status' => 'processed',
                    'processed_at' => $now,
                    'created_at' => $now,
                ]);
            }

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'customer_checkout_created',
                entityType: 'checkouts',
                entityId: $checkoutId,
                newValues: [
                    'idempotency_key' => $idempotencyKey,
                    'total_amount' => Money::fromCents($checkoutTotalCents),
                    'order_ids' => $createdOrderIds,
                ],
                request: $request,
            );

            return $checkoutId;
        });
        } catch (QueryException $e) {
            $sqlState = $e->errorInfo[0] ?? null;
            $driverCode = (int) ($e->errorInfo[1] ?? 0);
            if ($sqlState === '23000' && $driverCode === 1062) {
                $duplicate = DB::table('checkouts')->where('idempotency_key', $idempotencyKey)->first();
                if ($duplicate) {
                    if ((int) $duplicate->customer_id !== (int) $user->user_id) {
                        throw new ConflictHttpException('Idempotency key is already in use.');
                    }

                    return $this->formatCheckoutResult($user, $duplicate);
                }
            }
            throw $e;
        }

        $checkout = DB::table('checkouts')->where('checkout_id', $checkoutId)->first();

        return $this->formatCheckoutResult($user, $checkout);
    }

    /**
     * @return array<string, mixed>
     */
    private function formatCheckoutResult(User $user, object $checkout): array
    {
        $orderIds = DB::table('orders')
            ->where('checkout_id', $checkout->checkout_id)
            ->where('customer_id', $user->user_id)
            ->orderBy('order_id')
            ->pluck('order_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $orders = array_map(
            fn (int $orderId): array => $this->customerOrderService->getOrderDetail($user, $orderId),
            $orderIds,
        );

        $checkoutPayment = DB::table('payments')
            ->where('checkout_id', $checkout->checkout_id)
            ->where('payment_type', 'payment')
            ->orderBy('payment_id')
            ->first();

        $formattedPayment = $checkoutPayment ? $this->paymentService->formatPayment($checkoutPayment) : null;
        $resolvedChannel = $formattedPayment['payment_channel'] ?? 'cod';

        return [
            'checkout_id' => (int) $checkout->checkout_id,
            'idempotency_key' => $checkout->idempotency_key,
            'checkout_status' => $checkout->checkout_status,
            'total_amount' => (float) $checkout->total_amount,
            'payment_method' => $resolvedChannel,
            'payment' => $resolvedChannel === 'cod' ? null : $formattedPayment,
            'orders' => $orders,
        ];
    }

    /**
     * Validate and distribute a promo code discount across eligible prepared groups.
     *
     * @param  array<int, array<string, mixed>>  $preparedGroups
     * @return array<string, mixed>
     */
    private function applyPromoToPreparedGroups(string $promoCode, array &$preparedGroups): array
    {
        $promo = DB::table('promos')
            ->where('promo_code', $promoCode)
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

        $eligibleIndices = [];
        $eligibleSubtotalCents = 0;
        foreach ($preparedGroups as $idx => $group) {
            $groupRestaurantId = (int) $group['restaurant']->restaurant_id;
            if ($promo->restaurant_id === null || (int) $promo->restaurant_id === $groupRestaurantId) {
                $eligibleIndices[] = $idx;
                $eligibleSubtotalCents += (int) $group['subtotal_cents'];
            }
        }

        if ($eligibleIndices === []) {
            throw ValidationException::withMessages([
                'promo_code' => ['This promo code is not valid for the selected restaurant.'],
            ]);
        }

        $minOrderCents = Money::toCents((string) $promo->minimum_order_amount);
        if ($eligibleSubtotalCents < $minOrderCents) {
            throw ValidationException::withMessages([
                'promo_code' => ['Minimum order amount of PHP '.number_format((float) $promo->minimum_order_amount, 2).' is required for this promo.'],
            ]);
        }

        if ($promo->discount_type === 'percentage') {
            $discountCents = (int) round($eligibleSubtotalCents * ((float) $promo->discount_value / 100.0));
        } else {
            $discountCents = Money::toCents((string) $promo->discount_value);
        }

        if ($promo->maximum_discount !== null) {
            $discountCents = min($discountCents, Money::toCents((string) $promo->maximum_discount));
        }

        $discountCents = max(0, min($discountCents, $eligibleSubtotalCents));
        if ($discountCents === 0) {
            return ['promo_id' => (int) $promo->promo_id, 'discount_cents' => 0];
        }

        $remainingDiscount = $discountCents;
        $lastPos = count($eligibleIndices) - 1;
        foreach ($eligibleIndices as $pos => $idx) {
            $groupSubtotal = (int) $preparedGroups[$idx]['subtotal_cents'];
            if ($pos === $lastPos) {
                $groupDiscount = min($remainingDiscount, (int) $preparedGroups[$idx]['total_cents']);
            } else {
                $share = $eligibleSubtotalCents > 0
                    ? (int) floor($discountCents * ($groupSubtotal / $eligibleSubtotalCents))
                    : 0;
                $groupDiscount = min($share, $remainingDiscount, (int) $preparedGroups[$idx]['total_cents']);
            }

            $remainingDiscount -= $groupDiscount;

            [$platformShare, $restaurantShare, $providerShare] = $this->splitDiscountByFunding($promo, $groupDiscount);

            $preparedGroups[$idx]['promo_id'] = (int) $promo->promo_id;
            $preparedGroups[$idx]['discount_cents'] = $groupDiscount;
            $preparedGroups[$idx]['platform_discount_cents'] = $platformShare;
            $preparedGroups[$idx]['restaurant_discount_cents'] = $restaurantShare;
            $preparedGroups[$idx]['provider_discount_cents'] = $providerShare;
            $preparedGroups[$idx]['total_cents'] = max(0, (int) $preparedGroups[$idx]['total_cents'] - $groupDiscount);
        }

        return [
            'promo_id' => (int) $promo->promo_id,
            'discount_cents' => $discountCents,
        ];
    }

    /**
     * @return array{0: int, 1: int, 2: int}
     */
    private function splitDiscountByFunding(object $promo, int $discountCents): array
    {
        return match ($promo->funding_source) {
            'restaurant' => [0, $discountCents, 0],
            'provider' => [0, 0, $discountCents],
            'joint' => (function () use ($promo, $discountCents): array {
                $platPct = (float) ($promo->platform_share_percent ?? 50);
                $platCents = (int) round($discountCents * ($platPct / 100.0));
                $restCents = max(0, $discountCents - $platCents);

                return [$platCents, $restCents, 0];
            })(),
            default => [$discountCents, 0, 0],
        };
    }

    private function generateUniqueReference(string $table, string $column, string $prefix): string
    {
        $datePart = now()->format('Ymd');
        do {
            $ref = "{$prefix}-{$datePart}-".random_int(1000, 9999);
            $exists = DB::table($table)->where($column, $ref)->exists();
        } while ($exists);

        return $ref;
    }
}
