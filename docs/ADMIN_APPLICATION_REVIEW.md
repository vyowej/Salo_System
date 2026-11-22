# SALO Admin Application Review & Approval

## 1. Endpoints

All endpoints below are under `/api/admin/applications` and require `auth` + `role:admin` middleware (`users.user_role === 'admin'` and active account). Self-review (`applicant_user_id === admin.user_id`) is blocked with `403 Forbidden`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/applications?type=restaurant\|rider` | Paginated list with `status`, `search`, `date_range`, `page`, `per_page`. Resolves public logo/cover URLs. |
| `GET` | `/api/admin/applications/{type}/{id}` | Full application detail, branding, initial menu items, private document links, and audit history. |
| `PATCH` | `/api/admin/applications/{type}/{id}/documents/{documentId}` | Mark document `verified` or `rejected` (`review_note` required when `rejected`). |
| `POST` | `/api/admin/applications/{type}/{id}/document-requests` | Request additional information/document (`document_name`, `reason` required); transitions `under_review` → `additional_documents_required`. |
| `POST` | `/api/admin/applications/{type}/{id}/decision` | Transition status (`under_review`, `additional_documents_required`, `approve`, `reject`). |

---

## 2. Status Transition Table

Enforced on the backend in `AdminApplicationService::ALLOWED_TRANSITIONS`. Invalid transitions return **`409 Conflict`**; missing required `note` returns **`422 Unprocessable Entity`**.

| Current Status | Allowed Next Statuses (Admin) | Applicant Transition |
| --- | --- | --- |
| `submitted` | `under_review` | — |
| `pending_review` | `under_review` | — |
| `resubmitted` | `under_review` | — |
| `under_review` | `additional_documents_required` (requires message), `approved`, `rejected` (requires reason) | — |
| `additional_documents_required` | *(none)* | `resubmitted` when applicant uploads requested document |
| `approved` | *(terminal)* | *(terminal)* |
| `rejected` | *(terminal)* | *(terminal)* |

Every action records an `audit_logs` entry inside the same database transaction with `actor_user_id`, `action`, `old_values.application_status`, `new_values.application_status`, and `reason`.

---

## 3. Approval & Rejection Side Effects

- **Restaurant Approval (`approved`):**
  - Sets `restaurants.restaurant_status = 'active'` on the root restaurant (`is_published` remains `0` until the owner/manager publishes the menu).
  - Sets `menu_items.approval_status = 'approved'` for the root restaurant's `pending` items in the same transaction.
  - **Multi-Branch Materialization (Phase 3a):** If the application includes rows in `restaurant_application_branches`, approval materializes each additional branch inside the same database transaction via `RestaurantBranchService::createChildBranch()`:
    - Creates a child `restaurants` row (`parent_restaurant_id = root.restaurant_id`, `brand_restaurant_id = root.brand_restaurant_id`, `restaurant_status = 'active'`, `is_published = 0`, `contact_phone` falling back to root if omitted).
    - Copies `restaurant_owners` (Strategy B), `restaurant_category_map`, and `operating_hours` from the root restaurant.
    - Clones the initial menu (`menu_categories`, `menu_items`, `add_on_groups`, `add_on_options`) as `approval_status = 'approved'` and unpublished (`is_published = 0`, `draft_state = 'new'`).
    - Sets `restaurant_application_branches.created_branch_restaurant_id` to the new child `restaurant_id` and records one `audit_logs` entry (`action = 'restaurant_branch_created'`) per created branch with `brand_restaurant_id` and `branch_name` in `new_values`.
    - Does **not** copy `service_areas` (configured per branch) and does **not** create child `payout_accounts` (shared with root). Any error while creating a branch rolls back the entire approval.
  - Does **not** alter `accepting_orders` or `accepting_reservations`.
- **Restaurant Rejection (`rejected`):**
  - Sets `restaurants.restaurant_status = 'rejected'` on the root restaurant. Pending `restaurant_application_branches` rows remain attached to the application record with `created_branch_restaurant_id = NULL` (no child `restaurants` rows are created).
- **Rider Approval (`approved`):**
  - Sets `riders.rider_status = 'approved'` and `riders.approved_at = now()`.
  - Approval grants rider portal/dashboard access (`User::hasDerivedRole('rider')`) **without** making the rider eligible to go online (`RiderService::updateAvailability()` requires `rider_status === 'active'`).
- **Rider Rejection (`rejected`):**
  - Sets `riders.rider_status = 'rejected'`.

---

## 4. Bootstrapping the First Admin (`salo:bootstrap-admin`)

To create the initial administrator account interactively (refuses if any admin already exists):

```powershell
cd backend
php artisan salo:bootstrap-admin
```

Verify the target database (`DB_DATABASE` in `backend/.env` or `--env=testing` for `salo_test`) before running.

---

## 5. Open Policy Questions & Future Work

- **Granular admin permissions:** Currently any active `user_role = 'admin'` account can review restaurant and rider applications (`ADMIN_SIDE.md` proposes per-role/per-permission admin accounts; deferred as future work).
- **Admin MFA:** Multi-factor authentication for admin actions is not yet implemented (future work).
- **Required-document checklist lock:** Currently manual admin judgment; no programmatic block if an optional document is unverified.
- **Review SLAs, auto-expiry, & commission assignment:** Manual decisions only; no auto-approval, timers, or commission configuration during review.
- **Applicant & Admin notifications:** In-app notifications are recorded inside the review transaction (see [NOTIFICATIONS.md](./NOTIFICATIONS.md)). Email/SMS/push providers remain future work.

## Branch Permits Admin Review (Permit-2b)
- `GET /api/admin/applications/restaurant/{id}` includes additive `branches[].permit_id`, `branches[].permit_status`, `branches[].is_required_locally`, `branches[].exemption_reason`, `branches[].review_note`, and `branches[].has_file` (plus `permit_is_required_locally`, `permit_exemption_reason`, `permit_review_note`) for both pre-materialization and materialized branches.
- `GET /api/admin/restaurants` includes `permit_status` and `is_required_locally` on every row: non-root branches read directly from `branch_permits`, while root restaurants derive a read-only `permit_status` from the latest `mayors_permit` row in `application_documents`:
  - `verified` → `approved`
  - `rejected` → `rejected`
  - `pending` → `pending_review`
  - `under_review` → `under_review`
  - no `mayors_permit` row → `not_submitted`
  - `is_required_locally` is always `true` for root restaurants.
- **Permit-3 Two-Step Application Flow & Materialization:**
  - `POST /api/restaurant/applications` creates `restaurant_application_branches` and `branch_permits` (`restaurant_id = NULL`) in the same transaction (`pending_submission` when `permit_required_locally` is true/omitted; `pending_review` when false with `permit_exemption_reason`).
  - `POST /api/restaurant/applications/{applicationId}/branches/{applicationBranchId}/permit` uploads a single permit file (`<= 10 MB`) or updates the exemption declaration while the application is non-terminal; once approved/materialized, it returns `409` pointing to `POST /api/restaurant/branches/{id}/permit`.
  - Pre-materialization admin permit reviews (`GET /api/admin/branch-permits*`, `start-review`, `approve`, `reject`, `request-info`, `waive`, `reopen`) notify the applicant (`customer` workspace) and block self-review against `applicant_user_id`.
  - On application approval (Phase 3a), `RestaurantBranchService::createChildBranch()` reuses each branch's existing `branch_permits` row by setting `restaurant_id` (no duplicate row). Business approval never depends on branch permit statuses; unverified branches are still created as `active`, `is_published = 0`, hidden and unpublishable until `approved` or `waived`.
- Dedicated admin branch permit endpoints (`role:admin`, self-review blocked with `403`):
  - `GET /api/admin/branch-permits` (`status`, `search`, `submitted_date`, `per_page`)
  - `GET /api/admin/branch-permits/{permitId}` (detail + `review_note` + `file_url` only if a file exists)
  - `GET /api/admin/branch-permits/{permitId}/file` (private stream)
  - `POST /api/admin/branch-permits/{permitId}/start-review | approve | reject | request-info | waive | reopen` (`reject`, `request-info`, `waive`, `reopen` require `review_note` of 10–500 chars; `waive` requires `is_required_locally = false` else `422`; invalid/stale transitions return `409`; leaving `approved`/`waived` sets `restaurants.is_published = 0` in the same transaction; approving does not publish).
