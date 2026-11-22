# SALO — Branch Mayor's / Business Permit Verification Plan

**Project:** SALO — Where Good Food Brings Us Together  
**Document Type:** Architecture Audit & Implementation Plan (**PLANNING ONLY** — no code, migrations, or DB changes applied)  
**Compliance:** Prepared in accordance with `documentation/SALO_DEVELOPMENT_RULES.md`, `docs/MULTI_BRANCH_PLAN.md`, `docs/BRANCHES.md`, `docs/ADMIN_APPLICATION_REVIEW.md`, `RESTAURANT_REQUIREMENTS_REPORT.md`, and `documentation/requirements/RESTAURANT_SIDE.md`.

---

## 1. Requirement Summary

- Every restaurant branch must submit its own **Mayor's / Business Permit** (`mayors_permit`) for admin verification when required by that branch's local requirements.
- **Initial application with multiple branches:** Each declared branch uploads its own Mayor's / Business Permit (or declares it is not required locally with an explanation).
- **Adding a branch later (`Add Branch`):** The new branch submits its own Mayor's / Business Permit (or "not required" declaration).
- **Business-level documents remain shared:** DTI/SEC/CDA registration, representative Government ID, Authorization Letter, and shared payout account stay at the business/application level.
- **Single application, independent branch verification:** Still **one** `restaurant_applications` record per business, never a separate application per branch, but each branch has its **own** permit verification status before it can be published/made visible on SALO. This replaces Decision 5 in `docs/MULTI_BRANCH_PLAN.md` (which previously made owner-added branches publishable immediately upon creation).

---

## 2. Codebase & Schema Audit

### 2.1 How Documents & Uploads Work Today
- **`application_document_requests` (`database/salo_db.sql:565-589`):** Keyed by `request_id` with composite unique keys `uk_doc_requests_restaurant (request_id, restaurant_application_id)` and `uk_doc_requests_rider (request_id, rider_application_id)`, enforced by `chk_doc_requests_one_owner` (`(restaurant_application_id IS NULL) <> (rider_application_id IS NULL)`).
- **`application_documents` (`database/salo_db.sql:599-648`):**
  - Stores every uploaded file (`file_path` unique, private storage, never public URL). Re-uploads insert a new row; the latest row per `document_code` is current.
  - Enforces `chk_application_documents_one_owner`, `chk_application_documents_restaurant_codes` (includes `'mayors_permit'`), composite FK `fk_application_documents_request_restaurant (request_id, restaurant_application_id)`, MIME types (`application/pdf`, `image/jpeg`, `image/png`), size (`1..10485760` bytes / 10 MB), and `chk_application_documents_rejected_note`.
- **Upload Size Limits (`php.ini`):** `upload_max_filesize = 10M` and `post_max_size = 32M`. Submitting a 5-location application in a single multipart request with up to 4 extra branch permits (up to `4 × 10 MB = 40 MB`) **plus** business documents (up to `10 × 10 MB = 100 MB` worst case, or `4` mandatory + `4` branch permits = `80 MB`) would exceed `post_max_size = 32M` and fail with HTTP `413 Payload Too Large`.
- **Private Document Streaming (`backend/routes/api.php:123`, `ApplicationDocumentController::show`):**
  - `GET /api/applications/documents/{documentId}/file` streams private files via `FileStorageService::streamPrivateFile()`.
  - Authorized for `user_role === 'admin'`, `uploaded_by`, `applicant_user_id`, or `restaurant_owners` matching `restaurant_applications.restaurant_id`. Staff are denied (`403`).
- **Requirements Reports (`RESTAURANT_REQUIREMENTS_REPORT.md:18, 148, 371`):**
  - `mayors_permit` is currently classified as **Mandatory (Universal)** in Step 3 (`BusinessDocumentsStep.jsx`) with no "not required locally" exemption or explanation field. `RESTAURANT_SIDE.md` does not define LGU-specific permit exemptions.

### 2.2 How `restaurant_status`, `is_published`, and Guards Work Today
- **`restaurants.restaurant_status` (`database/salo_db.sql:219`):** `ENUM('pending','approved','rejected','active','inactive','suspended') DEFAULT 'pending'`.
  - `'active'` is required by **every** `WorkspaceAccessResolver` guard (`requireActiveOwnedRestaurant`, `Orders`, `Inventory`, `MenuView`, `MenuManage`, `MenuPublish`), `OwnerBranchService`, `StaffInvitationService`, and `OwnerLayout.jsx` (which renders a full-page "Pending Activation" gate whenever `selectedRestaurant.status !== 'active'`).
- **`restaurants.is_published` (`database/salo_db.sql:220`):** `TINYINT(1) NOT NULL DEFAULT 0`.
  - `PublicRestaurantVisibility::applyVisibleRestaurantScope()` (`backend/app/Support/PublicRestaurantVisibility.php:15-32`) requires `restaurant_status = 'active'`, `is_published = 1`, and at least one published active category with a published approved non-hidden item.
  - `CheckoutService` (`backend/app/Features/Orders/Services/CheckoutService.php:93`) uses `PublicRestaurantVisibility::isVisible()`.
  - `MenuPublishService::assertPublishable()` validates menu + delivery coverage before setting `is_published = 1`.
  - `AdminManagementService::listRestaurants()` lists all `restaurants` rows but currently shows no branch permit status.

### 2.3 What Phase 3a and Phase 4a Do Today
- **Phase 3a (`AdminApplicationService::decide`, lines 515-582):** Materializes `restaurant_application_branches` as `restaurant_status = 'active'` and `is_published = 0` without permit verification.
- **Phase 4a (`OwnerBranchService::createBranch`, lines 110-250):** Creates child `restaurants` rows as `restaurant_status = 'active'` and `is_published = 0` immediately without any permit upload or admin verification.
- **Database State Note:** `salo_db` currently has **0 child branches** (only 3 root restaurants).

### 2.4 Frontend Audit
- **Wizard Step Order (`src/pages/BusinessApplication/constants/applicationDefaults.js:153-160`):**
  1. `verification` → 2. `business` → 3. `representative` → **4. `documents` (`BusinessDocumentsStep.jsx`)** → **5. `address` (`BusinessAddressStep.jsx`, where additional branches are declared)** → 6. `payout` → 7. `config` → 8. `review`.
- **Admin & Owner UI:** `ApplicationReviewModal.jsx`, `BusinessApplicationStatusPage.jsx`, `AddBranchModal.jsx`, `OwnerLayout.jsx`, `OwnerDashboard.jsx`, and `AdminRestaurantsPage.jsx` have no per-branch permit upload, status badges, or review controls.

---

## 3. Proposed Design

### 3.1 Data Model & History Strategy

**Options Compared:**
- **Option A — Overload `application_documents` with `restaurant_id`:** Breaks `chk_application_documents_one_owner`, complicates composite FKs (`uk_doc_requests_restaurant`), and cannot cleanly represent unmaterialized `application_branch_id` rows.
- **Option B — Extend `application_documents` with `application_branch_id` + separate post-approval table:** Duplicates upload, review, and storage logic across two code paths.
- **Option C (Recommended) — Single `branch_permits` table (one current row per branch, immutable history in `audit_logs`):**
  - **One current row per branch** (`UNIQUE KEY uk_branch_permits_restaurant (restaurant_id)` and `UNIQUE KEY uk_branch_permits_app_branch (application_branch_id)`) rather than one row per upload.
  - *Justification:* Enables O(1) unique-index `EXISTS` checks in `PublicRestaurantVisibility` (zero `MAX(id)` / `ORDER BY` subqueries) and prevents multiple conflicting active rows per branch. Per `SALO_DEVELOPMENT_RULES.md`, **historical data is never deleted**: every upload, rejection, waiver, and re-upload records an immutable `audit_logs` entry (`entity_type = 'branch_permits'`, `old_values`/`new_values` including `file_path`, `original_filename`, `permit_status`, `review_note`), and **rejected or superseded private files in storage are retained** (never unlinked on re-upload).
  - **Columns:**
    - `permit_id` (`BIGINT UNSIGNED AUTO_INCREMENT PK`)
    - `restaurant_id` (`BIGINT UNSIGNED NULL`, FK → `restaurants.restaurant_id` `RESTRICT`)
    - `application_branch_id` (`BIGINT UNSIGNED NULL`, FK → `restaurant_application_branches.application_branch_id` `RESTRICT`)
    - `is_required_locally` (`TINYINT(1) NOT NULL DEFAULT 1`)
    - `exemption_reason` (`VARCHAR(500) NULL` — required when `is_required_locally = 0`)
    - `file_path` (`VARCHAR(500) NULL` — private storage path)
    - `original_filename` (`VARCHAR(255) NULL`), `mime_type` (`VARCHAR(50) NULL`), `file_size_bytes` (`INT UNSIGNED NULL`)
    - `permit_status` (`ENUM('pending_submission','pending_review','under_review','additional_info_required','approved','rejected','waived') NOT NULL DEFAULT 'pending_submission'`)
    - `review_note` (`VARCHAR(500) NULL` — required when `rejected`, `additional_info_required`, or `waived`)
    - `uploaded_by` (`BIGINT UNSIGNED NULL`, FK → `users`), `uploaded_at` (`DATETIME NULL`)
    - `reviewed_by` (`BIGINT UNSIGNED NULL`, FK → `users`), `reviewed_at` (`DATETIME NULL`)
    - `created_at`, `updated_at`
  - **Unique Keys, Indexes & Constraints:**
    - `UNIQUE KEY uk_branch_permits_restaurant (restaurant_id)`
    - `UNIQUE KEY uk_branch_permits_app_branch (application_branch_id)`
    - `UNIQUE KEY uk_branch_permits_path (file_path)`
    - `KEY idx_branch_permits_rest_status (restaurant_id, permit_status)`
    - `KEY idx_branch_permits_status (permit_status)`
    - `CHECK (restaurant_id IS NOT NULL OR application_branch_id IS NOT NULL)`
    - `CHECK (is_required_locally = 1 OR CHAR_LENGTH(TRIM(COALESCE(exemption_reason,''))) > 0)`
    - `CHECK (permit_status = 'pending_submission' OR is_required_locally = 0 OR file_path IS NOT NULL)`
    - `CHECK (permit_status NOT IN ('rejected','additional_info_required','waived') OR CHAR_LENGTH(TRIM(COALESCE(review_note,''))) > 0)`
    - MIME (`application/pdf`, `image/jpeg`, `image/png`) and size (`1..10485760`) checks.

### 3.2 Fail-Closed Invariant, Exact Guards & Query Budget

- **Fail-Closed Invariant:** Every non-root branch (`parent_restaurant_id IS NOT NULL`) **MUST** have a `branch_permits` row with `permit_status IN ('approved', 'waived')` to be publishable or publicly visible. A non-root branch with **no** `branch_permits` row or any other `permit_status` is **hidden and unpublishable**. Root restaurants (`parent_restaurant_id IS NULL`) get **no** `branch_permits` row.
- **Immutability & Reopening Rules:**
  - Any transition of a `branch_permits` row from `'approved'` or `'waived'` to any other status **must** set `restaurants.is_published = 0` on that branch in the same database transaction.
  - An owner **cannot** re-upload a permit while `permit_status` is `'approved'` or `'waived'` (**`409 Conflict`**); only an admin can reopen/reject it first.
  - Private permit files are **never** deleted by any cleanup, orphan-sweep, or rollback routine when referenced by `audit_logs` (a failed-request rollback may delete only the file created during that failed request).
- **No Grandfathering in `salo_db`:** `salo_db` currently has **0 child branches** (only 3 root restaurants), so no grandfathering is needed in `salo_db`. `salo_test` also has `0` non-root rows at Permit-1 baseline; test fixtures creating child branches in `salo_test` attach a `branch_permits` row as needed.
- **Exact Guard Conditions:**
  1. **`PublicRestaurantVisibility::applyVisibleRestaurantScope($query, $alias)`:**
     ```sql
     AND (
       {$alias}.parent_restaurant_id IS NULL
       OR EXISTS (
         SELECT 1 FROM branch_permits bp
         WHERE bp.restaurant_id = {$alias}.restaurant_id
           AND bp.permit_status IN ('approved', 'waived')
       )
     )
     ```
     Uses `uk_branch_permits_restaurant` / `idx_branch_permits_rest_status` inside the existing query, adding **0 extra SQL queries** (`GET /api/restaurants` remains `<= 6` queries per `PublicRestaurantsTest`).
  2. **`CheckoutService`:** Calls `PublicRestaurantVisibility::isVisible($restaurantId)`, inheriting the exact same fail-closed check automatically.
  3. **`MenuPublishService::assertPublishable($restaurant)`:**
     - If `$restaurant->parent_restaurant_id !== null`, require `DB::table('branch_permits')->where('restaurant_id', $restaurant->restaurant_id)->whereIn('permit_status', ['approved', 'waived'])->exists()`. If false, add blocker `"Branch Mayor's / Business Permit must be verified or waived before publishing."` (`422`).
  4. **`salo:check-branch-integrity`:** Add five anomaly counters:
     - `non_root_missing_permit`: non-root `restaurants` rows with no `branch_permits` row.
     - `orphan_branch_permit`: `branch_permits` rows with neither `restaurant_id` nor `application_branch_id`.
     - `permit_app_branch_mismatch`: `branch_permits` rows whose `application_branch_id` -> `restaurant_application_branches.created_branch_restaurant_id` disagrees with `branch_permits.restaurant_id`.
     - `root_with_branch_permit`: `branch_permits` rows attached to a root (`parent_restaurant_id IS NULL`) restaurant.
     - `published_unverified_branch`: non-root `restaurants` rows with `is_published = 1` whose `branch_permits.permit_status` is not in `('approved','waived')`.

### 3.3 Main Branch Rules vs. Additional Branch Exemptions (Decision 4 Override)
- **Main / Root Branch:** Stays **mandatory** and **entirely in `application_documents`** (Step 3 `BusinessDocumentsStep.jsx`, existing review and status). Root restaurants get **no** `branch_permits` row and **no** exemption columns on `restaurant_applications`.
- **Additional Branches Only:** The `"not required locally"` declaration (`is_required_locally = 0`, `exemption_reason` required) and the admin `Waive` action apply **only** to additional (non-root) branches via `branch_permits`.
- **Admin Read-Only Derived Status for Root:** `GET /api/admin/applications/restaurant/{id}` and `GET /api/admin/restaurants` may return a derived, read-only `permit_status` for the root from `application_documents` (latest `mayors_permit`), alongside `branch_permits.permit_status` for each additional branch.

### 3.4 Upload Size & Two-Step Wizard / API Contract
To guarantee `post_max_size = 32M` is never exceeded on a 5-location application:
1. **Step 1 — Submit Application & Branch Metadata (`POST /api/restaurant/applications`):**
   - Submits business/main docs (as today) + `branches[]` metadata (`branch_name`, address fields, `contact_phone`, `permit_required_locally` default `true`, `permit_exemption_reason` required if `false`).
   - Backend creates `restaurant_application_branches` rows and corresponding `branch_permits` rows (`permit_status = 'pending_submission'` when `is_required_locally = true`, or `'pending_review'` when `is_required_locally = false`).
   - Returns `201 Created` with `application_branches[]` containing `application_branch_id` and `permit_status`.
2. **Step 2 — Per-Branch Permit Upload (`POST /api/restaurant/applications/{applicationId}/branches/{applicationBranchId}/permit`):**
   - Frontend uploads each required branch permit **in its own request** (1 file ≤ 10 MB per request, well under `32M`).
   - **Idempotent & Resumable:** Re-calling this endpoint updates the branch's `branch_permits` row (`pending_submission` → `pending_review`) and logs an audit entry.
   - **Failure / Refresh Handling:** The application is already saved; if one branch upload fails (network/timeout), the UI marks that branch `Upload failed — Retry` on the confirmation/status page (`BusinessApplicationStatusPage.jsx`) so the applicant can retry **only** the failed branch without re-submitting the application or re-uploading succeeded branches. Applications remain blocked from admin `approved` on that branch until uploaded, though the application itself is saved.

### 3.5 Access, Notifications & Approval Rules
- **Who May View / Upload / Re-upload a Branch Permit (`GET/POST .../permit`):**
  - **Before application approval:** `restaurant_applications.applicant_user_id === user.user_id` or `user_role === 'admin'`. Staff and other users receive `403`.
  - **After application approval:** `restaurant_owners` of the business (`brand_restaurant_id`) or `user_role === 'admin'`. **Staff always receive `403`** (including `Manager`).
- **Notifications:**
  - *Upload / Re-upload:* Notifies active **admins** (`branch_permit_submitted`).
  - *Admin decision (`approved`, `waived`, `rejected`, `additional_info_required`):* Notifies `applicant_user_id` (workspace `customer`) if pre-approval, or all `resolveRestaurantOwnerUserIds($branchId)` (workspace `restaurant`) if post-approval.
- **Application Approval with Unverified Additional Branch:**
  - When an admin approves the business + Main Branch while an additional branch's `branch_permits.permit_status` is `pending_submission`, `pending_review`, `additional_info_required`, or `rejected`:
    - The child `restaurants` row **is still materialized** (`restaurant_status = 'active'`, `is_published = 0`), and `branch_permits.restaurant_id` is linked to the new `restaurant_id`.
    - That child branch remains **unpublishable and hidden** until its permit is `approved` or `waived`.
    - `BusinessApplicationStatusPage.jsx` shows the business as `Approved` alongside a per-branch permit checklist showing which branches are ready vs. awaiting permit upload/review.

### 3.6 Admin & Owner Visibility
- **Admin Restaurants List (`GET /api/admin/restaurants` & `AdminRestaurantsPage.jsx`):** Every row returns `permit_status` and `is_required_locally`, rendering a dedicated **Permit** badge (`Verified`, `Waived`, `Pending Review`, `Under Review`, `Info Needed`, `Rejected`, `Pending Upload`) next to `restaurant_status` (`Active`) so an `'active'` branch is never mistaken for a permit-verified one.
- **Admin Branch Permits Queue:** Dedicated tab/view for reviewing `branch_permits` (start review, approve, reject with note, request info with note, waive with note; self-review blocked `403`; `lockForUpdate()` + `409` on stale transition).
- **Owner Workspace (`GET /api/restaurant/branches`, `/api/auth/me`, `OwnerLayout.jsx`, `OwnerDashboard.jsx`, `MenuPublishBar.jsx`, `AddBranchModal.jsx`):** Exposes `permit_status`, `permit_review_note`, and `is_required_locally`; `AddBranchModal` requires permit file or exemption reason; `MenuPublishBar` and `deriveBusinessSetupChecklist()` show `"Verify branch permit"` blocker; rejected/info-requested branches show an inline **Re-upload Permit** form (`POST /api/restaurant/branches/{id}/permit`).

---

## 4. Proposed Implementation Phases

| Phase | Scope | Required Tests & Verification |
|---|---|---|
| **Permit-1 (Schema & Integrity)** | Create `branch_permits` migration (no root/main exemption columns); extend `salo:check-branch-integrity` (`non_root_missing_permit`, `orphan_branch_permit`, `permit_app_branch_mismatch`, `root_with_branch_permit`, `published_unverified_branch`). Run on `salo_test` first; `salo_db` only after explicit approval + `mysqldump` backup. | Schema constraint tests (at-least-one, unique keys, FK RESTRICT, MIME/size, note-required, `pending_submission` checks); `salo:check-branch-integrity --env=testing` exits `0`. |
| **Permit-2 (Backend Add Branch, Publishing Guards & Admin Review)** | `OwnerBranchService` (`POST /api/restaurant/branches` multipart permit), `POST /api/restaurant/branches/{id}/permit`, private file route, `MenuPublishService`, `PublicRestaurantVisibility` (0 extra queries), `AdminBranchPermitController`/`Service`, `AdminManagementService` (`permit_status`). | Authz tests (owner vs staff `403`, outsider `403`, sibling branch `403`, self-review `403`); state transitions & `409` on stale state; publish blocked until verified/waived; post-publish rejection unpublishes (`is_published = 0`); `PublicRestaurantsTest` `<= 6` queries; `salo:check-branch-integrity` exits `0`. |
| **Permit-3 (Backend Initial Application Branches & Main Parity)** | Two-step upload (`POST /api/restaurant/applications` + `POST /api/restaurant/applications/{id}/branches/{branchId}/permit`), main-branch exemption/waive parity, `AdminApplicationService` materialization linking `restaurant_id` onto `branch_permits` even when permit is pending/rejected. | Applicant vs owner vs staff `403` private file tests; idempotent/resumable per-branch upload; approval with pending/rejected child branch creates unpublishable row; `AdminApplicationReviewTest` & `RestaurantApplicationWorkflowTest` green. |
| **Permit-4a (Frontend — Owner Workspace & Add Branch)** | `AddBranchModal.jsx` permit upload / exemption toggle, `OwnerLayout.jsx` switcher & `OwnerDashboard.jsx` permit badges, `MenuPublishBar.jsx` & `onboardingService.js` checklist blocker, inline re-upload on rejected/info-requested branch. | `npm test` (Add Branch validation/payload, publish blocker, re-upload state, staff hidden controls), `eslint`, `npm run build`. |
| **Permit-4b (Frontend — Wizard & Admin UI)** | Step 5 `BusinessAddressStep.jsx` per-branch permit cards + sequential per-branch upload with retry UI on failure, `ApplicationReviewStep.jsx`, `BusinessApplicationStatusPage.jsx`, `ApplicationReviewModal.jsx` (per-branch review), `AdminRestaurantsPage.jsx` permit badge, Admin Branch Permits queue. | `npm test` (upload failure/retry state, wizard payload, admin permit badge & review actions), `eslint`, `npm run build`. |
| **Permit-5 (`salo_db` Migration & `salo_db.sql` Sync)** | Verified `mysqldump` backup of `salo_db`, `php artisan migrate --force` on `salo_db`, `php artisan salo:check-branch-integrity` (`0` anomalies), and `database/salo_db.sql` sync. | Explicit user approval required before `salo_db` migration. |

---

## 5. Decisions Required Before Implementation

1. **Data Model:**
   - *Recommendation:* **Option C** — Single `branch_permits` table keyed by `restaurant_id` / `application_branch_id`, keeping `application_documents` intact.
   - *Alternative:* Overload `application_documents` with nullable `restaurant_id` and relax its 2-way XOR check constraint.
2. **History Model:**
   - *Recommendation:* **One current row per branch** in `branch_permits` (`UNIQUE(restaurant_id)`, `UNIQUE(application_branch_id)`) with immutable upload/review history in `audit_logs` and retained private files.
   - *Alternative:* Multi-row `branch_permits` (one row per upload, `current = latest`), requiring `MAX(permit_id)` subqueries in visibility/publish guards.
3. **Upload Size & Submission Flow:**
   - *Recommendation:* **Two-step submission** (`POST /api/restaurant/applications` creates branches + `branch_permits`, then per-branch `POST .../branches/{branchId}/permit` uploads 1 file ≤ 10 MB each, idempotent & resumable with retry UI).
   - *Alternative:* Keep a single multipart `POST /api/restaurant/applications` request and raise PHP `post_max_size` (fragile under proxy/server limits and fails all-or-nothing on one bad file).
4. **Main Branch Rules (Decision 4 — Overridden & Approved):**
   - *Approved:* Main/root branch permit stays **mandatory** and entirely in `application_documents` (Step 3, existing review and status). The `"not required locally"` declaration and `Waive` action apply to **additional branches only**. Root restaurants get **no** `branch_permits` row and **no** exemption columns on `restaurant_applications`; admin views show a derived, read-only permit status for the root from `application_documents`.
5. **Branch Status While Waiting for Verification:**
   - *Recommendation:* Keep `restaurants.restaurant_status = 'active'` + `is_published = 0`, fail-closed gated by `branch_permits.permit_status` in `MenuPublishService` and `PublicRestaurantVisibility`.
   - *Alternative:* Set `restaurants.restaurant_status = 'pending'` until permit approval and rewrite `WorkspaceAccessResolver` guards.
6. **Wizard Placement:**
   - *Recommendation:* Place each additional branch's permit upload (or exemption toggle) inside its branch card on **Step 5 (`BusinessAddressStep.jsx`)**.
   - *Alternative:* Swap Step 4 (`documents`) and Step 5 (`address`) globally.
7. **Staff Invitations on Unverified Branches:**
   - *Recommendation:* Allow owners to invite/prepare staff while the branch permit is pending (since `is_published = 0` prevents customer orders).
   - *Alternative:* Block `POST /api/restaurant/staff/invitations` until the branch permit is `approved`/`waived`.

---

## 6. Open Questions & Conflicting Docs

1. **Permit Expiry & Renewal (Out of Scope for Now):**
   - Future renewal would require `issued_at` / `expires_at` columns on `branch_permits`, a scheduled reminder command (`30/7` days before expiry), a renewal upload flow that does not unpublish while under review, and an admin policy on whether expired permits auto-unpublish (`is_published = 0`) or enter a grace period.
2. **Existing Docs That Conflict & Must Be Updated:**
   - **`docs/MULTI_BRANCH_PLAN.md` (Decision 5):** Currently states owner-added branches are immediately publishable (`restaurant_status = 'active', is_published = 0`); must be updated to *"active for setup, fail-closed blocked from publishing/visibility until branch permit is verified or waived"*.
   - **`docs/ADMIN_APPLICATION_REVIEW.md` (§3):** Currently states Phase 3a materializes child branches as immediately active without independent permit verification; must be updated with per-branch `branch_permits` linking.
   - **`docs/BRANCHES.md`:** Must be updated with multipart permit upload on `POST /api/restaurant/branches`, `POST /api/restaurant/branches/{id}/permit`, `permit_status` fields, and publish blocker rules.
   - **`RESTAURANT_REQUIREMENTS_REPORT.md` (§3 / Step 3):** Currently defines `mayors_permit` as unconditionally mandatory; must be updated for the "when required locally" exemption and admin waiver flow.
   - **`documentation/requirements/RESTAURANT_SIDE.md`:** Does not specify LGU permit exemptions or post-approval branch permit verification; must be updated when later permit phases are implemented.

---

## Permit-1 implemented (salo_test only)

Permit-1 schema and integrity checks are implemented on `salo_test` only (`salo_db` and `database/salo_db.sql` untouched):
- Added SQL proposal [2026_11_24_branch_permits.sql](file:///c:/xampp/htdocs/Salo_Final/database/proposals/2026_11_24_branch_permits.sql) and verified on a fresh MariaDB 10.11 scratch database cloned from `salo_test` schema.
- Added Laravel migration `2026_11_24_000001_create_branch_permits_table.php` with `up()` and `down()`, tested rollback (`--step=1 --env=testing`) and re-applied on `salo_test`.
- Extended `php artisan salo:check-branch-integrity` with the 5 `branch_permits` integrity checks.
- Added `BranchPermitsSchemaTest.php` covering constraints, unique keys, `ON DELETE RESTRICT` FKs, integrity checks, and migration `up()`/`down()`.

## Permit-2a implemented (salo_test only)
- Added `BranchPermitService` (`ALLOWED_TRANSITIONS`, `transitionStatus()` with `lockForUpdate()`, `409` invalid transition, and `is_published = 0` reset when leaving `approved`/`waived`; `submitOrUpdateForBranch()` retaining old files and auditing old/new paths; `streamPermitFile()`).
- Updated `RestaurantBranchService::createChildBranch()` to always create a default `'pending_submission'` `branch_permits` row inside the branch creation transaction.
- Updated `StoreBranchRequest`, `OwnerBranchController`, `OwnerBranchService`, and `routes/api.php` for optional permit/exemption on `POST /api/restaurant/branches`, plus `POST /api/restaurant/branches/{id}/permit` and `GET /api/restaurant/branches/{id}/permit/file`.
- Updated `OwnerBranchService::listAccessibleBranches()` and `User::resolveRoleContext()` to expose `permit_status`, `is_required_locally`, `review_note`, and `uploaded_at` only to owners on non-root branches.
- Updated `PublicRestaurantVisibility::applyVisibleRestaurantScope()` and `MenuPublishService::buildPublishStatusForRestaurant()` with fail-closed `branch_permits` checks for non-root branches.
- Added `BranchPermitsOwnerFlowTest.php` covering creation, re-upload matrix, file streaming authorization, visibility/publish/checkout guards, and status transitions.

## Permit-2b implemented (salo_test only)
- Extended `BranchPermitService::transitionStatus()` with `pending_submission` admin transition guard (`409`), `reopen` / `start_review` guards, `waive` `is_required_locally=false` guard (`422`), `review_note` min-length (`10–500` chars) validation (`422`) for `reject`/`request-info`/`waive`/`reopen`, and `file_path` + `reviewed_by` audit logging.
- Added `AdminBranchPermitService` and `AdminBranchPermitController` + routes under `/api/admin/branch-permits*` (`index`, `show`, `file`, `start-review`, `approve`, `reject`, `request-info`, `waive`, `reopen`), blocking self-review (`403`) and dispatching `branch_permit_approved` / `_rejected` / `_info_requested` / `_waived` / `_reopened` notifications to owners (or applicant if application not yet approved) without file paths.
- Updated `AdminManagementService::listRestaurants()` to return `permit_status` and `is_required_locally` (batched root derived read-only status from `application_documents`, `'not_submitted'` when none; non-root from `branch_permits`, 0 N+1).
- Updated `RestaurantApplicationService::loadApplicationBranches()` to include additive `permit_id`, `permit_status`, `permit_is_required_locally`, `permit_exemption_reason`, and `permit_review_note` on `branches[]`.

### Admin Review Transition Table
| Current Status | `start-review` (`under_review`) | `approve` (`approved`) | `reject` (`rejected`, note 10–500) | `request-info` (`additional_info_required`, note 10–500) | `waive` (`waived`, `is_required_locally=false`, note 10–500) | `reopen` (`under_review`, note 10–500) |
|---|---|---|---|---|---|---|
| `pending_submission` | `409` | `409` | `409` | `409` | `409` | `409` |
| `pending_review` | `200` | `200` | `200` | `200` | `200` (or `422`) | `409` |
| `under_review` | `409` | `200` | `200` | `200` | `200` (or `422`) | `409` |
| `additional_info_required` | `200` | `200` | `200` | `409` | `200` (or `422`) | `409` |
| `rejected` | `200` | `200` | `409` | `409` | `200` (or `422`) | `409` |
| `approved` | `409` | `409` | `200` (unpublishes) | `200` (unpublishes) | `409` | `200` (unpublishes) |
| `waived` | `409` | `409` | `200` (unpublishes) | `200` (unpublishes) | `409` | `200` (unpublishes) |
