<?php

namespace App\Features\Riders\Controllers;

use App\Features\Riders\Requests\SubmitRiderApplicationRequest;
use App\Features\Riders\Requests\UploadRiderDocumentRequest;
use App\Features\Riders\Services\RiderApplicationService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RiderApplicationController extends Controller
{
    public function __construct(
        private readonly RiderApplicationService $riderApplicationService,
    ) {}

    public function store(SubmitRiderApplicationRequest $request): JsonResponse
    {
        $documentFiles = $request->file('documents', []);
        if (! is_array($documentFiles)) {
            $documentFiles = [];
        }

        $application = $this->riderApplicationService->submit(
            user: $request->user(),
            validated: $request->validated(),
            documentFiles: $documentFiles,
            request: $request,
        );

        return ApiResponse::success(
            data: ['application' => $application],
            message: 'Rider application submitted successfully.',
            status: 201,
        );
    }

    public function current(Request $request): JsonResponse
    {
        $application = $this->riderApplicationService->getCurrentForUser($request->user());

        return ApiResponse::success(
            data: ['application' => $application],
            message: $application ? 'Rider application retrieved.' : 'No rider application found.',
        );
    }

    public function uploadDocument(UploadRiderDocumentRequest $request, int $id): JsonResponse
    {
        $validated = $request->validated();

        $application = $this->riderApplicationService->uploadDocument(
            user: $request->user(),
            applicationId: $id,
            documentCode: (string) $validated['document_code'],
            file: $request->file('file'),
            requestId: isset($validated['request_id']) ? (int) $validated['request_id'] : null,
            request: $request,
        );

        return ApiResponse::success(
            data: ['application' => $application],
            message: 'Document uploaded successfully.',
        );
    }
}
