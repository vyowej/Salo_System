# SALO Owner Workspace (Profile, Hours, Toggles, & Menu Management)

## 1. Access & Authorization Rules

- Restaurant workspace endpoints live under `/api/restaurant/*`:
  - **Owner-only (`role:owner` + `WorkspaceAccessResolver::requireActiveOwnedRestaurant`):** `/setup-status`, `/profile*`, `/accepting-status`, `/settings`, `/change-requests*`, `/operating-hours`, `/staff*`, `POST /branches`, and `/location` + `/coverage` (`RestaurantLocationService` enforces owner-only).
  - **Owner & authorized staff (`role:owner,staff` + position-scoped `WorkspaceAccessResolver` guards):**
    - `GET /branches` (owner + all active staff, scoped to assigned branches).
    - `GET /menu/categories`, `GET /menu/items`: `requireActiveAuthorizedRestaurantForMenuView` (owner, `Manager`, `Menu Manager`, `Inventory Manager`).
    - Mutating `/menu/categories*` and `/menu/items*`: `requireActiveAuthorizedRestaurantForMenuManage` (owner, `Manager`, `Menu Manager`).
    - `/menu/publish-status`, `/menu/preview`, `/menu/publish`, `/menu/unpublish`, `/menu/discard-changes`: `requireActiveAuthorizedRestaurantForMenuPublish` (owner, `Manager`).
    - `/orders*` & `/reviews*`: `requireActiveAuthorizedRestaurantForOrders` (owner, `Manager`, `Order Handler`, `Order Staff`).
    - `/inventory/config`: `requireActiveAuthorizedRestaurantForInventory` (owner, `Manager`, `Inventory Manager`).
- **Single Source of Truth (`CLEAN-1(d)`):** `backend/config/salo.php` (`salo.staff.position_permissions`) defines the canonical position-to-permission map, from which `orders.handler_positions`, `inventory.manager_positions`, and `menu.publisher_positions` are derived. `User::resolveRoleContext()` returns `permissions` on `/api/auth/me`, and `RestaurantAccessContext.jsx` consumes them directly.
- **Active-Restaurant Guard:** Requires `restaurants.restaurant_status === 'active'` and active `restaurant_staff.staff_status === 'active'` on the requested branch (`403 Forbidden` otherwise). `OwnerLayout.jsx` renders an application-status gate whenever `selectedRestaurant.status !== 'active'`.

---

## 2. Endpoints

### Business Profile, Branding & Accepting Toggles
- `GET /api/restaurant/profile?restaurant_id=...`
- `PATCH /api/restaurant/profile` — updates `description`, `contact_phone`, `business_email`, `offers_delivery`, `offers_pickup` (requires at least one of `offers_delivery` or `offers_pickup` enabled). `restaurant_name`, `registered_name`, and `address_id` are non-editable.
- `POST /api/restaurant/profile/media` — `multipart/form-data` for `logo_image`, `cover_image`, `remove_logo`, `remove_cover`. Uses `FileStorageService` (`public` disk, relative paths in DB, 5 MB max, `jpg`/`jpeg`/`png`/`webp`, real image check, safe unreferenced deletion).
- `PATCH /api/restaurant/accepting-status` — updates `accepting_orders` and `accepting_reservations` separately.

### Operating Hours
- `GET /api/restaurant/operating-hours?restaurant_id=...`
- `PUT /api/restaurant/operating-hours` — replaces weekly `operating_hours` rows in a transaction. Supports multiple periods per day and overnight hours (`closes_next_day = true`). Rejects `opening_time === closing_time`, non-overnight `closing_time <= opening_time`, same-day overlaps, and overnight spillover overlaps into the next day.

### Menu Management
- `GET /api/restaurant/menu/categories`, `POST /api/restaurant/menu/categories`, `PATCH /api/restaurant/menu/categories/{id}`, `PUT /api/restaurant/menu/categories/reorder`, `DELETE /api/restaurant/menu/categories/{id}`
  - Deleting a category that still has `menu_items` returns **`409 Conflict`**; archive via `is_active = false` instead.
- `GET /api/restaurant/menu/items`, `POST /api/restaurant/menu/items`, `POST|PATCH /api/restaurant/menu/items/{id}`, `PATCH /api/restaurant/menu/items/{id}/availability`, `DELETE /api/restaurant/menu/items/{id}`
  - Validates `item_name`, `base_price > 0` (max 2 decimal places), `menu_category_id` belonging to the same restaurant, and optional `photo` (5 MB, `FileStorageService`).
  - Owner-created items on an active restaurant are set to `approval_status = 'approved'` immediately.
  - Deleting an item referenced by `order_items` is refused with **`409 Conflict`** (set `availability_status = 'hidden'` instead).

---

## 3. Availability States & Public Visibility

- Supported `menu_items.availability_status` values: `available`, `sold_out`, `temporarily_unavailable`, `hidden`.
- On `GET /api/restaurants/{id}/menu`: `hidden` items and items under `is_active = 0` categories are **excluded**; `available`, `sold_out`, and `temporarily_unavailable` items are returned with their status.

---

## 4. Open Policy Questions

- Whether editing `restaurant_name`, `registered_name`, or `address_id` requires admin re-approval (kept non-editable).
- Whether `accepts_reservations`, `offers_dine_in`, and `reservation_*` fields require a separate reservation policy before owner editing.
- Whether owner-created menu items on an already active restaurant should require admin approval (currently auto-approved).
- Category limits, max items per restaurant, max photos per item (1 per item in schema), and `restaurant_closures` management.
- Unbacked UI fields (`discountedPrice`, `preparationInfo`, `dietaryInfo`) have no columns in `menu_items` and are disabled as "Coming soon".
