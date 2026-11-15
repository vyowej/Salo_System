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
  - `phone_number`: nullable, max 30 chars, `[0-9+\-\s()]{7,30}`
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
