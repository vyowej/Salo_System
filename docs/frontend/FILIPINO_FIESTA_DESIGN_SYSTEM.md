# SALO — Official Filipino Fiesta Design System & Culture Guidelines

**Platform:** SALO — Order. Reserve. Gather. (Salo-salo sa Sarap)  
**Brand Personality:** Warm, welcoming, festive, comforting, and homey. Modern Filipino food culture.  
**Effective Date:** November 2026  
**Applies to:** Customer, Restaurant Owner, Delivery Rider, and Administrator modules.

---

## 1. Core Brand Color Palette

The official SALO brand identity uses the colors derived from the official SALO logo.
These colors represent traditional Filipino dining culture — the clay cooking pot (*palayok*), the banana leaf (*dahon ng saging*), warm annatto spices, and festive golden sunshine.

### Primary Logo & Fiesta Palette

| Token | Name | Hex | Meaning & Application |
|---|---|---|---|
| `--salo-orange` / `--accent` | **Fiesta Orange** | `#F36B2B` | Primary actions and selected navigation or control states. Do not use for decorative accents or large backgrounds. |
| `--salo-gold` / `--fiesta-gold` | **Golden Yellow** | `#F59E0B` | Sun, celebration, handaan, table reservations, ratings, festive highlights. |
| `--salo-brown` / `--fiesta-brown` | **Earthy Brown** | `#5D4037` | Traditional clay pot (*palayok*) and brand imagery; do not use as a role-specific UI accent. |
| `--salo-green` / `--fiesta-green` | **Muted Leaf Green** | `#2E7D32` | Semantic success and verification indicators. |

### Semantic Information-Card Tints

The four icon-derived colors below are reserved for summary, status, and
information cards across all four interfaces. They do not replace the core
palette above or become role-specific accents.

| Card token family | Color | Meaning |
|---|---|---|
| `--card-brand-orange` | `#C85428` | Orders, deliveries, live activity, and items needing action |
| `--card-brand-gold` | `#DFA03E` | Money, earnings, promotions, and highlights |
| `--card-brand-green` | `#68733C` | Reservations, tables, availability, approvals, and success |
| `--card-brand-brown` | `#55301C` | Analytics, inventory, finance controls, and neutral/offline information |

Use the corresponding `--card-*-bg`, `--card-*-bg-hover`, `--card-*-border`,
`--card-*-border-strong`, `--card-*-accent`, `--card-*-text`, and
`--card-*-chip` theme tokens rather than component-local color values. Light
and dark values are defined in `../../src/styles/themes.css`; shared card
geometry is defined in `../../src/styles/variables.css`.

- Keep forms, input-focused settings/profile cards, data tables, audit records,
  notifications, and customer restaurant-photo cards neutral.
- Keep warning and danger states in their existing semantic colors.
- Use semantic card-label and action-text tokens to preserve readable text and
  keyboard focus contrast in both themes.

### Strict Neutral Background Rules (Non-Negotiable)

- **Light Mode (`[data-theme="light"]`):**
  - Background is **PURE WHITE** (`#FFFFFF`).
  - Surfaces use clean cool neutrals (`#F8F9FA` / `#F1F3F5`).
  - The semantic information-card tints above are the sole approved colored-surface exception.
  - **STRICTLY PROHIBITED:** Beige, cream, ivory, tan, or yellowish warm off-white backgrounds.
- **Dark Mode (`[data-theme="dark"]`):**
  - Background is **TRUE NEAR-BLACK** (`#171717`).
  - Surfaces use dark charcoal (`#1E1E20` / `#262629`).
  - Borders use subtle muted contrast (`#353539`).

---

## 2. Shared Component and Cross-Role Consistency

SALO must use one visual language across the public site and the Customer, Restaurant Owner, Rider, and Admin interfaces. Differences between roles come from content and information density, not separate visual styles.

- Reuse shared components for buttons, inputs, cards, badges, modals, dropdowns, navigation, and other common UI. Extend an existing component or pattern before creating a new one-off style.
- Use the existing design tokens for colors, spacing, border radii, shadows, and typography. Do not invent values; add or change tokens only through an intentional design-system update.
- Use Fiesta Orange (`#F36B2B`) for primary actions and selected states, never as a large background. Other palette colors remain shared tokens and should be used only for their established or semantic purpose, not as role-specific accent systems. The semantic information-card tint mapping above is consistent across roles.
- Keep top-bar and sidebar structure, height, spacing, logo treatment, and button styling consistent across roles.
- Prefer open layouts with clear hierarchy over unnecessary nested cards.
- Keep hover, focus, active, and loading states consistent across the application. Use the existing motion tokens (`150ms` / `220ms`) and do not introduce new motion styles.
- Keep image fit, aspect ratio, radius, hover behavior, and placeholder treatment consistent across the application.

Before creating or changing UI, check for an existing shared component or pattern and compare the intended treatment with the public landing page and this design system.

---

## 3. Tasteful Filipino Decorative Elements

Festive accents must be restrained and purposeful to avoid a cluttered "carnival" look while evoking authentic Philippine hospitality:

### Decorative Color Use

Multicolor accent strips are not part of the baseline navigation or dashboard design. Do not add them to new screens; preserve the shared SALO logo and navigation treatment instead.

### 2. Fiesta Cultural Pills (`.fiesta-pill`)
Small rounded pill badges used for cultural highlights:
- `.fiesta-pill` uses a neutral surface and text treatment.
- Gold and green variants are reserved for their established semantic meanings.
- Orange is reserved for primary actions and selected states, not decorative pills.

### 3. Open Layouts over Card Clutter
In Philippine dining, a feast (*salo-salo*) is expansive and shared. Layouts must prioritize open white space, generous line-heights, and clear typographic hierarchy over putting every single item inside nested boxes.

---

## 4. Language & Brand Voice Policy

> **SALO's interface language is English.** Filipino/Taglish phrases are used selectively as brand expressions only.

### Primary Language: English

All functional UI must be in English:
- Navigation menus and labels
- Buttons and CTAs
- Form labels and placeholders
- Validation and error messages
- Order / reservation status text
- Dashboard labels, tables, and analytics
- Settings, notifications, admin tools

### Filipino as Brand Expression (Selected Locations Only)

Use Filipino phrases naturally in:
- **Landing page hero headline** — `"Kain tayo!"`
- **Festive section accents** — `"Gutom ka na ba?"`
- **Welcome / greeting badges** — `"Tuloy po kayo!"`, `"Kain tayo!"`
- **Business-owner greetings** — `"Magandang umaga! Here's your business overview."`
- **Rider dashboard greeting** — `"Ready for today's deliveries?"`

### Correct Reference Examples

| Location | Correct Wording |
|---|---|
| Landing page headline | `Kain tayo!` |
| Landing page description | Discover restaurants and enjoy good food with the people you love. |
| Customer greeting | Good morning! Ready to find something delicious? |
| Food discovery section badge | `Gutom ka na ba?` |
| Search placeholder | Search restaurants, dishes, or cuisines... |
| Restaurant section heading | Explore Restaurants |
| Add to cart | Add to Cart |
| Checkout | Proceed to Checkout |
| Order confirmation | Your order has been confirmed! |
| Reservation | Book a Table |
| Owner greeting | Magandang umaga! Here's your business overview. |
| Rider dashboard | Ready for today's deliveries? |
| Welcome modal badge | `Tuloy po kayo!` |
| Welcome modal heading | Welcome to SALO! |

### Strict Rules
- ❌ Do not use Filipino for buttons, form labels, or error messages
- ❌ Do not translate standard English UI vocabulary
- ❌ Do not use Filipino phrases in every section — select, strategic use only
- ✅ Filipino phrases enhance brand personality — they do not replace English usability

---

## 5. Role Application Rules for Upcoming Phases

When implementing Phase 4 (Restaurant Owner), Phase 5 (Rider), and Phase 6 (Admin):
1. **Restaurant Owner Module (Phase 4):**
   - Interface: English throughout. Optional brand greeting: *"Magandang umaga! Here's your business overview."*
   - Use the shared SALO palette and components; represent kitchen readiness and menu status with existing semantic tokens.
2. **Delivery Rider Module (Phase 5):**
   - Interface: English throughout. Optional brand tagline: *"Kain tayo — let's get it there!"*
   - Use the shared SALO palette and components; represent dispatch, safety, and delivery progress with existing semantic tokens.
3. **Admin Module (Phase 6):**
   - Clean, trustworthy, efficient, English-only. SALO branding and shared navigation treatment preserved.
