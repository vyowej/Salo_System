<?php

namespace App\Features\Connect\Controllers;

use App\Features\Notifications\Services\NotificationService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use App\Support\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class AdminConnectController extends Controller
{
    public function __construct(
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
    ) {}

    public function liftSuspension(Request $request, int $id): JsonResponse
    {
        $user = DB::table('users')->where('user_id', $id)->first();
        if (! $user) {
            throw new NotFoundHttpException('User not found.');
        }

        $oldUntil = $user->ordering_suspended_until;
        $oldReason = $user->suspension_reason;

        DB::table('users')
            ->where('user_id', $id)
            ->update([
                'ordering_suspended_until' => null,
                'suspension_reason' => null,
                'updated_at' => now(),
            ]);

        $this->auditLogService->record(
            actorUserId: (int) $request->user()->user_id,
            action: 'admin_lift_ordering_suspension',
            entityType: 'users',
            entityId: $id,
            oldValues: [
                'ordering_suspended_until' => $oldUntil,
                'suspension_reason' => $oldReason,
            ],
            newValues: [
                'ordering_suspended_until' => null,
                'suspension_reason' => null,
            ],
            request: $request,
        );

        $this->notificationService->notifyUser(
            userId: $id,
            workspace: 'customer',
            type: 'ordering_suspension_lifted',
            title: 'Ordering suspension lifted',
            body: 'An administrator has lifted your temporary ordering suspension. You may place orders again.',
        );

        return ApiResponse::success(
            data: ['user_id' => $id, 'ordering_suspended_until' => null],
            message: 'Customer ordering suspension lifted.',
        );
    }
}
