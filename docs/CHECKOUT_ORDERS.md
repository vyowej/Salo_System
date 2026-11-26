# SALO Checkout & Order Creation (COD Only)

## 1. Endpoints

All endpoints require `auth` middleware.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/customer/checkout` | Validate cart groups, compute totals on the backend, and create checkout + per-restaurant orders + COD payments in one transaction. |
| `GET` | `/api/customer/orders` | Paginated list of the authenticated customer's orders (`page`, `per_page`, optional `status`), newest first. |
| `GET` | `/api/customer/orders/{id}` | Order detail with item snapshots, fee, subtotal, total, address snapshot, payment status, and restaurant logo URL. Returns `404` if not owned by the user. |
| `GET` | `/api/customer/orders/{id}/receipt` | Printable customer receipt for finalized orders (`delivered` for delivery, `completed` for pickup/dine-in; `409` otherwise, `404` if not owned). |
| `POST` | `/api/customer/orders/{id}/cancel` | Cancel the customer's own `pending` order (optional `reason`), set `cancelled_at` / `cancelled_by = 'customer'`, cancel its pending cash payment, and write an audit log. Returns `409` if not pending or `404` if not owned by the user. |

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
- **Customer cancellation:** Implemented in Step 9a via `POST /api/customer/orders/{id}/cancel` for `pending` orders only (see [ORDER_COMPLETION.md](./ORDER_COMPLETION.md)).
- **Self-order restriction:** Implemented in Step 8b follow-up — owners (`restaurant_owners`) and active staff (`restaurant_staff`) cannot check out from their own restaurant (see [RESTAURANT_ORDERS.md](./RESTAURANT_ORDERS.md)).
- **Delivery fee formula:** Currently a flat configurable placeholder (`SALO_FLAT_DELIVERY_FEE=49.00`) per delivery sub-order; distance/zone-based fees are future work.

- **Multi-branch `restaurant_name` snapshot (Phase 6a):** `CheckoutService` snapshots `display_name` (`"<restaurant_name> — <branch_name>"`, or `<restaurant_name>` for single-location businesses) into `orders.restaurant_name`, `computedGroupsSummary`, and `order_received` notification text. Existing orders keep their original snapshot.

---

## 5. Phase 5: Itemized Payment Summary & Role-Scoped Receipts

### Shared Itemized Payment Summary (`ItemizedPaymentSummary`)
- Used across Cart / Multi-Cart (`CartPage`), Checkout (`CheckoutPage`), and Order Confirmation (`confirmedCheckout`).
- **Delivery group breakdown:** Groups by `(restaurant, delivery_address)` (or pickup/dine-in group). Each group displays:
  - Restaurant name (and formal delivery address via `formatFormalAddress` when delivery).
  - Each item line (`[Item name] × quantity` with add-ons and line price).
  - Group `Food subtotal` and `Delivery fee` (or `No delivery fee` for pickup/dine-in).
- **Consolidated totals:** Displays `Food total`, `Delivery fee` (when 1 delivery group) or `Combined delivery fees` (when >1 delivery groups), optional promo discount, and `Grand Total` computed in integer centavos so it matches `sum(groups[].expected_total) - promoDiscount` sent to `POST /api/customer/checkout`.

### Role-Authorized Receipt Endpoints
All receipts derive strictly from persisted order/item/payment/delivery snapshots (even if live menu item names or prices later change) and format timestamps in `Asia/Manila`.

| Role | Endpoint | Authorization | Finalized-Status Rule | Visible Fields & Privacy |
| --- | --- | --- | --- | --- |
| Customer | `GET /api/customer/orders/{id}/receipt` | `auth`; `orders.customer_id === user_id` (`404` otherwise) | `delivery` -> `delivered`; `pickup`/`dine_in` -> `completed` (`409` if non-final, `cancelled`, or `rejected`) | Receipt & order ref, restaurant, `placed_at` & `finalized_at`, formal delivery address & `rider_first_name` (delivery), snapshot items & add-ons, subtotal, delivery fee, total, payment method/status (`Paid` / `Paid in cash`), and `sibling_orders` links for multi-restaurant checkouts. |
| Restaurant | `GET /api/restaurant/orders/{id}/receipt` | `auth` + `role:owner,staff` + `WorkspaceAccessResolver::requireActiveAuthorizedRestaurantForOrders` (`403`/`404` otherwise) | `delivery` -> `delivered`; `pickup`/`dine_in` -> `completed` (`409` otherwise) | Receipt & order ref, restaurant, `customer_name` (same as restaurant order view), `placed_at` & `finalized_at`, snapshot items & add-ons, subtotal, delivery fee, total, payment method/status, and `cod_remittance_status` (when COD). |
| Rider | `GET /api/rider/deliveries/{orderId}/receipt` | `auth` + `role:rider`; active rider assigned to `deliveries.rider_id` (`403`/`404` otherwise) | `deliveries.delivery_status === 'delivered'` (`409` otherwise) | Receipt & order ref, restaurant, pickup address, formal drop-off address, `placed_at` & `delivered_at`, `delivery_fee`, `total_amount`, payment method/status, `cod_amount_collected`, and `cod_remittance_status`. Omits itemized food list and customer contact details. |
