# PHASE 0 — TABLE RESERVATION ARCHITECTURAL & SCHEMA MAP

> **Phase 0 Status:** Inspection Only (Zero application code modified).  
> **Project:** SALO — Multi-Vendor Online Food Ordering & Table Reservation System  
> **Timezone:** `Asia/Manila` (`+08:00`)

---

## 1. Database Schema & Column Gap Analysis

### 1.1 `restaurant_tables` (Table #15 in `database/salo_db.sql`, lines 361–375)

| Column | Type | Nullability | Default | Key / Index | Notes |
|---|---|---|---|---|---|
| `table_id` | `BIGINT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | `PRIMARY KEY (table_id)` | Also part of `uk_restaurant_tables_id_restaurant` |
| `restaurant_id` | `BIGINT UNSIGNED` | `NOT NULL` | — | `KEY idx_restaurant_tables_active (restaurant_id, is_active)` | FK `fk_restaurant_tables_restaurant` → `restaurants(restaurant_id)` |
| `table_name` | `VARCHAR(50)` | `NOT NULL` | — | `UNIQUE KEY uk_restaurant_table_name (restaurant_id, table_name)` | Unique table name/number per restaurant |
| `seating_capacity` | `SMALLINT UNSIGNED` | `NOT NULL` | — | — | Checked via `chk_restaurant_tables_capacity CHECK (seating_capacity > 0)` |
| `is_active` | `TINYINT(1)` | `NOT NULL` | `1` | `KEY idx_restaurant_tables_active (restaurant_id, is_active)` | `1` = active/available, `0` = archived/inactive |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | — | — |
| `updated_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | — | — |

**Indexes & Constraints on `restaurant_tables`:**
- `PRIMARY KEY (table_id)`
- `UNIQUE KEY uk_restaurant_table_name (restaurant_id, table_name)`
- `UNIQUE KEY uk_restaurant_tables_id_restaurant (table_id, restaurant_id)` — composite key target allowing `reservations` to enforce same-restaurant table ownership.
- `KEY idx_restaurant_tables_active (restaurant_id, is_active)`
- `CONSTRAINT fk_restaurant_tables_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE CASCADE ON UPDATE RESTRICT`
- `CONSTRAINT chk_restaurant_tables_capacity CHECK (seating_capacity > 0)`

**Optional / Missing Columns on `restaurant_tables` (referenced in `OwnerTablesPage.css` / `RESTAURANT_SIDE.md` §9.2–9.4):**
- `dining_area` (`VARCHAR(100) NULL`, e.g. `'Indoor'`, `'Al Fresco'`, `'Balcony'`, `'VIP'`) — not in `salo_db.sql`.
- `description` / `notes` (`VARCHAR(255) NULL`) — not in `salo_db.sql`.
- `table_status` (`ENUM('available','reserved','occupied','unavailable','maintenance')`) — not stored as a column in `salo_db.sql` (live occupancy is derived from `is_active` + active overlapping `reservations`).

---

### 1.2 `reservations` (Table #33 in `database/salo_db.sql`, lines 1028–1064)

| Column | Type | Nullability | Default | Key / Index | Notes |
|---|---|---|---|---|---|
| `reservation_id` | `BIGINT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | `PRIMARY KEY (reservation_id)` | — |
| `customer_id` | `BIGINT UNSIGNED` | `NOT NULL` | — | `KEY idx_reservations_customer (customer_id)` | FK `fk_reservations_customer` → `users(user_id)` |
| `restaurant_id` | `BIGINT UNSIGNED` | `NOT NULL` | — | `KEY idx_reservations_restaurant_start (restaurant_id, reservation_start)` | FK `fk_reservations_restaurant` → `restaurants(restaurant_id)` |
| `table_id` | `BIGINT UNSIGNED` | `NULL` | `NULL` | `KEY idx_reservations_table (table_id, restaurant_id)` | Composite FK `fk_reservations_table (table_id, restaurant_id)` → `restaurant_tables(table_id, restaurant_id)` |
| `reservation_start` | `DATETIME` | `NOT NULL` | — | `KEY idx_reservations_restaurant_start (restaurant_id, reservation_start)` | Start datetime in `Asia/Manila` |
| `reservation_end` | `DATETIME` | `NOT NULL` | — | — | Checked via `chk_reservations_time CHECK (reservation_end > reservation_start)` |
| `number_of_guests` | `SMALLINT UNSIGNED` | `NOT NULL` | — | — | Checked via `chk_reservations_guests CHECK (number_of_guests > 0)` |
| `reservation_status` | `ENUM('pending','approved','awaiting_payment','confirmed','arrived','seated','completed','cancelled','no_show','rejected','expired')` | `NOT NULL` | `'pending'` | `KEY idx_reservations_status (reservation_status)` | 11 lifecycle states |
| `deposit_amount` | `DECIMAL(10,2)` | `NOT NULL` | `0.00` | — | Checked `>= 0` in `chk_reservations_amounts` |
| `service_fee` | `DECIMAL(10,2)` | `NOT NULL` | `0.00` | — | Checked `>= 0` in `chk_reservations_amounts` |
| `is_fee_refundable` | `TINYINT(1)` | `NOT NULL` | `1` | — | `1` = refundable by default |
| `cancellation_fee` | `DECIMAL(10,2)` | `NOT NULL` | `0.00` | — | Checked `>= 0` in `chk_reservations_amounts` |
| `special_requests` | `TEXT` | `NULL` | `NULL` | — | Optional customer dining notes |
| `cancelled_by` | `ENUM('customer','restaurant','admin','system')` | `NULL` | `NULL` | — | Actor category who cancelled |
| `cancelled_at` | `TIMESTAMP` | `NULL` | `NULL` | — | Timestamp when cancelled |
| `cancellation_reason` | `VARCHAR(255)` | `NULL` | `NULL` | — | Reason for cancellation |
| `no_show_marked_at` | `DATETIME` | `NULL` | `NULL` | — | Required when `reservation_status = 'no_show'` (`chk_reservations_no_show`) |
| `no_show_marked_by` | `BIGINT UNSIGNED` | `NULL` | `NULL` | — | FK `fk_reservations_no_show_marked_by` → `users(user_id)`; required when `no_show` |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | — | — |
| `updated_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | — | — |

**Indexes & Constraints on `reservations`:**
- `PRIMARY KEY (reservation_id)`
- `KEY idx_reservations_restaurant_start (restaurant_id, reservation_start)`
- `KEY idx_reservations_customer (customer_id)`
- `KEY idx_reservations_table (table_id, restaurant_id)`
- `KEY idx_reservations_status (reservation_status)`
- `CONSTRAINT fk_reservations_customer FOREIGN KEY (customer_id) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT`
- `CONSTRAINT fk_reservations_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE RESTRICT ON UPDATE RESTRICT`
- `CONSTRAINT fk_reservations_table FOREIGN KEY (table_id, restaurant_id) REFERENCES restaurant_tables (table_id, restaurant_id) ON DELETE RESTRICT ON UPDATE RESTRICT`
- `CONSTRAINT fk_reservations_no_show_marked_by FOREIGN KEY (no_show_marked_by) REFERENCES users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT`
- `CONSTRAINT chk_reservations_no_show CHECK (reservation_status <> 'no_show' OR (no_show_marked_at IS NOT NULL AND no_show_marked_by IS NOT NULL))`
- `CONSTRAINT chk_reservations_time CHECK (reservation_end > reservation_start)`
- `CONSTRAINT chk_reservations_guests CHECK (number_of_guests > 0)`
- `CONSTRAINT chk_reservations_amounts CHECK (deposit_amount >= 0 AND service_fee >= 0 AND cancellation_fee >= 0)`
- Inbound FKs from other tables:
  - `orders.reservation_id` → `fk_orders_reservation` (`ON DELETE SET NULL`)
  - `payment_allocations.reservation_id` → `fk_payment_allocations_reservation` (`ON DELETE RESTRICT`)
  - `ledger_journals.reservation_id` → `fk_ledger_journals_reservation` (`ON DELETE RESTRICT`)

---

### 1.3 Column-by-Column Comparison Against Target Feature Checklist

| Target Feature Column | Status in `salo_db.sql` (`reservations`) | Exact Existing Column / Gap Details |
|---|---|---|
| `status` enum | **EXISTS** (named `reservation_status`) | `reservation_status ENUM('pending','approved','awaiting_payment','confirmed','arrived','seated','completed','cancelled','no_show','rejected','expired') NOT NULL DEFAULT 'pending'` |
| `cancelled_by` | **EXISTS** | `cancelled_by ENUM('customer','restaurant','admin','system') NULL` (also `cancelled_at TIMESTAMP NULL`) |
| `cancel_reason` | **EXISTS** (named `cancellation_reason`) | `cancellation_reason VARCHAR(255) NULL` |
| `reject_reason` | **MISSING** | No `rejection_reason` or `rejected_at` column exists on `reservations` (unlike `orders.rejection_reason VARCHAR(255) NULL` and `orders.rejected_at DATETIME NULL`). |
| `confirmed_at` | **MISSING** | No `confirmed_at` (or `approved_at`) column exists on `reservations`. |
| `seated_at` | **MISSING** | No `seated_at` (or `arrived_at`) column exists on `reservations`. |
| `completed_at` | **MISSING** | No `completed_at` column exists on `reservations` (unlike `orders.completed_at TIMESTAMP NULL`). |
| `special_requests` | **EXISTS** | `special_requests TEXT NULL` |
| `contact_phone` | **MISSING** | No `contact_phone` (or `customer_name` / `contact_name`) snapshot column exists on `reservations` (unlike `orders.customer_name` and `orders.delivery_phone`). Currently requires joining `users.phone_number` / `user_contact_numbers` unless added via migration. |
| `deposit_status` | **MISSING** on `reservations` | `deposit_amount DECIMAL(10,2)` exists, but payment/deposit status is modeled either via `payment_allocations` (`allocation_type = 'reservation_payment'`) → `payments.payment_status` OR requires a `deposit_status` column if tracked directly on `reservations`. |
| `idempotency_key` | **MISSING** | No `idempotency_key VARCHAR(64) NULL` + unique index exists on `reservations` (unlike `checkouts.idempotency_key` with `uk_checkouts_idempotency` and `ledger_journals.idempotency_key`). |
| `table_id` | **EXISTS** | `table_id BIGINT UNSIGNED NULL` with composite FK `(table_id, restaurant_id)` → `restaurant_tables(table_id, restaurant_id)`. |
| `customer_id` | **EXISTS** | `customer_id BIGINT UNSIGNED NOT NULL` with FK → `users(user_id)`. |
| `restaurant_id` | **EXISTS** | `restaurant_id BIGINT UNSIGNED NOT NULL` with FK → `restaurants(restaurant_id)`. |
| *(Bonus gap)* `reservation_reference` | **MISSING** | `orders` has `order_reference VARCHAR(40) NOT NULL UNIQUE`, `restaurant_applications` has `reference_number`, but `reservations` has no `reservation_reference` column in `salo_db.sql`. |

---

### 1.4 Related Tables & Exact Join Columns

1. **`restaurants`** (PK: `restaurant_id`)
   - Join from `reservations` / `restaurant_tables`: `restaurants.restaurant_id = reservations.restaurant_id` / `restaurant_tables.restaurant_id`
   - Multi-branch hierarchy columns (added in `2026_11_22_000002_add_multi_branch_support.php`): `parent_restaurant_id`, `brand_restaurant_id`, `branch_name`
   - Reservation & visibility columns:
     - `restaurant_name`, `contact_phone`, `business_email`, `address_id`, `logo_image`, `cover_image`
     - `offers_dine_in` (`TINYINT(1) DEFAULT 1`)
     - `accepts_reservations` (`TINYINT(1) DEFAULT 0` — capability toggle)
     - `accepting_reservations` (`TINYINT(1) DEFAULT 1` — manual pause toggle)
     - `reservation_min_notice_hours` (`SMALLINT UNSIGNED DEFAULT 2`)
     - `reservation_max_party_size` (`SMALLINT UNSIGNED DEFAULT 8`)
     - `reservation_notes` (`TEXT NULL`)
     - `restaurant_status` (`ENUM('pending','approved','rejected','active','inactive','suspended')`)
     - `is_published` (`TINYINT(1) DEFAULT 0`, added in `2026_11_22_000001_add_menu_publishing_columns.php`)
2. **`operating_hours`** (PK: `operating_hour_id`)
   - Join: `operating_hours.restaurant_id = restaurants.restaurant_id`
   - Columns: `day_of_week` (`0` = Sunday ... `6` = Saturday), `opening_time` (`TIME`), `closing_time` (`TIME`), `closes_next_day` (`TINYINT(1)`), `is_closed` (`TINYINT(1)`)
   - Index: `idx_operating_hours_restaurant_day (restaurant_id, day_of_week)`
3. **`restaurant_closures`** (PK: `closure_id`)
   - *(Note: Table is named `restaurant_closures`, NOT `closures`)*
   - Join: `restaurant_closures.restaurant_id = restaurants.restaurant_id`
   - Columns: `closure_date` (`DATE`), `reason` (`VARCHAR(255) NULL`)
   - Unique key: `uk_restaurant_closure (restaurant_id, closure_date)`
4. **`users`** (PK: `user_id`)
   - Join for customer: `users.user_id = reservations.customer_id`
   - Join for no-show actor: `users.user_id = reservations.no_show_marked_by`
   - Columns: `user_id`, `username`, `first_name`, `middle_initial`, `last_name`, `email`, `phone_number`, `user_role` (`ENUM('customer','admin')`), `account_status` (`ENUM('active','inactive','suspended','pending')`)
5. **`user_contact_numbers`** (PK: `contact_id`)
   - Join: `user_contact_numbers.user_id = users.user_id`
   - Columns: `contact_id`, `user_id`, `label`, `phone_number`, `is_default`
6. **`restaurant_owners`** (Composite PK: `(restaurant_id, user_id)`)
   - Join: `restaurant_owners.restaurant_id = restaurants.restaurant_id` and `restaurant_owners.user_id = users.user_id`
   - Columns: `restaurant_id`, `user_id`, `joined_at`
7. **`restaurant_staff`** (PK: `staff_id`, Unique: `(restaurant_id, user_id)`)
   - Join: `restaurant_staff.restaurant_id = restaurants.restaurant_id` and `restaurant_staff.user_id = users.user_id`
   - Columns: `staff_id`, `restaurant_id`, `user_id`, `invited_by`, `staff_position` (`VARCHAR(100)`), `staff_status` (`ENUM('invited','active','inactive','declined','cancelled','expired')`), `joined_at`
8. **`notifications`** (PK: `notification_id`)
   - Join: `notifications.user_id = users.user_id`
   - Columns: `notification_id`, `user_id`, `workspace` (`ENUM('customer','restaurant','rider','admin')`), `type` (`VARCHAR(80)`), `title` (`VARCHAR(160)`), `body` (`TEXT`), `related_entity_type` (`VARCHAR(50) NULL`), `related_entity_id` (`BIGINT UNSIGNED NULL`), `read_at` (`TIMESTAMP NULL`), `created_at` (`TIMESTAMP`)
9. **`audit_logs`** (PK: `log_id`)
   - Join: `audit_logs.actor_user_id = users.user_id`
   - Columns: `log_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `old_values` (`JSON`), `new_values` (`JSON`), `reason`, `ip_address`, `created_at`
10. **`payments` & `payment_allocations`**
    - Join: `payment_allocations.reservation_id = reservations.reservation_id` and `payments.payment_id = payment_allocations.payment_id`
    - `payment_allocations.allocation_type`: `ENUM('order_payment','reservation_payment','order_refund','reservation_refund')`

---

## 2. Backend Conventions Cheat Sheet

### 2.1 Feature Module Folder Layout
Every backend feature lives under `backend/app/Features/<Module>/`:
```
backend/app/Features/Reservations/
├── Controllers/
│   ├── CustomerReservationController.php
│   ├── OwnerTableController.php          (or RestaurantTableController.php)
│   ├── OwnerReservationController.php    (or RestaurantReservationController.php)
│   └── AdminReservationController.php    (or in Features/Admin/Controllers/)
├── Requests/
│   └── *Request.php                      (FormRequest classes; authorize() always returns true)
└── Services/
    ├── CustomerReservationService.php
    ├── OwnerTableService.php
    ├── OwnerReservationService.php
    └── AdminReservationService.php
```
- **Database Access:** Services use `Illuminate\Support\Facades\DB` (`DB::table(...)`, `DB::transaction(...)`, `->lockForUpdate()`) rather than creating numerous Eloquent model files (only `App\Models\User` exists in `backend/app/Models/`). If Eloquent models are created for `RestaurantTable` / `Reservation`, they must set `$table`, `$primaryKey` (`table_id`, `reservation_id`), and `$timestamps = true`, while keeping business logic in Service classes.

### 2.2 Route Grouping & Middleware (`backend/routes/api.php` & `backend/bootstrap/app.php`)
- All `/api/*` routes automatically run the global API middleware stack prepended in `bootstrap/app.php`:
  - `EncryptCookies`, `AddQueuedCookiesToResponse`, `StartSession`, `PreventRequestForgery` (CSRF), `EnsureAccountIsActive`.
- **Public routes:** `Route::middleware('throttle:60,1')->group(...)` (e.g., `GET /api/restaurants/{id}`).
- **Customer routes:** `Route::prefix('customer')->middleware('auth')->group(...)` (every active user has the `'customer'` role by default).
- **Restaurant Owner-only routes:** `Route::prefix('restaurant')->middleware('auth')->group(function () { Route::middleware('role:owner')->group(...); });`
- **Restaurant Owner + Staff routes:** `Route::prefix('restaurant')->middleware('auth')->group(function () { Route::middleware('role:owner,staff')->group(...); });`
- **Admin routes:** `Route::prefix('admin')->middleware(['auth', 'role:admin'])->group(...)`
- Route parameters that are numeric IDs always chain `->whereNumber('id')`.

### 2.3 Workspace & Restaurant Scoping (`App\Support\WorkspaceAccessResolver`)
- **How `restaurant_id` is resolved from the request:**
  - Controllers extract `$restaurantId = $this->resolveRestaurantId($request)` checking `$request->input('restaurant_id') ?? $request->query('restaurant_id')`.
  - `WorkspaceAccessResolver::resolveRequestedRestaurantId(?int $restaurantId)` checks:
    1. Explicit `$restaurantId` argument (must be `> 0`, else `abort(403)`).
    2. `request()->input('restaurant_id') ?? request()->query('restaurant_id')` (must be positive digits, else `abort(403)`).
    3. `request()->header('X-Restaurant-Id')` (automatically sent by `src/services/apiClient.js` for all `/restaurant/*` endpoints except `/restaurant/applications*`).
    4. If none is provided, falls back to the user's first owned/assigned restaurant (preferring root branch `parent_restaurant_id IS NULL`, ordered by `restaurant_id ASC`).
- **Role & Position Guard Pattern:**
  - `WorkspaceAccessResolver` has dedicated methods per domain (`requireActiveOwnedRestaurant`, `requireActiveAuthorizedRestaurantForOrders`, `requireActiveAuthorizedRestaurantForMenuManage`, etc.).
  - Every guard verifies:
    1. The user is an owner in `restaurant_owners` OR an `active` staff member in `restaurant_staff` whose `staff_position` has the required permission in `config('salo.staff.position_permissions')`.
    2. `$restaurant->restaurant_status === 'active'` (otherwise `abort(403, ...)`).
  - **Gap to add in Phase 1+:** `WorkspaceAccessResolver` does **not** yet have `requireActiveAuthorizedRestaurantForReservations()` or `requireActiveAuthorizedRestaurantForTables()`, and `User.php` does **not** yet have `isReservationHandlerPosition()` or `isTableManagerPosition()`.
  - Note on `config/salo.php` lines 83–117:
    - `$reservationHandlerPermissions` already defines: `reservations.view`, `reservations.approve`, `reservations.reject`, `reservations.assignTables`, `reservations.updateStatus`, `reservations.manageArrival`, `tables.view`, `tables.add`, `tables.edit`, `tables.manageAvailability`.
    - `'Reservation Handler'` and `'Reservation Staff'` are mapped to `$reservationHandlerPermissions`.
    - **Important Risk:** Look at `'Manager'` in `config/salo.php` lines 102–107 — `'Manager'` merges `$menuManagePermissions`, `['menu.publish']`, `$orderHandlerPermissions`, and `$inventoryManagerPermissions`, but **omits** `$reservationHandlerPermissions`! (We should check whether `Manager` should also have `$reservationHandlerPermissions` or if helpers should check `User::positionHasPermission($pos, 'reservations.view')` / `tables.view`).

### 2.4 JSON Response Envelope (`App\Support\ApiResponse`)
- **Success (`200` or `201`):**
  ```json
  {
    "success": true,
    "message": "Human-readable message.",
    "data": { ... }
  }
  ```
- **Error (`400`, `401`, `403`, `404`, `409`, `419`, `422`, `429`, `500`):**
  ```json
  {
    "success": false,
    "message": "Human-readable error message."
  }
  ```
- **Validation Error (`422` via `ValidationException` in `bootstrap/app.php`):**
  ```json
  {
    "success": false,
    "message": "The given data was invalid.",
    "errors": {
      "field_name": ["Error message 1."]
    }
  }
  ```
- **Invalid State Transition / Conflict (`409`):**
  - Services throw `new Symfony\Component\HttpKernel\Exception\ConflictHttpException('...')`, which `bootstrap/app.php` renders as `{ "success": false, "message": "..." }` with HTTP `409`.
- **Cross-Tenant Resource Not Found (`404`):**
  - When a customer queries another customer's resource, or an authorized restaurant queries a record belonging to another restaurant, services throw `new NotFoundHttpException('...')` or `abort_unless($row !== null, 404, '...')`.
- **Pagination Shapes:**
  - Customer & Restaurant endpoints return `pagination`:
    ```json
    "pagination": {
      "current_page": 1,
      "per_page": 15,
      "total": 42,
      "last_page": 3
    }
    ```
  - Admin endpoints (`AdminOrderService`) return `items` + `meta`:
    ```json
    "items": [...],
    "meta": {
      "current_page": 1,
      "last_page": 3,
      "per_page": 15,
      "total": 42
    }
    ```
- **Timestamps:**
  - All timestamps returned in JSON use `OrderTimestampFormatter::toManilaIso($value)` → ISO-8601 in `Asia/Manila` (`2026-11-22T18:30:00+08:00`).

### 2.5 Idempotency Key Pattern (`CheckoutService::placeOrder`)
1. FormRequest validates `'idempotency_key' => ['required', 'string', 'min:8', 'max:64']`.
2. Before starting work, query the table by `idempotency_key`:
   - If found and `customer_id !== $user->user_id`, throw `new ConflictHttpException('Idempotency key is already in use.')` (`409`).
   - If found and `customer_id === $user->user_id`, return the formatted existing record (`201`).
3. Wrap the insert in `try { DB::transaction(...); } catch (QueryException $e)`:
   - Check `$sqlState === '23000' && $driverCode === 1062` (duplicate key race condition).
   - Re-fetch by `idempotency_key`, verify `customer_id === $user->user_id` (else `409`), and return the existing record.

### 2.6 Audit Logging Pattern (`App\Support\AuditLogService`)
Inside the same `DB::transaction()`, call:
```php
$this->auditLogService->record(
    actorUserId: (int) $user->user_id,
    action: 'customer_reservation_created', // or owner_table_created, restaurant_reservation_approved, etc.
    entityType: 'reservations',             // or 'restaurant_tables'
    entityId: $reservationId,
    oldValues: [...],
    newValues: [...],
    reason: $cleanReason,
    request: $request,
);
```

### 2.7 Test Suite Conventions (`backend/tests/Feature/*Test.php` & `src/test/*.test.js`)
- **Backend PHPUnit tests:**
  - Extend `Tests\TestCase` and `use DatabaseTransactions;` (never `RefreshDatabase` or `migrate:fresh`! `Tests\TestCase::setUp()` strictly asserts that `DB::connection()` is connected to `salo_test` and fails immediately otherwise).
  - Create users via `User::create([... 'user_role' => 'customer'|'admin', 'account_status' => 'active'])`.
  - Create addresses via `app(\App\Support\AddressService::class)->createAddress(['province' => 'Metro Manila', 'city' => 'Quezon City', 'barangay' => 'Diliman', 'street' => '...'])`.
  - Create restaurants via `DB::table('restaurants')->insertGetId([... 'restaurant_status' => 'active', 'is_published' => 1])`.
  - Link owners via `DB::table('restaurant_owners')->insert(['restaurant_id' => $id, 'user_id' => $owner->user_id, 'joined_at' => now()])`.
  - Link staff via `DB::table('restaurant_staff')->insert(['restaurant_id' => $id, 'user_id' => $staff->user_id, 'staff_position' => 'Reservation Handler', 'staff_status' => 'active', ...])`.
  - Authenticate requests using `$this->actingAs($user)->getJson(...)` / `postJson(...)` / `patchJson(...)` / `deleteJson(...)`.
- **Frontend Node tests (`npm test` runs `node --test`):**
  - Placed in `src/test/*.test.js`.
  - Uses `node:test`, `node:assert/strict`, `node:fs/promises`, and Vite's `createServer({ server: { middlewareMode: true }, appType: 'custom' })` with `server.ssrLoadModule('/src/services/...')` and mocked `globalThis.fetch`.

---

## 3. Existing Reservation Code Inspection

### 3.1 `backend/app/Features/Reservations/`
- Currently contains only empty placeholder directories with `.gitkeep` files:
  - `backend/app/Features/Reservations/Controllers/.gitkeep`
  - `backend/app/Features/Reservations/Requests/.gitkeep`
  - `backend/app/Features/Reservations/Services/.gitkeep`
- Zero reservation or table routes exist in `backend/routes/api.php`.

### 3.2 `RestaurantService` (`backend/app/Features/Restaurants/Services/RestaurantService.php`)
- **Public Restaurant List (`listRestaurants`) & Details (`getRestaurantDetails`):**
  - Selects `r.offers_dine_in`, `r.accepts_reservations`, `r.accepting_orders`, `r.accepting_reservations`.
  - Formats `'offers' => ['delivery' => (bool) $row->offers_delivery, 'pickup' => (bool) $row->offers_pickup, 'dine_in' => (bool) $row->offers_dine_in, 'reservations' => (bool) $row->accepts_reservations]`.
  - Passes `$row`, `$hours`, and `$closures` to `AvailabilityService::compute()`.
  - **Gap noticed:** `getRestaurantDetails()` does **not** currently select or return `r.reservation_min_notice_hours`, `r.reservation_max_party_size`, or `r.reservation_notes`, even though those columns exist on `restaurants` and are needed by `ReservationModal.jsx`!
- **Owner Setup Status (`getOwnerSetupStatus`):**
  - Counts active tables: `(SELECT COUNT(*) FROM restaurant_tables WHERE restaurant_id = ? AND is_active = 1) as tables_count`.
  - Computes `tables.applicable = $offersDineIn || $acceptsReservations` and `tables.complete = ! $tablesApplicable || $tablesCount >= 1`.

### 3.3 `AvailabilityService` (`backend/app/Features/Restaurants/Services/AvailabilityService.php`)
- Constant `TIMEZONE = 'Asia/Manila'`.
- `compute(object $restaurant, Collection $operatingHours, Collection $closures, ?Carbon $now = null): array`:
  - Evaluates current `Asia/Manila` day/time against `restaurant_closures` (today and yesterday overnight spillover) and `operating_hours` (including split shifts and `closes_next_day = 1`).
  - Computes:
    - `'is_open' => $isOpen`
    - `'status_label' => $isOpen ? 'Open' : 'Closed'`
    - `'accepting_orders' => (bool) $restaurant->accepting_orders`
    - `'accepting_reservations' => (bool) $restaurant->accepts_reservations && (bool) $restaurant->accepting_reservations`
    - `'not_accepting_orders' => ! $acceptingOrders`
    - `'not_accepting_reservations' => ! $acceptingReservations`
    - `'temporarily_unavailable' => $todayClosure !== null`
    - `'closure_reason' => $todayClosure?->reason`
  - *(Note: It returns `accepting_reservations`, not `can_reserve`; there is no slot-based or table-capacity availability method in `AvailabilityService` yet).*

### 3.4 `PATCH /api/restaurant/accepting-status` & `PATCH /api/restaurant/settings`
- **`PATCH /api/restaurant/accepting-status`** (`OwnerProfileController::updateAcceptingStatus` → `UpdateOwnerAcceptingStatusRequest` → `OwnerProfileService::updateAcceptingStatus`):
  - Middleware: `auth`, `role:owner`.
  - Resolves owned active restaurant via `WorkspaceAccessResolver::requireActiveOwnedRestaurant`.
  - Validates optional booleans `accepting_orders` and `accepting_reservations`.
  - Updates `restaurants.accepting_orders` and `restaurants.accepting_reservations` in a transaction, logs `owner_accepting_toggles_updated` to `audit_logs`, and returns `data: ['profile' => $this->formatProfile($fresh)]`.
- **`GET /api/restaurant/settings` & `PATCH /api/restaurant/settings`** (`OwnerProfileController::settings` / `updateSettings`):
  - Middleware: `auth`, `role:owner`.
  - Allows updating `offers_delivery`, `offers_pickup`, `offers_dine_in`, `accepts_reservations`, `accepting_orders`, `accepting_reservations`, `reservation_min_notice_hours` (`0..168`), `reservation_max_party_size` (`1..100`), and `reservation_notes` (`max:1000`).

---

## 4. In-App Notifications Architecture

### 4.1 Endpoints (`backend/routes/api.php` lines 110–115, `NotificationController`)
All under `Route::prefix('notifications')->middleware(['auth', 'throttle:120,1'])`:
- `GET /api/notifications` — query params: `workspace` (`customer`|`restaurant`|`rider`|`admin`), `unread_only` (bool), `page`, `per_page` (default 20, max 100). Returns `data: { items: [...], pagination: { current_page, per_page, total, last_page } }`.
- `GET /api/notifications/unread-count` — returns `data: { total: int, by_workspace: { customer, restaurant, rider, admin } }`.
- `POST /api/notifications/read-all` — optional `workspace` in body/query. Returns `data: { updated_count: int }`.
- `POST /api/notifications/{id}/read` — marks single notification owned by `$request->user()` as read (`404` if owned by another user).

### 4.2 Creation Helper (`App\Features\Notifications\Services\NotificationService`)
- `notifyUser(int $userId, string $workspace, string $type, string $title, string $body, ?string $relatedEntityType = null, ?int $relatedEntityId = null): int`
- `notifyUsers(array $userIds, string $workspace, string $type, string $title, string $body, ?string $relatedEntityType = null, ?int $relatedEntityId = null): void`
- Always called **inside** the caller's `DB::transaction()` so rolled-back transactions never leave orphan notifications.
- Existing recipient resolver helpers in `NotificationService`:
  - `resolveRestaurantOwnerUserIds(int $restaurantId): array`
  - `resolveRestaurantOrderHandlerUserIds(int $restaurantId): array`
  - `resolveActiveAdminUserIds(?int $excludeUserId = null): array`
- **Gap to add for Reservations:**
  - Add `resolveRestaurantReservationHandlerUserIds(int $restaurantId): array` in `NotificationService` (resolving active owners + active staff whose `staff_position` has `reservations.view` permission).
  - Update `src/utils/notificationUtils.js`:
    - `getNotificationCategory(type)`: add `if (code.startsWith('reservation_')) return 'reservation';` and `CATEGORY_LABELS.reservation = 'Reservation update'`.
    - `getNotificationRoute(notification)`: route `entityType === 'reservation' || type.startsWith('reservation_')` to `/customer/reservations` (for `customer`), `/owner/reservations` (for `restaurant`), and `/admin/reservations` (for `admin`).

---

## 5. Frontend Inspection

### 5.1 Customer Reservation Components & Pages
1. **`src/features/customer/components/ReservationModal.jsx`** (721 lines):
   - Opened from `RestaurantDetailPage.jsx` ("Reserve a Table" button or `?tab=reserve`).
   - Has full UI layout: party size selector (`[1, 2, 4, 6, 8, 10, 12, 16]`), two-column monthly availability calendar + arrival time slot picker, preferred seating area radio cards, guest contact inputs (prefilled from `useAuth()`), special requests textarea, deposit/fee breakdown, and celebratory confirmation screen.
   - **Current Stubs / Hardcoding:**
     - `monthAvailability` is hardcoded to `{}` (line 61).
     - `selectedDayData` is hardcoded to `{ slots: [] }` (line 64), so no time slots ever render!
     - `handleBookTable` (line 146) sets `formError`: `'Table reservations are not available yet. The reservation API endpoint is pending backend implementation.'`
     - `user.name` / `user.phone` prefill on lines 55–57 mismatches `AuthContext` user fields (`user.first_name`, `user.last_name`, `user.phone_number`).
2. **`src/features/customer/pages/ReservationsPage.jsx`** (920 lines) + **`CustomerReservationsPage.css`** (852 lines):
   - Route: `/customer/reservations`.
   - Has full UI layout: 4 summary metric cards (`Upcoming Bookings`, `Pending Approval`, `Completed Gatherings`, `Cancelled / Declined`), Calendar View (monthly grid with chips + selected date schedule panel) and All Bookings List View (search bar, sort dropdown, status filter pills), Cancellation Request modal, and Comprehensive Details modal.
   - **Current Stubs / Hardcoding:**
     - `useEffect` (line 47) calls synchronous `customerService.getReservations()`, which returns `[]`.
     - `handleConfirmCancel` (line 198) sets `error`: `'Reservation cancellation is not available yet. The reservation API is pending backend implementation.'`
     - Links to `/customer/restaurant/${res.restaurantId}` on lines 521, 608, 732, 789 (Note: the actual route in `src/App.jsx` line 366 is `/customer/restaurants/:id` plural!).

### 5.2 Restaurant Owner Tables & Reservations Pages
1. **`src/features/restaurant/pages/OwnerTablesPage.jsx`** (16 lines) + **`OwnerTablesPage.css`** (581 lines):
   - Route: `/owner/tables`, guarded by `<RequireAccess itemId="tables">` (requires `tables.view`).
   - **Current state:** Renders only a placeholder `<StateView state="empty" title="Table management is not available yet" ... />`.
   - **Note:** `OwnerTablesPage.css` (581 lines) already has complete styling classes ready for `.owner-tables-page`, `.owner-tables-stats`, `.owner-tables-toolbar`, `.owner-tables-grid`, `.owner-table-card`, `.owner-table-form`, and `.owner-archive-dialog`.
2. **`src/features/restaurant/pages/OwnerReservationsPage.jsx`** (16 lines) + **`OwnerReservationsPage.css`** (1,096 lines):
   - Route: `/owner/reservations`, guarded by `<RequireAccess itemId="reservations">` (requires `reservations.view`).
   - **Current state:** Renders only a placeholder `<StateView state="empty" title="Reservations management is not available yet" ... />`.
   - **Note:** `OwnerReservationsPage.css` (1,096 lines) already has complete styling classes ready for `.owner-reservations-page`, `.owner-stat-grid--6`, `.owner-cal-nav`, `.owner-month-grid-card`, `.owner-daily-schedule-card`, `.owner-slot-card`, `.owner-week-grid`, etc.
3. **`src/features/restaurant/pages/OwnerDashboard.jsx`** + **`OwnerDashboardReservationsSection.jsx`**:
   - Calls synchronous `ownerService.getReservations(selectedRestaurantId)` (returns `[]`) and `ownerService.getTables(selectedRestaurantId, todayKey)` (returns `[]`).

### 5.3 Admin Reservations Page
1. **`src/features/admin/pages/AdminReservationsPage.jsx`** (20 lines):
   - Routes: `/admin/reservations` and `/admin/reservations/:id`, guarded by `AdminRouteGuard` + `<AdminPermissionRoute module="reservations" topic="reservations">`.
   - **Current state:** Renders only `<StateView state="empty" title="Admin reservations view is not available yet" ... />`.
   - Should follow the exact pattern of `AdminOrdersPage.jsx` (using `PageHeader`, `.admin-filter-bar`, `DataTable`, `StatusBadge`, `StateView`, `DetailDrawer` / `Modal`, and `useAdminPageSearch`).

### 5.4 Services & API Client
- **`src/services/apiClient.js`:**
  - Central `fetch` wrapper using `credentials: 'include'`, automatic `/auth/csrf` handshake (`X-XSRF-TOKEN` + `X-CSRF-TOKEN`), automatic retry on `419`, and automatic `X-Restaurant-Id` header injection on `/restaurant/*` requests.
- **`src/services/customerService.js`:**
  - `getReservations()` is hardcoded to `return [];` (lines 118–120). Needs async API methods (`fetchRestaurantReservationAvailability`, `createReservation`, `fetchReservations`, `fetchReservationDetail`, `cancelReservation`).
- **`src/services/ownerService.js`:**
  - Lines 357–419 have synchronous stubs (`getReservations() { return []; }`, `getTables() { return []; }`) and `notAvailable(...)` throwers (`addTable`, `updateTable`, `archiveTable`, `reactivateTable`, `updateReservationStatus`, `assignReservationTable`, `recordReservationPayment`, `resolveReservationCancellation`). Needs real async methods calling `/api/restaurant/tables*` and `/api/restaurant/reservations*`.
- **`src/services/adminApiService.js`:**
  - Has `getOrders(params)` calling `/admin/orders`, but has no `getReservations(params)` or `getReservationDetail(id)` methods yet.

### 5.5 Shared UI Components Available for Reuse
- **Feedback:** `src/components/feedback/StateView.jsx` (`state="loading" | "empty" | "error"`), `LoadingSpinner`, `EmptyState`, `ErrorState`, `Skeleton`.
- **Common:** `src/components/common/Modal.jsx` (`size="sm" | "md" | "lg" | "xl"`), `ConfirmDialog.jsx`, `WarningDialog.jsx`, `Badge.jsx`, `Button.jsx`, `Card.jsx`, `Popover.jsx`.
- **Forms:** `src/components/forms/FormElements.jsx` (`Input`, `Select`, `Textarea`, `Label`, `FormGroup`, `ErrorMessage`, `HelperText`).
- **Admin Components:** `src/features/admin/components/` (`DataTable`, `PageHeader`, `StatCard`, `StatusBadge`, `StateView`, `FilterBar`, `DetailDrawer`, `Timeline`, `Tabs`, `Modal`, `ConfirmModal`, `showAdminToast`).
- **Date/Time Pickers:** Native `<input type="date">`, `<input type="time">`, and custom calendar matrix grids (as in `ReservationModal.jsx` and `ReservationsPage.jsx`) styled with SALO design tokens (`src/styles/variables.css`).

---

## 6. Scheduler & Queue Setup Inspection

- **Console Routes & Scheduler (`backend/routes/console.php`):**
  - Uses Laravel 11+ `Illuminate\Support\Facades\Schedule`.
  - Currently schedules one command:
    ```php
    Schedule::command('salo:select-featured-restaurant')
        ->dailyAt('00:05')
        ->timezone('Asia/Manila')
        ->withoutOverlapping();
    ```
  - Custom console commands live in `backend/app/Console/Commands/` (auto-discovered by Laravel 11+ `bootstrap/app.php`).
- **Queue Configuration (`backend/config/queue.php`):**
  - Default driver is `env('QUEUE_CONNECTION', 'database')`, expecting a `jobs` table.
  - **CRITICAL FINDING:** There is **NO `jobs` table** in `database/salo_db.sql` or in `backend/database/migrations/`!
  - Furthermore, existing time-based expiration in SALO (such as staff invitation expiration in `StaffInvitationService`, noted in `docs/NOTIFICATIONS.md` §4) is evaluated **lazily on read and before state transitions** (and/or via an idempotent Artisan command scheduled in `routes/console.php`), rather than relying on an asynchronous queue worker daemon.
  - Therefore, any reservation auto-expiration or no-show grace check should either run synchronously on read/write + an idempotent scheduled Artisan command (e.g. `salo:expire-stale-reservations` in `routes/console.php` with `->timezone('Asia/Manila')`), without requiring a background queue table unless a migration is explicitly added.

---

## 7. File-by-File Inventory: Exists vs. Must Be Created / Updated

### 7.1 Backend Files

| File Path | Status | Action Needed in Later Phases |
|---|---|---|
| `database/salo_db.sql` | **Exists** | Baseline schema containing `restaurant_tables` and `reservations`. |
| `backend/database/migrations/2026_11_23_000001_extend_reservations_and_tables.php` | **To Create** (if schema extended) | Add missing columns on `reservations` (`reservation_reference`, `contact_name`, `contact_phone`, `rejection_reason`, `rejected_at`, `approved_at`, `confirmed_at`, `arrived_at`, `seated_at`, `completed_at`, `idempotency_key`, etc.) and optional `dining_area`/`notes` on `restaurant_tables`. |
| `backend/config/salo.php` | **Exists** | Add `'reservations'` config block (default duration, slot interval, grace period, etc.) and ensure `'Manager'` includes `$reservationHandlerPermissions`. |
| `backend/app/Models/User.php` | **Exists** | Add position helpers (`canViewReservationsPosition`, `canManageReservationsPosition`, `canViewTablesPosition`, `canManageTablesPosition`). |
| `backend/app/Support/WorkspaceAccessResolver.php` | **Exists** | Add `requireActiveAuthorizedRestaurantForReservations()` and `requireActiveAuthorizedRestaurantForTables()`. |
| `backend/app/Features/Notifications/Services/NotificationService.php` | **Exists** | Add `resolveRestaurantReservationHandlerUserIds(int $restaurantId)`. |
| `backend/app/Features/Restaurants/Services/RestaurantService.php` | **Exists** | Expose `reservation_min_notice_hours`, `reservation_max_party_size`, and `reservation_notes` in `getRestaurantDetails()` / `listRestaurants()`. |
| `backend/app/Features/Reservations/Controllers/PublicReservationAvailabilityController.php` | **To Create** | Handle public/customer table & time-slot availability queries for a restaurant. |
| `backend/app/Features/Reservations/Controllers/CustomerReservationController.php` | **To Create** | Handle customer reservation creation, listing, detail, and cancellation. |
| `backend/app/Features/Reservations/Controllers/OwnerTableController.php` | **To Create** | Handle restaurant table CRUD, activate/deactivate, and table schedule inspection. |
| `backend/app/Features/Reservations/Controllers/OwnerReservationController.php` | **To Create** | Handle restaurant reservation listing, calendar summary, detail, approve, reject, assign table, mark arrived/seated/completed/no-show, and cancel. |
| `backend/app/Features/Reservations/Controllers/AdminReservationController.php` | **To Create** | Handle admin platform-wide reservation listing, filtering, and detail inspection. |
| `backend/app/Features/Reservations/Requests/*.php` | **To Create** | FormRequest classes for table CRUD, customer booking, customer cancel, owner transitions/table assignment/rejection, and admin list filters. |
| `backend/app/Features/Reservations/Services/ReservationAvailabilityService.php` | **To Create** | Compute open dates, time slots, and candidate available tables in `Asia/Manila` respecting `operating_hours`, `restaurant_closures`, `reservation_min_notice_hours`, `reservation_max_party_size`, and existing overlapping reservations. |
| `backend/app/Features/Reservations/Services/CustomerReservationService.php` | **To Create** | Transactional booking (`lockForUpdate`), idempotency, self-reservation block, listing, detail, and customer cancellation. |
| `backend/app/Features/Reservations/Services/OwnerTableService.php` | **To Create** | Restaurant-scoped table CRUD, duplicate name guard, capacity checks, active/archive guard against future active reservations, and audit logs. |
| `backend/app/Features/Reservations/Services/OwnerReservationService.php` | **To Create** | Restaurant-scoped reservation management, table assignment with overlap lock (`lockForUpdate`), lifecycle transitions, no-show validation, notifications, and audit logs. |
| `backend/app/Features/Reservations/Services/AdminReservationService.php` | **To Create** | Platform-wide paginated reservation query with search, status/date/restaurant filters, and detail view. |
| `backend/routes/api.php` | **Exists** | Register public availability route, `/api/customer/reservations*`, `/api/restaurant/tables*`, `/api/restaurant/reservations*`, and `/api/admin/reservations*`. |
| `backend/tests/Feature/ReservationSystemTest.php` (and/or phase test files) | **To Create** | Automated PHPUnit feature tests covering RBAC, workspace scoping, table CRUD, availability, booking concurrency/idempotency, lifecycle transitions, notifications, and admin oversight. |

### 7.2 Frontend Files

| File Path | Status | Action Needed in Later Phases |
|---|---|---|
| `src/services/publicRestaurantService.js` | **Exists** | Map `reservationMinNoticeHours`, `reservationMaxPartySize`, `reservationNotes`, and `acceptsReservations` from `GET /api/restaurants/{id}`. |
| `src/services/customerService.js` | **Exists** | Replace hardcoded `getReservations() { return []; }` with real async reservation & availability API calls. |
| `src/services/ownerService.js` | **Exists** | Replace hardcoded table & reservation stubs with real async `/restaurant/tables*` and `/restaurant/reservations*` calls and normalizers. |
| `src/services/adminApiService.js` | **Exists** | Add `getReservations(params)` and `getReservationDetail(id)`. |
| `src/utils/notificationUtils.js` | **Exists** | Add `reservation` category and deep-link routing for `customer`, `restaurant`, and `admin` workspaces. |
| `src/features/customer/components/ReservationModal.jsx` | **Exists (Stubbed)** | Wire to real availability endpoint and `POST /api/customer/reservations` with idempotency key, real user contact prefill, loading/error states, and confirmation receipt. |
| `src/features/customer/pages/ReservationsPage.jsx` | **Exists (Stubbed)** | Wire to real `GET /api/customer/reservations` and `POST /api/customer/reservations/{id}/cancel`; fix `/customer/restaurant/` typo to `/customer/restaurants/`. |
| `src/features/restaurant/pages/OwnerTablesPage.jsx` | **Exists (Placeholder)** | Replace placeholder `StateView` with full table management UI using `OwnerTablesPage.css`. |
| `src/features/restaurant/pages/OwnerReservationsPage.jsx` | **Exists (Placeholder)** | Replace placeholder `StateView` with full reservation management & calendar/list UI using `OwnerReservationsPage.css`. |
| `src/features/restaurant/pages/OwnerDashboard.jsx` | **Exists** | Wire `upcomingReservations`, `pendingReservations`, `todayReservations`, and `availableTables` to real async owner reservation/table APIs. |
| `src/features/admin/pages/AdminReservationsPage.jsx` | **Exists (Placeholder)** | Replace placeholder `StateView` with full admin reservation oversight table, filters, summary stats, and detail drawer/modal. |
| `src/test/reservations*.test.js` | **To Create** | Automated Node/Vite SSR tests verifying service normalization, API calls, and UI integration. |

---

## 8. Risks, Mismatches & Conflicts Noticed

1. **`Manager` Position Missing Reservation & Table Permissions in `backend/config/salo.php`:**
   - In `backend/config/salo.php` (lines 102–107), `'Manager'` merges `$menuManagePermissions`, `['menu.publish']`, `$orderHandlerPermissions`, and `$inventoryManagerPermissions`, but **does not include `$reservationHandlerPermissions`**.
   - As a result, a staff member with position `'Manager'` currently lacks `reservations.*` and `tables.*` permissions, which also blocks `'Manager'` from `/owner` Overview in `permissionMap.js` (line 53: `allOf: ['business.profile.view', 'orders.view', 'reservations.view', 'reports.sales.view', 'menu.view']`).
   - **Resolution for Phase 1+:** Include `$reservationHandlerPermissions` in `'Manager'` in `backend/config/salo.php` and derive `reservations.handler_positions` / `tables.manager_positions` from `$positionsWithPermission(...)`.
2. **Missing Lifecycle & Snapshot Columns on `reservations` in `salo_db.sql`:**
   - `reservations` has no `reservation_reference`, `contact_name`, `contact_phone`, `rejection_reason`, `rejected_at`, `approved_at`, `confirmed_at`, `arrived_at`, `seated_at`, `completed_at`, or `idempotency_key`.
   - `restaurant_tables` has no `dining_area` or `description` column, whereas `ReservationModal.jsx`, `ReservationsPage.jsx`, and `OwnerTablesPage.css` prominently display seating/dining areas and booking references.
   - **Resolution for Phase 1+:** Introduce a non-destructive additive migration (matching the style of `2026_11_22_000001_add_menu_publishing_columns.php` with `Schema::hasColumn` guards) and update `database/salo_db.sql` (or keep migration-backed columns aligned with `salo_test` and `salo_db`).
3. **Database Constraint `chk_reservations_no_show`:**
   - `salo_db.sql` line 1058 enforces:
     `CONSTRAINT chk_reservations_no_show CHECK (reservation_status <> 'no_show' OR (no_show_marked_at IS NOT NULL AND no_show_marked_by IS NOT NULL))`
   - Any transition to `no_show` **must** set both `no_show_marked_at` and `no_show_marked_by` in the same `UPDATE`, or MySQL/MariaDB will throw a constraint violation error.
4. **Composite Foreign Key `fk_reservations_table (table_id, restaurant_id)`:**
   - `reservations` has a composite FK `(table_id, restaurant_id)` referencing `restaurant_tables (table_id, restaurant_id)`.
   - Assigning a `table_id` from a different restaurant will fail at the DB level; service logic must also validate that `table_id` belongs to `$restaurantId`, is `is_active = 1`, has `seating_capacity >= number_of_guests`, and has no overlapping active reservation (`pending`/`approved`/`awaiting_payment`/`confirmed`/`arrived`/`seated`) in `[reservation_start, reservation_end)`.
5. **Broken Restaurant Link in `ReservationsPage.jsx`:**
   - `ReservationsPage.jsx` (lines 521, 608, 732, 789) links to `/customer/restaurant/${res.restaurantId}` (singular), which hits the catch-all redirect to `/` because `src/App.jsx` registers `/customer/restaurants/:id` (plural).
6. **User Object Property Mismatch in `ReservationModal.jsx`:**
   - `ReservationModal.jsx` (lines 55–57) reads `user.name` and `user.phone`, whereas `/api/auth/me` returns `first_name`, `last_name`, and `phone_number`.
7. **Public Restaurant Details Missing Reservation Policy Fields:**
   - `RestaurantService::getRestaurantDetails()` selects `accepts_reservations` and `accepting_reservations`, but omits `reservation_min_notice_hours`, `reservation_max_party_size`, and `reservation_notes`.
8. **No `jobs` Table for Queues:**
   - `config/queue.php` defaults to `database`, but no `jobs` table exists. All notifications and side effects must execute synchronously inside `DB::transaction()` (matching `CheckoutService` and `RestaurantOrderService`), and any periodic expiration must use synchronous read/write checks or a scheduled Artisan command in `routes/console.php`.
