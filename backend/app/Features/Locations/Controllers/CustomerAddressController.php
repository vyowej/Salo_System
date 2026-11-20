<?php

namespace App\Features\Locations\Controllers;

use App\Features\Locations\Requests\StoreCustomerAddressRequest;
use App\Features\Locations\Requests\UpdateCustomerAddressRequest;
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

    public function store(StoreCustomerAddressRequest $request): JsonResponse
    {
        $address = $this->customerAddresses->createForUser($request->user(), $request->validated());

        return ApiResponse::success(
            data: ['address' => $address],
            message: 'Address saved.',
            status: 201,
        );
    }

    public function update(UpdateCustomerAddressRequest $request, int $id): JsonResponse
    {
        $address = $this->customerAddresses->updateForUser($request->user(), $id, $request->validated());

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
