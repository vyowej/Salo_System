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
     * Update a menu item's stock/availability status from the Inventory workspace.
     *
     * @return array<string, mixed>
     */
    public function updateItemAvailability(
        User $user,
        int $itemId,
        string $availabilityStatus,
        ?int $restaurantId = null,
        ?Request $request = null,
    ): array {
        $restaurant = $this->requireActiveAuthorizedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $normalized = trim($availabilityStatus);
        if (! in_array($normalized, ['available', 'temporarily_unavailable', 'sold_out'], true)) {
            throw ValidationException::withMessages([
                'availability_status' => ['Availability status must be available, temporarily_unavailable, or sold_out.'],
            ]);
        }

        $item = DB::table('menu_items')
            ->where('menu_item_id', $itemId)
            ->where('restaurant_id', $targetId)
            ->first();

        abort_unless($item !== null, 404, 'Menu item not found.');

        $previous = (string) $item->availability_status;

        DB::transaction(function () use ($itemId, $targetId, $normalized, $previous, $user, $request): void {
            DB::table('menu_items')
                ->where('menu_item_id', $itemId)
                ->where('restaurant_id', $targetId)
                ->update([
                    'availability_status' => $normalized,
                    'updated_at' => now(),
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'inventory_item_availability_updated',
                entityType: 'menu_items',
                entityId: $itemId,
                oldValues: ['availability_status' => $previous],
                newValues: ['availability_status' => $normalized],
                request: $request,
            );
        });

        return [
            'menu_item_id' => $itemId,
            'restaurant_id' => $targetId,
            'availability_status' => $normalized,
        ];
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
