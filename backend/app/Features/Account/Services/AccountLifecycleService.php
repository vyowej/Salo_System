<?php

namespace App\Features\Account\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Models\User;
use App\Support\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\HttpException;

class AccountLifecycleService
{
    public function __construct(
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listForUser(User $user): array
    {
        return DB::table('account_lifecycle_requests')
            ->where('user_id', $user->user_id)
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (object $row): array => [
                'lifecycle_request_id' => (int) $row->lifecycle_request_id,
                'request_type' => $row->request_type,
                'reason' => $row->reason,
                'status' => $row->status,
                'review_note' => $row->review_note,
                'reviewed_at' => $row->reviewed_at,
                'created_at' => $row->created_at,
            ])
            ->all();
    }

    /**
     * Deactivate the current user's account after verifying no blocking obligations exist.
     *
     * @return array<string, mixed>
     */
    public function deactivate(User $user, ?string $reason, Request $request): array
    {
        if ($user->user_role === 'admin') {
            throw new ConflictHttpException('Administrator accounts cannot be self-deactivated.');
        }

        $this->assertNoBlockingObligations($user);

        $requestId = DB::transaction(function () use ($user, $reason, $request): int {
            $oldStatus = $user->account_status;

            DB::table('users')
                ->where('user_id', $user->user_id)
                ->update([
                    'account_status' => 'inactive',
                    'updated_at' => now(),
                ]);

            $id = (int) DB::table('account_lifecycle_requests')->insertGetId([
                'user_id' => $user->user_id,
                'request_type' => 'deactivation',
                'reason' => $reason !== null ? trim($reason) : null,
                'status' => 'completed',
                'reviewed_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'account_deactivated',
                entityType: 'users',
                entityId: (int) $user->user_id,
                oldValues: ['account_status' => $oldStatus],
                newValues: ['account_status' => 'inactive', 'reason' => $reason],
                request: $request,
            );

            return $id;
        });

        Auth::guard('web')->logout();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return [
            'lifecycle_request_id' => $requestId,
            'account_status' => 'inactive',
        ];
    }

    /**
     * Submit an account deletion request for admin review while preserving transactional/audit history.
     *
     * @return array<string, mixed>
     */
    public function requestDeletion(User $user, ?string $reason, Request $request): array
    {
        if ($user->user_role === 'admin') {
            throw new ConflictHttpException('Administrator accounts cannot be deleted through self-service.');
        }

        $this->assertNoBlockingObligations($user);

        $existingPending = DB::table('account_lifecycle_requests')
            ->where('user_id', $user->user_id)
            ->where('request_type', 'deletion')
            ->where('status', 'pending')
            ->first();

        if ($existingPending !== null) {
            throw new ConflictHttpException('You already have a pending account deletion request.');
        }

        $requestId = DB::transaction(function () use ($user, $reason, $request): int {
            $id = (int) DB::table('account_lifecycle_requests')->insertGetId([
                'user_id' => $user->user_id,
                'request_type' => 'deletion',
                'reason' => $reason !== null ? trim($reason) : null,
                'status' => 'pending',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'account_deletion_requested',
                entityType: 'account_lifecycle_requests',
                entityId: $id,
                oldValues: null,
                newValues: ['user_id' => (int) $user->user_id, 'reason' => $reason],
                request: $request,
            );

            $adminIds = DB::table('users')
                ->where('user_role', 'admin')
                ->where('account_status', 'active')
                ->pluck('user_id')
                ->all();

            if ($adminIds !== []) {
                $this->notificationService->notifyUsers(
                    userIds: $adminIds,
                    workspace: 'admin',
                    type: 'account_deletion_requested',
                    title: 'Account deletion request submitted',
                    body: "{$user->first_name} {$user->last_name} ({$user->email}) requested account deletion.",
                    relatedEntityType: 'account_lifecycle_request',
                    relatedEntityId: $id,
                );
            }

            return $id;
        });

        return [
            'lifecycle_request_id' => $requestId,
            'request_type' => 'deletion',
            'status' => 'pending',
        ];
    }

    /**
     * Allow an inactive user (after verifying credentials) to submit a reactivation request.
     *
     * @return array<string, mixed>
     */
    public function requestReactivation(string $email, string $password, ?string $reason, Request $request): array
    {
        $user = User::where('email', strtolower(trim($email)))->first();

        if (! $user || ! Hash::check($password, $user->password_hash)) {
            throw new HttpException(401, 'Invalid credentials.');
        }

        if ($user->account_status === 'active') {
            throw new ConflictHttpException('This account is already active. You can sign in normally.');
        }

        if ($user->account_status === 'suspended') {
            throw new HttpException(403, 'Suspended accounts cannot request self-reactivation. Please contact support.');
        }

        $existingPending = DB::table('account_lifecycle_requests')
            ->where('user_id', $user->user_id)
            ->where('request_type', 'reactivation')
            ->where('status', 'pending')
            ->first();

        if ($existingPending !== null) {
            return [
                'lifecycle_request_id' => (int) $existingPending->lifecycle_request_id,
                'request_type' => 'reactivation',
                'status' => 'pending',
            ];
        }

        $requestId = DB::transaction(function () use ($user, $reason, $request): int {
            $id = (int) DB::table('account_lifecycle_requests')->insertGetId([
                'user_id' => $user->user_id,
                'request_type' => 'reactivation',
                'reason' => $reason !== null ? trim($reason) : null,
                'status' => 'pending',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'account_reactivation_requested',
                entityType: 'account_lifecycle_requests',
                entityId: $id,
                oldValues: null,
                newValues: ['user_id' => (int) $user->user_id, 'reason' => $reason],
                request: $request,
            );

            $adminIds = DB::table('users')
                ->where('user_role', 'admin')
                ->where('account_status', 'active')
                ->pluck('user_id')
                ->all();

            if ($adminIds !== []) {
                $this->notificationService->notifyUsers(
                    userIds: $adminIds,
                    workspace: 'admin',
                    type: 'account_reactivation_requested',
                    title: 'Account reactivation request submitted',
                    body: "{$user->first_name} {$user->last_name} ({$user->email}) requested account reactivation.",
                    relatedEntityType: 'account_lifecycle_request',
                    relatedEntityId: $id,
                );
            }

            return $id;
        });

        return [
            'lifecycle_request_id' => $requestId,
            'request_type' => 'reactivation',
            'status' => 'pending',
        ];
    }

    private function assertNoBlockingObligations(User $user): void
    {
        $hasActiveDelivery = DB::table('deliveries as d')
            ->join('riders as r', 'r.rider_id', '=', 'd.rider_id')
            ->where('r.user_id', $user->user_id)
            ->whereIn('d.delivery_status', ['accepted', 'picked_up'])
            ->exists();

        if ($hasActiveDelivery) {
            throw new ConflictHttpException('You cannot deactivate or delete your account while you have an active delivery.');
        }

        $ownedRestaurantIds = DB::table('restaurant_owners')
            ->where('user_id', $user->user_id)
            ->pluck('restaurant_id')
            ->all();

        foreach ($ownedRestaurantIds as $restaurantId) {
            $ownerCount = DB::table('restaurant_owners')
                ->where('restaurant_id', $restaurantId)
                ->count();

            if ($ownerCount <= 1) {
                $hasActiveOrders = DB::table('orders')
                    ->where('restaurant_id', $restaurantId)
                    ->whereIn('order_status', ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'])
                    ->exists();

                if ($hasActiveOrders) {
                    throw new ConflictHttpException('You cannot deactivate or delete your account while your restaurant has active orders and no co-owner.');
                }

                $hasActiveReservations = DB::table('reservations')
                    ->where('restaurant_id', $restaurantId)
                    ->whereIn('reservation_status', ['pending', 'confirmed'])
                    ->exists();

                if ($hasActiveReservations) {
                    throw new ConflictHttpException('You cannot deactivate or delete your account while your restaurant has pending or confirmed reservations and no co-owner.');
                }
            }
        }
    }
}
