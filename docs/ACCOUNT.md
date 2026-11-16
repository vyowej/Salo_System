# SALO Account API

All `/api/account/*` endpoints require an authenticated session cookie (`auth` middleware) and CSRF protection on mutating requests (`PATCH`, `PUT`).

## Endpoints

### `PATCH /api/account/profile`

Updates allow-listed profile fields on the authenticated `users` row.

- **Allowed fields:** `username`, `first_name`, `middle_initial`, `last_name`, `phone_number`, `date_of_birth`
- **Restricted fields (ignored if sent):** `email`, `user_role`, `account_status`, `password_hash`, `email_verified_at`
- **Validation:**
  - `username`: 3–50 chars, `[a-zA-Z0-9._-]`, unique across `users.username` (ignoring the current user)
  - `first_name`, `last_name`: max 100 chars
  - `middle_initial`: nullable, 1 char (normalized to uppercase)
  - `phone_number`: nullable, Philippine mobile number (`09XXXXXXXXX` or `+639XXXXXXXXX`, stripped of spaces/hyphens/parentheses and normalized to `09XXXXXXXXX`, regex `^09\d{9}$`, validation message: `"Pakilagay ang tamang numero ng cellphone (hal. 09171234567)."`)
  - `date_of_birth`: nullable, valid date before today
- **Response (`200`):** `{ success: true, message: "Profile updated.", data: { user: { ... } } }` (same `user` shape as `GET /api/auth/me`)

### `PUT /api/account/password`

Changes the authenticated user's password.

- **Request body:** `current_password`, `password` (min 8 chars, `different:current_password`), `password_confirmation`
- **Rate limit:** 5 failed `current_password` attempts per 60 seconds per user + IP (`429`)
- **Behavior:**
  - Verifies `current_password` against `users.password_hash` (`422` on mismatch)
  - Updates `users.password_hash` with `Hash::make`
  - Regenerates the current session ID
  - Writes an `audit_logs` row (`action = 'password_changed'`, `entity_type = 'users'`, `entity_id = user_id`)
  - Does not invalidate other devices' file-based sessions (see Decisions needed in Step 4 report)
- **Response (`200`):** `{ success: true, message: "Password updated.", data: null }`

### `GET /api/account/applications`

Returns the authenticated user's latest restaurant and rider partner applications, or `null` if none exist.

- **Response (`200`):**
  ```json
  {
    "success": true,
    "message": "Applications retrieved.",
    "data": {
      "restaurant_application": {
        "type": "restaurant",
        "status": "needs_correction",
        "submitted_at": "2026-11-13T12:00:00+08:00",
        "updated_at": "2026-11-14T12:00:00+08:00",
        "reviewer_note": "Please upload a clearer Mayor's Permit."
      },
      "rider_application": null
    }
  }
  ```
- Never exposes `reviewed_by`, internal metadata, or another user's applications.

---

## Role-Based Onboarding Modals

SALO uses a single reusable onboarding modal component (`src/components/onboarding/RoleOnboardingModal.jsx`) and a shared hook (`src/hooks/useRoleOnboarding.js`), configured via per-role content files (`src/config/onboarding/*`).

### How "Completed or Skipped" Is Remembered

- **Mechanism:** A non-sensitive, per-user, per-role flag is stored in the browser (`localStorage` with an in-memory fallback) under the key `salo_onboarding_{user_id}_{role}` where `role` is one of `customer`, `rider`, or `business`.
- **Value shape:** `{ "status": "completed" | "skipped", "updatedAt": "<ISO-8601 timestamp>" }`
- **Why this approach:**
  - Keeps zero authentication tokens or credentials in `localStorage` (complying with `SALO_DEVELOPMENT_RULES.md`).
  - Requires no changes to the approved `database/salo_db.sql` schema.
  - Because one SALO account can hold multiple roles (`customer`, `rider`, `owner`), keying by `user_id + role` guarantees that completing or skipping Customer onboarding never hides Rider or Business onboarding.
  - Tradeoff: Because the flag lives in browser storage, onboarding can appear once on a new device or after clearing site data.

### Skipping Behavior

- Every step includes a step-level skip (`"Laktawan muna"`).
- Whole-onboarding skip (`"Mamaya na lang"`, close `X` button, `Escape` key, or clicking outside the dialog) prompts a single confirmation:
  - Message: `"Sigurado ka bang lalaktawan muna ito? Pwede mo itong gawin anytime."`
  - Buttons: `"Oo, laktawan"` and `"Ituloy ang setup"`

### Role 1: Customer Onboarding

- **Trigger:** Authenticated customer on the Customer Dashboard (`/customer`, `/customer/restaurants`) who has **no saved phone number** (`users.phone_number` is empty), **no saved delivery address** (`GET /api/customer/addresses` returns `[]`), and has not completed or skipped `salo_onboarding_{user_id}_customer`.
- **Steps:**
  1. **Welcome:** `"Welcome, {username}!"`
  2. **Phone Number (`"Ano ang numero mo?"`):** Accepts `09XXXXXXXXX` or `+639XXXXXXXXX`, normalizes to `09XXXXXXXXX`, and saves via `PATCH /api/account/profile`.
  3. **Delivery Address (`"Saan ka namin ihahatid?"`):** Reuses `CustomerAddressForm` (from `src/features/customer/components/AddressFormModal.jsx`) and saves via `POST /api/customer/addresses`. The first saved address automatically becomes the customer's default address (`user_addresses.is_default = 1`).
  4. **Finish:** `"Tapos na! Handa ka nang mag-order."` (or `"Okay lang! Pwede mo itong dagdagan anytime sa Settings."` if any step was skipped).

### Role 2: Rider Onboarding

- **Trigger:** Authenticated, **approved/active** rider opening the Rider workspace (`/rider*`) for the first time (`salo_onboarding_{user_id}_rider` not yet set). Never shown to pending, rejected, suspended, or inactive applicants.
- **Endpoints Used:** Read-only `GET /api/rider/dashboard` (`auth`, `role:rider`). No write endpoints are used; application data is never re-asked.
- **Steps:**
  1. **Welcome:** `"Welcome, {username}!"`
  2. **How Deliveries Work (`"Paano ito gumagana"`):** Explains going online during shifts, accepting/declining offers within the response window, and the delivery status progression (`Accepted` -> `Picked up` -> `Delivered`).
  3. **Before You Go Online (`"Bago ka mag-online"`):** Displays real Go Online requirements derived from `GET /api/rider/dashboard` (`rider_status`, `base_city`, `stats.has_active_delivery`, and optional shift data if present; missing backend fields are omitted rather than faked). Browser geolocation permission is requested **only** when the rider clicks the location permission button.
  4. **Safety & COD (`"Ligtas at maayos na delivery"`):** Road safety and Cash-on-Delivery remittance rules from `RIDER_SIDE.md`.
  5. **Finish:** `"Handa ka na!"` -> `"Tara, mag-deliver tayo!"`

### Role 3: Business / Restaurant Owner Onboarding

- **Trigger:** Authenticated, **approved/active** restaurant owner opening the Restaurant workspace (`/owner*`) for the first time (`salo_onboarding_{user_id}_business` not yet set). Never shown to restaurant staff, admins, or unapproved applicants.
- **Endpoints Used:** Read-only `GET /api/restaurant/setup-status` (`auth`, `role:owner`, scoped to the authenticated owner's approved/active restaurant in `restaurant_owners`).
- **Steps:**
  1. **Welcome:** `"Welcome, {username}!"`
  2. **Setup Checklist (`"Ihanda ang restaurant mo"`):** Derives done/not-done status from real restaurant data for Business Profile (`/owner/profile`), Operating Hours (`/owner/profile?tab=hours`), Menu (`/owner/menu`), Tables (`/owner/tables`, shown only when dine-in or reservations are offered), and Accepting Orders / Reservations toggles.
  3. **Good to Know (`"Mga dapat mong malaman"`):** Explains live order acceptance/rejection, stock/Sold Out updates, and staff role assignment.
  4. **Finish:** `"Handa nang buksan ang kusina!"` -> `"Simulan na ang setup"` (navigates to the first incomplete setup page, or `/owner` if all items are complete).
- **Overview Setup Checklist Card:** `SetupChecklistCard` on the Restaurant Overview (`/owner`) displays remaining setup items for approved owners, can be dismissed (`salo_setup_checklist_dismissed_{user_id}_{restaurant_id}`), and automatically disappears once all applicable items are complete.

