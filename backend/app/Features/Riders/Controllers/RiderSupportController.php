<?php

namespace App\Features\Riders\Controllers;

use App\Features\Riders\Requests\CreateRiderSupportTicketRequest;
use App\Features\Riders\Services\RiderSupportService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RiderSupportController extends Controller
{
    public function __construct(
        private readonly RiderSupportService $riderSupportService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: $this->riderSupportService->listTickets($request->user(), $request->query()),
            message: 'Rider support tickets retrieved.',
        );
    }

    public function store(CreateRiderSupportTicketRequest $request): JsonResponse
    {
        $ticket = $this->riderSupportService->createTicket(
            user: $request->user(),
            validated: $request->validated(),
            request: $request,
        );

        return ApiResponse::success(
            data: ['ticket' => $ticket],
            message: 'Support ticket submitted.',
            status: 201,
        );
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return ApiResponse::success(
            data: ['ticket' => $this->riderSupportService->getTicket($request->user(), $id)],
            message: 'Support ticket retrieved.',
        );
    }

    public function close(Request $request, int $id): JsonResponse
    {
        $ticket = $this->riderSupportService->closeTicket(
            user: $request->user(),
            ticketId: $id,
            request: $request,
        );

        return ApiResponse::success(
            data: ['ticket' => $ticket],
            message: 'Support ticket closed.',
        );
    }
}
