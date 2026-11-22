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
