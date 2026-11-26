# SALO File Uploads & Storage Architecture

## 1. Overview

SALO separates **public** storefront assets from **private** compliance/delivery files and **local-only** assets:

- **Public images** (restaurant logo, cover photo, menu item photos, rider profile photos) use `PUBLIC_IMAGE_STORAGE` (`local` or `google_drive`, served via `/api/media/images/{fileId}` when on Drive).
- **Private Drive-scoped files** (restaurant/rider application documents, branch permits, rider delivery confirmation photos, and future support attachments) use `PRIVATE_FILE_STORAGE` (`local` or `google_drive`), streamed only via authenticated, role-authorized backend routes with `appProperties.visibility=private` enforcement.
- **Always local:** restaurant gallery, platform assets, admin banners, default placeholder images, and `profile_change_requests` supporting documents (routed through `StoragePurpose::PROFILE_CHANGE_DOCUMENT` on the `local` driver).

| Classification | Driver / Disk | Location | DB Value Stored | Access Method |
| --- | --- | --- | --- | --- |
| **Public (Local driver, default)** | `local` (`public` disk) | `backend/storage/app/public/` | Relative path only (e.g. `restaurants/{id}/{uuid}.png`) | Resolved to `{APP_URL}/storage/{path}` |
| **Public (Drive driver)** | `google_drive` | `SALO/Restaurants/{Name} [R-{id}]/...` | `gdrive:{fileId}` | Resolved to `{APP_URL}/api/media/images/{fileId}` (backend proxy + `drive-cache`, fails closed unless `visibility=public`) |
| **Private (Local driver, default)** | `local` | `backend/storage/app/private/` | Relative path only (e.g. `applications/restaurant/{id}/{uuid}.pdf`) | Authenticated backend stream routes |
| **Private (Drive driver)** | `google_drive` | `SALO/Applications/...`, `SALO/Riders/...`, `SALO/Support/...` | `gdrive:{fileId}` | Authenticated backend stream routes (never shared in Drive; fails closed unless `visibility=private`) |

---

## 2. Endpoints

- `POST /api/restaurant/applications` (`auth` middleware)
  - Accepts `multipart/form-data` with:
    - `logo_image` (optional image: `jpg`, `jpeg`, `png`, `webp`, max 5 MB)
    - `cover_image` (optional image: `jpg`, `jpeg`, `png`, `webp`, max 5 MB)
    - `menu_items[i][name|description|category|price|available]` & `menu_item_photos[i]` (optional initial menu items & dish photos, capped at **8 items** so total files per request stay within PHP's `max_file_uploads = 20` and `post_max_size = 32M`; stored as `approval_status = 'pending'` and hidden from public `/api/restaurants/{id}/menu` until restaurant & items are approved)
    - `documents[code]` (required array, min 1; `pdf`, `jpg`, `jpeg`, `png`, max 5 MB each)
- `POST /api/restaurant/applications/{id}/documents` (`auth` middleware, owner-only)
  - Accepts `document_code`, optional `request_id`, and `file`.
- `POST /api/rider/applications` (`auth` middleware)
  - Accepts `multipart/form-data` with `documents[code]` (`pdf`, `jpg`, `jpeg`, `png`, max 5 MB each).
- `POST /api/rider/applications/{id}/documents` (`auth` middleware, owner-only)
  - Accepts `document_code`, optional `request_id`, and `file`.
- `GET /api/applications/documents/{documentId}/file` (`auth` middleware)
  - Streams private files with `Cache-Control: private, no-store, max-age=0` and `X-Content-Type-Options: nosniff`.
  - **Authorization:** Permitted only for `admin`, the uploader (`uploaded_by`), the application's `applicant_user_id`, or an owner in `restaurant_owners`. All others receive `403 Forbidden`.
  - **Audit logging:** Both successful views and denied attempts are logged to `audit_logs` using `document_id` (deduped per user + document within 10 minutes).
- `POST /api/rider/deliveries/{orderId}/delivered` (`auth` + `role:rider`)
  - Accepts optional `proof_photo` (`jpg`, `jpeg`, `png`, `webp` only — no PDF; resized & EXIF-stripped server-side). Required only when `SALO_DELIVERY_PROOF_REQUIRED=true`.
- `GET /api/rider/deliveries/{orderId}/proof` (`role:rider`), `GET /api/customer/orders/{id}/delivery-proof` (`auth`), `GET /api/admin/orders/{id}/delivery-proof` (`role:admin`)
  - Streams `deliveries.proof_photo` to the assigned rider, the order's customer, or admin with 10-minute deduped `audit_logs` tracking. *(Open policy item: restaurant owner/staff viewing of `proof_photo` is currently excluded.)*
- `POST /api/rider/profile/photo` & `DELETE /api/rider/profile/photo` (`auth` + `role:rider`)
  - Uploads or removes `riders.profile_photo` (`jpg`, `jpeg`, `png`, `webp`, max 5 MB; resized to max 1024px & EXIF-stripped server-side via `StoragePurpose::RIDER_PROFILE_PHOTO`, stored under `riders/{rider_id}/profile/` locally or `Riders/{Rider name} [U-{userId}]/Profile Photo/` on Drive with `visibility=public`). Old unreferenced file is cleaned up after commit.
- `GET /api/media/images/{fileId}` (public, `throttle:600,1`)
  - Streams public Drive-stored images (`gdrive:{fileId}`) only if referenced by `restaurants.logo_image`, `restaurants.cover_image`, `menu_items.photo_image`/`published_photo_image`, or `riders.profile_photo` AND `appProperties.visibility === 'public'` (fails closed with `404` otherwise).
  - Uses a read-through cache in `backend/storage/app/private/drive-cache/` when `GOOGLE_DRIVE_PROXY_CACHE=true`, with `Cache-Control: public, max-age=31536000, immutable`, `ETag`, `X-Content-Type-Options: nosniff`, and `Content-Security-Policy: default-src 'none'`. Public image requests are not audit-logged.

---

## 3. Validation & Security Controls (`FileStorageService`)

- **Per-file limit:** `5120 KB` (5 MB), configured in `backend/config/salo.php` (`salo.uploads.max_size_kb`).
- **MIME & content verification:**
  - Uses server-side `finfo` MIME detection (`$file->getMimeType()`), ignoring client-supplied `Content-Type`.
  - Images (`image/jpeg`, `image/png`, `image/webp`) are verified with `getimagesize()` and GD (`imagecreatefrom*`) to reject renamed scripts or malformed images.
  - PDFs (`application/pdf`) are checked for the `%PDF-` file signature.
- **Filename & extension hardening:**
  - Rejects executable extensions (`.php`, `.phtml`, `.exe`, `.sh`, `.js`, `.svg`, `.html`, etc.) anywhere in the filename and rejects double extensions (e.g., `shell.php.jpg`, `fake.jpg.png`).
  - Generates unpredictable UUID filenames (`Str::uuid()`) using the canonical extension from the verified MIME type.
- **Safe replacement:** `FileStorageService::replacePublicImage()` (and the owner media/menu update flows) stores the new image first (on local disk or Google Drive via `PublicImageStore`), commits the DB update, and deletes the old file only if no database record still references it.
- **Failure handling:** If Google Drive is unreachable, rate-limited, over quota, or has invalid credentials, `ImageStorageUnavailableException` returns `503` via `ApiResponse::error` and no half-saved DB record is committed. There is no silent fallback to local disk.
- **Oversized POST handling:** `PostTooLargeException` on `/api/*` returns a `413` JSON error (`ApiResponse::error`) instead of failing silently.

---

## 4. Local Environment Setup (XAMPP)

### PHP `php.ini` Requirements
In `C:\xampp\php\php.ini`, ensure PHP's request limits accommodate multi-file application submissions (5 MB per file):

```ini
file_uploads=On
upload_max_filesize=10M
post_max_size=32M
max_file_uploads=20
```

Restart Apache in the XAMPP Control Panel after editing `php.ini`.

### Storage Symlink (`storage:link`)
When using the `local` public image driver (`PUBLIC_IMAGE_STORAGE=local`), public files are served via `backend/public/storage` -> `backend/storage/app/public`. To create or verify the link:

```powershell
cd backend
php artisan storage:link
```

### Google Drive Public Image Configuration (`backend/.env`)
See [DRIVE_SETUP.md](./DRIVE_SETUP.md) for the step-by-step Google Cloud setup. Keys in `backend/.env` (never commit values or expose them in `VITE_*` variables):

- `PUBLIC_IMAGE_STORAGE` (`local` default, or `google_drive`)
- `PRIVATE_FILE_STORAGE` (`local` default, or `google_drive`)
- `SALO_DELIVERY_PROOF_REQUIRED` (`false` default)
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_PUBLIC_FOLDER_ID` (reused as the `SALO` root folder ID)
- `GOOGLE_DRIVE_TIMEOUT_SECONDS` (default `20`)
- `GOOGLE_DRIVE_PROXY_CACHE` (`true` default)

Artisan commands:
- `php artisan salo:drive:init-folder` — creates the dedicated Drive root folder and prints its ID.
- `php artisan salo:images:migrate-to-drive --dry-run` — previews migrating local public images to Drive (never deletes local files).
- `php artisan salo:drive:reorganize-public --dry-run` — previews moving flat-folder public Drive images into `SALO/Restaurants/...` and tagging `visibility=public` (no DB changes).
- `php artisan salo:private-files:migrate-to-drive --dry-run` — previews migrating local private files (`application_documents`, `branch_permits`, `deliveries.proof_photo`) to Drive (never deletes local files).
- `php artisan salo:drive:check-permissions` — verifies owner-only permissions across `Applications/`, `Riders/`, and `Support/`.
- `php artisan salo:drive:purge-rejected --dry-run` — lists rejected-application files past the 90-day retention period.
- `php artisan salo:drive:orphans` — read-only walk of the whole `SALO` Drive tree listing unreferenced files.

### Retention & Open Policy Items
- **Rejected/withdrawn applications:** 90-day retention, manually purged via `salo:drive:purge-rejected` (`--dry-run` first).
- **Open items:** Retention rules for approved applicants, deactivated riders, RA 10173 data-deletion requests, and whether restaurant owners/staff may view `deliveries.proof_photo`.

---

## 5. QA & Testing Environment Safety

- Any manual or automated QA flow (such as `backend/.env.qa`) **must target `salo_test` only** — never `salo_db` or any production/working database. Verify `SELECT DATABASE()` is `salo_test` before running QA scripts.
- QA runs that create database rows or upload files outside PHPUnit's `DatabaseTransactions` **must clean up** all created database records and stored files afterward so `salo_test` remains clean for automated tests (e.g. `PublicRestaurantsTest`).
