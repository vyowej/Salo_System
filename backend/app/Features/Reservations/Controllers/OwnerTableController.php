<?php

namespace App\Features\Reservations\Controllers;

use App\Features\Reservations\Requests\ListOwnerTablesRequest;
use App\Features\Reservations\Requests\StoreOwnerTableRequest;
use App\Features\Reservations\Requests\UpdateOwnerTableRequest;
use App\Features\Reservations\Services\OwnerTableService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OwnerTableController extends Controller
{
    public function __construct(
        private readonly OwnerTableService $ownerTableService,
    ) {}

    public function index(ListOwnerTablesRequest $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: $this->ownerTableService->listTables($request->user(), $validated, $restaurantId),
            message: 'Restaurant tables retrieved.',
        );
    }

    public function store(StoreOwnerTableRequest $request): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: ['table' => $this->ownerTableService->createTable($request->user(), $validated, $restaurantId, $request)],
            message: 'Restaurant table created.',
            status: 201,
        );
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $date = is_string($request->query('date')) ? $request->query('date') : null;

        return ApiResponse::success(
            data: ['table' => $this->ownerTableService->showTable($request->user(), $id, $restaurantId, $date)],
            message: 'Restaurant table retrieved.',
        );
    }

    public function update(UpdateOwnerTableRequest $request, int $id): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);
        $validated = $request->validated();

        return ApiResponse::success(
            data: ['table' => $this->ownerTableService->updateTable($request->user(), $id, $validated, $restaurantId, $request)],
            message: 'Restaurant table updated.',
        );
    }

    public function archive(Request $request, int $id): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        return ApiResponse::success(
            data: ['table' => $this->ownerTableService->archiveTable($request->user(), $id, $restaurantId, $request)],
            message: 'Restaurant table archived.',
        );
    }

    public function reactivate(Request $request, int $id): JsonResponse
    {
        $restaurantId = $this->resolveRestaurantId($request);

        return ApiResponse::success(
            data: ['table' => $this->ownerTableService->reactivateTable($request->user(), $id, $restaurantId, $request)],
            message: 'Restaurant table reactivated.',
        );
    }

    private function resolveRestaurantId(Request $request): ?int
    {
        $raw = $request->input('restaurant_id') ?? $request->query('restaurant_id');
        if ($raw === null || $raw === '') {
            return null;
        }

        return is_numeric($raw) ? (int) $raw : null;
    }
}
