# Restaurant Owner Foundation

## Architecture

- `/owner/*` pages are wrapped in `RequireAccess`, which checks the signed-in user, active restaurant membership, and the centralized navigation permission map. These client-side checks are for user experience only; backend authorization remains the security boundary.
- `useRestaurantAccess()` exposes distinct ownership and staff memberships, the selected accessible restaurant, and permission checks. Approved ownership grants full frontend access independently of staff permissions.
- Owner pages use the `restaurantService` boundary. The current implementation is the labeled demo adapter in `src/services/demo/`, which shares restaurant data with customer-facing restaurant reads and records activity entries.
- Demo business data is stored in one localStorage record. Resized image blobs are stored in IndexedDB. Browser authentication persistence remains the existing SALO token/user session; no additional authentication secret is stored by the owner adapter.
- Demo authentication is enabled by default through `VITE_ENABLE_DEMO_AUTH`; disable or remove it before real deployment. Existing demo credentials and prefilled password remain presentation fixtures, not production authentication.
- `ImageUploader` and `ImageGalleryUploader` are wired to Business Profile with deferred cleanup so saved image references are not deleted before a profile update succeeds. Demo uploads accept JPG, PNG, and WebP files up to 5 MB with minimum dimensions of 300 × 300 pixels; images are converted to WebP and stored in IndexedDB.

## Final requirements status (§2–§17)

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
| §14 Activity Logs | DESIGN-ONLY | `src/features/restaurant/pages/OwnerActivityPage.jsx`, `src/services/demo/demoAdapter.js` | The demo adapter records activity entries for connected demo actions, including profile and hours changes with before/after values. The Activity Logs page is a sample-data design preview and is not connected to those entries. |
| §15 Settings | DESIGN-ONLY | `src/features/restaurant/pages/OwnerSettingsPage.jsx` | Settings pages are visual-only previews with no backend wiring. |
| §16 Branch Management | MISSING | `src/features/restaurant/access/permissionMap.js`, `src/App.jsx` | Branch selector/branch-level ownership logic are not implemented in the owner workspace. |
| §17 Owner and Staff Navigation | FUNCTIONAL-DEMO | `src/features/restaurant/access/permissionMap.js`, `src/layouts/OwnerLayout.jsx` | Sidebar and route access reflect demo permissions and ownership/staff memberships. |

## Demo / run instructions

- Start the frontend with `npm install` (if dependencies are not present) and `npm run dev`.
- Open the app at `http://localhost:5173`.
- Demo accounts available in `src/services/authService.js` are: `owner@salo.ph`, `customer@salo.ph`, `reservation.staff@salo.ph`, and `inventory.staff@salo.ph`. The sign-in form pre-fills `password123` when the demo account is selected.
- Demo data remains local browser storage and is not a backend persistence layer.
- Route access is enforced by `RequireAccess` and `permissionMap.js` for UX; the real security boundary remains in Laravel and database authorization.

### Resetting demo data before a presentation

The demo adapter uses `DEMO_SEED` whenever `salo_demo_store_v1` is absent. In the browser DevTools Console, run:

```js
localStorage.removeItem('salo_demo_store_v1');
localStorage.removeItem('salo_multi_cart');
location.reload();
```

This resets restaurant business data and the customer cart to the seed/default demo state. It leaves the signed-in account and theme preference unchanged; sign out or change the theme separately if needed. This is a local demo reset only and does not change a database.

## Design-only pages and limitations

- Design-only sample pages: Team and Staff, customer invitations inbox, Promotions, Reports and Statistics, Activity Logs, and Settings.
- These pages intentionally show a visible `Design preview - sample data` badge and are not connected to demo adapter logic or a backing API.
- No real ownership invitation flow or staff permission assignment is implemented in these pages. The demo adapter records activity entries for connected demo workflows, but the Activity Logs preview does not read them.
- Backend requirements still include restaurant owner/staff membership records, permission enforcement, branch scoping, audit storage, and real API endpoints.

## What the backend must provide

- Restaurant, branch, owner, and staff membership records with separate ownership vs staff relationships.
- Endpoint-level authorization checks for every restaurant-scoped action, including branch filtering, owner-only actions, and staff-permission validation.
- Business Profile, Menu, Orders, Reservations, Tables, Inventory, Promotions, Reports, Activity Logs, and Settings APIs with validated request payloads.
- Required REST operations (illustrative; not implemented): read/update restaurant profile and hours/closures; CRUD menu categories/items; list and transition restaurant-scoped orders; list and transition reservations; CRUD tables; read/update inventory and append stock movements; manage promotions and settings; query reports and activity history; manage staff/owner memberships and invitations.
- Every operation must scope records to the authorized restaurant/branch. Staff actions must check their specific permission server-side; ownership-only operations must require an approved owner membership. Customer order/reservation submission must recheck current hours, closures, acceptance toggles, inventory/menu availability, and applicable capacity.
- Stored activity log entries with before/after values for owner and staff actions.
- Inventory deduction strategy and permission controls from `demoAdapter.js`, especially `manual` and `on_completion` modes.
- Real persistence for uploads, payments, reservations, tables, and stock movements.
- An operating-hours API that validates periods and closure ranges, persists schedule and acceptance states, and enforces `business.hours.manage` server-side.
- Order and reservation endpoints that recheck schedule, temporary closures, and acceptance settings at the time of submission.

## R8 final scenario results

These results describe the live browser walkthrough of the shared demo adapter. They are not production-completion claims; no Laravel backend or durable server persistence is present.

| Scenario | Result | Evidence / qualification |
|---|---|---|
| A — Restaurant Profile Management | PASS (demo) | Saved a profile description through the owner UI and confirmed the changed text on the customer restaurant page. |
| B — Menu Management | PASS (demo) | Changed an item to Sold out in Menu Management; the customer restaurant menu continued to show the item with an unavailable/sold-out state. |
| C — Order Processing | PASS (demo) | Accepted seeded order `ORD-1101` through the confirmation dialog; the order status changed to Accepted. |
| D — Reservation Management | PASS (demo) | Approved seeded reservation `RES-5501`; it moved from Pending to Approved in the reservation list and summary. |
| E — Table Management | PASS (demo) | Added “Presentation Test Table” through the Tables UI; it appeared in the table list and the shared demo adapter. |
| F — Inventory Management | PASS (demo) | Received 2 kg of Chicken; quantity increased from 14 kg to 16 kg and movement history showed the change, owner, and reason. |
| Operating Hours | PASS (demo) | Changed Monday opening to 09:00, added a same-day Holiday closure, and turned off order and reservation acceptance. The customer page showed Closed, the closure reason, and both blocked-request messages. |
| I — Activity Log Review | DESIGN-ONLY | The adapter writes demo activities, but `src/features/restaurant/pages/OwnerActivityPage.jsx` uses sample data and is not connected to the log store. |
| K — Multiple Owners Accessing the Same Restaurant | DESIGN-ONLY | Ownership records exist in demo fixtures, but the co-owner/invitee experience remains a presentation-only preview; multi-account end-to-end access is not claimed here. |

## R8 verification notes

- The browser initially had only `salo_multi_cart` (`[]`) and `salo-theme` (`light`) in localStorage; `salo_demo_store_v1`, `salo_user`, and `salo_token` were absent. Its effective restaurant data therefore came from `DEMO_SEED`. No seed differences were found for either restaurant across schedules, closure lists, order/reservation acceptance toggles, menus, orders, reservations, tables, inventory items/movements, or activity entries. At the end, localStorage was restored exactly to those two original key/value pairs and the three absent keys remained absent.
- Overview, Business Profile, Menu, Orders, Reservations, Tables, Inventory, Promotions, Team and Staff, Reports, Activity Logs, Settings, and Customer Invitations were checked at 390, 768, and 1365 CSS pixels in light and dark themes (78 page/theme/width checks). A mobile-shell margin transition caused overflow during the first pass; disabling that transition at widths up to 1024px fixed the owner and customer shells. The final matrix had no document horizontal overflow, console errors, HTTP errors, or failed requests.
- The 404 observed in an earlier run was not reproducible: all instrumented requests in this walkthrough completed without a 4xx/5xx response or failed request.
- Owner navigation showed all owner pages. Reservation staff saw Reservations and Tables only; inventory staff saw Inventory only. Direct URLs outside each staff member’s permission displayed “No access”. The customer demo login reached the customer workspace; the demo-account selection prefilled `password123`, and the owner workspace displayed the “Demo Data” badge.
- Native keyboard input could not be verified in the integrated browser: `page.keyboard.press('Tab')`, `Shift+Tab`, and `Escape` produced no document `keydown` events. Manually verify the Team staff-details drawer, Invite Staff modal, Promotions modal, and Activity details drawer: open each with the mouse; use Tab and Shift+Tab to traverse and wrap focus within it; press Escape to close; verify focus returns to the opener.

## Presentation demo script

1. Reset demo data with the DevTools snippet above, then sign in as `owner@salo.ph` with the prefilled `password123`; show the Overview and restaurant selector.
2. Edit and save a Business Profile field, then open the customer page to show the shared value.
3. Change a menu item’s availability and show the result on the customer menu.
4. Open Operating Hours, demonstrate the weekly schedule and a dated closure, then show the customer-side closed/acceptance messages.
5. Demonstrate an order transition and reservation approval.
6. Add a table and receive inventory stock; point out the inventory movement history.
7. Label Promotions, Team and Staff, Reports, Activity Logs, and Settings as design-only previews; do not present them as connected workflows.

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
- R8: audited Restaurant Owner sections §2–§17, documented demo vs design-only status and backend gaps, corrected sample-preview labels, fixed responsive shell overflow at widths up to 1024px, and recorded demo scenario outcomes, verification limits, reset instructions, and a presentation click path.
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
- The Owner Inventory page displays orderable menu items grouped by the configured Menu Management categories. Existing menu-item `minimumLevel` values take precedence; otherwise, the page uses a UI-only low-stock threshold of 5 portions. Items without a tracked `stockQuantity` remain neutral and show “Not tracked.” Receive and usage actions update menu stock through the existing menu-stock adjustment service, so their history entries remain adjustments; Return is omitted because it is an ingredient/supplier action. Ingredient records remain in demo storage but are not rendered in this menu-stock list.
- The default inventory deduction mode is `manual`; the on-completion option is configurable per restaurant. Inventory expiry alerts use a configurable demo threshold. These defaults are not approved production policies; both remain subject to §20 decisions.
- Operating hours and customer order/reservation gates are functional only in the shared demo store. Demo time checks use the browser's local timezone and current clock; automated unit tests pass explicit `Date` values to cover boundaries and overnight spillover.
- Earnings and uploaded images are demo-only; no payout or real file-upload endpoint exists. Activity entries are written by the adapter, but the owner Activity Logs page is not connected to them.
- `RESTAURANT_SIDE_AUDIT.md` is an outdated pre-R1 audit and must not be used to describe the current owner UI.
