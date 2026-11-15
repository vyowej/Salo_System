# SALO Backend

Before any task, read documentation/SALO_DEVELOPMENT_RULES.md and follow it strictly.

- Do not install any package or dependency without my explicit approval. This includes laravel/boost; do not run boost:install.
- Do not run php artisan migrate, migrate:fresh, db:wipe, or any seeder. database/salo_db.sql (database salo_db) is the authoritative schema.
- Tests run only against salo_test.
- Never print or commit .env values.
- Stop and ask before any database write or any conflict with the rules.
- End every implementation task with the completion report from the dev rules.
