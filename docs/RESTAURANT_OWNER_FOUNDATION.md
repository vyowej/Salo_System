# Restaurant Owner Foundation

## Architecture

- `/owner/*` pages are wrapped in `RequireAccess`, which checks the signed-in user, active restaurant membership, and the centralized navigation permission map. These client-side checks are for user experience only; backend authorization remains the security boundary.
- `useRestaurantAccess()` exposes distinct ownership and staff memberships, the selected accessible restaurant, and permission checks. Approved ownership grants full frontend access independently of staff permissions.
- Owner pages use the `restaurantService` boundary. The current implementation is the labeled demo adapter in `src/services/demo/`, which shares restaurant data with customer-facing restaurant reads and records activity entries.
- Demo business data is stored in one localStorage record. Resized image blobs are stored in IndexedDB. Browser authentication persistence remains the existing SALO token/user session; no additional authentication secret is stored by the owner adapter.
- Demo authentication is enabled by default through `VITE_ENABLE_DEMO_AUTH`; disable or remove it before real deployment. Existing demo credentials and prefilled password remain presentation fixtures, not production authentication.
- `ImageUploader` and `ImageGalleryUploader` are wired to Business Profile with deferred cleanup so saved image references are not deleted before a profile update succeeds. Demo uploads accept JPG, PNG, and WebP files up to 5 MB with minimum dimensions of 300 × 300 pixels; images are converted to WebP and stored in IndexedDB.

## R8 status audit summary

| Section | Status | Evidence | Notes |
|---|---|---|---|
| §2 Restaurant Owner Account and Workspace | FUNCTIONAL-DEMO | `src/App.jsx`, `src/features/restaurant/access/RestaurantAccessContext.jsx`, `src/features/restaurant/access/permissionMap.js`, `src/services/authService.js` | Owner/demo login, global workspace shell, selected restaurant, and permission-filtered sidebar are wired to shared demo data and client-side role checks. |
| §3 Overview Dashboard | FUNCTIONAL-DEMO | `src/features/restaurant/pages/OwnerDashboard.jsx` | Dashboard reads demo stats and shows live demo values; recent activity panel is sample-only. |
| §4 Business Profile | PARTIAL | `src/features/restaurant/pages/OwnerProfilePage.jsx`, `src/services/demo/demoAdapter.js` | Profile edits share demo data with the customer page. Coordinates are entered manually; there is no map provider and delivery coverage is not validated against customer addresses. |
| §5 Operating Hours | FUNCTIONAL-DEMO | `src/features/restaurant/pages/OperatingHoursEditor.jsx`, `src/services/demo/operatingHours.js`, `src/services/demo/demoAdapter.js` | Weekly multi-period schedules, overnight periods, temporary closures, independent acceptance toggles, overlap validation, and customer-side availability use the shared demo store. Demo service permission checks exist; Laravel persistence and server authorization do not. |
| §6 Menu Management | FUNCTIONAL-DEMO | `src/features/restaurant/pages/OwnerMenuPage.jsx`, `src/services/demo/demoAdapter.js` | Shared demo menu edits persist in the local store and reflect in customer menu reads. |
| §7 Orders | FUNCTIONAL-DEMO | `src/features/restaurant/pages/OwnerOrdersPage.jsx`, `src/services/demo/demoAdapter.js` | Order acceptance/rejection/preparation/pickup and restaurant scoping use the demo data store. |
| §8 Reservations | FUNCTIONAL-DEMO | `src/features/restaurant/pages/OwnerReservationsPage.jsx`, `src/services/demo/demoAdapter.js` | Reservation approval, payment state, status history, and table assignment operate on the shared demo store. |
| §9 Tables | FUNCTIONAL-DEMO | `src/features/restaurant/pages/OwnerTablesPage.jsx`, `src/services/demo/demoAdapter.js` | Table add/edit/availability and derived reservation conflicts exist in demo adapter logic and UI. |
| §10 Inventory | FUNCTIONAL-DEMO | `src/features/restaurant/pages/OwnerInventoryPage.jsx`, `src/services/demo/demoAdapter.js` | Inventory items, stock movement history, alerts, and menu stock state are implemented on demo data. |
| §11 Promotions | DESIGN-ONLY | `src/features/restaurant/pages/OwnerPromotionsPage.jsx` | Presentational preview and sample cards only; no backend or real data connection. |
| §12 Team and Staff / Ownership | DESIGN-ONLY | `src/features/restaurant/pages/TeamAndStaffPage.jsx`, `src/features/customer/pages/InvitationsInboxPage.jsx` | Staff and ownership management screens are sample-data previews only. |
| §13 Reports and Statistics | DESIGN-ONLY | `src/features/restaurant/pages/OwnerReportsPage.jsx` | Report tabs are sample previews with SVG charts and sample exports only. |
| §14 Activity Logs | DESIGN-ONLY | `src/features/restaurant/pages/OwnerActivityPage.jsx`, `src/services/demo/demoAdapter.js` | The demo adapter records activity entries, including profile and hours changes with before/after values. The Activity Logs page is still a sample-data design preview and is not connected to those entries. |
| §15 Settings | DESIGN-ONLY | `src/features/restaurant/pages/OwnerSettingsPage.jsx` | Settings pages are visual-only previews with no backend wiring. |
| §16 Branch Management | MISSING | `src/features/restaurant/access/permissionMap.js`, `src/App.jsx` | Branch selector/branch-level ownership logic are not implemented in the owner workspace. |
| §17 Owner and Staff Navigation | FUNCTIONAL-DEMO | `src/features/restaurant/access/permissionMap.js`, `src/layouts/OwnerLayout.jsx` | Sidebar and route access reflect demo permissions and ownership/staff memberships. |

## Demo / run instructions

- Start the frontend with `npm install` (if dependencies are not present) and `npm run dev`.
- Open the app at `http://localhost:5173`.
- Demo accounts available in `src/services/authService.js` are: `owner@salo.ph`, `customer@salo.ph`, `reservation.staff@salo.ph`, and `inventory.staff@salo.ph`. The sign-in form pre-fills `password123` when the demo account is selected.
- Demo data remains local browser storage and is not a backend persistence layer.
- Route access is enforced by `RequireAccess` and `permissionMap.js` for UX; the real security boundary remains in Laravel and database authorization.

## Design-only pages and limitations

- Design-only sample pages: Team and Staff, customer invitations inbox, Promotions, Reports and Statistics, Activity Logs, and Settings.
- These pages intentionally show a visible `Design preview - sample data` badge and are not connected to demo adapter logic or a backing API.
- No real ownership invitation flow or staff permission assignment is implemented in these pages. The demo adapter records activity entries for connected demo workflows, but the Activity Logs preview does not read them.
- Backend requirements still include restaurant owner/staff membership records, permission enforcement, branch scoping, audit storage, and real API endpoints.

## What the backend must provide

- Restaurant, branch, owner, and staff membership records with separate ownership vs staff relationships.
- Endpoint-level authorization checks for every restaurant-scoped action, including branch filtering, owner-only actions, and staff-permission validation.
- Business Profile, Menu, Orders, Reservations, Tables, Inventory, Promotions, Reports, Activity Logs, and Settings APIs with validated request payloads.
- Stored activity log entries with before/after values for owner and staff actions.
- Inventory deduction strategy and permission controls from `demoAdapter.js`, especially `manual` and `on_completion` modes.
- Real persistence for uploads, payments, reservations, tables, and stock movements.
- An operating-hours API that validates periods and closure ranges, persists schedule and acceptance states, and enforces `business.hours.manage` server-side.
- Order and reservation endpoints that recheck schedule, temporary closures, and acceptance settings at the time of submission.

## Critical scenario results

These are demo-workflow results based on the implemented UI/service flows and automated tests; they are not production-completion claims. A full live walkthrough of every step in §19.1 A–F was not repeated for R2b.

| Scenario | Result | Evidence / qualification |
|---|---|---|
| A — Restaurant Profile Management | PASS (demo) | Profile writes use the shared demo store and customer-facing restaurant reads. The browser previously confirmed a saved profile description appearing on the customer page; coverage validation and map-provider behavior are intentionally absent. |
| B — Menu Management | PASS (demo) | Menu persistence and customer visibility are covered by `src/services/demo/menuData.test.js` and shared customer menu reads; inventory stock also controls sold-out state. |
| C — Order Processing | PASS (demo) | `src/services/demo/orders.test.js` covers sub-order isolation, transitions, rejection reasons, and cancellation requests. No backend notifications or production persistence. |
| D — Reservation Management | PASS (demo) | `src/services/demo/reservations.test.js` and `src/services/demo/orders.test.js` cover reservation lifecycle, table selection, permission checks, and customer/owner shared data. No real payment processing or backend notifications. |
| E — Table Management | PASS (demo) | `src/services/demo/tables.test.js` covers table creation, shared reservation assignment, availability, conflicts, and service permissions. |
| F — Inventory Management | PASS (demo) | `src/services/demo/inventory.test.js` covers stock movements, alerts, permission checks, no-negative-stock behavior, and customer sold-out availability. |
| I — Activity Log Review | DESIGN-ONLY | The adapter writes demo activities, but `src/features/restaurant/pages/OwnerActivityPage.jsx` uses sample data and is not connected to the log store. |
| K — Multiple Owners Accessing the Same Restaurant | DESIGN-ONLY | Ownership records exist in demo fixtures, but the co-owner/invitee experience remains a presentation-only preview; multi-account end-to-end access is not claimed here. |

## Presentation demo script

1. Sign in as `owner@salo.ph` using the prefilled `password123`; show Overview and the restaurant selector.
2. Open Business Profile, update a public field, save it, and open the customer page to show the shared demo value.
3. In Operating Hours, set two daily periods and an overnight period, add a dated closure, and toggle order/reservation acceptance to show the corresponding customer notices and blocked actions.
4. Open Menu Management, change availability or stock, then show the customer menu reflecting the shared state.
5. Walk through Orders, Reservations, Tables, and Inventory using the demo records and their shared transitions.
6. Label Promotions, Team and Staff, Reports, Activity Logs, and Settings as design-only previews; do not present them as connected workflows.

## Changelog

- R1–R4b foundation: added role-protected owner routes, distinct ownership/staff memberships, permission-filtered navigation, the restaurant selector, shared demo data, activity logging, reusable image uploaders, profile and menu management, restaurant-scoped order workflows, and shared customer/owner reservation management with lifecycle, table assignment checks, cancellation review, calendar views, and responsive states.
- Added protected owner routes, ownership/staff access modeling, centralized sidebar permissions, the restaurant selector, and customer/owner navigation.
- Consolidated owner business data and activity entries behind the shared demo service boundary; seeded multi-restaurant, co-owner, and limited-staff cases.
- Added reusable single-image and gallery uploaders, loading/empty/error states for touched owner pages, and dependency-free Node tests for access decisions.
- Removed the design showcase page and its navigation styles.
- Added Business Profile editing for public information, structured address and manually entered map coordinates, delivery coverage settings, fulfillment options, and restaurant photos. Profile and image changes are recorded in the demo activity store.
- Connected profile fields and image references to the customer restaurant detail page through the shared restaurant record; added a draft preview and saved customer-page link.
- Added Menu Management for category CRUD, ordering and visibility; item details, prices and discounts, dietary/preparation information, photos, four availability states, and add-on groups with min/max and per-option availability. Menu changes and activity records use the shared demo adapter; public restaurant menus consume the same categories and items.
- Added menu-data normalization and validation tests, customer-side menu availability/pricing/customization handling, and safe cleanup for staged demo menu photos.
- Added restaurant-scoped order lists and workflows for acceptance, reasoned rejection, preparation, pickup completion, scheduled/priority display, and per-restaurant cancellation review. Customer checkout, order history, tracking, and owner orders now use the shared demo order store; added adapter tests for isolation, transitions, and cancellation decisions.
- Added the R4b reservation dashboard, searchable owner list and detail history, approval/rejection, demo payment staging, table assignment, guest arrival/seating/completion, no-show handling, customer cancellation review, and day/week/month calendar with a mobile agenda fallback.
- Connected customer reservation requests and owner actions through the shared demo store. Added configurable demo table duration, table capacity/status/overlap checks, action-level reservation permission checks, a limited reservation-handler account, and automated lifecycle/table/permission tests.
- Split context hooks into dedicated hook modules instead of suppressing the React Fast Refresh lint rule.
- R5: replaced the Tables and Inventory placeholders with restaurant-scoped demo management pages, added editable dining areas and table schedules with reservation-derived statuses and conflict protection, added append-only stock movements and inventory alerts, connected tracked menu quantities to customer sold-out availability, and added optional once-per-order deduction on completion. Seeded a limited inventory manager and enforced the new table/inventory permissions in demo service actions.
- R5 cleanup: demo sessions, including legacy fallback tokens, skip `/api/auth/me`; real API tokens continue to use the backend refresh path.
- R5 follow-up: legacy demo stores now recover the seeded menu-stock tracking field only when that field is absent, preserving explicit untracked values.
- R6: added design-only Team and Staff, separate ownership-management previews, and a customer invitations inbox; no invitations or membership changes are sent or persisted.
- R7: added the dashboard summary improvements and design-only Promotions, Reports, Activity Logs, and Settings previews; existing demo dashboard and operational pages remain connected to demo data.
- R8: audited Restaurant Owner sections §2–§17, documented demo vs design-only status and backend gaps, corrected sample-preview labels, and recorded demo scenario outcomes and a presentation click path.
- R2b: added weekly multi-period and overnight operating hours, temporary closures, independent order/reservation acceptance controls, service-level demo permission checks, activity before/after records, and customer-side status/availability enforcement.

## Limitations

- There are no owner Laravel API endpoints or profile schema in this phase. Profile writes and activity entries remain demo-only; demo data and frontend permission checks are not production persistence or authorization.
- A map provider is not configured. Coordinates must be entered manually, delivery coverage is stored for display but does not validate customer addresses, and branch-specific profile management is not implemented.
- Menu and inventory data are demo-only. Existing seeded menu-stock quantities are available to the inventory manager and shared customer menu, but not durable production persistence.
- Add-on selection validation and price display run in the frontend demo flow; there is no backend validation, authorization, order-price verification, or production menu/photo API. Previously created order records are not rewritten when menu prices change.
- Owner order actions, customer cancellation requests, order persistence, and activity entries are demo-only in local browser storage. There are no Laravel order endpoints, backend authorization or notification delivery; customer-contact visibility and restaurant scoping in the adapter are not security boundaries. Delivery completion remains outside owner controls, and cancellation decisions do not implement refunds or payment changes.
- Reservations, table assignments, payment recording, status history, and activity entries remain demo-only local browser data. The permission checks are client-side/demo-adapter checks and are not a substitute for backend authorization. Demo payment recording does not charge a payment method or trigger a refund.
- The reservation duration value is a demo configuration default only. Restaurant-side approval deadlines, fees, payment rules, table holds, and refund policy remain undecided where the requirements assign those decisions to §20.
- Promotions, Team and Staff, Reports, Activity Logs, and Settings are design-only sample previews, not “Not available yet” routes or connected production workflows.
- Table and inventory records, movements, activity entries, and order-completion stock deductions remain demo-only local browser data. Service-level permission checks improve the demo workflow but are not backend authorization or durable persistence. On-completion deductions apply only to menu items with tracked quantities; ingredient/recipe-based availability was intentionally skipped because the requirements make it optional and the current data model has no approved recipe relationships.
- The default inventory deduction mode is `manual`; the on-completion option is configurable per restaurant. Inventory expiry alerts use a configurable demo threshold. These defaults are not approved production policies; both remain subject to §20 decisions.
- Operating hours and customer order/reservation gates are functional only in the shared demo store. Demo time checks use the browser's local timezone and current clock; automated unit tests pass explicit `Date` values to cover boundaries and overnight spillover.
- Earnings and uploaded images are demo-only; no payout or real file-upload endpoint exists. Activity entries are written by the adapter, but the owner Activity Logs page is not connected to them.
- `RESTAURANT_SIDE_AUDIT.md` is an outdated pre-R1 audit and must not be used to describe the current owner UI.
