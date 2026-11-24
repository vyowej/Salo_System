# SALO Connect — Local Setup & Live DB Deployment Guide

> **Safety Rule:** `database/salo_db.sql` is NOT modified. Use Laravel migrations on existing databases or `database/salo_connect_delta.sql` after importing `salo_db.sql` on a fresh install.

---

## 1. Applying to the Live `salo_db` Database

Always back up the live database before running migrations:

```bash
# 1. Back up live salo_db (XAMPP Windows)
C:\xampp\mysql\bin\mysqldump.exe -u root salo_db > database\backups\salo_db_pre_connect.sql

# 2. If `migrations` table exists, run Laravel migrations:
cd backend
php artisan migrate

# OR if `salo_db` was imported from `salo_db.sql` (no `migrations` table):
C:\xampp\mysql\bin\mysql.exe -u root salo_db < database\salo_connect_delta.sql
```

### Fresh Installs (starting from `salo_db.sql`)

```bash
# 1. Import base schema
C:\xampp\mysql\bin\mysql.exe -u root salo_db < database\salo_db.sql

# 2. Apply SALO Connect delta schema
C:\xampp\mysql\bin\mysql.exe -u root salo_db < database\salo_connect_delta.sql
```

---

## 2. Environment Variables

### `backend/.env`
```env
QUEUE_CONNECTION=database
BROADCAST_CONNECTION=reverb

REVERB_APP_ID=salo-app
REVERB_APP_KEY=salo-reverb-key
REVERB_APP_SECRET=salo-reverb-secret
REVERB_HOST=localhost
REVERB_PORT=8080
REVERB_SCHEME=http

CALL_RESPONSE_SECONDS=20
CALL_COOLDOWN_SECONDS=60
MAX_STRIKES=3
MIN_WAIT_BEFORE_CANCEL_MINUTES=5
WAIT_REQUEST_MINUTES=5
WAIT_REQUEST_RIDER_RESPONSE_MINUTES=5
MAX_WAIT_REQUESTS_PER_ORDER=2
UNREACHABLE_ORDERING_BAN_HOURS=24
```

### `.env` (Frontend)
```env
VITE_REVERB_APP_KEY=salo-reverb-key
VITE_REVERB_HOST=localhost
VITE_REVERB_PORT=8080
VITE_REVERB_SCHEME=http
```

---

## 3. Running Locally (All Required Processes)

Run each process in its own terminal (or use `npm run dev:all` for API + Reverb + Queue + Vite):

```bash
# 1. Laravel API server (port 8000)
php backend/artisan serve --host=localhost --port=8000

# 2. Laravel Reverb WebSocket server (port 8080)
php backend/artisan reverb:start --host=0.0.0.0 --port=8080

# 3. Laravel Queue worker (for 20s call timeouts, 5m wait expiry, and wait-end checks)
php backend/artisan queue:work

# 4. Laravel Scheduler (runs salo:cancel-unreachable-orders every minute)
php backend/artisan schedule:work

# 5. Vite React dev server (port 5173)
npm run dev
```

---

## 4. Running Tests (`salo_test` database)

```bash
cd backend
php artisan test
```
