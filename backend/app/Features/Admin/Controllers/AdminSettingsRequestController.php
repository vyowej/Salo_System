<?php

namespace App\Features\Admin\Controllers;

use App\Features\Applications\Services\ProfileChangeRequestService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminSettingsRequestController extends Controller
{
    public function __construct(
        private readonly ProfileChangeRequestService $profileChangeRequestService,
    ) {}

    public function changeRequests(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: ['requests' => $this->profileChangeRequestService->listForAdmin($request->query())],
            message: 'Profile change requests retrieved.',
        );
    }

    public function decideChangeRequest(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'decision' => ['required', 'string', 'in:approve,reject'],
            'review_note' => ['nullable', 'string', 'max:1000'],
        ]);

        $updated = $this->profileChangeRequestService->decideChangeRequest(
            requestId: $id,
            decision: $validated['decision'],
            reviewNote: $validated['review_note'] ?? null,
            admin: $request->user(),
            request: $request,
        );

        return ApiResponse::success(
            data: ['request' => $updated],
            message: 'Change request '.$validated['decision'].'d.',
        );
    }

    public function changeRequestDocument(Request $request, int $id, int $index): StreamedResponse
    {
        return $this->profileChangeRequestService->streamDocument($request->user(), $id, $index);
    }

    public function lifecycleRequests(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: ['requests' => $this->profileChangeRequestService->listLifecycleForAdmin($request->query())],
            message: 'Account lifecycle requests retrieved.',
        );
    }

    public function decideLifecycleRequest(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'decision' => ['required', 'string', 'in:approve,reject'],
            'review_note' => ['nullable', 'string', 'max:1000'],
        ]);

        $updated = $this->profileChangeRequestService->decideLifecycleRequest(
            lifecycleRequestId: $id,
            decision: $validated['decision'],
            reviewNote: $validated['review_note'] ?? null,
            admin: $request->user(),
            request: $request,
        );

        return ApiResponse::success(
            data: ['request' => $updated],
            message: 'Account lifecycle request '.$validated['decision'].'d.',
        );
    }
}
