# SALO File Uploads & Local Storage Architecture

## 1. Overview

SALO uses **local application storage only** (`backend/config/filesystems.php`) with strict separation between **public** storefront assets and **private** application/compliance documents.

| Classification | Disk | Root Directory | DB Value Stored | Access Method |
| --- | --- | --- | --- | --- |
| **Public** (restaurant logo, cover photo, menu item photos) | `public` | `backend/storage/app/public/` | Relative path only (e.g. `restaurants/{id}/{uuid}.png`) | Resolved to `{APP_URL}/storage/{path}` |
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
- **Safe replacement:** `FileStorageService::replacePublicImage()` stores the new file first and deletes the old file only if no database record still references it.
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
Public files are served via `backend/public/storage` -> `backend/storage/app/public`. To create or verify the link:

```powershell
cd backend
php artisan storage:link
```

---

## 5. QA & Testing Environment Safety

- Any manual or automated QA flow (such as `backend/.env.qa`) **must target `salo_test` only** — never `salo_db` or any production/working database. Verify `SELECT DATABASE()` is `salo_test` before running QA scripts.
- QA runs that create database rows or upload files outside PHPUnit's `DatabaseTransactions` **must clean up** all created database records and stored files afterward so `salo_test` remains clean for automated tests (e.g. `PublicRestaurantsTest`).
