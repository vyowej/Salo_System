# SALO Public Restaurants & Menus API

All endpoints below are public (no authentication required), read-only, and rate-limited (`60` requests per minute per IP, returning `429` when exceeded). Responses use the standard `{ success, message, data, errors }` envelope.

## Visibility & Availability Rules

- **Visibility:** Only restaurants with `restaurant_status = 'active'` appear in list results or resolve on detail/menu endpoints. Restaurants with `pending`, `approved` (not yet activated), `rejected`, `inactive`, or `suspended` status are excluded from lists and return `404` on `GET /api/restaurants/{id}` and `GET /api/restaurants/{id}/menu`.
- **Menu visibility:** Only active `menu_categories` (`is_active = 1`) and non-hidden `menu_items` (`availability_status != 'hidden'`) are returned. `sold_out` (`"Sold Out"`) and `temporarily_unavailable` (`"Temporarily Unavailable"`) items are included with their status so customers can see them without adding them to cart.
- **Availability (`Asia/Manila`):** Computed on the backend from `operating_hours` (supports multiple periods per day and `closes_next_day = 1` overnight spillover), `restaurant_closures`, and the restaurant's `accepting_orders` / `accepting_reservations` pause toggles.
- **Ratings:** `average_rating`, `review_count`, and `rating_summary` are omitted completely when a restaurant has zero visible reviews (`reviews.is_visible = 1`).
- **Privacy:** Owner details, staff, `business_email`, `registered_name`, `ownership_structure`, `delivery_radius`, `restaurant_status`, commission rates, and application/document records are never exposed.

---

## Endpoints

### `GET /api/restaurant-categories`

Returns active restaurant categories ordered by `category_name` (note: `restaurant_categories` in `salo_db.sql` does not currently have a `sort_order` column).

**Response (`200`):**
```json
{
  "success": true,
  "message": "Restaurant categories retrieved.",
  "data": {
    "categories": [
      { "id": 1, "name": "Filipino", "description": "Traditional Filipino dishes" }
    ]
  }
}
```

### `GET /api/restaurants`

Returns a paginated list of approved and active restaurants.

- **Query parameters:**
  - `page` (int, default `1`)
  - `per_page` (int, default `12`, max `50`)
  - `search` (string, optional — matches `restaurant_name` or active category name; SQL `LIKE` wildcards `%` and `_` are escaped)
  - `category` (string or int, optional — active category ID or exact case-insensitive name)
  - `offers_delivery`, `offers_pickup`, `offers_dine_in` (boolean, optional)
  - `sort` (`name` | `newest`, default `name`)

**Response (`200`):**
```json
{
  "success": true,
  "message": "Restaurants retrieved.",
  "data": {
    "restaurants": [
      {
        "id": 1,
        "name": "Dalisay Heritage Grill & Bistro",
        "business_type": "restaurant",
        "description": "Authentic Filipino charcoal-grilled specialties.",
        "logo_path": null,
        "cover_path": null,
        "categories": [{ "id": 1, "name": "Filipino" }],
        "short_address": "Tomas Morato, Quezon City",
        "offers": {
          "delivery": true,
          "pickup": true,
          "dine_in": true,
          "reservations": true
        },
        "availability": {
          "is_open": true,
          "status_label": "Open",
          "accepting_orders": true,
          "accepting_reservations": true,
          "not_accepting_orders": false,
          "not_accepting_reservations": false,
          "temporarily_unavailable": false,
          "closure_reason": null
        }
      }
    ],
    "pagination": {
      "current_page": 1,
      "per_page": 12,
      "total": 1,
      "last_page": 1
    }
  }
}
```

### `GET /api/restaurants/{id}`

Returns public details, address, public `contact_phone`, `operating_hours`, `offers`, computed `availability`, and `rating_summary` (only when visible reviews exist). Returns `404` if not found or not active.

### `GET /api/restaurants/{id}/menu`

Returns active `menu_categories` in `sort_order`, each with its non-hidden `menu_items`, `availability` (`"Available"` | `"Sold Out"` | `"Temporarily Unavailable"`), and `add_on_groups` with `options` (`is_required`, `minimum_selections`, `maximum_selections`). Returns `404` if the restaurant is not found or not active.

### `GET /api/restaurant/setup-status` (Authenticated Owner Only)

Returns the derived onboarding and setup checklist status for an approved/active restaurant owned by the authenticated user. Protected by `auth` and `role:owner` middleware and strictly scoped via `restaurant_owners`.

- **Query parameters:** `restaurant_id` (int, optional — defaults to the owner's first approved/active restaurant; returns `404` if the restaurant does not belong to the authenticated owner or is not approved/active).
- **Derived status fields:**
  - `business_profile`: `{ complete: boolean, has_logo, has_cover, has_info, has_address }`
  - `operating_hours`: `{ complete: boolean, open_periods_count }`
  - `menu`: `{ complete: boolean, active_categories_count, active_items_count }`
  - `tables`: `{ applicable: boolean, complete: boolean, active_tables_count }` (`applicable` is `true` only when `offers_dine_in` or `accepts_reservations` is enabled)
  - `availability_toggles`: `{ complete: boolean, accepting_orders, accepting_reservations, accepts_reservations }`
  - `all_complete`: `boolean`


---

## Schema Inventory (Existing `database/salo_db.sql` — No New Migrations Added)

All Step 5 endpoints use existing tables and columns from `database/salo_db.sql`:

| Table | Key Columns Used | Notes |
| --- | --- | --- |
| `restaurants` | `restaurant_id`, `restaurant_name`, `business_type`, `description`, `contact_phone`, `address_id`, `logo_image`, `cover_image`, `offers_delivery`, `offers_pickup`, `offers_dine_in`, `accepts_reservations`, `accepting_orders`, `accepting_reservations`, `restaurant_status`, `created_at` | `restaurant_status = 'active'` is set on admin approval (`AdminApplicationService`); private fields (`business_email`, `registered_name`, `ownership_structure`, `delivery_radius`) are never exposed. |
| `restaurant_categories` | `category_id`, `category_name`, `description`, `is_active` | No `sort_order` column exists; ordered by `category_name ASC, category_id ASC`. |
| `restaurant_category_map` | `restaurant_id`, `category_id` | Links restaurants to active categories. |
| `operating_hours` | `operating_hour_id`, `restaurant_id`, `day_of_week`, `opening_time`, `closing_time`, `closes_next_day`, `is_closed` | Multiple periods per day and overnight spillover supported in `Asia/Manila`. |
| `restaurant_closures` | `closure_id`, `restaurant_id`, `closure_date`, `reason` | Overrides regular `operating_hours` on matching `closure_date`. |
| `menu_categories` | `menu_category_id`, `restaurant_id`, `category_name`, `description`, `sort_order`, `is_active` | Active categories ordered by `sort_order ASC, menu_category_id ASC`. |
| `menu_items` | `menu_item_id`, `restaurant_id`, `menu_category_id`, `item_name`, `description`, `photo_image`, `base_price`, `availability_status`, `approval_status`, `sort_order` | `hidden` items are excluded; `sold_out` and `temporarily_unavailable` items are returned with status. |
| `add_on_groups` | `add_on_group_id`, `menu_item_id`, `group_name`, `is_required`, `minimum_selections`, `maximum_selections`, `sort_order` | Returned per menu item ordered by `sort_order`. |
| `add_on_options` | `add_on_option_id`, `add_on_group_id`, `option_name`, `additional_price`, `is_available`, `sort_order` | Returned per add-on group ordered by `sort_order`. |
| `reviews` | `review_id`, `customer_id`, `restaurant_id`, `order_id`, `rating`, `comment`, `is_visible` | Only `is_visible = 1` rows are aggregated; rating fields are omitted when count is `0`. |


## Multi-Branch Fields (Phase 6a)

- `GET /api/restaurants` and `GET /api/restaurants/{id}` include additive fields on each visible branch: `branch_name`, `brand_restaurant_id`, `display_name` (`"<restaurant_name> — <branch_name>"` or `<restaurant_name>` when `branch_name` is null), `branch_count`, and `short_address`.
- `GET /api/restaurants?search=` also matches `branch_name`, `barangay_name`, and `city_name`.
- `GET /api/restaurants/{id}` includes `siblings[]` containing only the other publicly visible branches of the same `brand_restaurant_id` (`id`, `branch_name`, `display_name`, `short_address`, `availability`). Hidden, unpublished, or inactive siblings are never exposed.

---

## Owner & Staff Table Management (`/api/restaurant/tables*`)

All table management endpoints require session authentication (`auth`), `role:owner,staff` middleware, and workspace scoping via `WorkspaceAccessResolver::requireActiveAuthorizedRestaurantForTables()` (resolved from `restaurant_id` query/body parameter, `X-Restaurant-Id` header, or the user's primary active restaurant).
- Cross-tenant table IDs always return `404` (`NotFoundHttpException`), never `403`.
- Staff without the required `tables.*` permission receive `403`.
- There is intentionally **no** hard-delete route (`reservations` reference `restaurant_tables` with `ON DELETE RESTRICT`); removing a table from active service uses `POST /api/restaurant/tables/{id}/archive` (`is_active = 0`).

### `GET /api/restaurant/tables` (`tables.view`)

Lists restaurant tables with live reservation status for the selected date, summary metrics, and distinct dining areas in a single aggregated query.

- **Query parameters:**
  - `restaurant_id` (int, optional)
  - `search` (string, optional, max `100` — matches `table_name`, `dining_area`, `description`)
  - `dining_area` (string, optional, max `100`)
  - `status` (`active` | `archived` | `all`, default `all`)
  - `date` (`YYYY-MM-DD`, optional — defaults to today in `Asia/Manila`)

**Response (`200`):**
```json
{
  "success": true,
  "message": "Restaurant tables retrieved.",
  "data": {
    "items": [
      {
        "table_id": 1,
        "restaurant_id": 1,
        "table_name": "T-01",
        "seating_capacity": 4,
        "min_party_size": 2,
        "dining_area": "Indoor",
        "description": "Window booth for four",
        "is_active": true,
        "table_status": "reserved",
        "reservations_count": 1,
        "next_reservation": {
          "reservation_id": 14,
          "reservation_reference": "SALO-RES-20261123-AB12",
          "reservation_start": "2026-11-23T19:00:00+08:00",
          "number_of_guests": 4,
          "status": "confirmed"
        },
        "upcoming_reservations_count": 2,
        "created_at": "2026-11-20T10:00:00+08:00",
        "updated_at": "2026-11-22T15:30:00+08:00"
      }
    ],
    "summary": {
      "total_tables": 8,
      "active_tables": 7,
      "archived_tables": 1,
      "total_seats": 34,
      "available_now": 5,
      "reserved_count": 1,
      "occupied_count": 1
    },
    "dining_areas": ["Indoor", "Outdoor", "Private Room", "Terrace"]
  }
}
```

### `POST /api/restaurant/tables` (`tables.add`)

Creates a new active table (`is_active = 1`) and records an `owner_table_created` audit log entry.

- **Request body:**
  ```json
  {
    "table_name": "T-09",
    "seating_capacity": 6,
    "min_party_size": 3,
    "dining_area": "Terrace",
    "description": "Garden view table for six"
  }
  ```
- **Response (`201`):** `{ "success": true, "message": "Restaurant table created.", "data": { "table": { ... } } }`
- **Error responses:**
  - `422`: Validation failure (`table_name` blank, >50 chars, or case-insensitive duplicate within the restaurant; `seating_capacity` outside `1..100`; `min_party_size` < 1 or > `seating_capacity`).
  - `403`: Staff lacks `tables.add` permission or restaurant is not active.

### `GET /api/restaurant/tables/{id}` (`tables.view`)

Returns a single table by ID with live status for `date` (defaults to today in `Asia/Manila`).
- **Response (`200`):** `{ "success": true, "message": "Restaurant table retrieved.", "data": { "table": { ... } } }`
- **Error responses:** `404` if not found or belongs to another restaurant.

### `PATCH /api/restaurant/tables/{id}` (`tables.edit`)

Partially updates table attributes and records an `owner_table_updated` audit log entry.

- **Request body (partial):**
  ```json
  {
    "table_name": "T-09A",
    "seating_capacity": 4,
    "min_party_size": 2,
    "dining_area": "Indoor",
    "description": "Updated indoor table"
  }
  ```
- **Response (`200`):** `{ "success": true, "message": "Restaurant table updated.", "data": { "table": { ... } } }`
- **Error responses:**
  - `422`: Duplicate `table_name` in restaurant, or `min_party_size` exceeds new/existing `seating_capacity`.
  - `409`: Reducing `seating_capacity` or raising `min_party_size` conflicts with future blocking reservations assigned to the table (message includes the count and earliest conflicting `reservation_reference`).
  - `404`: Table does not exist or belongs to another restaurant.

### `POST /api/restaurant/tables/{id}/archive` (`tables.manageAvailability`)

Archives a table (`is_active = 0`, `table_status = 'archived'`) and records an `owner_table_archived` audit log entry. Idempotent (`200`) if already archived.
- **Error responses:**
  - `409`: Table has future blocking reservations (`reservation_start >= now` in `Asia/Manila` and status in `pending`, `approved`, `awaiting_payment`, `confirmed`, `arrived`, `seated`).
  - `404`: Table does not exist or belongs to another restaurant.

### `POST /api/restaurant/tables/{id}/reactivate` (`tables.manageAvailability`)

Reactivates an archived table (`is_active = 1`) and records an `owner_table_reactivated` audit log entry. Idempotent (`200`) if already active.

---

## Public Reservation Availability & Policy Endpoints (`/api/restaurants/{id}/reservation-*`)

All endpoints below are public (no login required), rate-limited (`throttle:60,1`), and operate in `Asia/Manila`.
- Unknown, non-`active`, or unpublished (`is_published = 0`) restaurants return `404`.
- Malformed query parameters return `422` with validation errors.
- Well-formed requests where booking is not possible for a business/policy reason return HTTP `200` with `bookable: false`, `reason_code`, and a user-facing `message`.

### Extended `GET /api/restaurants/{id}` & `GET /api/restaurants` Reservation Fields

- `GET /api/restaurants` and `GET /api/restaurants/{id}` now include additive `can_reserve` (`accepts_reservations && accepting_reservations && active_tables_count > 0`, computed via a single scalar subquery without extra per-row queries) and `availability.can_reserve`.
- `GET /api/restaurants/{id}` additionally returns:
  - `reservation_min_notice_hours` (int)
  - `reservation_max_party_size` (int)
  - `reservation_notes` (string|null)
  - `reservation_duration_minutes` (int)
  - `reservation_max_advance_days` (int)
  - `reservation_cancellation_cutoff_minutes` (int)
  - `reservation_deposit_required` (bool)
  - `reservation_deposit_amount` (`"0.00"`)
  - `reservation_service_fee` (`"0.00"`)

### Reason Codes

| `reason_code` | Meaning |
| --- | --- |
| `RESTAURANT_UNAVAILABLE` | Restaurant is not active or not published. |
| `RESERVATIONS_NOT_OFFERED` | Restaurant does not offer table reservations (`accepts_reservations = 0`). |
| `NOT_ACCEPTING` | Restaurant has temporarily paused reservations (`accepting_reservations = 0`). |
| `NO_TABLES` | Restaurant has no active tables (`is_active = 1`). |
| `PARTY_TOO_LARGE` | Requested `party_size` is `< 1`, exceeds `reservation_max_party_size`, or exceeds `largest_table_capacity`. |
| `PAST_TIME` | Requested date/time is in the past (`< now` in `Asia/Manila`). |
| `TOO_SOON` | Requested start time is within `reservation_min_notice_hours` (`< now + min_notice_hours`). |
| `TOO_FAR_AHEAD` | Requested date exceeds `today + reservation_max_advance_days`. |
| `CLOSED` | Requested date is in `restaurant_closures`, has `is_closed = 1`, or `[start, end]` falls outside operating periods. |
| `FULLY_BOOKED` | Suitable tables exist for the party size/area, but all are booked in the requested window. |
| `NO_FIT` | No active table matches `[min_party_size, seating_capacity]` (and optional `dining_area`) for the requested party size. |

### `GET /api/restaurants/{id}/reservation-info`

Returns the restaurant's reservation policy settings, live open/accepting status, distinct `dining_areas` from active tables, `active_table_count`, and `largest_table_capacity`.

**Example Response (`200` — Not Accepting Reservations):**
```json
{
  "success": true,
  "message": "This restaurant is temporarily not accepting new reservations.",
  "data": {
    "restaurant_id": 1,
    "restaurant_name": "Dalisay Heritage Grill & Bistro",
    "bookable": false,
    "can_reserve": false,
    "reason_code": "NOT_ACCEPTING",
    "message": "This restaurant is temporarily not accepting new reservations.",
    "offers_dine_in": true,
    "accepts_reservations": true,
    "accepting_reservations": false,
    "is_open": true,
    "status_label": "Open",
    "temporarily_unavailable": false,
    "closure_reason": null,
    "reservation_min_notice_hours": 2,
    "reservation_max_party_size": 8,
    "effective_max_party_size": 8,
    "smallest_min_party_size": 1,
    "reservation_notes": "Smart casual dress code.",
    "reservation_duration_minutes": 90,
    "reservation_max_advance_days": 30,
    "reservation_cancellation_cutoff_minutes": 120,
    "reservation_auto_confirm": false,
    "reservation_deposit_required": false,
    "reservation_deposit_amount": "0.00",
    "reservation_service_fee": "0.00",
    "slot_interval_minutes": 30,
    "dining_areas": ["Indoor", "Outdoor", "Terrace"],
    "active_table_count": 6,
    "largest_table_capacity": 8
  }
}
```

### `GET /api/restaurants/{id}/reservation-availability/month?month=YYYY-MM&party_size=N`

Computes calendar-month availability using ONE tables query and ONE blocking-reservations query for the month range.
- Each day has `status`: `available` | `limited` (`available_slots <= 25%` of `total_slots`) | `full` | `closed` | `unavailable`.

**Example Response (`200`):**
```json
{
  "success": true,
  "message": "Monthly reservation availability retrieved.",
  "data": {
    "restaurant_id": 1,
    "month": "2026-11",
    "party_size": 4,
    "bookable": true,
    "reason_code": null,
    "message": "Monthly reservation availability retrieved.",
    "days": [
      { "date": "2026-11-22", "status": "unavailable", "available_slots": 0, "total_slots": 6, "reason_code": "TOO_SOON" },
      { "date": "2026-11-23", "status": "available", "available_slots": 5, "total_slots": 6, "reason_code": null },
      { "date": "2026-11-24", "status": "limited", "available_slots": 1, "total_slots": 6, "reason_code": null },
      { "date": "2026-11-25", "status": "full", "available_slots": 0, "total_slots": 6, "reason_code": "FULLY_BOOKED" },
      { "date": "2026-11-26", "status": "closed", "available_slots": 0, "total_slots": 0, "reason_code": "CLOSED" }
    ]
  }
}
```

### `GET /api/restaurants/{id}/reservation-availability?date=YYYY-MM-DD&party_size=N[&dining_area=...]`

Returns generated candidate slots and a day-level summary using ONE tables query and ONE blocking-reservations query.

**Example Response (`200` — Available Slots):**
```json
{
  "success": true,
  "message": "Available reservation times retrieved.",
  "data": {
    "restaurant_id": 1,
    "date": "2026-11-24",
    "party_size": 4,
    "dining_area": null,
    "duration_minutes": 90,
    "bookable": true,
    "is_closed": false,
    "closure_reason": null,
    "total_slots": 2,
    "available_slots": 1,
    "first_available_slot": "2026-11-24T18:30:00+08:00",
    "reason_code": null,
    "message": "Available reservation times retrieved.",
    "slots": [
      {
        "start": "2026-11-24T18:00:00+08:00",
        "end": "2026-11-24T19:30:00+08:00",
        "time": "18:00",
        "time_label": "6:00 PM",
        "available": false,
        "available_table_count": 0,
        "reason_code": "FULLY_BOOKED",
        "dining_areas_available": []
      },
      {
        "start": "2026-11-24T18:30:00+08:00",
        "end": "2026-11-24T20:00:00+08:00",
        "time": "18:30",
        "time_label": "6:30 PM",
        "available": true,
        "available_table_count": 2,
        "reason_code": null,
        "dining_areas_available": ["Indoor", "Terrace"]
      }
    ]
  }
}
```

**Example Response (`200` — Closed Day):**
```json
{
  "success": true,
  "message": "The restaurant is closed on 2026-11-26 (Private Event Buyout).",
  "data": {
    "restaurant_id": 1,
    "date": "2026-11-26",
    "party_size": 4,
    "dining_area": null,
    "duration_minutes": 90,
    "bookable": false,
    "is_closed": true,
    "closure_reason": "Private Event Buyout",
    "total_slots": 0,
    "available_slots": 0,
    "first_available_slot": null,
    "reason_code": "CLOSED",
    "message": "The restaurant is closed on 2026-11-26 (Private Event Buyout).",
    "slots": []
  }
}
```

### `GET /api/restaurants/{id}/reservation-availability/tables?start=YYYY-MM-DDTHH:MM&party_size=N[&dining_area=...]`

Validates a specific start time slot and returns `available_tables` ordered best-fit first (`seating_capacity ASC, dining_area ASC, table_name ASC`), or `suggested_alternatives` (nearest available slots on the same date, up to `config('salo.reservations.suggested_slot_window')`) when the slot is full.

**Example Response (`200` — Fully Booked Slot with Suggested Alternatives):**
```json
{
  "success": true,
  "message": "All suitable tables are already reserved for this time slot.",
  "data": {
    "restaurant_id": 1,
    "start": "2026-11-24T18:00:00+08:00",
    "end": "2026-11-24T19:30:00+08:00",
    "party_size": 4,
    "dining_area": null,
    "duration_minutes": 90,
    "bookable": false,
    "reason_code": "FULLY_BOOKED",
    "message": "All suitable tables are already reserved for this time slot.",
    "available_tables": [],
    "suggested_alternatives": [
      {
        "start": "2026-11-24T18:30:00+08:00",
        "end": "2026-11-24T20:00:00+08:00",
        "time": "18:30",
        "time_label": "6:30 PM",
        "available_table_count": 2,
        "dining_areas_available": ["Indoor", "Terrace"]
      }
    ]
  }
}
```

---

## Customer Reservation Booking & Management (`/api/customer/reservations*`)

All customer reservation endpoints require session authentication (`auth` middleware) and operate in `Asia/Manila`.

### `POST /api/customer/reservations` (`auth`, `throttle:20,1`)

Creates a table reservation with idempotency (`(customer_id, idempotency_key)`), row locking (`SELECT ... FOR UPDATE`) on candidate tables, server-derived end time and fees, status history, audit log (`customer_reservation_created`), and synchronous notifications.

- **Request Body:**
  ```json
  {
    "restaurant_id": 1,
    "start": "2026-11-24T18:30",
    "party_size": 4,
    "table_id": null,
    "dining_area": "Terrace",
    "contact_name": "Maria Santos",
    "contact_phone": "09171234567",
    "special_requests": "Birthday dinner",
    "idempotency_key": "res-20261123-0001"
  }
  ```
- **Response (`201`):** Returns `{ "success": true, "message": "Reservation request submitted.", "data": { "reservation": { ... } } }`.
- **Error Responses:**
  - `422`: Validation failure, `SELF_BOOKING` (owner or active staff of the target restaurant), or booking window policy failure (`RESTAURANT_UNAVAILABLE`, `RESERVATIONS_NOT_OFFERED`, `NOT_ACCEPTING`, `NO_TABLES`, `PARTY_TOO_LARGE`, `PAST_TIME`, `TOO_SOON`, `TOO_FAR_AHEAD`, `CLOSED`).
  - `409`: `SLOT_TAKEN`, `FULLY_BOOKED` (includes `suggested_alternatives`), `NO_FIT`, `OVERLAPPING_BOOKING` (customer already holds an overlapping active reservation at any restaurant), or `TOO_MANY_PENDING` (customer has reached `config('salo.reservations.max_active_pending_per_customer')`).
  - `404`: Restaurant does not exist or is not active/published.

### `GET /api/customer/reservations` (`auth`)

Lists the authenticated customer's reservations with eager-joined restaurant and table info in a single query.
- **Query parameters:** `tab` (`upcoming|past|cancelled|all`), `status`, `restaurant_id`, `search`, `date_from`, `date_to`, `sort` (`soonest|latest`), `page`, `per_page` (default `15`, max `100`).
- **Response (`200`):** `{ "success": true, "data": { "items": [...], "pagination": { ... }, "summary": { "total", "upcoming", "pending", "completed", "cancelled_or_declined" } } }`.

### `GET /api/customer/reservations/{id}` (`auth`)

Returns a single reservation owned by the authenticated customer (`404` if not found or owned by another customer), including `status_history`, `restaurant_address`, `restaurant_phone`, `reservation_notes`, `cancellation_cutoff_minutes`, and `cancellation_deadline`.

### `POST /api/customer/reservations/{id}/cancel` (`auth`)

Cancels a customer's reservation (`pending` cancellable until `reservation_start`; `approved`, `awaiting_payment`, and `confirmed` cancellable until `reservation_start - reservation_cancellation_cutoff_minutes`). Records status history, `customer_reservation_cancelled` audit log, and notifies restaurant reservation handlers (`reservation_cancelled_by_customer`).
- **Error Responses:** `404` if not owned by the customer; `409` (`CANCELLATION_CUTOFF_PASSED` or `INVALID_STATUS_TRANSITION`).

---

## Owner & Staff Reservation Management (`/api/restaurant/reservations*`)

All owner reservation endpoints require session authentication (`auth`), `role:owner,staff`, and workspace authorization via `WorkspaceAccessResolver::requireActiveAuthorizedRestaurantForReservations()`. Cross-tenant reservation IDs return `404` (never `403`).

### Endpoints & Permissions

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/restaurant/reservations` | `reservations.view` | Paginated list + summary (`date`, `date_from`/`date_to`, `status`, `group`, `table_id`, `dining_area`, `search`, `sort`, `page`, `per_page`) |
| `GET` | `/api/restaurant/reservations/calendar` | `reservations.view` | Per-day counts and expected covers for `month=YYYY-MM` |
| `GET` | `/api/restaurant/reservations/{id}` | `reservations.view` | Full owner detail including `status_history` and `restaurant_settings` |
| `POST` | `/api/restaurant/reservations/{id}/approve` | `reservations.approve` | Approve `pending` → `confirmed` (or `awaiting_payment` when deposit required & `deposit_status = 'pending'`) |
| `POST` | `/api/restaurant/reservations/{id}/reject` | `reservations.reject` | Decline `pending` → `rejected` (`reason` required, 3–255 chars) |
| `POST` | `/api/restaurant/reservations/{id}/confirm-deposit` | `reservations.updateStatus` | Confirm deposit (`awaiting_payment` → `confirmed`, `deposit_status = 'paid'`) |
| `POST` | `/api/restaurant/reservations/{id}/arrived` | `reservations.manageArrival` | Mark `confirmed` → `arrived` (within `[start - 60m, end]`) |
| `POST` | `/api/restaurant/reservations/{id}/seat` | `reservations.updateStatus` | Seat `confirmed` \| `arrived` → `seated` (optional `table_id` override) |
| `POST` | `/api/restaurant/reservations/{id}/complete` | `reservations.updateStatus` | Complete `seated` → `completed` |
| `POST` | `/api/restaurant/reservations/{id}/no-show` | `reservations.manageArrival` | Mark `confirmed` \| `arrived` → `no_show` (after `start + 15m` grace; sets `no_show_marked_at` + `no_show_marked_by`) |
| `POST` | `/api/restaurant/reservations/{id}/cancel` | `reservations.updateStatus` | Cancel `pending` \| `approved` \| `awaiting_payment` \| `confirmed` \| `arrived` → `cancelled` (`reason` required) |
| `PATCH` | `/api/restaurant/reservations/{id}/table` | `reservations.assignTables` | Reassign table while `pending`..`arrived` (`{ table_id }`) |

### `allowed_actions` & `attention` Semantics

- `allowed_actions`: Server-computed array of action keys (`approve`, `reject`, `confirm_deposit`, `arrived`, `seat`, `complete`, `no_show`, `reassign_table`, `cancel`) valid at the current Asia/Manila timestamp for the reservation's status AND the authenticated user's permissions.
- `attention`: `null` | `pending_expiring` (pending within 30m of expiry) | `no_show_candidate` (confirmed/arrived at or past `start + 15m`) | `overdue_seated` (seated past `end + 60m`).

### Error Codes & Customer Notifications

| Error Code | HTTP | Trigger |
| --- | --- | --- |
| `INVALID_TRANSITION` | `409` | Action not valid from current status (including terminal statuses) |
| `RESERVATION_PASSED` | `409` | Approving a reservation whose `reservation_start` is in the past |
| `TABLE_UNAVAILABLE` | `409` | Table missing, archived, or does not fit party size |
| `SLOT_TAKEN` | `409` | Target table already has an overlapping blocking reservation |
| `TOO_EARLY` | `409` | Marking arrived/seated more than `seating_early_minutes` (60m) before start |
| `RESERVATION_ENDED` | `409` | Marking arrived/seated after `reservation_end` |
| `NO_SHOW_TOO_EARLY` | `409` | Marking no-show before `start + no_show_grace_minutes` (15m) |

**Customer Notifications Emitted (`workspace = 'customer'`, `related_entity_type = 'reservation'`):**
- `approve` → `reservation_confirmed` or `reservation_awaiting_payment`
- `reject` → `reservation_rejected` (includes reason)
- `confirm-deposit` → `reservation_confirmed`
- `complete` → `reservation_completed`
- `no-show` → `reservation_no_show`
- `cancel` → `reservation_cancelled_by_restaurant` (includes reason)
- `assignTable` → `reservation_table_changed` (only when `dining_area` changes)
- `arrived` / `seat` → none
