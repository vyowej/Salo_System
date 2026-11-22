# SALO Table Reservations — Scheduler Setup (XAMPP on Windows)

Laravel's task scheduler only executes when `php artisan schedule:run` is invoked every minute. Both reservation automation commands are registered in `backend/routes/console.php` to run every 5 minutes in `Asia/Manila` with `withoutOverlapping(10)`.

## 1. Quick Dev Option (`schedule:work`)
For local development in a dedicated terminal:
```powershell
cd c:\xampp\htdocs\Salo_Final\backend
php artisan schedule:work
```

## 2. Windows Task Scheduler (Local Demo / Always-On)
1. Open **Task Scheduler** → **Create Task...**
2. **General**: Select **Run whether user is logged on or not**.
3. **Triggers**: **New...** → Daily, repeat task every **1 minute** indefinitely.
4. **Actions**: **New...** → Start a program:
   - **Program/script:** `C:\xampp\php\php.exe`
   - **Add arguments:** `artisan schedule:run`
   - **Start in:** `C:\xampp\htdocs\Salo_Final\backend`

## 3. Running Commands Manually & Dry-Run
```powershell
cd c:\xampp\htdocs\Salo_Final\backend

# Preview expiry & warning candidates without modifying DB
php artisan salo:expire-stale-reservations --dry-run

# Run expiry & warning sweep (optionally scoped)
php artisan salo:expire-stale-reservations --restaurant=1 --limit=50

# Preview upcoming reservation reminders
php artisan salo:send-reservation-reminders --dry-run

# Send due reminders
php artisan salo:send-reservation-reminders --restaurant=1
```

## 4. Verifying Registration
```powershell
cd c:\xampp\htdocs\Salo_Final\backend
php artisan schedule:list
```
Confirm `salo:expire-stale-reservations`, `salo:send-reservation-reminders`, and `salo:select-featured-restaurant` appear with `Asia/Manila` timezone.

## 5. Lazy Single-Row Sweep Fallback
Even if the scheduler is not running, any single-row action or detail read (`GET /api/customer/reservations/{id}`, `POST /api/customer/reservations/{id}/cancel`, `GET /api/restaurant/reservations/{id}`, owner transitions, table reassignment, deposit updates, and `GET /api/admin/reservations/{id}`) sweeps that reservation first via `ReservationExpiryService::expireDue(reservationId: $id)`. List views and scheduled notifications/reminders will lag until the scheduler runs.
