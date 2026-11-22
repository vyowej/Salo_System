# SALO In-App Notifications & Staff Invitations

## 1. Design Principle

Notifications belong to a **SALO user account** (`users.user_id`), not to a single role. Because one SALO account can simultaneously act as a customer, restaurant owner/staff, rider, and/or admin, every notification carries a `workspace` tag (`customer`, `restaurant`, `rider`, `admin`) so the workspace switcher can filter and count unread notifications per workspace without mixing roles.

- **In-app only:** No email, SMS, or push providers are used for notifications.
- **Transaction-safe:** Every notification is inserted inside the same `DB::transaction()` as the underlying business event. If a transaction rolls back or a transition is invalid (`409`), zero notifications are persisted.
- **Privacy:** Notification text never includes sensitive document numbers, private addresses, or other users' private contact info. Other users appear by `first_name` only.

---

## 2. Workspaces & Endpoints

All notification endpoints require cookie-session authentication (`auth` middleware), are rate-limited (`throttle:120,1`), use the standard `ApiResponse` envelope, and enforce strict user ownership (accessing another user's notification returns `404`).

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/notifications` | Paginated list (`page`, `per_page`, optional `workspace`, optional `unread_only`), newest first. |
| `GET` | `/api/notifications/unread-count` | Unread `total` plus `by_workspace` (`customer`, `restaurant`, `rider`, `admin`). |
| `POST` | `/api/notifications/{id}/read` | Mark a single notification as read (`404` if not owned by the authenticated user). |
| `POST` | `/api/notifications/read-all` | Mark all unread notifications as read (optional `workspace` filter). |

---

## 3. Notification Events & Recipients

| Event | Workspace | `type` | Recipients | `related_entity_type` |
| --- | --- | --- | --- | --- |
| Order placed (checkout) | `restaurant` | `order_received` | Restaurant owner(s) + active staff in `salo.orders.handler_positions` | `order` |
| Order accepted | `customer` | `order_accepted` | Order customer | `order` |
| Order rejected | `customer` | `order_rejected` | Order customer (includes rejection reason) | `order` |
| Order preparing | `customer` | `order_preparing` | Order customer | `order` |
| Order ready (pickup / dispatch) | `customer` | `order_ready` | Order customer | `order` |
| Rider accepted delivery | `customer` | `delivery_rider_assigned` | Order customer (rider `first_name` only) | `order` |
| Rider accepted delivery | `restaurant` | `delivery_rider_assigned` | Restaurant owner(s) + active order-handler staff | `order` |
| Order picked up (`out_for_delivery`) | `customer` | `order_out_for_delivery` | Order customer (rider `first_name` only) | `order` |
| Order delivered | `customer` | `order_delivered` | Order customer (rider `first_name` only) | `order` |
| Pickup order completed | `customer` | `order_completed` | Order customer | `order` |
| Customer cancelled pending order | `customer` | `order_cancelled` | Order customer | `order` |
| Customer cancelled pending order | `restaurant` | `order_cancelled_by_customer` | Restaurant owner(s) + active order-handler staff | `order` |
| Restaurant application submitted | `admin` | `restaurant_application_submitted` | All active admins (excluding applicant) | `restaurant_applications` |
| Rider application submitted | `admin` | `rider_application_submitted` | All active admins (excluding applicant) | `rider_applications` |
| Additional documents resubmitted | `admin` | `restaurant_application_resubmitted` / `rider_application_resubmitted` | All active admins (excluding applicant) | `restaurant_applications` / `rider_applications` |
| Application under review | `customer` | `restaurant_application_under_review` / `rider_application_under_review` | Applicant | `restaurant_applications` / `rider_applications` |
| Additional documents requested | `customer` | `restaurant_application_additional_documents_required` / `rider_application_additional_documents_required` | Applicant (includes requested document/reason) | `restaurant_applications` / `rider_applications` |
| Restaurant application approved | `restaurant` | `restaurant_application_approved` | Applicant (restaurant workspace is ready) | `restaurant_applications` |
| Rider application approved | `rider` | `rider_application_approved` | Applicant (awaiting admin activation) | `rider_applications` |
| Application rejected | `customer` | `restaurant_application_rejected` / `rider_application_rejected` | Applicant (includes rejection reason) | `restaurant_applications` / `rider_applications` |
| Rider activated by admin | `rider` | `rider_activated` | Rider user | `rider` |
| Staff invitation sent | `customer` | `staff_invitation_received` | Invitee user (inviter `first_name` only) | `staff_invitation` |
| Staff invitation cancelled | `customer` | `staff_invitation_cancelled` | Invitee user | `staff_invitation` |
| Staff invitation accepted | `restaurant` | `staff_invitation_accepted` | Restaurant owner(s) | `staff_invitation` |
| Staff invitation declined | `restaurant` | `staff_invitation_declined` | Restaurant owner(s) | `staff_invitation` |
| Reservation requested | `restaurant` | `reservation_requested` | Restaurant owner(s) + active reservation-handler staff | `reservation` |
| Reservation confirmed (auto-confirm / approve / deposit) | `customer` | `reservation_confirmed` | Reservation customer | `reservation` |
| Reservation approved awaiting deposit | `customer` | `reservation_awaiting_payment` | Reservation customer | `reservation` |
| Reservation rejected | `customer` | `reservation_rejected` | Reservation customer (includes rejection reason) | `reservation` |
| Reservation completed | `customer` | `reservation_completed` | Reservation customer | `reservation` |
| Reservation marked no-show | `customer` | `reservation_no_show` | Reservation customer | `reservation` |
| Reservation cancelled by customer | `restaurant` | `reservation_cancelled_by_customer` | Restaurant owner(s) + active reservation-handler staff | `reservation` |
| Reservation cancelled by restaurant | `customer` | `reservation_cancelled_by_restaurant` | Reservation customer (includes cancellation reason and refund note if refunded) | `reservation` |
| Reservation deposit received | `customer` | `reservation_deposit_received` | Reservation customer (when marked paid without status transition) | `reservation` |
| Reservation deposit waived | `customer` | `reservation_deposit_waived` | Reservation customer | `reservation` |
| Reservation deposit refunded | `customer` | `reservation_deposit_refunded` | Reservation customer (includes refunded amount) | `reservation` |
| Reservation expired | `customer`, `restaurant` | `reservation_expired` | Customer always; restaurant handlers also notified on `awaiting_payment` expiry | `reservation` |
| Reservation expiring soon | `restaurant` | `reservation_expiring_soon` | Restaurant owner(s) + active reservation-handler staff (`expiry_warning_sent_at` once-only guard) | `reservation` |
| Reservation upcoming reminder | `customer` | `reservation_reminder` | Confirmed reservation customer inside lead window (`reminder_sent_at` once-only guard) | `reservation` |
| Reservation dining area changed | `customer` | `reservation_table_changed` | Reservation customer (emitted when dining area changes) | `reservation` |

---

## 4. Staff Invitations

### Endpoints

| Method | Endpoint | Auth / Role | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/restaurant/staff` | `auth`, `role:owner` | List staff and invitations for an owned active restaurant. |
| `POST` | `/api/restaurant/staff/invitations` | `auth`, `role:owner`, `throttle:20,1` | Invite an existing active SALO user by `username` or `email` (`staff_position`, optional `note`). |
| `POST` | `/api/restaurant/staff/invitations/{id}/cancel` | `auth`, `role:owner` | Cancel a `pending` invitation. |
| `GET` | `/api/account/staff-invitations` | `auth` | List invitations for the authenticated user account. |
| `POST` | `/api/account/staff-invitations/{id}/accept` | `auth` | Accept a `pending` invitation (`lockForUpdate`, activates `restaurant_staff`). |
| `POST` | `/api/account/staff-invitations/{id}/decline` | `auth` | Decline a `pending` invitation (`lockForUpdate`). |

### Statuses & Rules
- **API Statuses:** `pending` (stored as `invited`), `accepted` (stored as `active`), `declined`, `cancelled`, `expired` (plus `inactive` for deactivated staff).
- **Expiry:** Default `7` days from `config('salo.staff.invitation_expiry_days')`, checked on read and on accept/decline/cancel (no scheduled job).
- **Positions:** Validated against `config('salo.staff.positions')` (`Manager`, `Order Handler`, `Order Staff`, `Reservation Handler`, `Reservation Staff`, `Inventory Manager`, `Menu Manager`). Order-handling permissions still depend on `config('salo.orders.handler_positions')`.
- **Guards:**
  - Invitee must already have an active SALO account; unknown accounts return a neutral `200` response (rate-limited) to prevent account enumeration.
  - Self-invites and inviting an existing owner of the same restaurant are blocked (`422`).
  - Duplicate pending or active invitations for the same `(restaurant_id, user_id)` return `409 Conflict`.
  - Only the restaurant owner of an `active` restaurant can invite or cancel (`403` otherwise).
  - Accepting uses `DB::transaction()` + `lockForUpdate()`, re-checks status and expiry, sets `staff_status = 'active'`, `responded_at`, and `joined_at`, and records `audit_logs`.

---

## 5. Limitations & Out of Scope (Future Work)

- **Granular admin permissions:** No per-permission admin roles exist yet, so all active `user_role = 'admin'` accounts receive admin notifications.
- **No `user_account_types` table:** Staff role membership is derived dynamically by `User::resolveRoleContext()` from `restaurant_staff.staff_status = 'active'`.
- **Out of scope:** Email/SMS/push delivery, notification preferences, reservation/refund/payout/earnings notifications, `delivery_available` broadcast (deferred until `riders` has a real DB availability column instead of `Cache`-only `rider:availability:{rider_id}`), staff permission editing, removing staff, ownership transfer, and scheduled expiry/cleanup jobs.
