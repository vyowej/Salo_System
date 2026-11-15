<?php

namespace App\Features\Admin\Services;

use App\Features\Restaurants\Services\RestaurantApplicationService;
use App\Features\Riders\Services\RiderApplicationService;
use App\Models\User;
use App\Support\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AdminApplicationService
{
    public function __construct(
        private readonly RestaurantApplicationService $restaurantApplicationService,
        private readonly RiderApplicationService $riderApplicationService,
        private readonly AuditLogService $auditLogService,
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

        if ($type === 'rider') {
            $query = DB::table('rider_applications as ra')
                ->join('riders as r', 'r.rider_id', '=', 'ra.rider_id')
                ->join('cities as c', 'c.city_id', '=', 'r.base_city_id')
                ->join('users as u', 'u.user_id', '=', 'ra.applicant_user_id')
                ->select([
                    'ra.rider_application_id as id',
                    'ra.reference_number',
                    'ra.application_status',
                    'ra.legal_first_name',
                    'ra.legal_last_name',
                    'ra.contact_email',
                    'ra.contact_phone',
                    'ra.submitted_at',
                    'ra.reviewed_at',
                    'ra.decided_at',
                    'ra.reviewer_note',
                    'r.rider_id',
                    'r.vehicle_type',
                    'r.rider_status',
                    'c.city_name as zone',
                    'u.username',
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

            if ($status !== '' && $status !== 'all') {
                $query->where('ra.application_status', $status);
            }

            if ($dateRange === '7d') {
                $query->where('ra.submitted_at', '>=', now()->subDays(7));
            } elseif ($dateRange === '30d') {
                $query->where('ra.submitted_at', '>=', now()->subDays(30));
            }

            $paginator = $query->orderBy('ra.submitted_at', $sortDir)->paginate($perPage);
            $items = collect($paginator->items())->map(function ($row) {
                $docCounts = DB::table('application_documents')
                    ->where('rider_application_id', $row->id)
                    ->selectRaw("COUNT(*) as total, SUM(CASE WHEN document_status = 'verified' THEN 1 ELSE 0 END) as verified")
                    ->first();

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
            })->all();
        } else {
            $query = DB::table('restaurant_applications as ra')
                ->join('restaurants as rest', 'rest.restaurant_id', '=', 'ra.restaurant_id')
                ->join('addresses as addr', 'addr.address_id', '=', 'rest.address_id')
                ->join('barangays as brgy', 'brgy.barangay_id', '=', 'addr.barangay_id')
                ->join('cities as c', 'c.city_id', '=', 'brgy.city_id')
                ->select([
                    'ra.restaurant_application_id as id',
                    'ra.reference_number',
                    'ra.application_status',
                    'ra.legal_first_name',
                    'ra.legal_last_name',
                    'ra.contact_email',
                    'ra.contact_phone',
                    'ra.submitted_at',
                    'ra.reviewed_at',
                    'ra.decided_at',
                    'ra.reviewer_note',
                    'rest.restaurant_id',
                    'rest.restaurant_name',
                    'rest.business_type',
                    'rest.ownership_structure',
                    'rest.restaurant_status',
                    'rest.logo_image',
                    'rest.cover_image',
                    'c.city_name as zone',
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

            if ($status !== '' && $status !== 'all') {
                $query->where('ra.application_status', $status);
            }

            if ($dateRange === '7d') {
                $query->where('ra.submitted_at', '>=', now()->subDays(7));
            } elseif ($dateRange === '30d') {
                $query->where('ra.submitted_at', '>=', now()->subDays(30));
            }

            $paginator = $query->orderBy('ra.submitted_at', $sortDir)->paginate($perPage);
            $items = collect($paginator->items())->map(function ($row) {
                $docCounts = DB::table('application_documents')
                    ->where('restaurant_application_id', $row->id)
                    ->selectRaw("COUNT(*) as total, SUM(CASE WHEN document_status = 'verified' THEN 1 ELSE 0 END) as verified")
                    ->first();

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
                    'logo_image' => $row->logo_image,
                    'cover_image' => $row->cover_image,
                    'application_status' => $row->application_status,
                    'restaurant_status' => $row->restaurant_status,
                    'submitted_at' => $row->submitted_at,
                    'reviewed_at' => $row->reviewed_at,
                    'decided_at' => $row->decided_at,
                    'reviewer_note' => $row->reviewer_note,
                    'verified_docs_count' => (int) ($docCounts->verified ?? 0),
                    'total_docs_count' => (int) ($docCounts->total ?? 0),
                ];
            })->all();
        }

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
        $doc = DB::table('application_documents')
            ->where('document_id', $documentId)
            ->where($fkColumn, $applicationId)
            ->first();

        abort_unless($doc !== null, 404, 'Application document not found.');

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
            'needs_correction' => 'needs_correction',
            'approve' => 'approved',
            'reject' => 'rejected',
        ];

        $nextStatus = $statusMap[$decision];
        $cleanNote = $note !== null ? trim($note) : null;

        if (in_array($nextStatus, ['needs_correction', 'rejected'], true) && ($cleanNote === null || $cleanNote === '')) {
            throw ValidationException::withMessages([
                'note' => ['A reviewer note / reason is required when requesting correction or rejecting an application.'],
            ]);
        }

        $table = $type === 'rider' ? 'rider_applications' : 'restaurant_applications';
        $pk = $type === 'rider' ? 'rider_application_id' : 'restaurant_application_id';

        $app = DB::table($table)->where($pk, $applicationId)->first();
        abort_unless($app !== null, 404, 'Application not found.');

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
                } elseif ($nextStatus === 'rejected') {
                    DB::table('restaurants')->where('restaurant_id', $app->restaurant_id)->update([
                        'restaurant_status' => 'rejected',
                        'updated_at' => $now,
                    ]);
                }
            } else {
                if ($nextStatus === 'approved') {
                    DB::table('riders')->where('rider_id', $app->rider_id)->update([
                        'rider_status' => 'active',
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
        });

        return $this->getApplicationDetail($type, $applicationId);
    }
}
