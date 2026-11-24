<?php

namespace App\Features\Connect\Controllers;

use App\Features\Connect\Services\ConversationService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ConversationController extends Controller
{
    public function __construct(
        private readonly ConversationService $conversationService,
    ) {}

    public function show(Request $request, int $id): JsonResponse
    {
        $data = $this->conversationService->getConversation($request->user(), $id);

        return ApiResponse::success(
            data: $data,
            message: 'Conversation retrieved.',
        );
    }

    public function store(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'message' => ['required', 'string', 'max:1000'],
        ]);

        $data = $this->conversationService->sendMessage(
            user: $request->user(),
            orderId: $id,
            rawMessage: (string) $validated['message'],
            request: $request,
        );

        return ApiResponse::success(
            data: $data,
            message: 'Message sent.',
            status: 201,
        );
    }
}
