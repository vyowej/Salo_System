<?php

namespace App\Features\Admin\Controllers;

use App\Features\Admin\Services\AdminFinanceService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminFinanceController extends Controller
{
    public function __construct(
        private readonly AdminFinanceService $adminFinanceService,
    ) {}

    public function codRemittances(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->adminFinanceService->listCodRemittances($request->query()),
            message: 'COD remittances retrieved.',
        );
    }

    public function ledger(): JsonResponse
    {
        return ApiResponse::success(
            data: $this->adminFinanceService->ledgerOverview(),
            message: 'Ledger overview retrieved.',
        );
    }

    public function verifyCodRemittance(Request $request, int $deliveryId): JsonResponse
    {
        $verification = $this->adminFinanceService->verifyCodRemittance(
            deliveryId: $deliveryId,
            action: (string) $request->input('action', ''),
            notes: $request->input('notes'),
            admin: $request->user(),
            request: $request,
        );

        return ApiResponse::success(
            data: ['remittance' => $verification],
            message: 'COD remittance updated.',
        );
    }
}
