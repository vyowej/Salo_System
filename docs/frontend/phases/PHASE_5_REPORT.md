# SALO — Phase 5: Delivery Rider Module Report

**Module:** Delivery Rider App & Dispatch Execution  
**Platform:** SALO — Order. Reserve. Gather.  
**Identity:** Modern Filipino Food Culture · English-Primary Interface with Leaf-Green Accent  
**Build Status:** Complete & Verified (`✓ 95 modules transformed`, 0 errors)

---

## 1. Overview of Phase 5 Implementation

Phase 5 delivers the end-to-end interface and operational workflows for delivery couriers on the SALO platform. Designed for fast mobile accessibility, clear legibility under bright outdoor light, and rapid turn-by-turn order progression.

### Key Architecture Components

```
src/
├── services/
│   └── riderService.js              # Persistence, dispatch pool, active delivery stepper, COD cash on hand
├── layouts/
│   ├── RiderLayout.jsx              # Dedicated rider shell (Muted Green accent), online status toggle
│   └── RiderLayout.css              # Responsive drawer navigation, theme-compatible
└── features/rider/pages/
    ├── RiderDashboard.jsx           # /rider — 4 KPI cards, active trip preview, available jobs preview
    ├── RiderActiveDeliveryPage.jsx  # /rider/active — Turn-by-turn stepper, restaurant & customer contacts
    ├── RiderJobsPage.jsx            # /rider/jobs — Available dispatch offers, accept/decline controls
    ├── RiderHistoryPage.jsx         # /rider/history — Searchable completed trip log and payouts
    ├── RiderEarningsPage.jsx        # /rider/earnings — Net income, tips, COD cash balance, GCash/Maya remittance
    └── RiderProfilePage.jsx         # /rider/profile — Rider credentials, vehicle/plate details, territory
```

---

## 2. Page & Feature Details

### 1. Delivery Rider Layout (`RiderLayout.jsx`)
- **Visual Accent:** Uses `--salo-green` (`#2E7D32`) for active indicators to clearly distinguish the rider dispatch context from the customer (orange) and merchant (gold) modules.
- **Live Status Toggle:** The TopBar includes an interactive `Online` / `Offline` status button allowing riders to pause or resume dispatch availability with one tap.
- **Fiesta Identity:** Carries the subtle 4px banderitas accent strip along the header.

### 2. Rider Dashboard (`RiderDashboard.jsx` — `/rider`)
- **Brand Greeting:** Welcoming English greeting (*"Ready for today's deliveries, Danilo?"*) with territory pills.
- **4 Key Stat Cards:**
  1. *Today's Take-Home* — `₱840` (delivery fares + in-app customer tips).
  2. *Trips Completed* — Daily count and career milestone.
  3. *Cash on Hand (COD)* — Real-time tracking of cash collected from customers that must be remitted.
  4. *Customer Rating* — `★ 4.96` with Top Tier Courier status badge.
- **Active Trip Quick Strip:** Direct overview of pickup restaurant and customer drop-off address with a single-tap button to launch the live turn-by-turn guide.
- **Available Deliveries Nearby:** Instant preview of open dispatch orders waiting in the rider's zone.

### 3. Active Delivery Stepper (`RiderActiveDeliveryPage.jsx` — `/rider/active`)
- **Interactive Turn-by-Turn Stepper:**
  1. `Heading to Restaurant` → Button: *Confirm Arrival at Restaurant*
  2. `At Restaurant` → Button: *Verify Food & Start Delivery Ride*
  3. `In Transit` → Button: *Arrived at Customer Drop-off*
  4. `Arrived` → Button: *Complete Delivery & Confirm Handover*
- **Contact Shortcuts:** One-click `Call Kitchen` and `Call Customer` buttons.
- **Order Verification Checklist:** Full item breakdown (e.g., 2x Inasal, 1x Liempo, 2x Garlic Rice) so riders can verify sealed food bags before leaving the restaurant.
- **COD Collection Guard:** Clearly alerts the rider when cash collection is required before handing over packages, updating their Cash-on-Hand balance automatically upon completion.

### 4. Available Jobs Board (`RiderJobsPage.jsx` — `/rider/jobs`)
- **Dispatch Pool Cards:** Displays trip distance, estimated transit time, pickup venue, drop-off barangay, and guaranteed payout (₱78 – ₱110).
- **Safety Interlock:** Automatically prevents riders from accepting new jobs while an active delivery is currently in progress.
- **Accept & Ride:** Instant assignment that transitions the rider directly into active navigation mode.

### 5. Delivery History (`RiderHistoryPage.jsx` — `/rider/history`)
- **Searchable Ledger:** Search by Order #, restaurant name, or area.
- **Earnings Breakdown:** Displays base fare, customer tips, payment channel (GCash, Maya, COD), and completion timestamp.

### 6. Earnings & Remittances (`RiderEarningsPage.jsx` — `/rider/earnings`)
- **Income Tracking:** Daily, weekly, and monthly totals with tips isolated.
- **COD Cash on Hand Management:** Displays current cash liability with a ₱5,000 threshold warning.
- **Remittance Modal:** Allows couriers to submit remittance payments via GCash, Maya, or 7-Eleven Cliqq with reference verification.

### 7. Rider Profile & Vehicle Settings (`RiderProfilePage.jsx` — `/rider/profile`)
- **Identity & Emergency Contacts:** Contact number and verified emergency contact.
- **Vehicle Credentials:** Motorcycle model (`Honda Click 125i`), plate number (`NQ 4821`), and LTO driver's license number.
- **Territory:** Operating zone preference (`Quezon City · Tomas Morato & Scout Area`).

---

## 3. Build & Routing Verification

- **Production Build:**
  ```text
  vite v8.3.5 building client environment for production...
  transforming...
  ✓ 95 modules transformed.
  dist/index.html                   1.13 kB │ gzip:   0.59 kB
  dist/assets/index-VICdxCa1.css   59.54 kB │ gzip:  10.00 kB
  dist/assets/index-BvQj2iDW.js   585.02 kB │ gzip: 146.95 kB
  ✓ built in 470ms
  ```
- **Registered Routes in `App.jsx`:**
  - `/rider` → `RiderDashboard`
  - `/rider/active` → `RiderActiveDeliveryPage`
  - `/rider/jobs` → `RiderJobsPage`
  - `/rider/history` → `RiderHistoryPage`
  - `/rider/earnings` → `RiderEarningsPage`
  - `/rider/profile` → `RiderProfilePage`
- **Login Redirection:** Quick login demo button for `rider@salo.ph` redirects straight to `/rider`.
