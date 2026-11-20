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
