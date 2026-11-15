<?php

namespace App\Features\Locations\Controllers;

use App\Features\Locations\Services\CustomerAddressService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerAddressController extends Controller
{
    public function __construct(
        private readonly CustomerAddressService $customerAddresses,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: ['addresses' => $this->customerAddresses->listForUser($request->user())],
            message: 'Customer addresses retrieved.',
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'label' => ['required', 'string', 'max:50'],
            'recipient_name' => ['nullable', 'string', 'max:150'],
            'recipient_phone' => ['nullable', 'string', 'max:30'],
            'province' => ['required', 'string', 'max:100'],
            'city' => ['required', 'string', 'max:100'],
            'barangay' => ['required', 'string', 'max:100'],
            'street' => ['required', 'string', 'max:255'],
            'house_number' => ['nullable', 'string', 'max:50'],
            'building_name' => ['nullable', 'string', 'max:150'],
            'landmark' => ['nullable', 'string', 'max:500'],
            'postal_code' => ['nullable', 'regex:/^\d{4}$/'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'gps_accuracy' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'is_default' => ['sometimes', 'boolean'],
        ]);

        $address = $this->customerAddresses->createForUser($request->user(), $validated);

        return ApiResponse::success(
            data: ['address' => $address],
            message: 'Address saved.',
            status: 201,
        );
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'label' => ['sometimes', 'string', 'max:50'],
            'recipient_name' => ['nullable', 'string', 'max:150'],
            'recipient_phone' => ['nullable', 'string', 'max:30'],
            'province' => ['sometimes', 'string', 'max:100'],
            'city' => ['sometimes', 'string', 'max:100'],
            'barangay' => ['sometimes', 'string', 'max:100'],
            'street' => ['sometimes', 'string', 'max:255'],
            'house_number' => ['nullable', 'string', 'max:50'],
            'building_name' => ['nullable', 'string', 'max:150'],
            'landmark' => ['nullable', 'string', 'max:500'],
            'postal_code' => ['nullable', 'regex:/^\d{4}$/'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'gps_accuracy' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'is_default' => ['sometimes', 'boolean'],
        ]);

        $address = $this->customerAddresses->updateForUser($request->user(), $id, $validated);

        return ApiResponse::success(
            data: ['address' => $address],
            message: 'Address updated.',
        );
    }

    public function setDefault(Request $request, int $id): JsonResponse
    {
        $addresses = $this->customerAddresses->setDefaultForUser($request->user(), $id);

        return ApiResponse::success(
            data: ['addresses' => $addresses],
            message: 'Default address updated.',
        );
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $addresses = $this->customerAddresses->deleteForUser($request->user(), $id);

        return ApiResponse::success(
            data: ['addresses' => $addresses],
            message: 'Address deleted.',
        );
    }
}
