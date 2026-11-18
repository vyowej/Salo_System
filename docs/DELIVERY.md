# Rider Activation, Delivery Assignment & COD Collection (Step 9b)

## 1. Rider Activation & Workspace Access

- **Admin Activation (`POST /api/admin/riders/{id}/activate`):**
  - Admin only (`auth` + `role:admin`).
  - Allowed **only** when `riders.rider_status = 'approved'` (`409 Conflict` for any other status).
  - Blocks an admin from activating their own rider record (`403 Forbidden`).
  - Sets `rider_status = 'active'`, writes `admin_rider_activated` to `audit_logs`, and sends an in-app `rider_activated` notification (`rider` workspace) in the same transaction (see [NOTIFICATIONS.md](./NOTIFICATIONS.md)).
  - `PATCH /api/admin/riders/{id}/status` is restricted to `inactive` and `suspended` and can no longer set `active`.
- **Workspace Access:**
  - Approved riders (`rider_status = 'approved'`) may enter the rider dashboard and profile and see an **"Awaiting activation"** state.
  - All operational rider endpoints (`/api/rider/availability`, `/api/rider/deliveries/*`) require `rider_status = 'active'` and an active user account (`403` otherwise).

---

## 2. Rider Availability (Online / Offline)

- **Endpoint:** `PATCH /api/rider/availability` (`online`, `offline`, `temporarily_unavailable`).
- **Storage:** Stored in Laravel `Cache` (`rider:availability:{rider_id}`, with `CACHE_STORE=file` in `.env` and `.env.example`) because `riders` has no availability column in `database/salo_db.sql`. Adding a real availability column to `riders` is deferred to a later step.
- **"On delivery" state:** Derived from active `deliveries` rows (`delivery_status IN ('accepted', 'picked_up')`), never from the cache.
- **Rules:** Non-active riders receive `403`. A rider with an unfinished delivery cannot go offline (`409 Conflict`).

---

## 3. Delivery Assignment & Lifecycle

- **`GET /api/rider/deliveries/available`:**
  - Available only to active, online riders with no unfinished delivery (`403` otherwise).
  - Paginated, newest first (`order_status = 'ready'`, `order_type = 'delivery'`, unassigned).
  - Returns restaurant name, item count, delivery fee, order total, pickup address, drop-off address, and `placed_at`. Customer phone is **never** exposed before acceptance.
- **`POST /api/rider/deliveries/{orderId}/accept`:**
  - Locks `orders` with `lockForUpdate()`. Blocks self-orders, restaurant owners, and active restaurant staff (`403`). Enforces one unfinished delivery per rider (`409`).
  - Reuses an existing unassigned `deliveries` row (`pending_assignment` / `offered`) if present, or inserts a new row (`delivery_status = 'accepted'`). `uk_deliveries_order` duplicate-key collisions return `409 Conflict`.
- **`POST /api/rider/deliveries/{orderId}/picked-up`:**
  - Assigned rider only (`404` otherwise), requires `delivery_status = 'accepted'` and `order_status = 'ready'` (`409` otherwise).
  - Transitions `delivery_status` -> `'picked_up'` (`picked_up_at = now()`) and `orders.order_status` -> `'out_for_delivery'`.
- **`POST /api/rider/deliveries/{orderId}/delivered`:**
  - Assigned rider only (`404` otherwise), requires `delivery_status = 'picked_up'` and `order_status = 'out_for_delivery'` (`409` otherwise).
  - Transitions `delivery_status` -> `'delivered'` (`deliveries.delivered_at = now()`) and `orders.order_status` -> `'delivered'`. `orders.completed_at` remains `NULL` (moving `delivered -> completed` is not built in Step 9b).
- **Timestamps:** All timestamps are returned in consistent `Asia/Manila` ISO-8601 format (`+08:00`) via `OrderTimestampFormatter`. Customer and restaurant views read the delivered time from `deliveries.delivered_at` and see only the assigned rider's `first_name`.

---

## 4. COD Collection

- On `delivered` for a linked `payments` row with `payment_method = 'cash'` and `payment_status = 'pending'`:
  - Request must include `collected_amount` matching the exact payment amount (`422` if missing, zero, or mismatched).
  - In the same transaction (`lockForUpdate()`), using a single `now()`:
    - Updates `payments` to `payment_status = 'paid'`, `paid_at = $now`.
    - Updates `deliveries` with `cod_amount_collected`, `cod_collected_at = $now`, `cod_remittance_status = 'pending'`.
    - Leaves `cod_remitted_at` and `cod_confirmed_by` `NULL`.
- Non-cash or already-paid payments are never touched. No rider earnings, ledger journals, remittance confirmations, or settlement rows are created.

---

## 5. Open Items (Out of Scope for Step 9b)

- Real `riders` availability column (currently using Laravel `Cache`)
- Failed delivery handling
- Admin reassignment of deliveries
- Rider who accepts a delivery but never picks it up
- Proof of delivery (photo, recipient signature, or PIN)
- `delivered` -> `completed` order transition
- Rider earnings and payouts
- Admin COD remittance confirmation
- Delivery offers, response windows, auto-dispatch, shifts, GPS, and zone checks
