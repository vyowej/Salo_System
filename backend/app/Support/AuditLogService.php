<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class AuditLogService
{
    /**
     * @param  array<string, mixed>|null  $oldValues
     * @param  array<string, mixed>|null  $newValues
     */
    public function record(
        ?int $actorUserId,
        string $action,
        string $entityType,
        string|int $entityId,
        ?array $oldValues = null,
        ?array $newValues = null,
        ?string $reason = null,
        ?Request $request = null,
    ): void {
        DB::table('audit_logs')->insert([
            'actor_user_id' => $actorUserId,
            'action' => mb_substr($action, 0, 100),
            'entity_type' => mb_substr($entityType, 0, 50),
            'entity_id' => mb_substr((string) $entityId, 0, 100),
            'old_values' => $oldValues !== null ? json_encode($oldValues) : null,
            'new_values' => $newValues !== null ? json_encode($newValues) : null,
            'reason' => $reason !== null ? mb_substr(trim($reason), 0, 255) : null,
            'ip_address' => $request?->ip(),
            'created_at' => now(),
        ]);
    }

    /**
     * Record a private-file view or denied attempt, deduped per user + document + outcome within 10 minutes.
     * Uses the document row ID (never the Drive fileId).
     */
    public function recordPrivateFileAccess(
        ?int $actorUserId,
        string $entityType,
        string|int $entityId,
        bool $allowed,
        ?Request $request = null,
    ): void {
        $action = $allowed ? 'private_file_viewed' : 'private_file_access_denied';
        $actorKey = $actorUserId ?? 'guest';
        $dedupeKey = "salo:audit:private_file:{$action}:{$actorKey}:{$entityType}:{$entityId}";

        if (! Cache::add($dedupeKey, 1, now()->addMinutes(10))) {
            return;
        }

        $this->record(
            actorUserId: $actorUserId,
            action: $action,
            entityType: $entityType,
            entityId: $entityId,
            newValues: ['outcome' => $allowed ? 'allowed' : 'denied'],
            request: $request,
        );
    }
}
