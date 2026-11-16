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

