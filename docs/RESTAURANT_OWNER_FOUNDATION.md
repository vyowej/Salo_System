# Restaurant Owner Foundation

## Architecture (Real-Backend Only)

- `/owner/*` pages are wrapped in `RequireAccess`, which checks the signed-in user, active restaurant membership (`user.restaurant_ownerships` and `user.restaurant_staff_assignments` from `GET /api/auth/me`), and the centralized navigation permission map. Client-side checks are for UX only; backend authorization remains the security boundary.
- `useRestaurantAccess()` exposes distinct ownership and staff memberships, the selected accessible restaurant, and permission checks derived strictly from `/api/auth/me`.
- Demo mode, `src/services/demo/`, `VITE_ENABLE_DEMO_AUTH`, and all sample/seed data have been removed.
- **Wired Category A endpoints:**
  - `GET /api/restaurant/setup-status` (`SetupChecklistCard` & Business Owner onboarding)
  - `GET /api/restaurant/location`, `PATCH /api/restaurant/location`, `PUT /api/restaurant/coverage` (`OwnerProfilePage`)
- **Unbacked Category B screens (honest empty / not-available-yet states):**
  - Business Profile info/logo/cover/gallery upload & Operating Hours/Closures CRUD
  - Menu Management (`OwnerMenuPage`)
  - Orders (`OwnerOrdersPage`)
  - Reservations (`OwnerReservationsPage`)
  - Tables (`OwnerTablesPage`)
  - Inventory (`OwnerInventoryPage`)
  - Earnings & Payouts (`OwnerEarningsPage`)
  - Promotions (`OwnerPromotionsPage`), Team & Staff (`TeamAndStaffPage`), Reports (`OwnerReportsPage`), Activity Logs (`OwnerActivityPage`), Settings (`OwnerSettingsPage`)

## Local Run Instructions (Real Data Only)

1. Start XAMPP Apache & MySQL.
2. Start Laravel backend on `http://localhost:8000`:
   ```bash
   cd backend
   php artisan serve --host=localhost --port=8000
   ```
3. Start Vite frontend on `http://localhost:5173`:
   ```bash
   npm run dev
   ```
4. Sign in with real database credentials (no demo accounts or demo mode exist).
