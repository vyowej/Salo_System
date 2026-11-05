# SALO — Phase 4: Restaurant Owner Module Report

**Module:** Restaurant Owner Dashboard & Operations  
**Platform:** SALO — Order. Reserve. Gather.  
**Identity:** Modern Filipino Food Culture · English-Primary Interface with Festive Touches  
**Build Status:** Complete & Verified (`✓ 86 modules transformed`, 0 errors)

---

## 1. Overview of Phase 4 Implementation

Phase 4 establishes the complete operational command center for restaurant partners on SALO. Designed with an open, modern layout, high visual clarity, and clean English UI with Filipino cultural warmth (subtle banderitas strip, gold active accent, and respectful brand greetings).

### Key Architecture Components

```
src/
├── services/
│   └── ownerService.js               # Persistence, order states, menu CRUD, reservations, earnings
├── layouts/
│   ├── OwnerLayout.jsx               # Dedicated sidebar (Gold accent), TopBar, banderitas strip
│   └── OwnerLayout.css               # Shell layout, responsive sidebar transition, theme-aware
└── features/restaurant/pages/
    ├── OwnerDashboard.jsx            # /owner — 4 KPI cards, live order strip, upcoming bookings
    ├── OwnerOrdersPage.jsx           # /owner/orders — Real-time orders, status transitions, expandable rows
    ├── OwnerMenuPage.jsx             # /owner/menu — Menu catalog, availability toggles, Add/Edit modal
    ├── OwnerReservationsPage.jsx     # /owner/reservations — Table bookings, party size, deposit tracking
    ├── OwnerEarningsPage.jsx         # /owner/earnings — Sales metrics, 7-day bar chart, payout request
    └── OwnerProfilePage.jsx          # /owner/profile — Storefront settings, open/closed toggle, delivery rates
```

---

## 2. Page & Feature Details

### 1. Restaurant Owner Layout (`OwnerLayout.jsx`)
- **Visual Distinction:** Uses `--fiesta-gold` (`#F59E0B`) for active navigation indicators to distinguish merchant management from the customer module while maintaining cohesive brand harmony.
- **TopBar Integration:** Displays verified store name (*Dalisay Heritage Grill & Bistro*), quick notifications, and theme toggle.
- **Role Switcher:** Direct navigation link to preview customer view or sign out.
- **Fiesta Identity:** Subtle 4px banderitas accent strip along the top edge.

### 2. Owner Dashboard (`OwnerDashboard.jsx` — `/owner`)
- **Brand Greeting:** Time-aware greeting (`"Magandang umaga! Here's your restaurant overview"`).
- **4 Key Stat Cards:**
  1. *Today's Revenue* — `₱4,200` with positive trend indicator.
  2. *Orders Today* — Count with live pending and preparing breakdown.
  3. *Pending Reservations* — Needs-attention alerts.
  4. *Average Order Value* — `₱485` per ticket.
- **Live Incoming Orders Quick Strip:** Compact rows with immediate `Accept` / `Decline` action triggers.
- **Table Reservation Snapshot:** Pending guest parties with party size and deposit status.
- **Menu Health Card:** Quick count of active vs. paused dishes.

### 3. Live Orders Management (`OwnerOrdersPage.jsx` — `/owner/orders`)
- **Status Filter Chips:** `All` | `Pending` | `Preparing` | `Ready for Pickup` | `Completed` | `Cancelled`.
- **Live Workflow Actions:**
  - `Pending`: Accept (transitions order to `Preparing`) or Decline.
  - `Preparing`: Mark Ready (notifies delivery riders / customer).
  - `Ready for Pickup`: Complete Order.
- **Expandable Order Detail:** Click any order row to inspect full item breakdown, delivery address, payment method badge (COD, GCash, Maya), and special cooking notes.

### 4. Menu Management (`OwnerMenuPage.jsx` — `/owner/menu`)
- **Category Filtering:** Dynamic category chips (`Best Sellers`, `Grilled Mains`, `Beverages`, etc.).
- **Live Availability Switch:** Interactive toggle on every card allowing kitchens to pause sold-out items in real time.
- **Add / Edit Dish Modal:** Complete modal using SALO FormElements (dish name, icon, price in ₱, description, category selector, availability checkbox).
- **Safety Confirmations:** Inline two-step confirmation before deleting menu items.

### 5. Table Reservations (`OwnerReservationsPage.jsx` — `/owner/reservations`)
- **Booking Management:** Tracks party size (e.g., 4 guests), reservation date/time, and special requests.
- **Deposit Tracking:** Identifies whether the ₱500 reservation deposit is paid and confirms deduction upon arrival.
- **Status Workflow:** Confirm pending bookings, mark guests seated/completed, or decline with clear status badges.

### 6. Earnings & Payouts (`OwnerEarningsPage.jsx` — `/owner/earnings`)
- **Revenue Summaries:** Today's gross sales, weekly revenue, monthly totals, and net payout balance.
- **7-Day Performance Visualization:** CSS-based responsive bar chart visualizing daily restaurant sales volume.
- **Settlement Ledger:** Detailed ledger table showing transaction reference, date, payment channel, 10% platform commission, and disbursed net total.
- **Request Payout Modal:** Allows on-demand disbursement to registered bank accounts (e.g., BDO Unibank) with zero withdrawal fees.

### 7. Restaurant Profile & Operations (`OwnerProfilePage.jsx` — `/owner/profile`)
- **Store Opening Toggle:** Live toggle switch to open or pause store operations.
- **Storefront Details:** Public name, tagline, cuisine tags, contact hotline, physical address, and restaurant bio.
- **Fulfillment & Table Policies:** Operating hours, estimated prep/delivery time, base delivery fee, minimum order amount, and table deposit fee.

---

## 3. Build & Integration Verification

- **Production Build:**
  ```text
  vite v8.3.5 building client environment for production...
  transforming...
  ✓ 86 modules transformed.
  dist/index.html                   1.13 kB │ gzip:   0.59 kB
  dist/assets/index-BN2NOJWi.css   58.38 kB │ gzip:   9.90 kB
  dist/assets/index-CQIqHPQT.js   528.81 kB │ gzip: 136.97 kB
  ✓ built in 409ms
  ```
- **Live Route Map:**
  - `/owner` → `OwnerDashboard`
  - `/owner/orders` → `OwnerOrdersPage`
  - `/owner/menu` → `OwnerMenuPage`
  - `/owner/reservations` → `OwnerReservationsPage`
  - `/owner/earnings` → `OwnerEarningsPage`
  - `/owner/profile` → `OwnerProfilePage`
- **Role Redirection:** Quick login as `owner@salo.ph` redirects straight to `/owner`.
