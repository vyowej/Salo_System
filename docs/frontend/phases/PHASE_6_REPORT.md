# SALO — Phase 6: Administrator Module Report

**Module:** Central Headquarters Platform Administration  
**Platform:** SALO — Order. Reserve. Gather.  
**Identity:** Modern Filipino Food Culture · English-Primary Interface with Earthy Palayok Brown Accent  
**Build Status:** Complete & Verified (`✓ 104 modules transformed`, 0 errors)

---

## 1. Overview of Phase 6 Implementation

Phase 6 completes the primary roles architecture of the SALO platform. The Administrator module provides central operations, partner approval gates, courier LTO compliance monitoring, multi-kitchen order surveillance, user directory moderation, and global economic configurations.

### Key Architecture Components

```
src/
├── services/
│   └── adminService.js              # Platform stats, restaurant/rider verification, disputes, user moderation, config
├── layouts/
│   ├── AdminLayout.jsx              # Dedicated admin shell (Earthy Brown accent), TopBar with HQ badge
│   └── AdminLayout.css              # Responsive drawer navigation, theme-compatible
└── features/admin/pages/
    ├── AdminDashboard.jsx           # /admin — Platform GMV, take-rate revenue, approval queues, active orders
    ├── AdminRestaurantsPage.jsx     # /admin/restaurants — Partner verification, commission adjustments, suspension
    ├── AdminRidersPage.jsx          # /admin/riders — Courier fleet, LTO driver license check, COD cash held
    ├── AdminOrdersPage.jsx          # /admin/orders — Multi-kitchen orders, dispute resolution, refund approvals
    ├── AdminUsersPage.jsx           # /admin/users — Global 4-role user directory, account status toggling
    └── AdminSettingsPage.jsx        # /admin/settings — Platform commission %, base delivery fees, emergency gate
```

---

## 2. Page & Feature Details

### 1. Administrator Layout (`AdminLayout.jsx`)
- **Visual Distinction:** Uses `--salo-brown` (`#5D4037`) for active navigation indicators, communicating stability, governance, and traditional clay pot (*palayok*) heritage without sacrificing high-density utility.
- **TopBar Integration:** Displays `Super Administrator` profile, `HQ Root Access` pill badge, and rapid role switchers in the sidebar footer.
- **Fiesta Identity:** Maintains the subtle 4px top banderitas strip.

### 2. Admin Dashboard (`AdminDashboard.jsx` — `/admin`)
- **4 Central Platform KPIs:**
  1. *Total Platform GMV* — `₱1,845,200` with positive growth trajectory.
  2. *Commission Net Revenue* — `₱184,520` (10.0% take rate).
  3. *Active Orders Today* — `42` orders across 38 restaurants.
  4. *Couriers on the Road* — `28` live couriers out of 114 fleet members.
- **Pending Verification Queues:** Direct inline actions to review and approve restaurant partners and verify driver LTO credentials.
- **Live Multi-Kitchen Orders Surveillance:** Real-time visibility into complex multi-restaurant checkouts and dispatch assignments.

### 3. Restaurant Partners & Onboarding (`AdminRestaurantsPage.jsx` — `/admin/restaurants`)
- **Status Filter Tabs:** `All` | `Active` | `Pending Approval` | `Suspended`.
- **Custom Take Rates:** Click any restaurant's commission percentage (e.g., `10% ✎`) to open the Commission Adjustment Modal and configure custom rates (5% to 25%).
- **Verification Controls:** Immediate `Approve` or `Reject` buttons for incoming partner applications, with suspension safety toggles for compliance breaches.

### 4. Courier Fleet & LTO Compliance (`AdminRidersPage.jsx` — `/admin/riders`)
- **LTO Driver's License Review:** Inspect registered motorcycle makes, MV plate numbers, and official driver's license numbers.
- **COD Liability Surveillance:** Real-time visibility into cash held by couriers on deliveries, with automatic high-cash alerts for balances exceeding ₱3,000.
- **Fleet Moderation:** Activate, suspend, or decline couriers based on fulfillment ratings and remittance punctuality.

### 5. Platform Orders & Disputes (`AdminOrdersPage.jsx` — `/admin/orders`)
- **Multi-Kitchen Coordination:** Inspect consolidated order groups, sub-orders per restaurant, and assigned delivery riders.
- **Dispute Resolution Engine:** Handle customer refund escalations directly with `Approve Refund` and `Dismiss Dispute` actions.

### 6. Global User Directory (`AdminUsersPage.jsx` — `/admin/users`)
- **4-Role User Directory:** Filter and search across Customers, Restaurant Owners, Delivery Riders, and Administrators.
- **Moderation Actions:** Suspend or reactivate user accounts with protection for root administrative accounts.

### 7. System Configuration & Core Engine (`AdminSettingsPage.jsx` — `/admin/settings`)
- **Commercial Take Rates:** Baseline platform commission percentage (10.0%), base delivery fare (₱49), and minimum order threshold (₱150).
- **Grace Cancellation Buffer:** Configurable minutes before kitchens commence non-refundable prep.
- **Disaster Maintenance Gate:** High-risk emergency toggle to pause checkouts and dispatches during extreme weather (e.g., typhoons) or scheduled migrations.

---

## 3. Platform Architecture Summary Across All 4 Roles

SALO now provides a complete 4-role frontend ecosystem built on one cohesive design system:

| Role | Primary Theme Accent | Dedicated Layout | Key Entry Route |
|---|---|---|---|
| **Customer** | `--accent` (Fiesta Orange `#F36B2B`) | `CustomerLayout` | `/customer` |
| **Restaurant Owner** | `--fiesta-gold` (Golden Yellow `#F59E0B`) | `OwnerLayout` | `/owner` |
| **Delivery Rider** | `--salo-green` (Leaf Green `#2E7D32`) | `RiderLayout` | `/rider` |
| **Administrator** | `--salo-brown` (Earthy Brown `#5D4037`) | `AdminLayout` | `/admin` |

- **Design System Rules Strictly Preserved:** Pure white backgrounds (`#FFFFFF`) in light mode, true dark near-black (`#171717`) in dark mode. No beige or cream backgrounds.
- **Language Policy Followed:** Professional English interface throughout with natural Filipino brand expressions in strategic touchpoints.
- **Module Count:** 104 modules compiled with 0 errors.
