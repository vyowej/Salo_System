<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Verifies multi-branch data integrity on `restaurants` and `restaurant_owners`:
 * 1) No NULL or mismatched brand_restaurant_id on root rows
 * 2) Single-level hierarchy (every parent_restaurant_id points to a root row)
 * 3) Child brand_restaurant_id matches parent's brand_restaurant_id
 * 4) Strategy B: no owner mismatch between any child branch and its root
 */
class CheckBranchIntegrityCommand extends Command
{
    protected $signature = 'salo:check-branch-integrity';

    protected $description = 'Verify multi-branch brand, hierarchy, and owner consistency (read-only).';

    public function handle(): int
    {
        $dbName = (string) (DB::selectOne('SELECT DATABASE() AS db')->db ?? 'unknown');

        $nullBrandCount = (int) (DB::selectOne(
            'SELECT COUNT(*) AS cnt FROM restaurants WHERE brand_restaurant_id IS NULL'
        )->cnt ?? 0);

        $mismatchedRootCount = (int) (DB::selectOne(
            'SELECT COUNT(*) AS cnt FROM restaurants WHERE parent_restaurant_id IS NULL AND brand_restaurant_id <> restaurant_id'
        )->cnt ?? 0);

        $grandchildCount = (int) (DB::selectOne(
            'SELECT COUNT(*) AS cnt
             FROM restaurants c
             INNER JOIN restaurants p ON p.restaurant_id = c.parent_restaurant_id
             WHERE p.parent_restaurant_id IS NOT NULL'
        )->cnt ?? 0);

        $childBrandMismatchCount = (int) (DB::selectOne(
            'SELECT COUNT(*) AS cnt
             FROM restaurants c
             INNER JOIN restaurants p ON p.restaurant_id = c.parent_restaurant_id
             WHERE c.brand_restaurant_id <> p.brand_restaurant_id'
        )->cnt ?? 0);

        $ownerMismatchCount = (int) (DB::selectOne(
            'SELECT COUNT(*) AS cnt
             FROM restaurants c
             WHERE c.parent_restaurant_id IS NOT NULL
               AND (
                   EXISTS (
                       SELECT 1 FROM restaurant_owners ro_root
                       WHERE ro_root.restaurant_id = c.parent_restaurant_id
                         AND NOT EXISTS (
                             SELECT 1 FROM restaurant_owners ro_branch
                             WHERE ro_branch.restaurant_id = c.restaurant_id
                               AND ro_branch.user_id = ro_root.user_id
                         )
                   )
                   OR EXISTS (
                       SELECT 1 FROM restaurant_owners ro_branch
                       WHERE ro_branch.restaurant_id = c.restaurant_id
                         AND NOT EXISTS (
                             SELECT 1 FROM restaurant_owners ro_root
                             WHERE ro_root.restaurant_id = c.parent_restaurant_id
                               AND ro_root.user_id = ro_branch.user_id
                         )
                   )
               )'
        )->cnt ?? 0);

        $totalAnomalies = $nullBrandCount + $mismatchedRootCount + $grandchildCount + $childBrandMismatchCount + $ownerMismatchCount;

        $appBranchLinkMismatchCount = (int) (DB::selectOne(
            'SELECT COUNT(*) AS cnt
             FROM restaurant_application_branches rab
             INNER JOIN restaurant_applications ra ON ra.restaurant_application_id = rab.restaurant_application_id
             LEFT JOIN restaurants r ON r.restaurant_id = rab.created_branch_restaurant_id
             WHERE rab.created_branch_restaurant_id IS NOT NULL
               AND (
                   r.restaurant_id IS NULL
                   OR r.parent_restaurant_id <> ra.restaurant_id
                   OR r.brand_restaurant_id <> ra.restaurant_id
               )'
        )->cnt ?? 0);

        $this->line(sprintf(
            '[%s] brand_restaurant_id IS NULL: %d | root brand mismatch: %d | non-root parent: %d | child brand mismatch: %d | owner mismatch: %d | app branch link mismatch: %d',
            $dbName,
            $nullBrandCount,
            $mismatchedRootCount,
            $grandchildCount,
            $childBrandMismatchCount,
            $ownerMismatchCount,
            $appBranchLinkMismatchCount,
        ));

        $totalAnomalies += $appBranchLinkMismatchCount;

        if ($totalAnomalies > 0) {
            $this->error('Branch integrity check failed.');

            return self::FAILURE;
        }

        $this->info('Branch integrity check passed (0 anomalies).');

        return self::SUCCESS;
    }
}
