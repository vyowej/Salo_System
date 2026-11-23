# SALO — Google Drive Storage Setup Guide

This guide walks you through setting up Google Drive for SALO's approved Drive-scoped uploads (**public restaurant/menu images** and **private application documents, branch permits, delivery confirmation photos, and future support attachments**) using your own Gmail account.

> **Important:**
> - **Stays local (never on Drive):** restaurant gallery, platform assets, admin banners, default placeholder images, and `profile_change_requests` supporting documents.
> - Private Drive files are **never shared** in Drive and are only streamed through authenticated, role-authorized backend routes.
> - Keep `PUBLIC_IMAGE_STORAGE=local` and `PRIVATE_FILE_STORAGE=local` in `backend/.env` until you finish Step 6.
> - **Never** commit `backend/.env` or paste your Client Secret or Refresh Token into git, logs, or frontend `VITE_*` variables.

---

## Step 1: Create a Google Cloud Project & Enable the Drive API

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and sign in with the Gmail account that will own the SALO images folder.
2. Click the project selector at the top -> **New Project** -> name it e.g. `SALO-Public-Images` -> **Create**.
3. Make sure your new project is selected.
4. In the left menu, go to **APIs & Services -> Library**.
5. Search for **Google Drive API**, click it, and click **Enable**.

---

## Step 2: Configure the OAuth Consent Screen

1. Go to **APIs & Services -> OAuth consent screen** (or **Google Auth platform -> Overview**).
2. Choose **External** user type and click **Create**.
3. Fill in the required fields:
   - **App name:** `SALO`
   - **User support email:** your Gmail address
   - **Developer contact email:** your Gmail address
4. Click **Save and Continue**.
5. On the **Scopes** step:
   - Click **Add or Remove Scopes**.
   - Find and select **only**: `https://www.googleapis.com/auth/drive.file`
     *(Description: "See, edit, create, and delete only the specific Google Drive files you use with this app.")*
   - Do **not** add the full `drive` scope. Click **Update**, then **Save and Continue**.
6. On **Test users**, add your own Gmail address (optional if publishing next), then **Save and Continue**.
7. **Publish to Production (Important!):**
   - Go to **Audience** (or **OAuth consent screen**) and under **Publishing status**, click **Publish App** -> **Confirm** so it says **In production**.
   - Why: Apps left in **Testing** expire refresh tokens after **7 days**. Because `drive.file` is a non-sensitive scope, Google does not require app verification for personal use.

---

## Step 3: Create a Web Application OAuth Client

1. Go to **APIs & Services -> Credentials** -> **Create Credentials -> OAuth client ID**.
2. **Application type:** select **Web application**.
3. **Name:** `SALO Backend`.
4. Under **Authorized redirect URIs**, click **Add URI** and enter:
   `https://developers.google.com/oauthplayground`
5. Click **Create**.
6. Copy the **Client ID** and **Client Secret** (you will paste them into `backend/.env` in Step 5).

---

## Step 4: Get Your Refresh Token via OAuth 2.0 Playground

1. Open [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
2. Click the **gear icon** (OAuth 2.0 Configuration) in the top-right corner:
   - Check **Use your own OAuth credentials**.
   - Paste your **OAuth Client ID** and **OAuth Client secret**.
   - Close the settings panel.
3. On the left panel (**Step 1: Select & authorize APIs**):
   - Paste `https://www.googleapis.com/auth/drive.file` into the **Input your own scopes** box and click **Authorize APIs**.
4. Sign in with your SALO owner Gmail account.
   - If you see **"Google hasn't verified this app"**, click **Advanced** -> **Go to SALO (unsafe)** -> **Continue** (this is normal for your own personal app).
   - Grant the `drive.file` permission.
5. On **Step 2: Exchange authorization code for tokens**:
   - Click **Exchange authorization code for tokens**.
   - Copy the **Refresh token** value.

---

## Step 5: Fill in `backend/.env`

Open `backend/.env` and set these keys (keep `PUBLIC_IMAGE_STORAGE=local` for one more step):

```env
PUBLIC_IMAGE_STORAGE=local
PRIVATE_FILE_STORAGE=local
SALO_DELIVERY_PROOF_REQUIRED=false
GOOGLE_DRIVE_CLIENT_ID=your-client-id-here
GOOGLE_DRIVE_CLIENT_SECRET=your-client-secret-here
GOOGLE_DRIVE_REFRESH_TOKEN=your-refresh-token-here
GOOGLE_DRIVE_PUBLIC_FOLDER_ID=
GOOGLE_DRIVE_TIMEOUT_SECONDS=20
GOOGLE_DRIVE_PROXY_CACHE=true
```

---

## Step 6: Create the Dedicated Drive Folder

Run this command from `backend/`:

```powershell
cd backend
php artisan config:clear
php artisan salo:drive:init-folder
```

Copy the printed `GOOGLE_DRIVE_PUBLIC_FOLDER_ID=...` line into `backend/.env`.

---

## Step 7: Switch Driver & Test One Upload

1. Change `PUBLIC_IMAGE_STORAGE=google_drive` in `backend/.env`.
2. Run `php artisan config:clear` inside `backend/`.
3. Restart `php artisan serve` / Apache if running.
4. Upload one test image in the app (for example, update a restaurant logo or menu item photo as an owner).
5. Verify:
   - The returned image URL looks like `http://localhost:8000/api/media/images/<fileId>`.
   - The image renders in the browser.
   - The file appears inside your `SALO Public Images` folder in Google Drive.

---

## Step 8: Migrate Existing Local Images (Dry Run First!)

1. **Back up `salo_db` first** (for example with `mysqldump`, kept outside git):
   ```powershell
   mysqldump -u root salo_db restaurants menu_items > salo_db_images_backup.sql
   ```
2. Run the **dry run** first (makes no uploads and no DB changes):
   ```powershell
   cd backend
   php artisan salo:images:migrate-to-drive --dry-run
   ```
3. Review the output table and the report in `backend/storage/app/private/reports/`.
4. When ready, run the live migration:
   ```powershell
   php artisan salo:images:migrate-to-drive
   ```
   Confirm the printed database name (`salo_db`) when prompted. Local files in `backend/storage/app/public/` are **never deleted** by this command; keep them until you have verified all migrated images in the app.

---

## Step 9: Reorganize Flat-Folder Public Images & Migrate Local Private Files

1. **Reorganize existing flat-folder public images** into `SALO/Restaurants/...` and tag `visibility=public` (no DB changes):
   ```powershell
   cd backend
   php artisan salo:drive:reorganize-public --dry-run
   php artisan salo:drive:reorganize-public
   ```
2. **Migrate local private files** (`application_documents`, `branch_permits`, `deliveries.proof_photo`) after backing up `salo_db`:
   ```powershell
   php artisan salo:private-files:migrate-to-drive --dry-run
   php artisan salo:private-files:migrate-to-drive
   ```
   Local files are **never deleted** by this command; keep them until you confirm every document opens from Drive.
3. **Verify private-tree permissions** (asserts owner-only permissions on `Applications/`, `Riders/`, `Support/`):
   ```powershell
   php artisan salo:drive:check-permissions
   ```
4. **Check for Drive orphans** across the whole `SALO` tree:
   ```powershell
   php artisan salo:drive:orphans
   ```
5. **90-day rejected application purge** (manual only, `--dry-run` first):
   ```powershell
   php artisan salo:drive:purge-rejected --dry-run
   ```

---

## Troubleshooting

| Symptom / Error | Cause | Fix |
| --- | --- | --- |
| `invalid_grant` or `503 Image upload is unavailable right now` | Refresh token was revoked, client secret changed, or consent screen was left in **Testing** | Check OAuth consent screen is **In production**, then re-generate the refresh token in Step 4 and update `GOOGLE_DRIVE_REFRESH_TOKEN` in `backend/.env`, followed by `php artisan config:clear` and `php artisan cache:clear`. |
| Token stops working after **7 days** | OAuth consent screen publishing status is still **Testing** | Set publishing status to **In production** (Step 2.7), then generate a new refresh token once more. |
| `"Google hasn't verified this app"` warning | Normal for a personal OAuth app not submitted to Google for public review | Click **Advanced -> Go to SALO (unsafe) -> Continue**. Only your own owner account ever sees this screen (end users never log in to Google). |
| `storageQuotaExceeded` (`503`) | Your Google account's 15 GB Drive storage is full | Free up space in Google Drive / Google Photos / Gmail Trash, or upgrade Google One storage. |
| App cannot see a folder you created manually in Drive | The `drive.file` scope only grants access to files and folders **created by the app itself** | Do not create the folder in the Drive web UI. Always create it with `php artisan salo:drive:init-folder` (Step 6) and use that folder ID. |
