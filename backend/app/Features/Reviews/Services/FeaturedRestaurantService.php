<?php

namespace App\Features\Reviews\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\FileStorageService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;

class FeaturedRestaurantService
{
    private const DAY_MAP = [
        'sunday' => Carbon::SUNDAY,
        'monday' => Carbon::MONDAY,
        'tuesday' => Carbon::TUESDAY,
        'wednesday' => Carbon::WEDNESDAY,
        'thursday' => Carbon::THURSDAY,
        'friday' => Carbon::FRIDAY,
        'saturday' => Carbon::SATURDAY,
    ];

    public function __construct(
        private readonly PlatformSettingsService $settingsService,
        private readonly ReviewAggregationService $aggregationService,
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
        private readonly FileStorageService $fileStorageService,
    ) {}

    /**
     * Return the currently active Featured Restaurant of the Week for public/customer display.
     *
     * @return array<string, mixed>|null
     */
    public function getCurrentActiveFeatured(): ?array
    {
        $today = now('Asia/Manila')->toDateString();

        $row = DB::table('featured_restaurant_weeks as fw')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'fw.restaurant_id')
            ->leftJoin('addresses as a', 'a.address_id', '=', 'r.address_id')
            ->leftJoin('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->leftJoin('cities as c', 'c.city_id', '=', 'b.city_id')
            ->where('fw.selection_status', 'active')
            ->where('r.restaurant_status', 'active')
            ->where('fw.feature_start_date', '<=', $today)
            ->where('fw.feature_end_date', '>=', $today)
            ->orderByDesc('fw.feature_start_date')
            ->select([
                'fw.*',
                'r.restaurant_name',
                'r.business_type',
                'r.cover_image',
                'r.logo_image',
                'b.barangay_name',
                'c.city_name',
            ])
            ->first();

        if (! $row) {
            return null;
        }

        return $this->formatFeaturedRow($row);
    }

    /**
     * Compute the weekly feature period and rolling evaluation window for a reference date.
     *
     * @return array{
     *   feature_start: Carbon,
     *   feature_end: Carbon,
     *   evaluation_start: Carbon,
     *   evaluation_end: Carbon,
     *   settings: array<string, int|float|bool|string>
     * }
     */
    public function computeWeeklyWindows(?Carbon $referenceDate = null): array
    {
        $settings = $this->settingsService->getReviewsAndFeaturedSettings();
        $ref = ($referenceDate ? $referenceDate->copy() : now('Asia/Manila'))->startOfDay();

        $weekStartName = strtolower((string) $settings['featured_restaurant.week_start_day']);
        $weekStartDow = self::DAY_MAP[$weekStartName] ?? Carbon::MONDAY;
        $featureDays = max(1, (int) $settings['featured_restaurant.feature_period_days']);
        $evalDays = max(1, (int) $settings['featured_restaurant.evaluation_period_days']);

        $featureStart = ($ref->dayOfWeek === $weekStartDow
            ? $ref->copy()
            : $ref->copy()->previous($weekStartDow)
        )->startOfDay();
        $featureEnd = $featureStart->copy()->addDays($featureDays - 1)->endOfDay();

        // Rolling evaluation window ends immediately before the feature week begins
        $evaluationEnd = $featureStart->copy()->subSecond();
        $evaluationStart = $featureStart->copy()->subDays($evalDays)->startOfDay();

        return [
            'feature_start' => $featureStart,
            'feature_end' => $featureEnd,
            'evaluation_start' => $evaluationStart,
            'evaluation_end' => $evaluationEnd,
            'settings' => $settings,
        ];
    }

    /**
     * Compute platform baseline (C) and deterministic Bayesian ranking candidates.
     *
     * @return array<string, mixed>
     */
    public function computeCandidates(?Carbon $referenceDate = null): array
    {
        $windows = $this->computeWeeklyWindows($referenceDate);
        $settings = $windows['settings'];
        $evalStart = $windows['evaluation_start'];
        $evalEnd = $windows['evaluation_end'];

        $m = max(1, (int) $settings['featured_restaurant.min_review_threshold']);
        $fallbackC = (float) $settings['featured_restaurant.fallback_baseline_rating'];
        $minPlatformReviews = max(1, (int) $settings['featured_restaurant.min_platform_reviews_for_baseline']);

        $evalStartDb = $this->toDbSessionDateTimeString($evalStart);
        $evalEndDb = $this->toDbSessionDateTimeString($evalEnd);

        // 1. Platform-wide baseline average C across eligible reviews in evaluation window
        $platformQuery = DB::table('reviews as rv')
            ->whereBetween('rv.created_at', [$evalStartDb, $evalEndDb]);
        $this->aggregationService->applyEligibilityFilter($platformQuery, 'rv');

        $platformAgg = $platformQuery
            ->selectRaw('COUNT(*) as total_reviews, AVG(rv.rating) as mean_rating')
            ->first();

        $platformCount = (int) ($platformAgg->total_reviews ?? 0);
        $c = $platformCount >= $minPlatformReviews && $platformAgg->mean_rating !== null
            ? round((float) $platformAgg->mean_rating, 4)
            : round($fallbackC, 4);

        // 2. Per-restaurant eligible aggregates in evaluation window (active restaurants only)
        $restQuery = DB::table('restaurants as r')
            ->leftJoin('reviews as rv', function ($join) use ($evalStartDb, $evalEndDb): void {
                $join->on('rv.restaurant_id', '=', 'r.restaurant_id')
                    ->whereBetween('rv.created_at', [$evalStartDb, $evalEndDb]);
            })
            ->where('r.restaurant_status', 'active')
            ->select([
                'r.restaurant_id',
                'r.restaurant_name',
                'r.business_type',
            ]);

        // Aggregate eligible reviews per restaurant using conditional expressions matching policy
        $flaggedCounts = (bool) $settings['reviews.flagged_counts_toward_rating'];
        $eligCond = $flaggedCounts
            ? "(rv.is_visible = 1 AND (rv.counts_toward_rating = 1 OR rv.moderation_status = 'flagged'))"
            : "(rv.is_visible = 1 AND rv.counts_toward_rating = 1 AND rv.moderation_status = 'published')";

        $rows = $restQuery
            ->selectRaw("
                SUM(CASE WHEN {$eligCond} THEN 1 ELSE 0 END) as eval_count,
                AVG(CASE WHEN {$eligCond} THEN rv.rating ELSE NULL END) as raw_avg,
                MAX(CASE WHEN {$eligCond} THEN rv.created_at ELSE NULL END) as last_review_at
            ")
            ->groupBy('r.restaurant_id', 'r.restaurant_name', 'r.business_type')
            ->get();

        $candidates = $rows
            ->filter(fn (object $r): bool => (int) $r->eval_count > 0 && $r->raw_avg !== null)
            ->map(function (object $r) use ($m, $c): array {
                $v = (int) $r->eval_count;
                $rawR = round((float) $r->raw_avg, 4);
                $score = round((($v / ($v + $m)) * $rawR) + (($m / ($v + $m)) * $c), 4);

                return [
                    'restaurant_id' => (int) $r->restaurant_id,
                    'restaurant_name' => $r->restaurant_name,
                    'cuisine' => $r->business_type,
                    'evaluation_review_count' => $v,
                    'raw_average_rating' => $rawR,
                    'platform_baseline_rating' => $c,
                    'min_review_threshold' => $m,
                    'bayesian_score' => $score,
                    'last_eligible_review_at' => $r->last_review_at,
                    'qualifies' => $v >= $m,
                ];
            })
            ->values()
            ->all();

        // Deterministic ranking & tie-breakers:
        // 1. Higher Bayesian score
        // 2. Higher eligible review count (v)
        // 3. Higher raw average rating (R)
        // 4. More recent eligible feedback
        // 5. Lower restaurant_id (deterministic fallback)
        usort($candidates, static function (array $a, array $b): int {
            if ($a['bayesian_score'] !== $b['bayesian_score']) {
                return $b['bayesian_score'] <=> $a['bayesian_score'];
            }
            if ($a['evaluation_review_count'] !== $b['evaluation_review_count']) {
                return $b['evaluation_review_count'] <=> $a['evaluation_review_count'];
            }
            if ($a['raw_average_rating'] !== $b['raw_average_rating']) {
                return $b['raw_average_rating'] <=> $a['raw_average_rating'];
            }
            $tsA = $a['last_eligible_review_at'] ? strtotime((string) $a['last_eligible_review_at']) : 0;
            $tsB = $b['last_eligible_review_at'] ? strtotime((string) $b['last_eligible_review_at']) : 0;
            if ($tsA !== $tsB) {
                return $tsB <=> $tsA;
            }

            return $a['restaurant_id'] <=> $b['restaurant_id'];
        });

        return [
            'feature_start_date' => $windows['feature_start']->toDateString(),
            'feature_end_date' => $windows['feature_end']->toDateString(),
            'evaluation_start_at' => $evalStart->toDateTimeString(),
            'evaluation_end_at' => $evalEnd->toDateTimeString(),
            'platform_baseline_rating' => $c,
            'platform_review_count' => $platformCount,
            'used_fallback_baseline' => $platformCount < $minPlatformReviews,
            'min_review_threshold' => $m,
            'candidates' => $candidates,
        ];
    }

    /**
     * Run automatic weekly selection safely & idempotently.
     *
     * @return array<string, mixed>
     */
    public function runAutomaticSelection(?Carbon $referenceDate = null): array
    {
        $windows = $this->computeWeeklyWindows($referenceDate);
        $settings = $windows['settings'];

        if (! $settings['featured_restaurant.auto_selection_enabled']) {
            return [
                'status' => 'skipped_disabled',
                'message' => 'Automatic featured restaurant selection is currently disabled in platform_settings.',
                'featured_week' => null,
            ];
        }

        $featureStartStr = $windows['feature_start']->toDateString();
        $featureEndStr = $windows['feature_end']->toDateString();

        // Compute candidates outside lock, then verify idempotency inside transaction
        $computed = $this->computeCandidates($referenceDate);
        $qualifying = array_values(array_filter(
            $computed['candidates'],
            static fn (array $c): bool => $c['qualifies'] === true,
        ));

        if ($qualifying === []) {
            return [
                'status' => 'no_qualifying_restaurant',
                'message' => 'No active restaurant met the minimum review threshold for this evaluation window.',
                'featured_week' => null,
            ];
        }

        $winner = $qualifying[0];

        return DB::transaction(function () use ($featureStartStr, $featureEndStr, $computed, $winner): array {
            $existingActive = DB::table('featured_restaurant_weeks')
                ->where('feature_start_date', $featureStartStr)
                ->where('selection_status', 'active')
                ->lockForUpdate()
                ->first();

            if ($existingActive) {
                return [
                    'status' => 'already_selected',
                    'message' => 'An active featured restaurant is already recorded for this week.',
                    'featured_week' => $this->findFormattedWeekById((int) $existingActive->featured_week_id),
                ];
            }

            $now = now();
            $weekId = (int) DB::table('featured_restaurant_weeks')->insertGetId([
                'restaurant_id' => $winner['restaurant_id'],
                'feature_start_date' => $featureStartStr,
                'feature_end_date' => $featureEndStr,
                'evaluation_start_at' => $computed['evaluation_start_at'],
                'evaluation_end_at' => $computed['evaluation_end_at'],
                'evaluation_review_count' => $winner['evaluation_review_count'],
                'raw_average_rating' => $winner['raw_average_rating'],
                'bayesian_score' => $winner['bayesian_score'],
                'platform_baseline_rating' => $winner['platform_baseline_rating'],
                'min_review_threshold' => $winner['min_review_threshold'],
                'last_eligible_review_at' => $winner['last_eligible_review_at'],
                'selection_method' => 'automatic',
                'selection_status' => 'active',
                'supersedes_featured_week_id' => null,
                'selected_at' => $now,
                'selected_by' => null,
                'override_reason' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $this->auditLogService->record(
                actorUserId: null,
                action: 'featured_restaurant.auto_selected',
                entityType: 'featured_restaurant_week',
                entityId: (string) $weekId,
                oldValues: null,
                newValues: [
                    'restaurant_id' => $winner['restaurant_id'],
                    'feature_start_date' => $featureStartStr,
                    'bayesian_score' => $winner['bayesian_score'],
                    'evaluation_review_count' => $winner['evaluation_review_count'],
                ],
                reason: 'Automatic weekly Bayesian featured restaurant selection.',
            );

            $this->notifyRestaurantOwners(
                restaurantId: $winner['restaurant_id'],
                type: 'featured_restaurant_selected',
                title: 'Featured Restaurant of the Week!',
                body: "{$winner['restaurant_name']} was selected as SALO's Featured Restaurant of the Week ({$featureStartStr} to {$featureEndStr}).",
                weekId: $weekId,
            );

            return [
                'status' => 'selected',
                'message' => 'Featured restaurant selected successfully.',
                'featured_week' => $this->findFormattedWeekById($weekId),
            ];
        });
    }

    /**
     * Admin override for a weekly featured restaurant selection, preserving history.
     *
     * @return array<string, mixed>
     */
    public function adminOverrideSelection(
        User $admin,
        int $restaurantId,
        string $reason,
        ?Carbon $referenceDate = null,
        ?Request $request = null,
    ): array {
        $cleanReason = trim($reason);
        if ($cleanReason === '') {
            throw new UnprocessableEntityHttpException('An override reason is required.');
        }

        $restaurant = DB::table('restaurants')->where('restaurant_id', $restaurantId)->first();
        if (! $restaurant) {
            throw new NotFoundHttpException('Restaurant not found.');
        }
        if ($restaurant->restaurant_status !== 'active') {
            throw new UnprocessableEntityHttpException('Only active restaurants can be selected as Featured Restaurant of the Week.');
        }

        $computed = $this->computeCandidates($referenceDate);
        $candidate = collect($computed['candidates'])->firstWhere('restaurant_id', $restaurantId);

        $featureStartStr = $computed['feature_start_date'];
        $featureEndStr = $computed['feature_end_date'];

        $weekId = DB::transaction(function () use (
            $admin,
            $restaurant,
            $restaurantId,
            $cleanReason,
            $computed,
            $candidate,
            $featureStartStr,
            $featureEndStr,
            $request,
        ): int {
            $previousActive = DB::table('featured_restaurant_weeks')
                ->where('feature_start_date', $featureStartStr)
                ->where('selection_status', 'active')
                ->lockForUpdate()
                ->first();

            $now = now();
            if ($previousActive) {
                DB::table('featured_restaurant_weeks')
                    ->where('featured_week_id', $previousActive->featured_week_id)
                    ->update([
                        'selection_status' => 'superseded',
                        'updated_at' => $now,
                    ]);
            }

            $newWeekId = (int) DB::table('featured_restaurant_weeks')->insertGetId([
                'restaurant_id' => $restaurantId,
                'feature_start_date' => $featureStartStr,
                'feature_end_date' => $featureEndStr,
                'evaluation_start_at' => $computed['evaluation_start_at'],
                'evaluation_end_at' => $computed['evaluation_end_at'],
                'evaluation_review_count' => $candidate['evaluation_review_count'] ?? 0,
                'raw_average_rating' => $candidate['raw_average_rating'] ?? 0.0,
                'bayesian_score' => $candidate['bayesian_score'] ?? $computed['platform_baseline_rating'],
                'platform_baseline_rating' => $computed['platform_baseline_rating'],
                'min_review_threshold' => $computed['min_review_threshold'],
                'last_eligible_review_at' => $candidate['last_eligible_review_at'] ?? null,
                'selection_method' => 'admin_override',
                'selection_status' => 'active',
                'supersedes_featured_week_id' => $previousActive?->featured_week_id,
                'selected_at' => $now,
                'selected_by' => $admin->user_id,
                'override_reason' => mb_substr($cleanReason, 0, 500),
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $this->auditLogService->record(
                actorUserId: (int) $admin->user_id,
                action: 'featured_restaurant.override',
                entityType: 'featured_restaurant_week',
                entityId: (string) $newWeekId,
                oldValues: $previousActive ? [
                    'featured_week_id' => (int) $previousActive->featured_week_id,
                    'restaurant_id' => (int) $previousActive->restaurant_id,
                    'selection_status' => 'active',
                ] : null,
                newValues: [
                    'featured_week_id' => $newWeekId,
                    'restaurant_id' => $restaurantId,
                    'selection_method' => 'admin_override',
                ],
                reason: $cleanReason,
                request: $request,
            );

            $this->notifyRestaurantOwners(
                restaurantId: $restaurantId,
                type: 'featured_restaurant_override',
                title: 'Featured Restaurant of the Week!',
                body: "{$restaurant->restaurant_name} has been featured on SALO for {$featureStartStr} to {$featureEndStr}.",
                weekId: $newWeekId,
            );

            return $newWeekId;
        });

        return $this->findFormattedWeekById($weekId);
    }

    /**
     * Admin: list historical featured restaurant weeks + recent audit logs.
     *
     * @return array<string, mixed>
     */
    public function getAdminOverview(?Carbon $referenceDate = null): array
    {
        $ranking = $this->computeCandidates($referenceDate);

        $historyRows = DB::table('featured_restaurant_weeks as fw')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'fw.restaurant_id')
            ->leftJoin('users as u', 'u.user_id', '=', 'fw.selected_by')
            ->orderByDesc('fw.feature_start_date')
            ->orderByDesc('fw.featured_week_id')
            ->limit(30)
            ->select([
                'fw.*',
                'r.restaurant_name',
                'r.business_type',
                'r.cover_image',
                'r.logo_image',
                DB::raw("CONCAT(u.first_name, ' ', u.last_name) as selected_by_name"),
            ])
            ->get();

        $auditRows = DB::table('audit_logs as al')
            ->leftJoin('users as u', 'u.user_id', '=', 'al.actor_user_id')
            ->whereIn('al.entity_type', ['restaurant_review', 'rider_review', 'featured_restaurant_week', 'platform_settings'])
            ->orderByDesc('al.created_at')
            ->orderByDesc('al.log_id')
            ->limit(25)
            ->select([
                'al.log_id',
                'al.action',
                'al.entity_type',
                'al.entity_id',
                'al.reason',
                'al.created_at',
                DB::raw("COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'System') as actor_name"),
            ])
            ->get();

        return [
            'active_week' => $this->getCurrentActiveFeatured(),
            'ranking' => $ranking,
            'history' => $historyRows->map(fn (object $r): array => $this->formatFeaturedRow($r))->values()->all(),
            'audit_logs' => $auditRows->map(fn (object $l): array => [
                'log_id' => (int) $l->log_id,
                'actor_name' => $l->actor_name,
                'action' => $l->action,
                'entity_type' => $l->entity_type,
                'entity_id' => $l->entity_id,
                'reason' => $l->reason,
                'created_at' => $l->created_at,
            ])->values()->all(),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function findFormattedWeekById(int $weekId): ?array
    {
        $row = DB::table('featured_restaurant_weeks as fw')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'fw.restaurant_id')
            ->leftJoin('addresses as a', 'a.address_id', '=', 'r.address_id')
            ->leftJoin('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->leftJoin('cities as c', 'c.city_id', '=', 'b.city_id')
            ->where('fw.featured_week_id', $weekId)
            ->select([
                'fw.*',
                'r.restaurant_name',
                'r.business_type',
                'r.cover_image',
                'r.logo_image',
                'b.barangay_name',
                'c.city_name',
            ])
            ->first();

        return $row ? $this->formatFeaturedRow($row) : null;
    }

    /**
     * @return array<string, mixed>
     */
    private function formatFeaturedRow(object $row): array
    {
        $addressParts = array_filter([
            $row->barangay_name ?? null,
            $row->city_name ?? null,
        ]);

        return [
            'featured_week_id' => (int) $row->featured_week_id,
            'restaurant_id' => (int) $row->restaurant_id,
            'restaurant_name' => $row->restaurant_name,
            'cuisine' => $row->business_type ?? 'Restaurant',
            'address' => implode(', ', $addressParts),
            'cover_photo' => $row->cover_image ? $this->fileStorageService->publicImageUrl($row->cover_image) : null,
            'feature_start_date' => $row->feature_start_date,
            'feature_end_date' => $row->feature_end_date,
            'evaluation_start_at' => $row->evaluation_start_at,
            'evaluation_end_at' => $row->evaluation_end_at,
            'evaluation_review_count' => (int) $row->evaluation_review_count,
            'raw_average_rating' => (float) $row->raw_average_rating,
            'bayesian_score' => (float) $row->bayesian_score,
            'platform_baseline_rating' => (float) $row->platform_baseline_rating,
            'min_review_threshold' => (int) $row->min_review_threshold,
            'last_eligible_review_at' => $row->last_eligible_review_at,
            'selection_method' => $row->selection_method,
            'selection_status' => $row->selection_status,
            'supersedes_featured_week_id' => $row->supersedes_featured_week_id ? (int) $row->supersedes_featured_week_id : null,
            'selected_at' => $row->selected_at,
            'selected_by' => $row->selected_by ? (int) $row->selected_by : null,
            'selected_by_name' => $row->selected_by_name ?? null,
            'override_reason' => $row->override_reason,
        ];
    }

    private function notifyRestaurantOwners(
        int $restaurantId,
        string $type,
        string $title,
        string $body,
        int $weekId,
    ): void {
        $ownerIds = DB::table('restaurant_owners')
            ->where('restaurant_id', $restaurantId)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $this->notificationService->notifyUsers(
            userIds: $ownerIds,
            workspace: 'restaurant',
            type: $type,
            title: $title,
            body: $body,
            relatedEntityType: 'featured_restaurant_week',
            relatedEntityId: $weekId,
        );
    }

    /**
     * Convert an Asia/Manila Carbon boundary into the active MySQL session timezone
     * so TIMESTAMP comparisons against reviews.created_at are accurate regardless of
     * whether the DB session is configured as SYSTEM (+08:00), UTC (+00:00), or another offset.
     */
    private function toDbSessionDateTimeString(Carbon $manilaTime): string
    {
        $row = DB::selectOne('SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) AS offset_seconds');
        $offsetSeconds = (int) ($row?->offset_seconds ?? 0);

        return $manilaTime->copy()->utc()->addSeconds($offsetSeconds)->toDateTimeString();
    }
}
