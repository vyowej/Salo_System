# SALO Multi-Branch Restaurant API

## 1. Endpoints

All endpoints below are under `/api/restaurant` and require `auth` middleware.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/restaurant/branches` | `role:owner,staff` | List all branches the caller owns or is actively assigned to as staff, ordered root-first then lowest `restaurant_id`. |
| `POST` | `/api/restaurant/branches` | `role:owner` | Create a new child branch under the owner's active main (root) restaurant. |

---

### `GET /api/restaurant/branches`

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Accessible branches retrieved.",
  "data": {
    "branches": [
      {
        "restaurant_id": 101,
        "parent_restaurant_id": null,
        "brand_restaurant_id": 101,
        "branch_name": "Main Branch",
        "display_name": "Salo Bistro — Main Branch",
        "is_main_branch": true,
        "restaurant_status": "active",
        "is_published": true,
        "short_address": "Diliman, Quezon City",
        "accepting_orders": true,
        "pending_order_count": 2
      },
      {
        "restaurant_id": 102,
        "parent_restaurant_id": 101,
        "brand_restaurant_id": 101,
        "branch_name": "BGC Branch",
        "display_name": "Salo Bistro — BGC Branch",
        "is_main_branch": false,
        "restaurant_status": "active",
        "is_published": false,
        "short_address": "Fort Bonifacio, Taguig City",
        "accepting_orders": true,
        "pending_order_count": 0
      }
    ]
  }
}
```

---

### `POST /api/restaurant/branches`

- **Required:** `branch_name` (max 150), `province`, `city`, `barangay`.
- **Optional:** `main_branch_name` (required when the root restaurant's `branch_name` is `NULL`), `contact_phone` (defaults to root), `street` (`nullable|string|max:255`, matching the partner application wizard), `house_number`, `building_name`, `landmark`, `postal_code` (4 digits), `latitude` & `longitude` (both or neither; `latitude` `-90..90`, `longitude` `-180..180`), `offers_delivery`, `offers_pickup`, `offers_dine_in`, `accepts_reservations`, `copy_operating_hours` (default `true`), `copy_menu` (default `true`), `copy_from_restaurant_id` (default root `restaurant_id`, must belong to the same `brand_restaurant_id`).
- **Business Rules:**
  - Root restaurant must be `active` (`403` otherwise). Staff/Manager callers receive `403`.
  - At least one of `offers_delivery`, `offers_pickup`, or `offers_dine_in` must remain enabled (`422` on `offers_delivery`).
  - Total branches per business (`brand_restaurant_id`) must be `< config('salo.restaurants.max_branches_per_business', 10)` (`422`).
  - `branch_name` must be unique case-insensitively across all branches of the brand, including the root's `branch_name` (`422`).
  - Creates the child row with `restaurant_status = 'active'` and `is_published = 0`.
  - Copies `restaurant_owners` (Strategy B), `restaurant_category_map`, and (when enabled) `operating_hours` + unpublished approved menu (`menu_categories`, `menu_items`, `add_on_groups`, `add_on_options`).
  - Does **not** copy `service_areas` (configured per branch) or create `payout_accounts` (shared with root).
  - Records `audit_logs` (`action = 'restaurant_branch_created'`) and notifies active admins.

**Success Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Branch created successfully.",
  "data": {
    "branch": {
      "restaurant_id": 102,
      "parent_restaurant_id": 101,
      "brand_restaurant_id": 101,
      "branch_name": "BGC Branch",
      "display_name": "Salo Bistro — BGC Branch",
      "is_main_branch": false,
      "restaurant_status": "active",
      "is_published": false,
      "short_address": "Fort Bonifacio, Taguig City",
      "accepting_orders": true,
      "pending_order_count": 0
    }
  }
}
```

**Error Shapes:**
- **`422 Unprocessable Entity` (validation / duplicate / limit):**
```json
{
  "success": false,
  "message": "The given data was invalid.",
  "errors": {
    "branch_name": [
      "A branch named \"BGC Branch\" already exists for this business."
    ]
  }
}
```
- **`403 Forbidden` (staff caller, outsider, or inactive root):**
```json
{
  "success": false,
  "message": "Forbidden: insufficient role permissions."
}
```
- **`401 Unauthenticated`:** `{ "success": false, "message": "Unauthenticated." }`
- **`409 Conflict`:** Returned on invalid state transitions in sibling workspace endpoints (e.g., invalid order status transitions in `RestaurantOrderService`).

---

## 2. Selecting a Branch

`WorkspaceAccessResolver::resolveRequestedRestaurantId()` resolves the target branch on every owner/staff workspace request in this exact precedence order:
1. **Explicit `restaurant_id` parameter** (query parameter or JSON/form body, depending on endpoint) — always wins if present.
2. **`X-Restaurant-Id` HTTP header** — used when no explicit `restaurant_id` parameter is sent.
3. **Deterministic default** (when both are omitted):
   - **Owners:** Main branch (`parent_restaurant_id IS NULL`) first, then lowest `restaurant_id`.
   - **Staff:** First active assigned branch (`restaurant_staff.staff_status = 'active'`), ordered root-first then lowest `restaurant_id` (staff never default to an unassigned root or sibling branch).

**Invalid / Unauthorized Values:**
- Non-numeric, zero, or negative `restaurant_id` or `X-Restaurant-Id` -> **`403 Forbidden`**.
- Valid integer `restaurant_id` that the caller does not own or actively staff (or lacks the required position for) -> **`403 Forbidden`**.
- Accessible branch whose `restaurant_status !== 'active'` -> **`403 Forbidden`**.

### Owner/Staff Workspace Endpoints & Parameter Acceptance

All endpoints below honor the **`X-Restaurant-Id` header** via `WorkspaceAccessResolver`:

| Endpoint Group | `GET` Query `restaurant_id` | Mutating Body `restaurant_id` | Notes |
| --- | --- | --- | --- |
| `/api/restaurant/setup-status`, `/profile`, `/settings`, `/operating-hours` | Yes | Yes (except `POST /profile/media` uses query/input) | Owner-only (`role:owner`) |
| `/api/restaurant/change-requests` | Yes | Yes | Owner-only (`role:owner`) |
| `/api/restaurant/menu/categories*`, `/menu/items*` | Yes | Yes | Owner-only (`role:owner`) |
| `/api/restaurant/staff*` | Yes | Yes | Owner-only (`role:owner`) |
| `/api/restaurant/menu/publish*`, `/menu/unpublish`, `/menu/discard-changes` | Yes | Yes | `role:owner,staff` (`Manager` for staff) |
| `/api/restaurant/location`, `/coverage` | Yes | Yes | `role:owner,staff` (requires ownership in `RestaurantLocationService`) |
| `/api/restaurant/inventory/config` | Yes | Yes | `role:owner,staff` (`Manager` / `Inventory Manager`) |
| `/api/restaurant/orders*` | Yes | Yes (orders actions scope by `order_id` or `restaurant_id`) | `role:owner,staff` (`Manager` / `Order Handler` / `Order Staff`) |
| `/api/restaurant/reviews*` | Yes | Yes (`reviewId` scoped via `WorkspaceAccessResolver`) | `role:owner,staff` |

---

## 3. Publishing Readiness & CORS

- **Delivery Coverage Readiness (`MenuPublishService`):** Whenever a restaurant is currently unpublished (`is_published = 0`) — including the **first publish** of any restaurant (root or child branch) — and has `offers_delivery = 1` with zero `service_areas` rows, `POST /api/restaurant/menu/publish` is blocked (`422`) until at least one service area is configured (or delivery is disabled).
  - **Already-published restaurants (`is_published = 1`):** Unaffected when republishing menu edits (`35` such restaurants exist in `salo_test`).
  - **Previously published, later unpublished (`first_published_at IS NOT NULL AND is_published = 0`) with no coverage:** Because the guard checks `! (bool) $restaurant->is_published`, re-publishing after unpublishing is also blocked until at least one service area is configured (or delivery is disabled). In `salo_test`, there are **0** such restaurants.
- **CORS:** `X-Restaurant-Id` is permitted by `backend/config/cors.php` (`allowed_headers => ['*']`) for preflight (`OPTIONS`) requests from configured `CORS_ALLOWED_ORIGINS`.
