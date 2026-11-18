# Restaurant Order Handling & Checkout Follow-ups (Step 8b)

## 1. Overview

Step 8b implements owner/staff order handling for active restaurants and completes three Step 8a checkout safety follow-ups:
- **Expected total check** (`expected_total` per group, HTTP `409` on mismatch with server-computed totals).
- **Self-order block** (owners and active restaurant staff cannot check out from their own restaurant).
- **Idempotency duplicate-key safety** (application-level handling of `uk_checkouts_idempotency` collisions without schema changes).
- **Restaurant Order Handling** (`GET /api/restaurant/orders`, `GET /api/restaurant/orders/{id}`, and `POST /api/restaurant/orders/{id}/{accept,reject,prepare,ready}`).

---

## 2. Step 8a Follow-ups

### 2.1 Expected Total Verification
- Each group in `POST /api/customer/checkout` accepts an optional `expected_total` (numeric, `>= 0`).
- The backend still computes all item prices, subtotals, delivery fees, and totals authoritatively from the database (`menu_items.base_price` and `config('salo.orders.flat_delivery_fee')`, configured via `SALO_FLAT_DELIVERY_FEE=49.00`).
- If any group's `expected_total` differs from the backend-computed total, checkout aborts **before writing anything** and returns HTTP `409` with `data.groups` containing the computed `subtotal_amount`, `delivery_fee`, and `total_amount` per restaurant.
- The customer `CheckoutPage` displays `"Prices changed, please review"`, updates the displayed totals, and lets the customer confirm again.

### 2.2 Self-Order Block
- During checkout validation, a user who owns the target restaurant (`restaurant_owners.user_id`) or works there as active staff (`restaurant_staff.user_id` with `staff_status = 'active'`) is blocked with a per-group `422` validation error.

### 2.3 Idempotency Index Recommendation
- In `database/salo_db.sql`, `checkouts` currently defines `UNIQUE KEY uk_checkouts_idempotency (idempotency_key)` globally rather than a composite unique key on `(customer_id, idempotency_key)`.
- Per the no-schema-change constraint, the schema was left untouched. `CheckoutService` catches `QueryException` (`23000` / MySQL `1062`): if the existing `checkouts` row belongs to the same `customer_id`, it returns the original checkout; if it belongs to a different user, it returns HTTP `409`.
- **Schema recommendation:** In a future migration, replace `uk_checkouts_idempotency (idempotency_key)` with `UNIQUE KEY uk_checkouts_customer_idempotency (customer_id, idempotency_key)` so idempotency keys are scoped per customer at the database level.

---

## 3. Restaurant Order Endpoints

All routes are under `/api/restaurant/orders` with `auth` + `role:owner,staff` middleware. `RestaurantOrderService` verifies that the authenticated user is either:
- the restaurant owner (`restaurant_owners.user_id`), or
- an active staff member (`restaurant_staff.user_id` with `staff_status = 'active'`) whose `staff_position` (case-insensitive, trimmed) is listed in `config('salo.orders.handler_positions')` (`Manager`, `Order Handler`, `Order Staff`),
and that the target restaurant has `restaurant_status = 'active'` (non-active restaurants, inactive staff, and other positions such as `Reservation Handler`, `Inventory Manager`, `Menu Manager`, or custom positions receive `403`).

The backend exposes `order_handler_positions` (from `config('salo.orders.handler_positions')`) and `can_handle_orders` in the auth payload so the frontend derives order UI visibility and action permissions from the same single config source without hardcoding a duplicate list.

> [!NOTE]
> **Future Team and Staff rule:** When the Team and Staff management feature is built, only the restaurant owner may assign the `Manager` position, and staff position names must come from a fixed list (not arbitrary free-text input).

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/restaurant/orders` | Paginated list (`page`, `per_page`), newest first, optional `status` filter, scoped to the restaurant |
| `GET` | `/api/restaurant/orders/{id}` | Order detail: items, snapshots, fulfillment, delivery address, payment status, customer name & phone (`404` if another restaurant's order) |
| `POST` | `/api/restaurant/orders/{id}/accept` | Transition `pending` -> `accepted` |
| `POST` | `/api/restaurant/orders/{id}/reject` | Transition `pending` -> `rejected` (requires `reason`; HTTP `422` if missing) |
| `POST` | `/api/restaurant/orders/{id}/prepare` | Transition `accepted` -> `preparing` |
| `POST` | `/api/restaurant/orders/{id}/ready` | Transition `preparing` -> `ready` |
| `POST` | `/api/restaurant/orders/{id}/complete` | Transition `ready` (`pickup` only) -> `completed` and mark pending cash payment `paid` |

---

## 4. Enforced Status Transition Table

| Current `order_status` | Allowed Next Status | Actor & Endpoint / Rule |
| --- | --- | --- |
| `pending` | `accepted` | Restaurant (`POST /api/restaurant/orders/{id}/accept`) |
| `pending` | `rejected` | Restaurant (`POST /api/restaurant/orders/{id}/reject`, reason required) |
| `pending` | `cancelled` | Customer (`POST /api/customer/orders/{id}/cancel`, optional reason) |
| `accepted` | `preparing` | Restaurant (`POST /api/restaurant/orders/{id}/prepare`) |
| `preparing` | `ready` | Restaurant (`POST /api/restaurant/orders/{id}/ready`) |
| `ready` | `completed` | Restaurant (`POST /api/restaurant/orders/{id}/complete`, `pickup` orders only; `delivery` returns `409`) |
| `completed` | *(Terminal)* | — |
| `rejected` | *(Terminal)* | — |
| `cancelled` | *(Terminal)* | — |

- Any transition outside this table (including double-accept, acting on a `cancelled` or `rejected` order, or calling `/complete` on a `delivery` order) returns HTTP `409 Conflict`.
- `Out for Delivery` and rider delivery completion remain out of scope (deferred to Step 9b). See [ORDER_COMPLETION.md](./ORDER_COMPLETION.md) for pickup completion and customer cancellation details.

---

## 5. Concurrency, Audit Logging & COD Payment Behavior

- **Row Locking:** Every status transition runs inside `DB::transaction()` and locks the target `orders` row using `lockForUpdate()`, re-checking `order_status` after acquiring the lock to prevent race conditions.
- **Rejection Fields:** Rejecting an order sets `order_status = 'rejected'`, `rejection_reason`, and `rejected_at` on `orders` (satisfying `chk_orders_rejection_reason`).
- **Audit Logs:** Every transition writes an `audit_logs` entry (`restaurant_order_accepted`, `restaurant_order_rejected`, `restaurant_order_preparing`, `restaurant_order_ready`) recording `actor_user_id`, `entity_type = 'orders'`, `entity_id`, and metadata (`old_values`, `new_values`, and `reason` on reject). When a COD payment is cancelled on reject, `old_values.payment_status` (`pending`) and `new_values.payment_status` (`cancelled`) are included.
- **COD Payment Behavior:** Rejecting an order updates the linked `payments` row (via `payment_allocations.order_id`) from `pending` to `cancelled` **only** when `payment_method = 'cash'` and `payment_status = 'pending'`, inside the same database transaction. Payments with any other status or method are never touched, and no `refund` rows are created because no money was collected.
