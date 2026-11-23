<?php

namespace App\Features\Restaurants\Services;

use App\Models\User;
use App\Support\AuditLogService;
use App\Support\WorkspaceAccessResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OwnerInventoryService
{
    public function __construct(
        private readonly AuditLogService $auditLogService,
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
    ) {}

    /**
     * Resolve and authorize an active restaurant for inventory configuration.
     * Owners and active staff with an inventory-authorized position may access.
     */
    public function requireActiveAuthorizedRestaurant(User $user, ?int $restaurantId = null): object
    {
        return $this->workspaceAccessResolver->requireActiveAuthorizedRestaurantForInventory($user, $restaurantId);
    }

    /**
     * @return array<string, mixed>
     */
    public function getConfig(User $user, ?int $restaurantId = null): array
    {
        $restaurant = $this->requireActiveAuthorizedRestaurant($user, $restaurantId);

        return $this->formatConfig(
            restaurantId: (int) $restaurant->restaurant_id,
            deductionMode: (string) ($restaurant->inventory_deduction_mode ?? 'manual'),
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function updateConfig(
        User $user,
        string $deductionMode,
        ?int $restaurantId = null,
        ?Request $request = null,
    ): array {
        $restaurant = $this->requireActiveAuthorizedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $normalizedMode = trim($deductionMode);
        $allowedModes = (array) config('salo.inventory.deduction_modes', ['manual', 'on_completion']);

        if (! in_array($normalizedMode, $allowedModes, true)) {
            throw ValidationException::withMessages([
                'deduction_mode' => ['Invalid deduction mode. Allowed values: '.implode(', ', $allowedModes).'.'],
            ]);
        }

        $previousMode = (string) ($restaurant->inventory_deduction_mode ?? 'manual');

        DB::transaction(function () use ($targetId, $normalizedMode, $previousMode, $user, $request): void {
            DB::table('restaurants')
                ->where('restaurant_id', $targetId)
                ->update([
                    'inventory_deduction_mode' => $normalizedMode,
                    'updated_at' => now(),
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'inventory_config_updated',
                entityType: 'restaurants',
                entityId: $targetId,
                oldValues: ['deduction_mode' => $previousMode],
                newValues: ['deduction_mode' => $normalizedMode],
                reason: null,
                request: $request,
            );
        });

        return $this->formatConfig(
            restaurantId: $targetId,
            deductionMode: $normalizedMode,
        );
    }

    /**
     * Update a menu item's availability and/or stock tracking from the Inventory workspace.
     *
     * @return array<string, mixed>
     */
    public function updateItemAvailability(
        User $user,
        int $itemId,
        ?string $availabilityStatus = null,
        ?int $restaurantId = null,
        ?Request $request = null,
        bool $hasStockQuantity = false,
        ?int $stockQuantity = null,
        bool $hasLowStockThreshold = false,
        ?int $lowStockThreshold = null,
        ?string $reason = null,
    ): array {
        $restaurant = $this->requireActiveAuthorizedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $normalized = null;
        if ($availabilityStatus !== null) {
            $normalized = trim($availabilityStatus);
            if (! in_array($normalized, ['available', 'temporarily_unavailable', 'sold_out'], true)) {
                throw ValidationException::withMessages([
                    'availability_status' => ['Availability status must be available, temporarily_unavailable, or sold_out.'],
                ]);
            }
        }

        if ($hasStockQuantity && $stockQuantity !== null && $stockQuantity < 0) {
            throw ValidationException::withMessages([
                'stock_quantity' => ['Stock quantity cannot be negative.'],
            ]);
        }

        if ($hasLowStockThreshold && $lowStockThreshold !== null && $lowStockThreshold < 0) {
            throw ValidationException::withMessages([
                'low_stock_threshold' => ['Low-stock threshold cannot be negative.'],
            ]);
        }

        $item = DB::table('menu_items')
            ->where('menu_item_id', $itemId)
            ->where('restaurant_id', $targetId)
            ->first();

        abort_unless($item !== null, 404, 'Menu item not found.');

        $previousStatus = (string) $item->availability_status;
        $previousStock = $item->stock_quantity !== null ? (int) $item->stock_quantity : null;
        $previousThreshold = $item->low_stock_threshold !== null ? (int) $item->low_stock_threshold : null;

        $nextStock = $hasStockQuantity ? $stockQuantity : $previousStock;
        $nextThreshold = $hasLowStockThreshold ? $lowStockThreshold : $previousThreshold;
        $nextStatus = $normalized ?? $previousStatus;

        if ($hasStockQuantity && $normalized === null) {
            if ($nextStock === 0) {
                $nextStatus = 'sold_out';
            } elseif ($nextStock !== null && $nextStock > 0 && $previousStatus === 'sold_out') {
                $nextStatus = 'available';
            }
        }

        DB::transaction(function () use (
            $itemId,
            $targetId,
            $nextStatus,
            $nextStock,
            $nextThreshold,
            $previousStatus,
            $previousStock,
            $previousThreshold,
            $reason,
            $user,
            $request
        ): void {
            DB::table('menu_items')
                ->where('menu_item_id', $itemId)
                ->where('restaurant_id', $targetId)
                ->update([
                    'availability_status' => $nextStatus,
                    'stock_quantity' => $nextStock,
                    'low_stock_threshold' => $nextThreshold,
                    'updated_at' => now(),
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'inventory_item_availability_updated',
                entityType: 'menu_items',
                entityId: $itemId,
                oldValues: [
                    'availability_status' => $previousStatus,
                    'stock_quantity' => $previousStock,
                    'low_stock_threshold' => $previousThreshold,
                ],
                newValues: [
                    'availability_status' => $nextStatus,
                    'stock_quantity' => $nextStock,
                    'low_stock_threshold' => $nextThreshold,
                ],
                reason: $reason !== null && trim($reason) !== '' ? trim($reason) : null,
                request: $request,
            );
        });

        return [
            'menu_item_id' => $itemId,
            'restaurant_id' => $targetId,
            'availability_status' => $nextStatus,
            'stock_quantity' => $nextStock,
            'low_stock_threshold' => $nextThreshold,
            'is_low_stock' => $nextStock !== null && $nextStock > 0 && $nextStock <= ($nextThreshold ?? 5),
        ];
    }

    /**
     * Deduct tracked menu item stock for an order once (idempotent via orders.inventory_deducted_at).
     */
    public function deductStockForOrderIfConfigured(int $orderId, ?int $actorUserId = null): void
    {
        $order = DB::table('orders')->where('order_id', $orderId)->lockForUpdate()->first();
        if (! $order || $order->inventory_deducted_at !== null) {
            return;
        }

        $restaurant = DB::table('restaurants')->where('restaurant_id', $order->restaurant_id)->first();
        if (! $restaurant || ($restaurant->inventory_deduction_mode ?? 'manual') !== 'on_completion') {
            return;
        }

        $orderItems = DB::table('order_items')
            ->where('order_id', $orderId)
            ->get(['menu_item_id', 'quantity']);

        $deductions = [];
        foreach ($orderItems as $oi) {
            $menuItem = DB::table('menu_items')
                ->where('menu_item_id', $oi->menu_item_id)
                ->lockForUpdate()
                ->first();

            if (! $menuItem || $menuItem->stock_quantity === null) {
                continue;
            }

            $before = (int) $menuItem->stock_quantity;
            $after = max(0, $before - (int) $oi->quantity);
            $nextStatus = $after === 0 ? 'sold_out' : $menuItem->availability_status;

            DB::table('menu_items')
                ->where('menu_item_id', $menuItem->menu_item_id)
                ->update([
                    'stock_quantity' => $after,
                    'availability_status' => $nextStatus,
                    'updated_at' => now(),
                ]);

            $deductions[] = [
                'menu_item_id' => (int) $menuItem->menu_item_id,
                'before' => $before,
                'after' => $after,
            ];
        }

        DB::table('orders')
            ->where('order_id', $orderId)
            ->update(['inventory_deducted_at' => now()]);

        if ($deductions !== [] && $actorUserId !== null) {
            $this->auditLogService->record(
                actorUserId: $actorUserId,
                action: 'order_inventory_deducted',
                entityType: 'orders',
                entityId: $orderId,
                oldValues: null,
                newValues: ['deductions' => $deductions],
            );
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function formatConfig(int $restaurantId, string $deductionMode): array
    {
        return [
            'restaurant_id' => $restaurantId,
            'deduction_mode' => $deductionMode,
        ];
    }
}
