# Customer Frontend Status (Real-Backend Only)

All demo adapters, seed datasets (`INITIAL_RESTAURANTS`, `INITIAL_ADDRESSES`, `INITIAL_ORDERS`, `INITIAL_FAVORITES`, `INITIAL_NOTIFICATIONS`), and demo mode flags have been removed.

## Wired Endpoints (Category A)

| Feature | Route | Endpoint(s) | Status |
|---|---|---|---|
| Restaurant Discovery, Filters & Search | `/customer` | `GET /api/restaurants`, `GET /api/restaurant-categories` | Wired |
| Restaurant Details & Menu | `/customer/restaurants/:id` | `GET /api/restaurants/{id}`, `GET /api/restaurants/{id}/menu` | Wired |
| Saved Delivery Addresses | `/customer/addresses`, `CustomerLayout`, `CartPage`, `CheckoutPage`, `RoleOnboardingModal` | `GET/POST /api/customer/addresses`, `PATCH /api/customer/addresses/{id}`, `PATCH /api/customer/addresses/{id}/default`, `DELETE /api/customer/addresses/{id}` | Wired |
| Service Area Validation | `CheckoutPage` | `POST /api/locations/validate-service-area` | Wired |
| Profile & Password | `/customer/profile`, `/customer/settings` | `PATCH /api/account/profile`, `PUT /api/account/password` | Wired |
| Partner Applications | `/customer/partner`, `/become-a-partner`, `/become-a-rider` | `GET /api/account/applications`, `POST /api/restaurant/applications`, `POST /api/rider/applications`, `POST /api/otp/*` | Wired |
| Order Tracking | `/customer/orders/:id` | `GET /api/customer/orders/{id}/tracking` | Wired (awaiting customer orders list API) |

## Backend Gap List (Category B — Honest Empty / Unavailable States)

| Feature | Needed Backend Endpoint(s) | Screen(s) Waiting |
|---|---|---|
| Order Placement (Checkout) | `POST /api/customer/orders` | `CheckoutPage` (in-progress cart kept client-side in `CartContext`; Place Order returns honest unavailable notice) |
| Customer Orders & Cancellation | `GET /api/customer/orders`, `GET /api/customer/orders/{id}`, `PATCH /api/customer/orders/{id}/cancel` | `OrdersPage`, `OrderDetailPage`, `CustomerDashboard` |
| Table Reservations | `GET /api/customer/reservations`, `POST /api/customer/reservations`, `PATCH /api/customer/reservations/{id}/cancel` | `ReservationsPage`, `ReservationModal`, `CustomerDashboard` |
| Favorites | `GET/POST/DELETE /api/customer/favorites` | `FavoritesPage`, `CustomerDashboard`, `RestaurantDetailPage` |
| Notifications | `GET /api/customer/notifications`, `PATCH /api/customer/notifications/{id}/read` | `NotificationsPage`, `CustomerNotificationsMenu` |
| Team/Ownership Invitations | `GET /api/customer/invitations`, `POST /api/customer/invitations/{id}/respond` | `InvitationsInboxPage` |
| Notification/Privacy/2FA Settings | `PUT /api/account/preferences` | `CustomerSettingsPage` |
