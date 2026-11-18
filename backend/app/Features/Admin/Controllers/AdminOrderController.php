<?php

namespace App\Features\Admin\Controllers;

use App\Features\Admin\Services\AdminOrderService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminOrderController extends Controller
{
    public function __construct(
        private readonly AdminOrderService $adminOrderService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
            'order_status' => ['sometimes', 'nullable', 'string', Rule::in(array_merge(['all'], AdminOrderService::ORDER_STATUSES))],
            'order_type' => ['sometimes', 'nullable', 'string', Rule::in(array_merge(['all'], AdminOrderService::ORDER_TYPES))],
            'payment_status' => ['sometimes', 'nullable', 'string', Rule::in(array_merge(['all'], AdminOrderService::PAYMENT_STATUSES))],
            'date_from' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'date_to' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'direction' => ['sometimes', 'nullable', 'string', Rule::in(['asc', 'desc'])],
        ]);

        return ApiResponse::success(
            data: $this->adminOrderService->listOrders($validated),
            message: 'Orders retrieved.',
        );
    }
}
