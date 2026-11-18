# Order Completion, Customer Tracking & Cancellation (Step 9a)

## 1. Scope
Step 9a covers:
- **Pickup completion (restaurant side):** `POST /api/restaurant/orders/{id}/complete`
- **Cash payment collection on pickup completion:** `payments.payment_status` `pending` -> `paid` with `paid_at`
- **Customer order tracking:** real status timeline (`Pending -> Accepted -> Preparing -> Ready -> Completed`, or `Rejected` / `Cancelled`) with `Asia/Manila` timestamps and separate payment status
- **Customer cancellation (pending orders only):** `POST /api/customer/orders/{id}/cancel`

Out of scope (deferred to **Step 9b**): delivery dispatch, rider assignment, `out_for_delivery`, `delivered`, and rider delivery completion.

---

## 2. Pickup Completion (`POST /api/restaurant/orders/{id}/complete`)

- **Authorization:** Same as other restaurant order actions — the restaurant owner or active staff whose `staff_position` (trimmed, case-insensitive) is in `config('salo.orders.handler_positions')`, scoped to the **active** restaurant that owns the order. Disallowed or inactive staff receive `403`; another restaurant's order returns `404`.
- **Preconditions:** Allowed **only** when `order_status = 'ready'` and `order_type = 'pickup'`. Any other status (`pending`, `accepted`, `preparing`, `completed`, `rejected`, `cancelled`) or a `delivery` order returns `409 Conflict`.
- **Concurrency & Timestamps:** Runs inside `DB::transaction()` with `lockForUpdate()` on `orders` and the linked `payments` row, setting `orders.order_status = 'completed'` and `orders.completed_at = $now` using a single `now()` timestamp.
- **Cash Payment Update:** Updates the linked `payments` row (via `payment_allocations.order_id`) **only** when `payment_method = 'cash'` and `payment_status = 'pending'`, setting `payment_status = 'paid'` and `paid_at = $now` in the same transaction. Payments with any other status or method are never touched.
- **Audit Log:** Records `restaurant_order_completed` in `audit_logs` with `actor_user_id`, `old_values` (`order_status`, and `payment_status` if updated), and `new_values`.

---

## 3. Customer Cancellation (`POST /api/customer/orders/{id}/cancel`)

- **Authorization:** Customer may cancel **only** their own order (`404` for another user's order).
- **Preconditions:** Allowed **only** when `order_status = 'pending'`. Any other status (`accepted`, `preparing`, `ready`, `completed`, `rejected`, `cancelled`) returns `409 Conflict`.
- **Transaction:** Locks `orders` with `lockForUpdate()`, sets `order_status = 'cancelled'`, `cancelled_at = now()`, `cancelled_by = 'customer'`, and optional `cancellation_reason` (nullable, max 255 chars).
- **COD Payment:** Updates the linked `cash` + `pending` `payments` row to `payment_status = 'cancelled'`. Creates **no** refund rows because no money was collected.
- **Audit Log:** Records `customer_order_cancelled` in `audit_logs` with `actor_user_id` and old/new `order_status` + `payment_status`.

---

## 4. Timestamps & Customer Tracking Rules

- All order and payment timestamps (`placed_at`, `accepted_at`, `completed_at`, `cancelled_at`, `rejected_at`, `payment.paid_at`) are returned in consistent `Asia/Manila` ISO-8601 format (`+08:00`), including `rejected_at` (`DATETIME`).
- `Preparing` and `Ready` have no dedicated columns on `orders` and are shown in the customer timeline as reached / not reached without timestamps (not derived from `audit_logs`).
- For delivery orders, the customer timeline stops at `Ready` (plain waiting-for-rider wording) with no fake ETAs, rider names, ratings, or map locations.

---

## 5. Open Accounting Decision (Restaurant-Collected Cash)

> [!IMPORTANT]
> Step 9a creates **no** `ledger_journals`, `ledger_entries`, remittance records, refund rows, or settlement entries when a pickup order is marked paid at the restaurant counter.
> Accounting for restaurant-collected cash — including who owes whom (platform commission vs. restaurant-held cash), settlement timing, and remittance recording — remains an **open decision** to be finalized before implementing finance/ledger posting.
