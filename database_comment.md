# SALO Database Schema — FINAL v8 Review & Sign-Off

> **Note:** Updated in `database_comment.md` (no `database_comments.md` exists in this repo). No SQL was executed and no `.sql` files were created.

## Executive Verdict: Is FINAL v8 Signed Off?

**Yes — FINAL v8 is clean and ready to serve as the 38-table core SQL baseline.** Both remaining items from v7 (`payments.payment_status` `'successful'` → `'paid'` and coordinate bounds on `addresses` and `orders`) are now fixed cleanly in SQL. No P0 DDL or constraint defects remain in the 38-table core schema.

What remains is no longer a schema-bug fix—only **product/architecture decisions** explicitly listed under `DECISIONS PENDING` in v8 (Phase 1 ledger/refunds extraction, dine-in default vs. wizard UI, promo stacking bridge, rider reapplication/dispatch history, granular permissions) and the **frontend / `.env` / auth alignment tasks** in the app codebase.

---

## 1. Verified v8 Changes (From v7)

1. **`payments.payment_status` (`30`):** Renamed `'successful'` → **`'paid'`**, matching [`SALO_BUSINESS_RULES.md` §6](file:///c:/xampp/htdocs/Salo_Final/documentation/SALO_BUSINESS_RULES.md#L336-L356), [`CUSTOMER_SIDE.md` §14.3](file:///c:/xampp/htdocs/Salo_Final/documentation/requirements/CUSTOMER_SIDE.md#L755-L766), and internal table `26. checkouts.checkout_status`. `payments.refund_status` preserves `'successful'` per [`SALO_BUSINESS_RULES.md` §13](file:///c:/xampp/htdocs/Salo_Final/documentation/SALO_BUSINESS_RULES.md#L571-L577).
2. **`addresses` (`4`) & `orders` (`27`) Coordinate Bounds:** Added `chk_addresses_coordinates` and `chk_orders_coordinates`, enforcing `latitude BETWEEN -90 AND 90` and `longitude BETWEEN -180 AND 180` when non-`NULL` (matching `32. deliveries.chk_deliveries_proof_range`).

---

## 2. Cumulative Baseline Status (38 Tables)

All P0 constraint, relational-integrity, and naming blockers from earlier reviews (v3 → v7) are resolved:
- Composite FKs keep `application_documents` locked to the matching `application_document_requests` parent application (`19`/`20`), keep `service_areas` barangays locked to their city (`12`), keep `menu_items` locked to their restaurant's categories (`22`/`23`), keep `reservations` locked to their restaurant's tables (`15`/`33`), and keep `reviews` locked to `(order_id, restaurant_id, customer_id)` (`27`/`37`).
- All discount split (`orders`), joint-promo share (`promos`), rejection (`orders`), no-show (`reservations`), document review (`application_documents`), and coordinate (`addresses`, `orders`, `deliveries`) `CHECK` constraints enforce complete, non-negative/bounded invariants.
- Uniform nullable-`ENUM` + `IS NOT NULL` `CHECK` pattern guards required enums (`restaurants`, `riders`, `restaurant_applications`, `rider_applications`, `application_documents`, `payout_accounts`, `orders`, `payments`, `payment_allocations`, `promos`) against silent empty-string truncation under permissive SQL modes.

---

## 3. Tracked Non-Blocking Items & Next Steps Before Implementation

### A. Open Design Decisions (Tracked in v8 Header)
- **Dine-in Default vs. Wizard UI:** [`RESTAURANT_REQUIREMENTS_REPORT.md`](file:///c:/xampp/htdocs/Salo_Final/RESTAURANT_REQUIREMENTS_REPORT.md#L275) enables `dineIn` by default, while [`applicationDefaults.js`](file:///c:/xampp/htdocs/Salo_Final/src/pages/BusinessApplication/constants/applicationDefaults.js#L204-L208) and [`RestaurantConfigurationStep.jsx`](file:///c:/xampp/htdocs/Salo_Final/src/pages/BusinessApplication/components/RestaurantConfigurationStep.jsx#L381-L420) only implement `delivery`, `pickup`, and `tableReservations`. Decide whether to set `offers_dine_in DEFAULT 0` (especially for `cloud_kitchen`) or add the UI control.
- **Orders / Payments Phase-1 Extensions:** Plan `financial_ledger`, extracting a dedicated `refunds` table (until then, enforce `payment_type <> 'refund'` filtering on all `payments.payment_status` queries since refunds keep `payment_status = 'pending'`), and an `order_promos` bridge table if simultaneous restaurant + platform vouchers ([`SALO_BUSINESS_RULES.md` §29](file:///c:/xampp/htdocs/Salo_Final/documentation/SALO_BUSINESS_RULES.md#L860-L875)) need per-promo linkage beyond `orders.promo_id`.
- **UTC Session Enforcement:** Retain explicit UTC DB session configuration (`SET time_zone = '+00:00'` + `STRICT_TRANS_TABLES`) alongside `orders.rejected_at` (`DATETIME`) and other `TIMESTAMP` columns.
- **Deferred Portal Tables (`DECISIONS PENDING`):** `restaurant_staff_permissions` ([`permissionMap.js`](file:///c:/xampp/htdocs/Salo_Final/src/features/restaurant/access/permissionMap.js#L1-L60) / [`InvitationsInboxPage.jsx`](file:///c:/xampp/htdocs/Salo_Final/src/features/customer/pages/InvitationsInboxPage.jsx)), `promo_redemptions` (for `promos.per_customer_limit`), `delivery_offers`, COD remittance batches, `dining_areas`, inventory tables, `notifications`, `platform_settings`, and rider application vehicle snapshots / `users.deleted_at` retention.

### B. App / Config Alignment Tasks (Before Backend Integration)
- Remove `'image/webp'` from [`DocumentUploadCard.jsx`](file:///c:/xampp/htdocs/Salo_Final/src/pages/BusinessApplication/components/DocumentUploadCard.jsx#L14) and [`RiderDocumentUploadCard.jsx`](file:///c:/xampp/htdocs/Salo_Final/src/pages/RiderApplication/components/RiderDocumentUploadCard.jsx#L10).
- Bump `MAX_UPLOAD_SIZE_KB` from `5120` to `10240` in [`backend/.env.example`](file:///c:/xampp/htdocs/Salo_Final/backend/.env.example#L62-L64).
- Change `'morning'` → `'breakfast'` in [`riderApplicationDefaults.js`](file:///c:/xampp/htdocs/Salo_Final/src/pages/RiderApplication/constants/riderApplicationDefaults.js#L110), reconcile `RIDER_DOC_TYPES` in [`riderDocumentMatrix.js`](file:///c:/xampp/htdocs/Salo_Final/src/pages/RiderApplication/constants/riderDocumentMatrix.js#L6-L38), and add `motoYear` (`vehicle_year`) validation in [`RiderApplicationPage.jsx`](file:///c:/xampp/htdocs/Salo_Final/src/pages/RiderApplication/RiderApplicationPage.jsx#L245-L260) (`validateStep(5)`).
- Resolve the Sanctum/auth conflict between [`docs/API_CONTRACT.md`](file:///c:/xampp/htdocs/Salo_Final/docs/API_CONTRACT.md#L6) / [`backend/.env.example`](file:///c:/xampp/htdocs/Salo_Final/backend/.env.example#L46) and [`SALO_DEVELOPMENT_RULES.md` §5.2](file:///c:/xampp/htdocs/Salo_Final/documentation/SALO_DEVELOPMENT_RULES.md#L197) before generating auth/session migrations.
