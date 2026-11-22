# SALO — Official REST API Contract & Integration Specifications

**Platform:** SALO — Order. Reserve. Gather. (Salo-salo sa Sarap)  
**Version:** 1.0.0  
**Base URL:** `/api` (or `http://localhost:8000/api` in development)  
**Authentication Scheme:** HTTP Bearer Token (Laravel Sanctum)  
**Content-Type:** `application/json`  
**Accept:** `application/json`  

---

## 1. Global Standards & Conventions

### 1.1 Authentication & Authorization
All protected endpoints require the HTTP Authorization header:
```http
Authorization: Bearer <sanctum_token>
```
If a token is invalid, expired, or missing on protected endpoints, the API returns:
```json
{
  "message": "Unauthenticated.",
  "status": 401
}
```
If the authenticated user lacks permission for the specific role (e.g. customer accessing `/api/admin/*`), the API returns:
```json
{
  "message": "Unauthorized access for role: customer.",
  "status": 403
}
```

### 1.2 Standard Success Response Envelope
```json
{
  "success": true,
  "message": "Resource retrieved successfully.",
  "data": { ... }
}
```

### 1.3 Standard Error Response Envelope
```json
{
  "success": false,
  "message": "Validation failed for provided fields.",
  "errors": {
    "email": ["The email field must be a valid email address."],
    "password": ["The password must be at least 8 characters."]
  },
  "status": 422
}
```

---

## 2. Authentication & Session Endpoints (`/api/auth`)

### `POST /api/auth/register`
Creates a new user account across any of the 4 supported roles.
- **Request Body:**
  ```json
  {
    "name": "Patricia Gomez",
    "username": "patriciag",
    "email": "customer@salo.ph",
    "password": "Password123!",
    "password_confirmation": "Password123!",
    "role": "customer" // "customer" | "owner" | "rider" | "admin"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "token": "1|salo_sanctum_token_xyz98120",
    "user": {
      "id": 1,
      "name": "Patricia Gomez",
      "username": "patriciag",
      "email": "customer@salo.ph",
      "role": "customer"
    }
  }
  ```

### `POST /api/auth/login`
Authenticates an existing user and issues a Sanctum personal access token.
- **Request Body:**
  ```json
  {
    "email": "owner@salo.ph",
    "password": "password123",
    "remember": true
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "token": "2|salo_sanctum_token_abc45109",
    "user": {
      "id": 2,
      "name": "Dalisay Reyes",
      "email": "owner@salo.ph",
      "role": "owner"
    }
  }
  ```

### `GET /api/auth/me` (Protected)
Returns authenticated session user profile.

### `POST /api/auth/logout` (Protected)
Revokes current access token.

---

## 3. Customer & Public Endpoints (`/api/customer` & `/api/restaurants`)

### `GET /api/restaurants`
Retrieves all active restaurants with cuisine tags, ratings, delivery times, and table reservation availability.
- **Query Parameters:** `?search=inasal&category=Filipino&page=1`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "dalisay-heritage",
        "name": "Dalisay Heritage Grill & Bistro",
        "cuisine": "Filipino · Grill & BBQ",
        "rating": 4.9,
        "review_count": 1420,
        "delivery_time": "25–35 min",
        "delivery_fee": 49,
        "min_order": 150,
        "is_open": true,
        "reservation_deposit": 500,
        "cover_image": "🔥"
      }
    ]
  }
  ```

### `GET /api/restaurants/{id}`
Returns restaurant details along with categorized menu items and add-on groups.

### `POST /api/customer/orders` (Protected)
Submits a consolidated multi-restaurant checkout.
- **Request Body:**
  ```json
  {
    "payment_method": "Cash on Delivery", // "COD" | "GCash" | "Maya" | "Card"
    "sub_orders": [
      {
        "restaurant_id": "dalisay-heritage",
        "delivery_address_id": 1,
        "notes": "Extra chicken oil please",
        "items": [
          { "menu_item_id": "dh-1", "quantity": 2, "selected_options": ["Annatto Rice"] }
        ]
      },
      {
        "restaurant_id": "manila-pizza",
        "delivery_address_id": 2,
        "items": [
          { "menu_item_id": "mp-2", "quantity": 1 }
        ]
      }
    ]
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "order_group_id": "SALO-MNL-2041",
    "total_amount": 800,
    "sub_orders": [
      { "id": "SUB-101", "restaurant_name": "Dalisay Heritage Grill", "status": "Pending" },
      { "id": "SUB-102", "restaurant_name": "Manila Artisan Pizza", "status": "Pending" }
    ]
  }
  ```

### `GET /api/restaurants/{id}/reservation-info` & `/reservation-availability*` (Public, `throttle:60,1`)
Public reservation availability engine (`Asia/Manila`):
- `GET /api/restaurants/{id}/reservation-info` — returns reservation policies, live open/accepting status, `dining_areas`, `active_table_count`, `largest_table_capacity`, and `can_reserve`.
- `GET /api/restaurants/{id}/reservation-availability/month?month=YYYY-MM&party_size=N` — returns per-day availability (`available` | `limited` | `full` | `closed` | `unavailable`), `available_slots`, `total_slots`, and `reason_code`.
- `GET /api/restaurants/{id}/reservation-availability?date=YYYY-MM-DD&party_size=N[&dining_area=...]` — returns candidate time slots (`start`, `end`, `time_label`, `available`, `available_table_count`, `reason_code`, `dining_areas_available`) and day summary.
- `GET /api/restaurants/{id}/reservation-availability/tables?start=YYYY-MM-DDTHH:MM&party_size=N[&dining_area=...]` — returns best-fit `available_tables` for a specific slot, or `suggested_alternatives` when the slot is full.
- Reason codes: `RESTAURANT_UNAVAILABLE`, `RESERVATIONS_NOT_OFFERED`, `NOT_ACCEPTING`, `NO_TABLES`, `PARTY_TOO_LARGE`, `PAST_TIME`, `TOO_SOON`, `TOO_FAR_AHEAD`, `CLOSED`, `FULLY_BOOKED`, `NO_FIT`.

### `POST /api/customer/reservations` (Protected)
Submits a table reservation request with refundable dining deposit.
- **Request Body:**
  ```json
  {
    "restaurant_id": "dalisay-heritage",
    "party_size": 4,
    "date": "2026-11-08",
    "time": "19:30",
    "special_requests": "Window seat preferred",
    "deposit_payment_method": "GCash"
  }
  ```

---

## 4. Restaurant Owner Operations (`/api/owner`)

### `GET /api/owner/dashboard` (Protected: Owner)
Returns merchant overview: today's gross revenue, active orders breakdown, pending table bookings, and menu item health count.

### `GET /api/owner/orders` & `PATCH /api/owner/orders/{id}/status`
- **Allowed Status Transitions:**
  - `Pending` → `Preparing` (Accepted)
  - `Pending` → `Cancelled` (Declined / Out of Stock)
  - `Preparing` → `Ready for Pickup` (Alerts courier network)
  - `Ready for Pickup` → `Completed` (Customer pickup handoff)

### `GET /api/owner/menu` & `POST /api/owner/menu`
CRUD operations for dish catalog, pricing, category taxonomy, and live availability toggling (`is_available: true|false`).

### `GET /api/owner/reservations` & `PATCH /api/owner/reservations/{id}/status`
Confirms or cancels table reservation requests, tracking guest deposit status.

### `GET /api/restaurant/tables` & `POST /api/restaurant/tables` & `PATCH /api/restaurant/tables/{id}`
Restaurant table floor plan management (`tables.view`, `tables.add`, `tables.edit`, `tables.manageAvailability`):
- `GET /api/restaurant/tables?search=&dining_area=&status=active|archived|all&date=YYYY-MM-DD` — returns `{ items, summary, dining_areas }` with live `table_status` (`available` | `reserved` | `occupied` | `archived`), `reservations_count`, `next_reservation`, and `upcoming_reservations_count`.
- `POST /api/restaurant/tables` — creates an active table (`table_name`, `seating_capacity`, `min_party_size`, `dining_area`, `description`).
- `GET /api/restaurant/tables/{id}` — retrieves a single table (`404` for cross-tenant IDs).
- `PATCH /api/restaurant/tables/{id}` — partially updates a table; returns `409` if reducing `seating_capacity` or raising `min_party_size` would break any future blocking reservation.
- `POST /api/restaurant/tables/{id}/archive` — archives a table (`is_active = 0`); idempotent; returns `409` if future blocking reservations exist.
- `POST /api/restaurant/tables/{id}/reactivate` — reactivates an archived table (`is_active = 1`); idempotent.

### `GET /api/owner/earnings` & `POST /api/owner/payouts`
Returns 7-day sales velocity, platform commission ledger (10%), and submits bank disbursement requests.

---

## 5. Delivery Rider Dispatch (`/api/rider`)

### `POST /api/rider/status` (Protected: Rider)
Toggles courier availability between `Online` (accepting jobs) and `Offline`.

### `GET /api/rider/active-delivery`
Returns currently active assigned trip with restaurant pickup address, customer destination, order checklist, and COD cash collection requirements.

### `PATCH /api/rider/active-delivery/step`
Updates turn-by-turn delivery status:
1. `Heading to Restaurant`
2. `At Restaurant`
3. `In Transit`
4. `Arrived`
5. `Completed` (Automatically debits COD cash liability to Cash-on-Hand balance)

### `GET /api/rider/jobs` & `POST /api/rider/jobs/{id}/accept`
Queries open dispatch pool and assigns orders to the calling courier.

### `POST /api/rider/remittance`
Submits COD cash settlement proof (GCash / Maya transaction reference #) to reduce Cash-on-Hand liabilities.

---

## 6. Central HQ Administration (`/api/admin`)

### `GET /api/admin/metrics` (Protected: Admin)
Returns platform GMV, net take-rate earnings, total orders, live rider count, and pending partner queue numbers.

### `GET /api/admin/restaurants` & `PATCH /api/admin/restaurants/{id}`
Reviews merchant applications, approves new restaurants, modifies custom commission rates (5%–25%), and manages compliance suspensions.

### `GET /api/admin/riders` & `PATCH /api/admin/riders/{id}`
Reviews LTO driver licenses, vehicle plate registrations, and monitors high COD liabilities (> ₱3,000).

### `GET /api/admin/orders` & `POST /api/admin/orders/{id}/resolve-dispute`
Supervises multi-kitchen orders and processes customer refund approvals or claim dismissals.

### `GET /api/admin/users` & `PATCH /api/admin/users/{id}/status`
User directory search across all 4 roles with account moderation controls.

### `GET /api/admin/config` & `PUT /api/admin/config`
Updates platform-wide commercial rules: default commission %, base delivery fees, minimum basket limits, and disaster emergency maintenance mode.

---

## 7. HTTP Status Codes & Error Handling Matrix

| Status Code | Reason | Handling in React Frontend |
|---|---|---|
| `200 OK` | Request succeeded | Updates state and displays success UI |
| `201 Created` | New record created | Navigates to detail page or confirms creation |
| `401 Unauthorized` | Missing or invalid Bearer token | Clears localStorage token and redirects to `/login` |
| `403 Forbidden` | Accessing unauthorized role endpoint | Shows permission alert; keeps user on current role |
| `404 Not Found` | Resource ID does not exist | Renders EmptyState / ErrorState component |
| `422 Unprocessable`| Form validation failure | Renders inline error helper text under input fields |
| `500 Server Error` | Backend exception | Shows retry feedback banner with support hotline |
| `503 Service Unavailable` | External public-image storage (Google Drive) unreachable or quota/credentials error | Shows retry/support banner; no half-saved DB records |

---

## 8. Public Media Proxy (`/api/media`)

### `GET /api/media/images/{fileId}` (Public, throttled `600/min`)
Streams a public restaurant or menu image stored in Google Drive (`gdrive:{fileId}`) with read-through disk caching on private local storage (`drive-cache/`).
- **Constraints:** `{fileId}` must match `[A-Za-z0-9_-]{10,128}` and `gdrive:{fileId}` must be referenced by `restaurants.logo_image`, `restaurants.cover_image`, or `menu_items.photo_image` (otherwise `404`).
- **Response Headers:** `Content-Type` (`image/jpeg|png|webp`), `Cache-Control: public, max-age=31536000, immutable`, `ETag`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, `Content-Security-Policy: default-src 'none'`. Supports `If-None-Match` (`304 Not Modified`).
