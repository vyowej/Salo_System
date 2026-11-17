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
  - Sets `restaurants.restaurant_status = 'active'` (making it visible on public `/api/restaurants` and `/api/restaurants/{id}`).
  - Sets `menu_items.approval_status = 'approved'` for that restaurant's `pending` items in the same transaction (making initial menu items visible on `/api/restaurants/{id}/menu`).
  - Does **not** alter `accepting_orders` or `accepting_reservations`.
- **Restaurant Rejection (`rejected`):**
  - Sets `restaurants.restaurant_status = 'rejected'`.
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
- **Applicant notifications:** Applicants see updated statuses on their status pages; no email/SMS/push notification provider is wired for review decisions.
