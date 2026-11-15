# SALO Authentication & Authorization Documentation

## 1. Overview & Localhost Setup

SALO uses custom **cookie-based session authentication** backed by Laravel's built-in session, cookie-encryption, and CSRF protection middleware (`SESSION_DRIVER=file`). No prebuilt authentication starter kits or token packages (Sanctum, Passport, Fortify, Breeze, JWT) are used, and no tokens are stored in `localStorage`.

### Required Localhost Hostname Configuration
So that `SameSite=Lax` and `HttpOnly` session cookies work across the React SPA and the Laravel API, **both** servers must run on `localhost` (do not mix `localhost` and `127.0.0.1`):

- **Frontend (Vite):** `http://localhost:5173` (`npm run dev`)
- **Backend (Laravel):** `http://localhost:8000`
  ```bash
  cd backend
  php artisan serve --host=localhost --port=8000
  ```
- **CORS (`backend/config/cors.php`):**
  - `paths`: `['api/*']`
  - `allowed_origins`: `['http://localhost:5173']`
  - `supports_credentials`: `true`
- **Session Cookie (`backend/config/session.php`):**
  - `http_only`: `true`
  - `same_site`: `'lax'`
  - `secure`: `false` in `local`/`testing`, `true` in non-local environments

---

## 2. Frontend Cookie & CSRF Flow

All `api/*` routes run through `EncryptCookies`, `AddQueuedCookiesToResponse`, `StartSession`, `PreventRequestForgery`, and `EnsureAccountIsActive`.

1. **Include credentials on all requests:**
   - Fetch: `credentials: 'include'`
   - Axios: `withCredentials: true`
2. **Initialize CSRF before state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`):**
   - Call `GET http://localhost:8000/api/auth/csrf` with credentials included.
   - Laravel sets the `XSRF-TOKEN` cookie and also returns `data.csrf_token` in the JSON body.
   - On subsequent state-changing requests, either:
     - Send the `X-CSRF-TOKEN` header set to `data.csrf_token`, **or**
     - Read the `XSRF-TOKEN` cookie (URL-decoded) and send it in the `X-XSRF-TOKEN` header.
   - Missing or mismatched CSRF tokens return `419` (`{"success": false, "message": "CSRF token mismatch."}`).

---

## 3. Endpoints (`/api/auth/*`)

### 3.1 `GET /api/auth/csrf`
Initializes the session and returns a CSRF token (while also setting the `XSRF-TOKEN` cookie).

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "CSRF token initialized.",
  "data": {
    "csrf_token": "<token>"
  }
}
```

### 3.2 `POST /api/auth/register`
Creates a new customer account (`user_role = 'customer'`, `account_status = 'active'`), hashes the password into `users.password_hash`, logs the user in, and regenerates the session ID. Any `user_role` or `role` field supplied by the client is ignored.

**Request Body:**
```json
{
  "username": "juan_delacruz",
  "first_name": "Juan",
  "middle_initial": "M",
  "last_name": "Dela Cruz",
  "email": "juan@example.com",
  "password": "Password123!",
  "password_confirmation": "Password123!"
}
```

**Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Account registered successfully.",
  "data": {
    "user": {
      "user_id": 1,
      "username": "juan_delacruz",
      "first_name": "Juan",
      "middle_initial": "M",
      "last_name": "Dela Cruz",
      "email": "juan@example.com",
      "phone_number": null,
      "date_of_birth": null,
      "user_role": "customer",
      "account_status": "active",
      "email_verified_at": null,
      "roles": ["customer"],
      "capabilities": {
        "is_customer": true,
        "is_admin": false,
        "is_restaurant_owner": false,
        "is_restaurant_staff": false,
        "is_rider": false
      },
      "restaurant_ownerships": [],
      "restaurant_staff_assignments": [],
      "rider_profile": null
    }
  }
}
```

### 3.3 `POST /api/auth/login`
Authenticates by `email` and `password`, rate-limited to 5 attempts per 60 seconds per `email|IP`. Regenerates the session ID on success.
- Invalid email or password returns `401` (`"Invalid credentials."`).
- Non-active accounts (`suspended`, `inactive`, `pending`) return `403` (`"Account is not active."`).

**Request Body:**
```json
{
  "email": "juan@example.com",
  "password": "Password123!"
}
```

### 3.4 `POST /api/auth/logout` *(Requires `auth`)*
Logs out the current user, invalidates the session, and regenerates the CSRF token.

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Logged out successfully.",
  "data": null
}
```

### 3.5 `GET /api/auth/me` *(Requires `auth`)*
Returns the fresh user profile and all derived roles (`customer`, `admin`, `owner`, `staff`, `rider`) resolved from `users.user_role`, `restaurant_owners`, `restaurant_staff` (`staff_status = 'active'`), and `riders` (`rider_status IN ('approved', 'active')`). Never exposes `password_hash`.

If an already-authenticated user's `account_status` changes to `suspended`, `inactive`, or `pending`, `EnsureAccountIsActive` immediately logs them out, invalidates the session, and returns `403`.

### 3.6 `POST /api/auth/password/forgot`
Rate-limited by `email|IP` (5 attempts per 60 seconds).
- For an existing **active** account:
  1. Generates a single-use 64-character token and stores only its bcrypt hash in `password_reset_tokens.token_hash` with a UTC `expires_at` (60 minutes), invalidating any prior unused tokens for that user.
  2. Sends a plain-text email (`App\Features\Auth\Mail\PasswordResetMail`) using Laravel's built-in `Mail` and `.env` SMTP settings containing the reset link:
     `{FRONTEND_URL}/reset-password?token=<plain_token>&email=<encoded_email>`
     (where `FRONTEND_URL` is read via `config('app.frontend_url')`, defaulting to `http://localhost:5173`).
  3. If SMTP delivery fails, logs a generic error (`user_id` only; no token, link, or SMTP credentials) and still returns the identical `200 OK` response.
- Never returns the reset token in the API response, and returns the exact same `200 OK` JSON payload whether or not the email exists.
- **Timing note:** Because `QUEUE_CONNECTION=sync` sends SMTP mail synchronously, a request for an existing active email can take slightly longer than a request for an unknown email. Recommended mitigation when moving beyond local sync mode: dispatch the mailable after the HTTP response is sent (`defer()` / `terminating()` callback) or via an approved background queue worker.

**Request Body:**
```json
{
  "email": "juan@example.com"
}
```

### 3.7 `POST /api/auth/password/reset`
Rate-limited by `email|IP`. Validates the single-use token against unexpired, unused rows in `password_reset_tokens`, marks `used_at`, and updates `users.password_hash`.

**Request Body:**
```json
{
  "email": "juan@example.com",
  "token": "<plain-reset-token>",
  "password": "NewPassword456!",
  "password_confirmation": "NewPassword456!"
}
```

---

## 4. Role Middleware & First-Admin Bootstrap

- **Role Middleware (`role:<role>`):** Registered alias for `App\Http\Middleware\RequireRole`. Supports `role:customer`, `role:admin`, `role:owner` (`restaurant_owner`), `role:staff` (`restaurant_staff`), and `role:rider` (or multiple comma-separated roles).
- **First Admin CLI Command:**
  ```bash
  cd backend
  php artisan salo:bootstrap-admin
  ```
  Prompts interactively for first name, last name, username, email, and hidden confirmed password; refuses to run if any `user_role = 'admin'` row already exists; creates the admin with `account_status = 'active'` and `email_verified_at = now()`; and writes an `audit_logs` entry (`actor_user_id = null`, `action = 'bootstrap_admin'`).
