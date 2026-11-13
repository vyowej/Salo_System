# SALO — Rider Partner Requirements & Application Technical Report

**Document Title:** Comprehensive Functional and Technical Requirements Specification: Delivery Courier & Rider Partner Onboarding  
**Platform:** SALO — Multi-Restaurant Ordering, Gathering & Table Reservation Platform  
**Target Module:** Rider Partner Application (`/become-a-rider`) and Application Status Tracking (`/rider-application/status`)  
**Implementation Source:** `src/pages/RiderApplication/`  
**Document Version:** 1.0.0  
**Verification Date:** November 2026  
**Implementation Type:** React Single-Page Application (Frontend Architecture with Native Camera Integration, Canvas Image Compression, LocalStorage Persistence, and Admin Service Synchronization)

---

## Executive Summary

This report provides an exhaustive, source-code-verified functional and technical specification of the SALO Delivery Courier and Rider Partner Application workflow. It documents all mandatory information, vehicle specifications, document upload and live camera capture requirements, background clearance rules, emergency contact configurations, legal declarations, and status lifecycle transitions that a delivery courier encounters on SALO.

Every specification in this document is derived directly from the application source code in `src/pages/RiderApplication/`, verified against its accompanying test suite (`riderApplication.test.js`) and live route integrations (`src/App.jsx`).

---

## 1. Application Architecture & User Flow Overview

The rider partner onboarding workflow operates as a 10-step wizard interface accompanied by a dedicated status tracking module:

```
[Customer Portal: /customer/partner] or [/rider]
                         │
                         ▼
[Step 1: Company & Email OTP Gate] ──────────┐ (Mandatory Gate: must verify before Step 2)
                         │                   │
                         ▼                   │
[Step 2: Personal Information]               │
                         │                   │
                         ▼                   │
[Step 3: Identity Verification]              │
                         │                   │
                         ▼                   │
[Step 4: Delivery Method Selection]          │
  ├── Motorcycle                             │
  ├── Bicycle                                │
  ├── E-bike                                 │
  ├── E-scooter                              │
  └── Walking (Pedestrian)                   │
                         │                   │
                         ▼                   │
[Step 5: Vehicle Details] ◄──────────────────┘ (Adapts dynamically to transport mode)
                         │
                         ▼
[Step 6: Vehicle Documents & Licensing] (Exempt for Walking; OR/CR for Motorcycle)
                         │
                         ▼
[Step 7: Background Clearances] (NBI or Police Clearance mandatory)
                         │
                         ▼
[Step 8: Coverage & Emergency Contacts]
                         │
                         ▼
[Step 9: Earnings & Payout Setup]
                         │
                         ▼
[Step 10: Agreement & Application Review]
                         │
                         ▼
               [Submit Application]
                         │
                         ▼
          [Application Success Receipt]
                         │
                         ▼
   [Status Tracking: /rider-application/status]
```

### 1.1 Navigation, Persistence & Camera Mechanics
- **Sequential Stepper:** Applicants navigate linearly using "Continue →" and "← Back" buttons, or jump directly to any previously completed step by clicking step nodes in `RiderApplicationProgress`.
- **Mandatory Step 1 Gate:** Step 1 (Company & Email OTP) acts as a strict onboarding gate. The applicant cannot jump forward or advance to Step 2 until the 6-digit email OTP has been verified (`formData.emailVerification.isVerified === true`).
- **Persistent Local Draft Storage:** Form progress is automatically serializable to browser `localStorage` under key `salo_rider_app_draft_v1` via `saveRiderDraft()`. Unlike standard browser sessions, the rider draft service includes an automated **HTML Canvas Image Compression Engine** (`compressImageToDataUrl`) that compresses photos and document captures to compact JPEGs ($\le 1280\text{ px}$ dimension, 82% quality, $\sim 100\text{–}250\text{ KB}$ per image) so all captured photos, vehicle documents, and clearance images survive browser reloads and session restarts without triggering `QuotaExceededError`.
- **Unsaved Changes Guard (`beforeunload`):** If changes have been made without saving, the window `beforeunload` listener intercepts page reloads or tab closures.
- **3-Option Exit Modal (`ExitConfirmModal.jsx`):** If the applicant clicks "Exit" while unsaved changes exist (`isDirty === true`), an accessible dialog renders three options:
  1. *Save draft and exit* — executes `saveRiderDraft()` and navigates to `/rider`.
  2. *Exit without saving* — navigates away without committing unsaved session state.
  3. *Cancel* — closes modal and resumes editing.
- **Live In-App Camera Integration (`CameraCaptureModal.jsx`):** Supported photo requirements provide an in-app live camera modal powered by HTML5 `navigator.mediaDevices.getUserMedia()`, supporting camera switching (user/front for selfies, environment/rear for documents and vehicles), live viewfinder overlays, instant canvas capture, retake capability, and automatic fallback to file selection or device native camera.

---

## 2. Step-by-Step Functional Requirements

---

### Step 1: Company & Email OTP Verification (Mandatory Gate)

- **Step Number:** 1
- **Exact Step Title Displayed in UI:** Company & Email Verification
- **Header Subtitle:** "Verify your company or courier contact email to start your application. Receiving and confirming your OTP code is mandatory to proceed to the next step."
- **Component File:** `src/pages/RiderApplication/components/EmailVerificationStep.jsx`
- **Purpose:** Authenticate the courier's official email address and establish entity/fleet affiliation before collecting personal or vehicle information.

#### Required Information and Input Fields

| Field Name | UI Label | Input Type | Required? | Default Value | Description | Validation / Rules |
|---|---|---|---|---|---|---|
| `companyName` | Company / Fleet Operator Name (Optional) | Text Input (`<Input>`) | Optional | `""` | Registered corporate delivery fleet, logistics agency, or courier partner. | Optional. Helper: *"Leave blank if applying as an independent courier."* |
| `email` | Official Company / Rider Email | Email Input (`<Input type="email">`) | **Yes** | `""` (auto-filled if user logged in) | Contact email address that will receive the 6-digit one-time passcode. | Cannot be empty; must contain `@` and `.`. Error: *"Please provide a valid company or rider contact email address."* |
| `otpDigits` | Enter Verification Code (OTP) | 6-Box Numeric Input Grid | **Yes** | `['', '', '', '', '', '']` | Six-digit one-time authentication code. | Must be 6 digits. Auto-advances focus on digit entry; backspace navigates back; supports clipboard paste. Error: *"Please enter all 6 digits of the OTP verification code."* |

#### OTP Verification Logic & Simulated Responses
- **Send OTP Simulation:** Clicking *"Receive OTP Verification Code →"* triggers a 600 ms simulated network request, locks email editing, starts a 60-second cooldown timer, and reveals the 6-digit input boxes.
- **Cooldown Timer:** A 60-second countdown runs (`secondsRemaining`). The *"Resend Code"* button remains disabled until the timer reaches zero.
- **Simulation Codes Supported:**
  - `123456` (or any 6-digit number other than `000000` and `999999`): **Success.** Sets `isVerified: true`, records `verifiedAt` ISO timestamp, pre-populates personal email for Step 2, marks Step 1 completed, and renders green verified banner.
  - `000000`: **Invalid Code Error.** Displays: *"Invalid verification code. Please check your code or request a new one."*
  - `999999`: **Expired Code Error.** Displays: *"This verification code has expired. Please click 'Resend Code' to receive a fresh one."*
- **Re-Verification / Change Email:** A *"Change Email or Re-verify"* button resets verification state, re-enables email input, and allows issuing a new code.
- **Progression Gate:** If the applicant attempts to navigate to Step 2 without verification, progression is blocked with error: *"You must receive and verify the 6-digit email OTP before proceeding to Step 2."*

---

### Step 2: Personal & Contact Information

- **Step Number:** 2
- **Exact Step Title Displayed in UI:** Personal & Contact Information
- **Header Subtitle:** "Enter your legal personal credentials as they appear on your government-issued identity documents. As an existing SALO customer, your account profile is linked directly."
- **Component File:** `src/pages/RiderApplication/components/PersonalInformationStep.jsx`
- **Purpose:** Collect full legal name, date of birth, age verification ($\ge 18$), contact telephone, and complete residential address.

#### Required Information and Input Fields

| Field Name | UI Label | Input Type | Required? | Default Value | Description | Validation / Rules |
|---|---|---|---|---|---|---|
| `firstName` | First Name | Text Input (`<Input>`) | **Yes** | `""` (auto-filled from auth profile) | Legal given name as shown on government ID. | Cannot be empty or whitespace only. Error: *"First name is required."* |
| `middleName` | Middle Name (Optional) | Text Input (`<Input>`) | Optional | `""` | Maternal surname or middle name. | Optional. |
| `lastName` | Last Name | Text Input (`<Input>`) | **Yes** | `""` (auto-filled from auth profile) | Legal family name / surname. | Cannot be empty or whitespace only. Error: *"Last name is required."* |
| `suffix` | Suffix (Optional) | Text Input (`<Input>`) | Optional | `""` | Name suffix (e.g., Jr., III). | Optional. |
| `dateOfBirth` | Date of Birth | Date Input (`<Input type="date">`) | **Yes** | `""` | Legal date of birth. | Cannot be empty. Must evaluate to at least 18 years of age based on exact birthdate calculation. Error if $< 18$: *"You must be at least 18 years old to apply as a SALO delivery rider."* Helper dynamically displays calculated applicant age. |
| `gender` | Gender (Optional) | Dropdown Select (`<Select>`) | Optional | `"Prefer not to say"` | Gender identity. | Options: `Prefer not to say`, `Male`, `Female`, `Non-binary / Other`. |
| `email` | Email Address | Email Input (`<Input type="email">`) | **Yes** | Inherited from Step 1 OTP | Courier contact email. | Read-only/verified reference. Helper: *"Authenticated via Step 1 OTP ✓"*. |
| `phone` | Philippine Mobile Number | Telephone Input (`<Input type="tel">`) | **Yes** | `""` (or customer profile phone) | Primary mobile telephone line for dispatch and in-app communications. | Cannot be empty or whitespace only. Error: *"Mobile contact number is required."* |
| `street` | House / Unit / Building Number & Street | Text Input (`<Input>`) | **Yes** | `""` | Detailed residential street address. | Cannot be empty. Error: *"Street address is required."* |
| `barangay` | Barangay | Text Input (`<Input>`) | **Yes** | `"South Triangle"` | Residential barangay district. | Cannot be empty. |
| `city` | City / Municipality | Text Input (`<Input>`) | **Yes** | `"Quezon City"` | Residential city or municipality. | Cannot be empty. |
| `province` | Province / Region | Text Input (`<Input>`) | **Yes** | `"Metro Manila"` | Residential province or administrative metropolitan area. | Cannot be empty. |
| `postalCode` | Postal Code | Numeric Text Input (`<Input>`) | **Yes** | `""` | 4-digit Philippine postal code. | Cannot be empty. Filtered: `.replace(/\D/g, '').slice(0, 4)`. Error: *"Postal code is required."* |

---

### Step 3: Identity Verification Documents

- **Step Number:** 3
- **Exact Step Title Displayed in UI:** Identity Verification Documents
- **Header Subtitle:** "Upload clear color copies of an official Philippine government-issued ID and a recent profile photo. These details are required for courier onboarding accreditation and safety compliance."
- **Component File:** `src/pages/RiderApplication/components/IdentityVerificationStep.jsx`
- **Supporting Components:** `RiderDocumentUploadCard.jsx`, `CameraCaptureModal.jsx`
- **Purpose:** Collect valid government identification credentials, ID card photos (front and back), and an authenticated live face selfie.

#### Required Information and Input Fields

| Field Name | UI Label | Input Type | Required? | Default Value | Description | Validation / Rules |
|---|---|---|---|---|---|---|
| `idType` | Government-Issued ID Type | Dropdown Select (`<Select>`) | **Yes** | `"Philippine National ID (PhilID)"` | Classification of official government ID presented. | Options: `Philippine National ID (PhilID)`, `Driver's License`, `Philippine Passport`, `Unified Multi-Purpose ID (UMID)`, `SSS ID (Social Security System)`, `Postal ID (Digitized)`, `PRC ID (Professional Regulation)`, `Voter's ID / Comelec Certificate`, `Other Valid Government ID`. Selecting PhilID automatically sets `isPermanent: true`. |
| `idNumber` | Government ID Number | Text Input (`<Input>`) | **Yes** | `""` | Unique serial/card number of the ID. | Cannot be empty or whitespace only. Error: *"Government ID number is required."* |
| `expiryDate` | ID Expiration Date | Date Input (`<Input type="date">`) | Conditional | `""` | Expiration date of the ID card. | **Required unless `isPermanent === true`**. Disabled when marked permanent. Error: *"ID expiration date is required (or mark as permanent)."* |
| `isPermanent` | Permanent ID Toggle | Checkbox (`<input type="checkbox">`) | Optional | `false` (auto-true for PhilID) | Declares that the ID has no expiration date (e.g., PhilID / National ID). | If checked, clears and disables `expiryDate`. |
| `frontPhoto` | Government-Issued ID (Front) | Document Card / Camera Capture | **Yes** | `null` | Glare-free color photo of the front of the ID card. | Cannot be empty. Error: *"Front image of your government ID is required."* Supports live rear camera or file upload. |
| `backPhoto` | Government-Issued ID (Back) | Document Card / Camera Capture | Conditional | `null` | Color photo of the reverse side showing barcodes and signature. | **Required for all ID types EXCEPT Philippine Passport** (where photo page is sufficient). |
| `selfiePhoto` | Rider Profile Photo / Face Selfie | Document Card / Camera Capture | **Yes** | `null` | Well-lit headshot against a plain background without sunglasses or face masks. | Cannot be empty. Error: *"A clear verification selfie photo is required."* **Prefers front-facing (user) camera.** |

---

### Step 4: Delivery Method Selection

- **Step Number:** 4
- **Exact Step Title Displayed in UI:** Select Your Delivery Method
- **Header Subtitle:** "Choose the transport mode you will use for fulfilling food orders. Subsequent vehicle information and document requirements will automatically adapt to your selection."
- **Component File:** `src/pages/RiderApplication/components/DeliveryMethodStep.jsx`
- **Supporting Components:** `VehicleTypeIcons.jsx`
- **Constants:** `DELIVERY_METHODS` in `riderApplicationDefaults.js`
- **Purpose:** Capture the courier's primary fulfillment mode, which dynamically controls vehicle details (Step 5) and required vehicle documents (Step 6).

#### Delivery Transport Modes Available

| Method Key | Display Label | Max Dispatch Radius | Equipment & Licensing Summary | Icon Component | Impact on Steps 5 & 6 |
|---|---|---|---|---|---|
| `motorcycle` | Motorcycle | 8–12 km | Driver's license and LTO OR/CR required | `<MotorcycleIcon />` | Requires LTO plate, brand/model, driver's license, and LTO OR/CR documents. |
| `bicycle` | Bicycle | 3–5 km | Helmet and a roadworthy bicycle are required | `<BicycleIcon />` | Requires bike type, color, and photo with safety helmet. Exempt from LTO documents. |
| `e_bike` | E-bike | 5–8 km | Helmet, safety gear, and battery specs required | `<ElectricBicycleIcon />` | Requires e-bike brand, wattage, and photo with safety helmet. Under 350W exempt from LTO. |
| `e_scooter` | E-scooter | 3–5 km | Protective helmet and speed-compliant scooter required | `<ElectricScooterIcon />` | Requires scooter brand, max speed rating, and photo with helmet. Exempt from LTO. |
| `walking` | Walking | 1–2 km | Thermal delivery backpack required; no vehicle needed | `<WalkingIcon />` | **Exempt from all vehicle fields and vehicle document uploads.** |

#### Mode-Switch Safety Modal
If the applicant has already entered vehicle details for a vehicle mode and attempts to select a different transport mode, a confirmation modal dialog (`Modal`) warns that vehicle-specific details and documents will be reset, preventing accidental data loss:
- *Keep Current* — aborts switch.
- *Switch Mode & Reset* — confirms change and resets vehicle data.

---

### Step 5: Vehicle Details

- **Step Number:** 5
- **Exact Step Title Displayed in UI:**
  - Motorcycle: *Motorcycle Vehicle Details*
  - Bicycle: *Bicycle Details*
  - E-bike: *E-bike / Electric Bicycle Details*
  - E-scooter: *E-scooter Details*
  - Walking: *Walking Delivery Configuration*
- **Header Subtitle:** "Provide technical and registration information for your selected delivery equipment."
- **Component File:** `src/pages/RiderApplication/components/VehicleInformationStep.jsx`
- **Purpose:** Collect mechanical, registration, and ownership credentials tailored to the selected delivery method.

#### Conditional Field Matrix by Delivery Method

#### A. Motorcycle Mode (`deliveryMethod === 'motorcycle'`)
| Field Name | UI Label | Input Type | Required? | Default Value | Description / Validation Rules |
|---|---|---|---|---|---|
| `motoBrand` | Motorcycle Brand / Make | Text Input (`<Input>`) | **Yes** | `""` | Motorcycle manufacturer (e.g., Honda, Yamaha, Suzuki, Kawasaki). Error: *"Motorcycle brand/make is required."* |
| `motoModel` | Model & Displacement | Text Input (`<Input>`) | **Yes** | `""` | Model name and engine displacement (e.g., Click 125i, NMAX 155, Wave 110). Error: *"Motorcycle model is required."* |
| `motoYear` | Model Year | Number Input (`<Input type="number">`) | **Yes** | `"2023"` | Manufacturing model year. |
| `motoColor` | Vehicle Body Color | Text Input (`<Input>`) | **Yes** | `""` | Body color matching registration. |
| `plateNumber` | License Plate Number | Text Input (`<Input>`) | **Yes** | `""` | Official LTO license plate or MV File number. Auto-capitalized (`.toUpperCase()`). Error: *"License plate or MV file number is required."* |
| `mvFileNumber` | LTO MV File Number (Optional) | Text Input (`<Input>`) | Optional | `""` | 15-digit LTO vehicle file number from Certificate of Registration. |
| `ownership` | Vehicle Ownership Structure | Dropdown Select (`<Select>`) | **Yes** | `"Personally Owned"` | Options: `Personally Owned`, `Family-Owned (Parent / Spouse / Sibling)`, `Borrowed`, `Rented / Leased`, `Company-Owned`. **Key Conditional Trigger:** Non-personally owned vehicles trigger owner fields and authorization letter requirement. |
| `ownerName` | Registered Owner Full Name | Text Input (`<Input>`) | Conditional | `""` | **Required if ownership is not "Personally Owned"**. Error: *"Registered owner name is required for borrowed/rented vehicles."* |
| `ownerRelationship` | Relationship to Owner | Text Input (`<Input>`) | Conditional | `""` | **Required if ownership is not "Personally Owned"** (e.g., Father, Spouse, Employer). |

#### B. Bicycle Mode (`deliveryMethod === 'bicycle'`)
| Field Name | UI Label | Input Type | Required? | Default Value | Description / Validation Rules |
|---|---|---|---|---|---|
| `bikeType` | Bicycle Type | Dropdown Select (`<Select>`) | **Yes** | `"Road Bike"` | Options: `Road Bike`, `Mountain Bike (MTB)`, `City / Commuter Bike`, `Folding Bike`, `Gravel Bike`, `Cargo Bike`, `Other`. |
| `bikeColor` | Bicycle Color | Text Input (`<Input>`) | **Yes** | `""` | Frame color (e.g., Black / Metallic Blue). |
| `bikeBrand` | Bicycle Brand (Optional) | Text Input (`<Input>`) | Optional | `""` | Bike manufacturer (e.g., Giant, Trek, Trinx, Foxter). |
| `bikeModel` | Model (Optional) | Text Input (`<Input>`) | Optional | `""` | Frame model name. |

#### C. E-bike Mode (`deliveryMethod === 'e_bike'`)
| Field Name | UI Label | Input Type | Required? | Default Value | Description / Validation Rules |
|---|---|---|---|---|---|
| `ebikeBrand` | E-bike Brand / Make | Text Input (`<Input>`) | **Yes** | `""` | E-bike manufacturer (e.g., Fiido, Himo, Nakto, DYU). Error: *"E-bike brand is required."* |
| `ebikeModel` | Model & Battery Rating | Text Input (`<Input>`) | **Yes** | `""` | Model and battery rating (e.g., D4s 250W 36V, C20). |
| `ebikeColor` | Color | Text Input (`<Input>`) | **Yes** | `""` | Body color. |
| `ebikeWattage` | Motor Wattage / Classification | Text Input (`<Input>`) | Optional | `""` | Motor output (e.g., 250W Pedal Assist L1a). Helper notes that under 350W does not require LTO registration. |

#### D. E-scooter Mode (`deliveryMethod === 'e_scooter'`)
| Field Name | UI Label | Input Type | Required? | Default Value | Description / Validation Rules |
|---|---|---|---|---|---|
| `escooterBrand` | E-scooter Brand | Text Input (`<Input>`) | **Yes** | `""` | Scooter brand (e.g., Xiaomi, Segway Ninebot, Kaabo). Error: *"E-scooter brand is required."* |
| `escooterModel` | Model & Max Speed | Text Input (`<Input>`) | **Yes** | `""` | Model and speed governor (e.g., Pro 2, Max 25 km/h). |
| `escooterColor` | Scooter Color | Text Input (`<Input>`) | **Yes** | `""` | Frame color. |

#### E. Walking Courier Mode (`deliveryMethod === 'walking'`)
- Displays an informative overview card explaining pedestrian hub service (1–2 km radius), thermal bag issuance, and notes that **no vehicle details are required**.

---

### Step 6: Vehicle Documents & Licensing

- **Step Number:** 6
- **Exact Step Title Displayed in UI:**
  - Motorcycle: *Driver’s License & LTO Vehicle Documents*
  - Bicycle / E-Vehicle: *[Bicycle / E-Vehicle] Equipment Photos & Proofs*
  - Walking: *Vehicle Documents & Licensing*
- **Header Subtitle:** "Upload clear color photos of the required official documents for your [delivery method]."
- **Component File:** `src/pages/RiderApplication/components/VehicleDocumentsStep.jsx`
- **Supporting Components:** `RiderDocumentUploadCard.jsx`, `CameraCaptureModal.jsx`
- **Constants & Matrix:** `getVehicleDocuments` in `riderDocumentMatrix.js`
- **Purpose:** Enforce dynamic, conditional upload of vehicle registration, driver licensing, and road equipment photos according to transport mode and vehicle ownership.

#### Dynamic Vehicle Document Matrix (`getVehicleDocuments`)

| Transport Mode | Document Code | Document Title | Condition | Required? | Accepted Formats | Camera Supported? |
|---|---|---|---|---|---|---|
| **Motorcycle** | `driver_license` | Driver's License (Front & Back) | Motorcycle selected | **Required** | JPG, PNG, PDF | Yes (Rear Camera) |
| **Motorcycle** | `lto_or` | LTO Official Receipt (OR) | Motorcycle selected | **Required** | JPG, PNG, PDF | Yes (Rear Camera) |
| **Motorcycle** | `lto_cr` | LTO Certificate of Registration (CR) | Motorcycle selected | **Required** | JPG, PNG, PDF | Yes (Rear Camera) |
| **Motorcycle** | `motorcycle_photo` | Motorcycle Photo with Visible License Plate | Motorcycle selected | **Required** | JPG, PNG | Yes (Rear Camera) |
| **Motorcycle** | `vehicle_authorization` | Vehicle Owner Authorization Letter & Owner Valid ID | Ownership is NOT "Personally Owned" | **Required** (Conditional) | JPG, PNG, PDF | Yes (Rear Camera) |
| **Motorcycle** | `motor_insurance` | Third-Party Liability (TPL) or Comprehensive Insurance Policy | Motorcycle selected | *Optional* | JPG, PNG, PDF | Yes (Rear Camera) |
| **Bicycle** | `bicycle_photo` | Bicycle & Safety Helmet Photo | Bicycle selected | **Required** | JPG, PNG | Yes (Rear Camera) |
| **Bicycle** | `bicycle_proof` | Proof of Bicycle Purchase or Ownership Receipt | Bicycle selected | *Optional* | JPG, PNG, PDF | Yes (Rear Camera) |
| **E-bike** | `ebike_photo` | E-bike & Safety Helmet Photo | E-bike selected | **Required** | JPG, PNG | Yes (Rear Camera) |
| **E-bike** | `ebike_proof` | E-bike Purchase Invoice or Specifications | E-bike selected | *Optional* | JPG, PNG, PDF | Yes (Rear Camera) |
| **E-scooter** | `escooter_photo` | E-scooter & Safety Helmet Photo | E-scooter selected | **Required** | JPG, PNG | Yes (Rear Camera) |
| **E-scooter** | `escooter_proof` | E-scooter Sales Invoice or Specifications | E-scooter selected | *Optional* | JPG, PNG, PDF | Yes (Rear Camera) |
| **Walking** | *None* | *Exempt* | Walking selected | **Exempt** (0 docs) | N/A | N/A |

#### Walking Courier Exemption View
When `deliveryMethod === 'walking'`, Step 6 displays a green informational card:  
*"No Driver's License or Vehicle Registration Needed — Because you are applying as a pedestrian walker courier, you do not need to provide a driver's license, LTO OR/CR, or motor vehicle insurance. You may proceed directly to the background clearances step."*

---

### Step 7: Background Clearances & Safety Verification

- **Step Number:** 7
- **Exact Step Title Displayed in UI:** Background Clearances & Safety Verification
- **Header Subtitle:** "Upload an official NBI Clearance or National Police Clearance to ensure platform security, customer trust, and cash handling integrity."
- **Component File:** `src/pages/RiderApplication/components/ClearanceDocumentsStep.jsx`
- **Supporting Components:** `RiderDocumentUploadCard.jsx`
- **Constants:** `getClearanceDocuments` in `riderDocumentMatrix.js`
- **Purpose:** Enforce background integrity checks to qualify couriers for handling cash-on-delivery (COD) collections and customer deliveries.

#### Clearance Document Rules

| Document Code | Document Title | Category | Policy & Validation Rules | Required? | Accepted Formats |
|---|---|---|---|---|---|
| `nbi_clearance` | NBI Clearance (Valid / Unexpired) | Background Clearances | Issued within the last 12 months. **Satisfies primary clearance.** | Conditional (Either NBI or Police required) | JPG, PNG, PDF |
| `police_clearance` | National Police Clearance (NPC) | Background Clearances | Issued within the last 12 months. **Satisfies primary clearance.** | Conditional (Either NBI or Police required) | JPG, PNG, PDF |
| `barangay_clearance` | Barangay Clearance for Employment | Background Clearances | From residential barangay. | *Optional* | JPG, PNG, PDF |
| `medical_clearance` | Medical Certificate / Fit to Work | Health & Safety | Fit to work certification for food handling. | *Optional* | JPG, PNG, PDF |

#### Primary Clearance Validation Logic
The step requires that **at least one** primary clearance is uploaded:
$$\text{hasPrimaryClearance} = \text{Boolean}(\text{documents}[\text{nbi\_clearance}]) \lor \text{Boolean}(\text{documents}[\text{police\_clearance}])$$
- If neither NBI nor Police clearance is attached, advancing is blocked with error: *"Either an NBI Clearance or a Police Clearance is required."*
- If either document is uploaded, the other is marked optional and the summary badge displays: `✓ Clearance Uploaded`.

---

### Step 8: Emergency Contact & Delivery Preferences

- **Step Number:** 8
- **Exact Step Title Displayed in UI:** Emergency Contact & Delivery Preferences
- **Header Subtitle:** "Provide trusted emergency contact details for on-road welfare support and configure your preferred delivery coverage zones and schedule."
- **Component File:** `src/pages/RiderApplication/components/EmergencyContactStep.jsx`
- **Styles:** `EmergencyContactStep.css`
- **Constants:** `EMERGENCY_RELATIONSHIPS`, `RIDER_SHIFTS`, `RIDER_DAYS_OF_WEEK` in `riderApplicationDefaults.js`
- **Purpose:** Capture emergency next-of-kin contacts for accident and welfare response, along with preferred operating shifts, base dispatch city, and weekly day availability.

#### Required Information and Input Fields

| Field Name | UI Label | Input Type | Required? | Default Value | Description | Validation / Rules |
|---|---|---|---|---|---|---|
| `contactName` | Emergency Contact Full Name | Text Input (`<Input>`) | **Yes** | `""` | Primary emergency contact person. | Cannot be empty or whitespace only. Error: *"Emergency contact person is required."* |
| `relationship` | Relationship to Applicant | Dropdown Select (`<Select>`) | **Yes** | `"Parent"` | Relationship to courier. | Options: `Parent`, `Spouse / Partner`, `Sibling`, `Child`, `Relative`, `Friend`, `Colleague`, `Other`. |
| `phone` | Emergency Mobile Number | Telephone Input (`<Input type="tel">`) | **Yes** | `""` | Direct contact telephone number. | Cannot be empty or whitespace only. Error: *"Emergency contact phone number is required."* |
| `altPhone` | Alternative Contact Number (Optional) | Telephone Input (`<Input type="tel">`) | Optional | `""` | Secondary phone or landline. | Optional. |
| `preferredCity` | Preferred Base City / Municipality | Text Input (`<Input>`) | **Yes** | `"Quezon City"` | Primary city where shifts begin. | Cannot be empty. Error: *"Please select your primary delivery city/zone."* |
| `preferredBarangayHubs` | Preferred Commercial Hubs / Dining Areas | Text Input (`<Input>`) | Optional | `"Tomas Morato, Timog Ave, Scout Area"` | Specific food strips or malls preferred for dispatch. | Optional. |
| `preferredShifts` | Preferred Operating Shifts | Multi-select Toggle Chips | Optional | `['lunch', 'dinner']` | Delivery operating shifts. | Available options: `Breakfast Shift (6:00 AM – 11:00 AM)`, `Lunch Rush (11:00 AM – 2:00 PM)`, `Afternoon Merienda (2:00 PM – 6:00 PM)`, `Dinner Gathering (6:00 PM – 10:00 PM)`, `Late Night Delivery (10:00 PM – 2:00 AM)`, `Flexible / On-Demand Dispatch`. |
| `availableDays` | Weekly Day Availability | Day Button Toggles | Optional | `['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']` | Days available per week. | Clickable buttons: `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun`. |

---

### Step 9: Rider Earnings & Payout Information

- **Step Number:** 9
- **Exact Step Title Displayed in UI:** Rider Earnings & Payout Information
- **Header Subtitle:** "Configure your authorized bank account or e-wallet for weekly delivery fee payouts, fuel incentives, and tips."
- **Component File:** `src/pages/RiderApplication/components/PayoutInformationStep.jsx`
- **Styles:** `PayoutInformationStep.css`
- **Constants:** `RIDER_PAYOUT_PROVIDERS`, `RIDER_PAYOUT_ACCOUNT_TYPES` in `riderApplicationDefaults.js`
- **Purpose:** Collect depository e-wallet or bank account credentials for weekly delivery fare disbursements, tips, and distance incentive payments.

#### Required Information and Input Fields

| Field Name | UI Label | Input Type | Required? | Default Value | Description | Validation / Rules |
|---|---|---|---|---|---|---|
| `accountHolder` | Account Holder Full Name | Text Input (`<Input>`) | **Yes** | `""` | Full name registered on e-wallet or bank account. | Cannot be empty. Helper: *"Must match your verified government identification."* Error: *"Account holder name is required."* |
| `provider` | Payout Provider / Bank | Dropdown Select (`<Select>`) | **Yes** | `"GCash"` | E-wallet provider or Philippine bank. | Options: `GCash`, `Maya`, `Bank of the Philippine Islands (BPI)`, `BDO Unibank`, `UnionBank of the Philippines`, `Metrobank`, `Land Bank of the Philippines`, `Security Bank`, `Philippine National Bank (PNB)`, `Rizal Commercial Banking Corporation (RCBC)`, `Other Supported Bank`. |
| `accountNumber` | Account Number / Mobile Number | Text Input (with Toggle Mask) | **Yes** | `""` | 10 to 16 digit mobile number or bank account number. | Filtered to digits (`.replace(/\D/g, '').slice(0, 18)`). Minimum 8 digits required. Error if empty: *"Account or mobile number is required."* Error if $< 8$ digits: *"Account number must be at least 8 digits."* |
| `accountType` | Account Classification | Dropdown Select (`<Select>`) | **Yes** | `"E-Wallet (GCash / Maya)"` | Account type. | Options: `E-Wallet (GCash / Maya)`, `Savings Account`, `Current / Checking Account`. |
| `proofDocument` | Proof of Account Ownership | Document Upload Card | Optional | `null` | Screenshot of verified e-wallet profile or bank document header. | Optional during application. Supports JPG/PNG/PDF up to 10 MB. |

#### Security & Masking Features
- **Masking Toggle:** Account number input defaults to `type="password"`. A toggle button switches between hidden and visible text (`"Show"` / `"Hide"`).
- **Draft Masking:** Account numbers are masked (`••••1234`) prior to session serialization.

---

### Step 10: Rider Agreement & Application Review

- **Step Number:** 10
- **Exact Step Title Displayed in UI:** Rider Agreement & Application Review
- **Header Subtitle:** "Carefully review your application information, acknowledge the SALO Rider Partner Agreement, and submit for onboarding review."
- **Component File:** `src/pages/RiderApplication/components/RiderAgreementStep.jsx`
- **Purpose:** Display an exhaustive review of all 9 prior steps, provide one-click jump links to any section, display the SALO Delivery Partner Code of Conduct, capture 4 mandatory legal declarations, and execute final submission.

#### 10.1 Summary Cards Rendered
1. **Company & Verified Email (Step 1):** Company/fleet name, verified email, OTP verification badge (`✓ Verified Authenticated`), verification timestamp. (Edit button $\rightarrow$ Step 1).
2. **Personal Credentials (Step 2):** Full legal name, date of birth, contact phone, gender, complete residential address. (Edit button $\rightarrow$ Step 2).
3. **Identity Verification (Step 3):** Government ID type, ID number, expiration date/permanence, attached photo indicators. (Edit button $\rightarrow$ Step 3).
4. **Delivery Method (Step 4):** Transport mode badge (`motorcycle`, `bicycle`, `e_bike`, `e_scooter`, `walking`). (Edit button $\rightarrow$ Step 4).
5. **Vehicle Specifications (Step 5):** Technical specifications according to selected mode (make, model, year, plate number, ownership, or pedestrian hub notice). (Edit button $\rightarrow$ Step 5).
6. **Vehicle Documents & Licensing (Step 6):** Count of attached vehicle files or "Exempt (No vehicle required)". (Edit button $\rightarrow$ Step 6).
7. **Background Clearances (Step 7):** Count of attached clearance files (`NBI`, `Police`, `Barangay`, `Medical`). (Edit button $\rightarrow$ Step 7).
8. **Coverage & Shift Preferences (Step 8):** Emergency contact name/relationship/phone, base dispatch city, shift count, weekly days available. (Edit button $\rightarrow$ Step 8).
9. **Earnings & Payout Setup (Step 9):** Account holder, provider, masked account number (`•••• •••• 1234`), classification. (Edit button $\rightarrow$ Step 9).

#### 10.2 SALO Delivery Partner Code of Conduct
A scrollable terms container outlines 4 foundational policies:
1. *Road Safety & Protective Equipment:* Helmet compliance and adherence to Philippine traffic laws.
2. *Thermal Bag & Food Integrity:* Mandatory insulated thermal bag usage and intact container seals.
3. *Cash on Delivery (COD) Compliance:* Accurate accounting and electronic remittance within scheduled windows.
4. *Professional Etiquette & Customer Privacy:* Customer data confidentiality and respectful conduct.

#### 10.3 Mandatory Legal Declarations
The applicant must agree to all 4 declarations:
- **Master "Agree to all declarations" Checkbox:** Toggles all 4 checkboxes simultaneously; displays indeterminate state when partially checked.
1. `infoConfirmed` (`<input type="checkbox">`):  
   *"I confirm that the personal, company, and vehicle information I provided is accurate and true."*
2. `documentsGenuine` (`<input type="checkbox">`):  
   *"I confirm that the uploaded licenses, IDs, and clearances are genuine and legally valid."*
3. `safetyPolicyAgreed` (`<input type="checkbox">`):  
   *"I agree to adhere to SALO’s Rider Safety Policies, Food Handling Guidelines, and COD remittance rules."*
4. `termsAgreed` (`<input type="checkbox">`):  
   *"I agree to the applicable SALO Rider Partner Terms and Platform Privacy Notice."*

#### 10.4 Submission Gate & Validation
The "Submit Rider Application" button is disabled unless:
1. `allRequiredValid === true` (evaluates Step 1 OTP, personal name, ID number, transport method, emergency contact, payout holder).
2. `isAllDeclared === true` (all 4 declaration checkboxes checked).
3. `emailVerification.isVerified === true` (Step 1 OTP completed).

If conditions are unmet, a warning banner alerts the user:
- *"Please complete Step 1 (Company & Email OTP Verification) before submitting."* OR
- *"Please check all four declaration boxes above to enable application submission."* OR
- *"Please complete all required fields and documents."*

---

## 3. Final Submission & Post-Submission Lifecycle

### 3.1 Submission Execution (`handleSubmitApplication`)
When "Submit Rider Application" is clicked:
1. Button enters loading state (`submitting = true`, "Submitting...").
2. A 1200 ms timeout simulates backend transmission.
3. An official reference number is generated via formula:
   $$\text{SALO-RIDER-} + \text{YYYYMMDD} + \text{"-"} + \text{Random}(1000..9999)$$
   *(e.g., `SALO-RIDER-20261113-7814`)*
4. A rider submission record object is constructed:
   ```javascript
   {
     id: `rider-${Date.now()}`,
     referenceNumber: generatedRef,
     name: fullName,
     username: (firstName || 'rider').toLowerCase() + randomSuffix,
     email: verifiedEmail,
     companyName: formData.emailVerification.companyName || '',
     phone: formData.personal.phone,
     status: 'Pending Verification',
     applicationStatus: 'Pending Review',
     verificationStatus: 'Pending',
     vehicle: `${deliveryMethod.toUpperCase()} · ${brand || 'Standard'}`,
     licenseNumber: formData.identity.idNumber || 'N/A',
     zone: formData.emergency.preferredCity || 'Quezon City',
     rating: 5.0,
     completedDeliveries: 0,
     earningsTotal: 0,
     submittedAt: submissionIso,
     deliveryMethod: formData.deliveryMethod,
     emailVerification: formData.emailVerification,
     personal: { ...formData.personal, email: verifiedEmail },
     payout: { ...formData.payout }
   }
   ```
5. **Cross-Module Admin Synchronization:** The new rider record is unshifted into `salo_admin_riders` (`adminService.getRiders()`), immediately appearing in `AdminRidersPage` for fleet administrator verification.
6. **Customer Tracking Synchronization:** The record is saved into `localStorage` under `salo_rider_applications`.
7. **Draft Clearance:** `clearRiderDraft()` purges the temporary draft from `localStorage` (`salo_rider_app_draft_v1`), ensuring a fresh state for future sessions.
8. The page transitions to `ApplicationSuccess.jsx`.

### 3.2 Success Receipt Screen (`ApplicationSuccess.jsx`)
- **Visual Receipt:** Displays reference code with "Copy" button, submission timestamp, transport mode, initial review status (`Pending Review`), and contact notification email.
- **Roadmap Guidance:**
  1. *License & Background Clearance Check (24–48 Hours):* Safety team checks ID, driver's license, and clearances.
  2. *Safety Orientation & Digital Walkthrough:* Mobile walkthrough covering order acceptance and COD handling.
  3. *Gear Pickup & Dispatch Activation:* Thermal bag pickup at nearest SALO Logistics Hub.
- **Actions:**
  - *"Track Rider Application Status"* $\rightarrow$ navigates to `/rider-application/status`.
  - *"Return to Customer Dashboard"* $\rightarrow$ navigates to `/customer`.

### 3.3 Status Tracking Lifecycle (`RiderApplicationStatusPage.jsx` & `RiderApplicationStatus.jsx`)
The status tracking interface implements 8 status states (`RIDER_STATUS_CONFIG`):

| Status Code | Badge Variant | Progress % | Operational Description |
|---|---|---|---|
| `Draft` | `neutral` | 10% | Application started but not yet submitted. |
| `Pending Submission` | `warning` | 25% | All steps completed. Ready for final review and submission. |
| `Pending Review` | `warning` | 40% | Application submitted and queued for intake verification. |
| `Under Review` | `info` | 65% | SALO Fleet Operations is reviewing identity, license, and background clearances. |
| `Needs Correction` | `danger` | 50% | Action required: Administrator requested updated documents or details. |
| `Resubmitted` | `info` | 75% | Updated application submitted and under expedited review. |
| `Approved` | `success` | 100% | Application approved! Complete onboarding orientation to activate your rider account. |
| `Rejected` | `danger` | 100% | Application not approved at this time. Review feedback and appeal guidance. |

#### Status-Specific Interactive Views:
- **Rider Status Simulator:** Clickable bar with 8 mock status pills allowing instant evaluation of every lifecycle stage.
- **Needs Correction View:** Displays reviewer name (*Officer R. Dalisay*), flagged section (*Driver & Vehicle Documents*), flagged document (*Driver's License (Front & Back)*), review notes, and an "Edit & Resubmit Documents" button deep-linking directly to `/become-a-rider?step=6`.
- **Approved View:** Displays congratulations banner, clear notice distinguishing application approval from live dispatch activation, and an interactive 5-item onboarding checklist:
  - [x] Review the SALO Rider Safety Handbook & Food Handling Guidelines
  - [x] Watch the 10-minute online defensive driving & rider welfare orientation
  - [ ] Schedule thermal delivery bag & uniform kit pickup at SALO Logistics Hub
  - [ ] Walk through the live order acceptance, navigation, and COD flow in the Rider app
  - [ ] Select your first delivery zone and submit your active weekly shift preferences
  - Primary button: *"Proceed to Rider Account Activation →"* (`/rider/activate`).
- **Rejected View:** Displays rejection reason (*Road safety / emissions standards or incomplete clearance*), appeal notes, and a "Contact Fleet Appeals" button.
- **4-Stage Progress Timeline:** Visual stepper showing:
  1. *Application Submitted*
  2. *Clearance & License Verification*
  3. *Safety Orientation & Equipment*
  4. *Fleet Dispatch Activation*

---

## 4. Complete Related File Inventory

The following inventory details every file in the codebase directly or indirectly involved in the Rider Partner Application and Status Tracking flows.

### 1. Main Pages
| Filename | Relative Path | Purpose | Relationship to Requirements Flow |
|---|---|---|---|
| `RiderApplicationPage.jsx` | `src/pages/RiderApplication/RiderApplicationPage.jsx` | Master wizard container managing 10 application steps, step validation, persistent draft management, and submission. | Primary entry point and state orchestrator for the rider application flow. |
| `RiderApplicationStatusPage.jsx` | `src/pages/RiderApplication/RiderApplicationStatusPage.jsx` | Standalone status tracking page showing live/mock rider application status, timeline, and actions. | Primary post-submission destination for tracking courier application review. |
| `PartnerApplicationPage.jsx` | `src/features/customer/pages/PartnerApplicationPage.jsx` | Customer portal landing card for becoming a partner (Restaurant or Rider). | Gateway providing link to `/become-a-rider` and tracking live rider status. |

### 2. Step Components
| Filename | Relative Path | Purpose | Relationship to Requirements Flow |
|---|---|---|---|
| `EmailVerificationStep.jsx` | `src/pages/RiderApplication/components/EmailVerificationStep.jsx` | Step 1 component for company name, email OTP input, 60s cooldown timer, and mock codes. | Implements Step 1 mandatory email verification gate. |
| `PersonalInformationStep.jsx` | `src/pages/RiderApplication/components/PersonalInformationStep.jsx` | Step 2 component for legal name, DOB, age calculation ($\ge 18$), contact number, and residential address. | Implements Step 2 UI and age validation. |
| `IdentityVerificationStep.jsx` | `src/pages/RiderApplication/components/IdentityVerificationStep.jsx` | Step 3 component for government ID selection, ID number, expiry/permanence, front/back photos, and selfie. | Implements Step 3 UI and identity document capture. |
| `DeliveryMethodStep.jsx` | `src/pages/RiderApplication/components/DeliveryMethodStep.jsx` | Step 4 component for transport mode selection (Motorcycle, Bicycle, E-bike, E-scooter, Walking). | Implements Step 4 UI and transport mode selection. |
| `VehicleInformationStep.jsx` | `src/pages/RiderApplication/components/VehicleInformationStep.jsx` | Step 5 component rendering mode-specific technical specifications (plate, brand, model, ownership). | Implements Step 5 UI and conditional vehicle fields. |
| `VehicleDocumentsStep.jsx` | `src/pages/RiderApplication/components/VehicleDocumentsStep.jsx` | Step 6 component for driver's license, LTO OR/CR, vehicle photo, and owner authorization. | Implements Step 6 UI and vehicle document uploads. |
| `ClearanceDocumentsStep.jsx` | `src/pages/RiderApplication/components/ClearanceDocumentsStep.jsx` | Step 7 component for NBI Clearance, Police Clearance, Barangay Clearance, and Medical Certificate. | Implements Step 7 UI and background clearances. |
| `EmergencyContactStep.jsx` | `src/pages/RiderApplication/components/EmergencyContactStep.jsx` | Step 8 component for next-of-kin emergency contact, dispatch city, shift selections, and day availability. | Implements Step 8 UI and coverage preferences. |
| `PayoutInformationStep.jsx` | `src/pages/RiderApplication/components/PayoutInformationStep.jsx` | Step 9 component for e-wallet (GCash/Maya) or bank details, masked account number, and proof upload. | Implements Step 9 UI and earnings payout setup. |
| `RiderAgreementStep.jsx` | `src/pages/RiderApplication/components/RiderAgreementStep.jsx` | Step 10 component displaying full application summary, code of conduct, 4 legal declarations, and submit trigger. | Implements Step 10 UI, review summary, and submission. |

### 3. Shared Components
| Filename | Relative Path | Purpose | Relationship to Requirements Flow |
|---|---|---|---|
| `RiderApplicationHeader.jsx` | `src/pages/RiderApplication/components/RiderApplicationHeader.jsx` | Wizard header showing brand mark, step counter, Save Draft button with timestamp, and Exit button. | Top navigation bar on all wizard steps. |
| `RiderApplicationProgress.jsx` | `src/pages/RiderApplication/components/RiderApplicationProgress.jsx` | Desktop stepper and mobile progress bar displaying step progress and jump links. | Progress indicator on all wizard steps. |
| `RiderDocumentUploadCard.jsx` | `src/pages/RiderApplication/components/RiderDocumentUploadCard.jsx` | Enhanced document card supporting file drag-and-drop, camera trigger, preview, retake, and replace actions. | Used across Steps 3, 6, 7, and 9 for document and photo captures. |
| `CameraCaptureModal.jsx` | `src/pages/RiderApplication/components/CameraCaptureModal.jsx` | Live in-app camera modal using `getUserMedia`, supporting front/rear camera toggle, canvas capture, and file fallback. | Used for taking live photos of IDs, selfie, vehicle, and documents. |
| `ExitConfirmModal.jsx` | `src/pages/RiderApplication/components/ExitConfirmModal.jsx` | Accessible 3-option modal prompting user to save draft, exit without saving, or cancel. | Triggered when exiting with unsaved changes. |
| `VehicleTypeIcons.jsx` | `src/pages/RiderApplication/components/VehicleTypeIcons.jsx` | Vector SVG icons for motorcycle, bicycle, electric bicycle, electric scooter, and walking courier. | Rendered in `DeliveryMethodStep.jsx`. |
| `ApplicationSuccess.jsx` | `src/pages/RiderApplication/components/ApplicationSuccess.jsx` | Post-submission receipt screen displaying reference number, timeline, roadmap, and next steps. | Rendered upon successful submission. |
| `RiderApplicationStatus.jsx` | `src/pages/RiderApplication/components/RiderApplicationStatus.jsx` | Detailed status lifecycle component with simulation pills, hero card, correction notes, checklist, and timeline. | Core status display used inside `RiderApplicationStatusPage`. |
| `Button.jsx` | `src/components/common/Button.jsx` | Platform design system button component. | Used for all buttons across wizard and status pages. |
| `Badge.jsx` | `src/components/common/Badge.jsx` | Platform design system badge component. | Used for status pills, document readiness, and verification tags. |
| `Modal.jsx` | `src/components/common/Modal.jsx` | Platform accessible modal dialog component. | Base container for `CameraCaptureModal`, `ExitConfirmModal`, and mode switch modal. |
| `BrandMark.jsx` | `src/components/common/BrandMark.jsx` | Official SALO brand logo with dark/light mode asset selection. | Rendered in application and status headers. |
| `Card.jsx` | `src/components/common/Card.jsx` | Common card container and body layout wrapper. | Used for status hero and timeline cards. |
| `ErrorBoundary.jsx` | `src/components/common/ErrorBoundary.jsx` | Top-level React error boundary. | Wraps application routes in `App.jsx`. |

### 4. Form Components
| Filename | Relative Path | Purpose | Relationship to Requirements Flow |
|---|---|---|---|
| `FormElements.jsx` | `src/components/forms/FormElements.jsx` | Design system form controls: `Input`, `Select`, `Textarea`, `FormGroup`, `Label`, `HelperText`, `ErrorMessage`. | Standard input controls used across all rider steps. |
| `index.js` | `src/components/forms/index.js` | Barrel export for form components. | Clean re-export of `FormElements.jsx`. |

### 5. Layout Components
| Filename | Relative Path | Purpose | Relationship to Requirements Flow |
|---|---|---|---|
| `RiderLayout.jsx` | `src/layouts/RiderLayout.jsx` | Main layout shell for the rider portal (`/rider/*`). | Layout wrapper for post-approval rider module. |
| `CustomerLayout.jsx` | `src/layouts/CustomerLayout.jsx` | Main shell layout for customer portal. | Wraps `PartnerApplicationPage.jsx` upstream gateway. |

### 6. Constants and Configuration
| Filename | Relative Path | Purpose | Relationship to Requirements Flow |
|---|---|---|---|
| `riderApplicationDefaults.js` | `src/pages/RiderApplication/constants/riderApplicationDefaults.js` | Master constants: `DELIVERY_METHODS`, `GOVERNMENT_ID_OPTIONS`, `MOTORCYCLE_OWNERSHIP_OPTIONS`, `BICYCLE_TYPES`, `EMERGENCY_RELATIONSHIPS`, `RIDER_PAYOUT_PROVIDERS`, `RIDER_SHIFTS`, `RIDER_DAYS_OF_WEEK`, `RIDER_APPLICATION_STEPS`, `INITIAL_RIDER_APPLICATION_STATE`, `RIDER_STATUS_CONFIG`, `MOCK_RIDER_ADMIN_FEEDBACK`. | Defines step definitions, initial form state, and dropdown catalogs. |
| `riderDocumentMatrix.js` | `src/pages/RiderApplication/constants/riderDocumentMatrix.js` | Dynamic document catalog (`RIDER_DOC_CATALOG`), vehicle document matrix (`getVehicleDocuments`), and clearance matrix (`getClearanceDocuments`). | Evaluates document requirements based on transport mode and vehicle ownership. |
| `cameraConfig.js` | `src/pages/RiderApplication/constants/cameraConfig.js` | Camera facing modes, compression parameters, photo requirement identification, and human-friendly error messages. | Configures camera behavior, compression quality, and camera permissions. |

### 7. Hooks and Context
| Filename | Relative Path | Purpose | Relationship to Requirements Flow |
|---|---|---|---|
| `useAuth.js` | `src/hooks/useAuth.js` | Custom hook exposing current authenticated user object. | Used in `RiderApplicationPage` to prefill applicant identity and contact. |
| `AuthContext.jsx` | `src/context/AuthContext.jsx` | Global authentication context providing user session data. | Supplies user state consumed by `useAuth`. |

### 8. Utilities and Helpers
| Filename | Relative Path | Purpose | Relationship to Requirements Flow |
|---|---|---|---|
| `compressImageToDataUrl` | `src/pages/RiderApplication/services/riderDraftStorage.js#L15-L90` | Compresses image File/Blob/DataURL to JPEG via HTML5 Canvas ($\le 1280\text{ px}$, 82% quality). | Compresses images to enable safe persistent draft storage without quota overflow. |
| `formatBytes` (in `RiderDocumentUploadCard.jsx`) | `src/pages/RiderApplication/components/RiderDocumentUploadCard.jsx#L12-L18` | Formats byte counts into human-readable strings (`KB`, `MB`). | Used for display of document and photo file sizes. |

### 9. Validation and Schemas
| Filename | Relative Path | Purpose | Relationship to Requirements Flow |
|---|---|---|---|
| `validateStep` (in `RiderApplicationPage.jsx`) | `src/pages/RiderApplication/RiderApplicationPage.jsx#L172-L353` | Step validation logic for Steps 1 through 10 before step progression. | Enforces OTP completion, legal age ($\ge 18$), required documents, and declarations. |
| `riderApplication.test.js` | `src/pages/RiderApplication/riderApplication.test.js` | Automated node:test suite verifying delivery methods, document matrices, step definitions, and storage persistence. | Test specification validating correctness of rider onboarding rules. |

### 10. Mock Data and Demo Data
| Filename | Relative Path | Purpose | Relationship to Requirements Flow |
|---|---|---|---|
| `MOCK_RIDER_ADMIN_FEEDBACK` | `src/pages/RiderApplication/constants/riderApplicationDefaults.js#L303-L330` | Mock administrator feedback samples for `Needs Correction`, `Rejected`, and `Approved` states. | Supplies reviewer notes, flagged documents, reasons, and activation checklist in status view. |

### 11. Services and API Integration
| Filename | Relative Path | Purpose | Relationship to Requirements Flow |
|---|---|---|---|
| `riderDraftStorage.js` | `src/pages/RiderApplication/services/riderDraftStorage.js` | Local storage management service with image serialization, quota detection, and draft lifecycle helpers. | Implements `saveRiderDraft()`, `loadRiderDraft()`, and `clearRiderDraft()`. |
| `adminService.js` | `src/services/adminService.js` | Client-side admin data service managing mock database of riders. | Receives newly submitted applications via `salo_admin_riders` for instant administrative review. |

### 12. Stylesheets
| Filename | Relative Path | Purpose | Relationship to Requirements Flow |
|---|---|---|---|
| `RiderApplicationPage.css` | `src/pages/RiderApplication/RiderApplicationPage.css` | Styling for main application page layout, step bodies, form grids, and action bars. | Core wizard layout and responsive design. |
| `RiderApplicationStatusPage.css` | `src/pages/RiderApplication/RiderApplicationStatusPage.css` | Styling for standalone status tracking page layout and header. | Status page shell styling. |
| `RiderApplicationHeader.css` | `src/pages/RiderApplication/components/RiderApplicationHeader.css` | Header styles for branding, step counter, save draft status, and exit button. | Header component visual styling. |
| `RiderApplicationProgress.css` | `src/pages/RiderApplication/components/RiderApplicationProgress.css` | Stepper styling for 10 step nodes, connecting track, and mobile progress bar. | Stepper visual presentation. |
| `RiderApplicationStatus.css` | `src/pages/RiderApplication/components/RiderApplicationStatus.css` | Styles for status simulation panel, hero cards, correction alert, checklist, and timeline. | Visual styling of status tracking components. |
| `RiderDocumentUploadCard.css` | `src/pages/RiderApplication/components/RiderDocumentUploadCard.css` | Styling for upload cards, camera trigger button, dropzones, and previews. | Visual styling of document and photo cards. |
| `CameraCaptureModal.css` | `src/pages/RiderApplication/components/CameraCaptureModal.css` | Styling for live camera viewfinder, camera switch toggle, shutter button, and guidelines. | Live camera dialog visual styling. |
| `EmergencyContactStep.css` | `src/pages/RiderApplication/components/EmergencyContactStep.css` | Styling for emergency contact sections, shift chips, and day buttons. | Shift selection and day availability styling. |
| `PayoutInformationStep.css` | `src/pages/RiderApplication/components/PayoutInformationStep.css` | Styling for rider earnings payout fields and proof upload. | Payout form styling. |
| `ExitConfirmModal.css` | `src/pages/RiderApplication/components/ExitConfirmModal.css` | Styling for the 3-option unsaved exit confirmation modal. | Exit modal styling. |
| `FormElements.css` | `src/components/forms/FormElements.css` | Baseline styling for inputs, selects, labels, and error messages. | Form elements baseline styling. |
| `Button.css` | `src/components/common/Button.css` | Button styling, sizes, loading spinners, and variants. | Styling for all buttons. |
| `Badge.css` | `src/components/common/Badge.css` | Badge variants (`success`, `warning`, `danger`, `info`, `neutral`). | Styling for status badges and tags. |
| `Modal.css` | `src/components/common/Modal.css` | Modal overlay backdrop, dialog container, and transitions. | Dialog container styling. |
| `BrandMark.css` | `src/components/common/BrandMark.css` | Brand logo layout and sizing. | Header logo styling. |
| `Card.css` | `src/components/common/Card.css` | Card container styling tokens. | Base container styles for status components. |

### 13. Assets and Icons
| Filename | Relative Path | Purpose | Relationship to Requirements Flow |
|---|---|---|---|
| `salo_logo_final.png` | `src/salo_logo_final.png` | Light mode official SALO platform brand logo. | Displayed in `BrandMark` on light backgrounds. |
| `salo_logo_dm_final.png` | `src/salo_logo_dm_final.png` | Dark mode official SALO platform brand logo. | Displayed in `BrandMark` on dark backgrounds. |

### 14. Routing and Navigation
| Filename | Relative Path | Purpose | Relationship to Requirements Flow |
|---|---|---|---|
| `App.jsx` | `src/App.jsx` | Master application route map and code-splitting definitions. | Declares routes `/become-a-rider`, `/rider-application`, `/rider-application/status`, and `/rider/activate`. |

### 15. Other Dependencies
| Filename | Relative Path | Purpose | Relationship to Requirements Flow |
|---|---|---|---|
| None found | N/A | No third-party camera plugins or storage libraries are used. | All functionality is implemented natively with HTML5 `getUserMedia`, Canvas API, and Web Storage. |

---

## 5. Technical Observations & Implementation Analysis

1. **Native Live Camera & Client-Side Compression:** The implementation of live camera capture (`CameraCaptureModal.jsx`) alongside HTML Canvas compression (`compressImageToDataUrl`) is a notable architectural highlight. It allows captured document and selfie images to be stored directly inside `localStorage` drafts without crashing the browser with `QuotaExceededError`.
2. **Pedestrian Walker Courier Support:** Unlike many traditional delivery platforms that mandate motor vehicle ownership, SALO includes native first-class support for Walking Couriers (`deliveryMethod: 'walking'`). The application intelligently exempts pedestrian couriers from driver's licenses, LTO OR/CR, and vehicle inspections, focusing on compact neighborhood hub fulfillment (1–2 km).
3. **Cross-Module Administrative Intake:** Submitting the application immediately writes to `salo_admin_riders` (`adminService.getRiders()`). Administrators in `/admin/riders` can immediately inspect the new courier applicant and verify their credentials.
4. **Approval vs. Activation Separation:** As emphasized in the approved status view and roadmap, application approval (`Approved` status) does not immediately activate live dispatch. The courier must complete an orientation checklist and visit `/rider/activate` before going online.
