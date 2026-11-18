<?php

namespace App\Features\Notifications\Controllers;

use App\Features\Notifications\Services\NotificationService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function __construct(
        private readonly NotificationService $notificationService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $workspace = $request->query('workspace');
        $workspaceStr = is_string($workspace) ? trim($workspace) : null;
        $unreadOnly = filter_var($request->query('unread_only', false), FILTER_VALIDATE_BOOLEAN);
        $perPage = (int) $request->query('per_page', 20);

        $data = $this->notificationService->listForUser(
            user: $request->user(),
            workspace: $workspaceStr,
            unreadOnly: $unreadOnly,
            perPage: $perPage,
        );

        return ApiResponse::success($data, 'Notifications loaded.');
    }

    public function unreadCount(Request $request): JsonResponse
    {
        $data = $this->notificationService->unreadCountForUser($request->user());

        return ApiResponse::success($data, 'Unread notification counts loaded.');
    }

    public function markRead(Request $request, int $id): JsonResponse
    {
        $notification = $this->notificationService->markRead($request->user(), $id);

        return ApiResponse::success($notification, 'Notification marked as read.');
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $workspace = $request->input('workspace') ?? $request->query('workspace');
        $workspaceStr = is_string($workspace) ? trim($workspace) : null;

        $updatedCount = $this->notificationService->markAllRead($request->user(), $workspaceStr);

        return ApiResponse::success(
            ['updated_count' => $updatedCount],
            'Notifications marked as read.',
        );
    }
}
