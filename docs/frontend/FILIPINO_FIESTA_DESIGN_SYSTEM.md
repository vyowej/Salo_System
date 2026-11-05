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

## 3. Natural Filipino / Taglish Microcopy Guidelines

SALO uses natural, warm, and comforting Taglish that feels like home (*parang nasa sariling hapag-kainan*):

### Time-Aware Greetings
- Morning (< 12:00 PM):
  > *"Magandang umaga, {name}! Kain tayo!"*
- Afternoon (12:00 PM – 6:00 PM):
  > *"Magandang hapon, {name}! Gutom ka na ba?"*
- Evening (6:00 PM onwards):
  > *"Magandang gabi, {name}! Tara, kain tayo!"*

### Search & Discovery Prompts
- *"Ano'ng cravings mo today? Hanapin ang inasal, silog, sisig, pizza..."*
- *"Salo-salo favorites"*
- *"Paborito sa Handaan"*
- *"Pampagana at Panghimagas"*

### Action Buttons & CTAs
- "Order Na!" / "Tara, Order Na!"
- "Magpareserba ng Mesa"
- "Tingnan ang Multi-Cart"
- "Tuloy po kayo!"

---

## 4. Role Application Rules for Upcoming Phases

When implementing Phase 4 (Restaurant Owner), Phase 5 (Rider), and Phase 6 (Admin):
1. **Restaurant Owner Module (Phase 4):**
   - Headings: *"Kusina & Restaurant Management"*, *"Mga Papasok na Order"*, *"Pamamahala ng Mesa"*.
   - Use earthy brown & gold accents for kitchen readiness and menu management.
2. **Delivery Rider Module (Phase 5):**
   - Headings: *"Aktibong Hatid"*, *"Biyahe & Shift"*, *"Kita & Remittance"*.
   - Use muted green & orange for active dispatch, safety, and delivery progress.
3. **Admin Module (Phase 6):**
   - Clean, trustworthy, efficient, yet carrying the subtle banderitas header and SALO identity.
