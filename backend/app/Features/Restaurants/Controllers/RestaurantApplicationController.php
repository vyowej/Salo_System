<?php

namespace App\Features\Restaurants\Controllers;

use App\Features\Restaurants\Requests\SubmitRestaurantApplicationRequest;
use App\Features\Restaurants\Requests\UploadRestaurantApplicationDocumentRequest;
use App\Features\Restaurants\Services\BranchPermitService;
use App\Features\Restaurants\Services\RestaurantApplicationService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RestaurantApplicationController extends Controller
{
    public function __construct(
        private readonly RestaurantApplicationService $restaurantApplicationService,
        private readonly BranchPermitService $branchPermitService,
    ) {}

    public function store(SubmitRestaurantApplicationRequest $request): JsonResponse
    {
        $documentFiles = $request->file('documents', []);
        if (! is_array($documentFiles)) {
            $documentFiles = [];
        }

        $menuItemPhotos = $request->file('menu_item_photos', []);
        if (! is_array($menuItemPhotos)) {
            $menuItemPhotos = [];
        }

        $application = $this->restaurantApplicationService->submit(
            user: $request->user(),
            validated: $request->validated(),
            documentFiles: $documentFiles,
            logoFile: $request->file('logo_image'),
            coverFile: $request->file('cover_image'),
            menuItemPhotos: $menuItemPhotos,
            request: $request,
        );

        return ApiResponse::success(
            data: ['application' => $application],
            message: 'Restaurant partner application submitted successfully.',
            status: 201,
        );
    }

    public function current(Request $request): JsonResponse
    {
        $application = $this->restaurantApplicationService->getCurrentForUser($request->user());

        return ApiResponse::success(
            data: ['application' => $application],
            message: $application ? 'Restaurant application retrieved.' : 'No restaurant application found.',
        );
    }

    public function uploadDocument(UploadRestaurantApplicationDocumentRequest $request, int $id): JsonResponse
    {
        $validated = $request->validated();

        $application = $this->restaurantApplicationService->uploadDocument(
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

    public function submitBranchPermit(Request $request, int $id, int $branchId): JsonResponse
    {
        $validated = $request->validate([
            'mayors_permit' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
            'is_required_locally' => ['nullable', 'boolean'],
            'exemption_reason' => ['nullable', 'string', 'max:500'],
        ]);

        $permit = $this->branchPermitService->submitOrUpdateForApplicationBranch(
            applicant: $request->user(),
            applicationId: $id,
            applicationBranchId: $branchId,
            file: $request->file('mayors_permit'),
            validated: $validated,
            request: $request,
        );

        return ApiResponse::success(
            data: ['permit' => $permit],
            message: 'Application branch permit submitted for review.',
        );
    }

    public function branchPermitFile(Request $request, int $id, int $branchId): Response
    {
        return $this->branchPermitService->streamApplicationBranchPermitFile(
            user: $request->user(),
            applicationId: $id,
            applicationBranchId: $branchId,
        );
    }
}
