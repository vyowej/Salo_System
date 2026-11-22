<?php

namespace App\Features\Restaurants\Controllers;

use App\Features\Restaurants\Requests\StoreBranchRequest;
use App\Features\Restaurants\Services\OwnerBranchService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OwnerBranchController extends Controller
{
    public function __construct(
        private readonly OwnerBranchService $ownerBranchService,
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
}
