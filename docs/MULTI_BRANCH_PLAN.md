# SALO — Multi-Branch Restaurants Architecture & Implementation Plan

**Project:** SALO — Where Good Food Brings Us Together  
**Document Type:** Architecture Audit, Data Model, & Phased Implementation Plan  
**Status:** Revised Plan — Approved Direction (Option B) with User-Confirmed Decisions (No Code, No Migrations, No Database Changes Applied Yet)  
**Compliance:** Prepared in strict compliance with `documentation/SALO_DEVELOPMENT_RULES.md`, `documentation/SALO_BUSINESS_RULES.md`, and `documentation/requirements/RESTAURANT_SIDE.md`.

---

## Executive Summary

This document defines the architecture and phased implementation plan for **Multi-Branch Restaurant Management** in SALO:
1. An existing, approved restaurant account can add more branches later as the business expands.
2. The Partner Application Wizard (`/become-a-partner`) asks whether the restaurant already has multiple branches; if yes, the applicant enters each branch's name and location.
3. An owner with several branches can switch between branches in the Restaurant Owner Workspace and view/manage one branch at a time (plus an All-Branches summary on the Overview Dashboard).
4. Staff invitations, memberships, permissions, and workspace views work cleanly and safely per branch.

> [!IMPORTANT]
> **Planning Scope Guard:** Per task instructions and `SALO_DEVELOPMENT_RULES.md` §1.1 & §25, **no application code, migrations, database changes, or package installations** have been performed. Unrelated uncommitted working-tree changes were left untouched.

---

## STEP 0 — Codebase & Schema Audit

### 0.1 Authoritative Schema Inventory (`database/salo_db.sql`)

The authoritative schema defines **51 tables** (`database/salo_db.sql:1-1678`). Below is how each restaurant-related table currently works:

| Table (`salo_db.sql` lines) | Primary Key & Key Columns | Foreign Keys / Constraints | Current Behavior & Assumptions |
|---|---|---|---|
| `restaurants` (`188-227`) | `restaurant_id` (PK), `restaurant_name`, `registered_name`, `business_type`, `ownership_structure`, `description`, `contact_phone`, `business_email`, `address_id` (`NOT NULL`), `logo_image`, `cover_image`, `delivery_radius`, `offers_delivery`, `offers_pickup`, `offers_dine_in`, `accepts_reservations`, `accepting_orders`, `accepting_reservations`, `inventory_deduction_mode`, `reservation_min_notice_hours`, `reservation_max_party_size`, `reservation_notes`, `restaurant_status`, `is_published`, `first_published_at`, `last_published_at`, `last_published_by` | `fk_restaurants_address` → `addresses(address_id)` (`RESTRICT`); `chk_restaurants_one_service`; `chk_restaurants_required` | Combines brand/legal identity (`restaurant_name`, `registered_name`, `business_type`, `ownership_structure`, `logo_image`, `cover_image`) and single-outlet physical operation (`address_id`, `contact_phone`, `offers_*`, `accepting_*`, `restaurant_status`) in one row. |
| `restaurant_owners` (`232-240`) | Composite PK `(restaurant_id, user_id)`, `joined_at` | `fk_restaurant_owners_restaurant` (`CASCADE`), `fk_restaurant_owners_user` (`RESTRICT`) | Many-to-many join. Supports multiple owners per `restaurant_id` and multiple restaurants per `user_id`. No `UNIQUE(user_id)` constraint exists. |
| `restaurant_categories` (`245-254`) & `restaurant_category_map` (`259-266`) | `category_id` (PK); map PK `(restaurant_id, category_id)` | `fk_rcm_restaurant` (`CASCADE`), `fk_rcm_category` (`RESTRICT`) | Maps cuisine/food categories to `restaurant_id`. |
| `restaurant_staff` (`272-294`) | `staff_id` (PK), `restaurant_id`, `user_id`, `invited_by`, `staff_position` (`VARCHAR(100)`), `invitation_note`, `staff_status` (`ENUM('invited','active','inactive','declined','cancelled','expired')`), `invited_at`, `expires_at`, `responded_at`, `joined_at` | `UNIQUE KEY uk_restaurant_staff (restaurant_id, user_id)`; `fk_restaurant_staff_restaurant` (`CASCADE`) | Scoped to `restaurant_id`. Because of `uk_restaurant_staff (restaurant_id, user_id)`, a user can have at most **one** staff record per `restaurant_id`. Re-inviting after decline/cancel/expiry updates the existing row in place (`StaffInvitationService.php:154-176`). |
| `service_areas` (`305-319`) | `service_area_id` (PK), `restaurant_id`, `city_id`, `barangay_id` (`NULL` = entire city), `barangay_key` (stored generated) | `UNIQUE KEY uk_service_area (restaurant_id, city_id, barangay_key)`; `fk_service_areas_restaurant` (`CASCADE`) | Delivery coverage per `restaurant_id`, validated against `platform_service_areas`. |
| `operating_hours` (`325-339`) & `restaurant_closures` (`344-353`) | `operating_hour_id` (PK), `restaurant_id`, `day_of_week` (`0..6`), `opening_time`, `closing_time`, `closes_next_day`, `is_closed`; `closure_id` (PK), `restaurant_id`, `closure_date`, `reason` | `fk_operating_hours_restaurant` (`CASCADE`); `uk_restaurant_closure (restaurant_id, closure_date)` | Weekly schedule (supports multiple shifts per day + overnight spillover) and date-specific closures per `restaurant_id`. |
| `restaurant_tables` (`361-375`) | `table_id` (PK), `restaurant_id`, `table_name`, `seating_capacity`, `is_active` | `uk_restaurant_table_name (restaurant_id, table_name)`; `uk_restaurant_tables_id_restaurant (table_id, restaurant_id)` | Physical dining tables per `restaurant_id`. Composite unique key enforces that a reservation table belongs to the same `restaurant_id`. |
| `reservations` (`1028-1064`) | `reservation_id` (PK), `customer_id`, `restaurant_id`, `table_id` (`NULL`), `reservation_start`, `reservation_end`, `number_of_guests`, `reservation_status`, financial deposit/fee columns | Composite FK `fk_reservations_table (table_id, restaurant_id)` → `restaurant_tables (table_id, restaurant_id)` | Schema baseline and composite FK exist; reservation booking controller/service endpoints are not yet wired in `backend/routes/api.php`. |
| `restaurant_applications` (`447-488`) | `restaurant_application_id` (PK), `reference_number`, `applicant_user_id`, `restaurant_id`, `application_status`, `applicant_position`, `legal_*`, `date_of_birth`, `contact_phone`, `contact_email`, `contact_email_verified_at`, `declarations_accepted_at`, `terms_version`, `submitted_at`, `reviewer_note`, `reviewed_by`, `reviewed_at`, `decided_at` | `UNIQUE KEY uk_restaurant_applications_restaurant (restaurant_id)`; `fk_restaurant_applications_restaurant` (`RESTRICT`) | **1:1 with `restaurants`** (`restaurant_id` is `UNIQUE`). Created in the same transaction as the `restaurants` row on application submission (`RestaurantApplicationService.php:73-106`). |
| `application_documents` (`587-638`) & `application_document_requests` (`553-577`) | `document_id` (PK), `restaurant_application_id`, `rider_application_id`, `request_id`, `document_code`, `file_path`, `document_status`, `review_note` | `chk_doc_requests_one_owner`; composite FK to `(request_id, restaurant_application_id)` | Keyed to `restaurant_application_id`, not `restaurant_id`. Holds DTI/SEC/CDA, BIR 2303, Mayor's Permit, Gov ID, Proof of Address, etc. |
| `payout_accounts` (`644-661`) | `payout_account_id` (PK), `restaurant_id` (`NULL`), `rider_id` (`NULL`), `provider`, `account_type`, `account_holder_name`, `account_number_encrypted` | `UNIQUE KEY uk_payout_accounts_restaurant (restaurant_id)` | **1:1 with `restaurants`** (`uk_payout_accounts_restaurant`). Created during application submission (`RestaurantApplicationService.php:109`). |
| `menu_categories` (`673-694`), `menu_items` (`701-732`), `add_on_groups` (`737-751`), `add_on_options` (`756-769`) | `menu_category_id` (PK), `restaurant_id`, draft + `published_*` columns; `menu_item_id` (PK), `restaurant_id`, `menu_category_id`, `base_price`, `availability_status`, `approval_status`, draft + `published_*` columns | `uk_menu_category (restaurant_id, category_name)`; composite FK `fk_menu_items_category (menu_category_id, restaurant_id)` → `menu_categories (menu_category_id, restaurant_id)` | Scoped to `restaurant_id`. Uses draft-vs-published snapshot columns (`2026_11_22_000001_add_menu_publishing_columns.php`) published via `MenuPublishService`. |
| `checkouts` (`778-791`), `orders` (`799-875`), `order_items` (`880-896`), `order_item_add_ons` (`901-914`) | `checkout_id` (PK); `order_id` (PK), `checkout_id`, `restaurant_id`, `customer_id`, `reservation_id`, `restaurant_name` (snapshot), `customer_name` (snapshot), `order_reference`, `order_type`, `order_status`, `delivery_address_*` (snapshots), money totals | `uk_orders_review_ref (order_id, restaurant_id, customer_id)`; `fk_orders_restaurant` (`RESTRICT`); `fk_order_items_menu_item` (`SET NULL`) | One parent `checkouts` row groups 1..N `orders` rows (one per restaurant sub-order). `orders.restaurant_name` snapshots the storefront name at checkout (`CheckoutService.php:477`). **Note:** `orders` does not snapshot the restaurant pickup address; pickup address is joined live from `restaurants.address_id`. |
| `deliveries` (`980-1018`) & `rider_locations` (`1425-1444`) | `delivery_id` (PK), `order_id` (`UNIQUE`), `rider_id`, `delivery_status`, `cod_*`, timestamps, proof fields | `uk_deliveries_order (order_id)`; `uk_deliveries_review_ref (delivery_id, order_id, rider_id)` | Linked to `orders(order_id)`. Riders' pickup address and coordinates are resolved by joining `orders.restaurant_id` → `restaurants.address_id` → `addresses` (`RiderDeliveryService.php:88-105, 518-560`; `RiderTrackingService.php:147-174`). |
| `payments` (`920-950`), `payment_allocations` (`955-975`), `payment_events` (`1079-1093`) | `payment_id` (PK), `checkout_id`, `customer_id`, `payment_method`, `payment_type`, `payment_status`, `amount`; `allocation_id` (PK), `payment_id`, `order_id`, `reservation_id` | `fk_payment_allocations_order` (`RESTRICT`) | One COD `payments` row + one `payment_allocations` row created per `orders` row at checkout (`CheckoutService.php:523-542`). No direct `restaurant_id` column; links via `order_id` / `reservation_id`. |
| `reviews` (`1145-1195`) & `featured_restaurant_weeks` (`1598-1648`) | `review_id` (PK), `customer_id`, `restaurant_id`, `order_id` (`UNIQUE`), `rating`, `comment`, moderation columns; `featured_week_id` (PK), `restaurant_id`, evaluation window & Bayesian snapshot columns | Composite FK `fk_reviews_order (order_id, restaurant_id, customer_id)` → `orders (order_id, restaurant_id, customer_id)` | Keyed to `restaurant_id` and verified against `orders` via composite FK. |
| `audit_logs` (`1103-1119`) | `log_id` (PK), `actor_user_id`, `action`, `entity_type` (`VARCHAR(50)`), `entity_id` (`VARCHAR(100)`), `old_values` (`JSON`), `new_values` (`JSON`), `reason`, `ip_address` | `fk_audit_logs_actor` (`RESTRICT`) | Polymorphic (`entity_type` = `'restaurants'`, `'restaurant'`, `'restaurant_applications'`, `'restaurant_staff'`, `'menu_categories'`, `'menu_items'`, `'orders'`, etc.). |
| `profile_change_requests` (`1492-1513`) | `request_id` (PK), `entity_type` (`ENUM('restaurant','rider')`), `entity_id`, `requested_by_user_id`, `category`, `payload` (`JSON`), `document_paths` (`JSON`), `status` | `fk_pcr_requester`, `fk_pcr_reviewer` | Polymorphic (`entity_type = 'restaurant'`, `entity_id = restaurant_id`). Used by owners to request changes to `restaurant_name`, `registered_name`, `business_type`, `ownership_structure` (`ProfileChangeRequestService.php:22-27`). |

### 0.2 Every Table, Foreign Key, Unique Key, and Endpoint Keyed by `restaurant_id`

#### A. Tables with a `restaurant_id` column (18 tables + polymorphic references)
1. `restaurants` (`restaurant_id` PK)
2. `restaurant_owners` (`PK (restaurant_id, user_id)`, `fk_restaurant_owners_restaurant`)
3. `restaurant_category_map` (`PK (restaurant_id, category_id)`, `fk_rcm_restaurant`)
4. `restaurant_staff` (`uk_restaurant_staff (restaurant_id, user_id)`, `fk_restaurant_staff_restaurant`)
5. `service_areas` (`uk_service_area (restaurant_id, city_id, barangay_key)`, `fk_service_areas_restaurant`)
6. `operating_hours` (`idx_operating_hours_restaurant_day (restaurant_id, day_of_week)`, `fk_operating_hours_restaurant`)
7. `restaurant_closures` (`uk_restaurant_closure (restaurant_id, closure_date)`, `fk_closures_restaurant`)
8. `restaurant_tables` (`uk_restaurant_table_name (restaurant_id, table_name)`, `uk_restaurant_tables_id_restaurant (table_id, restaurant_id)`, `fk_restaurant_tables_restaurant`)
9. `restaurant_applications` (`uk_restaurant_applications_restaurant (restaurant_id)`, `fk_restaurant_applications_restaurant`)
10. `payout_accounts` (`uk_payout_accounts_restaurant (restaurant_id)`, `fk_payout_accounts_restaurant`)
11. `menu_categories` (`uk_menu_category (restaurant_id, category_name)`, `uk_menu_categories_id_restaurant (menu_category_id, restaurant_id)`, `fk_menu_categories_restaurant`)
12. `menu_items` (`fk_menu_items_restaurant`, composite `fk_menu_items_category (menu_category_id, restaurant_id)`)
13. `orders` (`uk_orders_review_ref (order_id, restaurant_id, customer_id)`, `fk_orders_restaurant`)
14. `reservations` (`fk_reservations_restaurant`, composite `fk_reservations_table (table_id, restaurant_id)`)
15. `reviews` (`fk_reviews_restaurant`, composite `fk_reviews_order (order_id, restaurant_id, customer_id)`)
16. `promos` (`fk_promos_restaurant`, nullable — `NULL` = platform-wide)
17. `ledger_entries` (`fk_ledger_entries_restaurant`, nullable)
18. `featured_restaurant_weeks` (`fk_featured_weeks_restaurant`)
19. Polymorphic references: `profile_change_requests` (`entity_type = 'restaurant'`, `entity_id = restaurant_id`), `audit_logs` (`entity_type IN ('restaurants', 'restaurant')`, `entity_id = restaurant_id`), `notifications` (`workspace = 'restaurant'`).

#### B. Exhaustive List of `restaurant_owners` Query & Insert Sites (14 Sites Across 11 Files)
A codebase search across `backend/app` identifies every single place that queries or inserts into `restaurant_owners`:

1. `backend/app/Models/User.php:109` — `resolveRoleContext()`: loads `restaurant_ownerships` for `/api/auth/me`.
2. `backend/app/Support/WorkspaceAccessResolver.php:128` — `findOwnedRestaurant()`: authorizes owner-only and owner-or-staff workspace endpoints (`OwnerProfileService`, `OwnerMenuService`, `MenuPublishService`, `OwnerInventoryService`, `RestaurantOrderService`, `OwnerReviewController`, `ProfileChangeRequestService`).
3. `backend/app/Features/Locations/Services/RestaurantLocationService.php:250` — `resolveAuthorizedRestaurant()`: authorizes `GET /api/restaurant/location`, `PATCH /api/restaurant/location`, and `PUT /api/restaurant/coverage`.
4. `backend/app/Features/Restaurants/Services/RestaurantService.php:449` — `findSetupRestaurant()`: authorizes `GET /api/restaurant/setup-status`.
5. `backend/app/Features/Restaurants/Services/StaffInvitationService.php:91` — `assertTargetUserInvitable()`: blocks inviting an existing owner of the target restaurant as staff.
6. `backend/app/Features/Restaurants/Services/StaffInvitationService.php:403` — `requireOwnedActiveRestaurant()`: authorizes `GET /api/restaurant/staff`, `POST /api/restaurant/staff/invitations`, and `POST /api/restaurant/staff/invitations/{id}/cancel`.
7. `backend/app/Features/Orders/Services/CheckoutService.php:98` — `placeOrder()`: blocks owners from checking out from their own restaurant (self-order block).
8. `backend/app/Features/Riders/Services/RiderDeliveryService.php:197` — `acceptDelivery()`: blocks riders from accepting deliveries for a restaurant they own (self-delivery block).
9. `backend/app/Features/Notifications/Services/NotificationService.php:135` — `resolveRestaurantOwnerUserIds()`: resolves owner recipients for `order_received`, `order_cancelled_by_customer`, `delivery_rider_assigned`, `staff_invitation_accepted`, and `staff_invitation_declined`.
10. `backend/app/Features/Reviews/Services/FeaturedRestaurantService.php:587` — `notifyRestaurantOwners()`: notifies owners when selected as Featured Restaurant of the Week.
11. `backend/app/Features/Admin/Services/AdminManagementService.php:397` — `attachPrimaryOwnersToRestaurants()`: attaches `owner_name` and `owner_email` to the admin restaurant list.
12. `backend/app/Features/Account/Services/AccountLifecycleService.php:267, 273` — `assertNoBlockingObligations()`: checks whether a user is the sole owner of a restaurant with active orders or pending/confirmed reservations before allowing account deactivation/deletion.
13. `backend/app/Features/Restaurants/Services/RestaurantApplicationService.php:83, 553` — inserts initial `restaurant_owners` row on application submission; checks ownership for uploading application documents.
14. `backend/app/Features/Applications/Controllers/ApplicationDocumentController.php:42` — checks ownership for streaming private application documents.

#### C. Single-Restaurant Assumptions & Bugs Found in Existing Endpoints
| File / Endpoint | Current Behavior / Assumption |
|---|---|
| `GET /api/restaurant/applications/current` (`RestaurantApplicationService.php:505-518`) | Queries `restaurant_applications WHERE applicant_user_id = $user->user_id ORDER BY submitted_at DESC LIMIT 1`. Assumes a user tracks one current application at a time. |
| `RestaurantLocationController::show()` (`GET /api/restaurant/location`) & `OwnerProfilePage.jsx:179` | Backend `RestaurantLocationController::show()` accepts `?restaurant_id=`, **but** frontend `OwnerProfilePage.jsx:179` calls `locationApiService.getRestaurantLocation()` **without passing `selectedRestaurantId`**, causing `RestaurantLocationService` to always load the first `restaurant_id` instead of the selected one. |
| `RestaurantLocationService::resolveAuthorizedRestaurant()` (`RestaurantLocationService.php:247-264`) | Queries `restaurant_owners` only, even though `/api/restaurant/location` and `/api/restaurant/coverage` in `backend/routes/api.php:213-222` are inside `Route::middleware('role:owner,staff')`. Also lacks a `restaurant_status = 'active'` check. |

### 0.3 Owner Workspace Routes, Middleware, and Staff Position Rules

1. **Middleware (`backend/routes/api.php:170-238`, `RequireRole.php:14-58`):**
   - `RequireRole` re-queries `User::query()->find(Auth::guard('web')->id())` on every request, clears the per-request WeakMap cache, forces logout if `!$freshUser->isActiveAccount()`, and checks `$freshUser->hasDerivedRole($role)`.
   - `hasDerivedRole('owner')` is true if `count($context['restaurant_ownerships']) > 0` (any status).
   - `hasDerivedRole('staff')` is true if `count($context['restaurant_staff_assignments']) > 0` (`staff_status = 'active'`).
2. **Route Group Split (`backend/routes/api.php:175-238`):**
   - **`role:owner` only (`lines 175-211`):** `/setup-status`, `/profile`, `/profile/media`, `/accepting-status`, `/settings`, `/change-requests*`, `/operating-hours`, `/menu/categories*`, `/menu/items*`, `/staff*`.
   - **`role:owner,staff` (`lines 213-237`):** `/menu/publish-status`, `/menu/preview`, `/menu/publish`, `/menu/unpublish`, `/menu/discard-changes`, `/location`, `/coverage`, `/inventory/config`, `/orders*`, `/reviews*`.
3. **Note on `CLEAN-1(d)` ("who handles orders" rule duplication & missing staff permissions):**
   - Backend `User::resolveRoleContext()` (`User.php:149-151, 204-205`) computes `can_handle_orders` and `can_publish_menu` per staff assignment, sets `'permissions' => null`, and sends `order_handler_positions` and `menu_publisher_positions` from `config/salo.php`.
   - Frontend `permissionMap.js` (`lines 67-104`) and `RestaurantAccessContext.jsx` (`lines 45-73`) maintain a second copy of position-matching logic and only map permissions for **Order Handler** and **Menu Publisher**.
   - `Inventory Manager`, `Menu Manager`, `Reservation Handler`, and `Manager` (for non-order/non-publish sections) receive **zero** corresponding permissions in `RestaurantAccessContext.jsx`, and `/menu/categories*` + `/menu/items*` are currently under `role:owner` middleware in `api.php:175-207`, blocking `Menu Manager` and `Manager` at the route level.

### 0.4 Public Restaurant Listing, Search, Detail, Cart Grouping, and Checkout

1. **Public Visibility (`PublicRestaurantVisibility.php:15-39`):** Visible iff `restaurant_status = 'active'`, `is_published = 1`, and has at least one published active `menu_categories` row containing at least one published approved non-hidden `menu_items` row.
2. **Public Listing & Search (`RestaurantService.php:68-215`):** `GET /api/restaurants` returns `restaurant_id`, `restaurant_name`, `short_address`, `offers`, computed `availability`, and `average_rating` / `review_count`.
3. **Multi-Cart Grouping & Checkout (`CartContext.jsx:356-444`, `CheckoutPage.jsx`, `CheckoutService.php`):** `CartContext` groups items by `restaurantId`. Each group in `POST /api/customer/checkout` creates one `orders` row (one sub-order = one `restaurant_id` + one destination address).

### 0.5 `RESTAURANT_SIDE.md` & `SALO_BUSINESS_RULES.md` Audit & Flagged Conflicts

1. **`documentation/requirements/RESTAURANT_SIDE.md`:**
   - **§1.2 (line 29), §2.3 (lines 94-105), §4.2 (line 228), §6.1 (line 549), §13.2 (line 1383), §13.6 (line 1424), §15.2 (line 1578), §16 (lines 1624-1665), §18 (line 1701), §21 (line 1986):** Describe a branch selector, branch-specific hours/coverage/menu availability/tables/reservations/orders/staff, distinguishing shared vs. branch-specific info, and co-owner access across branches (§16.5).
   - **§20 (line 1956):** Lists `Restaurant Locations | Whether one restaurant account can manage multiple branches` as an open decision.
2. **`documentation/SALO_BUSINESS_RULES.md`:** Does not mention `"branch"`, and defines in **Part II (§3)** that each restaurant receives its own independent sub-order, delivery coverage check, and rider pickup location.
3. **Flagged Conflicts:**
   - `RESTAURANT_SIDE.md` §20 still lists multi-branch as undecided; this plan (once approved) resolves that open decision.
   - Under `SALO_BUSINESS_RULES.md` §3, each branch must be treated as an independent sub-order fulfillment unit (an order cannot span two branches).

---

## STEP 1 — Data Model Options, Approved Choice, & Schema Specification

### 1.1 Comparison of Data Model Options

| Criterion | Option A: New `restaurant_branches` table under `restaurants` | Option B (APPROVED): Each branch is a `restaurants` row (`parent_restaurant_id` + `brand_restaurant_id` + `branch_name`) + `restaurant_application_branches` | Option C: New `restaurant_brands` parent table above `restaurants` |
|---|---|---|---|
| **Schema Footprint** | Adds `restaurant_branches` + `branch_id` FKs on 11+ operational tables (`orders`, `operating_hours`, `service_areas`, `restaurant_tables`, `reservations`, `restaurant_staff`, etc.) | Adds 3 columns to `restaurants` + 1 table (`restaurant_application_branches`) for pending applications | Adds `restaurant_brands` + moves columns/FKs off `restaurants` |
| **Composite FK Impact** | Breaks/rewrites `uk_restaurant_tables_id_restaurant`, `fk_reservations_table`, `uk_orders_review_ref`, `fk_reviews_order`, `uk_menu_category`, `uk_restaurant_staff` | **Preserves all existing composite FKs unchanged** | Moderate FK churn on `restaurant_owners`, `payout_accounts`, `restaurant_applications` |
| **Tradeoffs** | Strictly normalized brand vs. outlet, but high migration & test rewrite cost | **Accepted denormalization tradeoff:** business-level columns (`restaurant_name`, `registered_name`, `business_type`, `ownership_structure`, `description`, `business_email`, `logo_image`, `cover_image`) are duplicated on child branch rows in `restaurants` (kept synchronized by application services) | Clean brand separation, but breaks existing application/owner FKs |

**Approved Decision (Decision 1): Option B.**  
We explicitly note that Option B is **not** strict 3NF for business-level identity columns on child branch rows: columns such as `restaurant_name`, `registered_name`, `business_type`, `ownership_structure`, `description`, `business_email`, `logo_image`, and `cover_image` are duplicated on child branch `restaurants` rows as an accepted tradeoff so that all 18 operational tables and composite foreign keys continue referencing `restaurants(restaurant_id)` without structural rewrites. Application services (`ProfileChangeRequestService`, `OwnerProfileService`, `OwnerBranchService`) keep those shared columns synchronized across all rows sharing the same `brand_restaurant_id`.

### 1.2 MariaDB 10.11 Verification of `brand_restaurant_id` (Scratch DB Test Result)

> [!WARNING]
> **Scratch MariaDB Test Result (`10.11.16-MariaDB-log`):**  
> Testing `brand_restaurant_id BIGINT UNSIGNED GENERATED ALWAYS AS (IFNULL(parent_restaurant_id, restaurant_id)) STORED` on a scratch database failed with:
> `ERROR 1901 (HY000): Function or expression 'AUTO_INCREMENT' cannot be used in the GENERATED ALWAYS AS clause of 'restaurant_id'`.  
> MariaDB does **not** allow a generated column to reference an `AUTO_INCREMENT` primary key.

**Revised Design (No Generated Column on `restaurant_id`):**  
Use a **plain column** `brand_restaurant_id BIGINT UNSIGNED NULL DEFAULT NULL` on `restaurants`, populated by the application service right after `insertGetId()` (and backfilled on existing rows with `UPDATE restaurants SET brand_restaurant_id = COALESCE(parent_restaurant_id, restaurant_id)`):
- For a root/main restaurant (`parent_restaurant_id IS NULL`): `brand_restaurant_id = restaurant_id` (set immediately after `insertGetId()` inside the same `DB::transaction()`).
- For a child branch (`parent_restaurant_id = <root_id>`): `brand_restaurant_id = <root_id>` (set on `INSERT`).
- This allows `UNIQUE KEY uk_restaurants_brand_branch_name (brand_restaurant_id, branch_name)` to enforce unique branch names across **both** the root branch and all child branches at the MySQL level (while `branch_name = NULL` on single-location restaurants remains exempt because MySQL `UNIQUE` treats `NULL`s as distinct).

### 1.3 Owner Membership Strategy: Root-Only Brand Lookups vs. Copying `restaurant_owners` Rows

Comparing the two ways to represent ownership of child branches across the **14 `restaurant_owners` sites** identified in Step 0.2.B:

| Dimension | Strategy A: Owner on Root Only (`brand_restaurant_id` lookups) | Strategy B (RECOMMENDED): Copy `restaurant_owners` Rows to Each Branch |
|---|---|---|
| **Affected Existing Code Sites** | **12 of 14 sites** must be rewritten to join/resolve `brand_restaurant_id` (`User.php`, `WorkspaceAccessResolver`, `RestaurantLocationService`, `RestaurantService`, `StaffInvitationService` ×2, `CheckoutService`, `RiderDeliveryService`, `NotificationService`, `FeaturedRestaurantService`, `AdminManagementService`, `AccountLifecycleService`). | **0 of the 12 read/check sites** need `brand_restaurant_id` rewrites for ownership checks! `CheckoutService` self-order block, `RiderDeliveryService` self-delivery block, `NotificationService` owner resolution, `FeaturedRestaurantService`, `AdminManagementService`, `AccountLifecycleService` sole-owner active-order check, `StaffInvitationService`, `WorkspaceAccessResolver`, `RestaurantLocationService`, and `RestaurantService` all work immediately per branch `restaurant_id`. |
| **Sites That Need New Code** | 0 insert sites (only root gets `restaurant_owners`). | **2 branch-creation sites** (`AdminApplicationService` on approval + `OwnerBranchService` on Add Branch) copy `restaurant_owners` rows from the root restaurant to the new branch, plus a shared helper when future co-owner add/remove is implemented. |
| **Risk of Missed Check** | High — forgetting any of the 12 sites (e.g., `AccountLifecycleService` or `CheckoutService`) causes silent bugs on child branches. | Low — every `restaurant_owners` query in the codebase remains valid for every branch. |

**Recommendation:** **Strategy B — Copy `restaurant_owners` rows from the root restaurant to each child branch** upon branch creation/approval (and keep `User::resolveRoleContext()` updated to return branch metadata `parent_restaurant_id`, `brand_restaurant_id`, `branch_name`, `display_name`, `is_main_branch`).

### 1.4 Exact Schema Specification (SQL Sketch — Do Not Run)

#### 1. Alter `restaurants`
```sql
ALTER TABLE restaurants
    ADD COLUMN parent_restaurant_id BIGINT UNSIGNED NULL DEFAULT NULL
        COMMENT 'NULL = main/root restaurant row for the business; set to root restaurant_id for additional branches'
        AFTER restaurant_id,
    ADD COLUMN brand_restaurant_id BIGINT UNSIGNED NULL DEFAULT NULL
        COMMENT 'Plain column set by app: equals restaurant_id for root, or parent_restaurant_id for child branches'
        AFTER parent_restaurant_id,
    ADD COLUMN branch_name VARCHAR(150) NULL DEFAULT NULL
        COMMENT 'Branch label (e.g. Main Branch, SM North EDSA, BGC). NULL for single-location restaurants'
        AFTER restaurant_name,
    ADD KEY idx_restaurants_parent (parent_restaurant_id),
    ADD KEY idx_restaurants_brand_status (brand_restaurant_id, restaurant_status),
    ADD UNIQUE KEY uk_restaurants_brand_branch_name (brand_restaurant_id, branch_name),
    ADD CONSTRAINT fk_restaurants_parent
        FOREIGN KEY (parent_restaurant_id) REFERENCES restaurants (restaurant_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT fk_restaurants_brand
        FOREIGN KEY (brand_restaurant_id) REFERENCES restaurants (restaurant_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT chk_restaurants_no_self_parent
        CHECK (parent_restaurant_id IS NULL OR parent_restaurant_id <> restaurant_id);
```

#### 2. New Table: `restaurant_application_branches`
```sql
CREATE TABLE restaurant_application_branches (
    application_branch_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    restaurant_application_id    BIGINT UNSIGNED NOT NULL,
    branch_name                  VARCHAR(150)    NOT NULL COMMENT 'e.g. SM North EDSA Branch, BGC Branch',
    address_id                   BIGINT UNSIGNED NOT NULL COMMENT 'Normalized Philippine address + coordinates in addresses table',
    contact_phone                VARCHAR(30)     NULL DEFAULT NULL COMMENT 'Optional branch-specific phone; falls back to business phone',
    sort_order                   SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    created_branch_restaurant_id BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'Populated with the new restaurants.restaurant_id when approved',
    created_at                   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (application_branch_id),
    UNIQUE KEY uk_app_branch_name (restaurant_application_id, branch_name),
    KEY idx_app_branches_application (restaurant_application_id, sort_order),
    KEY idx_app_branches_address (address_id),
    CONSTRAINT fk_app_branches_application
        FOREIGN KEY (restaurant_application_id) REFERENCES restaurant_applications (restaurant_application_id)
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_app_branches_address
        FOREIGN KEY (address_id) REFERENCES addresses (address_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_app_branches_created_restaurant
        FOREIGN KEY (created_branch_restaurant_id) REFERENCES restaurants (restaurant_id)
        ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.5 Backfill Strategy for Existing Data

1. **Existing `restaurants` rows:** Migration sets `parent_restaurant_id = NULL`, `branch_name = NULL`, and runs `UPDATE restaurants SET brand_restaurant_id = restaurant_id WHERE brand_restaurant_id IS NULL`.
2. **When an existing single-location restaurant adds its first additional branch (Branch #2):** If the root row's `branch_name` is `NULL`, set the root row's `branch_name` to the owner-supplied `main_branch_name` (default `'Main Branch'`) in the same transaction that inserts Branch #2.
3. **Existing child rows (`orders`, `menu_*`, `restaurant_staff`, `restaurant_tables`, `operating_hours`, `service_areas`, `reviews`):** Remain pointing to the root `restaurant_id` (Main Branch) with zero ID rewriting.

### 1.6 Business-Level (Shared) vs. Branch-Level (Own) Matrix

| Domain / Attribute | Approved Scope & Behavior | Decision Ref |
|---|---|---|
| **Brand Name (`restaurant_name`), Logo (`logo_image`), Cover (`cover_image`), Description (`description`), Cuisine Categories** | **Business-level (Shared).** Inherited by child branches on creation; updates to brand assets/description on root or via `OwnerProfileService` propagate across all branches of `brand_restaurant_id`. | **Decision 2 (Approved)** |
| **Legal Identity (`registered_name`, `business_type`, `ownership_structure`) & Application Documents** | **Business-level (Shared).** Stored on root `brand_restaurant_id` and `restaurant_applications` / `application_documents`. Approved `profile_change_requests` propagate across all branches of `brand_restaurant_id`. | — |
| **Owners (`restaurant_owners`)** | **Business-level (Shared across all branches).** `restaurant_owners` rows are copied to each branch on creation/approval. | — |
| **Payout Account (`payout_accounts`)** | **Business-level (Shared).** One verified payout account on root `brand_restaurant_id`. | **Decision 3 (Approved)** |
| **Menu Categories & Items (`menu_categories`, `menu_items`, `add_on_*`), Prices & Availability** | **Cloned per-branch rows with "Copy Menu from Branch".** Each branch has independent `availability_status`, independent `MenuPublishService` publish state, and optional branch-specific prices/items. | **Decision 4 (Approved)** |
| **Branch Name (`branch_name`), Address & Map Pin (`address_id`), Contact Phone (`contact_phone`)** | **Branch-level (Own).** Each branch has its own `branch_name`, `address_id`, coordinates, and optional `contact_phone`. | **Decision 1 (Approved)** |
| **Operating Hours (`operating_hours`), Closures (`restaurant_closures`), Delivery Coverage (`service_areas`), Accepting/Service Toggles (`offers_*`, `accepting_*`)** | **Branch-level (Own).** Pausing orders or editing hours/coverage on Branch A does not affect Branch B. | — |
| **Tables (`restaurant_tables`), Reservations (`reservations`), Orders (`orders`), Order Handling, Inventory Config** | **Branch-level (Own).** `orders.restaurant_id` is the specific branch; `orders.restaurant_name` snapshots `"<Brand Name> — <Branch Name>"`. | — |
| **Staff (`restaurant_staff`)** | **Branch-level (Own per branch).** Staff are assigned to specific branches (`restaurant_staff.restaurant_id = branch.restaurant_id`). | **Decision 6 (Approved)** |
| **Reports & Activity Logs (`audit_logs`)** | **Branch-level (Own) + Business-level Rollup for Owners.** | — |

### 1.7 Partner Application Flow & Post-Approval "Add Branch" Policy

1. **Partner Application Wizard (`/become-a-partner`, Step 5 & Step 8):**
   - Step 5 (`BusinessAddressStep.jsx`) collects the Primary/Main Location as today, followed by *"Does your restaurant already have other branches?"* (`No, single location only` / `Yes, we have multiple branches`).
   - When **Yes**, the applicant enters `main_branch_name` and up to **4 additional branches** (total cap **5 branches** in the application, configurable via `config('salo.restaurants.max_application_branches', 5)`), each with `branch_name`, `PhilippineAddressFields`, `LocationPickerModal` pin, and optional `contact_phone`.
   - `RestaurantApplicationService::submit()` inserts the additional branches into `restaurant_application_branches` with normalized `addresses`.
   - `AdminApplicationService::getApplicationDetail()` and `ApplicationReviewModal.jsx` display all branches for admin verification.
   - On approval (`AdminApplicationService::decideApplication()`), each `restaurant_application_branches` row is materialized as an active (`restaurant_status = 'active'`, `is_published = 0`) child `restaurants` row with `parent_restaurant_id = root_id`, `brand_restaurant_id = root_id`, copied `restaurant_owners`, copied `restaurant_category_map`, copied `operating_hours`, and cloned initial `menu_categories` / `menu_items` (`approval_status = 'approved'`, `is_published = 0`).
2. **Post-Approval "Add Branch" Policy (Decision 5 — Approved):**
   - Approved owners can add branches up to **10 total branches per business** (`config('salo.restaurants.max_branches_per_business', 10)`, configurable).
   - New branches are created with **`restaurant_status = 'active'` and `is_published = 0`**, writing an `audit_logs` record and sending an in-app `restaurant_branch_created` notification to all active admins. The branch remains hidden from customers until its setup passes `MenuPublishService::publish()`.

---

## STEP 2 — Owner Branch Context and Switching

1. **Auth Context (`GET /api/auth/me` via `User::resolveRoleContext()`):**
   - `restaurant_ownerships` and `restaurant_staff_assignments` return `restaurant_id`, `parent_restaurant_id`, `brand_restaurant_id`, `restaurant_name`, `branch_name`, `display_name` (`"{restaurant_name} — {branch_name}"` when `branch_name` is set), `is_main_branch`, `restaurant_status`, `is_published`, and `short_address`.
2. **Request Passing & Backend Validation:**
   - Frontend passes `restaurant_id` (query/body) and optional `X-Restaurant-Id` header.
   - `WorkspaceAccessResolver` resolves the requested `restaurant_id` (defaulting to the Main Branch `parent_restaurant_id IS NULL` when omitted), verifies membership in `restaurant_owners` or active `restaurant_staff` for that exact `restaurant_id`, and enforces `restaurant_status === 'active'`.
   - Fix `OwnerProfilePage.jsx:179` so `locationApiService.getRestaurantLocation(selectedRestaurantId)` passes the selected branch ID, and update `RestaurantLocationService` to use `WorkspaceAccessResolver` (supporting `role:owner,staff` + `active` status check).
3. **Browser Persistence & Single-Branch Behavior:**
   - Remembered in `localStorage` under `salo_selected_branch_${user.user_id}`, validated against `/api/auth/me` on load (falling back to Main Branch if invalid).
   - When the user has **1 branch**, the topbar switcher dropdown stays **hidden**; when **2+ branches**, `OwnerLayout.jsx` topbar renders a Branch Switcher popover (with branch name, neighborhood, live status dot, and `+ Add New Branch` for owners).
4. **All-Branches Overview & Add Branch Flow:**
   - `OwnerDashboard.jsx` shows an **All Branches Summary** card grid when `branches.length > 1` with quick "Manage Branch →" switching.
   - `GET /api/restaurant/branches` and `POST /api/restaurant/branches` (owner-only, `active` root required, enforces `max_branches_per_business = 10`, optional `copy_operating_hours` and `copy_menu` from any existing branch of the business).

---

## STEP 3 — Staff Architecture & Authorization

1. **Per-Branch Assignment (Decision 6 — Approved):**
   - `restaurant_staff` remains keyed by `(restaurant_id, user_id)` where `restaurant_id` is the specific branch. A user can be assigned to one branch or multiple branches (with the same or different `staff_position` per branch).
   - Single-branch staff see no switcher and receive `403 Forbidden` if they query any sibling branch. Multi-branch staff see a switcher containing **only** their assigned active branches.
2. **Resolving `CLEAN-1(d)` in Phase 2b (Decision 6 — Approved):**
   - Centralize position-to-permissions in `config('salo.staff.position_permissions')` and populate `permissions` on each `restaurant_staff_assignments` entry in `User::resolveRoleContext()`.
   - Update `permissionMap.js` / `RestaurantAccessContext.jsx` to consume backend-provided `permissions` instead of duplicating position-matching rules, and move `/menu/categories*` + `/menu/items*` to `role:owner,staff` guarded by `WorkspaceAccessResolver` for `Manager` and `Menu Manager`.
3. **Branch Deactivation:**
   - Deactivating/suspending a branch preserves `restaurant_staff` rows for history while immediately blocking operational access (`403`) via `WorkspaceAccessResolver`.
4. **Authorization Matrix:**
   - **Owner (All Branches of Business):** Permitted (`200/201`) on all branches, including `POST /api/restaurant/branches`, `/api/restaurant/staff*`, and `/api/restaurant/change-requests*`.
   - **Branch Manager (Assigned Branch A):** Permitted (`200/201`) on operational endpoints for Branch A; Denied (`403`) on Branch B, branch creation, staff invitations, and verified identity change requests.
   - **Role-Specific Staff (Order Handler / Menu Manager / Inventory Manager at Branch A):** Permitted (`200`) only for their position's endpoints on Branch A; Denied (`403`) on other positions' endpoints and on Branch B.
   - **Customers / Riders / Unrelated Owners:** Denied (`403`) on all `/api/restaurant/*` workspace endpoints.

---

## STEP 4 — Impact on Other Modules

1. **Customer Side (Decision 7 — Approved):**
   - **Listings (`GET /api/restaurants` & `CustomerDashboard.jsx`):** Each active, published branch appears as its own card titled `"{restaurant_name} — {branch_name}"` with `short_address`.
   - **Detail Page (`GET /api/restaurants/{id}` & `RestaurantDetailPage.jsx`):** Displays a **Branch Switcher** banner when the business has 2+ active published branches, navigating to `/customer/restaurants/{branchId}`.
   - **Cart & Checkout (`CartContext.jsx`, `CheckoutService.php`):** Items are grouped per branch `restaurant_id`; `orders.restaurant_name` snapshots `"{restaurant_name} — {branch_name}"`. Self-order block applies across all branches owned by the user (automatic via copied `restaurant_owners` rows).
2. **Orders & Notifications:** `NotificationService::resolveRestaurantOrderHandlerUserIds($branchId)` notifies business owners + active order-handler staff assigned to **that specific branch** only.
3. **Rider Side:** `RiderDeliveryService` and `RiderTrackingService` join `orders.restaurant_id → restaurants.address_id`, automatically returning the **branch's** pickup address and GPS coordinates. Self-delivery block applies automatically via copied `restaurant_owners` rows.
4. **Admin Side:** `GET /api/admin/restaurants` displays `branch_name` and `brand_restaurant_id`; `PATCH /api/admin/restaurants/{id}/status` supports single-branch status updates plus optional `apply_to_all_branches` when targeting a root business.
5. **Reviews & Reports:** Reviews remain per branch (`reviews.restaurant_id = order.restaurant_id`); reports scope to the selected branch with an optional business-wide summary for owners.
6. **Docs to Update During Implementation:** `RESTAURANT_SIDE.md` (§16, §20), `SALO_BUSINESS_RULES.md` (§3), `docs/OWNER_WORKSPACE.md`, `docs/RESTAURANTS_API.md`, `docs/ADMIN_APPLICATION_REVIEW.md`, `docs/NOTIFICATIONS.md`, `docs/RESTAURANT_ORDERS.md`, and `database/salo_db.sql` header/proposal.

---

## STEP 5 — Risks, Edge Cases, Compatibility, & Test Plan

### 5.1 Edge Cases & Safeguards
- **Deactivating Main Branch or Last Active Branch:** Allowed (`is_published = 0` / `accepting_orders = 0`) with confirmation warning; hard deletion is blocked (`ON DELETE RESTRICT` on `fk_restaurants_parent` and `fk_orders_restaurant`) so child branches and historical orders remain intact.
- **Open Orders on Deactivated Branch:** New orders are blocked; in-flight orders remain completable by branch team/riders (`SALO_BUSINESS_RULES.md` §50, §55).
- **Duplicate Branch Names:** Blocked per business by `uk_restaurants_brand_branch_name (brand_restaurant_id, branch_name)` and `uk_app_branch_name (restaurant_application_id, branch_name)` (`422`).
- **Profile Change Requests:** Approved `profile_change_requests` on `restaurant_name`, `registered_name`, `business_type`, `ownership_structure` update all rows sharing `brand_restaurant_id` in one transaction.
- **Existing Sessions / Cached Context:** `RequireRole` reloads `User` from DB per request; `RestaurantAccessContext` validates `localStorage` selection against live `/api/auth/me` data.

### 5.2 Compatibility & Test Impact
- Single-location restaurants (`parent_restaurant_id = NULL`, `branch_name = NULL`, `brand_restaurant_id = restaurant_id`) preserve existing API request/response contracts, with additive branch metadata fields (`branch_name`, `brand_restaurant_id`, `display_name`, `is_main_branch`).
- Existing tests that assert exact payload keys on `/api/auth/me`, `/api/restaurants`, `/api/admin/restaurants`, or `/api/admin/applications/restaurant/{id}` (if using strict array equality rather than `assertJsonFragment`/`assertJsonStructure`) must be checked and updated when additive branch fields are introduced.
- `OwnerProfilePage.jsx` location fetching (`locationApiService.getRestaurantLocation`) and `RestaurantLocationService` (`role:owner,staff` + `active` guard) will change behavior for non-active restaurants (returning `403` when `restaurant_status !== 'active'`), so `LocationServicesCharacterizationTest` / `OwnerWorkspaceTest` must be verified against that guard.

### 5.3 Test Plan
- **Backend:**
  - `MultiBranchSchemaBackfillTest` (migration + `brand_restaurant_id` backfill + `uk_restaurants_brand_branch_name` uniqueness).
  - `MultiBranchAuthorizationMatrixTest` (permitted + denied matrix for Owner across branches, Manager/Order/Menu/Inventory staff on assigned vs. sibling branch, customers/riders).
  - `RestaurantApplicationWorkflowTest` & `AdminApplicationReviewTest` (multi-branch submission up to 5 branches, duplicate name `422`, approval materializing active unpublished child branches + copied owners/hours/menu).
  - `OwnerBranchManagementTest` (`POST /api/restaurant/branches`, 10-branch cap, cloning hours/menu, admin notification, audit log).
  - `MultiBranchOrderDeliveryTest` (multi-branch checkout, branch-scoped order notifications, rider branch pickup address, self-order/self-delivery block across branches).
- **Frontend:**
  - `businessApplication.test.js` (has-branches toggle, branch name/location validation, 5-branch cap).
  - `access.test.js` & `ownerWorkspace.test.js` (single-branch hidden switcher, multi-branch topbar switcher, staff switching branches updates permissions/sidebar, Add Branch modal).
  - `checkoutOrders.test.js` (branch switcher on `RestaurantDetailPage`, multi-branch cart grouping).

---

## STEP 6 — Phased Implementation Plan

Each phase is small, independently testable, and has its own approval gate. Frontend copy uses English (with at most one Tagalog phrase where already established).

| Phase | Scope & Deliverables | Approval Gate & Verification | Risk Level |
|---|---|---|---|
| **Phase 1: Schema Proposal, Migration, & Backfill** | 1. SQL proposal + Laravel migration adding `parent_restaurant_id`, `brand_restaurant_id` (plain `BIGINT UNSIGNED NULL`), `branch_name`, and `uk_restaurants_brand_branch_name` to `restaurants`, backfilling `brand_restaurant_id = COALESCE(parent_restaurant_id, restaurant_id)`, and creating `restaurant_application_branches`.<br>2. Update `database/salo_db.sql` baseline.<br>3. Run migration on `salo_test` (and `salo_db` after approval). | Schema diff review + `MultiBranchSchemaBackfillTest` passing on `salo_test`. | **Low** |
| **Phase 2a: Branch Context & Authorization Only** | 1. Update `User::resolveRoleContext()` to return `parent_restaurant_id`, `brand_restaurant_id`, `branch_name`, `display_name`, `is_main_branch`, and `short_address`.<br>2. Update `WorkspaceAccessResolver` to support `X-Restaurant-Id` header fallback and Main Branch default (`parent_restaurant_id IS NULL`).<br>3. Update `RestaurantLocationService` to use `WorkspaceAccessResolver` (supporting `role:owner,staff` + `active` status check).<br>4. Update `OwnerProfileService` & `ProfileChangeRequestService` to propagate shared brand fields (`restaurant_name`, `registered_name`, `business_type`, `ownership_structure`, `logo_image`, `cover_image`, `description`) across `brand_restaurant_id`.<br>5. Enforce single-level hierarchy (`parent.parent_restaurant_id IS NULL`) and self-parent prevention (`parent_restaurant_id <> restaurant_id`) at the service layer (Option 1, no triggers), and ensure every `restaurants` insert path (`RestaurantApplicationService::createRestaurantRecord()`, branch creation paths, test factories/helpers) sets `brand_restaurant_id` right after `insertGetId` in the same transaction. | `MultiBranchAuthorizationMatrixTest` (branch context & owner/staff isolation) + existing backend test suite passing. | **Low–Medium** |
| **Phase 2b: Permission Map (`CLEAN-1(d)`) & Menu Route Changes** | 1. Centralize canonical position-to-permissions in `config('salo.staff.position_permissions')` and populate `permissions` on `restaurant_staff_assignments` in `User::resolveRoleContext()`.<br>2. Update `permissionMap.js` & `RestaurantAccessContext.jsx` to consume backend `permissions` directly (removing duplicate frontend position-matching rules).<br>3. Move `/menu/categories*` and `/menu/items*` to `role:owner,staff` guarded by `WorkspaceAccessResolver` for `Manager` and `Menu Manager`. | Dedicated `CLEAN-1(d)` permission & menu-route test cases + frontend `access.test.js` & `restaurantOrders.test.js` passing. | **Low–Medium** |
| **Phase 3: Partner Application Wizard Branches & Admin Review** | 1. Backend: Update `SubmitRestaurantApplicationRequest`, `RestaurantApplicationService`, and `AdminApplicationService` for `has_branches`, `main_branch_name`, `branches[]` (max **5** total in application), `restaurant_application_branches`, and branch materialization + `restaurant_owners` copy on approval.<br>2. Frontend: Add branch question & repeatable branch name/location cards to `BusinessAddressStep.jsx`, summary to `ApplicationReviewStep.jsx`, and branch list to `ApplicationReviewModal.jsx`. | `RestaurantApplicationWorkflowTest`, `AdminApplicationReviewTest`, `businessApplication.test.js`, `adminApplicationReview.test.js`. | **Low** |
| **Phase 4: Owner Branch Switcher, All-Branches Overview, & "Add Branch" Flow** | 1. Backend: Add `GET /api/restaurant/branches` and `POST /api/restaurant/branches` (owner-only, max **10** branches per business configurable in `config/salo.php`, copies `restaurant_owners`, optional hours/menu cloning, admin notification, audit log).<br>2. Frontend: Upgrade `RestaurantAccessContext.jsx` (`localStorage` persistence, Main Branch default), upgrade `OwnerLayout.jsx` topbar switcher (hidden for 1 branch) + `AddBranchModal`, fix `OwnerProfilePage.jsx` location call to pass `selectedRestaurantId`, and add All-Branches summary on `OwnerDashboard.jsx`. | `OwnerBranchManagementTest`, `ownerWorkspace.test.js`, `access.test.js`. | **Low–Medium** |
| **Phase 5: Staff Management per Branch** | 1. Backend: Format branch display names in `StaffInvitationService` notifications/lists and support optional multi-branch invite targets.<br>2. Frontend: Update `TeamAndStaffPage.jsx` & `InvitationsInboxPage.jsx` with branch labels and verify multi-branch staff switcher behavior. | `StaffInvitationsTest`, `restaurantNotificationsPhase5.test.js`. | **Low** |
| **Phase 6: Customer-Side Branch Display, Detail Switcher, & Admin Multi-Branch Controls** | 1. Backend: Return `branch_name`, `brand_restaurant_id`, `display_name`, and sibling `branches` in `GET /api/restaurants` and `GET /api/restaurants/{id}`; snapshot `display_name` in `CheckoutService`; add optional `apply_to_all_branches` to `PATCH /api/admin/restaurants/{id}/status`.<br>2. Frontend: Render branch cards on `CustomerDashboard.jsx`, Branch Switcher banner on `RestaurantDetailPage.jsx`, and branch badges on `AdminRestaurantsPage.jsx`. | `PublicRestaurantsTest`, `CheckoutOrderTest`, `AdminManagementTest`, `MultiBranchOrderDeliveryTest`, `checkoutOrders.test.js`. | **Low** |

---

## Phase 1 implemented (salo_test only)

Phase 1 schema proposal (`database/proposals/2026_11_22_multi_branch_restaurants.sql`) and Laravel migration (`backend/database/migrations/2026_11_22_000002_add_multi_branch_support.php`) have been verified on a scratch MariaDB database (`_salo_scratch_multi_branch`, dropped after test) and applied to `salo_test` only (`salo_db` and `database/salo_db.sql` remain untouched).

### Applied Schema Changes

1. **`restaurants` table (3 columns, 3 indexes/unique keys, 2 foreign keys):**
   - `parent_restaurant_id BIGINT UNSIGNED NULL DEFAULT NULL` (after `restaurant_id`)
   - `brand_restaurant_id BIGINT UNSIGNED NULL DEFAULT NULL` (after `parent_restaurant_id`; remains `NULL`able permanently, backfilled for existing rows with `COALESCE(parent_restaurant_id, restaurant_id)`)
   - `branch_name VARCHAR(150) NULL DEFAULT NULL` (after `restaurant_name`)
   - `idx_restaurants_parent (parent_restaurant_id)`
   - `idx_restaurants_brand_status (brand_restaurant_id, restaurant_status)`
   - `uk_restaurants_brand_branch_name (brand_restaurant_id, branch_name)`
   - `fk_restaurants_parent`: `FOREIGN KEY (parent_restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE RESTRICT ON UPDATE RESTRICT`
   - `fk_restaurants_brand`: `FOREIGN KEY (brand_restaurant_id) REFERENCES restaurants (restaurant_id) ON DELETE RESTRICT ON UPDATE RESTRICT`
2. **`restaurant_application_branches` table (new):**
   - `application_branch_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` (PK)
   - `restaurant_application_id BIGINT UNSIGNED NOT NULL` (`fk_app_branches_application` -> `restaurant_applications.restaurant_application_id`, `ON DELETE CASCADE ON UPDATE RESTRICT`)
   - `branch_name VARCHAR(150) NOT NULL`
   - `address_id BIGINT UNSIGNED NOT NULL` (`fk_app_branches_address` -> `addresses.address_id`, `ON DELETE RESTRICT ON UPDATE RESTRICT`)
   - `contact_phone VARCHAR(30) NULL DEFAULT NULL`
   - `sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 1`
   - `created_branch_restaurant_id BIGINT UNSIGNED NULL DEFAULT NULL` (`fk_app_branches_created_restaurant` -> `restaurants.restaurant_id`, `ON DELETE SET NULL ON UPDATE RESTRICT`)
   - `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
   - `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
   - `uk_app_branch_name (restaurant_application_id, branch_name)`
   - `idx_app_branches_application (restaurant_application_id, sort_order)`
   - `idx_app_branches_address (address_id)`

### Phase 1 Schema & Testing Findings

- **MariaDB 10.11 `CHECK` Constraint Limitation (`ERROR 1901`):** Testing on `10.11.16-MariaDB-log` failed when attempting `CHECK (parent_restaurant_id IS NULL OR parent_restaurant_id <> restaurant_id)` with `ERROR 1901 (HY000): Function or expression 'AUTO_INCREMENT' cannot be used in the CHECK clause of 'restaurant_id'`. Therefore, `chk_restaurants_no_self_parent` was omitted from the SQL proposal and migration.
- **Single-Level Hierarchy & Self-Parent Prevention (Option 1 — Service-Level Check):** Enforce `parent.parent_restaurant_id IS NULL` and `parent_restaurant_id <> restaurant_id` at the service layer in Phase 2a (`AdminApplicationService` and `OwnerBranchService`), with no database triggers.
- **`brand_restaurant_id` Permanently `NULL`able + Integrity Check Replacement:** `brand_restaurant_id` stays `BIGINT UNSIGNED NULL` permanently because a root row must reference its own `AUTO_INCREMENT` `restaurant_id` (unknown before `INSERT`), and MariaDB/MySQL have no deferred FK constraints (nor can triggers bypass a `NOT NULL` self-FK on insert). `fk_restaurants_brand` (`RESTRICT`), `idx_restaurants_brand_status`, `uk_restaurants_brand_branch_name`, and the backfill `UPDATE` are all retained.
  - **Operational replacement for `NOT NULL`:** Run `SELECT COUNT(*) FROM restaurants WHERE brand_restaurant_id IS NULL` (expected `0`) or `php artisan salo:check-branch-integrity` (`backend/app/Console/Commands/CheckBranchIntegrityCommand.php`).
  - **Phase 2a insert requirement:** Every code path that inserts into `restaurants` (`RestaurantApplicationService::createRestaurantRecord()`, branch creation paths, and test factories/helpers) must set `brand_restaurant_id` right after `insertGetId` in the same transaction.

---

## Phase 2a implemented (salo_test only)

Phase 2a backend branch context, hierarchy/owner-sync helpers, authorization enforcement, and brand-level propagation have been implemented and verified on `salo_test` only (`salo_db` and `database/salo_db.sql` remain untouched; Phase 2b and frontend changes are not started).

### Implemented Components

1. **Config & Shared Branch Service:**
   - `backend/config/salo.php`: Added `salo.restaurants.max_application_branches` (`5`) and `salo.restaurants.max_branches_per_business` (`10`).
   - `backend/app/Support/RestaurantBranchService.php`: Added `createRootRestaurant()` (sets `brand_restaurant_id = restaurant_id` immediately after `insertGetId` in transaction), `createChildBranch()`, `assertValidNewBranch()` (enforcing single-level hierarchy / no grandchildren, no self-parenting, brand ID consistency, case-insensitive unique `branch_name` per brand including root's `branch_name`, and `max_branches_per_business`), Strategy B owner sync helpers (`syncOwnersFromRootToBranch()`, `addOwnerToBrand()`, `removeOwnerFromBrand()`), and `formatDisplayName()`.
   - Updated `RestaurantApplicationService::createRestaurantRecord()` and `QaNotificationsSeeder` to set `brand_restaurant_id` immediately after `insertGetId`.
2. **Role Context (`User::resolveRoleContext()`):**
   - `backend/app/Models/User.php`: Added `parent_restaurant_id`, `brand_restaurant_id`, `branch_name`, `display_name`, `is_main_branch`, and `short_address` to both `restaurant_ownerships` and `restaurant_staff_assignments`, ordered deterministically root-first (`parent_restaurant_id IS NULL`), then lowest `restaurant_id`.
3. **Centralized Branch Context & Active Guards:**
   - `backend/app/Support/WorkspaceAccessResolver.php`: Added `resolveRequestedRestaurantId()` honoring explicit `restaurant_id` (query/body) first, optional `X-Restaurant-Id` header fallback, rejecting invalid non-positive/non-integer values with `403`, and defaulting deterministically to Main Branch (`parent_restaurant_id IS NULL`, lowest `restaurant_id`) for owners and assigned branch for staff.
   - `backend/app/Features/Locations/Services/RestaurantLocationService.php` & `StaffInvitationService.php`: Replaced ad-hoc `restaurant_owners` queries (which lacked `restaurant_status = 'active'` and `X-Restaurant-Id` support) with `WorkspaceAccessResolver::requireActiveOwnedRestaurant()`.
4. **Brand-Level Propagation (Transaction-Safe):**
   - `ProfileChangeRequestService::decideChangeRequest()`: Approved `restaurant_name`, `registered_name`, `business_type`, `ownership_structure` updates propagate across all rows sharing `brand_restaurant_id`.
   - `OwnerProfileService`: `description` updates (`persistProfileUpdate()`) and `logo_image` / `cover_image` updates (`persistMediaUpdate()`) propagate across all rows sharing `brand_restaurant_id`.
5. **Extended Integrity Command:**
   - `backend/app/Console/Commands/CheckBranchIntegrityCommand.php` (`salo:check-branch-integrity`): Now also verifies single-level hierarchy (no non-root parents), child `brand_restaurant_id === parent.brand_restaurant_id`, and zero owner mismatches between child branches and their root (`Strategy B`).

---

## Phase 3a implemented (salo_test only)

Phase 3a backend multi-branch application submission, read payloads, and atomic admin approval materialization have been implemented and verified on `salo_test` only (`salo_db` and `database/salo_db.sql` remain untouched; frontend wizard/modal updates are deferred to Phase 3b).

### Implemented Components

1. **Application Submission (`POST /api/restaurant/applications`):**
   - `SubmitRestaurantApplicationRequest.php` & `RestaurantApplicationService.php`: Added optional `has_branches` (`boolean`), `main_branch_name` (required when `has_branches` is true or `branches` is non-empty, max `150`), and `branches[]` (`branch_name`, optional `contact_phone`, and full address/coordinates in the same validation shape as the main address).
   - Enforces total locations (`1 + count(branches)`) `<= config('salo.restaurants.max_application_branches', 5)` (`4` additional branches max) and case-insensitive uniqueness of branch names across `main_branch_name` and `branches[*].branch_name`.
   - Stores `restaurants.branch_name = main_branch_name` on the root row and creates a normalized `addresses` row + `restaurant_application_branches` row (`sort_order = 1..N`) for each additional branch inside the submission transaction. Single-location submissions (`has_branches` omitted/false) behave identically to before.
2. **Application Read Payloads (`GET /api/restaurant/applications/current` & `GET /api/admin/applications/restaurant/{id}`):**
   - `RestaurantApplicationService::getApplicationById()` now returns additive fields `has_branches`, `main_branch_name`, and `branches[]` (`application_branch_id`, `branch_name`, `contact_phone`, `sort_order`, `created_branch_restaurant_id`, and `address` including `latitude`/`longitude`).
3. **Admin Approval Materialization (`POST /api/admin/applications/restaurant/{id}/decision`):**
   - `AdminApplicationService::materializeApprovedApplicationBranches()` + `RestaurantBranchService::copyCategoriesAndHoursFromRoot()` + `RestaurantBranchService::cloneMenuAsUnpublishedApproved()`:
     - For each `restaurant_application_branches` row, creates an active unpublished (`restaurant_status = 'active'`, `is_published = 0`) child `restaurants` row via `RestaurantBranchService::createChildBranch()`, copies `restaurant_owners` (Strategy B), `restaurant_category_map`, and `operating_hours`, and clones initial `menu_categories`, `menu_items`, `add_on_groups`, and `add_on_options` (`approval_status = 'approved'`, `is_published = 0`, `draft_state = 'new'`).
     - Populates `restaurant_application_branches.created_branch_restaurant_id` and writes one `audit_logs` row (`action = 'restaurant_branch_created'`) per created branch containing `brand_restaurant_id` and `branch_name`.
     - Does not copy `service_areas` or create `payout_accounts` for child branches. Any failure mid-loop rolls back the entire approval transaction.
4. **Extended Integrity Command (`salo:check-branch-integrity`):**
   - Added `app branch link mismatch` check verifying every non-null `restaurant_application_branches.created_branch_restaurant_id` references an existing child `restaurants` row whose `parent_restaurant_id` and `brand_restaurant_id` match the application's root `restaurant_id`.

---

## Phase 3b implemented

Phase 3b frontend partner application wizard, applicant status view, and admin review modal updates have been implemented:

1. **Constants & Helpers (`applicationDefaults.js`, `branchHelpers.js`):**
   - Added `MAX_APPLICATION_BRANCHES = 5`, `APPLICATION_BRANCH_COPY`, `createEmptyApplicationBranch()`, and `INITIAL_APPLICATION_STATE.address.{hasBranches, mainBranchName, branches}`.
   - Added `validateAddressStep()`, `appendBranchPayloadToFormData()`, `hasEnteredBranchData()`, `formatBranchAddressSummary()`, and `extractApplicationLocations()`.
2. **Partner Application Wizard (`BusinessAddressStep.jsx`, `BusinessApplicationPage.jsx`, `ApplicationReviewStep.jsx`):**
   - Step 5 renders the **"Does your restaurant have other branches?"** toggle (`No — single location only` default; `Yes — we have multiple branches`), confirmation banner when switching back to `No` with entered data, required `Main Branch Name`, and repeatable `Additional Branches` cards reusing `PhilippineAddressFields` + `LocationPickerModal`.
   - Single-location submissions omit `has_branches` and `branches` so existing single-location payloads stay identical. Backend 422 errors (`main_branch_name`, `branches`, `branches.*.branch_name`, `branches.*.postal_code`) map to per-field errors.
   - Review Step (Section 5) displays Main Branch Name and each additional branch (name, full address, pin status, optional phone) with an Edit link back to Step 5.
3. **Applicant Status & Admin Review Modal (`BusinessApplicationStatusPage.jsx`, `ApplicationStatus.jsx`, `ApplicationReviewModal.jsx`):**
   - When `has_branches` or `branches.length > 0`, displays `Locations (N)` showing the main branch and each additional branch (name, address, coordinates, phone). Single-location applications render identically to before.

---

## Phase 4a implemented (salo_test only)

Phase 4a backend branch listing, owner Add Branch creation, delivery-coverage publish readiness guard, menu photo cross-branch protection verification, and CORS preflight verification have been implemented on `salo_test` only (`salo_db` and `database/salo_db.sql` remain untouched).

### Implemented Components

1. **Branch Endpoints (`OwnerBranchController`, `OwnerBranchService`, `StoreBranchRequest`):**
   - `GET /api/restaurant/branches` (`role:owner,staff`): Returns accessible branches (`restaurant_id`, `brand_restaurant_id`, `branch_name`, `display_name`, `is_main_branch`, `restaurant_status`, `is_published`, `short_address`, `accepting_orders`, `pending_order_count`) ordered root-first. Staff see only their active assigned branches.
   - `POST /api/restaurant/branches` (`role:owner`): Validates `branch_name`, address fields, optional `contact_phone`, service toggles, `copy_operating_hours` (default `true`), `copy_menu` (default `true`), `copy_from_restaurant_id` (default root), and `main_branch_name` (required when root `branch_name` is `NULL`). Enforces active root, `assertValidNewBranch()` (limit `10`, unique case-insensitive name), creates active unpublished child via `createChildBranch()`, copies owners (Strategy B), categories, hours, and menu (unpublished + approved), skips `service_areas` and `payout_accounts`, writes `restaurant_branch_created` audit log, and notifies active admins.
2. **Delivery Coverage Publish Readiness (`MenuPublishService`):**
   - Unpublished restaurants (`is_published = 0`) with `offers_delivery = 1` and zero `service_areas` rows are blocked (`422`) from publishing until coverage is configured. Already-published restaurants (`35` in `salo_test`) are unaffected.
3. **Menu Photo Reference Protection & CORS:**
   - Verified `OwnerMenuService::isMenuPhotoReferenced()` and `MenuPublishService::cleanupCandidatePhotos()` protect shared menu item photos (local and `gdrive:...`) across branches.
   - Verified `backend/config/cors.php` (`allowed_headers => ['*']`) allows `X-Restaurant-Id` on CORS preflight requests.
4. **Documentation:** Added [docs/BRANCHES.md](file:///c:/xampp/htdocs/Salo_Final/docs/BRANCHES.md).

---

## Approved Decisions Baseline (Decisions 1–7)

1. **Decision 1 — Core Data Model:** **Option B** — Each branch is a `restaurants` row linked to the root row via `parent_restaurant_id` + plain `brand_restaurant_id` + `branch_name` (accepting duplicated business-level columns on child rows as a tradeoff), plus `restaurant_application_branches` for pending application branches, and copying `restaurant_owners` rows to each branch on creation/approval.
2. **Decision 2 — Brand Profile Assets:** **Shared across the business** (`logo_image`, `cover_image`, `description`, cuisine categories).
3. **Decision 3 — Payout Account:** **Shared at business level** (one verified `payout_accounts` row on root `brand_restaurant_id`).
4. **Decision 4 — Menu Architecture:** **Cloned per-branch menu rows** with a *"Copy Menu from Branch"* convenience.
5. **Decision 5 — Post-Approval Add Branch Activation:** **Immediate `restaurant_status = 'active'` + `is_published = 0`** with admin notification and audit log.
6. **Decision 6 — Staff Assignment & `CLEAN-1(d)`:** **Per-branch staff assignment** (`restaurant_staff.restaurant_id = branch.restaurant_id`), with **`CLEAN-1(d)` resolved in Phase 2b** under its own approval gate.
7. **Decision 7 — Customer-Side Branch Display:** **One card per active published branch** in listings (`"{restaurant_name} — {branch_name}"`) + a **Branch Switcher** on `RestaurantDetailPage.jsx`.
8. **Branch Limits (Configurable in `backend/config/salo.php`):** Maximum **5 branches** during initial Partner Application (`max_application_branches = 5`) and maximum **10 total branches** per business (`max_branches_per_business = 10`).

---

## Remaining Open Questions

1. **Co-Owner Invitation UI:** Confirming that co-owner invitation/transfer UI (`RESTAURANT_SIDE.md` §12.12) remains out of scope for this multi-branch rollout (existing `restaurant_owners` rows are copied to new branches automatically).
2. **Documentation Updates:** `documentation/requirements/RESTAURANT_SIDE.md` §20 and `documentation/SALO_BUSINESS_RULES.md` §3 will be updated alongside Phase 1/Phase 2a to record these approved decisions.
