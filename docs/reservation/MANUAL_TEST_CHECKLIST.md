# SALO Table Reservation — Manual Browser Test Checklist

Use this checklist to verify all reservation workflows end-to-end in the browser across every user role.

## Prerequisites
- Backend running (`php artisan serve` or XAMPP Apache pointing to `backend/public`) and MySQL (`salo_db`) seeded/migrated.
- Frontend running (`npm run dev` or built `dist/`).
- Timezone reference: **Asia/Manila** (`UTC+8`).
- Test accounts prepared:
  - **Customer**: active customer account (not an owner/staff of the target restaurant).
  - **Restaurant Owner**: owner of a published, active restaurant with operating hours configured and at least 2 active tables.
  - **Limited Staff**: staff member assigned to the same restaurant with **only** `reservations.view` and `tables.view` (missing `reservations.approve`, `reservations.reject`, `reservations.updateStatus`, `reservations.manageArrival`, `reservations.assignTables`, `tables.add`, `tables.edit`, `tables.manageAvailability`).
  - **Admin**: platform admin account with `reservations` permission.

---

## 1. Customer Scenarios

### C-01: Discovery, Availability & Standard Booking (No Deposit)
1. Log in as **Customer** and open a published restaurant's detail page (`/restaurants/:id`).
2. Click **Book a Table** to open the Reservation Modal.
3. Select a date with open operating hours, party size (within restaurant min/max), and an available time slot.
4. Enter guest name, phone (`+63...` or `09...`), optional special requests, and submit.
- **Expected Result**:
  - Modal displays confirmation with reservation reference code, date/time in `Asia/Manila`, party size, and status `pending` (or `confirmed` if auto-confirm is enabled).
  - Reservation appears in `/reservations` under upcoming reservations.
  - Restaurant owner receives an in-app notification.

### C-02: Duplicate Submission / Idempotency & Table Conflict
1. Submit the exact same booking form twice rapidly (or replay with the same `idempotency_key`).
- **Expected Result**: Only **one** reservation is created (`201` idempotent replay); no duplicate rows appear in `/reservations`.
2. Open a second browser/incognito session as another customer (or use `docs/reservation/concurrency-check.ps1`) and attempt to book the last remaining table for an overlapping time slot.
- **Expected Result**: The second request is rejected with a clear conflict message (`SLOT_TAKEN` / slot unavailable) and the UI refreshes available slots.

### C-03: Deposit-Required Booking Flow
1. Ensure the restaurant has **Require Deposit** enabled in Owner Settings (e.g., `₱500`, `deposit_expiry_hours = 24`, GCash/Bank instructions filled).
2. As **Customer**, submit a new reservation at that restaurant.
3. Wait for Owner approval (moving reservation to `awaiting_payment`), then reload `/reservations`.
- **Expected Result**:
  - Reservation card shows `Awaiting Payment`, required deposit amount (`₱500.00`), payment instructions, and payment deadline countdown (`payment_due_at`).
  - Once the owner records the deposit, status updates to `confirmed` and deposit status displays `Paid`.

### C-04: Customer Cancellation (Before vs. Inside Cutoff)
1. On `/reservations`, cancel a future reservation that is **outside** the restaurant's `cancellation_cutoff_hours`.
- **Expected Result**: Cancellation succeeds; status becomes `cancelled`; reason is recorded; slot becomes bookable again.
2. Attempt to cancel a reservation whose start time is **inside** the cancellation cutoff window (e.g., 1 hour before start when cutoff is 2 hours).
- **Expected Result**: UI disables or rejects cancellation with a clear cutoff-passed message (`CANCELLATION_CUTOFF_PASSED`).

### C-05: Self-Booking Guard
1. Log in as the **Owner** (or **Staff**) of Restaurant A and navigate to Restaurant A's public customer page.
2. Attempt to submit a reservation at Restaurant A.
- **Expected Result**: Blocked with a self-booking error message (owners/staff cannot reserve at their own restaurant).

---

## 2. Restaurant Owner Scenarios

### O-01: Reservation & Deposit Settings
1. Log in as **Owner** and open **Settings** (`/owner/settings`).
2. Update reservation settings: enable reservations, set `default_duration_minutes`, `min_advance_minutes`, `max_advance_days`, `cancellation_cutoff_hours`, toggle `require_deposit`, set `deposit_amount`, `deposit_expiry_hours`, and save.
3. Reload the page and inspect the public restaurant reservation info.
- **Expected Result**:
  - Settings persist across reloads.
  - Validation rejects invalid bounds (e.g., `require_deposit = true` without positive `deposit_amount`, or `deposit_expiry_hours < 1`).

### O-02: Table Management & Active-Booking Archive Guard
1. Open **Tables** (`/owner/tables`).
2. Create a new table (`T-New`, capacity `4`, min party `2`, dining area `Indoor`).
- **Expected Result**: Table appears in the list and in public table selection.
3. Attempt to edit a table with `min_party_size > capacity`.
- **Expected Result**: Inline/server validation error (`422`); change is not saved.
4. Attempt to **Archive** a table that currently has an active upcoming reservation assigned (`pending`/`awaiting_payment`/`confirmed`/`arrived`/`seated`).
- **Expected Result**: Archive is blocked (`409`); table remains active.
5. **Archive** an unused table, verify it disappears from public availability, then **Reactivate** it.
- **Expected Result**: Table toggles between `archived` and `active` cleanly.

### O-03: Full Reservation Lifecycle, Table Reassignment & Manual Deposit
1. Open **Reservations** (`/owner/reservations`) and switch between **List** and **Calendar** views.
2. For a `pending` deposit-required reservation:
   - Click **Approve** -> status moves to `awaiting_payment`.
   - Click **Record Deposit** -> enter reference/amount -> status moves to `confirmed`, `deposit_status = paid`.
3. Reassign the reservation to another available table via **Assign Table**.
   - Attempt to assign a table already booked for an overlapping time -> **Expected Result**: Blocked (`409` conflict).
   - Assign a free table -> **Expected Result**: Succeeds (`200`).
4. Click **Mark Arrived** (`arrived`) -> **Seat Guest** (`seated`) -> **Complete** (`completed`).
- **Expected Result**: Each transition updates status badge, timeline/status history, and table occupancy status.
5. On another `confirmed` reservation, click **Mark No-Show** (`no_show`) or **Cancel** (testing optional `refund_deposit` checkbox when deposit was paid).
- **Expected Result**: Status updates to `no_show` or `cancelled` (with `deposit_status = refunded` if refunded), and customer receives notification.

---

## 3. Limited-Permission Staff Scenarios

### S-01: Read-Only Access Allowed, Mutations Denied
1. Log in as **Limited Staff** (`reservations.view` + `tables.view` only).
2. Navigate to `/owner/reservations` and `/owner/tables`.
- **Expected Result**:
  - Staff **can** view reservation list, calendar, reservation details, and table list.
  - Action buttons (`Approve`, `Reject`, `Record Deposit`, `Assign Table`, `Arrived`, `Seat`, `Complete`, `No-Show`, `Cancel`, `Add Table`, `Edit Table`, `Archive/Reactivate`) are hidden/disabled in the UI.
  - Direct API calls to any mutation endpoint or `GET/PATCH /api/restaurant/settings` return **403 Forbidden**.

---

## 4. Admin Scenarios

### A-01: Platform Oversight & Read-Only Enforcement
1. Log in as **Admin** and open `/admin/reservations`.
2. Verify KPI summary cards, daily/hourly trend charts (`Asia/Manila`), top restaurants table, and attention counts load.
3. Filter by status (`pending`, `awaiting_payment`, `confirmed`, `expired`, `no_show`), date range, or search by reservation reference / customer name.
4. Click a reservation row to open the **Detail Drawer** (and verify deep-link `?reservation=<id>` works on page reload).
- **Expected Result**:
  - All stats, trends, timeline history, and deposit/fee breakdowns display accurately.
  - No edit/approve/cancel controls exist in the Admin UI (strictly read-only).
  - Attempting to access `/api/admin/reservations` as a customer/owner/staff returns **403 Forbidden**; unauthenticated returns **401 Unauthorized**.

---

## 5. Automation Scenarios (Expiry & Reminders)

### E-01: Stale Pending / Awaiting-Payment Expiry
1. Create a `pending` reservation whose `pending_expires_at` is in the past (or `awaiting_payment` with `payment_due_at` in the past).
2. Run `php artisan salo:expire-stale-reservations --dry-run`, then run `php artisan salo:expire-stale-reservations`.
3. Refresh Customer `/reservations` and Owner `/owner/reservations`.
- **Expected Result**:
  - `--dry-run` previews without mutating DB.
  - Real run transitions the stale reservation to `expired`, records `expired_at`, logs status history (`system`), sends customer/owner notifications, and frees the table slot for new bookings.
  - Re-running the command is idempotent (0 additional changes).

### E-02: Upcoming Reservation Reminders & Expiry Warnings
1. Ensure a `confirmed` reservation starts within the reminder window (2 hours) with `reminder_sent_at = null`.
2. Run `php artisan salo:send-reservation-reminders`.
- **Expected Result**:
  - Customer receives an upcoming reservation reminder notification (`reminder_sent_at` populated).
  - Re-running does not send duplicate reminders.
