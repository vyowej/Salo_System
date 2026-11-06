# Customer Frontend Status Audit

This audit compares the current React customer frontend against the functional requirements in `documentation/requirements/CUSTOMER_SIDE.md` and the current project state. The frontend is implemented as a Vite React app; no Laravel endpoint implementation was found in this repo for the customer flows, so the pages that rely on data use local service fallbacks rather than a live API contract.

| Page / feature | Spec section | Route | Page exists? | Wired to a real endpoint? | Backend endpoint exists? | Status | Notes |
|---|---|---|---|---|---|---|---|
| Home / Dashboard | §4 | `/customer` | Yes | No | No | Partial | Dashboard shell and cards are present, but it currently relies on local customer service fallback data rather than a live customer API. |
| Restaurant Listing with filters and sorting | §5 | `/customer/restaurants` | Yes | No | No | Partial | Search and category filter are implemented; restaurant data is local fallback only. |
| Search Results | §5.1 | `/customer/restaurants` | Yes | No | No | Partial | Search is embedded in the dashboard layout and works for local data, but no dedicated backend search endpoint is present. |
| Restaurant Details: profile, operating hours/status, menu, reviews | §6 | `/customer/restaurants/:id` | Yes | No | No | Partial | Restaurant detail page exists and supports menu browsing; it uses local fallback data and does not call a real restaurant-detail endpoint. |
| Menu item customization: add-ons, quantity, special instructions, sold-out handling | §8 | `/customer/restaurants/:id` | Yes | No | No | Partial | Item modal exists, but backend validation and live pricing are not connected to a real API. |
| Favorites | §7 | `/customer/favorites` | Yes | No | No | Partial | Saved favorites are implemented as a customer page with client-side state and local storage persistence until a real backend endpoint is available. |
| Cart: multi-restaurant, grouped by restaurant | §8.3, §9.1 | `/customer/cart` | Yes | No | No | Partial | Cart flow exists and groups items by restaurant; it is UI-complete but not wired to a live backend cart API. |
| Checkout: per-restaurant fulfillment, address, timing, summary, payment | §9–§14 | `/customer/checkout` | Yes | No | No | Partial | Checkout page exists with grouped restaurant flows; final pricing/payment status remains display-only until a real API contract is available. |
| Order Confirmation | §13.4, §27 | `/customer/checkout` or post-submit flow | Yes | No | No | Partial | Confirmation experience is shown in the checkout flow, but does not verify payment status from a live backend. |
| My Orders, Order Details with restaurant sub-orders, Order Tracking | §15 | `/customer/orders`, `/customer/orders/:id` | Yes | No | No | Partial | Orders and tracking UI are in place; status fields and rider tracking are local fallback state. |
| Order cancellation at sub-order level | §16 | `/customer/orders/:id` | Yes | No | No | Partial | Cancellation actions are modeled in the UI, but real backend cancellation authority is not implemented. |
| Reservations: discover, reservation form, table availability, fee/policy disclosure, payment state | §17–§18 | `/customer/reservations` | Yes | No | No | Partial | Reservation view and modal exist; availability and deposits are local UI state without a live API. |
| My Reservations and Reservation Details, cancellation | §19 | `/customer/reservations` | Yes | No | No | Partial | Reservation list and action states are present; cancellation remains UI-only. |
| Food pre-order linked to a reservation | §20 | `/customer/reservations` | Partial | No | No | UI only (backend missing) | Reservation modal allows reservation-related flows, but no backend linking model or API was found. |
| Notifications | §23 | `/customer/notifications` | Yes | No | No | Partial | Notification center is implemented with unread tracking, clear-all state, and client-side persistence until an API contract exists. |
| My Profile, My Addresses (multiple, labels, default), Account Settings | §21, §10 | `/customer/profile`, `/customer/addresses` | Yes | No | No | Partial | Profile and address management are implemented in the UI with local storage state. |
| Guided onboarding: phone, address, skippable | §3 | landing / welcome modal | Yes | No | No | Complete | Welcome onboarding modal exists and supports optional phone/address collection with explicit skip behavior, matching the "explore first" requirement. |
| Become a Partner entry, partnership application form, status by state, workspace access | §22 | `/customer/partner` | Yes | No | No | Partial | Partner application page exists and includes application states; it is not connected to a live backend application workflow. |

## Summary

The customer frontend is now largely scaffolded and feature-rich at the UI level, with the previously missing favorites and notifications flows added and wired into the customer navigation. Phase 2 further completes the customer shell with a topbar delivery address selector, search field with recent-search memory, and the favorites/cart action controls in the header so the customer flow feels complete before backend integration. The app remains intentionally frontend-only and API-ready: pages are built with isolated client-side data services, but they are not backed by a real Laravel customer API contract. The mobile customer shell also includes a bottom navigation pattern and spacing adjustments to keep the experience usable on smaller screens without blocking the content area.
