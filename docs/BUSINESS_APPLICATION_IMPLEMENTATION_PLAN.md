# SALO — Business / Restaurant Partner Application Implementation Plan
**Document Version:** 1.0.0  
**Date:** 2026-11-09  
**Status:** Approved for Implementation (Frontend Only)

---

## 1. Executive Summary & Objectives

The SALO Restaurant Partner Application allows existing authenticated SALO customers to apply to become a restaurant partner without creating a separate user account. This task is strictly frontend development. Backend APIs, databases, migrations, or server endpoints will be implemented in subsequent phases.

The goal is to deliver an accessible, multi-step application wizard and status tracking system matching SALO's visual identity (Fraunces & DM Sans typography, SALO orange `#F36B2B`, pure white light mode, and `#171717` dark mode).

---

## 2. Codebase Audit & Existing Assets

### 2.1 Routing & Navigation
- **Router:** `react-router-dom` v7 with React lazy loading in `src/App.jsx`.
- **Existing Partner Route:** `/customer/partner` and `/partner` currently render `PartnerApplicationPage.jsx`, which contains promotional cards for Restaurant Partner and Rider Partner with a basic modal.
- **Customer Navigation:** `CustomerLayout.jsx` provides:
  - Sidebar promo card (`customer-partner-promo`) linking to `/customer/partner`.
  - TopBar profile menu item "Partner with SALO" linking to `/customer/partner`.
- **New Routes to Register in `src/App.jsx`:**
  - `/become-a-partner`: Main multi-step application wizard page.
  - `/business-application/status`: Dedicated application status, timeline, and correction page.

### 2.2 Reusable UI Components
- **Common Components (`src/components/common/`):**
  - `Button` (`variant`: primary, secondary, outline, ghost, danger, danger-outline; `size`: sm, md, lg; `loading` state).
  - `Badge` (`variant`: success, warning, danger, info, neutral).
  - `Card`, `CardHeader`, `CardBody`, `CardFooter`.
  - `Modal` (accessible dialog with keyboard trapping and backdrop).
  - `BrandMark` (SALO logo and icon).
- **Form Components (`src/components/forms/`):**
  - `Input`, `Textarea`, `Select`, `Label`, `FormGroup`, `HelperText`, `ErrorMessage`.
- **Theme & Layout:**
  - CSS variables in `src/styles/variables.css` and `src/styles/themes.css`.
  - Light/Dark mode via `[data-theme="light"]` and `[data-theme="dark"]`.
  - `CustomerLayout` shell with consistent topbar, sidebar, and responsive breakpoints.

### 2.3 Authentication & Session Integration
- `useAuth()` hook provides current authenticated user details (`user.id`, `user.name`, `user.email`).
- Applicant pre-fills representative fields from authenticated user session without requiring re-registration.

---

## 3. Proposed Frontend Architecture

```
src/
├── pages/
│   └── BusinessApplication/
│       ├── BusinessApplicationPage.jsx          # Main wizard orchestrator
│       ├── BusinessApplicationPage.css          # Wizard responsive styles
│       ├── BusinessApplicationStatusPage.jsx    # Dedicated status & timeline page
│       ├── BusinessApplicationStatusPage.css    # Status page styles
│       ├── constants/
│       │   ├── applicationDefaults.js           # Initial form states, options, mock data
│       │   └── documentRequirements.js          # Conditional document rules by entity type
│       └── components/
│           ├── ApplicationHeader.jsx            # Header with save draft & exit confirmation
│           ├── ApplicationProgress.jsx          # Stepper indicator with step statuses
│           ├── DocumentUploadCard.jsx           # Reusable file upload/preview/replace card
│           ├── LocationPickerModal.jsx          # Interactive address/map coordinates picker
│           ├── BusinessInformationStep.jsx      # Step 1: Restaurant & cuisine details
│           ├── RepresentativeInformationStep.jsx# Step 2: Applicant details & declaration
│           ├── BusinessDocumentsStep.jsx        # Step 3: Conditional legal & tax permits
│           ├── BusinessAddressStep.jsx          # Step 4: Physical location & map pin
│           ├── PayoutInformationStep.jsx        # Step 5: Bank details & mask control
│           ├── RestaurantConfigurationStep.jsx  # Step 6: Branding, operating hours, services, menu
│           ├── EmailVerificationStep.jsx        # Step 7: Mock OTP verification
│           ├── ApplicationReviewStep.jsx        # Step 8: Comprehensive review & declarations
│           ├── ApplicationSuccess.jsx           # Submission confirmation screen
│           └── ApplicationStatus.jsx            # Embedded status view with mock switcher
```

---

## 4. Application Steps & Dependencies

| Step | Name | Key Fields / Features | Dependencies / Conditions |
|---|---|---|---|
| **1** | Business Information | Name, Registered Name, Business Type, Ownership Structure, Cuisine, Email, Phone, Description | Sets `ownershipStructure` which governs Step 3 requirements. |
| **2** | Owner / Representative | Name, Birthdate, Email, Phone, Position, Authorization checkbox | Pre-fills from `useAuth()`. Validates 18+ age. |
| **3** | Business Documents | DTI (Sole Prop) vs SEC (Corp/Partnership) vs CDA (Coop), BIR 2303, Mayor's Permit, Valid ID, Proof of Address | Evaluates document requirements conditionally based on Step 1. |
| **4** | Business Address | Region, Province, City, Barangay, Street, Postal Code, Map Pin | Interactive mock location selection. |
| **5** | Payout Information | Account Name, Bank Name, Account Number (masked), Account Type, Proof of Account | Privacy disclaimer. No real financial credentials stored. |
| **6** | Restaurant Config | Logo, Cover Image, Operating Hours (7 days, overnight support), Services (Delivery, Pickup, Dine-in, Table Reservations), Optional Menu setup | Table reservation sub-form toggled if service checked. |
| **7** | Email Verification | 6-digit OTP code input, timer countdown, resend action, email change | Verifies applicant email with mock codes (e.g. 123456). |
| **8** | Review & Submit | Read-only summary cards with Edit actions back to specific steps, 3 required legal declarations | Submit enabled only when all required data & declarations valid. |
| **Success** | Confirmation | Reference number (`SALO-APP-...`), submission date, status badge, next-steps roadmap | Navigates to `/business-application/status`. |

---

## 5. Mock Data Structure & Admin Readiness

The application state schema is structured to match the target Laravel REST API contract:

```json
{
  "referenceNumber": "SALO-APP-20261109-8421",
  "applicantUserId": 1,
  "status": "pending_review",
  "submittedAt": "2026-11-09T13:30:00Z",
  "businessInfo": {
    "restaurantName": "Mang Inasal Express",
    "registeredName": "Mang Inasal Philippines Inc.",
    "businessType": "restaurant",
    "ownershipStructure": "corporation",
    "cuisineType": "Filipino · Charcoal Grill & BBQ",
    "businessEmail": "contact@manginasal-branch.ph",
    "businessPhone": "09171234567",
    "description": "Authentic chicken inasal and unlimited rice meals."
  },
  "representative": {
    "firstName": "Juan",
    "middleName": "Protacio",
    "lastName": "Dela Cruz",
    "suffix": "",
    "dateOfBirth": "1990-05-15",
    "email": "juan.delacruz@gmail.com",
    "phone": "09189876543",
    "position": "manager",
    "isAuthorized": true
  },
  "documents": [
    {
      "id": "sec_cert",
      "type": "sec_certificate",
      "name": "SEC_Certificate_Registration.pdf",
      "size": 1420500,
      "uploadedAt": "2026-11-09T13:10:00Z",
      "status": "valid"
    }
  ],
  "address": {
    "region": "National Capital Region (NCR)",
    "province": "Metro Manila",
    "city": "Quezon City",
    "barangay": "South Triangle",
    "street": "123 Tomas Morato Ave.",
    "postalCode": "1103",
    "coordinates": { "lat": 14.6369, "lng": 121.0362 }
  },
  "payout": {
    "accountHolder": "Mang Inasal Philippines Inc.",
    "bankName": "Bank of the Philippine Islands (BPI)",
    "accountNumberMasked": "••••••••4829",
    "accountType": "current"
  },
  "configuration": {
    "logo": { "name": "logo.png", "src": "blob:..." },
    "cover": { "name": "cover.jpg", "src": "blob:..." },
    "operatingHours": {
      "monday": { "isOpen": true, "open": "10:00", "close": "22:00", "isOvernight": false }
    },
    "services": {
      "delivery": true,
      "pickup": true,
      "dineIn": true,
      "tableReservation": true
    },
    "reservationSettings": {
      "minNoticeHours": 2,
      "maxPartySize": 12,
      "notes": "Reservations held for 15 minutes."
    },
    "menuItems": [
      {
        "id": "menu-1",
        "name": "Paa Large with Rice",
        "description": "Grilled marinated chicken quarter served with sinamak.",
        "category": "Main Dish",
        "price": 185,
        "available": true
      }
    ]
  },
  "review": {
    "reviewerNotes": "",
    "correctionsNeeded": []
  }
}
```

---

## 6. Implementation Stages & Roadmap

1. **Step Constants & Validation Rules:**
   - Define business types, ownership types, document matrices, mock bank list, Philippine regions/provinces/cities, default schedules.
2. **Components Development:**
   - `DocumentUploadCard`: handles drag-and-drop, temporary browser preview, mock progress, format validation, replace/remove.
   - `LocationPickerModal`: interactive mock pin map with coordinate updates.
   - Form steps 1 through 8.
   - `ApplicationProgress`: responsive steppers (horizontal on desktop, compact on mobile).
   - `EmailVerificationStep`: 6-digit mock OTP input with timer & error states.
   - `ApplicationSuccess`: reference number generation & receipt view.
   - `BusinessApplicationStatusPage`: status switcher demonstrating all 8 states (Draft, Pending Review, Needs Correction, Approved, Rejected, etc.).
3. **Integration into App Navigation & Routes:**
   - Add routes in `src/App.jsx`.
   - Update `PartnerApplicationPage.jsx` button to launch `/become-a-partner`.
   - Update CustomerLayout sidebar/topbar links.
4. **Testing, Linting, & Build Verification:**
   - Verify `npm run lint` and `npm run build`.
   - Test wizard navigation, backward/forward preservation, conditional documents, dark mode.
5. **Documentation Report:**
   - Write `docs/BUSINESS_APPLICATION_IMPLEMENTATION_REPORT.md`.
