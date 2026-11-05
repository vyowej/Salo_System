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
| `--salo-orange` / `--accent` | **Fiesta Orange** | `#F36B2B` | Primary call-to-action buttons, key highlights, active nav indicators. Never used as a full-page background wash. |
| `--salo-gold` / `--fiesta-gold` | **Golden Yellow** | `#F59E0B` | Sun, celebration, handaan, table reservations, ratings, festive highlights. |
| `--salo-brown` / `--fiesta-brown` | **Earthy Brown** | `#5D4037` | Traditional clay pot (*palayok*), comfort, heritage cooking, grounding borders. |
| `--salo-green` / `--fiesta-green` | **Muted Leaf Green** | `#2E7D32` | Banana leaf table lining (*dahon ng saging*), fresh ingredients, verified status, success indicators. |

### Strict Neutral Background Rules (Non-Negotiable)

- **Light Mode (`[data-theme="light"]`):**
  - Background is **PURE WHITE** (`#FFFFFF`).
  - Surfaces use clean cool neutrals (`#F8F9FA` / `#F1F3F5`).
  - **STRICTLY PROHIBITED:** Beige, cream, ivory, tan, or yellowish warm off-white backgrounds.
- **Dark Mode (`[data-theme="dark"]`):**
  - Background is **TRUE NEAR-BLACK** (`#171717`).
  - Surfaces use dark charcoal (`#1E1E20` / `#262629`).
  - Borders use subtle muted contrast (`#353539`).

---

## 2. Tasteful Filipino Decorative Elements

Festive accents must be restrained and purposeful to avoid a cluttered "carnival" look while evoking authentic Philippine hospitality:

### 1. Subtle Banderitas Accent Strip (`.fiesta-banderitas-strip`)
A 4px micro-ribbon alternating SALO's 4 colors (Orange `#F36B2B` → Gold `#F59E0B` → Green `#2E7D32` → Brown `#5D4037`):
```html
<div className="fiesta-banderitas-strip" aria-hidden="true" />
```
- Placed above the main navigation bar, at the top of the hero banner, and on dashboard header sections.
- Thin, subtle, and elegant.

### 2. Fiesta Cultural Pills (`.fiesta-pill`)
Small rounded pill badges used for cultural highlights:
- `.fiesta-pill` (Fiesta Orange tint)
- `.fiesta-pill-gold` (Golden celebration tint)
- `.fiesta-pill-green` (Banana leaf green tint)

### 3. Open Layouts over Card Clutter
In Philippine dining, a feast (*salo-salo*) is expansive and shared. Layouts must prioritize open white space, generous line-heights, and clear typographic hierarchy over putting every single item inside nested boxes.

---

## 3. Language & Brand Voice Policy

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

## 4. Role Application Rules for Upcoming Phases

When implementing Phase 4 (Restaurant Owner), Phase 5 (Rider), and Phase 6 (Admin):
1. **Restaurant Owner Module (Phase 4):**
   - Interface: English throughout. Optional brand greeting: *"Magandang umaga! Here's your business overview."*
   - Use earthy brown & gold accents for kitchen readiness and menu management.
2. **Delivery Rider Module (Phase 5):**
   - Interface: English throughout. Optional brand tagline: *"Kain tayo — let's get it there!"*
   - Use muted green & orange for active dispatch, safety, and delivery progress.
3. **Admin Module (Phase 6):**
   - Clean, trustworthy, efficient, English-only. Subtle banderitas header strip and SALO branding preserved.
