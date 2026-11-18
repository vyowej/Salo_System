<?php

namespace App\Features\Orders\Services;

use App\Features\Locations\Services\ServiceAreaValidationService;
use App\Features\Restaurants\Services\AvailabilityService;
use App\Models\User;
use App\Support\AuditLogService;
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

        $deliveryFeeCents = $this->toCents((string) config('salo.orders.flat_delivery_fee', '49.00'));
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
            if (! $restaurant || $restaurant->restaurant_status !== 'active') {
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

            if ($isOwnerOrStaff) {
                $groupErrors["groups.{$gIdx}.restaurant_id"][] = "You cannot place an order from {$restaurant->restaurant_name} because you own or work at it.";
            }

            if ((int) $restaurant->accepting_orders !== 1) {
                $groupErrors["groups.{$gIdx}.restaurant_id"][] = "{$restaurant->restaurant_name} is not accepting orders right now.";
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
                $groupErrors["groups.{$gIdx}.restaurant_id"][] = "{$restaurant->restaurant_name} is currently closed.";
            }

            if ($fulfillment === 'delivery' && (int) $restaurant->offers_delivery !== 1) {
                $groupErrors["groups.{$gIdx}.fulfillment"][] = "{$restaurant->restaurant_name} does not offer delivery.";
            } elseif ($fulfillment === 'pickup' && (int) $restaurant->offers_pickup !== 1) {
                $groupErrors["groups.{$gIdx}.fulfillment"][] = "{$restaurant->restaurant_name} does not offer pickup.";
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
                            'ua.recipient_name',
                            'ua.recipient_phone',
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
                            $addressParts = array_filter([
                                $addressRow->house_number,
                                $addressRow->building_name,
                                $addressRow->street,
                                $addressRow->barangay_name ? 'Brgy. '.$addressRow->barangay_name : null,
                                $addressRow->city_name,
                                $addressRow->province_name,
                                $addressRow->postal_code,
                            ]);

                            $addressSnapshot = [
                                'address_id' => (int) $addressRow->address_id,
                                'recipient_name' => $addressRow->recipient_name ?: trim("{$user->first_name} {$user->last_name}"),
                                'phone' => $addressRow->recipient_phone ?: $user->phone_number,
                                'address_text' => implode(', ', $addressParts),
                                'latitude' => $addressRow->latitude,
                                'longitude' => $addressRow->longitude,
                                'notes' => $deliveryNotes,
                            ];
                        }
                    }
                }
            }

            $seenItemIds = [];
            $preparedItems = [];
            $subtotalCents = 0;

            foreach ($itemsInput as $iIdx => $itemInput) {
                $menuItemId = (int) $itemInput['menu_item_id'];
                $quantity = (int) $itemInput['quantity'];

                if ($quantity < 1 || $quantity > $maxQty) {
                    $groupErrors["groups.{$gIdx}.items.{$iIdx}.quantity"][] = "Quantity must be between 1 and {$maxQty}.";
                    continue;
                }

                if (isset($seenItemIds[$menuItemId])) {
                    $groupErrors["groups.{$gIdx}.items.{$iIdx}.menu_item_id"][] = 'Duplicate menu item in the same restaurant group.';
                    continue;
                }
                $seenItemIds[$menuItemId] = true;

                $menuItem = DB::table('menu_items as mi')
                    ->join('menu_categories as mc', 'mc.menu_category_id', '=', 'mi.menu_category_id')
                    ->where('mi.menu_item_id', $menuItemId)
                    ->where('mi.restaurant_id', $restaurantId)
                    ->first([
                        'mi.menu_item_id',
                        'mi.item_name',
                        'mi.base_price',
                        'mi.availability_status',
                        'mi.approval_status',
                        'mc.is_active as category_active',
                    ]);

                if (! $menuItem) {
                    $groupErrors["groups.{$gIdx}.items.{$iIdx}.menu_item_id"][] = "Menu item #{$menuItemId} does not belong to {$restaurant->restaurant_name}.";
                    continue;
                }

                if ($menuItem->approval_status !== 'approved' || (int) $menuItem->category_active !== 1) {
                    $groupErrors["groups.{$gIdx}.items.{$iIdx}.menu_item_id"][] = "{$menuItem->item_name} is not available for ordering.";
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

                $unitCents = $this->toCents((string) $menuItem->base_price);
                $lineTotalCents = $unitCents * $quantity;
                $subtotalCents += $lineTotalCents;

                $preparedItems[] = [
                    'menu_item_id' => (int) $menuItem->menu_item_id,
                    'item_name' => $menuItem->item_name,
                    'unit_price_decimal' => $this->fromCents($unitCents),
                    'quantity' => $quantity,
                    'line_total_decimal' => $this->fromCents($lineTotalCents),
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

        $totalMismatch = false;
        $computedGroupsSummary = [];
        foreach ($preparedGroups as $group) {
            $computedGroupsSummary[] = [
                'restaurant_id' => (int) $group['restaurant']->restaurant_id,
                'restaurant_name' => $group['restaurant']->restaurant_name,
                'subtotal_amount' => (float) $this->fromCents($group['subtotal_cents']),
                'delivery_fee' => (float) $this->fromCents($group['delivery_fee_cents']),
                'total_amount' => (float) $this->fromCents($group['total_cents']),
            ];
            if ($group['expected_total'] !== null && $this->toCents($group['expected_total']) !== $group['total_cents']) {
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
            $checkoutId = DB::transaction(function () use ($user, $idempotencyKey, $checkoutTotalCents, $preparedGroups, $customerName, $request): int {
            $now = now();

            $checkoutId = (int) DB::table('checkouts')->insertGetId([
                'customer_id' => $user->user_id,
                'idempotency_key' => $idempotencyKey,
                'checkout_status' => 'pending',
                'total_amount' => $this->fromCents($checkoutTotalCents),
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $createdOrderIds = [];

            foreach ($preparedGroups as $group) {
                $rest = $group['restaurant'];
                $addr = $group['address_snapshot'];
                $orderRef = $this->generateUniqueReference('orders', 'order_reference', 'SALO-ORD');
                $orderTotalDecimal = $this->fromCents($group['total_cents']);

                $orderId = (int) DB::table('orders')->insertGetId([
                    'checkout_id' => $checkoutId,
                    'restaurant_id' => $rest->restaurant_id,
                    'customer_id' => $user->user_id,
                    'restaurant_name' => $rest->restaurant_name,
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
                    'subtotal_amount' => $this->fromCents($group['subtotal_cents']),
                    'delivery_fee' => $this->fromCents($group['delivery_fee_cents']),
                    'total_amount' => $orderTotalDecimal,
                    'placed_at' => $now,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                $createdOrderIds[] = $orderId;

                foreach ($group['items'] as $item) {
                    DB::table('order_items')->insert([
                        'order_id' => $orderId,
                        'menu_item_id' => $item['menu_item_id'],
                        'item_name' => $item['item_name'],
                        'unit_price' => $item['unit_price_decimal'],
                        'quantity' => $item['quantity'],
                        'line_total' => $item['line_total_decimal'],
                        'created_at' => $now,
                    ]);
                }

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
                        'payment_method' => 'cod',
                    ],
                    request: $request,
                );
            }

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'customer_checkout_created',
                entityType: 'checkouts',
                entityId: $checkoutId,
                newValues: [
                    'idempotency_key' => $idempotencyKey,
                    'total_amount' => $this->fromCents($checkoutTotalCents),
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

        return [
            'checkout_id' => (int) $checkout->checkout_id,
            'idempotency_key' => $checkout->idempotency_key,
            'checkout_status' => $checkout->checkout_status,
            'total_amount' => (float) $checkout->total_amount,
            'payment_method' => 'cod',
            'orders' => $orders,
        ];
    }

    /**
     * Parse a decimal money string into integer centavos without floating-point arithmetic.
     */
    private function toCents(string $decimal): int
    {
        $clean = trim($decimal);
        if (str_starts_with($clean, '-')) {
            return 0;
        }
        $parts = explode('.', $clean, 2);
        $pesos = (int) preg_replace('/\D/', '', $parts[0] ?: '0');
        $centStr = str_pad(substr(preg_replace('/\D/', '', $parts[1] ?? ''), 0, 2), 2, '0', STR_PAD_RIGHT);

        return ($pesos * 100) + (int) $centStr;
    }

    private function fromCents(int $cents): string
    {
        $pesos = intdiv($cents, 100);
        $rem = $cents % 100;

        return sprintf('%d.%02d', $pesos, $rem);
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
