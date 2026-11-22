<?php

namespace App\Features\Admin\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Restaurants\Services\RestaurantApplicationService;
use App\Features\Riders\Services\RiderApplicationService;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\FileStorageService;
use App\Support\RestaurantBranchService;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class AdminApplicationService
{
    /**
     * Allowed admin-driven status transitions.
     * 'additional_documents_required' transitions to 'resubmitted' only when the applicant uploads documents.
     */
    private const ALLOWED_TRANSITIONS = [
        'submitted' => ['under_review'],
        'pending_review' => ['under_review'],
        'resubmitted' => ['under_review'],
        'under_review' => ['additional_documents_required', 'approved', 'rejected'],
        'additional_documents_required' => [],
        'approved' => [],
        'rejected' => [],
    ];

    public function __construct(
        private readonly RestaurantApplicationService $restaurantApplicationService,
        private readonly RiderApplicationService $riderApplicationService,
        private readonly AuditLogService $auditLogService,
        private readonly FileStorageService $fileStorageService,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * List paginated restaurant or rider applications with search, status, and date filtering.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listApplications(string $type, array $filters): array
    {
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 15)));
        $search = trim((string) ($filters['search'] ?? ''));
        $status = trim((string) ($filters['status'] ?? ''));
        $dateRange = trim((string) ($filters['date_range'] ?? 'all'));
        $sortDir = strtolower((string) ($filters['direction'] ?? 'desc')) === 'asc' ? 'asc' : 'desc';

        $isRider = $type === 'rider';
        $query = $isRider
            ? $this->buildRiderApplicationsQuery($search)
            : $this->buildRestaurantApplicationsQuery($search);

        $this->applyCommonApplicationFilters($query, $status, $dateRange);

        $paginator = $query->orderBy('ra.submitted_at', $sortDir)->paginate($perPage);
        $pageRows = collect($paginator->items());
        $appIds = $pageRows->pluck('id')->map(static fn ($id): int => (int) $id)->all();
        $foreignKey = $isRider ? 'rider_application_id' : 'restaurant_application_id';
        $docCountsByAppId = $this->loadApplicationDocumentCounts($foreignKey, $appIds);

        $items = $pageRows->map(fn (object $row): array => $isRider
            ? $this->formatRiderApplicationRow($row, $docCountsByAppId->get((int) $row->id))
            : $this->formatRestaurantApplicationRow($row, $docCountsByAppId->get((int) $row->id))
        )->all();

        return [
            'items' => $items,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ];
    }

    private function buildRiderApplicationsQuery(string $search): Builder
    {
        $query = DB::table('rider_applications as ra')
            ->join('riders as r', 'r.rider_id', '=', 'ra.rider_id')
            ->join('cities as c', 'c.city_id', '=', 'r.base_city_id')
            ->join('users as u', 'u.user_id', '=', 'ra.applicant_user_id')
            ->select([
                'ra.rider_application_id as id', 'ra.reference_number', 'ra.application_status',
                'ra.legal_first_name', 'ra.legal_last_name', 'ra.contact_email', 'ra.contact_phone',
                'ra.submitted_at', 'ra.reviewed_at', 'ra.decided_at', 'ra.reviewer_note',
                'r.rider_id', 'r.vehicle_type', 'r.rider_status', 'c.city_name as zone', 'u.username',
            ]);

        if ($search !== '') {
            $like = "%{$search}%";
            $query->where(function ($q) use ($like): void {
                $q->where('ra.reference_number', 'like', $like)
                    ->orWhere('ra.legal_first_name', 'like', $like)
                    ->orWhere('ra.legal_last_name', 'like', $like)
                    ->orWhere('ra.contact_email', 'like', $like)
                    ->orWhere('c.city_name', 'like', $like)
                    ->orWhere('r.vehicle_type', 'like', $like);
            });
        }

        return $query;
    }

    private function buildRestaurantApplicationsQuery(string $search): Builder
    {
        $query = DB::table('restaurant_applications as ra')
            ->join('restaurants as rest', 'rest.restaurant_id', '=', 'ra.restaurant_id')
            ->join('addresses as addr', 'addr.address_id', '=', 'rest.address_id')
            ->join('barangays as brgy', 'brgy.barangay_id', '=', 'addr.barangay_id')
            ->join('cities as c', 'c.city_id', '=', 'brgy.city_id')
            ->select([
                'ra.restaurant_application_id as id', 'ra.reference_number', 'ra.application_status',
                'ra.legal_first_name', 'ra.legal_last_name', 'ra.contact_email', 'ra.contact_phone',
                'ra.submitted_at', 'ra.reviewed_at', 'ra.decided_at', 'ra.reviewer_note',
                'rest.restaurant_id', 'rest.restaurant_name', 'rest.business_type',
                'rest.ownership_structure', 'rest.restaurant_status', 'rest.logo_image',
                'rest.cover_image', 'c.city_name as zone',
            ]);

        if ($search !== '') {
            $like = "%{$search}%";
            $query->where(function ($q) use ($like): void {
                $q->where('ra.reference_number', 'like', $like)
                    ->orWhere('rest.restaurant_name', 'like', $like)
                    ->orWhere('ra.legal_first_name', 'like', $like)
                    ->orWhere('ra.legal_last_name', 'like', $like)
                    ->orWhere('ra.contact_email', 'like', $like)
                    ->orWhere('c.city_name', 'like', $like);
            });
        }

        return $query;
    }

    private function applyCommonApplicationFilters(Builder $query, string $status, string $dateRange): void
    {
        if ($status !== '' && $status !== 'all') {
            $query->where('ra.application_status', $status);
        }

        if ($dateRange === '7d') {
            $query->where('ra.submitted_at', '>=', now()->subDays(7));
        } elseif ($dateRange === '30d') {
            $query->where('ra.submitted_at', '>=', now()->subDays(30));
        }
    }

    /**
     * @param  array<int, int>  $applicationIds
     */
    private function loadApplicationDocumentCounts(string $foreignKey, array $applicationIds): Collection
    {
        if ($applicationIds === []) {
            return collect();
        }

        return DB::table('application_documents')
            ->whereIn($foreignKey, $applicationIds)
            ->selectRaw("{$foreignKey}, COUNT(*) as total, SUM(CASE WHEN document_status = 'verified' THEN 1 ELSE 0 END) as verified")
            ->groupBy($foreignKey)
            ->get()
            ->keyBy($foreignKey);
    }

    /**
     * @return array<string, mixed>
     */
    private function formatRiderApplicationRow(object $row, ?object $docCounts): array
    {
        return [
            'id' => (int) $row->id,
            'type' => 'rider',
            'reference_number' => $row->reference_number,
            'name' => trim("{$row->legal_first_name} {$row->legal_last_name}"),
            'email' => $row->contact_email,
            'phone' => $row->contact_phone,
            'vehicle_type' => $row->vehicle_type,
            'zone' => $row->zone,
            'application_status' => $row->application_status,
            'rider_status' => $row->rider_status,
            'submitted_at' => $row->submitted_at,
            'reviewed_at' => $row->reviewed_at,
            'decided_at' => $row->decided_at,
            'reviewer_note' => $row->reviewer_note,
            'verified_docs_count' => (int) ($docCounts->verified ?? 0),
            'total_docs_count' => (int) ($docCounts->total ?? 0),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function formatRestaurantApplicationRow(object $row, ?object $docCounts): array
    {
        return [
            'id' => (int) $row->id,
            'type' => 'restaurant',
            'reference_number' => $row->reference_number,
            'name' => $row->restaurant_name,
            'owner_name' => trim("{$row->legal_first_name} {$row->legal_last_name}"),
            'email' => $row->contact_email,
            'phone' => $row->contact_phone,
            'business_type' => $row->business_type,
            'ownership_structure' => $row->ownership_structure,
            'zone' => $row->zone,
            'logo_image' => $this->fileStorageService->publicUrl($row->logo_image),
            'cover_image' => $this->fileStorageService->publicUrl($row->cover_image),
            'application_status' => $row->application_status,
            'restaurant_status' => $row->restaurant_status,
            'submitted_at' => $row->submitted_at,
            'reviewed_at' => $row->reviewed_at,
            'decided_at' => $row->decided_at,
            'reviewer_note' => $row->reviewer_note,
            'verified_docs_count' => (int) ($docCounts->verified ?? 0),
            'total_docs_count' => (int) ($docCounts->total ?? 0),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function getApplicationDetail(string $type, int $id): array
    {
        $detail = $type === 'rider'
            ? $this->riderApplicationService->getApplicationById($id)
            : $this->restaurantApplicationService->getApplicationById($id);

        $entityType = $type === 'rider' ? 'rider_applications' : 'restaurant_applications';

        $history = DB::table('audit_logs as al')
            ->leftJoin('users as u', 'u.user_id', '=', 'al.actor_user_id')
            ->where('al.entity_type', $entityType)
            ->where('al.entity_id', (string) $id)
            ->orderByDesc('al.created_at')
            ->select([
                'al.log_id',
                'al.action',
                'al.reason',
                'al.new_values',
                'al.created_at',
                'u.first_name',
                'u.last_name',
            ])
            ->get()
            ->map(fn ($entry) => [
                'log_id' => (int) $entry->log_id,
                'action' => $entry->action,
                'actor' => trim(($entry->first_name ?? '').' '.($entry->last_name ?? '')) ?: 'System',
                'reason' => $entry->reason,
                'created_at' => $entry->created_at,
            ])
            ->all();

        $detail['history'] = $history;

        return $detail;
    }

    /**
     * @return array<string, mixed>
     */
    public function reviewDocument(
        string $type,
        int $applicationId,
        int $documentId,
        string $status,
        ?string $reviewNote,
        User $admin,
        Request $request,
    ): array {
        if ($status === 'rejected' && trim((string) $reviewNote) === '') {
            throw ValidationException::withMessages([
                'review_note' => ['A rejection reason is required when rejecting a document.'],
            ]);
        }

        $fkColumn = $type === 'rider' ? 'rider_application_id' : 'restaurant_application_id';
        $table = $type === 'rider' ? 'rider_applications' : 'restaurant_applications';
        $pk = $type === 'rider' ? 'rider_application_id' : 'restaurant_application_id';

        $app = DB::table($table)->where($pk, $applicationId)->first();
        abort_unless($app !== null, 404, 'Application not found.');
        $this->assertNotSelfReview($app, $admin);

        $doc = DB::table('application_documents')
            ->where('document_id', $documentId)
            ->where($fkColumn, $applicationId)
            ->first();

        abort_unless($doc !== null, 404, 'Application document not found.');

        DB::transaction(function () use ($type, $applicationId, $documentId, $doc, $status, $reviewNote, $admin, $request): void {
            $now = now();
            DB::table('application_documents')
                ->where('document_id', $documentId)
                ->update([
                    'document_status' => $status,
                    'review_note' => $status === 'rejected' ? mb_substr(trim((string) $reviewNote), 0, 500) : null,
                    'reviewed_by' => $admin->user_id,
                    'reviewed_at' => $now->format('Y-m-d H:i:s'),
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: "application_document_{$status}",
                entityType: $type === 'rider' ? 'rider_applications' : 'restaurant_applications',
                entityId: $applicationId,
                oldValues: ['document_id' => $documentId, 'document_status' => $doc->document_status],
                newValues: ['document_id' => $documentId, 'document_status' => $status],
                reason: $reviewNote,
                request: $request,
            );
        });

        return $this->getApplicationDetail($type, $applicationId);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function requestDocument(
        string $type,
        int $applicationId,
        array $data,
        User $admin,
        Request $request,
    ): array {
        $table = $type === 'rider' ? 'rider_applications' : 'restaurant_applications';
        $pk = $type === 'rider' ? 'rider_application_id' : 'restaurant_application_id';

        $app = DB::table($table)->where($pk, $applicationId)->first();
        abort_unless($app !== null, 404, 'Application not found.');
        $this->assertNotSelfReview($app, $admin);
        $this->assertValidTransition((string) $app->application_status, 'additional_documents_required');

        DB::transaction(function () use ($type, $table, $pk, $applicationId, $app, $data, $admin, $request): void {
            $now = now();

            $requestId = DB::table('application_document_requests')->insertGetId([
                'restaurant_application_id' => $type === 'restaurant' ? $applicationId : null,
                'rider_application_id' => $type === 'rider' ? $applicationId : null,
                'requested_by' => $admin->user_id,
                'document_name' => trim((string) $data['document_name']),
                'reason' => trim((string) $data['reason']),
                'instructions' => ! empty($data['instructions']) ? trim((string) $data['instructions']) : null,
                'due_date' => $data['due_date'] ?? null,
                'request_status' => 'open',
                'created_at' => $now,
            ]);

            DB::table($table)->where($pk, $applicationId)->update([
                'application_status' => 'additional_documents_required',
                'reviewer_note' => trim((string) $data['reason']),
                'reviewed_by' => $admin->user_id,
                'reviewed_at' => $now->format('Y-m-d H:i:s'),
                'updated_at' => $now,
            ]);

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: 'application_document_requested',
                entityType: $table,
                entityId: $applicationId,
                oldValues: ['application_status' => $app->application_status],
                newValues: ['application_status' => 'additional_documents_required', 'request_id' => $requestId, 'document_name' => $data['document_name']],
                reason: (string) $data['reason'],
                request: $request,
            );

            $docName = trim((string) $data['document_name']);
            $reqReason = trim((string) $data['reason']);
            $label = $type === 'rider' ? 'rider' : 'restaurant';
            $this->notificationService->notifyUser(
                userId: (int) $app->applicant_user_id,
                workspace: 'customer',
                type: "{$type}_application_additional_documents_required",
                title: 'Additional documents required',
                body: "Your {$label} application ({$app->reference_number}) requires: {$docName}. Reason: {$reqReason}",
                relatedEntityType: $table,
                relatedEntityId: $applicationId,
            );
        });

        return $this->getApplicationDetail($type, $applicationId);
    }

    /**
     * @return array<string, mixed>
     */
    public function decideApplication(
        string $type,
        int $applicationId,
        string $decision,
        ?string $note,
        User $admin,
        Request $request,
    ): array {
        $statusMap = [
            'under_review' => 'under_review',
            'additional_documents_required' => 'additional_documents_required',
            'approve' => 'approved',
            'reject' => 'rejected',
        ];

        $nextStatus = $statusMap[$decision];
        $cleanNote = $note !== null ? trim($note) : null;

        if (in_array($nextStatus, ['additional_documents_required', 'rejected'], true) && ($cleanNote === null || $cleanNote === '')) {
            throw ValidationException::withMessages([
                'note' => ['A message / reason is required when requesting additional information or rejecting an application.'],
            ]);
        }

        $table = $type === 'rider' ? 'rider_applications' : 'restaurant_applications';
        $pk = $type === 'rider' ? 'rider_application_id' : 'restaurant_application_id';

        $app = DB::table($table)->where($pk, $applicationId)->first();
        abort_unless($app !== null, 404, 'Application not found.');
        $this->assertNotSelfReview($app, $admin);
        $this->assertValidTransition((string) $app->application_status, $nextStatus);

        DB::transaction(function () use ($type, $table, $pk, $applicationId, $app, $nextStatus, $cleanNote, $admin, $request): void {
            $now = now();
            $isFinal = in_array($nextStatus, ['approved', 'rejected'], true);

            DB::table($table)->where($pk, $applicationId)->update([
                'application_status' => $nextStatus,
                'reviewer_note' => $cleanNote,
                'reviewed_by' => $admin->user_id,
                'reviewed_at' => $now->format('Y-m-d H:i:s'),
                'decided_at' => $isFinal ? $now->format('Y-m-d H:i:s') : $app->decided_at,
                'updated_at' => $now,
            ]);

            if ($type === 'restaurant') {
                if ($nextStatus === 'approved') {
                    DB::table('restaurants')->where('restaurant_id', $app->restaurant_id)->update([
                        'restaurant_status' => 'active',
                        'updated_at' => $now,
                    ]);

                    DB::table('menu_items')
                        ->where('restaurant_id', $app->restaurant_id)
                        ->where('approval_status', 'pending')
                        ->update([
                            'approval_status' => 'approved',
                            'updated_at' => $now,
                        ]);

                    $this->materializeApprovedApplicationBranches(
                        applicationId: $applicationId,
                        rootRestaurantId: (int) $app->restaurant_id,
                        referenceNumber: (string) $app->reference_number,
                        cleanNote: $cleanNote,
                        admin: $admin,
                        request: $request,
                        now: $now,
                    );
                } elseif ($nextStatus === 'rejected') {
                    DB::table('restaurants')->where('restaurant_id', $app->restaurant_id)->update([
                        'restaurant_status' => 'rejected',
                        'updated_at' => $now,
                    ]);
                }
            } else {
                if ($nextStatus === 'approved') {
                    DB::table('riders')->where('rider_id', $app->rider_id)->update([
                        'rider_status' => 'approved',
                        'approved_at' => $now,
                        'updated_at' => $now,
                    ]);
                } elseif ($nextStatus === 'rejected') {
                    DB::table('riders')->where('rider_id', $app->rider_id)->update([
                        'rider_status' => 'rejected',
                        'updated_at' => $now,
                    ]);
                }
            }

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: "{$type}_application_{$nextStatus}",
                entityType: $table,
                entityId: $applicationId,
                oldValues: ['application_status' => $app->application_status],
                newValues: ['application_status' => $nextStatus],
                reason: $cleanNote,
                request: $request,
            );

            $this->notifyApplicantForDecision($type, $table, $applicationId, $app, $nextStatus, $cleanNote);
        });

        return $this->getApplicationDetail($type, $applicationId);
    }

    private function materializeApprovedApplicationBranches(
        int $applicationId,
        int $rootRestaurantId,
        string $referenceNumber,
        ?string $cleanNote,
        User $admin,
        Request $request,
        mixed $now,
    ): void {
        $appBranches = DB::table('restaurant_application_branches')
            ->where('restaurant_application_id', $applicationId)
            ->orderBy('sort_order')
            ->orderBy('application_branch_id')
            ->get();

        if ($appBranches->isEmpty()) {
            return;
        }

        $root = DB::table('restaurants')->where('restaurant_id', $rootRestaurantId)->first();
        abort_unless($root !== null, 404, 'Root restaurant not found for branch materialization.');

        $branchService = app(RestaurantBranchService::class);
        $brandId = (int) ($root->brand_restaurant_id ?: $root->restaurant_id);

        foreach ($appBranches as $appBranch) {
            $contactPhone = $appBranch->contact_phone !== null && trim((string) $appBranch->contact_phone) !== ''
                ? trim((string) $appBranch->contact_phone)
                : $root->contact_phone;

            $childRestaurantId = $branchService->createChildBranch($rootRestaurantId, [
                'restaurant_name' => $root->restaurant_name,
                'registered_name' => $root->registered_name,
                'branch_name' => $appBranch->branch_name,
                'business_type' => $root->business_type,
                'ownership_structure' => $root->ownership_structure,
                'description' => $root->description,
                'contact_phone' => $contactPhone,
                'business_email' => $root->business_email,
                'address_id' => (int) $appBranch->address_id,
                'logo_image' => $root->logo_image,
                'cover_image' => $root->cover_image,
                'delivery_radius' => $root->delivery_radius,
                'offers_delivery' => (int) $root->offers_delivery,
                'offers_pickup' => (int) $root->offers_pickup,
                'offers_dine_in' => (int) $root->offers_dine_in,
                'accepts_reservations' => (int) $root->accepts_reservations,
                'accepting_orders' => (int) $root->accepting_orders,
                'accepting_reservations' => (int) $root->accepting_reservations,
                'inventory_deduction_mode' => $root->inventory_deduction_mode,
                'reservation_min_notice_hours' => $root->reservation_min_notice_hours,
                'reservation_max_party_size' => $root->reservation_max_party_size,
                'reservation_notes' => $root->reservation_notes,
                'restaurant_status' => 'active',
                'is_published' => 0,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $branchService->copyCategoriesAndHoursFromRoot($rootRestaurantId, $childRestaurantId, $now);
            $branchService->cloneMenuAsUnpublishedApproved($rootRestaurantId, $childRestaurantId, $now);

            DB::table('restaurant_application_branches')
                ->where('application_branch_id', $appBranch->application_branch_id)
                ->update([
                    'created_branch_restaurant_id' => $childRestaurantId,
                    'updated_at' => $now,
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: 'restaurant_branch_created',
                entityType: 'restaurants',
                entityId: $childRestaurantId,
                newValues: [
                    'restaurant_id' => $childRestaurantId,
                    'parent_restaurant_id' => $rootRestaurantId,
                    'brand_restaurant_id' => $brandId,
                    'branch_name' => $appBranch->branch_name,
                    'restaurant_application_id' => $applicationId,
                    'restaurant_status' => 'active',
                    'is_published' => false,
                ],
                reason: $cleanNote ?? "Branch created on approval of application {$referenceNumber}",
                request: $request,
            );
        }
    }

    private function notifyApplicantForDecision(
        string $type,
        string $table,
        int $applicationId,
        object $app,
        string $nextStatus,
        ?string $note,
    ): void {
        $label = $type === 'rider' ? 'rider' : 'restaurant';
        $ref = (string) $app->reference_number;

        [$workspace, $notifType, $title, $body] = match ($nextStatus) {
            'under_review' => [
                'customer',
                "{$type}_application_under_review",
                ucfirst($label) . ' application under review',
                "Your {$label} application ({$ref}) is now under review.",
            ],
            'additional_documents_required' => [
                'customer',
                "{$type}_application_additional_documents_required",
                'Additional documents required',
                "Your {$label} application ({$ref}) requires additional documents: {$note}",
            ],
            'approved' => $type === 'restaurant'
                ? [
                    'restaurant',
                    'restaurant_application_approved',
                    'Restaurant application approved',
                    "Your restaurant application ({$ref}) is approved. Your workspace is ready — set up your menu and publish when you're ready to go live.",
                ]
                : [
                    'rider',
                    'rider_application_approved',
                    'Rider application approved',
                    "Your rider application ({$ref}) is approved. Awaiting admin activation before you can go online.",
                ],
            'rejected' => [
                'customer',
                "{$type}_application_rejected",
                ucfirst($label) . ' application rejected',
                "Your {$label} application ({$ref}) was rejected. Reason: {$note}",
            ],
            default => [null, null, null, null],
        };

        if ($workspace !== null && $notifType !== null) {
            $this->notificationService->notifyUser(
                userId: (int) $app->applicant_user_id,
                workspace: $workspace,
                type: $notifType,
                title: $title,
                body: $body,
                relatedEntityType: $table,
                relatedEntityId: $applicationId,
            );
        }
    }

    private function assertNotSelfReview(object $app, User $admin): void
    {
        if ((int) $app->applicant_user_id === (int) $admin->user_id) {
            abort(403, 'Forbidden: administrators cannot review or decide their own application.');
        }
    }

    private function assertValidTransition(string $currentStatus, string $nextStatus): void
    {
        $allowed = self::ALLOWED_TRANSITIONS[$currentStatus] ?? [];
        if (! in_array($nextStatus, $allowed, true)) {
            throw new ConflictHttpException(
                "Invalid application status transition from '{$currentStatus}' to '{$nextStatus}'."
            );
        }
    }
}
