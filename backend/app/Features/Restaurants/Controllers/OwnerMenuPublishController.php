<?php

namespace App\Features\Restaurants\Controllers;

use App\Features\Restaurants\Requests\DiscardMenuChangesRequest;
use App\Features\Restaurants\Requests\PublishMenuRequest;
use App\Features\Restaurants\Requests\UnpublishRestaurantRequest;
use App\Features\Restaurants\Services\MenuPublishService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OwnerMenuPublishController extends Controller
{
    public function __construct(
        private readonly MenuPublishService $menuPublishService,
    ) {}

    public function status(Request $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        return ApiResponse::success(
            data: ['publish_status' => $this->menuPublishService->getPublishStatus($request->user(), $restaurantId)],
            message: 'Menu publish status retrieved.',
        );
    }

    public function preview(Request $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        return ApiResponse::success(
            data: $this->menuPublishService->preview($request->user(), $restaurantId),
            message: 'Menu preview retrieved.',
        );
    }

    public function publish(PublishMenuRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $restaurantId = isset($validated['restaurant_id']) ? (int) $validated['restaurant_id'] : $this->resolveRestaurantId($request);
        $result = $this->menuPublishService->publish($request->user(), $restaurantId, $request);

        return ApiResponse::success(
            data: $result,
            message: $result['changed'] ? 'Restaurant menu published.' : 'Nothing to publish. Your live menu is already up to date.',
        );
    }

    public function unpublish(UnpublishRestaurantRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $restaurantId = isset($validated['restaurant_id']) ? (int) $validated['restaurant_id'] : $this->resolveRestaurantId($request);
        $status = $this->menuPublishService->unpublish(
            user: $request->user(),
            reason: $validated['reason'] ?? null,
            restaurantId: $restaurantId,
            request: $request,
        );

        return ApiResponse::success(
            data: ['publish_status' => $status],
            message: 'Restaurant unpublished and hidden from customers.',
        );
    }

    public function discard(DiscardMenuChangesRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $restaurantId = isset($validated['restaurant_id']) ? (int) $validated['restaurant_id'] : $this->resolveRestaurantId($request);
        $status = $this->menuPublishService->discardChanges($request->user(), $restaurantId, $request);

        return ApiResponse::success(
            data: ['publish_status' => $status],
            message: 'Unpublished menu changes discarded.',
        );
    }

    private function resolveRestaurantId(Request $request): ?int
    {
        $raw = $request->query('restaurant_id', $request->input('restaurant_id'));

        return is_numeric($raw) ? (int) $raw : null;
    }
}
