<?php

namespace App\Features\Admin\Controllers;

use App\Features\Admin\Services\AdminReportService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AdminReportController extends Controller
{
    public function __construct(
        private readonly AdminReportService $reportService,
    ) {}

    public function summary(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->reportService->getSummary($request->query()),
            message: 'Report summary retrieved.',
        );
    }

    public function export(Request $request): Response
    {
        $type = trim((string) $request->query('type', 'orders'));
        $result = $this->reportService->exportCsv(
            type: $type,
            filters: $request->query(),
            admin: $request->user(),
            request: $request,
        );

        return response($result['csv'], 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$result['filename'].'"',
        ]);
    }
}
