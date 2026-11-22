<?php

namespace App\Features\Restaurants\Controllers;

use App\Features\Restaurants\Requests\StoreBranchRequest;
use App\Features\Restaurants\Services\BranchPermitService;
use App\Features\Restaurants\Services\OwnerBranchService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class OwnerBranchController extends Controller
{
    public function __construct(
        private readonly OwnerBranchService $ownerBranchService,
        private readonly BranchPermitService $branchPermitService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: ['branches' => $this->ownerBranchService->listAccessibleBranches($request->user())],
            message: 'Accessible branches retrieved.',
        );
    }

    public function store(StoreBranchRequest $request): JsonResponse
    {
        $branch = $this->ownerBranchService->createBranch(
            owner: $request->user(),
            validated: $request->validated(),
            request: $request,
        );

        return ApiResponse::success(
            data: ['branch' => $branch],
            message: 'Branch created successfully.',
            status: 201,
        );
    }

    public function submitPermit(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'mayors_permit' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
            'is_required_locally' => ['nullable', 'boolean'],
            'exemption_reason' => ['nullable', 'string', 'max:500'],
        ]);

        $permit = $this->branchPermitService->submitOrUpdateForBranch(
            owner: $request->user(),
            restaurantId: $id,
            file: $request->file('mayors_permit'),
            validated: $validated,
            request: $request,
        );

        return ApiResponse::success(
            data: ['permit' => $permit],
            message: 'Branch permit updated and submitted for review.',
        );
    }

    public function permitFile(Request $request, int $id): StreamedResponse
    {
        return $this->branchPermitService->streamPermitFile($request->user(), $id);
    }
}
