<?php

namespace App\Features\Restaurants\Controllers;

use App\Features\Applications\Services\ProfileChangeRequestService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RestaurantChangeRequestController extends Controller
{
    public function __construct(
        private readonly ProfileChangeRequestService $profileChangeRequestService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $restaurantId = is_numeric($request->query('restaurant_id')) ? (int) $request->query('restaurant_id') : null;

        return ApiResponse::success(
            data: ['requests' => $this->profileChangeRequestService->listRestaurantRequests($request->user(), $restaurantId)],
            message: 'Restaurant change requests retrieved.',
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'restaurant_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'restaurant_name' => ['sometimes', 'string', 'min:2', 'max:200'],
            'registered_name' => ['sometimes', 'nullable', 'string', 'max:200'],
            'business_type' => ['sometimes', 'string', 'in:restaurant,cafe,bakery,fast_food,food_stall,food_kiosk,cloud_kitchen,other'],
            'ownership_structure' => ['sometimes', 'string', 'in:sole_proprietorship,partnership,corporation,cooperative,other'],
            'reason' => ['nullable', 'string', 'max:1000'],
            'documents' => ['sometimes', 'array', 'max:5'],
            'documents.*' => ['file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ]);

        $restaurantId = isset($validated['restaurant_id']) ? (int) $validated['restaurant_id'] : null;
        $documents = $request->file('documents', []);
        if (! is_array($documents)) {
            $documents = $documents ? [$documents] : [];
        }

        $created = $this->profileChangeRequestService->submitRestaurantRequest(
            user: $request->user(),
            validated: $validated,
            documents: $documents,
            restaurantId: $restaurantId,
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
        $updated = $this->profileChangeRequestService->cancelRequest($request->user(), $id, 'restaurant', $request);

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
