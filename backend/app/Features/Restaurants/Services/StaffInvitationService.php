<?php

namespace App\Features\Restaurants\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\WorkspaceAccessResolver;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class StaffInvitationService
{
    private const STATUS_INVITED = 'invited';
    private const STATUS_ACTIVE = 'active';
    private const STATUS_EXPIRED = 'expired';
    private const STATUS_CANCELLED = 'cancelled';
    private const STATUS_DECLINED = 'declined';

    public function __construct(
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
        private readonly ?WorkspaceAccessResolver $workspaceAccessResolver = null,
    ) {}

    /**
     * Send a staff invitation for an owned active restaurant.
     * Returns a neutral response when the target account does not exist to prevent enumeration.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function sendInvitation(User $owner, array $data, Request $request): array
    {
        $restaurantId = isset($data['restaurant_id']) ? (int) $data['restaurant_id'] : null;
        $restaurant = $this->requireOwnedActiveRestaurant($owner, $restaurantId);
        $targetRestaurantId = (int) $restaurant->restaurant_id;

        $canonicalPosition = $this->normalizeAndValidatePosition((string) ($data['staff_position'] ?? ''));
        $note = isset($data['note']) && trim((string) $data['note']) !== ''
            ? mb_substr(trim((string) $data['note']), 0, 500)
            : null;

        $emailInput = isset($data['email']) ? strtolower(trim((string) $data['email'])) : '';
        $usernameInput = isset($data['username']) ? trim((string) $data['username']) : '';
        $identifierInput = isset($data['identifier']) ? trim((string) $data['identifier']) : '';

        $this->validateInviteInputs($owner, $emailInput, $usernameInput, $identifierInput);

        $targetUser = $this->findInvitableUser($emailInput, $usernameInput, $identifierInput);
        if (! $targetUser) {
            return ['submitted' => true];
        }

        $this->assertTargetUserInvitable($owner, $targetUser, $targetRestaurantId);

        $expiryDays = max(1, (int) config('salo.staff.invitation_expiry_days', 7));
        $this->persistSentInvitation($owner, $restaurant, $targetRestaurantId, $targetUser, $canonicalPosition, $note, $expiryDays, $request);

        return ['submitted' => true];
    }

    private function validateInviteInputs(User $owner, string $emailInput, string $usernameInput, string $identifierInput): void
    {
        if ($emailInput === '' && $usernameInput === '' && $identifierInput === '') {
            throw ValidationException::withMessages(['username' => ['A username or email is required.']]);
        }
        if ($emailInput !== '' && strcasecmp($emailInput, (string) $owner->email) === 0) {
            throw ValidationException::withMessages(['email' => ['You cannot invite yourself as staff.']]);
        }
        if ($usernameInput !== '' && strcasecmp($usernameInput, (string) $owner->username) === 0) {
            throw ValidationException::withMessages(['username' => ['You cannot invite yourself as staff.']]);
        }
        if (
            $identifierInput !== ''
            && (strcasecmp($identifierInput, (string) $owner->email) === 0 || strcasecmp($identifierInput, (string) $owner->username) === 0)
        ) {
            throw ValidationException::withMessages(['identifier' => ['You cannot invite yourself as staff.']]);
        }
    }

    private function assertTargetUserInvitable(User $owner, object $targetUser, int $restaurantId): void
    {
        if ((int) $targetUser->user_id === (int) $owner->user_id) {
            throw ValidationException::withMessages(['username' => ['You cannot invite yourself as staff.']]);
        }

        $isAlreadyOwner = DB::table('restaurant_owners')
            ->where('restaurant_id', $restaurantId)
            ->where('user_id', $targetUser->user_id)
            ->exists();

        if ($isAlreadyOwner) {
            throw ValidationException::withMessages(['username' => ['This user is already an owner of this restaurant.']]);
        }
    }

    private function persistSentInvitation(
        User $owner,
        object $restaurant,
        int $targetRestaurantId,
        object $targetUser,
        string $canonicalPosition,
        ?string $note,
        int $expiryDays,
        Request $request,
    ): void {
        DB::transaction(function () use (
            $owner, $restaurant, $targetRestaurantId, $targetUser, $canonicalPosition, $note, $expiryDays, $request,
        ): void {
            $now = now();
            $expiresAt = $now->copy()->addDays($expiryDays);
            $staffId = $this->upsertStaffInvitationRow($owner, $targetRestaurantId, $targetUser, $canonicalPosition, $note, $now, $expiresAt);

            $this->auditLogService->record(
                actorUserId: (int) $owner->user_id,
                action: 'staff_invitation_sent',
                entityType: 'restaurant_staff',
                entityId: $staffId,
                newValues: [
                    'restaurant_id' => $targetRestaurantId,
                    'invitee_user_id' => (int) $targetUser->user_id,
                    'staff_position' => $canonicalPosition,
                    'expires_at' => $expiresAt->toIso8601String(),
                ],
                request: $request,
            );

            $inviterFirstName = trim((string) ($owner->first_name ?? '')) ?: 'An owner';
            $this->notificationService->notifyUser(
                userId: (int) $targetUser->user_id,
                workspace: 'customer',
                type: 'staff_invitation_received',
                title: "Staff invitation from {$restaurant->restaurant_name}",
                body: "{$inviterFirstName} invited you to join {$restaurant->restaurant_name} as {$canonicalPosition}.",
                relatedEntityType: 'staff_invitation',
                relatedEntityId: $staffId,
            );
        });
    }

    private function upsertStaffInvitationRow(
        User $owner,
        int $targetRestaurantId,
        object $targetUser,
        string $canonicalPosition,
        ?string $note,
        Carbon $now,
        Carbon $expiresAt,
    ): int {
        $existing = DB::table('restaurant_staff')
            ->where('restaurant_id', $targetRestaurantId)
            ->where('user_id', $targetUser->user_id)
            ->lockForUpdate()
            ->first();

        if ($existing) {
            $isPendingAndValid = $existing->staff_status === self::STATUS_INVITED
                && ($existing->expires_at === null || Carbon::parse((string) $existing->expires_at)->gt($now));

            if ($isPendingAndValid || $existing->staff_status === self::STATUS_ACTIVE) {
                throw new ConflictHttpException('This user already has an active or pending staff record for this restaurant.');
            }

            $staffId = (int) $existing->staff_id;
            DB::table('restaurant_staff')->where('staff_id', $staffId)->update([
                'invited_by' => $owner->user_id, 'staff_position' => $canonicalPosition,
                'invitation_note' => $note, 'staff_status' => self::STATUS_INVITED,
                'invited_at' => $now, 'expires_at' => $expiresAt,
                'responded_at' => null, 'joined_at' => null, 'updated_at' => $now,
            ]);

            return $staffId;
        }

        return (int) DB::table('restaurant_staff')->insertGetId([
            'restaurant_id' => $targetRestaurantId, 'user_id' => $targetUser->user_id,
            'invited_by' => $owner->user_id, 'staff_position' => $canonicalPosition,
            'invitation_note' => $note, 'staff_status' => self::STATUS_INVITED,
            'invited_at' => $now, 'expires_at' => $expiresAt,
            'responded_at' => null, 'joined_at' => null, 'created_at' => $now, 'updated_at' => $now,
        ]);
    }

    /**
     * List staff and invitations for an owned active restaurant.
     *
     * @return array<string, mixed>
     */
    public function listRestaurantStaff(User $owner, ?int $restaurantId = null): array
    {
        $restaurant = $this->requireOwnedActiveRestaurant($owner, $restaurantId);
        $targetRestaurantId = (int) $restaurant->restaurant_id;
        $now = now();

        $rawRows = DB::table('restaurant_staff as rs')
            ->join('users as u', 'u.user_id', '=', 'rs.user_id')
            ->leftJoin('users as inv', 'inv.user_id', '=', 'rs.invited_by')
            ->where('rs.restaurant_id', $targetRestaurantId)
            ->orderByDesc('rs.staff_id')
            ->select(['rs.*', 'u.first_name', 'u.last_name', 'u.username', 'inv.first_name as invited_by_first_name'])
            ->get();

        $this->expireOverdueFromRows($rawRows, $now);

        return [
            'restaurant_id' => $targetRestaurantId,
            'restaurant_name' => $restaurant->restaurant_name,
            'staff' => $rawRows->map(fn (object $row): array => $this->formatRestaurantStaffRow($row))->values()->all(),
        ];
    }

    /**
     * Cancel a pending staff invitation (owner only).
     *
     * @return array<string, mixed>
     */
    public function cancelInvitation(User $owner, int $staffId, Request $request): array
    {
        $result = DB::transaction(function () use ($owner, $staffId, $request): array {
            $row = DB::table('restaurant_staff')->where('staff_id', $staffId)->lockForUpdate()->first();
            if (! $row) {
                throw new NotFoundHttpException('Staff invitation not found.');
            }

            $restaurant = $this->requireOwnedActiveRestaurant($owner, (int) $row->restaurant_id);
            $now = now();

            if ($this->expireIfOverdueAndAssertPending($row, $staffId, $now, 'cancelled')) {
                return ['expired' => true];
            }

            DB::table('restaurant_staff')->where('staff_id', $staffId)->update([
                'staff_status' => self::STATUS_CANCELLED, 'responded_at' => $now, 'updated_at' => $now,
            ]);

            $this->auditLogService->record(
                actorUserId: (int) $owner->user_id,
                action: 'staff_invitation_cancelled',
                entityType: 'restaurant_staff',
                entityId: $staffId,
                oldValues: ['staff_status' => self::STATUS_INVITED],
                newValues: ['staff_status' => self::STATUS_CANCELLED],
                request: $request,
            );

            $this->notificationService->notifyUser(
                userId: (int) $row->user_id,
                workspace: 'customer',
                type: 'staff_invitation_cancelled',
                title: 'Staff invitation cancelled',
                body: "Your staff invitation from {$restaurant->restaurant_name} ({$row->staff_position}) was cancelled.",
                relatedEntityType: 'staff_invitation',
                relatedEntityId: $staffId,
            );

            return ['expired' => false];
        });

        if ($result['expired'] === true) {
            throw new ConflictHttpException('This staff invitation has expired.');
        }

        return ['staff_id' => $staffId, 'status' => self::STATUS_CANCELLED];
    }

    /**
     * List staff invitations for the authenticated invitee account.
     *
     * @return array<int, array<string, mixed>>
     */
    public function listAccountInvitations(User $user): array
    {
        $now = now();

        $rawRows = DB::table('restaurant_staff as rs')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'rs.restaurant_id')
            ->leftJoin('users as inv', 'inv.user_id', '=', 'rs.invited_by')
            ->where('rs.user_id', $user->user_id)
            ->orderByDesc('rs.staff_id')
            ->select(['rs.*', 'r.restaurant_name', 'r.restaurant_status', 'inv.first_name as invited_by_first_name'])
            ->get();

        $this->expireOverdueFromRows($rawRows, $now);

        return $rawRows->map(fn (object $row): array => $this->formatAccountInvitationRow($row))->values()->all();
    }

    /**
     * Accept a pending staff invitation (invitee only).
     *
     * @return array<string, mixed>
     */
    public function acceptInvitation(User $user, int $staffId, Request $request): array
    {
        $result = DB::transaction(function () use ($user, $staffId, $request): array {
            $row = $this->findInviteeRowForUpdate($user, $staffId);
            $now = now();

            if ($this->expireIfOverdueAndAssertPending($row, $staffId, $now, 'accepted')) {
                return ['expired' => true];
            }

            $restaurant = DB::table('restaurants')
                ->where('restaurant_id', $row->restaurant_id)
                ->first(['restaurant_id', 'restaurant_name', 'restaurant_status']);

            if (! $restaurant || $restaurant->restaurant_status !== 'active') {
                throw new ConflictHttpException('This restaurant is no longer active.');
            }

            DB::table('restaurant_staff')->where('staff_id', $staffId)->update([
                'staff_status' => self::STATUS_ACTIVE, 'responded_at' => $now, 'joined_at' => $now, 'updated_at' => $now,
            ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'staff_invitation_accepted',
                entityType: 'restaurant_staff',
                entityId: $staffId,
                oldValues: ['staff_status' => self::STATUS_INVITED],
                newValues: ['staff_status' => self::STATUS_ACTIVE, 'staff_position' => $row->staff_position],
                request: $request,
            );

            $this->notifyOwnersOfInvitationResponse(
                $user,
                (int) $row->restaurant_id,
                $staffId,
                'staff_invitation_accepted',
                'Staff invitation accepted',
                "accepted the invitation to join {$restaurant->restaurant_name} as {$row->staff_position}.",
            );

            return ['expired' => false, 'restaurant_id' => (int) $row->restaurant_id, 'staff_position' => $row->staff_position];
        });

        if ($result['expired'] === true) {
            throw new ConflictHttpException('This staff invitation has expired.');
        }

        return [
            'staff_id' => $staffId, 'restaurant_id' => $result['restaurant_id'],
            'staff_position' => $result['staff_position'], 'status' => 'accepted',
        ];
    }

    /**
     * Decline a pending staff invitation (invitee only).
     *
     * @return array<string, mixed>
     */
    public function declineInvitation(User $user, int $staffId, Request $request): array
    {
        $result = DB::transaction(function () use ($user, $staffId, $request): array {
            $row = $this->findInviteeRowForUpdate($user, $staffId);
            $now = now();

            if ($this->expireIfOverdueAndAssertPending($row, $staffId, $now, 'declined')) {
                return ['expired' => true];
            }

            $restaurantName = (string) (DB::table('restaurants')->where('restaurant_id', $row->restaurant_id)->value('restaurant_name') ?? 'the restaurant');

            DB::table('restaurant_staff')->where('staff_id', $staffId)->update([
                'staff_status' => self::STATUS_DECLINED, 'responded_at' => $now, 'updated_at' => $now,
            ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'staff_invitation_declined',
                entityType: 'restaurant_staff',
                entityId: $staffId,
                oldValues: ['staff_status' => self::STATUS_INVITED],
                newValues: ['staff_status' => self::STATUS_DECLINED],
                request: $request,
            );

            $this->notifyOwnersOfInvitationResponse(
                $user,
                (int) $row->restaurant_id,
                $staffId,
                'staff_invitation_declined',
                'Staff invitation declined',
                "declined the invitation to join {$restaurantName} as {$row->staff_position}.",
            );

            return ['expired' => false];
        });

        if ($result['expired'] === true) {
            throw new ConflictHttpException('This staff invitation has expired.');
        }

        return ['staff_id' => $staffId, 'status' => self::STATUS_DECLINED];
    }

    private function requireOwnedActiveRestaurant(User $owner, ?int $restaurantId = null): object
    {
        $resolver = $this->workspaceAccessResolver ?? app(WorkspaceAccessResolver::class);

        return $resolver->requireActiveOwnedRestaurant($owner, $restaurantId);
    }

    private function normalizeAndValidatePosition(string $rawPosition): string
    {
        $trimmed = trim($rawPosition);
        $allowed = (array) config('salo.staff.positions', []);

        foreach ($allowed as $candidate) {
            if (strcasecmp($trimmed, (string) $candidate) === 0) {
                return (string) $candidate;
            }
        }

        throw ValidationException::withMessages([
            'staff_position' => ['Invalid staff position. Allowed values: ' . implode(', ', $allowed) . '.'],
        ]);
    }

    private function findInvitableUser(string $email, string $username, string $identifier): ?object
    {
        $query = DB::table('users')
            ->where('account_status', 'active')
            ->select(['user_id', 'username', 'email', 'first_name']);

        if ($email !== '') {
            return $query->where('email', $email)->first();
        }

        if ($username !== '') {
            return $query->where('username', $username)->first();
        }

        if (str_contains($identifier, '@')) {
            return $query->where('email', $identifier)->first();
        }

        return $query->where('username', $identifier)->first();
    }

    private function findInviteeRowForUpdate(User $user, int $staffId): object
    {
        $row = DB::table('restaurant_staff')->where('staff_id', $staffId)->lockForUpdate()->first();
        if (! $row || (int) $row->user_id !== (int) $user->user_id) {
            throw new NotFoundHttpException('Staff invitation not found.');
        }

        return $row;
    }

    private function expireIfOverdueAndAssertPending(object $row, int $staffId, Carbon $now, string $actionVerb): bool
    {
        if ($row->staff_status === self::STATUS_INVITED && $this->isExpired($row->expires_at, $now)) {
            DB::table('restaurant_staff')->where('staff_id', $staffId)->update([
                'staff_status' => self::STATUS_EXPIRED,
                'updated_at' => $now,
            ]);

            return true;
        }

        if ($row->staff_status !== self::STATUS_INVITED) {
            throw new ConflictHttpException(
                "Only pending invitations can be {$actionVerb} (current status: {$this->mapExternalStatus((string) $row->staff_status)})."
            );
        }

        return false;
    }

    private function expireOverdueFromRows(\Illuminate\Support\Collection $rawRows, Carbon $now): void
    {
        $expiredIds = [];
        foreach ($rawRows as $row) {
            if ($row->staff_status === self::STATUS_INVITED && $this->isExpired($row->expires_at, $now)) {
                $expiredIds[] = (int) $row->staff_id;
                $row->staff_status = self::STATUS_EXPIRED;
            }
        }

        if ($expiredIds !== []) {
            DB::table('restaurant_staff')
                ->whereIn('staff_id', $expiredIds)
                ->where('staff_status', self::STATUS_INVITED)
                ->update(['staff_status' => self::STATUS_EXPIRED, 'updated_at' => $now]);
        }
    }

    private function notifyOwnersOfInvitationResponse(
        User $user,
        int $restaurantId,
        int $staffId,
        string $type,
        string $title,
        string $bodySuffix,
    ): void {
        $ownerIds = $this->notificationService->resolveRestaurantOwnerUserIds($restaurantId);
        $inviteeFirstName = trim((string) ($user->first_name ?? '')) ?: 'A user';
        $this->notificationService->notifyUsers(
            userIds: $ownerIds,
            workspace: 'restaurant',
            type: $type,
            title: $title,
            body: "{$inviteeFirstName} {$bodySuffix}",
            relatedEntityType: 'staff_invitation',
            relatedEntityId: $staffId,
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function formatRestaurantStaffRow(object $row): array
    {
        return [
            'staff_id' => (int) $row->staff_id,
            'restaurant_id' => (int) $row->restaurant_id,
            'user_id' => (int) $row->user_id,
            'first_name' => $row->first_name,
            'last_name' => $row->last_name,
            'username' => $row->username,
            'staff_position' => $row->staff_position,
            'status' => $this->mapExternalStatus((string) $row->staff_status),
            'staff_status' => $row->staff_status,
            'invitation_note' => $row->invitation_note,
            'invited_by_first_name' => $row->invited_by_first_name,
            'invited_at' => OrderTimestampFormatter::toManilaIso($row->invited_at),
            'expires_at' => OrderTimestampFormatter::toManilaIso($row->expires_at),
            'responded_at' => OrderTimestampFormatter::toManilaIso($row->responded_at),
            'joined_at' => OrderTimestampFormatter::toManilaIso($row->joined_at),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function formatAccountInvitationRow(object $row): array
    {
        return [
            'staff_id' => (int) $row->staff_id,
            'restaurant_id' => (int) $row->restaurant_id,
            'restaurant_name' => $row->restaurant_name,
            'staff_position' => $row->staff_position,
            'status' => $this->mapExternalStatus((string) $row->staff_status),
            'staff_status' => $row->staff_status,
            'invitation_note' => $row->invitation_note,
            'invited_by_first_name' => $row->invited_by_first_name,
            'invited_at' => OrderTimestampFormatter::toManilaIso($row->invited_at),
            'expires_at' => OrderTimestampFormatter::toManilaIso($row->expires_at),
            'responded_at' => OrderTimestampFormatter::toManilaIso($row->responded_at),
            'joined_at' => OrderTimestampFormatter::toManilaIso($row->joined_at),
        ];
    }

    private function isExpired(mixed $expiresAt, Carbon $now): bool
    {
        if ($expiresAt === null || $expiresAt === '') {
            return false;
        }

        return Carbon::parse((string) $expiresAt)->lte($now);
    }

    private function mapExternalStatus(string $staffStatus): string
    {
        return match ($staffStatus) {
            'invited' => 'pending',
            'active' => 'accepted',
            default => $staffStatus,
        };
    }
}
