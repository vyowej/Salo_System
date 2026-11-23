<?php

namespace App\Features\Riders\Controllers;

use App\Features\Applications\Services\ProfileChangeRequestService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RiderChangeRequestController extends Controller
{
    public function __construct(
        private readonly ProfileChangeRequestService $profileChangeRequestService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: ['requests' => $this->profileChangeRequestService->listRiderRequests($request->user())],
            message: 'Rider change requests retrieved.',
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'vehicle_type' => ['sometimes', 'string', 'in:motorcycle,bicycle,e_bike,e_scooter,walking'],
            'vehicle_brand' => ['sometimes', 'nullable', 'string', 'max:100'],
            'vehicle_model' => ['sometimes', 'nullable', 'string', 'max:100'],
            'vehicle_color' => ['sometimes', 'nullable', 'string', 'max:50'],
            'vehicle_year' => ['sometimes', 'nullable', 'integer', 'min:1980', 'max:2100'],
            'plate_number' => ['sometimes', 'nullable', 'string', 'max:30'],
            'mv_file_number' => ['sometimes', 'nullable', 'string', 'max:20'],
            'vehicle_ownership' => ['sometimes', 'nullable', 'string', 'in:personally_owned,family_owned,borrowed,rented_leased,company_owned'],
            'vehicle_owner_name' => ['sometimes', 'nullable', 'string', 'max:150'],
            'vehicle_owner_relationship' => ['sometimes', 'nullable', 'string', 'max:100'],
            'bicycle_type' => ['sometimes', 'nullable', 'string', 'in:road,mountain,city_commuter,folding,gravel,cargo,other'],
            'motor_wattage' => ['sometimes', 'nullable', 'string', 'max:50'],
            'base_city_id' => ['sometimes', 'integer', 'exists:cities,city_id'],
            'reason' => ['nullable', 'string', 'max:1000'],
            'documents' => ['sometimes', 'array', 'max:5'],
            'documents.*' => ['file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ]);

        $documents = $request->file('documents', []);
        if (! is_array($documents)) {
            $documents = $documents ? [$documents] : [];
        }

        $created = $this->profileChangeRequestService->submitRiderRequest(
            user: $request->user(),
            validated: $validated,
            documents: $documents,
            request: $request,
        );

        return ApiResponse::success(
            data: ['request' => $created],
            message: 'Verification change request submitted for administrator approval.',
            status: 201,
        );
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $updated = $this->profileChangeRequestService->cancelRequest($request->user(), $id, 'rider', $request);

        return ApiResponse::success(
            data: ['request' => $updated],
            message: 'Change request cancelled.',
        );
    }

    public function document(Request $request, int $id, int $index): Response
    {
        return $this->profileChangeRequestService->streamDocument($request->user(), $id, $index);
    }
}
