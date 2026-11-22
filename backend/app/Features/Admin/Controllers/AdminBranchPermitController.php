<?php

namespace App\Features\Admin\Controllers;

use App\Features\Admin\Services\AdminBranchPermitService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminBranchPermitController extends Controller
{
    public function __construct(
        private readonly AdminBranchPermitService $adminBranchPermitService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', 'string', 'max:40'],
            'search' => ['nullable', 'string', 'max:120'],
            'submitted_date' => ['nullable', 'date_format:Y-m-d'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        return ApiResponse::success(
            data: $this->adminBranchPermitService->listPermits($validated),
            message: 'Branch permits retrieved.',
        );
    }

    public function show(int $permitId): JsonResponse
    {
        return ApiResponse::success(
            data: ['permit' => $this->adminBranchPermitService->getPermitDetail($permitId)],
            message: 'Branch permit detail retrieved.',
        );
    }

    public function file(int $permitId): StreamedResponse
    {
        return $this->adminBranchPermitService->streamPermitFile($permitId);
    }

    public function startReview(Request $request, int $permitId): JsonResponse
    {
        $validated = $request->validate([
            'review_note' => ['nullable', 'string', 'max:500'],
        ]);

        return ApiResponse::success(
            data: [
                'permit' => $this->adminBranchPermitService->performAction(
                    permitId: $permitId,
                    action: 'start_review',
                    admin: $request->user(),
                    note: $validated['review_note'] ?? null,
                    request: $request,
                ),
            ],
            message: 'Branch permit review started.',
        );
    }

    public function approve(Request $request, int $permitId): JsonResponse
    {
        $validated = $request->validate([
            'review_note' => ['nullable', 'string', 'max:500'],
        ]);

        return ApiResponse::success(
            data: [
                'permit' => $this->adminBranchPermitService->performAction(
                    permitId: $permitId,
                    action: 'approve',
                    admin: $request->user(),
                    note: $validated['review_note'] ?? null,
                    request: $request,
                ),
            ],
            message: 'Branch permit approved.',
        );
    }

    public function reject(Request $request, int $permitId): JsonResponse
    {
        $validated = $request->validate([
            'review_note' => ['nullable', 'string', 'max:500'],
        ]);

        return ApiResponse::success(
            data: [
                'permit' => $this->adminBranchPermitService->performAction(
                    permitId: $permitId,
                    action: 'reject',
                    admin: $request->user(),
                    note: $validated['review_note'] ?? null,
                    request: $request,
                ),
            ],
            message: 'Branch permit rejected.',
        );
    }

    public function requestInfo(Request $request, int $permitId): JsonResponse
    {
        $validated = $request->validate([
            'review_note' => ['nullable', 'string', 'max:500'],
        ]);

        return ApiResponse::success(
            data: [
                'permit' => $this->adminBranchPermitService->performAction(
                    permitId: $permitId,
                    action: 'request_info',
                    admin: $request->user(),
                    note: $validated['review_note'] ?? null,
                    request: $request,
                ),
            ],
            message: 'Additional information requested for branch permit.',
        );
    }

    public function waive(Request $request, int $permitId): JsonResponse
    {
        $validated = $request->validate([
            'review_note' => ['nullable', 'string', 'max:500'],
        ]);

        return ApiResponse::success(
            data: [
                'permit' => $this->adminBranchPermitService->performAction(
                    permitId: $permitId,
                    action: 'waive',
                    admin: $request->user(),
                    note: $validated['review_note'] ?? null,
                    request: $request,
                ),
            ],
            message: 'Branch permit requirement waived.',
        );
    }

    public function reopen(Request $request, int $permitId): JsonResponse
    {
        $validated = $request->validate([
            'review_note' => ['nullable', 'string', 'max:500'],
        ]);

        return ApiResponse::success(
            data: [
                'permit' => $this->adminBranchPermitService->performAction(
                    permitId: $permitId,
                    action: 'reopen',
                    admin: $request->user(),
                    note: $validated['review_note'] ?? null,
                    request: $request,
                ),
            ],
            message: 'Branch permit reopened for review.',
        );
    }
}
