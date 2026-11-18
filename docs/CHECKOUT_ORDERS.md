# SALO Checkout & Order Creation (COD Only)

## 1. Endpoints

All endpoints require `auth` middleware.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/customer/checkout` | Validate cart groups, compute totals on the backend, and create checkout + per-restaurant orders + COD payments in one transaction. |
| `GET` | `/api/customer/orders` | Paginated list of the authenticated customer's orders (`page`, `per_page`, optional `status`), newest first. |
| `GET` | `/api/customer/orders/{id}` | Order detail with item snapshots, fee, subtotal, total, address snapshot, payment status, and restaurant logo URL. Returns `404` if not owned by the user. |

---

## 2. Request & Response Shapes

### `POST /api/customer/checkout`
```json
{
  "payment_method": "cod",
  "idempotency_key": "uuid-or-random-string-min-8-chars",
  "groups": [
    {
      "restaurant_id": 12,
      "fulfillment": "delivery",
      "address_id": 45,
      "delivery_notes": "Gate 2",
      "items": [
        { "menu_item_id": 101, "quantity": 2 }
      ]
    }
  ]
}
```
Client-sent prices or totals are ignored.

---

## 3. Validation, Money, & Snapshot Rules

- **All-or-nothing:** Every group is validated before creating any records. Errors are returned per group (`groups.{i}.*`). If any group fails, zero rows are inserted.
- **Per-group checks:**
  - `restaurant_status === 'active'`, `accepting_orders === true`, and open now in `Asia/Manila` via `AvailabilityService::compute()` (supports split shifts and overnight `closes_next_day`).
  - `offers_delivery` / `offers_pickup` matches `fulfillment`.
  - For `delivery`: `address_id` is required, must belong to the authenticated user (`user_addresses`), and must pass `ServiceAreaValidationService::checkRestaurantSupport()` (platform + restaurant `service_areas`). No silent fallback to default address.
  - Items: `menu_item_id` must belong to the restaurant, `approval_status === 'approved'`, category `is_active === 1`, `availability_status === 'available'`, `quantity` between `1` and `config('salo.orders.max_item_quantity')` (`50`), and no duplicate `menu_item_id` within the same group.
- **Decimal-safe money math:** Computed in integer centavos (`toCents` / `fromCents`). Flat delivery fee is read from `config('salo.orders.flat_delivery_fee')` (default placeholder `'49.00'` PHP) per delivery order; pickup fee is `0.00`.
- **Snapshots:** `orders` stores `restaurant_name`, `customer_name`, and delivery address snapshot (`delivery_address_id`, `delivery_recipient_name`, `delivery_phone`, `delivery_address_text`, `delivery_latitude`, `delivery_longitude`, `delivery_notes`). `order_items` stores `item_name`, `unit_price`, `quantity`, `line_total`.
- **COD Payment:** One `payments` row (`payment_method = 'cash'`, `payment_type = 'payment'`, `payment_status = 'pending'`, `amount = order.total_amount`) and one `payment_allocations` row (`allocation_type = 'order_payment'`) per order.
- **Idempotency:** Re-submitting the same `idempotency_key` from the same customer returns the original `checkout` without creating duplicate rows.

---

## 4. Open Policy Questions

- **Partial checkout handling:** Currently all-or-nothing; whether a user should be able to check out valid restaurant groups while skipping invalid ones is an open decision.
- **Scheduled orders:** Not supported in Step 8a; orders require the restaurant to be open now.
- **Open-hours enforcement:** Currently both `accepting_orders` and `operating_hours` (`AvailabilityService`) are enforced at checkout.
- **Customer cancellation:** Out of scope for Step 8a.
- **Owners ordering from their own restaurant:** Currently permitted like any customer; self-order restriction policy is undefined.
- **Delivery fee formula:** Currently a flat configurable placeholder (`SALO_FLAT_DELIVERY_FEE=49.00`) per delivery sub-order; distance/zone-based fees are future work.
