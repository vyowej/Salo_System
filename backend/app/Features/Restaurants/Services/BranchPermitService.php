<?php

namespace App\Features\Restaurants\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\FileStorageService;
use App\Support\WorkspaceAccessResolver;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class BranchPermitService
{
    public const STATUS_PENDING_SUBMISSION = 'pending_submission';
    public const STATUS_PENDING_REVIEW = 'pending_review';
    public const STATUS_UNDER_REVIEW = 'under_review';
    public const STATUS_ADDITIONAL_INFO_REQUIRED = 'additional_info_required';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_WAIVED = 'waived';

    /** @var array<string, list<string>> */
    public const ALLOWED_TRANSITIONS = [
        self::STATUS_PENDING_SUBMISSION => [
            self::STATUS_PENDING_REVIEW,
            self::STATUS_UNDER_REVIEW,
            self::STATUS_APPROVED,
            self::STATUS_REJECTED,
            self::STATUS_WAIVED,
        ],
        self::STATUS_PENDING_REVIEW => [
            self::STATUS_UNDER_REVIEW,
            self::STATUS_ADDITIONAL_INFO_REQUIRED,
            self::STATUS_APPROVED,
            self::STATUS_REJECTED,
            self::STATUS_WAIVED,
        ],
        self::STATUS_UNDER_REVIEW => [
            self::STATUS_ADDITIONAL_INFO_REQUIRED,
            self::STATUS_APPROVED,
            self::STATUS_REJECTED,
            self::STATUS_WAIVED,
        ],
        self::STATUS_ADDITIONAL_INFO_REQUIRED => [
            self::STATUS_PENDING_REVIEW,
            self::STATUS_UNDER_REVIEW,
            self::STATUS_APPROVED,
            self::STATUS_REJECTED,
            self::STATUS_WAIVED,
        ],
        self::STATUS_REJECTED => [
            self::STATUS_PENDING_REVIEW,
            self::STATUS_UNDER_REVIEW,
            self::STATUS_APPROVED,
            self::STATUS_WAIVED,
        ],
        self::STATUS_APPROVED => [
            self::STATUS_UNDER_REVIEW,
            self::STATUS_ADDITIONAL_INFO_REQUIRED,
            self::STATUS_REJECTED,
        ],
        self::STATUS_WAIVED => [
            self::STATUS_UNDER_REVIEW,
            self::STATUS_ADDITIONAL_INFO_REQUIRED,
            self::STATUS_REJECTED,
        ],
    ];

    /** @var list<string> */
    private const OWNER_REUPLOAD_ALLOWED_STATUSES = [
        self::STATUS_PENDING_SUBMISSION,
        self::STATUS_ADDITIONAL_INFO_REQUIRED,
        self::STATUS_REJECTED,
    ];

    public function __construct(
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
        private readonly FileStorageService $fileStorageService,
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
    ) {}

    public function isVerifiedStatus(?string $status): bool
    {
        return in_array($status, [self::STATUS_APPROVED, self::STATUS_WAIVED], true);
    }

    /**
     * Transition a branch_permits row between statuses (shared helper for Permit-2b admin review).
     * Any move FROM approved/waived to another status sets restaurants.is_published = 0 in the same transaction.
     */
    public function transitionStatus(
        int $permitId,
        string $targetStatus,
        User $actor,
        ?string $note,
        Request $request,
        ?string $action = null,
    ): object {
        $cleanNote = $note !== null && trim($note) !== '' ? mb_substr(trim($note), 0, 500) : null;
        $noteRequired = $action === 'reopen'
            || in_array($targetStatus, [self::STATUS_REJECTED, self::STATUS_ADDITIONAL_INFO_REQUIRED, self::STATUS_WAIVED], true);

        if ($noteRequired && ($cleanNote === null || mb_strlen($cleanNote) < 10)) {
            throw ValidationException::withMessages([
                'review_note' => ['A review note of at least 10 characters is required for this status transition.'],
            ]);
        }

        return DB::transaction(function () use ($permitId, $targetStatus, $actor, $cleanNote, $request, $action): object {
            $permit = DB::table('branch_permits')->where('permit_id', $permitId)->lockForUpdate()->first();
            if (! $permit) {
                throw new NotFoundHttpException('Branch permit record not found.');
            }

            $currentStatus = (string) $permit->permit_status;

            if ($currentStatus === self::STATUS_PENDING_SUBMISSION) {
                throw new ConflictHttpException('Cannot review a branch permit before the owner submits a permit or exemption.');
            }

            if ($action === 'reopen' && ! $this->isVerifiedStatus($currentStatus)) {
                throw new ConflictHttpException("Only approved or waived branch permits can be reopened (current: {$currentStatus}).");
            }

            if ($action === 'start_review' && $this->isVerifiedStatus($currentStatus)) {
                throw new ConflictHttpException("Cannot start review on an already {$currentStatus} permit; use reopen with a review note.");
            }

            if ($targetStatus === self::STATUS_WAIVED && (bool) $permit->is_required_locally) {
                throw ValidationException::withMessages([
                    'is_required_locally' => ['A branch permit can only be waived when the owner declared that a local permit is not required.'],
                ]);
            }

            $allowed = self::ALLOWED_TRANSITIONS[$currentStatus] ?? [];
            if (! in_array($targetStatus, $allowed, true)) {
                throw new ConflictHttpException("Cannot transition branch permit from {$currentStatus} to {$targetStatus}.");
            }

            $now = now();
            DB::table('branch_permits')->where('permit_id', $permitId)->update([
                'permit_status' => $targetStatus,
                'review_note' => $cleanNote,
                'reviewed_by' => $actor->user_id,
                'reviewed_at' => $now,
                'updated_at' => $now,
            ]);

            if ($this->isVerifiedStatus($currentStatus) && ! $this->isVerifiedStatus($targetStatus) && $permit->restaurant_id !== null) {
                DB::table('restaurants')
                    ->where('restaurant_id', (int) $permit->restaurant_id)
                    ->update([
                        'is_published' => 0,
                        'updated_at' => $now,
                    ]);
            }

            $this->auditLogService->record(
                actorUserId: (int) $actor->user_id,
                action: $action ? "branch_permit_{$action}" : 'branch_permit_status_updated',
                entityType: 'branch_permits',
                entityId: $permitId,
                oldValues: [
                    'permit_status' => $currentStatus,
                    'review_note' => $permit->review_note,
                    'file_path' => $permit->file_path,
                ],
                newValues: [
                    'permit_status' => $targetStatus,
                    'review_note' => $cleanNote,
                    'file_path' => $permit->file_path,
                    'reviewed_by' => (int) $actor->user_id,
                    'restaurant_id' => $permit->restaurant_id ? (int) $permit->restaurant_id : null,
                ],
                reason: $cleanNote,
                request: $request,
            );

            return DB::table('branch_permits')->where('permit_id', $permitId)->first();
        });
    }

    /**
     * Validate optional permit inputs on branch creation (POST /api/restaurant/branches).
     *
     * @param  array<string, mixed>  $validated
     * @return array{mode: 'file'|'exemption'|'none', exemption_reason: ?string}
     */
    public function validateInitialPermitInput(?UploadedFile $file, array $validated): array
    {
        $hasIsRequired = array_key_exists('is_required_locally', $validated) && $validated['is_required_locally'] !== null;
        $isRequiredLocally = $hasIsRequired
            ? filter_var($validated['is_required_locally'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? true
            : true;
        $exemptionReason = isset($validated['exemption_reason']) ? trim((string) $validated['exemption_reason']) : '';

        if ($file !== null && ! $isRequiredLocally) {
            throw ValidationException::withMessages([
                'mayors_permit' => ['Do not upload a permit file when declaring that a permit is not required locally.'],
            ]);
        }

        if ($file !== null) {
            return ['mode' => 'file', 'exemption_reason' => null];
        }

        if (! $isRequiredLocally) {
            $len = mb_strlen($exemptionReason);
            if ($len < 10 || $len > 500) {
                throw ValidationException::withMessages([
                    'exemption_reason' => ['Please provide an explanation between 10 and 500 characters for why a local permit is not required.'],
                ]);
            }

            return ['mode' => 'exemption', 'exemption_reason' => $exemptionReason];
        }

        return ['mode' => 'none', 'exemption_reason' => null];
    }

    /**
     * Store a private permit file for a branch (validates real MIME + size up to 10 MB).
     *
     * @return array<string, mixed>
     */
    public function storePermitFile(UploadedFile $file, int $brandId, string $fieldName = 'mayors_permit'): array
    {
        return $this->fileStorageService->storePrivateDocument(
            file: $file,
            directory: "branch-permits/{$brandId}",
            fieldName: $fieldName,
        );
    }

    /**
     * Owner uploads or updates permit/exemption for an existing non-root branch.
     * Allowed only from pending_submission, additional_info_required, rejected (409 otherwise, unless idempotent retry).
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function submitOrUpdateForBranch(
        User $owner,
        int $restaurantId,
        ?UploadedFile $file,
        array $validated,
        Request $request,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveOwnedRestaurant($owner, $restaurantId);
        if ($restaurant->parent_restaurant_id === null) {
            throw ValidationException::withMessages([
                'restaurant_id' => ['Main (root) branch permits are managed through the initial business application.'],
            ]);
        }

        $hasIsRequired = array_key_exists('is_required_locally', $validated) && $validated['is_required_locally'] !== null;
        $isRequiredLocally = $hasIsRequired
            ? filter_var($validated['is_required_locally'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? true
            : true;
        $exemptionReason = isset($validated['exemption_reason']) ? trim((string) $validated['exemption_reason']) : '';

        if ($file === null && $isRequiredLocally) {
            throw ValidationException::withMessages([
                'mayors_permit' => ['Upload a Mayor\'s / Business Permit file or declare that a permit is not required locally.'],
            ]);
        }
        if ($file !== null && ! $isRequiredLocally) {
            throw ValidationException::withMessages([
                'mayors_permit' => ['Do not upload a permit file when declaring that a permit is not required locally.'],
            ]);
        }
        if (! $isRequiredLocally) {
            $len = mb_strlen($exemptionReason);
            if ($len < 10 || $len > 500) {
                throw ValidationException::withMessages([
                    'exemption_reason' => ['Please provide an explanation between 10 and 500 characters for why a local permit is not required.'],
                ]);
            }
        }

        $brandId = (int) ($restaurant->brand_restaurant_id ?: $restaurant->parent_restaurant_id);
        $branchLabel = $restaurant->branch_name
            ? "{$restaurant->restaurant_name} — {$restaurant->branch_name}"
            : (string) $restaurant->restaurant_name;

        return $this->persistPermitSubmission(
            actor: $owner,
            storageDirectory: "branch-permits/{$brandId}",
            branchLabel: $branchLabel,
            file: $file,
            isRequiredLocally: $isRequiredLocally,
            exemptionReason: $exemptionReason,
            lockPermitQuery: fn (): ?object => DB::table('branch_permits')
                ->where('restaurant_id', $restaurantId)
                ->lockForUpdate()
                ->first(),
            auditContext: ['restaurant_id' => $restaurantId],
            request: $request,
        );
    }

    /**
     * Applicant uploads or updates permit/exemption for an unmaterialized application branch.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function submitOrUpdateForApplicationBranch(
        User $applicant,
        int $applicationId,
        int $applicationBranchId,
        ?UploadedFile $file,
        array $validated,
        Request $request,
    ): array {
        $app = DB::table('restaurant_applications as ra')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'ra.restaurant_id')
            ->where('ra.restaurant_application_id', $applicationId)
            ->first([
                'ra.restaurant_application_id',
                'ra.applicant_user_id',
                'ra.application_status',
                'r.restaurant_name',
            ]);

        abort_unless($app !== null, 404, 'Restaurant application not found.');
        if ((int) $app->applicant_user_id !== (int) $applicant->user_id) {
            abort(403, 'Forbidden: only the application owner may manage branch permits for this application.');
        }

        $appBranch = DB::table('restaurant_application_branches')
            ->where('application_branch_id', $applicationBranchId)
            ->where('restaurant_application_id', $applicationId)
            ->first(['application_branch_id', 'branch_name', 'created_branch_restaurant_id']);

        abort_unless($appBranch !== null, 404, 'Application branch not found.');

        if ((string) $app->application_status === 'approved' || $appBranch->created_branch_restaurant_id !== null) {
            $branchId = (int) $appBranch->created_branch_restaurant_id;
            throw new ConflictHttpException(
                "Application is already approved; manage this branch permit via POST /api/restaurant/branches/{$branchId}/permit."
            );
        }

        if (in_array((string) $app->application_status, ['rejected', 'withdrawn'], true)) {
            throw new ConflictHttpException(
                "Cannot update branch permit for a {$app->application_status} application."
            );
        }

        $hasIsRequired = array_key_exists('is_required_locally', $validated) && $validated['is_required_locally'] !== null;
        $isRequiredLocally = $hasIsRequired
            ? filter_var($validated['is_required_locally'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? true
            : true;
        $exemptionReason = isset($validated['exemption_reason']) ? trim((string) $validated['exemption_reason']) : '';

        if ($file === null && $isRequiredLocally) {
            throw ValidationException::withMessages([
                'mayors_permit' => ['Upload a Mayor\'s / Business Permit file or declare that a permit is not required locally.'],
            ]);
        }
        if ($file !== null && ! $isRequiredLocally) {
            throw ValidationException::withMessages([
                'mayors_permit' => ['Do not upload a permit file when declaring that a permit is not required locally.'],
            ]);
        }
        if (! $isRequiredLocally) {
            $len = mb_strlen($exemptionReason);
            if ($len < 10 || $len > 500) {
                throw ValidationException::withMessages([
                    'exemption_reason' => ['Please provide an explanation between 10 and 500 characters for why a local permit is not required.'],
                ]);
            }
        }

        $branchLabel = "{$app->restaurant_name} — {$appBranch->branch_name}";

        return $this->persistPermitSubmission(
            actor: $applicant,
            storageDirectory: "branch-permits/app-{$applicationId}",
            branchLabel: $branchLabel,
            file: $file,
            isRequiredLocally: $isRequiredLocally,
            exemptionReason: $exemptionReason,
            lockPermitQuery: fn (): ?object => DB::table('branch_permits')
                ->where('application_branch_id', $applicationBranchId)
                ->lockForUpdate()
                ->first(),
            auditContext: [
                'restaurant_application_id' => $applicationId,
                'application_branch_id' => $applicationBranchId,
            ],
            request: $request,
        );
    }

    /**
     * Stream an application branch's private permit file for the applicant only (404 when no file; 403 otherwise).
     */
    public function streamApplicationBranchPermitFile(User $user, int $applicationId, int $applicationBranchId): StreamedResponse
    {
        $app = DB::table('restaurant_applications')
            ->where('restaurant_application_id', $applicationId)
            ->first(['restaurant_application_id', 'applicant_user_id']);

        abort_unless($app !== null, 404, 'Restaurant application not found.');

        if ((int) $app->applicant_user_id !== (int) $user->user_id) {
            abort(403, 'Forbidden: only the applicant may access this branch permit file.');
        }

        $appBranch = DB::table('restaurant_application_branches')
            ->where('application_branch_id', $applicationBranchId)
            ->where('restaurant_application_id', $applicationId)
            ->first(['application_branch_id']);

        abort_unless($appBranch !== null, 404, 'Application branch not found.');

        $permit = DB::table('branch_permits')
            ->where('application_branch_id', $applicationBranchId)
            ->first(['file_path', 'original_filename', 'mime_type']);

        if (! $permit || ! $permit->file_path) {
            abort(404, 'Branch permit file not found.');
        }

        return $this->fileStorageService->streamPrivateFile(
            path: (string) $permit->file_path,
            downloadName: (string) ($permit->original_filename ?: 'branch-permit.pdf'),
            mimeType: (string) ($permit->mime_type ?: 'application/pdf'),
        );
    }

    /**
     * Shared submission/re-upload/idempotency/audit/admin-notification routine for both
     * owner branch permits and pre-approval application branch permits.
     *
     * @param  callable(): ?object  $lockPermitQuery
     * @param  array<string, mixed>  $auditContext
     * @return array<string, mixed>
     */
    private function persistPermitSubmission(
        User $actor,
        string $storageDirectory,
        string $branchLabel,
        ?UploadedFile $file,
        bool $isRequiredLocally,
        string $exemptionReason,
        callable $lockPermitQuery,
        array $auditContext,
        Request $request,
    ): array {
        $newlyStoredPath = null;

        try {
            $stored = $file !== null
                ? $this->fileStorageService->storePrivateDocument(
                    file: $file,
                    directory: $storageDirectory,
                    fieldName: 'mayors_permit',
                )
                : null;
            $newlyStoredPath = $stored['path'] ?? null;

            return DB::transaction(function () use (
                $actor,
                $branchLabel,
                $isRequiredLocally,
                $exemptionReason,
                $stored,
                $lockPermitQuery,
                $auditContext,
                $request,
            ): array {
                $permit = $lockPermitQuery();

                if (! $permit) {
                    throw new NotFoundHttpException('Branch permit record not found.');
                }

                $currentStatus = (string) $permit->permit_status;

                if ($currentStatus === self::STATUS_PENDING_REVIEW
                    && $this->isIdenticalPermitSubmission($permit, $isRequiredLocally, $exemptionReason, $stored)
                ) {
                    if ($stored !== null && isset($stored['path'])) {
                        Storage::disk('local')->delete((string) $stored['path']);
                    }

                    return $this->formatOwnerPermitSummary($permit);
                }

                if (! in_array($currentStatus, self::OWNER_REUPLOAD_ALLOWED_STATUSES, true)) {
                    throw new ConflictHttpException(
                        "Cannot update branch permit while status is {$currentStatus}."
                    );
                }

                $now = now();
                $oldValues = [
                    'permit_status' => $permit->permit_status,
                    'is_required_locally' => (bool) $permit->is_required_locally,
                    'exemption_reason' => $permit->exemption_reason,
                    'file_path' => $permit->file_path,
                    'original_filename' => $permit->original_filename,
                ];

                // Old file_path is NEVER deleted (retained for audit_logs integrity).
                $updatePayload = [
                    'is_required_locally' => $isRequiredLocally ? 1 : 0,
                    'exemption_reason' => $isRequiredLocally ? null : $exemptionReason,
                    'permit_status' => self::STATUS_PENDING_REVIEW,
                    'review_note' => null,
                    'uploaded_by' => $actor->user_id,
                    'uploaded_at' => $now,
                    'updated_at' => $now,
                ];

                if ($stored !== null) {
                    $updatePayload['file_path'] = $stored['path'];
                    $updatePayload['original_filename'] = $stored['original_filename'];
                    $updatePayload['mime_type'] = $stored['mime_type'];
                    $updatePayload['file_size_bytes'] = $stored['size_bytes'];
                } else {
                    $updatePayload['file_path'] = null;
                    $updatePayload['original_filename'] = null;
                    $updatePayload['mime_type'] = null;
                    $updatePayload['file_size_bytes'] = null;
                }

                DB::table('branch_permits')
                    ->where('permit_id', $permit->permit_id)
                    ->update($updatePayload);

                $this->auditLogService->record(
                    actorUserId: (int) $actor->user_id,
                    action: 'branch_permit_submitted',
                    entityType: 'branch_permits',
                    entityId: (int) $permit->permit_id,
                    oldValues: $oldValues,
                    newValues: array_merge($auditContext, [
                        'permit_status' => self::STATUS_PENDING_REVIEW,
                        'is_required_locally' => $isRequiredLocally,
                        'exemption_reason' => $isRequiredLocally ? null : $exemptionReason,
                        'file_path' => $updatePayload['file_path'],
                        'original_filename' => $updatePayload['original_filename'],
                    ]),
                    request: $request,
                );

                $adminIds = $this->notificationService->resolveActiveAdminUserIds((int) $actor->user_id);
                if ($adminIds !== []) {
                    $this->notificationService->notifyUsers(
                        userIds: $adminIds,
                        workspace: 'admin',
                        type: 'branch_permit_submitted',
                        title: 'Branch permit submitted for review',
                        body: "{$branchLabel} submitted a Mayor's / Business Permit update for review.",
                        relatedEntityType: 'branch_permits',
                        relatedEntityId: (int) $permit->permit_id,
                    );
                }

                $updated = DB::table('branch_permits')->where('permit_id', $permit->permit_id)->first();

                return $this->formatOwnerPermitSummary($updated);
            });
        } catch (\Throwable $e) {
            if ($newlyStoredPath !== null && $newlyStoredPath !== '') {
                Storage::disk('local')->delete($newlyStoredPath);
            }
            throw $e;
        }
    }

    /**
     * Identical-retry identity compares exemption text or SHA-256 content of stored vs uploaded bytes.
     *
     * @param  array<string, mixed>|null  $stored
     */
    private function isIdenticalPermitSubmission(
        object $permit,
        bool $isRequiredLocally,
        string $exemptionReason,
        ?array $stored,
    ): bool {
        if (! $isRequiredLocally) {
            return ! (bool) $permit->is_required_locally
                && (string) $permit->exemption_reason === $exemptionReason
                && $stored === null;
        }

        if ($stored === null || ! (bool) $permit->is_required_locally || ! $permit->file_path) {
            return false;
        }

        $existingPath = (string) $permit->file_path;
        $newPath = (string) ($stored['path'] ?? '');
        if ($newPath === '' || ! Storage::disk('local')->exists($existingPath) || ! Storage::disk('local')->exists($newPath)) {
            return false;
        }

        return hash('sha256', (string) Storage::disk('local')->get($existingPath))
            === hash('sha256', (string) Storage::disk('local')->get($newPath));
    }

    /**
     * Stream a branch's private permit file (owners of the business and admins only; staff/outsiders 403).
     */
    public function streamPermitFile(User $user, int $restaurantId): StreamedResponse
    {
        $restaurant = DB::table('restaurants')
            ->where('restaurant_id', $restaurantId)
            ->first(['restaurant_id', 'parent_restaurant_id', 'brand_restaurant_id']);

        if (! $restaurant) {
            abort(404, 'Restaurant branch not found.');
        }

        $isAdmin = $user->user_role === 'admin';
        $isOwner = DB::table('restaurant_owners')
            ->where('restaurant_id', $restaurantId)
            ->where('user_id', $user->user_id)
            ->exists();

        if (! $isAdmin && ! $isOwner) {
            abort(403, 'Forbidden: only restaurant owners and administrators may access branch permit files.');
        }

        $permit = DB::table('branch_permits')
            ->where('restaurant_id', $restaurantId)
            ->first(['file_path', 'original_filename', 'mime_type']);

        if (! $permit || ! $permit->file_path) {
            abort(404, 'Branch permit file not found.');
        }

        return $this->fileStorageService->streamPrivateFile(
            path: (string) $permit->file_path,
            downloadName: (string) ($permit->original_filename ?: 'branch-permit.pdf'),
            mimeType: (string) ($permit->mime_type ?: 'application/pdf'),
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function formatOwnerPermitSummary(object $permit): array
    {
        return [
            'permit_id' => (int) $permit->permit_id,
            'restaurant_id' => $permit->restaurant_id !== null ? (int) $permit->restaurant_id : null,
            'permit_status' => (string) $permit->permit_status,
            'is_required_locally' => (bool) $permit->is_required_locally,
            'exemption_reason' => $permit->exemption_reason,
            'original_filename' => $permit->original_filename,
            'review_note' => $permit->review_note,
            'uploaded_at' => OrderTimestampFormatter::toManilaIso($permit->uploaded_at),
            'reviewed_at' => OrderTimestampFormatter::toManilaIso($permit->reviewed_at),
        ];
    }
}
