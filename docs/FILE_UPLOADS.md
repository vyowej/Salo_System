# SALO File Uploads & Storage Architecture

## 1. Overview

SALO separates **public** storefront assets from **private** application/compliance documents:

- **Private files** (application permits, IDs, rider documents, future proof of delivery) always use **local application storage only** (`local` disk) behind backend authorization.
- **Public images** (restaurant logo, cover photo, menu item photos) use the `PublicImageStore` abstraction configured via `PUBLIC_IMAGE_STORAGE` (`local` by default, or `google_drive` when enabled).

| Classification | Driver / Disk | Location | DB Value Stored | Access Method |
| --- | --- | --- | --- | --- |
| **Public (Local driver, default)** | `local` (`public` disk) | `backend/storage/app/public/` | Relative path only (e.g. `restaurants/{id}/{uuid}.png`) | Resolved to `{APP_URL}/storage/{path}` |
| **Public (Drive driver)** | `google_drive` | Dedicated app-created Drive folder | `gdrive:{fileId}` | Resolved to `{APP_URL}/api/media/images/{fileId}` (backend proxy + `drive-cache`) |
| **Private** (restaurant & rider application documents) | `local` | `backend/storage/app/private/` | Relative path only (e.g. `applications/restaurant/{id}/{uuid}.pdf`) | Protected backend stream route `/api/applications/documents/{documentId}/file` |

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
- `GET /api/media/images/{fileId}` (public, `throttle:600,1`)
  - Streams public Drive-stored images (`gdrive:{fileId}`) only if referenced by `restaurants.logo_image`, `restaurants.cover_image`, or `menu_items.photo_image` (otherwise `404`).
  - Uses a read-through cache in `backend/storage/app/private/drive-cache/` when `GOOGLE_DRIVE_PROXY_CACHE=true`, with `Cache-Control: public, max-age=31536000, immutable`, `ETag`, `X-Content-Type-Options: nosniff`, and `Content-Security-Policy: default-src 'none'`.

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
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_PUBLIC_FOLDER_ID`
- `GOOGLE_DRIVE_TIMEOUT_SECONDS` (default `20`)
- `GOOGLE_DRIVE_PROXY_CACHE` (`true` default)

Artisan commands:
- `php artisan salo:drive:init-folder` — creates the dedicated Drive folder and prints its ID.
- `php artisan salo:images:migrate-to-drive --dry-run` — previews migrating local public images to Drive (never deletes local files).
- `php artisan salo:drive:orphans` — read-only report of Drive files in the folder not referenced by any DB row.

---

## 5. QA & Testing Environment Safety

- Any manual or automated QA flow (such as `backend/.env.qa`) **must target `salo_test` only** — never `salo_db` or any production/working database. Verify `SELECT DATABASE()` is `salo_test` before running QA scripts.
- QA runs that create database rows or upload files outside PHPUnit's `DatabaseTransactions` **must clean up** all created database records and stored files afterward so `salo_test` remains clean for automated tests (e.g. `PublicRestaurantsTest`).
