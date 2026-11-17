<?php

namespace App\Features\Admin\Controllers;

use App\Features\Admin\Services\AdminApplicationService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminApplicationController extends Controller
{
    public function __construct(
        private readonly AdminApplicationService $adminApplicationService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $type = in_array($request->query('type'), ['restaurant', 'rider'], true)
            ? (string) $request->query('type')
            : 'restaurant';

        $result = $this->adminApplicationService->listApplications($type, $request->query());

        return ApiResponse::success(
            data: $result,
            message: 'Applications retrieved.',
        );
    }

    public function show(string $type, int $id): JsonResponse
    {
        abort_unless(in_array($type, ['restaurant', 'rider'], true), 404, 'Invalid application type.');

        $application = $this->adminApplicationService->getApplicationDetail($type, $id);

        return ApiResponse::success(
            data: ['application' => $application],
            message: 'Application detail retrieved.',
        );
    }

    public function reviewDocument(Request $request, string $type, int $id, int $documentId): JsonResponse
    {
        abort_unless(in_array($type, ['restaurant', 'rider'], true), 404, 'Invalid application type.');

        $validated = $request->validate([
            'status' => ['required', 'string', Rule::in(['verified', 'rejected'])],
            'review_note' => ['nullable', 'string', 'max:500'],
        ]);

        $application = $this->adminApplicationService->reviewDocument(
            type: $type,
            applicationId: $id,
            documentId: $documentId,
            status: (string) $validated['status'],
            reviewNote: $validated['review_note'] ?? null,
            admin: $request->user(),
            request: $request,
        );

        return ApiResponse::success(
            data: ['application' => $application],
            message: 'Document review saved.',
        );
    }

    public function requestDocument(Request $request, string $type, int $id): JsonResponse
    {
        abort_unless(in_array($type, ['restaurant', 'rider'], true), 404, 'Invalid application type.');

        $validated = $request->validate([
            'document_name' => ['required', 'string', 'max:150'],
            'reason' => ['required', 'string', 'max:1000'],
            'instructions' => ['nullable', 'string', 'max:1000'],
            'due_date' => ['nullable', 'date', 'after_or_equal:today'],
        ]);

        $application = $this->adminApplicationService->requestDocument(
            type: $type,
            applicationId: $id,
            data: $validated,
            admin: $request->user(),
            request: $request,
        );

        return ApiResponse::success(
            data: ['application' => $application],
            message: 'Document request sent to applicant.',
            status: 201,
        );
    }

    public function decide(Request $request, string $type, int $id): JsonResponse
    {
        abort_unless(in_array($type, ['restaurant', 'rider'], true), 404, 'Invalid application type.');

        $validated = $request->validate([
            'decision' => ['required', 'string', Rule::in(['under_review', 'additional_documents_required', 'approve', 'reject'])],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        $application = $this->adminApplicationService->decideApplication(
            type: $type,
            applicationId: $id,
            decision: (string) $validated['decision'],
            note: $validated['note'] ?? null,
            admin: $request->user(),
            request: $request,
        );

        return ApiResponse::success(
            data: ['application' => $application],
            message: 'Application decision saved.',
        );
    }
}
