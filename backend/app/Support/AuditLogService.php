<?php

namespace App\Support;

use Illuminate\Http\Request;
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
}
