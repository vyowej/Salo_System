<?php

namespace App\Features\Admin\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Features\Restaurants\Services\BranchPermitService;
use App\Models\User;
use App\Support\FileStorageService;
use App\Support\RestaurantBranchService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminBranchPermitService
{
    public function __construct(
        private readonly BranchPermitService $branchPermitService,
        private readonly FileStorageService $fileStorageService,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * Paginated admin branch permits queue with status, search, and submitted_date filters.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listPermits(array $filters): array
    {
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 15)));
        $status = trim((string) ($filters['status'] ?? ''));
        $search = trim((string) ($filters['search'] ?? ''));
        $submittedDate = trim((string) ($filters['submitted_date'] ?? ''));

        $query = DB::table('branch_permits as bp')
            ->leftJoin('restaurants as r', 'r.restaurant_id', '=', 'bp.restaurant_id')
            ->leftJoin('restaurant_application_branches as rab', 'rab.application_branch_id', '=', 'bp.application_branch_id')
            ->leftJoin('restaurant_applications as ra', 'ra.restaurant_application_id', '=', 'rab.restaurant_application_id')
            ->leftJoin('restaurants as app_rest', 'app_rest.restaurant_id', '=', 'ra.restaurant_id')
            ->leftJoin('users as rev', 'rev.user_id', '=', 'bp.reviewed_by')
            ->leftJoin('users as app_u', 'app_u.user_id', '=', 'ra.applicant_user_id')
            ->select([
                'bp.permit_id',
                'bp.restaurant_id',
                'bp.application_branch_id',
                'bp.is_required_locally',
                'bp.exemption_reason',
                'bp.file_path',
                'bp.permit_status',
                'bp.review_note',
                'bp.uploaded_at',
                'bp.reviewed_by',
                'bp.reviewed_at',
                'bp.created_at',
                'r.restaurant_name as rest_brand_name',
                'r.branch_name as rest_branch_name',
                'app_rest.restaurant_name as app_brand_name',
                'rab.branch_name as app_branch_name',
                'rev.first_name as rev_first_name',
                'rev.last_name as rev_last_name',
                'app_u.first_name as app_first_name',
                'app_u.last_name as app_last_name',
            ]);

        if ($status !== '' && $status !== 'all') {
            $query->where('bp.permit_status', $status);
        }

        if ($submittedDate !== '') {
            $query->whereDate('bp.uploaded_at', $submittedDate);
        }

        if ($search !== '') {
            $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $search);
            $like = "%{$escaped}%";
            $query->where(function ($sub) use ($like): void {
                $sub->where('r.restaurant_name', 'like', $like)
                    ->orWhere('r.branch_name', 'like', $like)
                    ->orWhere('rab.branch_name', 'like', $like)
                    ->orWhere('app_rest.restaurant_name', 'like', $like)
                    ->orWhere('app_u.first_name', 'like', $like)
                    ->orWhere('app_u.last_name', 'like', $like)
                    ->orWhere('app_u.email', 'like', $like);
            });
        }

        $paginator = $query
            ->orderByRaw("CASE bp.permit_status WHEN 'pending_review' THEN 0 WHEN 'under_review' THEN 1 WHEN 'additional_info_required' THEN 2 WHEN 'pending_submission' THEN 3 ELSE 4 END ASC")
            ->orderByDesc('bp.uploaded_at')
            ->orderByDesc('bp.permit_id')
            ->paginate($perPage);

        $rows = $paginator->items();
        $restaurantIds = collect($rows)
            ->pluck('restaurant_id')
            ->filter()
            ->map(static fn ($id): int => (int) $id)
            ->unique()
            ->values()
            ->all();

        $ownersByRestaurant = $restaurantIds === []
            ? collect()
            : DB::table('restaurant_owners as ro')
                ->join('users as u', 'u.user_id', '=', 'ro.user_id')
                ->whereIn('ro.restaurant_id', $restaurantIds)
                ->orderBy('ro.joined_at')
                ->orderBy('ro.user_id')
                ->select(['ro.restaurant_id', 'u.first_name', 'u.last_name'])
                ->get()
                ->groupBy('restaurant_id')
                ->map(static function ($group): ?string {
                    $first = $group->first();

                    return $first ? trim(($first->first_name ?? '').' '.($first->last_name ?? '')) : null;
                });

        $items = array_map(function (object $row) use ($ownersByRestaurant): array {
            return $this->formatPermitRow($row, $ownersByRestaurant->get((int) ($row->restaurant_id ?? 0)));
        }, $rows);

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
    public function getPermitDetail(int $permitId): array
    {
        $row = DB::table('branch_permits as bp')
            ->leftJoin('restaurants as r', 'r.restaurant_id', '=', 'bp.restaurant_id')
            ->leftJoin('restaurant_application_branches as rab', 'rab.application_branch_id', '=', 'bp.application_branch_id')
            ->leftJoin('restaurant_applications as ra', 'ra.restaurant_application_id', '=', 'rab.restaurant_application_id')
            ->leftJoin('restaurants as app_rest', 'app_rest.restaurant_id', '=', 'ra.restaurant_id')
            ->leftJoin('users as rev', 'rev.user_id', '=', 'bp.reviewed_by')
            ->leftJoin('users as app_u', 'app_u.user_id', '=', 'ra.applicant_user_id')
            ->where('bp.permit_id', $permitId)
            ->select([
                'bp.permit_id',
                'bp.restaurant_id',
                'bp.application_branch_id',
                'bp.is_required_locally',
                'bp.exemption_reason',
                'bp.file_path',
                'bp.original_filename',
                'bp.mime_type',
                'bp.file_size_bytes',
                'bp.permit_status',
                'bp.review_note',
                'bp.uploaded_at',
                'bp.reviewed_by',
                'bp.reviewed_at',
                'bp.created_at',
                'r.restaurant_name as rest_brand_name',
                'r.branch_name as rest_branch_name',
                'app_rest.restaurant_name as app_brand_name',
                'rab.branch_name as app_branch_name',
                'rev.first_name as rev_first_name',
                'rev.last_name as rev_last_name',
                'app_u.first_name as app_first_name',
                'app_u.last_name as app_last_name',
            ])
            ->first();

        abort_unless($row !== null, 404, 'Branch permit record not found.');

        $ownerName = null;
        if ($row->restaurant_id !== null) {
            $owner = DB::table('restaurant_owners as ro')
                ->join('users as u', 'u.user_id', '=', 'ro.user_id')
                ->where('ro.restaurant_id', (int) $row->restaurant_id)
                ->orderBy('ro.joined_at')
                ->orderBy('ro.user_id')
                ->first(['u.first_name', 'u.last_name']);
            $ownerName = $owner ? trim(($owner->first_name ?? '').' '.($owner->last_name ?? '')) : null;
        }

        $detail = $this->formatPermitRow($row, $ownerName);
        $hasFile = $row->file_path !== null && trim((string) $row->file_path) !== '';
        $detail['review_note'] = $row->review_note;
        $detail['original_filename'] = $row->original_filename;
        $detail['mime_type'] = $row->mime_type;
        $detail['file_size_bytes'] = $row->file_size_bytes !== null ? (int) $row->file_size_bytes : null;
        $detail['has_file'] = $hasFile;
        $detail['file_url'] = $hasFile ? url("/api/admin/branch-permits/{$permitId}/file") : null;

        return $detail;
    }

    public function streamPermitFile(int $permitId): StreamedResponse
    {
        $permit = DB::table('branch_permits')
            ->where('permit_id', $permitId)
            ->first(['file_path', 'original_filename', 'mime_type']);

        abort_unless($permit !== null && $permit->file_path !== null && trim((string) $permit->file_path) !== '', 404, 'Branch permit file not found.');

        return $this->fileStorageService->streamPrivateFile(
            path: (string) $permit->file_path,
            downloadName: (string) ($permit->original_filename ?: 'branch-permit.pdf'),
            mimeType: (string) ($permit->mime_type ?: 'application/pdf'),
        );
    }

    /**
     * Execute an admin permit review action: start_review, approve, reject, request_info, waive, reopen.
     *
     * @return array<string, mixed>
     */
    public function performAction(
        int $permitId,
        string $action,
        User $admin,
        ?string $note,
        Request $request,
    ): array {
        $permit = DB::table('branch_permits')->where('permit_id', $permitId)->first();
        abort_unless($permit !== null, 404, 'Branch permit record not found.');

        $this->assertNotSelfReview($permit, $admin);

        $targetStatus = match ($action) {
            'start_review', 'reopen' => BranchPermitService::STATUS_UNDER_REVIEW,
            'approve' => BranchPermitService::STATUS_APPROVED,
            'reject' => BranchPermitService::STATUS_REJECTED,
            'request_info' => BranchPermitService::STATUS_ADDITIONAL_INFO_REQUIRED,
            'waive' => BranchPermitService::STATUS_WAIVED,
            default => abort(404, 'Unsupported branch permit review action.'),
        };

        $updated = $this->branchPermitService->transitionStatus(
            permitId: $permitId,
            targetStatus: $targetStatus,
            actor: $admin,
            note: $note,
            request: $request,
            action: $action,
        );

        if ($action !== 'start_review') {
            $this->dispatchOutcomeNotification($updated, $action);
        }

        return $this->getPermitDetail($permitId);
    }

    private function assertNotSelfReview(object $permit, User $admin): void
    {
        $adminUserId = (int) $admin->user_id;

        if ($permit->restaurant_id !== null) {
            $restaurant = DB::table('restaurants')
                ->where('restaurant_id', (int) $permit->restaurant_id)
                ->first(['restaurant_id', 'brand_restaurant_id']);

            if ($restaurant) {
                $brandId = (int) ($restaurant->brand_restaurant_id ?: $restaurant->restaurant_id);
                $brandRestaurantIds = DB::table('restaurants')
                    ->where('brand_restaurant_id', $brandId)
                    ->orWhere('restaurant_id', $brandId)
                    ->pluck('restaurant_id')
                    ->map(static fn ($id): int => (int) $id)
                    ->all();

                if ($brandRestaurantIds !== []) {
                    $isOwner = DB::table('restaurant_owners')
                        ->whereIn('restaurant_id', $brandRestaurantIds)
                        ->where('user_id', $adminUserId)
                        ->exists();
                    $isStaff = DB::table('restaurant_staff')
                        ->whereIn('restaurant_id', $brandRestaurantIds)
                        ->where('user_id', $adminUserId)
                        ->exists();
                    $isApplicant = DB::table('restaurant_applications')
                        ->whereIn('restaurant_id', $brandRestaurantIds)
                        ->where('applicant_user_id', $adminUserId)
                        ->exists();

                    if ($isOwner || $isStaff || $isApplicant) {
                        abort(403, 'Forbidden: administrators cannot review a branch permit for their own business.');
                    }
                }
            }
        }

        if ($permit->application_branch_id !== null) {
            $app = DB::table('restaurant_application_branches as rab')
                ->join('restaurant_applications as ra', 'ra.restaurant_application_id', '=', 'rab.restaurant_application_id')
                ->where('rab.application_branch_id', (int) $permit->application_branch_id)
                ->first(['ra.applicant_user_id', 'ra.restaurant_id']);

            if ($app) {
                if ((int) $app->applicant_user_id === $adminUserId) {
                    abort(403, 'Forbidden: administrators cannot review a branch permit for their own application.');
                }

                if ($app->restaurant_id !== null) {
                    $isAppOwner = DB::table('restaurant_owners')
                        ->where('restaurant_id', (int) $app->restaurant_id)
                        ->where('user_id', $adminUserId)
                        ->exists();
                    $isAppStaff = DB::table('restaurant_staff')
                        ->where('restaurant_id', (int) $app->restaurant_id)
                        ->where('user_id', $adminUserId)
                        ->exists();

                    if ($isAppOwner || $isAppStaff) {
                        abort(403, 'Forbidden: administrators cannot review a branch permit for their own business.');
                    }
                }
            }
        }
    }

    private function dispatchOutcomeNotification(object $permit, string $action): void
    {
        $typeMap = [
            'approve' => 'branch_permit_approved',
            'reject' => 'branch_permit_rejected',
            'request_info' => 'branch_permit_info_requested',
            'waive' => 'branch_permit_waived',
            'reopen' => 'branch_permit_reopened',
        ];
        $titleMap = [
            'approve' => 'Branch permit approved',
            'reject' => 'Branch permit rejected',
            'request_info' => 'Branch permit needs more information',
            'waive' => 'Branch permit requirement waived',
            'reopen' => 'Branch permit reopened for review',
        ];

        $type = $typeMap[$action] ?? null;
        $title = $titleMap[$action] ?? null;
        if ($type === null || $title === null) {
            return;
        }

        $displayName = $this->resolveBranchDisplayName($permit);
        $note = $permit->review_note ? trim((string) $permit->review_note) : null;

        $body = match ($action) {
            'approve' => "The Mayor's / Business Permit for {$displayName} has been approved. You may now publish this branch once your menu and setup are ready.",
            'waive' => "The local permit exemption for {$displayName} has been waived. Note: {$note}",
            'reject' => "The Mayor's / Business Permit for {$displayName} was rejected. Reason: {$note}",
            'request_info' => "Additional information is required for {$displayName}'s Mayor's / Business Permit. Note: {$note}",
            'reopen' => "The Mayor's / Business Permit for {$displayName} has been reopened for review and the branch was unpublished. Note: {$note}",
            default => "Branch permit status updated for {$displayName}.",
        };

        // Determine recipient: applicant (customer workspace) if application is not yet approved; otherwise business owners (restaurant workspace).
        $app = null;
        if ($permit->application_branch_id !== null) {
            $app = DB::table('restaurant_application_branches as rab')
                ->join('restaurant_applications as ra', 'ra.restaurant_application_id', '=', 'rab.restaurant_application_id')
                ->where('rab.application_branch_id', (int) $permit->application_branch_id)
                ->first(['ra.applicant_user_id', 'ra.application_status']);
        }

        if ($permit->restaurant_id === null || ($app !== null && $app->application_status !== 'approved')) {
            if ($app !== null && (int) $app->applicant_user_id > 0) {
                $this->notificationService->notifyUser(
                    userId: (int) $app->applicant_user_id,
                    workspace: 'customer',
                    type: $type,
                    title: $title,
                    body: $body,
                    relatedEntityType: 'branch_permits',
                    relatedEntityId: (int) $permit->permit_id,
                );
            }

            return;
        }

        $ownerIds = $this->notificationService->resolveRestaurantOwnerUserIds((int) $permit->restaurant_id);
        if ($ownerIds !== []) {
            $this->notificationService->notifyUsers(
                userIds: $ownerIds,
                workspace: 'restaurant',
                type: $type,
                title: $title,
                body: $body,
                relatedEntityType: 'branch_permits',
                relatedEntityId: (int) $permit->permit_id,
            );
        }
    }

    private function resolveBranchDisplayName(object $permit): string
    {
        if ($permit->restaurant_id !== null) {
            $r = DB::table('restaurants')
                ->where('restaurant_id', (int) $permit->restaurant_id)
                ->first(['restaurant_name', 'branch_name']);
            if ($r) {
                return RestaurantBranchService::formatDisplayName((string) $r->restaurant_name, $r->branch_name);
            }
        }

        if ($permit->application_branch_id !== null) {
            $ab = DB::table('restaurant_application_branches as rab')
                ->join('restaurant_applications as ra', 'ra.restaurant_application_id', '=', 'rab.restaurant_application_id')
                ->join('restaurants as r', 'r.restaurant_id', '=', 'ra.restaurant_id')
                ->where('rab.application_branch_id', (int) $permit->application_branch_id)
                ->first(['r.restaurant_name', 'rab.branch_name']);
            if ($ab) {
                return RestaurantBranchService::formatDisplayName((string) $ab->restaurant_name, $ab->branch_name);
            }
        }

        return "Branch #{$permit->permit_id}";
    }

    /**
     * @return array<string, mixed>
     */
    private function formatPermitRow(object $row, ?string $ownerName): array
    {
        $brandName = $row->rest_brand_name ?? $row->app_brand_name ?? '';
        $branchName = $row->rest_branch_name ?? $row->app_branch_name ?? null;
        $applicantName = trim(($row->app_first_name ?? '').' '.($row->app_last_name ?? ''));
        $reviewerName = trim(($row->rev_first_name ?? '').' '.($row->rev_last_name ?? ''));

        return [
            'permit_id' => (int) $row->permit_id,
            'restaurant_id' => $row->restaurant_id !== null ? (int) $row->restaurant_id : null,
            'application_branch_id' => $row->application_branch_id !== null ? (int) $row->application_branch_id : null,
            'brand_name' => $brandName,
            'branch_name' => $branchName,
            'display_name' => RestaurantBranchService::formatDisplayName((string) $brandName, $branchName),
            'owner_name' => ($ownerName !== null && $ownerName !== '') ? $ownerName : ($applicantName !== '' ? $applicantName : null),
            'permit_status' => (string) $row->permit_status,
            'is_required_locally' => (bool) $row->is_required_locally,
            'exemption_reason' => $row->exemption_reason,
            'uploaded_at' => OrderTimestampFormatter::toManilaIso($row->uploaded_at),
            'reviewed_by' => $row->reviewed_by !== null ? (int) $row->reviewed_by : null,
            'reviewed_by_name' => $reviewerName !== '' ? $reviewerName : null,
            'reviewed_at' => OrderTimestampFormatter::toManilaIso($row->reviewed_at),
        ];
    }
}
