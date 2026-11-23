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

## Admin Branch Status & Public Visibility (Phase 6a)

- `GET /api/admin/restaurants` returns `branch_name`, `parent_restaurant_id`, `brand_restaurant_id`, `is_main_branch`, and `branch_count`, and searches `branch_name`.
- `PATCH /api/admin/restaurants/{id}/status` updates only `{id}` by default. Passing `apply_to_all_branches: true` is valid only when `{id}` is the root (`parent_restaurant_id === null`, returning `422` on child branches) and updates all branches sharing `brand_restaurant_id` in one transaction with an `audit_logs` row per affected restaurant.

## Branch Permits (Permit-2a)
- `POST /api/restaurant/branches`: accepts optional `mayors_permit` (`file|mimes:pdf,jpg,jpeg,png|max:10240`) or `is_required_locally=false` with `exemption_reason` (10–500 chars). With either, the child branch's `branch_permits` row is created as `pending_review` and active admins are notified. With neither, the child branch is created with `permit_status = 'pending_submission'`. On DB failure after file upload, only the newly uploaded file is removed. Branch limit counts branches in any permit state.
- `POST /api/restaurant/branches/{id}/permit`: owner-only (`role:owner`) endpoint to submit or update a non-root branch permit (`mayors_permit` OR `is_required_locally=false` + `exemption_reason`). Allowed from `pending_submission`, `additional_info_required`, or `rejected`; returns `409 Conflict` from `pending_review`, `under_review`, `approved`, or `waived` (except idempotent identical retry when already `pending_review`). Retains previously uploaded private files on disk and logs old/new `file_path` in `audit_logs`.
- `GET /api/restaurant/branches/{id}/permit/file`: streams the stored private permit file; accessible only to owners of the branch's business and active admins (`403` for staff/managers/other businesses).
- `GET /api/restaurant/branches` and `GET /api/auth/me`: include `permit_status`, `is_required_locally`, `review_note`, and `uploaded_at` only on non-root branches where the authenticated user is an owner (omitted for staff and root branches).
- Fail-closed guards: non-root branches without an `approved` or `waived` `branch_permits` row are excluded from public restaurant listings, detail `siblings[]`, cart/checkout, and cannot be published (`422` blocker `"Branch Mayor's / Business Permit must be verified or waived before publishing."`). Transitioning a branch permit away from `approved` or `waived` resets `restaurants.is_published = 0` in the same transaction.

## Admin Branch Permits Review (Permit-2b)
- Admin endpoints (`auth`, `role:admin`, self-review blocked `403`):
  - `GET /api/admin/branch-permits`: paginated queue (`status`, `search`, `submitted_date`, `per_page`).
  - `GET /api/admin/branch-permits/{permitId}`: detail with `review_note`, `has_file`, and `file_url` (only when a file exists).
  - `GET /api/admin/branch-permits/{permitId}/file`: admin-only private file stream (`404` when missing).
  - `POST /api/admin/branch-permits/{permitId}/start-review`: `pending_review` / `additional_info_required` / `rejected` → `under_review` (`409` from `pending_submission`, `approved`, `waived`).
  - `POST /api/admin/branch-permits/{permitId}/approve`: `pending_review` / `under_review` / `additional_info_required` / `rejected` → `approved` (does **not** set `is_published = 1`).
  - `POST /api/admin/branch-permits/{permitId}/reject`: requires `review_note` (10–500 chars) → `rejected` (unpublishes if leaving `approved`/`waived`).
  - `POST /api/admin/branch-permits/{permitId}/request-info`: requires `review_note` (10–500 chars) → `additional_info_required` (unpublishes if leaving `approved`/`waived`).
  - `POST /api/admin/branch-permits/{permitId}/waive`: requires `is_required_locally = false` (else `422`) and `review_note` (10–500 chars) → `waived`.
  - `POST /api/admin/branch-permits/{permitId}/reopen`: requires `approved` or `waived` (else `409`) and `review_note` (10–500 chars) → `under_review` (sets `is_published = 0`).
- `GET /api/admin/restaurants`: includes `permit_status` and `is_required_locally` for all rows (non-root from `branch_permits`; root derived read-only from latest `mayors_permit` in `application_documents`, `'not_submitted'` when none).
- Notifications (`branch_permit_submitted`, `branch_permit_approved`, `branch_permit_rejected`, `branch_permit_info_requested`, `branch_permit_waived`, `branch_permit_reopened`): `submitted` notifies active admins (`workspace = 'admin'`), while admin decisions notify business owners (`workspace = 'restaurant'`) or the applicant (`workspace = 'customer'`) when the branch's application is not yet approved. Notification API payloads (`GET /api/notifications`, `POST /api/notifications/{id}/read`) preserve `related_entity_type = 'branch_permits'` and `related_entity_id = permit_id`, and include `restaurant_id` (when the branch `restaurants` row exists), `application_id` (`int|null`, always present), and `application_branch_id` (`int|null`, always present) at the top level of the notification object; file paths are never included.

## Initial Application Two-Step Branch Permits (Permit-3)
- `POST /api/restaurant/applications`: each `branches[i]` entry accepts optional `permit_required_locally` (`boolean`, default `true`) and `permit_exemption_reason` (required 10–500 chars when `false`). Creates a `branch_permits` row (`restaurant_id = NULL`, `application_branch_id` set) in the same transaction (`pending_submission` when required, `pending_review` when exempt). Main branch `mayors_permit` remains mandatory in `application_documents`. If the same applicant already has an active (non-terminal, i.e., not `approved` or `rejected`) restaurant application, the endpoint returns `409 Conflict` with `code = 'ACTIVE_APPLICATION_EXISTS'` and `data.restaurant_application_id` / `data.application_id` pointing to the existing application, without creating a second application, `restaurants` row, or branch rows.
- `POST /api/restaurant/applications/{applicationId}/branches/{applicationBranchId}/permit`: applicant-only (`403` otherwise) per-branch permit upload (`<= 10 MB`, real content check) or exemption update. Allowed while application is non-terminal and permit is in `pending_submission`, `additional_info_required`, or `rejected`. Returns `409` once approved/materialized (pointing to `POST /api/restaurant/branches/{id}/permit`). Identical retries are idempotent by SHA-256 content hash (or exact exemption text).
- `GET /api/restaurant/applications/{applicationId}/branches/{applicationBranchId}/permit/file`: applicant-only private file stream (`404` when no file, `403` for other users).
- `GET /api/restaurant/applications/current`: returns `permit_id`, `permit_status`, `is_required_locally`, `exemption_reason`, `review_note`, and `has_file` on each `branches[]` item (never `file_path`).
- Phase 3a materialization (`AdminApplicationService::decide`) reuses each `application_branch_id`'s existing `branch_permits` row by setting `restaurant_id` without creating a duplicate row. Business approval never depends on branch permit statuses.
