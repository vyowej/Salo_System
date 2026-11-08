# Restaurant Owner Foundation

## Architecture

- `/owner/*` pages are wrapped in `RequireAccess`, which checks the signed-in user, active restaurant membership, and the centralized navigation permission map. These client-side checks are for user experience only; backend authorization remains the security boundary.
- `useRestaurantAccess()` exposes distinct ownership and staff memberships, the selected accessible restaurant, and permission checks. Approved ownership grants full frontend access independently of staff permissions.
- Owner pages use the `restaurantService` boundary. The current implementation is the labeled demo adapter in `src/services/demo/`, which shares restaurant data with customer-facing restaurant reads and records activity entries.
- Demo business data is stored in one localStorage record. Resized image blobs are stored in IndexedDB. Browser authentication persistence remains the existing SALO token/user session; no additional authentication secret is stored by the owner adapter.
- Demo authentication is enabled by default through `VITE_ENABLE_DEMO_AUTH`; disable or remove it before real deployment. Existing demo credentials and prefilled password remain presentation fixtures, not production authentication.
- `ImageUploader` and `ImageGalleryUploader` are wired to Business Profile with deferred cleanup so saved image references are not deleted before a profile update succeeds. Demo uploads accept JPG, PNG, and WebP files up to 5 MB with minimum dimensions of 300 × 300 pixels; images are converted to WebP and stored in IndexedDB.

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
- R5 cleanup: demo sessions no longer call `/api/auth/me`; known demo accounts use the existing demo credentials/session path when demo authentication is enabled.

## Limitations

- There are no owner Laravel API endpoints or profile schema in this phase. Profile writes and activity entries remain demo-only; demo data and frontend permission checks are not production persistence or authorization.
- A map provider is not configured. Coordinates must be entered manually, delivery coverage is stored for display but does not validate customer addresses, and branch-specific profile management is not implemented.
- Menu data is demo-only. Inventory does not yet provide stock quantities, so the menu stock filter currently distinguishes untracked items and will only filter real stock values when a future inventory integration supplies them. The demo adapter shares menu changes with the customer-facing restaurant page but is not durable production persistence.
- Add-on selection validation and price display run in the frontend demo flow; there is no backend validation, authorization, order-price verification, or production menu/photo API. Previously created order records are not rewritten when menu prices change.
- Owner order actions, customer cancellation requests, order persistence, and activity entries are demo-only in local browser storage. There are no Laravel order endpoints, backend authorization or notification delivery; customer-contact visibility and restaurant scoping in the adapter are not security boundaries. Delivery completion remains outside owner controls, and cancellation decisions do not implement refunds or payment changes.
- Reservations, table assignments, payment recording, status history, and activity entries remain demo-only local browser data. The permission checks are client-side/demo-adapter checks and are not a substitute for backend authorization. Demo payment recording does not charge a payment method or trigger a refund.
- The reservation duration value is a demo configuration default only. Restaurant-side approval deadlines, fees, payment rules, table holds, and refund policy remain undecided where the requirements assign those decisions to §20.
- Promotions, team, activity-log viewing, operating-hours management, and settings remain honest “Not available yet” routes.
- Table and inventory records, movements, activity entries, and order-completion stock deductions remain demo-only local browser data. Service-level permission checks improve the demo workflow but are not backend authorization or durable persistence. On-completion deductions apply only to menu items with tracked quantities; ingredient/recipe-based availability was intentionally skipped because the requirements make it optional and the current data model has no approved recipe relationships.
- The default inventory deduction mode is `manual`; the on-completion option is configurable per restaurant. Inventory expiry alerts use a configurable demo threshold. These defaults are not approved production policies; both remain subject to §20 decisions.
- Earnings and uploaded images are demo-only; no payout, real file-upload endpoint, or owner activity-log screen is connected.
- `RESTAURANT_SIDE_AUDIT.md` records the pre-R1 baseline and has not been rerun against this foundation work.
