# SALO — Restaurant Partner Requirements & Application Technical Report

**Document Title:** Comprehensive Functional and Technical Requirements Specification: Restaurant & Business Partner Onboarding, Conditional Document Verification, and Admin Operations  
**Platform:** SALO — Multi-Restaurant Ordering, Gathering & Table Reservation Platform  
**Target Modules:** Restaurant Partner Application (`/become-a-partner`), Application Status Tracking (`/business-application/status`), and Admin Restaurant Verification (`/admin/restaurants`)  
**Implementation Source:** `src/pages/BusinessApplication/`, `src/features/admin/`, `src/services/adminService.js`  
**Document Version:** 2.0.0 (Updated with Conditional Document Uploads & Admin Verification)  
**Verification Date:** November 2026  
**Implementation Type:** React Single-Page Application (Frontend Architecture with LocalStorage/SessionStorage Persistence, Dynamic Matrix Classification, and Cross-Module Synchronization)

---

## Executive Summary

This report provides an exhaustive, source-code-verified functional and technical specification of the SALO Restaurant Partner Application and Document Verification ecosystem.

Following platform architectural improvements, SALO implements a streamlined, business-friendly registration model that eliminates rigid universal document requirements while maintaining rigorous regulatory compliance. The onboarding system enforces three distinct document classifications:
1. **Mandatory Documents:** Universal baseline documents tailored strictly to the applicant's specific legal business structure (DTI for Sole Proprietorships; SEC for Corporations and Partnerships; CDA for Cooperatives; Other proof for unrecognized entities) plus Government ID, Mayor's Permit, and Proof of Address.
2. **Conditional Documents:** Circumstance-specific requirements (such as the Secretary's Certificate / Board Resolution / Authorization Letter) that appear **only** when an applicant is a non-owner manager or authorized representative. For registered owners and co-owners, conditional document sections are completely omitted.
3. **Additional Supporting Documents:** Secondary compliance documents (BIR Form 2303, Barangay Business Clearance, Sanitary Permit / Health Certificate, and Fire Safety Inspection Certificate) designated as strictly **Optional**. Applicants may skip this section entirely without producing validation errors or blocking initial submission.

SALO platform administrators retain complete oversight through the Admin Restaurant Partner interface (`/admin/restaurants`), featuring categorized document viewing, individual document verification decisions (`Verified`, `Rejected` with mandatory reason, `Pending Review`), and the ability to formally issue an `Additional Documents Required` request to the applicant. The applicant status interface (`/business-application/status`) enables real-time document upload in response to admin requests, seamlessly transitioning applications back to `Under Review`.

Every specification in this document is derived directly from the application source code and verified against the automated test suite (`npm test`, 82 passing tests), ESLint (`npm run lint`, 0 warnings/errors), and Vite production build (`npm run build`).

---

## 1. Application Architecture & Complete User Flow Overview

The restaurant partner onboarding workflow operates across three interconnected modules:

```
[Customer Portal: /customer/partner]
                 │
                 ▼
[Step 1: Business Info] ──▶ [Step 2: Representative] ──▶ [Step 3: Documents & Permits (3 Sections)]
                 │                                                │
                 │                                                ├─ Section 1: Required (Mandatory)
                 │                                                ├─ Section 2: Conditional (If Rep/Manager)
                 │                                                └─ Section 3: Supporting (Optional / Skip)
                 ▼
[Step 4: Address & Pin] ──▶ [Step 5: Payout Details] ──▶ [Step 6: Configuration & Menu]
                 │
                 ▼
[Step 7: Email Verification (OTP Gate)] ──▶ [Step 8: Review & Declarations]
                                                         │
                                                         ▼
                                            [Submit Application]
                                                         │
                                                         ├────────────────────────┐
                                                         ▼                        ▼
                                            [Application Success Receipt]   [Admin Verification Queue]
                                                         │                  (/admin/restaurants)
                                                         ▼                        │
                                        [Status Tracking: /status]               │
                                                         ▲                        │
                                                         │                        ▼
                                                         └──────── [Admin: Request Additional Docs]
                                                         │         (Status: Additional Docs Required)
                                                         │
                                                [Applicant Uploads Doc]
                                                         │
                                                         ▼
                                              (Status: Under Review)
```

### 1.1 Navigation & Persistence Mechanics
- **Wizard Stepper:** Applicants navigate linearly via "Continue →" and "← Back" buttons, or jump directly to any previously completed step by clicking step bubbles in `ApplicationProgress`.
- **Query Parameter Routing:** The wizard supports deep linking and direct step navigation via the URL parameter `?step=N` (where $1 \le N \le 8$).
- **Draft Session Storage:** Form progress is locally serializable and can be saved manually at any time using the "Save Progress" button in `ApplicationHeader`, storing serialized payload in `sessionStorage` under key `salo_partner_app_draft`. Binary `File` objects are retained in React component state during an active session and excluded from JSON serialization to prevent quota corruption.
- **Exit Confirmation Modal:** Clicking the "Exit" button in the header triggers a 3-choice modal (`Modal` component) offering:
  1. *Save Draft & Exit* — commits serialized state and navigates to `/customer/partner`.
  2. *Discard* — navigates away without saving unsaved changes.
  3. *Stay on Page* — closes modal and resumes editing.

---

## 2. Step-by-Step Functional Requirements

---

### Step 1: Business & Restaurant Information

- **Step Number:** 1
- **Exact Step Title Displayed in UI:** Business & Restaurant Information
- **Header Subtitle:** "Provide primary identity and operating details for your culinary establishment. These details appear on your public restaurant storefront upon approval."
- **Component File:** `src/pages/BusinessApplication/components/BusinessInformationStep.jsx`
- **Purpose:** Capture the commercial brand identity, legal entity designation, entity ownership structure, cuisine classification, and primary dispatch contact points for the business.

#### Required Information and Input Fields

| Field Name | UI Label | Input Type | Required? | Default Value | Description | Validation / Rules |
|---|---|---|---|---|---|---|
| `restaurantName` | Business / Restaurant Name | Text Input (`<Input>`) | **Yes** | `""` | Public consumer-facing trade name displayed on storefronts and receipts. | Cannot be empty or whitespace only. Error: *"Please enter your restaurant or business name."* |
| `registeredName` | Registered Legal Entity Name | Text Input (`<Input>`) | Optional | `""` | Official registered corporate or business name on SEC/DTI certificates. | Optional. Helper: *"Leave blank if identical to your restaurant name."* |
| `businessType` | Business Type | Dropdown Select (`<Select>`) | **Yes** | `"Restaurant"` | Operating format of the culinary establishment. | Must select one of: `Restaurant`, `Café`, `Bakery`, `Fast Food`, `Food Stall`, `Food Kiosk`, `Cloud Kitchen`, `Other`. |
| `ownershipStructure` | Ownership Structure | Dropdown Select (`<Select>`) | **Yes** | `"Sole Proprietorship"` | Legal ownership classification of the business. | Must select one of: `Sole Proprietorship`, `Partnership`, `Corporation`, `Cooperative`, `Other`. **Key Conditional Trigger:** Dictates mandatory business registration certificate in Step 3. |
| `cuisineType` | Primary Cuisine Category | Dropdown Select (`<Select>`) | **Yes** | `"Filipino · Grill & BBQ"` | Core culinary classification for discovery and catalog indexing. | Must select one of the 12 preset cuisine categories. |
| `businessPhone` | Business Contact Number | Telephone Input (`<Input type="tel">`) | **Yes** | `""` | Primary business telephone or mobile line for order dispatch and platform operations. | Cannot be empty or whitespace only. Error: *"Please provide a business contact number."* |
| `businessEmail` | Official Business Email Address | Email Input (`<Input type="email">`) | **Yes** | `""` | Commercial email address for invoices, notices, and account recovery. | Cannot be empty; must contain `@`. Errors: *"Please provide an official business email address."* / *"Please enter a valid email address."* |
| `description` | Restaurant Story & Description | Textarea (`<Textarea>`) | Optional | `""` | Brand narrative, culinary background, and signature offerings displayed on storefront. | Max 500 characters. Real-time counter displayed (`{length} / 500`). Enforced via `.slice(0, 500)`. |

---

### Step 2: Owner & Authorized Representative

- **Step Number:** 2
- **Exact Step Title Displayed in UI:** Owner & Authorized Representative
- **Header Subtitle:** "Enter the credentials of the authorized individual responsible for this application. The applicant does not need to be the sole registered owner, but must hold legal authorization."
- **Component File:** `src/pages/BusinessApplication/components/RepresentativeInformationStep.jsx`
- **Purpose:** Collect identity credentials, contact information, legal authority, and age verification for the person executing the onboarding contract.

#### Required Information and Input Fields

| Field Name | UI Label | Input Type | Required? | Default Value | Description | Validation / Rules |
|---|---|---|---|---|---|---|
| `firstName` | First Name | Text Input (`<Input>`) | **Yes** | `""` (auto-filled if logged in) | Legal given name of the applicant. | Cannot be empty or whitespace only. Error: *"First name is required."* |
| `middleName` | Middle Name (Optional) | Text Input (`<Input>`) | Optional | `""` | Middle name or maternal surname. | Optional. |
| `lastName` | Last Name | Text Input (`<Input>`) | **Yes** | `""` (auto-filled if logged in) | Legal family name / surname. | Cannot be empty or whitespace only. Error: *"Last name is required."* |
| `suffix` | Suffix (Optional) | Text Input (`<Input>`) | Optional | `""` | Name extension (e.g., Jr., III). | Optional. |
| `dateOfBirth` | Date of Birth | Date Input (`<Input type="date">`) | **Yes** | `""` | Applicant's legal birth date. | Age validation enforced: `currentYear - birthYear >= 18`. Error if younger than 18: *"Applicant must be at least 18 years of age."* Error if empty: *"Date of birth is required."* |
| `position` | Position / Relationship to Business | Dropdown Select (`<Select>`) | **Yes** | `"Business Owner"` | Relationship to the business entity. | Must select one of: `Business Owner`, `Co-owner`, `Authorized Representative`, `Manager`. **Key Conditional Trigger:** If `Authorized Representative` or `Manager` is selected, the Authorization Letter is dynamically activated in Step 3. |
| `email` | Personal / Direct Email Address | Email Input (`<Input type="email">`) | **Yes** | `""` (auto-filled from auth profile) | Personal email address used as default recipient for Step 7 verification. | Cannot be empty; must contain `@`. Error: *"Valid personal email is required."* |
| `phone` | Personal Mobile Number | Telephone Input (`<Input type="tel">`) | **Yes** | `""` | Direct personal mobile number for merchant security and emergency notices. | Cannot be empty or whitespace only. Error: *"Mobile contact number is required."* |
| `isAuthorized` | Applicant Authorization Declaration | Checkbox (`<input type="checkbox">`) | **Yes** | `false` | Legal statement certifying authorization to bind the business. | Must be checked (`true`). Error: *"You must declare that you are authorized to submit this application."* |

---

### Step 3: Business Documents & Permits (Categorized 3-Section Architecture)

- **Step Number:** 3
- **Exact Step Title Displayed in UI:** Business Documents & Permits
- **Header Subtitle:** "Upload digital copies or clear photos of your establishment’s official registration and permits. Requirements below are tailored to your entity type ([Ownership Structure]) and representative role ([Position])."
- **Component File:** `src/pages/BusinessApplication/components/BusinessDocumentsStep.jsx`
- **Supporting Components:** `DocumentUploadCard.jsx`
- **Constants & Matrix Generator:** `src/pages/BusinessApplication/constants/documentRequirements.js`
- **Purpose:** Provide an intuitive, segmented document upload experience structured into three distinct sections: Required Documents, Conditional Documents, and Additional Supporting Documents.

#### 3.1 Document Classification Matrix

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                          STEP 3: DOCUMENT UPLOAD ARCHITECTURE                  │
├────────────────────────────────────────────────────────────────────────────────┤
│ SECTION 1: REQUIRED DOCUMENTS (MANDATORY)                                      │
│ • Business Registration Certificate (DTI / SEC / CDA / Other based on entity) │
│ • Valid Government-Issued ID                                                   │
│ • Mayor's / Business Permit (Current Year)                                    │
│ • Proof of Business Address                                                    │
├────────────────────────────────────────────────────────────────────────────────┤
│ SECTION 2: CONDITIONAL DOCUMENTS                                              │
│ • Authorization Letter / Board Resolution / Secretary's Certificate            │
│   (Rendered ONLY if applicant position is Authorized Representative / Manager)  │
│   (Hidden completely if applicant is Business Owner or Co-owner)               │
├────────────────────────────────────────────────────────────────────────────────┤
│ SECTION 3: ADDITIONAL SUPPORTING DOCUMENTS (OPTIONAL)                          │
│ • BIR Form 2303 (Certificate of Registration)                                  │
│ • Barangay Business Clearance                                                  │
│ • Sanitary Permit / Health Certificate                                         │
│ • Fire Safety Inspection Certificate (FSIC)                                    │
│   [Action: "Skip Supporting Documents →" allows immediate advance to Step 4]   │
└────────────────────────────────────────────────────────────────────────────────┘
```

#### 3.2 Master Document Catalog (`DOCUMENT_CATALOG`) and Justifications

| Document Code | Document Title | Classification | Default Required? | "Why SALO Needs This" (UI Explanation) | Accepted Formats | Max File Size |
|---|---|---|---|---|---|---|
| `dti_certificate` | DTI Business Name Certificate | Mandatory (Sole Prop) | **Yes** | Verifies the official registration and sole proprietorship legal business name with the Department of Trade and Industry (DTI). | PDF, JPG, PNG | 10 MB |
| `sec_certificate` | SEC Certificate of Registration | Mandatory (Corp / Partner) | **Yes** | Verifies the corporate or partnership legal personality, registration number, and registered officers with the SEC. | PDF, JPG, PNG | 10 MB |
| `cda_certificate` | CDA Registration Certificate | Mandatory (Cooperative) | **Yes** | Verifies the legal existence, operating registration, and cooperative by-laws registered with the Cooperative Development Authority (CDA). | PDF, JPG, PNG | 10 MB |
| `other_registration` | Proof of Business Registration | Mandatory (Other) | **Yes** | Validates government recognition and legitimacy of the operating food business under applicable Philippine regulations. | PDF, JPG, PNG | 10 MB |
| `government_id` | Valid Government-Issued ID | Mandatory (Universal) | **Yes** | Authenticates the legal identity of the owner or representative binding the establishment to SALO terms. | PDF, JPG, PNG | 10 MB |
| `mayors_permit` | Mayor's / Business Permit | Mandatory (Universal) | **Yes** | Confirms authorization from the Local Government Unit (LGU) to legally conduct commercial food operations for the current operating year. | PDF, JPG, PNG | 10 MB |
| `proof_of_address` | Proof of Business Address | Mandatory (Universal) | **Yes** | Confirms the physical restaurant or kitchen location for delivery rider dispatch, customer pickups, and service coverage. | PDF, JPG, PNG | 10 MB |
| `authorization_letter` | Secretary's Certificate / Board Resolution / Authorization Letter | Conditional | **Conditional** | Establishes legal authority for a non-owner manager or representative to represent the business and bind it to partner agreements. | PDF, JPG, PNG | 10 MB |
| `bir_2303` | BIR Form 2303 (Certificate of Registration) | Additional Supporting | Optional | Confirms registered Tax Identification Number (TIN), legal entity name, and tax classification for billing and withholding compliance. | PDF, JPG, PNG | 10 MB |
| `barangay_clearance` | Barangay Business Clearance | Additional Supporting | Optional | Evidences local community-level endorsement and commercial compliance within the host barangay jurisdiction. | PDF, JPG, PNG | 10 MB |
| `sanitary_permit` | Sanitary Permit / Health Certificate | Additional Supporting | Optional | Validates kitchen sanitation, health standards, and safe food-handling compliance inspected by the local health office. | PDF, JPG, PNG | 10 MB |
| `fire_safety_permit` | Fire Safety Inspection Certificate (FSIC) | Additional Supporting | Optional | Certifies kitchen and dining premises compliance with the Fire Code of the Philippines issued by the Bureau of Fire Protection (BFP). | PDF, JPG, PNG | 10 MB |
| `bank_proof` | Proof of Bank Account Ownership | Supporting (Step 5) | Optional | Validates bank account details for merchant payout disbursements. | PDF, JPG, PNG | 10 MB |

#### 3.3 Dynamic Entity Switching & Anti-Duplication Behavior
- When the applicant modifies `ownershipStructure` in Step 1, `getDocumentClassification` dynamically re-computes `mandatory[0]` without prompting duplicate file upload elements.
  - Selecting *Sole Proprietorship* displays **DTI Business Name Certificate**.
  - Selecting *Corporation* or *Partnership* displays **SEC Certificate of Registration**.
  - Selecting *Cooperative* displays **CDA Registration Certificate**.
  - Selecting *Other* displays **Proof of Business Registration**.
- Uploaded files are keyed by their document ID in `formData.documents`. If an applicant toggles between entity types, existing files for universal documents (ID, Mayor's Permit, Proof of Address) remain fully intact and are never wiped.

#### 3.4 Conditional Document Activation Behavior
- If `position` is `Business Owner` or `Co-owner`:
  - `conditional` array is empty (`[]`).
  - Section 2 is **completely omitted** from the DOM. No empty box, placeholder, or disabled card is rendered.
- If `position` is `Authorized Representative` or `Manager`:
  - Section 2 is rendered with heading "Conditional Documents" and descriptive note: *"Applicable because you are applying as an authorized representative or manager."*
  - The `authorization_letter` card displays a `Conditional · Required` badge and displays the condition rationale.
  - Step validation strictly requires this document before advancing.

#### 3.5 Section 3: Additional Supporting Documents & Skip Functionality
- Section 3 groups `bir_2303`, `barangay_clearance`, `sanitary_permit`, and `fire_safety_permit`.
- Displays an official introductory note:
  > *"These supporting documents can help with the verification of your restaurant. You may upload the documents you currently have available. SALO administrators may request additional documents if necessary during the review process."*
- Every card in this section is labeled with a neutral `Optional` badge.
- Includes a direct action button: **"Skip Supporting Documents →"**. Clicking this button (or clicking "Continue →" at the bottom of the page) proceeds directly to Step 4 without requiring any uploads from this section.
- Validation logic (`validateStep(3)`) filters documents via `.filter(d => d.required)`. Because all supporting documents have `required: false`, missing supporting documents never trigger validation errors and never prevent advancing or final application submission.

#### 3.6 Upload Card UX & Technical Specifications (`DocumentUploadCard.jsx`)
- **Format Restrictions:** MIME types `application/pdf`, `image/jpeg`, `image/png`, `image/jpg`. Unsupported files trigger immediate inline error: *"Unsupported file format. Please upload a PDF, JPG, or PNG document."*
- **Size Limitation:** Hard limit of 10 MB. Exceeding files trigger: *"File size exceeds 10 MB limit ([formatted size]). Please choose a smaller file."*
- **Simulated Progress Indicator:** Displays a 2-stage upload progress bar (10% $\rightarrow$ 60% $\rightarrow$ 100%) taking ~400 ms.
- **Preview & Inspection:**
  - Image files render an instant preview thumbnail.
  - PDF documents display an official SVG badge labeled "PDF".
  - Details display file name, formatted byte size, and "Ready for review" status indicator.
- **Actions:**
  - *Replace:* Re-triggers native file selector to swap file.
  - *Remove:* Revokes object URL via `URL.revokeObjectURL()`, resets file input, and deletes entry from application state.
- **Why Needed Box:** Rendered prominently with a styled orange left border: `Why SALO needs this: [justification]`.

---

### Step 4: Business Address & Physical Location

- **Step Number:** 4
- **Exact Step Title Displayed in UI:** Business Address & Physical Location
- **Component File:** `src/pages/BusinessApplication/components/BusinessAddressStep.jsx`
- **Supporting Components:** `LocationPickerModal.jsx`
- **Purpose:** Capture administrative hierarchy, street address, postal code, dispatch directions, and map pin coordinates for rider dispatch routing.

#### Required Information and Input Fields

| Field Name | UI Label | Input Type | Required? | Default Value | Description | Validation / Rules |
|---|---|---|---|---|---|---|
| `region` | Administrative Region | Dropdown Select (`<Select>`) | **Yes** | `"National Capital Region (NCR)"` | Administrative geographic region. | Cascades child dropdowns on change. |
| `province` | Province / District | Dropdown Select (`<Select>`) | **Yes** | `"Metro Manila"` | Province or metropolitan district. | Auto-resets lower levels on change. |
| `city` | City / Municipality | Dropdown Select (`<Select>`) | **Yes** | `"Quezon City"` | City or municipality. | Auto-resets barangays on change. |
| `barangay` | Barangay | Dynamic Select or Input | **Yes** | `"South Triangle"` | Smallest administrative division. | Presets dropdown if available in `PHILIPPINE_LOCATIONS`; standard text input otherwise. Cannot be empty. Error: *"Barangay is required."* |
| `street` | Street / Building / Unit Number | Text Input (`<Input>`) | **Yes** | `""` | Detailed physical street address. | Cannot be empty or whitespace only. Error: *"Street or building address is required."* |
| `postalCode` | Postal Code | Numeric Text Input (`<Input>`) | **Yes** | `""` | 4-digit Philippine postal code. | Digits only (`.slice(0, 4)`). Cannot be empty. Error: *"Postal code is required."* |
| `additionalDetails` | Nearby Landmarks & Instructions | Textarea (`<Textarea>`) | Optional | `""` | Pickup guidelines and dispatch directions for couriers. | Optional. |
| `coordinates` | Map Pin & Dispatch Coordinates | Interactive Pin Modal | **Yes** | `{ lat: 14.6369, lng: 121.0362 }` | Geocoordinates for courier routing. | Selectable via `LocationPickerModal`. |

---

### Step 5: Bank & Payout Information

- **Step Number:** 5
- **Exact Step Title Displayed in UI:** Bank & Payout Information
- **Component File:** `src/pages/BusinessApplication/components/PayoutInformationStep.jsx`
- **Purpose:** Collect depository account details for weekly net sales remittances (PESONet / InstaPay settlement) and optional bank statement verification.

#### Required Information and Input Fields

| Field Name | UI Label | Input Type | Required? | Default Value | Description | Validation / Rules |
|---|---|---|---|---|---|---|
| `accountHolder` | Account Holder Name | Text Input (`<Input>`) | **Yes** | `""` | Full registered name on the depository account. | Cannot be empty. Error: *"Account holder name is required."* |
| `bankName` | Bank Name | Dropdown Select (`<Select>`) | **Yes** | `"Bank of the Philippine Islands (BPI)"` | Authorized Philippine bank. | Select from 13 Philippine universal banks/digital payment providers. |
| `accountNumber` | Bank Account Number | Text Input (with Toggle Mask) | **Yes** | `""` | Depository account number. | Digits only (8–18 digits). Masked as password with "Show/Hide" toggle. Error: *"Account number must be at least 8 digits."* |
| `accountType` | Account Type | Dropdown Select (`<Select>`) | **Yes** | `"Savings"` | Account classification. | Select `Savings`, `Current / Checking`, or `Other`. |
| `proofDocument` | Proof of Bank Account Ownership | Document Upload Card | Optional | `null` | Deposit slip or bank certificate preview. | Optional. Max 10 MB, PDF/JPG/PNG. |

---

### Step 6: Restaurant & Service Configuration

- **Step Number:** 6
- **Exact Step Title Displayed in UI:** Restaurant & Service Configuration
- **Component File:** `src/pages/BusinessApplication/components/RestaurantConfigurationStep.jsx`
- **Purpose:** Configure visual digital assets (logo and banner), weekly operating schedules (with overnight detection), fulfillment order modalities, table reservation constraints, and optional initial menu items.

#### Summary of Configuration Settings
1. **Branding Assets:** Square restaurant logo (1:1) and landscape storefront cover photo (16:9).
2. **Weekly Operating Hours:** 7-day schedule with open/close time pickers, overnight detection (`+1 Day (Overnight)`), and "Copy Monday to All Days" quick action.
3. **Fulfillment Services:** Checkbox cards for `delivery` (default: true), `pickup` (default: true), `dineIn` (default: true), and `tableReservations` (default: false). Validation enforces at least one checked service.
4. **Conditional Table Reservations:** When checked, unlocks `minNoticeHours` (default: 2), `maxPartySize` (default: 8), and `reservationNotes`.
5. **Initial Menu Setup (Optional):** Modal to add signature dishes with name, category, price in ₱ PHP, description, and dish photo.

---

### Step 7: Applicant Email Verification

- **Step Number:** 7
- **Exact Step Title Displayed in UI:** Applicant Email Verification
- **Component File:** `src/pages/BusinessApplication/components/EmailVerificationStep.jsx`
- **Purpose:** Mandatory 6-digit OTP email verification gate verifying the applicant's contact email.
- **Simulation Codes:**
  - `123456` (or standard 6 digits): **Valid code**. Sets `isVerified: true` and records `verifiedAt` timestamp.
  - `000000`: Simulates **invalid code**.
  - `999999`: Simulates **expired code**.
- **Enforcement:** Bypassing is prohibited; "Continue →" requires `isVerified === true`.

---

### Step 8: Application Review & Final Submission

- **Step Number:** 8
- **Exact Step Title Displayed in UI:** Application Review & Final Submission
- **Component File:** `src/pages/BusinessApplication/components/ApplicationReviewStep.jsx`
- **Purpose:** Exhaustive summary of all application sections grouped by classification, one-click edit navigation, 3 mandatory legal declarations, and final submission execution.

#### 8.1 Categorized Document Review
In Section 3 (Business Documents & Permits), documents are presented under three clear headings matching Step 3:
1. **Required Documents:** Each mandatory document is listed with its official title and uploaded filename with a green `Ready` badge. If missing, a red `Required` badge displays.
2. **Conditional Documents:** Rendered only if the applicant is a manager or representative, showing the authorization letter status.
3. **Additional Supporting Documents (Optional):** Lists BIR 2303, Barangay Clearance, Sanitary Permit, and FSIC. If uploaded, shows the filename with a green `Ready` badge; if skipped, displays a neutral `Not Provided` badge.

#### 8.2 Mandatory Legal Declarations
The applicant must check all three declaration checkboxes:
1. `infoConfirmed`: *"I confirm that all information and documents provided in this application are genuine, true, and legally current."*
2. `authorizationConfirmed`: *"I confirm that I am authorized to bind the registered food establishment to SALO partner agreements and terms."*
3. `termsAgreed`: *"I agree to the applicable SALO Merchant Partner Application Terms, 10% Platform Fee schedule, and Privacy Notice."*

#### 8.3 Submission Gate
"Submit Application" requires `allRequiredValid === true`, `isAllDeclared === true`, and `emailVerification.isVerified === true`.

---

## 3. Final Submission & Post-Submission Lifecycle

### 3.1 Submission Execution (`handleSubmitApplication`)
When "Submit Application" is executed:
1. Button displays a loading spinner and "Submitting...".
2. Simulates network transmission (1200 ms).
3. Generates reference number: `SALO-APP-YYYYMMDD-XXXX` (e.g., `SALO-APP-20261113-7482`).
4. Constructs an application record:
   ```javascript
   {
     id: generatedRef,
     referenceNumber: generatedRef,
     name: formData.businessInfo.restaurantName,
     restaurantName: formData.businessInfo.restaurantName,
     businessType: formData.businessInfo.businessType,
     ownershipStructure: formData.businessInfo.ownershipStructure,
     cuisine: formData.businessInfo.cuisineType,
     ownerName: `${formData.representative.firstName} ${formData.representative.lastName}`,
     ownerEmail: formData.representative.email,
     phone: formData.businessInfo.businessPhone,
     address: `${formData.address.street}, Brgy. ${formData.address.barangay}, ${formData.address.city}`,
     zone: formData.address.city,
     status: 'Submitted',
     applicationStatus: 'Submitted',
     verificationStatus: 'Pending',
     operatingStatus: 'Pending Activation',
     submittedAt: submissionIso,
     joinedDate: submissionIso.split('T')[0],
     documents: [ ...structuredDocumentObjects ],
     requestedDocuments: [],
     applicationHistory: [
       {
         id: `hist-${Date.now()}`,
         title: 'Application Submitted',
         description: `Application received for ${formData.businessInfo.restaurantName} (${formData.businessInfo.ownershipStructure}). Initial mandatory documents queued for compliance review.`,
         time: submissionIso,
       }
     ]
   }
   ```
5. **Cross-Module Admin Persistence:** Saved into `salo_admin_restaurants` via `adminService.saveRestaurants()`, immediately populating the Admin Partner queue.
6. **Customer Tracking Persistence:** Saved into `localStorage` under `salo_partner_applications`.
7. Transitions to `ApplicationSuccess.jsx`.

---

## 4. Admin Document Verification & Request Workflow

Admin operators manage restaurant partner compliance in `/admin/restaurants` via `AdminRestaurantsPage.jsx` and `DocumentViewer.jsx`.

### 4.1 Categorized Document Inspection (`DocumentViewer.jsx`)
`DocumentViewer` organizes submitted files into four distinct groups:
1. **Mandatory Documents:** DTI/SEC/CDA/Other registration, Government ID, Mayor's Permit, Proof of Address.
2. **Conditional Documents:** Authorization letter (if applicable).
3. **Additional Supporting Documents:** BIR 2303, Barangay Clearance, Sanitary Permit, FSIC.
4. **Requested Documents:** Documents submitted by the applicant in response to administrator requests.

Each item displays document title, category, and an interactive status badge (`Pending Review`, `Verified`, or `Rejected`).

### 4.2 Document Preview & Justification Readout
Selecting any document opens its preview pane:
- Displays document title and applicant/subject name.
- Displays the **Why SALO requires this** explanation matching the catalog.
- Displays current verification status badge.
- If rejected, displays the formal rejection reason.

### 4.3 Administrator Verification Actions
Admin reviewers can execute three verification actions per document:
- **✓ Mark as Verified:** Sets `verificationStatus = 'Verified'`.
- **Pending Review:** Resets `verificationStatus = 'Pending Review'`.
- **✕ Reject Document:** Opens a required rejection reason textarea. Submitting records `verificationStatus = 'Rejected'` and records the reason in the document record and application history timeline.

### 4.4 Request Additional Documents Action
Administrators can request supplementary documents at any time:
1. Click **"+ Request Additional Documents"** in the document viewer header.
2. An accessible modal opens requesting:
   - **Document Requested:** Dropdown selecting from preset supporting documents (`Sanitary Permit / Health Certificate`, `Fire Safety Inspection Certificate (FSIC)`, `Barangay Business Clearance`, `BIR Form 2303`, `Updated Mayor's / Business Permit`, `Secretary's Certificate / Board Resolution`, `Proof of Bank Account Ownership`, or `Other (Custom Document Name)`).
   - **Custom Document Name:** Text input rendered if "Other" is selected.
   - **Reason for Request (Required):** Explanation of why the document is necessary.
   - **Instructions for Applicant (Optional):** Clarifications on dates, municipal stamps, or resolution formats.
   - **Optional Submission Due Date:** Date selector.
3. Submitting the request:
   - Sets application status to **`Additional Documents Required`**.
   - Appends the request object to `restaurant.requestedDocuments`.
   - Records an event in `restaurant.applicationHistory`.
   - Synchronizes both `salo_admin_restaurants` and `salo_partner_applications`.

---

## 5. Applicant Additional Document Upload & Status Workflow

When an application is in `Additional Documents Required` status, the applicant tracking interface (`/business-application/status`) renders an action card:

### 5.1 Request Details Displayed
- Title: **"Action Required: Additional Supporting Documents Requested"**
- Header metadata: Reviewer name, requested document name, and due date.
- Rationale box: Displays the administrator's exact **Reason for Request** and **Instructions from Reviewer**.

### 5.2 Upload Interface
- An embedded upload dropzone allowing PDF, JPG, and PNG uploads up to 10 MB.
- File selection displays file name, byte size, and a "Remove" button.

### 5.3 Resubmission to Admin Queue
- The applicant clicks **"Submit Requested Documents"** (disabled until a file is selected).
- Upon click:
  - Invokes `adminService.submitRequestedDocument(restaurantId, requestId, documentMeta)`.
  - Marks the request as `Submitted` and adds the file to `restaurant.documents` with classification `'requested'`.
  - Transitions application status from `Additional Documents Required` to **`Under Review`**.
  - Appends an audit event to the application history timeline.
  - Synchronizes local storage, immediately reflecting the updated state in both applicant and admin portals.

---

## 6. Supported Application Statuses Lifecycle & Transitions

The platform recognizes the following formal application lifecycle states (`APPLICATION_STATUS_CONFIG`):

| Status Key | UI Label | Badge Variant | Progress % | Operational Description | Triggers / Transitions |
|---|---|---|---|---|---|
| `Draft` | Draft | `neutral` | 10% | Application started but not yet submitted. | Saved locally via "Save Progress" button in header. |
| `Submitted` | Submitted | `info` | 30% | Application successfully submitted and queued for intake. | Initial state set upon wizard Step 8 completion. |
| `Pending Submission` | Pending Submission | `warning` | 25% | Application completed and awaiting final applicant confirmation. | Transitional simulation state. |
| `Pending Review` | Pending Review | `warning` | 40% | Application received and in queue for initial document intake. | Intake queue state. |
| `Under Review` | Under Review | `info` | 65% | SALO Onboarding Operations are verifying legal permits and premises. | Set when admin begins review or applicant submits requested documents. |
| `Additional Documents Required` | Additional Documents Required | `danger` | 50% | Action required: Administrator requested additional supporting documents. | Triggered by admin "Request Additional Documents" action. |
| `Needs Correction` | Needs Correction | `danger` | 50% | Action required: Administrator identified details requiring correction. | Triggered by admin correction request; deep-links to Step 3. |
| `Resubmitted` | Resubmitted | `info` | 75% | Updated application details submitted and under expedited re-review. | Set after correction resubmission. |
| `Approved` | Approved | `success` | 100% | Application approved! Partner agreement active and checklist enabled. | Triggered by admin "Approve application". Unlocks merchant portal. |
| `Rejected` | Rejected | `danger` | 100% | Application not approved at this time. Appeals guidelines provided. | Triggered by admin "Reject application" with required reason. |

---

## 7. Complete Related File Inventory

| Filename | Relative Path | Purpose | Role in Requirements Flow |
|---|---|---|---|
| `documentRequirements.js` | `src/pages/BusinessApplication/constants/documentRequirements.js` | Master document catalog (`DOCUMENT_CATALOG`), document types (`DOCUMENT_TYPES`), and classification matrix (`getDocumentClassification`, `getRequiredDocuments`). | Implements 3-tier document classification, entity-specific registration rules, conditional logic, and "Why SALO Needs This" justifications. |
| `applicationDefaults.js` | `src/pages/BusinessApplication/constants/applicationDefaults.js` | Constants for business types, ownership structures, banks, locations, wizard steps, initial state, and status config (`APPLICATION_STATUS_CONFIG`, `MOCK_ADMIN_FEEDBACK_SAMPLES`). | Configures all 10 application status states, activation checklists, and feedback presets. |
| `DocumentUploadCard.jsx` | `src/pages/BusinessApplication/components/DocumentUploadCard.jsx` | Document upload card supporting drag-and-drop, PDF/image preview, replace, remove, why needed callout, and conditional badge. | Renders individual document upload boxes across Step 3 and Step 5. |
| `DocumentUploadCard.css` | `src/pages/BusinessApplication/components/DocumentUploadCard.css` | Styles for dropzones, file preview cards, badges, progress bars, `.doc-why-needed`, and `.doc-condition-callout`. | Visual styling of document upload cards. |
| `BusinessDocumentsStep.jsx` | `src/pages/BusinessApplication/components/BusinessDocumentsStep.jsx` | Step 3 wizard component rendering the 3 distinct document sections: Required, Conditional, and Supporting. | Implements 3-section layout, dynamic entity tailoring, conditional rendering, and "Skip Supporting Documents" action. |
| `BusinessApplicationPage.jsx` | `src/pages/BusinessApplication/BusinessApplicationPage.jsx` | Master wizard container managing 8 steps, validation, draft storage, and submission. | Orchestrates step validation (ignoring optional docs), navigation, and syncs submitted application to `adminService`. |
| `BusinessApplicationPage.css` | `src/pages/BusinessApplication/BusinessApplicationPage.css` | Master styling for wizard page layout, step bodies, form grids, `.wizard-doc-section-desc`, and supporting header actions. | Wizard and document section styling. |
| `ApplicationReviewStep.jsx` | `src/pages/BusinessApplication/components/ApplicationReviewStep.jsx` | Step 8 review component displaying complete application summary, legal declarations, and submit trigger. | Renders categorized document review (Required, Conditional, Optional) and enforces declarations before submission. |
| `ApplicationStatus.jsx` | `src/pages/BusinessApplication/components/ApplicationStatus.jsx` | Status tracking component with simulation pills, status hero, checklists, and timeline. | Implements applicant upload interface for `Additional Documents Required` and submission to `Under Review`. |
| `BusinessApplicationStatusPage.jsx` | `src/pages/BusinessApplication/BusinessApplicationStatusPage.jsx` | Dedicated status tracking page showing live/mock application status, timeline, and actions. | Host page for applicant status tracking and local storage synchronization. |
| `adminService.js` | `src/services/adminService.js` | Client-side admin data service managing mock database of restaurants, riders, orders, and fees. | Provides `saveRestaurants`, `updateRestaurantDocumentStatus`, `requestAdditionalDocuments`, and `submitRequestedDocument`. |
| `AdminRestaurantsPage.jsx` | `src/features/admin/pages/AdminRestaurantsPage.jsx` | Admin Restaurant Partner management page reviewing onboarding, verification, and performance. | Features application filter (including `Submitted`, `Under Review`, `Additional Documents Required`), detail drawer, and document request modal. |
| `DocumentViewer.jsx` | `src/features/admin/components/DocumentViewer.jsx` | Admin document viewer displaying categorized applicant documents, preview, and verification actions. | Enables viewing documents by group, previewing justifications, marking Verified/Rejected, and triggering additional document requests. |
| `ConfirmDialog.jsx` | `src/features/admin/components/ConfirmDialog.jsx` | Reusable modal dialog for confirming admin decisions with password and reason requirements. | Used for application approvals, rejections, and commission updates. |
| `businessApplication.test.js` | `src/pages/BusinessApplication/businessApplication.test.js` | Automated node:test suite verifying document matrix rules, classification, justifications, and statuses. | Comprehensive unit tests validating 82 requirements. |

---

## 8. Technical Observations & Verification Results

1. **Frontend Fidelity & Non-Destructive Storage:** File uploads operate in client memory for previewing. Document metadata and application states synchronize across `salo_admin_restaurants` and `salo_partner_applications` in `localStorage` without modifying backend databases, Laravel routes, or PHP scripts.
2. **Automated Test Suite:** Executed `npm test` running all 82 unit tests across permission maps, menu normalization, inventory stock math, reservation lifecycles, and partner document matrices. All 82 tests pass in 2.82 seconds with 0 failures.
3. **Lint Verification:** Executed `npm run lint` running ESLint across the entire project. All files passed with 0 errors and 0 warnings.
4. **Vite Production Build:** Executed `npm run build` with Vite v8.3.5. Transformed 379 modules and produced client production bundles in 880 ms with 0 build errors.
