# SALO — Rider Application and Onboarding System (Frontend Implementation Report)

**Date**: November 9, 2026  
**Project**: SALO Platform Frontend  
**Feature**: Rider Application & Onboarding System (Frontend Only)  
**Status**: Completed & Verified  

---

## 1. Executive Summary

This report documents the design, architecture, and complete frontend implementation of the **Rider Application and Onboarding System** for the SALO platform. 

The system enables existing SALO customers to seamlessly apply to join the delivery fleet as courier partners without creating separate user accounts or re-authenticating. The wizard features dynamic conditional requirements across 5 delivery methods (**Motorcycle, Bicycle, E-bike, E-scooter, Walking**), interactive document dropzones with progress simulation, legal declaration checklists, an email OTP mock verification flow, and a dedicated 8-state application status tracking dashboard.

Strict adherence to the project constraints was maintained:
- **Frontend Only**: Zero PHP files, Laravel controllers, database migrations, or real API calls were created.
- **Design System Fidelity**: Uses Fraunces typography for headings, DM Sans for interface body, SALO signature warm orange (`#F36B2B`), and support for both crisp white light mode and `#171717` dark mode.
- **Admin Compatibility**: Synchronizes mock submissions directly with `adminService` and `salo_admin_riders` in `localStorage`, preserving the existing `AdminRidersPage.jsx` review, approval, and rejection workflows.

---

## 2. Codebase Audit & Architectural Integration

### 2.1 Existing Implementations Inspected
1. **Rider Feature Pages**:
   - `src/features/rider/pages/RiderApplicationFormPage.jsx` (legacy simple form)
   - `src/features/rider/pages/RiderApplicationStatusPage.jsx` (legacy preview status)
   - `src/features/rider/pages/RiderActivationPage.jsx` (onboarding step after approval)
   - `src/features/rider/pages/RiderDashboardPage.jsx` (active rider dashboard)
2. **Customer Integration Points**:
   - `src/layouts/CustomerLayout.jsx`: Topbar profile dropdown item `become-rider` now routes directly to `/become-a-rider`.
   - `src/features/customer/pages/PartnerApplicationPage.jsx`: Partner overview card for Delivery Courier updated to read live status from `salo_rider_applications`, linking to `/become-a-rider` and `/rider-application/status`.
3. **Admin Operations**:
   - `src/features/admin/pages/AdminRidersPage.jsx`: Queries `adminService.getRiders()` and updates statuses via `adminService.updateRiderStatus()`. Mock submissions are registered directly into `salo_admin_riders`.

### 2.2 Routes Configured in `src/App.jsx`
- `/become-a-rider` — Dedicated 10-step Rider Application wizard (`RiderApplicationPage.jsx`).
- `/rider-application` — Redirects directly to `/become-a-rider`.
- `/rider-application/status` — Dedicated Rider Application Status tracking page (`RiderApplicationStatusPage.jsx`).
- `/rider/application` — Links directly to `/rider-application/status`.
- `/rider/application-form` — Redirects to `/become-a-rider`.

---

## 3. Component Architecture & File Inventory

The complete implementation resides in `src/pages/RiderApplication/`:

```
src/pages/RiderApplication/
├── RiderApplicationPage.jsx             # Main 10-step wizard orchestrator
├── RiderApplicationPage.css             # Responsive styling, light & dark theme tokens
├── RiderApplicationStatusPage.jsx       # Dedicated status tracking page wrapper
├── RiderApplicationStatusPage.css       # Status page sticky header & container styling
├── riderApplication.test.js             # Unit and integration test suite (60 passed)
├── constants/
│   ├── riderApplicationDefaults.js     # Delivery methods, initial state, shifts, 8 status configs
│   └── riderDocumentMatrix.js          # Dynamic conditional document definitions and helpers
└── components/
    ├── RiderApplicationHeader.jsx      # Sticky topbar with step counter, draft save, exit modal
    ├── RiderApplicationHeader.css
    ├── RiderApplicationProgress.jsx    # Responsive 10-step stepper and mobile progress bar
    ├── RiderApplicationProgress.css
    ├── RiderDocumentUploadCard.jsx     # Reusable dropzone with upload progress, preview, remove
    ├── RiderDocumentUploadCard.css
    ├── PersonalInformationStep.jsx     # Step 1: Legal name, contact, 18+ age validation
    ├── IdentityVerificationStep.jsx     # Step 2: Government ID selection, front/back/selfie
    ├── DeliveryMethodStep.jsx          # Step 3: 5 transport modes with switch confirmation modal
    ├── VehicleInformationStep.jsx       # Step 4: Conditional vehicle fields by transport mode
    ├── VehicleDocumentsStep.jsx         # Step 5: Conditional vehicle documents (LTO OR/CR, photos)
    ├── ClearanceDocumentsStep.jsx       # Step 6: NBI, Police, Barangay, Medical clearances
    ├── EmergencyContactStep.jsx         # Step 7: Emergency contact, shifts, zone preferences
    ├── PayoutInformationStep.jsx        # Step 8: GCash, Maya, Bank account with masked input
    ├── EmailVerificationStep.jsx        # Step 9: 6-digit OTP boxes, 60s countdown, mock codes
    ├── RiderAgreementStep.jsx           # Step 10: 7-section review summary & legal declarations
    ├── ApplicationSuccess.jsx           # Submission confirmation receipt with copyable ref
    ├── RiderApplicationStatus.jsx       # 8-state status viewer, simulator pills & checklist
    └── RiderApplicationStatus.css
```

---

## 4. Application Wizard Breakdown (Steps 1–10)

### Step 1: Company & Email OTP Verification (`EmailVerificationStep.jsx`) — Mandatory Gate
- Captures **Company / Fleet Operator Name** (optional for fleet partners or independent couriers).
- Captures **Official Company / Rider Email Address**.
- Simulates dispatching a 6-digit OTP to the provided email address (ready for backend `POST /api/v1/auth/email-otp`).
- 6-digit individual digit boxes with auto-focus, paste, backspace navigation, and focus ring animations.
- 60-second cooldown timer with resend functionality and prototype simulation codes (`123456`, `000000`, `999999`).
- **Enforced Gate**: Applicants **cannot** proceed to Step 2 without first receiving and successfully verifying their email OTP.
- Upon successful verification, displays an animated celebratory card with verified timestamp, email badge, and unlocks the rest of the application.

### Step 2: Personal & Contact Information (`PersonalInformationStep.jsx`)
- Prefills legal name and authenticated contact details, with email synced directly from the Step 1 OTP verification.
- Full address input (Street, Barangay, City, Province, Postal Code).
- **18+ Age Validation**: Computes exact age from date of birth. Enforces 18+ requirement with inline feedback.

### Step 3: Delivery Method Selection (`DeliveryMethodStep.jsx`)
- 5 transport cards with iconography, taglines, radius guidelines, and requirements summaries:
  1. **Motorcycle** (8–12 km radius; requires Driver's License & LTO OR/CR)
  2. **Bicycle** (3–5 km radius; eco-friendly, requires helmet)
  3. **E-bike** (5–8 km radius; electric assisted cycling, wattage rating)
  4. **E-scooter** (3–5 km radius; urban micro-mobility)
  5. **Walking / Walker** (1–2 km radius; pedestrian commercial hub courier)
- Modal confirmation guard if switching modes when existing vehicle details have been typed.

### Step 4: Conditional Vehicle Details (`VehicleInformationStep.jsx`)
- **Motorcycle**: Brand, model, year, color, plate number, MV file number, ownership structure (Personally Owned, Family-Owned, Borrowed, Rented/Leased, Company-Owned), and owner authorization names.
- **Bicycle**: Bike type (Road, MTB, Commuter, Folding, Cargo), brand, model, color.
- **E-bike & E-scooter**: Brand, model, color, wattage rating / speed rating.
- **Walking**: Informational notice card outlining pedestrian radius and thermal backpack guidelines; zero vehicle fields required.

### Step 5: Conditional Vehicle Documents (`VehicleDocumentsStep.jsx`)
- Computes requirements using `getVehicleDocuments(deliveryMethod, ownership)`.
- **Motorcycle**: Driver's License (Code A/1), LTO Official Receipt (OR), LTO Certificate of Registration (CR), Motorcycle photo with visible plate, and Authorization Letter (if not personally owned).
- **Bicycle / E-bike / E-scooter**: Vehicle & helmet photo, purchase invoice/specifications.
- **Walking**: Fully exempt from vehicle documents.

### Step 6: Background Clearances (`ClearanceDocumentsStep.jsx`)
- Background safety verification supporting NBI Clearance, Police Clearance, Barangay Clearance, and Medical Fit-to-Work certificate.
- Enforces requirement that at least one primary clearance (NBI or Police) is provided.

### Step 7: Emergency Contact & Work Preferences (`EmergencyContactStep.jsx`)
- Emergency contact name, relationship (Parent, Spouse, Sibling, Child, etc.), and contact numbers.
- Delivery coverage preferences: primary city, preferred barangay dispatch hubs, shift selections (Breakfast, Lunch, Merienda, Dinner, Late Night, Flexible), and available days of the week.

### Step 8: Payout Information (`PayoutInformationStep.jsx`)
- Account holder name, provider dropdown (GCash, Maya, BPI, BDO, UnionBank, Metrobank, Landbank, Security Bank, etc.).
- Account number with toggle to show/hide masked digits (`••••1234`).
- Optional account proof / QR code upload card.

### Step 9: Email OTP Verification (`EmailVerificationStep.jsx`)
- Sends mock OTP to applicant email with 60-second cooldown timer and resend capability.
- Auto-advancing 6-digit OTP input boxes with backspace navigation and paste handling.
- Mock simulation helper accepting `123456`, `000000`, or `999999`.
- Allows updating destination email with instant reset of verification state.

### Step 10: Agreement & Review (`RiderAgreementStep.jsx`)
- 7 comprehensive review cards summarizing all applicant data with "Edit" jump links to return to previous steps.
- Code of Conduct & Road Safety policy accordions.
- 4 mandatory declaration checkboxes:
  1. Accuracy of provided information.
  2. Authenticity of submitted documents.
  3. Compliance with road safety and equipment rules.
  4. Acceptance of SALO Independent Rider Agreement.

---

## 5. Submission & Application Status Tracking

### 5.1 Submission Receipt (`ApplicationSuccess.jsx`)
- Displays celebratory confirmation with generated reference code: `SALO-RIDER-YYYYMMDD-XXXX`.
- One-click clipboard copy for application tracking.
- Clear 3-stage roadmap explaining background review, safety orientation, and gear pickup.
- Persists application to `localStorage.getItem('salo_rider_applications')` and synchronizes with `salo_admin_riders`.

### 5.2 8-State Application Status Tracking (`RiderApplicationStatus.jsx`)
Accessible at `/rider-application/status`, featuring an interactive prototype simulator allowing instant toggling between all 8 states:
1. **Draft** — Application started but not submitted.
2. **Pending Submission** — Information entered, awaiting final OTP and declarations.
3. **Pending Review** — Submitted, queued for fleet onboarding review.
4. **Under Review** — Actively evaluated by LTO and NBI verification officers.
5. **Needs Correction** — Action required alert card highlighting flagged document (e.g. blurry driver's license back), reviewer notes, and deep link (`?step=6`) to resubmit.
6. **Resubmitted** — Documents updated, queued for re-verification.
7. **Approved** — Congratulations banner, activation guidance, and interactive 5-item onboarding readiness checklist (safety handbook, thermal bag collection, zone briefing, etc.) with button to `/rider/activate`.
8. **Rejected** — Courteous refusal notice specifying grounds (e.g. record check discrepancy) and appeal options.

---

## 6. Verification and Quality Assurance

### 6.1 Unit & Integration Test Suite (`npm test`)
- Suite: `src/pages/RiderApplication/riderApplication.test.js`
- Test runner: `node --test`
- Results: **61 passing tests**, 0 failing tests.
- Covered:
  - Catalog verification for all 5 transport modes.
  - Motorcycle licensing, OR/CR, and conditional authorization letters.
  - Micro-mobility document matrix (absence of LTO requirements).
  - Walking courier full exemption logic.
  - Clearance matrix requirements (NBI and Police options).
  - 10-step wizard sequencing.
  - Initial state defaults.
  - All 8 application status configurations and mock admin feedback.

### 6.2 Code Quality & Linting (`npm run lint`)
- ESLint execution across entire repository: **0 errors, 0 warnings**.
- Verified purity of render cycles (`react-hooks/purity`).
- Verified zero unused variables or imports (`no-unused-vars`).

### 6.3 Production Build (`npm run build`)
- Vite production build: **Passed in 1.18s**.
- Chunks produced:
  - `dist/assets/RiderApplicationPage-*.js` (83.40 kB / gzip: 20.03 kB)
  - `dist/assets/RiderApplicationPage-*.css` (21.90 kB / gzip: 3.43 kB)
  - `dist/assets/RiderApplicationStatusPage-*.js` (9.91 kB / gzip: 3.03 kB)
  - `dist/assets/RiderApplicationStatusPage-*.css` (9.27 kB / gzip: 1.81 kB)

---

## 7. Future Backend Integration Considerations

When backend development commences, this frontend can connect seamlessly with the following suggested endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/rider-applications/draft` | `GET` / `PUT` | Retrieve or persist in-progress application drafts. |
| `/api/v1/rider-applications` | `POST` | Submit completed application with multipart documents. |
| `/api/v1/rider-applications/:ref/status` | `GET` | Fetch real-time status and admin reviewer notes. |
| `/api/v1/rider-applications/verify-email/otp` | `POST` | Request email OTP token. |
| `/api/v1/rider-applications/verify-email/confirm` | `POST` | Confirm OTP token validity. |
| `/api/v1/admin/riders/:id/review` | `PATCH` | Admin status updates (Approve, Request Corrections, Reject). |

All form models and document metadata structures have been built with standard ISO timestamps and serializable types to make future REST/JSON integration immediate and clean.
