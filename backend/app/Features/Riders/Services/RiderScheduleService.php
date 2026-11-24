<?php

namespace App\Features\Riders\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Models\User;
use App\Support\AuditLogService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class RiderScheduleService
{
    public const VALID_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    public const VALID_SHIFTS = ['breakfast', 'lunch', 'afternoon', 'dinner', 'late_night', 'flexible'];

    public function __construct(
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function getRiderSchedule(User $user): array
    {
        $rider = $this->requireRiderByUser($user);
        $this->promoteDueApprovedSchedules((int) $rider->rider_id);
        $rider = $this->requireRiderById((int) $rider->rider_id);

        return $this->buildRiderSchedulePayload($rider);
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function submitRequest(User $user, array $validated, Request $request): array
    {
        $normalized = $this->normalizeAndValidateScheduleInput($validated, requireFutureOrToday: true);

        $createdId = DB::transaction(function () use ($user, $normalized, $request): int {
            $rider = DB::table('riders')
                ->where('user_id', $user->user_id)
                ->lockForUpdate()
                ->first();

            abort_unless($rider !== null, 404, 'Rider profile not found.');

            if (! in_array($rider->rider_status, ['approved', 'active'], true)) {
                throw new ConflictHttpException('Only approved or active riders can submit schedule change requests.');
            }

            $hasPending = DB::table('rider_schedule_change_requests')
                ->where('rider_id', $rider->rider_id)
                ->where('status', 'pending')
                ->lockForUpdate()
                ->exists();

            if ($hasPending) {
                throw new ConflictHttpException('You already have a pending schedule change request awaiting review.');
            }

            $now = now();
            $requestId = (int) DB::table('rider_schedule_change_requests')->insertGetId([
                'rider_id' => $rider->rider_id,
                'entry_type' => 'rider_request',
                'status' => 'pending',
                'previous_available_days' => $rider->available_days,
                'previous_preferred_shifts' => $rider->preferred_shifts,
                'previous_preferred_hubs' => $rider->preferred_hubs,
                'previous_effective_date' => $rider->schedule_effective_date ?? ($rider->approved_at ? Carbon::parse($rider->approved_at)->toDateString() : null),
                'requested_available_days' => implode(',', $normalized['available_days']),
                'requested_preferred_shifts' => implode(',', $normalized['preferred_shifts']),
                'requested_preferred_hubs' => $normalized['preferred_hubs'],
                'effective_date' => $normalized['effective_date'],
                'reason' => $normalized['reason'],
                'submitted_by_user_id' => $user->user_id,
                'submitted_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'rider_schedule_request_submitted',
                entityType: 'rider_schedule_change_requests',
                entityId: $requestId,
                newValues: [
                    'rider_id' => (int) $rider->rider_id,
                    'available_days' => $normalized['available_days'],
                    'preferred_shifts' => $normalized['preferred_shifts'],
                    'preferred_hubs' => $normalized['preferred_hubs'],
                    'effective_date' => $normalized['effective_date'],
                ],
                reason: $normalized['reason'],
                request: $request,
            );

            $adminIds = $this->notificationService->resolveActiveAdminUserIds((int) $user->user_id);
            $riderName = trim("{$user->first_name} {$user->last_name}") ?: ($user->username ?? 'Rider');

            $this->notificationService->notifyUsers(
                userIds: $adminIds,
                workspace: 'admin',
                type: 'rider_schedule_request_submitted',
                title: 'Rider schedule change request',
                body: "{$riderName} submitted schedule change request #{$requestId} (effective {$normalized['effective_date']}).",
                relatedEntityType: 'rider_schedule_requests',
                relatedEntityId: $requestId,
            );

            return $requestId;
        });

        $row = $this->fetchRequestRowById($createdId);
        abort_unless($row !== null, 500, 'Failed to load created schedule request.');

        return $this->formatRequestRow($row);
    }

    /**
     * @return array<string, mixed>
     */
    public function cancelRequest(User $user, int $requestId, Request $request): array
    {
        $rider = $this->requireRiderByUser($user);

        DB::transaction(function () use ($user, $rider, $requestId, $request): void {
            $row = DB::table('rider_schedule_change_requests')
                ->where('schedule_request_id', $requestId)
                ->lockForUpdate()
                ->first();

            abort_unless($row !== null && (int) $row->rider_id === (int) $rider->rider_id, 404, 'Schedule change request not found.');

            if ($row->status !== 'pending') {
                throw new ConflictHttpException("Only pending requests can be cancelled (current status: {$row->status}).");
            }

            $now = now();
            DB::table('rider_schedule_change_requests')
                ->where('schedule_request_id', $requestId)
                ->update([
                    'status' => 'cancelled',
                    'reviewed_at' => $now,
                    'admin_remarks' => 'Cancelled by rider prior to review.',
                    'updated_at' => $now,
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'rider_schedule_request_cancelled',
                entityType: 'rider_schedule_change_requests',
                entityId: $requestId,
                oldValues: ['status' => 'pending'],
                newValues: ['status' => 'cancelled'],
                request: $request,
            );

            $adminIds = $this->notificationService->resolveActiveAdminUserIds((int) $user->user_id);
            $riderName = trim("{$user->first_name} {$user->last_name}") ?: ($user->username ?? 'Rider');

            $this->notificationService->notifyUsers(
                userIds: $adminIds,
                workspace: 'admin',
                type: 'rider_schedule_request_cancelled',
                title: 'Rider schedule request cancelled',
                body: "{$riderName} cancelled pending schedule change request #{$requestId}.",
                relatedEntityType: 'rider_schedule_requests',
                relatedEntityId: $requestId,
            );
        });

        $updated = $this->fetchRequestRowById($requestId);
        abort_unless($updated !== null, 404, 'Schedule change request not found.');

        return $this->formatRequestRow($updated);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listAdminRequests(array $filters): array
    {
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 20)));
        $status = trim((string) ($filters['status'] ?? 'all'));
        $search = trim((string) ($filters['search'] ?? ''));
        $days = (int) ($filters['days'] ?? 0);
        $riderId = isset($filters['rider_id']) && is_numeric($filters['rider_id']) ? (int) $filters['rider_id'] : null;

        $query = $this->baseRequestQuery();

        if ($riderId !== null && $riderId > 0) {
            $query->where('req.rider_id', $riderId);
        }

        if ($status === 'admin_update') {
            $query->where('req.entry_type', 'admin_update');
        } elseif ($status !== '' && $status !== 'all') {
            $query->where('req.status', $status);
        }

        if ($days > 0) {
            $query->where('req.submitted_at', '>=', now()->subDays($days));
        }

        if ($search !== '') {
            $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $search).'%';
            $query->where(function ($sub) use ($like, $search): void {
                $sub->where('ru.first_name', 'like', $like)
                    ->orWhere('ru.last_name', 'like', $like)
                    ->orWhere('ru.username', 'like', $like)
                    ->orWhere('c.city_name', 'like', $like)
                    ->orWhere('req.reason', 'like', $like);
                if (is_numeric($search)) {
                    $sub->orWhere('req.schedule_request_id', (int) $search);
                }
            });
        }

        $paginator = $query
            ->orderByRaw("CASE WHEN req.status = 'pending' THEN 0 ELSE 1 END ASC")
            ->orderByDesc('req.submitted_at')
            ->orderByDesc('req.schedule_request_id')
            ->paginate($perPage);

        $items = collect($paginator->items())
            ->map(fn (object $row): array => $this->formatRequestRow($row))
            ->values()
            ->all();

        $pendingCount = (int) DB::table('rider_schedule_change_requests')
            ->where('status', 'pending')
            ->count();

        return [
            'items' => $items,
            'pending_count' => $pendingCount,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function getAdminRiderSchedule(int $riderId): array
    {
        $this->promoteDueApprovedSchedules($riderId);
        $rider = $this->requireRiderById($riderId);

        return $this->buildRiderSchedulePayload($rider);
    }

    /**
     * @return array<string, mixed>
     */
    public function approveRequest(int $requestId, User $admin, ?string $remarks, Request $request): array
    {
        $cleanRemarks = $remarks !== null ? trim($remarks) : '';

        DB::transaction(function () use ($requestId, $admin, $cleanRemarks, $request): void {
            $reqRow = DB::table('rider_schedule_change_requests')
                ->where('schedule_request_id', $requestId)
                ->lockForUpdate()
                ->first();

            abort_unless($reqRow !== null, 404, 'Schedule change request not found.');

            if ($reqRow->status !== 'pending') {
                throw new ConflictHttpException("Only pending requests can be approved (current status: {$reqRow->status}).");
            }

            $rider = DB::table('riders')
                ->where('rider_id', $reqRow->rider_id)
                ->lockForUpdate()
                ->first();

            abort_unless($rider !== null, 404, 'Rider not found.');

            $now = now();
            $todayManila = now('Asia/Manila')->toDateString();
            $shouldApplyNow = (string) $reqRow->effective_date <= $todayManila;

            if ($shouldApplyNow) {
                DB::table('riders')
                    ->where('rider_id', $rider->rider_id)
                    ->update([
                        'available_days' => $reqRow->requested_available_days,
                        'preferred_shifts' => $reqRow->requested_preferred_shifts,
                        'preferred_hubs' => $reqRow->requested_preferred_hubs,
                        'schedule_effective_date' => $reqRow->effective_date,
                        'updated_at' => $now,
                    ]);
            }

            DB::table('rider_schedule_change_requests')
                ->where('schedule_request_id', $requestId)
                ->update([
                    'status' => 'approved',
                    'reviewed_by_user_id' => $admin->user_id,
                    'reviewed_at' => $now,
                    'admin_remarks' => $cleanRemarks !== '' ? $cleanRemarks : 'Approved by administrator.',
                    'applied_at' => $shouldApplyNow ? $now : null,
                    'updated_at' => $now,
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: 'admin_rider_schedule_request_approved',
                entityType: 'rider_schedule_change_requests',
                entityId: $requestId,
                oldValues: [
                    'available_days' => $rider->available_days,
                    'preferred_shifts' => $rider->preferred_shifts,
                    'preferred_hubs' => $rider->preferred_hubs,
                ],
                newValues: [
                    'available_days' => $reqRow->requested_available_days,
                    'preferred_shifts' => $reqRow->requested_preferred_shifts,
                    'preferred_hubs' => $reqRow->requested_preferred_hubs,
                    'effective_date' => $reqRow->effective_date,
                    'applied_immediately' => $shouldApplyNow,
                ],
                reason: $cleanRemarks !== '' ? $cleanRemarks : null,
                request: $request,
            );

            $timingNote = $shouldApplyNow
                ? "Your updated schedule is now active (effective {$reqRow->effective_date})."
                : "Your approved schedule will take effect on {$reqRow->effective_date}.";

            $this->notificationService->notifyUser(
                userId: (int) $rider->user_id,
                workspace: 'rider',
                type: 'rider_schedule_request_approved',
                title: 'Schedule change request approved',
                body: "Request #{$requestId} was approved. {$timingNote}",
                relatedEntityType: 'rider_schedule_requests',
                relatedEntityId: $requestId,
            );
        });

        $updated = $this->fetchRequestRowById($requestId);
        abort_unless($updated !== null, 404, 'Schedule change request not found.');

        return $this->formatRequestRow($updated);
    }

    /**
     * @return array<string, mixed>
     */
    public function rejectRequest(int $requestId, User $admin, string $remarks, Request $request): array
    {
        $cleanRemarks = trim($remarks);
        if (mb_strlen($cleanRemarks) < 5) {
            throw ValidationException::withMessages([
                'remarks' => ['Rejection remarks are required (minimum 5 characters).'],
            ]);
        }

        DB::transaction(function () use ($requestId, $admin, $cleanRemarks, $request): void {
            $reqRow = DB::table('rider_schedule_change_requests')
                ->where('schedule_request_id', $requestId)
                ->lockForUpdate()
                ->first();

            abort_unless($reqRow !== null, 404, 'Schedule change request not found.');

            if ($reqRow->status !== 'pending') {
                throw new ConflictHttpException("Only pending requests can be rejected (current status: {$reqRow->status}).");
            }

            $riderUserId = $this->notificationService->resolveRiderUserId((int) $reqRow->rider_id);
            $now = now();

            DB::table('rider_schedule_change_requests')
                ->where('schedule_request_id', $requestId)
                ->update([
                    'status' => 'rejected',
                    'reviewed_by_user_id' => $admin->user_id,
                    'reviewed_at' => $now,
                    'admin_remarks' => $cleanRemarks,
                    'updated_at' => $now,
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: 'admin_rider_schedule_request_rejected',
                entityType: 'rider_schedule_change_requests',
                entityId: $requestId,
                oldValues: ['status' => 'pending'],
                newValues: ['status' => 'rejected'],
                reason: $cleanRemarks,
                request: $request,
            );

            if ($riderUserId !== null) {
                $this->notificationService->notifyUser(
                    userId: $riderUserId,
                    workspace: 'rider',
                    type: 'rider_schedule_request_rejected',
                    title: 'Schedule change request rejected',
                    body: "Request #{$requestId} was rejected: {$cleanRemarks}",
                    relatedEntityType: 'rider_schedule_requests',
                    relatedEntityId: $requestId,
                );
            }
        });

        $updated = $this->fetchRequestRowById($requestId);
        abort_unless($updated !== null, 404, 'Schedule change request not found.');

        return $this->formatRequestRow($updated);
    }

    /**
     * Admin-initiated direct update to a rider's official schedule.
     * Preserves any existing pending rider-submitted request untouched.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function applyAdminDirectUpdate(int $riderId, User $admin, array $validated, Request $request): array
    {
        $normalized = $this->normalizeAndValidateScheduleInput($validated, requireFutureOrToday: true);

        DB::transaction(function () use ($riderId, $admin, $normalized, $request): void {
            $rider = DB::table('riders')
                ->where('rider_id', $riderId)
                ->lockForUpdate()
                ->first();

            abort_unless($rider !== null, 404, 'Rider not found.');

            $now = now();
            $todayManila = now('Asia/Manila')->toDateString();
            $shouldApplyNow = $normalized['effective_date'] <= $todayManila;

            $daysCsv = implode(',', $normalized['available_days']);
            $shiftsCsv = implode(',', $normalized['preferred_shifts']);

            $historyId = (int) DB::table('rider_schedule_change_requests')->insertGetId([
                'rider_id' => $riderId,
                'entry_type' => 'admin_update',
                'status' => 'approved',
                'previous_available_days' => $rider->available_days,
                'previous_preferred_shifts' => $rider->preferred_shifts,
                'previous_preferred_hubs' => $rider->preferred_hubs,
                'previous_effective_date' => $rider->schedule_effective_date ?? ($rider->approved_at ? Carbon::parse($rider->approved_at)->toDateString() : null),
                'requested_available_days' => $daysCsv,
                'requested_preferred_shifts' => $shiftsCsv,
                'requested_preferred_hubs' => $normalized['preferred_hubs'],
                'effective_date' => $normalized['effective_date'],
                'reason' => $normalized['reason'],
                'submitted_by_user_id' => $admin->user_id,
                'submitted_at' => $now,
                'reviewed_by_user_id' => $admin->user_id,
                'reviewed_at' => $now,
                'admin_remarks' => "Admin-initiated schedule update: {$normalized['reason']}",
                'applied_at' => $shouldApplyNow ? $now : null,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            if ($shouldApplyNow) {
                DB::table('riders')
                    ->where('rider_id', $riderId)
                    ->update([
                        'available_days' => $daysCsv,
                        'preferred_shifts' => $shiftsCsv,
                        'preferred_hubs' => $normalized['preferred_hubs'],
                        'schedule_effective_date' => $normalized['effective_date'],
                        'updated_at' => $now,
                    ]);
            }

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: 'admin_rider_schedule_updated',
                entityType: 'riders',
                entityId: $riderId,
                oldValues: [
                    'available_days' => $rider->available_days,
                    'preferred_shifts' => $rider->preferred_shifts,
                    'preferred_hubs' => $rider->preferred_hubs,
                ],
                newValues: [
                    'available_days' => $daysCsv,
                    'preferred_shifts' => $shiftsCsv,
                    'preferred_hubs' => $normalized['preferred_hubs'],
                    'effective_date' => $normalized['effective_date'],
                    'applied_immediately' => $shouldApplyNow,
                    'schedule_history_id' => $historyId,
                ],
                reason: $normalized['reason'],
                request: $request,
            );

            $timingNote = $shouldApplyNow
                ? "Effective {$normalized['effective_date']}."
                : "Scheduled to take effect on {$normalized['effective_date']}.";

            $this->notificationService->notifyUser(
                userId: (int) $rider->user_id,
                workspace: 'rider',
                type: 'rider_schedule_admin_updated',
                title: 'Approved schedule updated by Admin',
                body: "An administrator updated your delivery schedule ({$timingNote}) Reason: {$normalized['reason']}",
                relatedEntityType: 'rider_schedule_requests',
                relatedEntityId: $historyId,
            );
        });

        return $this->getAdminRiderSchedule($riderId);
    }

    /**
     * Promote any approved future-dated schedule entries whose effective_date <= today (Asia/Manila).
     */
    public function promoteDueApprovedSchedules(int $riderId): void
    {
        $todayManila = now('Asia/Manila')->toDateString();

        $hasDue = DB::table('rider_schedule_change_requests')
            ->where('rider_id', $riderId)
            ->where('status', 'approved')
            ->whereNull('applied_at')
            ->where('effective_date', '<=', $todayManila)
            ->exists();

        if (! $hasDue) {
            return;
        }

        DB::transaction(function () use ($riderId, $todayManila): void {
            $dueRows = DB::table('rider_schedule_change_requests')
                ->where('rider_id', $riderId)
                ->where('status', 'approved')
                ->whereNull('applied_at')
                ->where('effective_date', '<=', $todayManila)
                ->orderBy('effective_date')
                ->orderBy('schedule_request_id')
                ->lockForUpdate()
                ->get();

            if ($dueRows->isEmpty()) {
                return;
            }

            $latest = $dueRows->last();
            $now = now();

            DB::table('riders')
                ->where('rider_id', $riderId)
                ->update([
                    'available_days' => $latest->requested_available_days,
                    'preferred_shifts' => $latest->requested_preferred_shifts,
                    'preferred_hubs' => $latest->requested_preferred_hubs,
                    'schedule_effective_date' => $latest->effective_date,
                    'updated_at' => $now,
                ]);

            DB::table('rider_schedule_change_requests')
                ->whereIn('schedule_request_id', $dueRows->pluck('schedule_request_id')->all())
                ->update([
                    'applied_at' => $now,
                    'updated_at' => $now,
                ]);
        });
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array{available_days: array<int, string>, preferred_shifts: array<int, string>, preferred_hubs: ?string, effective_date: string, reason: string}
     */
    private function normalizeAndValidateScheduleInput(array $input, bool $requireFutureOrToday = true): array
    {
        $days = array_values(array_unique(array_filter(
            is_array($input['available_days'] ?? null) ? $input['available_days'] : [],
            static fn (mixed $d): bool => is_string($d) && in_array($d, self::VALID_DAYS, true),
        )));

        $shifts = array_values(array_unique(array_filter(
            is_array($input['preferred_shifts'] ?? null) ? $input['preferred_shifts'] : [],
            static fn (mixed $s): bool => is_string($s) && in_array($s, self::VALID_SHIFTS, true),
        )));

        if ($days === []) {
            throw ValidationException::withMessages([
                'available_days' => ['Select at least one available day.'],
            ]);
        }

        if ($shifts === []) {
            throw ValidationException::withMessages([
                'preferred_shifts' => ['Select at least one preferred shift or choose Flexible (Anytime).'],
            ]);
        }

        if (in_array('flexible', $shifts, true) && count($shifts) > 1) {
            throw ValidationException::withMessages([
                'preferred_shifts' => ['Flexible (Anytime) cannot be combined with specific shift windows.'],
            ]);
        }

        $hubsRaw = $input['preferred_hubs'] ?? null;
        if (is_array($hubsRaw)) {
            $hubTags = array_values(array_unique(array_filter(
                array_map(static fn (mixed $h): string => trim((string) $h), $hubsRaw),
                static fn (string $h): bool => $h !== '',
            )));
            $hubsString = $hubTags !== [] ? implode(', ', $hubTags) : null;
        } else {
            $hubTags = array_values(array_unique(array_filter(
                array_map('trim', explode(',', (string) ($hubsRaw ?? ''))),
                static fn (string $h): bool => $h !== '',
            )));
            $hubsString = $hubTags !== [] ? implode(', ', $hubTags) : null;
        }

        if ($hubsString !== null && mb_strlen($hubsString) > 255) {
            throw ValidationException::withMessages([
                'preferred_hubs' => ['Preferred delivery hubs must be 255 characters or fewer.'],
            ]);
        }

        $effectiveDate = trim((string) ($input['effective_date'] ?? ''));
        $todayManila = now('Asia/Manila')->toDateString();
        if ($effectiveDate === '' || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $effectiveDate)) {
            throw ValidationException::withMessages([
                'effective_date' => ['Enter a valid effective date (YYYY-MM-DD).'],
            ]);
        }
        if ($requireFutureOrToday && $effectiveDate < $todayManila) {
            throw ValidationException::withMessages([
                'effective_date' => ['Effective date cannot be in the past.'],
            ]);
        }

        $reason = trim((string) ($input['reason'] ?? ''));
        if (mb_strlen($reason) < 5 || mb_strlen($reason) > 500) {
            throw ValidationException::withMessages([
                'reason' => ['Provide a reason between 5 and 500 characters.'],
            ]);
        }

        return [
            'available_days' => $days,
            'preferred_shifts' => $shifts,
            'preferred_hubs' => $hubsString,
            'effective_date' => $effectiveDate,
            'reason' => $reason,
        ];
    }

    private function requireRiderByUser(User $user): object
    {
        $rider = DB::table('riders as r')
            ->leftJoin('cities as c', 'c.city_id', '=', 'r.base_city_id')
            ->where('r.user_id', $user->user_id)
            ->select(['r.*', 'c.city_name as base_city_name'])
            ->first();

        abort_unless($rider !== null, 404, 'Rider profile not found.');

        return $rider;
    }

    private function requireRiderById(int $riderId): object
    {
        $rider = DB::table('riders as r')
            ->leftJoin('cities as c', 'c.city_id', '=', 'r.base_city_id')
            ->where('r.rider_id', $riderId)
            ->select(['r.*', 'c.city_name as base_city_name'])
            ->first();

        abort_unless($rider !== null, 404, 'Rider not found.');

        return $rider;
    }

    private function baseRequestQuery()
    {
        return DB::table('rider_schedule_change_requests as req')
            ->join('riders as r', 'r.rider_id', '=', 'req.rider_id')
            ->join('users as ru', 'ru.user_id', '=', 'r.user_id')
            ->leftJoin('cities as c', 'c.city_id', '=', 'r.base_city_id')
            ->leftJoin('users as rev', 'rev.user_id', '=', 'req.reviewed_by_user_id')
            ->leftJoin('users as sub', 'sub.user_id', '=', 'req.submitted_by_user_id')
            ->select([
                'req.*',
                'ru.first_name as rider_first_name',
                'ru.last_name as rider_last_name',
                'ru.username as rider_username',
                'c.city_name as rider_zone',
                'rev.first_name as reviewer_first_name',
                'rev.last_name as reviewer_last_name',
                'rev.username as reviewer_username',
                'sub.first_name as submitter_first_name',
                'sub.last_name as submitter_last_name',
                'sub.username as submitter_username',
            ]);
    }

    private function fetchRequestRowById(int $requestId): ?object
    {
        return $this->baseRequestQuery()
            ->where('req.schedule_request_id', $requestId)
            ->first();
    }

    /**
     * @return array<string, mixed>
     */
    private function buildRiderSchedulePayload(object $rider): array
    {
        $rows = $this->baseRequestQuery()
            ->where('req.rider_id', $rider->rider_id)
            ->orderByDesc('req.submitted_at')
            ->orderByDesc('req.schedule_request_id')
            ->get();

        $formatted = $rows->map(fn (object $row): array => $this->formatRequestRow($row))->values()->all();
        $pending = collect($formatted)->firstWhere('status', 'pending');

        $todayManila = now('Asia/Manila')->toDateString();
        $upcoming = collect($formatted)
            ->filter(static fn (array $item): bool => $item['status'] === 'approved' && $item['applied_at'] === null && $item['effective_date'] > $todayManila)
            ->sortBy('effective_date')
            ->first();

        $history = collect($formatted)
            ->filter(static fn (array $item): bool => $item['status'] !== 'pending')
            ->values()
            ->all();

        $effectiveDate = $rider->schedule_effective_date
            ?? ($rider->approved_at ? Carbon::parse($rider->approved_at)->toDateString() : null);

        return [
            'rider_id' => (int) $rider->rider_id,
            'rider_status' => $rider->rider_status,
            'base_city' => $rider->base_city_name ?? null,
            'approved_schedule' => [
                'available_days' => $this->parseCsv($rider->available_days),
                'preferred_shifts' => $this->parseCsv($rider->preferred_shifts),
                'preferred_hubs' => $this->parseHubsCsv($rider->preferred_hubs),
                'effective_date' => $effectiveDate,
            ],
            'upcoming_schedule' => $upcoming,
            'pending_request' => $pending,
            'history' => $history,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function formatRequestRow(object $row): array
    {
        $riderName = trim("{$row->rider_first_name} {$row->rider_last_name}") ?: ($row->rider_username ?? 'Rider');
        $reviewerName = trim(($row->reviewer_first_name ?? '').' '.($row->reviewer_last_name ?? ''));
        if ($reviewerName === '' && ! empty($row->reviewer_username)) {
            $reviewerName = $row->reviewer_username;
        }

        return [
            'id' => (int) $row->schedule_request_id,
            'schedule_request_id' => (int) $row->schedule_request_id,
            'rider_id' => (int) $row->rider_id,
            'rider_name' => $riderName,
            'rider_username' => $row->rider_username,
            'rider_zone' => $row->rider_zone,
            'entry_type' => $row->entry_type,
            'status' => $row->status,
            'previous_schedule' => [
                'available_days' => $this->parseCsv($row->previous_available_days),
                'preferred_shifts' => $this->parseCsv($row->previous_preferred_shifts),
                'preferred_hubs' => $this->parseHubsCsv($row->previous_preferred_hubs),
                'effective_date' => $row->previous_effective_date,
            ],
            'available_days' => $this->parseCsv($row->requested_available_days),
            'preferred_shifts' => $this->parseCsv($row->requested_preferred_shifts),
            'preferred_hubs' => $this->parseHubsCsv($row->requested_preferred_hubs),
            'effective_date' => $row->effective_date,
            'reason' => $row->reason,
            'submitted_at' => $row->submitted_at ? Carbon::parse($row->submitted_at)->toIso8601String() : null,
            'reviewed_at' => $row->reviewed_at ? Carbon::parse($row->reviewed_at)->toIso8601String() : null,
            'reviewed_by' => $reviewerName !== '' ? $reviewerName : null,
            'admin_remarks' => $row->admin_remarks,
            'applied_at' => $row->applied_at ? Carbon::parse($row->applied_at)->toIso8601String() : null,
        ];
    }

    /**
     * @return array<int, string>
     */
    private function parseCsv(?string $value): array
    {
        if ($value === null || trim($value) === '') {
            return [];
        }

        return array_values(array_filter(array_map('trim', explode(',', $value)), static fn (string $v): bool => $v !== ''));
    }

    /**
     * @return array<int, string>
     */
    private function parseHubsCsv(?string $value): array
    {
        return $this->parseCsv($value);
    }
}
