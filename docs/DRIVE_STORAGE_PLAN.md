# SALO — Google Drive File Storage Architecture & Plan

> **Status: APPROVED & IMPLEMENTED (Structured Drive Tree for Scoped Public & Private Files).**
> `documentation/SALO_DEVELOPMENT_RULES.md` (§2, §2.1 item 11, §16) was amended in commit `dd08f5e` to allow Google Drive for: public restaurant/menu images, delivery confirmation photos, application documents, branch permits, and support attachments. Everything else (restaurant gallery, platform assets, admin banners, default placeholders, and `profile_change_requests` supporting documents) stays local.

## 0. Structured Drive Layout & Safeguards (Implemented)

- **Root:** `GOOGLE_DRIVE_PUBLIC_FOLDER_ID` serves as the `SALO` root folder.
- **Hierarchy:**
  - `Restaurants/{Restaurant name} [R-{brandId}]/Logo/`, `Cover Photo/`, `Menu/{Category}/`, `Branches/{Branch name} [R-{branchId}]/Menu/{Category}/` (`visibility=public`)
  - `Riders/{Rider name} [U-{userId}]/Profile Photo/` (`visibility=public`) and `Riders/{Rider name} [U-{userId}]/Delivery Confirmations/{YYYY-MM}/` (`visibility=private`)
  - `Applications/Restaurant Applications/{Owner} - {Restaurant} [A-{appId}]/` + `Branch Permits/{Branch name} [R-{branchId}|AB-{appBranchId}]/` (`visibility=private`)
  - `Applications/Rider Applications/{Rider name} [A-{appId}]/` (`visibility=private`)
  - `Support/{Ticket or report ref}/` (`visibility=private`, reserved for future support feature)
- **Safeguards:**
  - Folders are resolved by Drive `appProperties` (`salo_type`, `salo_id`, `visibility`), cached in Laravel cache with 404 recovery, and created with `Cache::lock` concurrency guards.
  - Opaque UUID filenames (`uuid.ext`); public/delivery images are resized & EXIF-stripped via PHP GD (`ImageProcessor`).
  - Both public proxy (`/api/media/images/{fileId}`) and private streaming (`FileStorageService::streamPrivateStoredFile`) fail closed unless `appProperties.visibility` matches (`public` vs `private`).
  - Private-file views and `403` denials are logged in `audit_logs` by document row ID (deduped 10 minutes per user + document).
  - **Retention & Open Items:** 90-day retention for rejected applications (`salo:drive:purge-rejected --dry-run`); open items: retention for approved applicants, deactivated riders, RA 10173 data-deletion requests, and restaurant viewing of `deliveries.proof_photo`.

---

## 1. Audit Findings (Phase 1, read-only)

### 1.1 Git status (before audit)

`On branch main — up to date with origin/main — nothing to commit, working tree clean.` The only new file from Phase 1 is this document.

### 1.2 Central upload pipeline (Step 6a)

All uploads go through one class: [FileStorageService.php](../backend/app/Support/FileStorageService.php).

| Method | Role | Disk |
| --- | --- | --- |
| `storePublicImage()` | logo / cover / menu photo | `public` (`backend/storage/app/public`) |
| `storePrivateDocument()` | application documents | `local` (`backend/storage/app/private`) |
| `storeFile()` (private) | validation: `isValid`, filename/double-ext/executable blocklist, size ≤ `salo.uploads.max_size_kb` (5120), `finfo` MIME, `getimagesize` + GD decode, `%PDF-` check, UUID filename, then `storeAs()` | both |
| `replacePublicImage()` | store new, delete old if unreferenced | `public` (currently unused by callers) |
| `deleteIfUnreferenced($disk, $path, $isReferenced)` | delete only if no row references it | any |
| `cleanupStoredPaths($public, $private)` | orphan cleanup after rollback/exception | `public` / `local` |
| `publicUrl($stored)` | `{APP_URL}/storage/{relative}`; passes through `http(s)://` values; strips legacy `/storage/` | — |
| `normalizeRelativePath()` | strips legacy `/storage/` and `storage/` prefixes | — |
| `streamPrivateFile()` | authz-protected private stream, `no-store` | `local` |

Only the **final `storeAs()` call, the deletes, and `publicUrl()`** are storage-specific. All validation happens before storage, so it can be reused unchanged for any driver.

### 1.3 Where public images are written, replaced and deleted

| Flow | Endpoint | Service / method | Behaviour |
| --- | --- | --- | --- |
| Registration logo + cover | `POST /api/restaurant/applications` | `RestaurantApplicationService::storeRestaurantBranding()` | Stored **inside** `DB::transaction`; paths collected in `$storedPublicPaths`; `cleanupStoredPaths()` in `catch` |
| Registration menu photos (≤ 8) | same | `RestaurantApplicationService::insertInitialMenuItems()` | same, dir `restaurants/{id}/menu` |
| Owner logo/cover replace/remove | `POST /api/restaurant/owner/profile/media` | `OwnerProfileService::updateMedia()` → `resolveUpdatedImagePath()` → `persistBrandingUpdate()` → `deleteUnreferencedImageIfReplaced()` | Upload **before** transaction; cleanup on failure; old file deleted after commit only if `isPublicImageReferenced()` is false (checks `restaurants.logo_image/cover_image`, raw + `/storage/` form) |
| Owner menu item create | `POST /api/restaurant/owner/menu/items` | `OwnerMenuService::createItem()` | Upload before transaction; cleanup on failure |
| Owner menu item update / photo remove | `POST|PATCH …/menu/items/{id}` | `OwnerMenuService::updateItem()` → `deleteOldMenuPhotoIfReplaced()` | Same pattern; `isMenuPhotoReferenced()` checks `menu_items.photo_image` |
| Owner menu item delete | `DELETE …/menu/items/{id}` | `OwnerMenuService::deleteItem()` | Row deleted in transaction, photo deleted after commit if unreferenced |

Private (stay local, out of scope): restaurant/rider application documents (`RestaurantApplicationService::storeApplicationDocuments`, `RiderApplicationService`), `ProfileChangeRequestService` supporting documents (note: line 648 deletes with `Storage::disk('local')` directly), stream route `GET /api/applications/documents/{documentId}/file`.

### 1.4 Where URLs are built (read side)

All via `FileStorageService::publicUrl()`:

- `RestaurantService` — public list/detail (`logo_path`, `cover_path`) and public menu (`photo_path`)
- `RestaurantApplicationService::formatApplication` — `logo_image`, `cover_image`, menu `photo_url`
- `AdminApplicationService` — `logo_image`, `cover_image`
- `OwnerProfileService::formatProfile`, `OwnerMenuService::formatItem` (`photo_url`)
- `CustomerOrderService` — `restaurant_logo_url`

**Gap found:** `AdminManagementService` (admin restaurant list, line ~170) selects `rest.logo_image` / `rest.cover_image` and returns the **raw relative path**, not a resolved URL. With Drive IDs this would expose an unusable value; it must be routed through the resolver in Phase 2 (small, in-scope fix).

### 1.5 Frontend

- Uploads use `FormData`: [BusinessApplicationPage.jsx](../src/pages/BusinessApplication/BusinessApplicationPage.jsx) (`logo_image`, `cover_image`, `menu_item_photos[i]`), [ownerService.js](../src/services/ownerService.js) (`logo_image`, `cover_image`, `remove_logo`, `photo`).
- Display uses backend-supplied absolute URLs; `resolveBackendUrl()` in [applicationService.js](../src/services/applicationService.js) passes `http(s)://` values through unchanged. **No frontend change is needed** if the backend keeps returning absolute URLs.
- `ImageUploader.jsx` shows a cosmetic `/storage/{path}` hint text (lines ~434, ~611). Display-only; can stay or be reworded later (UI unchanged per instructions).
- `RestaurantImage.jsx` already has an `onError` fallback (graceful when an image fails).

### 1.6 Database columns holding image paths

From `database/salo_db.sql` (authoritative schema):

| Table.column | Type | Content | Scope |
| --- | --- | --- | --- |
| `restaurants.logo_image` | `VARCHAR(500) NULL` (comment "Local file path") | relative path e.g. `restaurants/1/{uuid}.jpg` | **Public → Drive** |
| `restaurants.cover_image` | `VARCHAR(500) NULL` (comment "Local file path") | same | **Public → Drive** |
| `menu_items.photo_image` | `VARCHAR(500) NULL` | `restaurants/{id}/menu/{uuid}.ext` | **Public → Drive** |
| `application_documents.file_path` | `VARCHAR(500) NOT NULL`, unique | private path | **Stays local** |
| `deliveries.proof_photo` | `VARCHAR(500) NULL` | not yet implemented | **Stays local** (proof of delivery) |

No user/rider avatar column exists (frontend `user.avatar` is not backed by a column). `public/users/profiles`, `public/riders/profiles`, `public/promotions` and slug/`{restaurant_id}` gallery folders contain only `.gitkeep` placeholders — no feature writes there today. **No other public image was found.**

### 1.7 Existing local data

- `backend/storage/app/public` contains **4 real image files**: `restaurants/1/` (2 × .jpg, ~116 KB and ~96 KB) and `restaurants/2/` (2 × .png, ~515 KB and ~1.4 MB) — most likely logo + cover for restaurants 1 and 2. **No menu photos on disk.**
- `backend/storage/app/private` contains 16 private documents (stay local).
- A root-level `storage/app/public/...` tree exists with `.gitkeep` files only (unused scaffold).
- `salo_db.sql` is schema-only (no `INSERT` data). **I did not query `salo_db`** (instruction: do not touch the database). To confirm which rows point to local files, the owner may approve these **read-only** queries:

```sql
SELECT restaurant_id, logo_image, cover_image FROM restaurants
WHERE logo_image IS NOT NULL OR cover_image IS NOT NULL;
SELECT menu_item_id, restaurant_id, photo_image FROM menu_items WHERE photo_image IS NOT NULL;
```

### 1.8 Consistency with existing docs/scripts

- `docs/FILE_UPLOADS.md`: "relative path only" in DB, URL resolved at read time, safe replacement, private stream route. The proposed design keeps all of these principles (store an identifier, never a URL; resolve at read time).
- `database/normalize_restaurant_image_paths.sql`: strips legacy `/storage/` prefixes. Still valid; not a prerequisite for the migration because the command will use `normalizeRelativePath()`, which already handles both forms. It should still be run (with approval) only if legacy-prefixed rows exist.

### 1.9 Environment facts relevant to the decision

- `composer.json` requires only `laravel/framework`, `laravel/tinker`. `composer.lock` already contains `guzzlehttp/guzzle` (transitive dependency of the framework), so Laravel's `Http::` client is available **without adding any package**.
- `phpunit.xml` sets `DB_DATABASE=salo_test`; 7 feature tests already use `Storage::fake()`.
- `CACHE_STORE=file` (usable for caching a short-lived access token).
- `.env`, `.env.*` are git-ignored at root and in `backend/`.

---

## 2. Option Analysis and Recommendations

### A. Authentication method

| | Service account | OAuth2 refresh token (owner's Gmail) |
| --- | --- | --- |
| Works with a normal `@gmail.com` account | **No** for uploads. Service accounts have no storage quota; uploads into a personal My Drive folder fail with `storageQuotaExceeded`. Requires a **Shared Drive** (Google Workspace only) or domain-wide delegation (Workspace admin only). | **Yes.** Files count against the owner's 15 GB quota. |
| Implementation without a new package | Needs RS256 JWT signing (would push toward `google/apiclient` or `firebase/php-jwt`, or hand-rolled signing, which §5.3 discourages). | Plain `POST https://oauth2.googleapis.com/token` with `grant_type=refresh_token` — trivial with `Http::`. |
| Secret held by backend | JSON private key (full power over its own Drive) | Client ID, client secret, refresh token |
| Main risks | Key leakage; Workspace requirement | Token leakage gives access to **only the files the app created** if scope is `drive.file`; token can be revoked by the owner in Google Account → Security |
| Known operational limits | — | (1) If the OAuth consent screen is left in **"Testing"**, refresh tokens **expire after 7 days**. Set publishing status to **"In production"**; with only the non-sensitive `drive.file` scope, no Google verification is required. (2) A refresh token unused for 6 months, or revoked, stops working → re-issue. |

**Recommendation: OAuth2 refresh token, scope `https://www.googleapis.com/auth/drive.file` only.** This is the only option that works with a normal Gmail account, needs no dependency, and limits blast radius: the app can see/modify only files and folders it created itself — never the rest of the owner's Drive.

Consequence of `drive.file`: the app must **create its own root folder** (a one-time artisan command prints the folder ID to put into `.env`). A folder created manually in the Drive UI is not visible to the app.

### B. Client approach

| | `google/apiclient` (Composer) | Laravel `Http::` client → Drive REST v3 |
| --- | --- | --- |
| New dependency | Yes: `google/apiclient` + `google/apiclient-services` (very large generated package covering all Google APIs, unless pruned via a Composer script) + `google/auth`, `firebase/php-jwt`, `monolog`, `phpseclib`, `psr/*` | **None** (Guzzle is already installed via the framework) |
| Supply-chain / maintenance risk | Higher (many transitive packages to keep patched) | Minimal |
| Effort | Lower for complex use | We need only 5 calls: token refresh, multipart upload, get media, delete, create folder (+ list for orphan audit) |
| Testability | Mock SDK classes | `Http::fake()` + `Http::preventStrayRequests()` (built-in) |

**Recommendation: Laravel `Http::` client, no new dependency.** Endpoints used:

- `POST https://oauth2.googleapis.com/token` (refresh → access token, cached ~55 min in Laravel cache; never logged)
- `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,mimeType,size` (files are ≤ 5 MB so multipart upload is sufficient; no resumable upload needed)
- `GET https://www.googleapis.com/drive/v3/files/{id}?alt=media`
- `DELETE https://www.googleapis.com/drive/v3/files/{id}`
- `POST https://www.googleapis.com/drive/v3/files` (folder create, setup only), `GET …/files?q=…` (orphan report only)

### C. Serving images to the browser

| | Public "anyone with the link" + direct Drive URL | **Backend proxy route with caching** |
| --- | --- | --- |
| Reliability | Poor. `drive.google.com/uc?export=view&id=…` is not an image-hosting API; Google throttles hotlinking, shows virus-scan/interstitial pages, has changed/blocked these URLs (third-party cookie changes), and `thumbnailLink`/`lh3` URLs are short-lived or undocumented. | Stable URL owned by SALO: `{APP_URL}/api/media/images/{fileId}` |
| Privacy | Every file becomes publicly shared on Google; the Drive viewer page can expose the **owner's Google account name/email** | Files stay **private** in Drive; Google never sees end users |
| Control | Cannot revoke per image except by unsharing; anyone can enumerate via Google | Backend can refuse IDs that are not referenced by a public column; can rate-limit |
| Cost | No server bandwidth | Server streams bytes → mitigated by caching |
| Credential exposure | None | None (token stays server-side) |

**Recommendation: backend proxy route**, `GET /api/media/images/{fileId}`:

1. Validate `{fileId}` format (`^[A-Za-z0-9_-]{10,128}$`).
2. Serve only if the value `gdrive:{fileId}` is referenced by `restaurants.logo_image`, `restaurants.cover_image` or `menu_items.photo_image` (keeps "public = what the DB publishes", and the endpoint cannot be used to read any other Drive file). Otherwise `404`.
3. Read-through **disk cache** in `backend/storage/app/drive-cache/` (private disk area, not web-served). Images are immutable (a replacement always gets a new file ID), so cache entries never go stale; cache can be deleted at any time and is rebuilt from Drive. *(This is a cache, not the system of record. It needs approval because §22.8 requires approval for caching infrastructure; it uses only the existing filesystem — no Redis/CDN.)*
4. Response headers: `Content-Type` from the cached metadata (only `image/jpeg|png|webp` allowed), `Cache-Control: public, max-age=31536000, immutable`, `ETag`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, `Content-Security-Policy: default-src 'none'`.
5. Throttle (e.g. `throttle:600,1` per IP).
6. If Drive is unreachable and the image is not cached → `503` (the frontend's existing `onError` fallbacks show the placeholder).

The resolver returns this absolute URL, so the React app is unchanged.

### D. Design details

#### D1. Folder layout

**Recommendation: one dedicated app-created folder (`SALO Public Images`), flat**, with files named `r{restaurantId}-{logo|cover|menu}-{uuid}.{ext}` and Drive `appProperties` `{ "salo_kind": "public_image", "restaurant_id": "…" }`. Per-restaurant subfolders are *not* recommended: they need extra lookup/create calls per upload and can race into duplicate folders; the naming + `appProperties` give the same traceability.

#### D2. What is stored in the existing columns — no schema change

Store **`gdrive:{fileId}`** (e.g. `gdrive:1AbC…xyz`, ~40 chars) in the existing `VARCHAR(500)` columns. It is the Drive file ID, not a URL; the short prefix makes Drive values unambiguous versus legacy local paths during the transition and while the local driver remains the dev/test fallback.

- **No schema change is required.** (Optional, cosmetic: the column comment "Local file path" on `restaurants.logo_image/cover_image` becomes inaccurate. Recommendation: update only the comment text in `database/salo_db.sql` documentation; do **not** `ALTER` the live table unless you want to.)
- `publicUrl()` dispatch: `gdrive:` → proxy URL; `http(s)://` → passthrough (existing); anything else → local `/storage/…` (existing). Mixed data therefore keeps working.

#### D3. Validation — unchanged

All existing checks in `storeFile()` run **before** any network call: `isValid`, filename sanitisation, executable/double-extension block, size limit, `finfo` MIME, `getimagesize` + GD decode, canonical extension, UUID name. Only the final `storeAs()` is replaced by `$driver->put()`. The upload body's `Content-Type` is the server-detected MIME, never the browser's. (Re-encoding, rules §16.9, is not done today and stays out of scope unless requested.)

#### D4. Replace / delete / rollback

- Same order as today: upload new → DB transaction → after commit, delete old **only if** the reference check (`isPublicImageReferenced` / `isMenuPhotoReferenced`) is false. The checks compare the stored value exactly, so they work for `gdrive:` values without change.
- Rollback: `cleanupStoredPaths()` routes public values to the driver (Drive delete for `gdrive:`), private values stay on `Storage::disk('local')`.
- If a Drive **delete** fails (after commit or during rollback): never fail the user request because of it; write a log line containing only the file ID and reason (no tokens), and the orphan report command (below) lists unreferenced Drive files for manual review.
- Registration currently uploads **inside** `DB::transaction` (`storeRestaurantBranding`, `insertInitialMenuItems`). With Drive this holds the transaction open during network calls (up to 10 files). Plan: keep the structure (minimal change) with strict HTTP timeouts (connect 5 s, request 20 s, total cap) and existing cleanup. Restructuring uploads to happen before the transaction is possible but larger; I recommend deferring it unless testing shows problems.

#### D5. Failure handling (no half-saved records)

New `App\Support\Storage\ImageStorageUnavailableException`, rendered for `/api/*` as `ApiResponse::error`:

| Situation | Detection | Behaviour | User sees |
| --- | --- | --- | --- |
| Drive down / timeout | connection error, 5xx | 1 retry with backoff, then fail; nothing written to DB | `503` "Image storage is temporarily unavailable. Your changes were not saved. Please try again in a few minutes." |
| Rate limited | `429`, `403 rateLimitExceeded/userRateLimitExceeded` | up to 2 retries (exponential backoff + jitter), then fail | same `503` |
| Quota full | `403 storageQuotaExceeded` | no retry, `critical` log for admin | `503` "Image upload is unavailable right now. Please contact SALO support." |
| Token revoked/expired | `400 invalid_grant` on refresh | no retry, `critical` log "Drive credentials invalid — re-authorize" | same as quota |
| Image read fails (proxy) and not cached | any of the above | `503` / `404` | placeholder image (existing `onError`) |

Because uploads happen before (or inside) the DB transaction and failures throw before commit, there is never a row pointing to a file that was not stored. **No silent fallback to local disk** when Drive fails (it would create an inconsistent mixed state); local is selected only by configuration.

#### D6. Credentials

- Stored only in `backend/.env` (git-ignored, verified). Never in root `.env`/`VITE_*` variables, never in API responses, never in logs (HTTP client errors are logged with status + Google error reason only; request/response bodies of the token endpoint are never logged). Access token cached in Laravel cache under a non-descriptive key.
- **Proposed `.env` key names (no values):**

```
PUBLIC_IMAGE_STORAGE=local            # local | google_drive
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_DRIVE_PUBLIC_FOLDER_ID=
GOOGLE_DRIVE_TIMEOUT_SECONDS=20
GOOGLE_DRIVE_PROXY_CACHE=true
```

`backend/.env.example` would get these names with empty values. `phpunit.xml` would force `PUBLIC_IMAGE_STORAGE=local` (tests swap in the fake driver explicitly).

#### D7. Storage abstraction (small)

```
app/Support/Storage/PublicImageStore.php            (interface)
    put(string $localPath, string $mime, string $name, array $meta): string   // returns stored value
    delete(string $storedValue): bool
    exists(string $storedValue): bool
    url(string $storedValue): ?string
    readStream(string $storedValue): array{stream, mime, size}   // proxy only
app/Support/Storage/LocalPublicImageStore.php       (wraps current Storage::disk('public') behaviour)
app/Support/Storage/GoogleDrivePublicImageStore.php (Http:: client)
app/Support/Storage/GoogleDriveTokenProvider.php    (refresh + cache)
tests/Support/FakePublicImageStore.php              (in-memory, records calls; used by tests)
```

- Bound in `AppServiceProvider` from `config('salo.uploads.public_image_driver')`.
- `FileStorageService` keeps all validation and keeps its public API; `storePublicImage`, public branch of `deleteIfUnreferenced` / `cleanupStoredPaths`, and `publicUrl` delegate to the store. `storePrivateDocument` / `streamPrivateFile` remain **hard-wired to the local disk** (the interface is never used for private files — enforced by a test).
- Resolution of legacy values always works regardless of the active driver (a `gdrive:` value is resolved by the Drive store, a relative path by the local store).
- Tests never call Google: `Http::preventStrayRequests()` in the Drive driver tests (which use `Http::fake()` with recorded Google-style responses) and the fake store for feature tests.

#### D8. Migration of existing images (one-time command)

`php artisan salo:images:migrate-to-drive {--dry-run} {--limit=} {--only=restaurants|menu_items}`

1. Refuses to run unless `PUBLIC_IMAGE_STORAGE=google_drive`, Drive credentials validate, and it prints the **actual** connected DB name and asks for confirmation (non-interactive requires `--force`).
2. Selects rows whose `logo_image`, `cover_image`, `photo_image` are non-null and **not** already `gdrive:` (idempotent; reruns skip migrated rows). Normalises legacy `/storage/` prefixes in memory.
3. For each: check file exists locally, re-run the same MIME/`getimagesize` content validation, upload, then `UPDATE … SET col = 'gdrive:…' WHERE pk = ? AND col = <old value>` (optimistic guard). If 0 rows updated (value changed meanwhile) → delete the just-uploaded Drive file.
4. `--dry-run`: no uploads, no updates; lists what would happen.
5. Report (console table + JSON file in `backend/storage/app/private/reports/drive-migration-{timestamp}.json`): migrated, skipped (already Drive), missing local file, invalid content, failed (with reason).
6. **Never deletes local files.** A separate step to remove migrated local files is not part of this plan until you confirm after verifying the migrated images.
7. Before the real run on `salo_db`: backup (`mysqldump salo_db restaurants menu_items` or a column export). Rolling back = restoring the old column values from the report/backup (local files are still there).

Expected scope today: ~4 local images (restaurants 1 & 2), pending confirmation with the read-only queries in §1.7.

Companion command: `php artisan salo:drive:init-folder` (creates the app folder, prints its ID once) and `php artisan salo:drive:orphans` (read-only: lists Drive files in the folder not referenced by any row).

### E. Documentation impact (if approved)

| Document | Change |
| --- | --- |
| `documentation/SALO_DEVELOPMENT_RULES.md` §2 table | "Image and file storage — Local storage only" → "Public images: Google Drive (approved exception, via backend proxy); private files: local storage only" |
| §2.1 item 11 | add "except the approved Google Drive exception for public images (see docs/DRIVE_STORAGE_PLAN.md)" |
| §16 title + items 1–3 | retitle "Image and File Storage"; item 1: private files local only; public images may use the approved Drive store; item 3: no other cloud storage without approval |
| §16 items 14–15 | document Drive folder + note that Drive is **not** a verified backup of SALO data |
| §22.8 | note the approved filesystem image proxy cache |
| `docs/FILE_UPLOADS.md` | overview table (new "Public (Drive driver)" row, `gdrive:{id}` value, proxy URL), new section for driver config/.env keys, failure behaviour, proxy route, migration command; "Safe replacement" wording extended to Drive; `storage:link` still required for local driver |
| `docs/API_CONTRACT.md` | add `GET /api/media/images/{fileId}` |
| `COPILOT_INSTRUCTIONS.md` lines 37, 43 | mirror the exception |
| `database/salo_db.sql` | optional comment text on `logo_image/cover_image` ("relative local path or gdrive:{fileId}") |
| `backend/.env.example` | add key names (empty) |

---

## 3. Security Impact Summary

- Private documents (permits, IDs, rider documents, future proof of delivery) never touch the abstraction → remain local behind `GET /api/applications/documents/{id}/file` authz (RA 10173).
- Drive files are **not shared publicly**; only the backend (token with `drive.file`) can read them.
- Proxy serves only IDs referenced by public columns; strict format validation; MIME allowlist; `nosniff`; throttled.
- Authorization for upload/replace/delete is unchanged (same services, same `requireActiveOwnedRestaurant` checks).
- New external data flow: public restaurant images are sent to Google (owner's account). Images are business marketing assets, not personal data, but menu/cover photos could incidentally contain people — consider a short note in the privacy notice.
- Single-account risk: if the owner's Google account is suspended, deleted or loses the refresh token, public images become unavailable until re-authorized (local copies persist until you confirm deletion).

## 4. Approvals Required Before Phase 2

1. **Rules exception:** amend §2 / §2.1(11) / §16 (and `FILE_UPLOADS.md`, `COPILOT_INSTRUCTIONS.md`) to allow Google Drive for **public images only**.
2. **Design choices:** OAuth refresh token + `drive.file`; Laravel `Http::` client; backend proxy + filesystem cache (§22.8); `gdrive:{fileId}` value in existing columns; flat single folder.
3. **Dependencies:** none new (confirm acceptance of using the already-installed Guzzle via `Http::`).
4. **`.env` keys:** the 7 names in §D6 (you fill values yourself in `backend/.env`).
5. **Google Cloud setup (you do this yourself):**
   1. Create a Google Cloud project; enable **Google Drive API**.
   2. OAuth consent screen: External, add only scope `…/auth/drive.file`, set publishing status **In production** (avoids 7-day token expiry).
   3. Create OAuth client (type *Web application*), add redirect URI `https://developers.google.com/oauthplayground`.
   4. In OAuth 2.0 Playground → settings → "Use your own OAuth credentials", authorize scope `drive.file` with the SALO owner Gmail account, exchange for tokens, copy the **refresh token** into `backend/.env`.
   5. Run `php artisan salo:drive:init-folder` (after Phase 2) and put the printed ID into `GOOGLE_DRIVE_PUBLIC_FOLDER_ID`.
6. **Read-only DB queries** (§1.7) on `salo_db` to confirm existing image rows — optional but recommended.
7. **Existing-data migration:** separate approval to run `salo:images:migrate-to-drive` (first `--dry-run`, then real run after backup) on `salo_db`; separate later approval to delete local copies.
8. **Optional:** `ALTER` of column comments (recommended: no).
