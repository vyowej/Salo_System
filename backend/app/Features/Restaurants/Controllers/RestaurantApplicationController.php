<?php

namespace App\Features\Restaurants\Controllers;

use App\Features\Restaurants\Requests\SubmitRestaurantApplicationRequest;
use App\Features\Restaurants\Services\RestaurantApplicationService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RestaurantApplicationController extends Controller
{
    public function __construct(
        private readonly RestaurantApplicationService $restaurantApplicationService,
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

    public function uploadDocument(Request $request, int $id): JsonResponse
    {
        $maxKb = max(256, (int) config('salo.uploads.max_size_kb', 5120));
        $docMimes = implode(',', (array) config('salo.uploads.allowed_document_types', ['pdf', 'jpg', 'jpeg', 'png']));

        $validated = $request->validate([
            'document_code' => ['required', 'string'],
            'request_id' => ['nullable', 'integer'],
            'file' => ['required', 'file', "mimes:{$docMimes}", "max:{$maxKb}"],
        ]);

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
}
