# Database Test Data Reset Log (`salo_db`)

- **Date:** 2026-11-24
- **Target:** `salo_db` on local XAMPP MariaDB (`127.0.0.1:3306`)
- **Pre-reset backup:** `database/backups/salo_db_before_reset_20261124.sql` (gitignored, 188,283 bytes)

## Summary of Action
- Cleared all test data across 46 application tables and removed 3 non-admin test customer accounts from `users`, resetting `AUTO_INCREMENT` to `1` on cleared tables and `2` on `users`.
- **Kept intact:**
  - Schema (57 base tables, 1 view `ledger_unbalanced_journals`, 4 ledger immutability triggers).
  - Reference/configuration tables: `migrations` (12), `platform_settings` (8), `platform_service_areas` (1), `provinces` (4), `cities` (4), `barangays` (4), `restaurant_categories` (2), `ledger_accounts` (0).
  - Protected empty ledger tables: `ledger_journals` (0), `ledger_entries` (0).
  - Admin account: `user_id = 1` (`cssdy`, `cassidyhimodo@gmail.com`).
- Recorded 1 audit entry (`system.test_data_reset`) in `audit_logs`.
- Cleared Laravel application cache and stale session files.
- Verified 0 foreign key orphans across 142 FK constraints with `FOREIGN_KEY_CHECKS = 1`.
- The one-time `salo:reset-test-data` Artisan command was removed immediately after verification to prevent accidental execution once real data is entered.
