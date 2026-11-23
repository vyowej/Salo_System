<?php

namespace App\Features\Applications\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\FileStorageService;
use App\Support\Storage\StoragePurpose;
use App\Support\WorkspaceAccessResolver;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ProfileChangeRequestService
{
    public const RESTAURANT_SENSITIVE_FIELDS = [
        'restaurant_name',
        'registered_name',
        'business_type',
        'ownership_structure',
    ];

    public const RIDER_SENSITIVE_FIELDS = [
        'vehicle_type',
        'vehicle_brand',
        'vehicle_model',
        'vehicle_color',
        'vehicle_year',
        'plate_number',
        'mv_file_number',
        'vehicle_ownership',
        'vehicle_owner_name',
        'vehicle_owner_relationship',
        'bicycle_type',
        'motor_wattage',
        'base_city_id',
    ];

    public function __construct(
        private readonly FileStorageService $fileStorageService,
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
    ) {}

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listRestaurantRequests(User $user, ?int $restaurantId = null): array
    {
        $restaurant = $this->workspaceAccessResolver->requireActiveOwnedRestaurant($user, $restaurantId);

        return DB::table('profile_change_requests as pcr')
            ->leftJoin('users as req', 'req.user_id', '=', 'pcr.requested_by_user_id')
            ->where('pcr.entity_type', 'restaurant')
            ->where('pcr.entity_id', $restaurant->restaurant_id)
            ->orderByDesc('pcr.created_at')
            ->select([
                'pcr.*',
                'req.first_name as requester_first_name',
                'req.last_name as requester_last_name',
            ])
            ->get()
            ->map(fn (object $row): array => $this->formatChangeRequest($row))
            ->all();
    }

    /**
     * @param  array<string, mixed>  $validated
     * @param  array<int, UploadedFile>  $documents
     * @return array<string, mixed>
     */
    public function submitRestaurantRequest(
        User $user,
        array $validated,
        array $documents,
        ?int $restaurantId,
        Request $request,
    ): array {
        $restaurant = $this->workspaceAccessResolver->requireActiveOwnedRestaurant($user, $restaurantId);
        $targetId = (int) $restaurant->restaurant_id;

        $payload = [];
        foreach (self::RESTAURANT_SENSITIVE_FIELDS as $field) {
            if (array_key_exists($field, $validated)) {
                $val = $validated[$field];
                $payload[$field] = is_string($val) ? trim($val) : $val;
            }
        }

        if ($payload === [] && $documents === []) {
            throw ValidationException::withMessages([
                'payload' => ['Provide at least one updated field or supporting verification document.'],
            ]);
        }

        $storedDocs = $this->storeDocuments($documents, "change-requests/restaurant/{$targetId}");

        try {
            $requestId = DB::transaction(function () use ($user, $restaurant, $targetId, $payload, $storedDocs, $validated, $request): int {
                $id = (int) DB::table('profile_change_requests')->insertGetId([
                    'entity_type' => 'restaurant',
                    'entity_id' => $targetId,
                    'requested_by_user_id' => $user->user_id,
                    'category' => 'business_identity',
                    'payload' => json_encode($payload),
                    'document_paths' => $storedDocs !== [] ? json_encode($storedDocs) : null,
                    'reason' => isset($validated['reason']) ? trim((string) $validated['reason']) : null,
                    'status' => 'pending',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $this->auditLogService->record(
                    actorUserId: (int) $user->user_id,
                    action: 'restaurant_change_request_submitted',
                    entityType: 'profile_change_requests',
                    entityId: $id,
                    oldValues: null,
                    newValues: ['restaurant_id' => $targetId, 'fields' => array_keys($payload)],
                    request: $request,
                );

                $this->notifyAdmins(
                    type: 'restaurant_change_request_submitted',
                    title: 'Restaurant verification change request',
                    body: "A verified profile change request was submitted for {$restaurant->restaurant_name}.",
                    entityId: $id,
                );

                return $id;
            });
        } catch (\Throwable $e) {
            $this->cleanupStoredDocuments($storedDocs);
            throw $e;
        }

        return $this->getChangeRequestById($requestId);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listRiderRequests(User $user): array
    {
        $rider = $this->workspaceAccessResolver->requireActiveRider($user);

        return DB::table('profile_change_requests as pcr')
            ->leftJoin('users as req', 'req.user_id', '=', 'pcr.requested_by_user_id')
            ->where('pcr.entity_type', 'rider')
            ->where('pcr.entity_id', $rider->rider_id)
            ->orderByDesc('pcr.created_at')
            ->select([
                'pcr.*',
                'req.first_name as requester_first_name',
                'req.last_name as requester_last_name',
            ])
            ->get()
            ->map(fn (object $row): array => $this->formatChangeRequest($row))
            ->all();
    }

    /**
     * @param  array<string, mixed>  $validated
     * @param  array<int, UploadedFile>  $documents
     * @return array<string, mixed>
     */
    public function submitRiderRequest(
        User $user,
        array $validated,
        array $documents,
        Request $request,
    ): array {
        $rider = $this->workspaceAccessResolver->requireActiveRider($user);
        $targetId = (int) $rider->rider_id;

        $payload = [];
        foreach (self::RIDER_SENSITIVE_FIELDS as $field) {
            if (array_key_exists($field, $validated)) {
                $val = $validated[$field];
                if ($field === 'plate_number' && is_string($val)) {
                    $val = strtoupper(trim($val));
                } elseif (is_string($val)) {
                    $val = trim($val);
                }
                $payload[$field] = $val;
            }
        }

        if ($payload === [] && $documents === []) {
            throw ValidationException::withMessages([
                'payload' => ['Provide at least one updated vehicle/verification field or supporting document.'],
            ]);
        }

        $this->validateMergedRiderPayload($rider, $payload);

        $storedDocs = $this->storeDocuments($documents, "change-requests/rider/{$targetId}");

        try {
            $requestId = DB::transaction(function () use ($user, $targetId, $payload, $storedDocs, $validated, $request): int {
                $id = (int) DB::table('profile_change_requests')->insertGetId([
                    'entity_type' => 'rider',
                    'entity_id' => $targetId,
                    'requested_by_user_id' => $user->user_id,
                    'category' => 'vehicle_verification',
                    'payload' => json_encode($payload),
                    'document_paths' => $storedDocs !== [] ? json_encode($storedDocs) : null,
                    'reason' => isset($validated['reason']) ? trim((string) $validated['reason']) : null,
                    'status' => 'pending',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $this->auditLogService->record(
                    actorUserId: (int) $user->user_id,
                    action: 'rider_change_request_submitted',
                    entityType: 'profile_change_requests',
                    entityId: $id,
                    oldValues: null,
                    newValues: ['rider_id' => $targetId, 'fields' => array_keys($payload)],
                    request: $request,
                );

                $this->notifyAdmins(
                    type: 'rider_change_request_submitted',
                    title: 'Rider verification change request',
                    body: "{$user->first_name} {$user->last_name} submitted a rider verification/vehicle change request.",
                    entityId: $id,
                );

                return $id;
            });
        } catch (\Throwable $e) {
            $this->cleanupStoredDocuments($storedDocs);
            throw $e;
        }

        return $this->getChangeRequestById($requestId);
    }

    public function cancelRequest(User $user, int $requestId, string $entityType, Request $request): array
    {
        $row = DB::table('profile_change_requests')
            ->where('request_id', $requestId)
            ->where('entity_type', $entityType)
            ->first();

        if ($row === null) {
            throw new NotFoundHttpException('Change request not found.');
        }

        if ($entityType === 'restaurant') {
            $this->workspaceAccessResolver->requireActiveOwnedRestaurant($user, (int) $row->entity_id);
        } else {
            $rider = $this->workspaceAccessResolver->requireActiveRider($user);
            if ((int) $rider->rider_id !== (int) $row->entity_id) {
                throw new AccessDeniedHttpException('You are not authorized to cancel this request.');
            }
        }

        if ($row->status !== 'pending') {
            throw new ConflictHttpException('Only pending change requests can be cancelled.');
        }

        DB::transaction(function () use ($requestId, $user, $request): void {
            DB::table('profile_change_requests')
                ->where('request_id', $requestId)
                ->update([
                    'status' => 'cancelled',
                    'updated_at' => now(),
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'profile_change_request_cancelled',
                entityType: 'profile_change_requests',
                entityId: $requestId,
                oldValues: ['status' => 'pending'],
                newValues: ['status' => 'cancelled'],
                request: $request,
            );
        });

        return $this->getChangeRequestById($requestId);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<int, array<string, mixed>>
     */
    public function listForAdmin(array $filters = []): array
    {
        $query = DB::table('profile_change_requests as pcr')
            ->leftJoin('users as req', 'req.user_id', '=', 'pcr.requested_by_user_id')
            ->leftJoin('restaurants as r', function ($join): void {
                $join->on('r.restaurant_id', '=', 'pcr.entity_id')
                    ->where('pcr.entity_type', '=', 'restaurant');
            })
            ->leftJoin('riders as rd', function ($join): void {
                $join->on('rd.rider_id', '=', 'pcr.entity_id')
                    ->where('pcr.entity_type', '=', 'rider');
            })
            ->select([
                'pcr.*',
                'req.first_name as requester_first_name',
                'req.last_name as requester_last_name',
                'req.email as requester_email',
                'r.restaurant_name as target_restaurant_name',
            ])
            ->orderByRaw("CASE WHEN pcr.status = 'pending' THEN 0 ELSE 1 END")
            ->orderByDesc('pcr.created_at');

        if (! empty($filters['entity_type']) && in_array($filters['entity_type'], ['restaurant', 'rider'], true)) {
            $query->where('pcr.entity_type', $filters['entity_type']);
        }

        if (! empty($filters['status']) && $filters['status'] !== 'all') {
            $query->where('pcr.status', $filters['status']);
        }

        return $query->get()
            ->map(fn (object $row): array => $this->formatChangeRequest($row))
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    public function decideChangeRequest(
        int $requestId,
        string $decision,
        ?string $reviewNote,
        User $admin,
        Request $request,
    ): array {
        $row = DB::table('profile_change_requests')
            ->where('request_id', $requestId)
            ->first();

        if ($row === null) {
            throw new NotFoundHttpException('Change request not found.');
        }

        if ($row->status !== 'pending') {
            throw new ConflictHttpException('This change request has already been reviewed.');
        }

        $payload = json_decode((string) $row->payload, true);
        $payload = is_array($payload) ? $payload : [];

        DB::transaction(function () use ($row, $payload, $decision, $reviewNote, $admin, $request): void {
            if ($decision === 'approve' && $payload !== []) {
                if ($row->entity_type === 'restaurant') {
                    $allowed = array_intersect_key($payload, array_flip(self::RESTAURANT_SENSITIVE_FIELDS));
                    if ($allowed !== []) {
                        $allowed['updated_at'] = now();
                        $targetRestaurant = DB::table('restaurants')
                            ->where('restaurant_id', $row->entity_id)
                            ->first(['restaurant_id', 'parent_restaurant_id', 'brand_restaurant_id']);

                        $brandId = $targetRestaurant
                            ? (int) ($targetRestaurant->brand_restaurant_id ?: ($targetRestaurant->parent_restaurant_id ?: $targetRestaurant->restaurant_id))
                            : (int) $row->entity_id;

                        DB::table('restaurants')
                            ->where(function ($query) use ($brandId, $row): void {
                                $query->where('brand_restaurant_id', $brandId)
                                    ->orWhere('restaurant_id', $row->entity_id);
                            })
                            ->update($allowed);
                    }
                } elseif ($row->entity_type === 'rider') {
                    $rider = DB::table('riders')->where('rider_id', $row->entity_id)->first();
                    if ($rider !== null) {
                        $allowed = array_intersect_key($payload, array_flip(self::RIDER_SENSITIVE_FIELDS));
                        if (($allowed['vehicle_type'] ?? $rider->vehicle_type) === 'walking') {
                            foreach ([
                                'plate_number', 'vehicle_brand', 'vehicle_model', 'vehicle_color',
                                'vehicle_year', 'vehicle_ownership', 'bicycle_type', 'motor_wattage',
                                'mv_file_number', 'vehicle_owner_name', 'vehicle_owner_relationship',
                            ] as $clearField) {
                                $allowed[$clearField] = null;
                            }
                        }
                        if ($allowed !== []) {
                            $allowed['updated_at'] = now();
                            DB::table('riders')
                                ->where('rider_id', $row->entity_id)
                                ->update($allowed);
                        }
                    }
                }
            }

            $nextStatus = $decision === 'approve' ? 'approved' : 'rejected';

            DB::table('profile_change_requests')
                ->where('request_id', $row->request_id)
                ->update([
                    'status' => $nextStatus,
                    'reviewed_by_user_id' => $admin->user_id,
                    'review_note' => $reviewNote !== null ? trim($reviewNote) : null,
                    'reviewed_at' => now(),
                    'updated_at' => now(),
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: "profile_change_request_{$nextStatus}",
                entityType: 'profile_change_requests',
                entityId: (int) $row->request_id,
                oldValues: ['status' => 'pending'],
                newValues: ['status' => $nextStatus, 'review_note' => $reviewNote],
                request: $request,
            );

            $workspace = $row->entity_type === 'restaurant' ? 'restaurant' : 'rider';
            $this->notificationService->notifyUser(
                userId: (int) $row->requested_by_user_id,
                workspace: $workspace,
                type: "profile_change_request_{$nextStatus}",
                title: $nextStatus === 'approved' ? 'Verification change approved' : 'Verification change rejected',
                body: $nextStatus === 'approved'
                    ? 'Your requested profile/verification changes have been approved and applied.'
                    : ('Your requested profile/verification changes were rejected.'.($reviewNote ? " Note: {$reviewNote}" : '')),
                relatedEntityType: 'profile_change_request',
                relatedEntityId: (int) $row->request_id,
            );
        });

        if ($decision === 'approve' && $row->entity_type === 'restaurant' && ! empty($payload['restaurant_name']) && strtolower(trim((string) config('salo.uploads.public_image_driver', 'local'))) === 'google_drive') {
            try {
                $targetRestaurant = DB::table('restaurants')
                    ->where('restaurant_id', $row->entity_id)
                    ->first(['restaurant_id', 'parent_restaurant_id', 'brand_restaurant_id']);
                $brandId = $targetRestaurant
                    ? (int) ($targetRestaurant->brand_restaurant_id ?: ($targetRestaurant->parent_restaurant_id ?: $targetRestaurant->restaurant_id))
                    : (int) $row->entity_id;
                $this->fileStorageService->folders()->renameRestaurantBrandFolder($brandId, (string) $payload['restaurant_name']);
            } catch (\Throwable) {
                // Best-effort Drive folder rename; DB name update already committed.
            }
        }

        return $this->getChangeRequestById($requestId);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listLifecycleForAdmin(array $filters = []): array
    {
        $query = DB::table('account_lifecycle_requests as alr')
            ->join('users as u', 'u.user_id', '=', 'alr.user_id')
            ->select([
                'alr.*',
                'u.first_name',
                'u.last_name',
                'u.email',
                'u.username',
                'u.account_status',
                'u.user_role',
            ])
            ->orderByRaw("CASE WHEN alr.status = 'pending' THEN 0 ELSE 1 END")
            ->orderByDesc('alr.created_at');

        if (! empty($filters['request_type']) && in_array($filters['request_type'], ['deactivation', 'reactivation', 'deletion'], true)) {
            $query->where('alr.request_type', $filters['request_type']);
        }

        if (! empty($filters['status']) && $filters['status'] !== 'all') {
            $query->where('alr.status', $filters['status']);
        }

        return $query->get()
            ->map(fn (object $row): array => [
                'lifecycle_request_id' => (int) $row->lifecycle_request_id,
                'user_id' => (int) $row->user_id,
                'user_name' => trim("{$row->first_name} {$row->last_name}"),
                'email' => $row->email,
                'username' => $row->username,
                'account_status' => $row->account_status,
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
     * @return array<string, mixed>
     */
    public function decideLifecycleRequest(
        int $lifecycleRequestId,
        string $decision,
        ?string $reviewNote,
        User $admin,
        Request $request,
    ): array {
        $row = DB::table('account_lifecycle_requests')
            ->where('lifecycle_request_id', $lifecycleRequestId)
            ->first();

        if ($row === null) {
            throw new NotFoundHttpException('Lifecycle request not found.');
        }

        if ($row->status !== 'pending') {
            throw new ConflictHttpException('This lifecycle request has already been reviewed.');
        }

        $nextStatus = $decision === 'approve' ? 'approved' : 'rejected';

        DB::transaction(function () use ($row, $decision, $nextStatus, $reviewNote, $admin, $request): void {
            if ($decision === 'approve') {
                if ($row->request_type === 'reactivation') {
                    DB::table('users')
                        ->where('user_id', $row->user_id)
                        ->update(['account_status' => 'active', 'updated_at' => now()]);
                } elseif ($row->request_type === 'deletion') {
                    // Preserve transactional & audit integrity while disabling login access
                    DB::table('users')
                        ->where('user_id', $row->user_id)
                        ->update(['account_status' => 'inactive', 'updated_at' => now()]);
                }
            }

            DB::table('account_lifecycle_requests')
                ->where('lifecycle_request_id', $row->lifecycle_request_id)
                ->update([
                    'status' => $nextStatus,
                    'reviewed_by_user_id' => $admin->user_id,
                    'review_note' => $reviewNote !== null ? trim($reviewNote) : null,
                    'reviewed_at' => now(),
                    'updated_at' => now(),
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: "account_lifecycle_{$row->request_type}_{$nextStatus}",
                entityType: 'account_lifecycle_requests',
                entityId: (int) $row->lifecycle_request_id,
                oldValues: ['status' => 'pending'],
                newValues: ['status' => $nextStatus, 'review_note' => $reviewNote],
                request: $request,
            );
        });

        $updated = DB::table('account_lifecycle_requests as alr')
            ->join('users as u', 'u.user_id', '=', 'alr.user_id')
            ->where('alr.lifecycle_request_id', $lifecycleRequestId)
            ->select(['alr.*', 'u.first_name', 'u.last_name', 'u.email', 'u.username', 'u.account_status'])
            ->first();

        return [
            'lifecycle_request_id' => (int) $updated->lifecycle_request_id,
            'user_id' => (int) $updated->user_id,
            'user_name' => trim("{$updated->first_name} {$updated->last_name}"),
            'email' => $updated->email,
            'account_status' => $updated->account_status,
            'request_type' => $updated->request_type,
            'reason' => $updated->reason,
            'status' => $updated->status,
            'review_note' => $updated->review_note,
            'reviewed_at' => $updated->reviewed_at,
            'created_at' => $updated->created_at,
        ];
    }

    public function streamDocument(User $user, int $requestId, int $docIndex): Response
    {
        $row = DB::table('profile_change_requests')
            ->where('request_id', $requestId)
            ->first();

        if ($row === null) {
            throw new NotFoundHttpException('Change request not found.');
        }

        $isAdmin = $user->user_role === 'admin';
        if (! $isAdmin) {
            try {
                if ($row->entity_type === 'restaurant') {
                    $this->workspaceAccessResolver->requireActiveOwnedRestaurant($user, (int) $row->entity_id);
                } else {
                    $rider = $this->workspaceAccessResolver->requireActiveRider($user);
                    if ((int) $rider->rider_id !== (int) $row->entity_id) {
                        throw new AccessDeniedHttpException('Not authorized to view this document.');
                    }
                }
            } catch (\Throwable $e) {
                $this->auditLogService->recordPrivateFileAccess((int) $user->user_id, 'profile_change_requests', $requestId, false, request());
                throw $e;
            }
        }

        $docs = json_decode((string) $row->document_paths, true);
        if (! is_array($docs) || ! isset($docs[$docIndex]['path'])) {
            throw new NotFoundHttpException('Document not found.');
        }

        $this->auditLogService->recordPrivateFileAccess((int) $user->user_id, 'profile_change_requests', $requestId, true, request());

        return $this->fileStorageService->streamPrivateStoredFile(
            $docs[$docIndex]['path'],
            $docs[$docIndex]['original_name'] ?? null,
            (string) ($docs[$docIndex]['mime_type'] ?? 'application/octet-stream'),
        );
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function validateMergedRiderPayload(object $rider, array $payload): void
    {
        $vehicleType = $payload['vehicle_type'] ?? $rider->vehicle_type;
        $plate = array_key_exists('plate_number', $payload) ? $payload['plate_number'] : $rider->plate_number;
        $year = array_key_exists('vehicle_year', $payload) ? $payload['vehicle_year'] : $rider->vehicle_year;
        $ownership = array_key_exists('vehicle_ownership', $payload) ? $payload['vehicle_ownership'] : $rider->vehicle_ownership;
        $ownerName = array_key_exists('vehicle_owner_name', $payload) ? $payload['vehicle_owner_name'] : $rider->vehicle_owner_name;
        $ownerRel = array_key_exists('vehicle_owner_relationship', $payload) ? $payload['vehicle_owner_relationship'] : $rider->vehicle_owner_relationship;

        if ($vehicleType === 'motorcycle' && (empty($plate) || empty($year) || empty($ownership))) {
            throw ValidationException::withMessages([
                'plate_number' => ['Motorcycles require plate number, vehicle year, and ownership type.'],
            ]);
        }

        if ($vehicleType !== 'walking' && ! empty($ownership) && $ownership !== 'personally_owned') {
            if (empty($ownerName) || empty($ownerRel)) {
                throw ValidationException::withMessages([
                    'vehicle_owner_name' => ['Non-personally-owned vehicles require owner name and relationship.'],
                ]);
            }
        }
    }

    /**
     * @param  array<int, UploadedFile>  $documents
     * @return array<int, array<string, mixed>>
     */
    private function storeDocuments(array $documents, string $directory): array
    {
        $stored = [];
        try {
            foreach ($documents as $idx => $file) {
                if (! $file instanceof UploadedFile) {
                    continue;
                }
                $stored[] = $this->fileStorageService->storePrivateFileForPurpose(
                    file: $file,
                    purpose: StoragePurpose::PROFILE_CHANGE_DOCUMENT,
                    ownerContext: ['request_directory' => $directory],
                    localDirectory: $directory,
                    fieldName: "documents.{$idx}",
                );
            }
        } catch (\Throwable $e) {
            $this->cleanupStoredDocuments($stored);
            throw $e;
        }

        return $stored;
    }

    /**
     * @param  array<int, array<string, mixed>>  $storedDocs
     */
    private function cleanupStoredDocuments(array $storedDocs): void
    {
        foreach ($storedDocs as $doc) {
            if (! empty($doc['path'])) {
                Storage::disk('local')->delete((string) $doc['path']);
            }
        }
    }

    private function notifyAdmins(string $type, string $title, string $body, int $entityId): void
    {
        $adminIds = DB::table('users')
            ->where('user_role', 'admin')
            ->where('account_status', 'active')
            ->pluck('user_id')
            ->all();

        if ($adminIds !== []) {
            $this->notificationService->notifyUsers(
                userIds: $adminIds,
                workspace: 'admin',
                type: $type,
                title: $title,
                body: $body,
                relatedEntityType: 'profile_change_request',
                relatedEntityId: $entityId,
            );
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function getChangeRequestById(int $requestId): array
    {
        $row = DB::table('profile_change_requests as pcr')
            ->leftJoin('users as req', 'req.user_id', '=', 'pcr.requested_by_user_id')
            ->leftJoin('restaurants as r', function ($join): void {
                $join->on('r.restaurant_id', '=', 'pcr.entity_id')
                    ->where('pcr.entity_type', '=', 'restaurant');
            })
            ->where('pcr.request_id', $requestId)
            ->select([
                'pcr.*',
                'req.first_name as requester_first_name',
                'req.last_name as requester_last_name',
                'req.email as requester_email',
                'r.restaurant_name as target_restaurant_name',
            ])
            ->first();

        return $this->formatChangeRequest($row);
    }

    /**
     * @return array<string, mixed>
     */
    private function formatChangeRequest(object $row): array
    {
        $payload = json_decode((string) $row->payload, true);
        $docs = json_decode((string) $row->document_paths, true);

        return [
            'request_id' => (int) $row->request_id,
            'entity_type' => $row->entity_type,
            'entity_id' => (int) $row->entity_id,
            'target_name' => $row->target_restaurant_name ?? null,
            'requested_by_user_id' => (int) $row->requested_by_user_id,
            'requester_name' => trim((string) (($row->requester_first_name ?? '').' '.($row->requester_last_name ?? ''))),
            'requester_email' => $row->requester_email ?? null,
            'category' => $row->category,
            'payload' => is_array($payload) ? $payload : [],
            'documents' => is_array($docs) ? array_map(fn (array $doc, int $idx): array => [
                'index' => $idx,
                'original_name' => $doc['original_name'] ?? ('Document '.($idx + 1)),
                'mime_type' => $doc['mime_type'] ?? null,
                'size' => $doc['size'] ?? null,
            ], $docs, array_keys($docs)) : [],
            'reason' => $row->reason,
            'status' => $row->status,
            'review_note' => $row->review_note,
            'reviewed_at' => $row->reviewed_at,
            'created_at' => $row->created_at,
        ];
    }
}
