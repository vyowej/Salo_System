# SALO — Rider Application and Onboarding System Implementation Plan
**Document Version:** 1.0.0  
**Date:** 2026-11-09  
**Status:** Approved for Implementation (Frontend Only)

---

## 1. Executive Summary & Objectives

The SALO Rider Application and Onboarding system enables existing authenticated SALO customers to apply to join the SALO delivery fleet without creating another account or registering a separate profile. The system supports multiple delivery modalities (Motorcycle, Bicycle, E-bike, E-scooter, Walking), conditional vehicle details, tailored document requirements, identity verification UI, payout account settings, and live status simulation.

In accordance with strict project rules, this task is **frontend development only**. No backend files, PHP endpoints, MySQL schemas, database migrations, or actual cloud file uploads will be created. The frontend architecture will follow the design language established in the Business Application, ensuring visual harmony across light and dark modes.

---

## 2. Codebase Audit & Existing Assets

### 2.1 Existing Rider Files & Architecture
- **Existing Pages in `src/features/rider/pages/`:**
  - `RiderApplicationFormPage.jsx` & `RiderApplicationStatusPage.jsx`: Contained a 4-step prototype preview.
  - `RiderActivationPage.jsx`: Simulated 6-digit OTP activation screen for approved riders.
  - `RiderAccountStatusPage.jsx`: Account states preview.
  - `RiderDashboardPage.jsx`, `RiderDeliveriesPage.jsx`, `RiderActiveDeliveryPage.jsx`, etc.
- **Existing Constants & Mocks:**
  - `src/features/rider/constants/vehicleTypes.js`: Listed basic vehicle types (`motorcycle`, `bicycle`, `e_bike`, `other`).
  - `src/features/rider/constants/riderConstants.js`: Outlines application statuses, account states, and step labels.
- **Admin Rider Review Interface (`src/features/admin/pages/AdminRidersPage.jsx`):**
  - Displays rider applications, details, and status actions (`Approve application`, `Reject application`, `Request documents`).
  - Interacts with `src/services/adminService.js` (`getRiders()`, `updateRiderStatus()`).
  - **Preservation Rule:** Admin rider review functionality is already tested and must be preserved completely.
- **Customer Navigation:**
  - `src/features/customer/pages/PartnerApplicationPage.jsx` has a "Rider Partner" card that will link directly to `/become-a-rider` and `/rider-application/status`.
  - `src/layouts/CustomerLayout.jsx` profile menu item "Become a Rider" will navigate directly to `/become-a-rider`.

### 2.2 Proposed Page & Routing Architecture
- **Dedicated Application Wizard Route:** `/become-a-rider`
  - Canonical location: `src/pages/RiderApplication/RiderApplicationPage.jsx`
  - Replaces and enhances `RiderApplicationFormPage.jsx` with a comprehensive 10-step wizard.
  - Supporting alias routes: `/rider/application` and `/rider/application-form` will route to this dedicated page.
- **Dedicated Application Status Route:** `/rider-application/status`
  - Canonical location: `src/pages/RiderApplication/RiderApplicationStatusPage.jsx`
  - Replaces and enhances `RiderApplicationStatusPage.jsx` with an interactive 8-status simulator.
  - Supporting alias route: `/rider/application/status` will route to this page.

---

## 3. New and Modified Files

```
src/
├── pages/
│   └── RiderApplication/
│       ├── RiderApplicationPage.jsx          # Main 10-step wizard orchestrator
│       ├── RiderApplicationPage.css          # Responsive wizard layout and styles
│       ├── RiderApplicationStatusPage.jsx    # Dedicated status & timeline page
│       ├── RiderApplicationStatusPage.css    # Status page styles
│       ├── constants/
│       │   ├── riderApplicationDefaults.js   # Form defaults, delivery methods, options
│       │   └── riderDocumentMatrix.js        # Conditional document rules per delivery method
│       └── components/
│           ├── RiderApplicationHeader.jsx    # Sticky header with step counter, draft save & exit
│           ├── RiderApplicationProgress.jsx  # Stepper bar (desktop & mobile)
│           ├── RiderDocumentUploadCard.jsx   # Drag-and-drop file upload, preview, replace, remove
│           ├── PersonalInformationStep.jsx   # Step 1: Personal info with 18+ validation & auth prefill
│           ├── IdentityVerificationStep.jsx  # Step 2: Government ID & selfie photo
│           ├── DeliveryMethodStep.jsx        # Step 3: Selection (Motorcycle, Bicycle, E-bike, E-scooter, Walker)
│           ├── VehicleInformationStep.jsx    # Step 4: Conditional vehicle details
│           ├── VehicleDocumentsStep.jsx      # Step 5: Conditional driver license, OR/CR, photos
│           ├── ClearanceDocumentsStep.jsx    # Step 6: NBI/Police clearances
│           ├── EmergencyContactStep.jsx      # Step 7: Emergency contact & coverage preferences
│           ├── PayoutInformationStep.jsx     # Step 8: E-wallet & bank payout with masking
│           ├── EmailVerificationStep.jsx     # Step 9: Mock 6-digit OTP verification
│           ├── RiderAgreementStep.jsx        # Step 10: Agreement summary, review & declarations
│           ├── ApplicationSuccess.jsx        # Reference receipt & next-steps roadmap
│           └── RiderApplicationStatus.jsx    # Embedded status view with 8-state simulator
```

---

## 4. Application Steps & Conditional Dependencies

| Step | Name | Primary Fields / Purpose | Conditional Rules |
|---|---|---|---|
| **1** | Personal Info | Name, Birthdate (18+ check), Gender, Email, Mobile Phone, Full Residential Address | Pre-fills from `useAuth()`. Blocks under-18 applicants. |
| **2** | Identity Verification | ID Type (PhilID, Driver's License, Passport, UMID, SSS, etc.), ID Number, Expiry, Front Photo, Back Photo, Selfie Photo | Validates required front ID and selfie. |
| **3** | Delivery Method | Motorcycle, Bicycle, E-bike, E-scooter, Walking | Governs Steps 4 & 5. Prompts confirmation before switching method if vehicle data exists. |
| **4** | Vehicle Information | **Motorcycle:** Brand, Model, Year, Color, Plate No., MV File No., Ownership Structure.<br>**Bicycle:** Bike Type, Brand, Model, Color.<br>**E-bike/E-scooter:** Brand, Model, Wattage, Color.<br>**Walking:** Walk radius overview (no vehicle required). | Adapts dynamically to selected delivery method. |
| **5** | Vehicle Documents | **Motorcycle:** Driver's License (Prof/Non-Prof), OR/CR, Vehicle Photo, Authorization letter if not personally owned.<br>**Bicycle:** Photo of bike and helmet.<br>**E-bike/E-scooter:** Photo of vehicle and helmet.<br>**Walking:** No vehicle documents required. | Only displays documents relevant to delivery method. |
| **6** | Clearances | Police Clearance or NBI Clearance, Barangay Clearance | Explains safety & criminal background clearance purpose. |
| **7** | Emergency & Preferences | Emergency Contact (Name, Relationship, Phone), Preferred City, Barangays, Preferred Shifts (Morning/Afternoon/Evening/Flexible), Available Days | Outlines operational coverage and zone assignments. |
| **8** | Payout Details | Account Holder, Provider (GCash, Maya, BPI, BDO, etc.), Account/Mobile Number, Masking control, Optional proof | Explains weekly rider earnings remittance schedule. |
| **9** | Email Verification | 6-digit OTP input boxes, countdown timer (60s), resend action, email editor | Mock verification (`123456` verifies, `000000` invalid, `999999` expired). |
| **10** | Agreement & Review | Categorized review summary with "Edit" jump links, SALO Rider Code of Conduct, 4 mandatory declaration checkboxes | Submit button enabled only when all validations & declarations pass. |
| **Success** | Confirmation Receipt | Generated Reference (`SALO-RIDER-YYYYMMDD-XXXX`), submission timestamp, status "Pending Review", roadmap next steps | Links to `/rider-application/status` and `/customer`. |

---

## 5. Mock Data Structure & Admin Integration

Application state will synchronize with `localStorage.getItem('salo_rider_applications')` and also register with `adminService.getRiders()` so that when an applicant submits in the customer portal, the record automatically surfaces in the existing `AdminRidersPage.jsx` without breaking any existing Admin approval workflows:

```json
{
  "referenceNumber": "SALO-RIDER-20261109-7814",
  "applicantUserId": 1,
  "name": "Maria Clara Dela Cruz",
  "username": "mariaclara",
  "email": "mariaclara@example.com",
  "phone": "09171234567",
  "status": "Pending Verification",
  "applicationStatus": "Pending Review",
  "verificationStatus": "Pending",
  "deliveryMethod": "motorcycle",
  "vehicle": "Motorcycle · Yamaha NMAX 155",
  "plateNumber": "ABC-1234",
  "licenseNumber": "N01-14-123456",
  "zone": "Quezon City - South Triangle",
  "idDocument": "Philippine National ID",
  "vehicleDocument": "LTO OR/CR Validated",
  "submittedAt": "2026-11-09T13:50:00Z",
  "joinedDate": "2026-11-09"
}
```

---

## 6. Verification and Testing Strategy
1. Automated unit tests covering delivery method switching, conditional document requirements, minimum age checks, and status configurations.
2. ESLint verification (`npm run lint`) to maintain 0 errors and warnings.
3. Production Vite build (`npm run build`) verification.
4. Comprehensive regression run of existing platform tests (`npm test`).
5. Manual layout and theme verification across desktop, tablet, and mobile views.
