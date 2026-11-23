<?php

namespace App\Features\Riders\Controllers;

use App\Features\Riders\Services\RiderFinanceService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RiderFinanceController extends Controller
{
    public function __construct(
        private readonly RiderFinanceService $riderFinanceService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->riderFinanceService->getFinanceSummary($request->user(), $request->query()),
            message: 'Rider finance summary retrieved.',
        );
    }

    public function remit(Request $request): JsonResponse
    {
        $deliveryIds = $request->input('delivery_ids', []);
        if (! is_array($deliveryIds)) {
            $deliveryIds = [];
        }

        $result = $this->riderFinanceService->submitCodRemittance(
            user: $request->user(),
            deliveryIds: $deliveryIds,
            notes: $request->input('notes'),
            request: $request,
        );

        return ApiResponse::success(
            data: $result,
            message: 'COD remittance submitted for verification.',
        );
    }
}
