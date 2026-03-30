# Design System Specification: High-Tier CRM/ATS Portal

## 1. Overview & Creative North Star: "The Digital Curator"

This design system moves away from the "industrial" feel of traditional CRM/ATS platforms and toward an editorial, high-end experience. Our Creative North Star is **The Digital Curator**. 

The goal is to present high-density data not as a cluttered spreadsheet, but as a curated gallery of actionable insights. We achieve this through **Intentional Asymmetry**—using varied widget widths to break the monotony of the grid—and **Tonal Depth**, where hierarchy is defined by light and layering rather than lines and boxes. This is a "quiet" interface that speaks with authority through sophisticated typography and generous whitespace.

---

## 2. Colors: Tonal Architecture

Our palette is rooted in a professional "Deep Slate" foundation, using "Action Blue" as a surgical tool for conversion.

### Core Palette (Material Convention)
- **Primary (Action Blue):** `#004ac6` – Reserved for high-priority actions.
- **Surface (Background):** `#faf8ff` – A warm, "paper" white that reduces eye strain.
- **On-Surface (Deep Slate):** `#131b2e` – Used for primary headlines to ensure maximum authority.
- **On-Surface-Variant (Charcoal):** `#434655` – For secondary body text and metadata.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to section off the UI. Sectioning must be achieved through **Background Color Shifts**. 
*   *Example:* A `surface-container-low` (`#f2f3ff`) sidebar sitting against a `surface` (`#faf8ff`) main canvas.

### Surface Hierarchy & Nesting
Treat the UI as physical layers of fine paper. 
- **Base Level:** `surface` (`#faf8ff`)
- **Main Content Area:** `surface-container-low` (`#f2f3ff`)
- **Interactive Widgets:** `surface-container-lowest` (`#ffffff`) to create a "lifted" feel.

### The "Glass & Gradient" Rule
To avoid a flat, "templated" look, use a subtle **Signature Texture** on primary CTAs:
- **Gradient:** Linear 135° from `primary` (`#004ac6`) to `primary-container` (`#2563eb`).
- **Floating Elements:** Use Glassmorphism for modals or dropdowns using `surface_variant` at 80% opacity with a `20px` backdrop blur.

---

## 3. Typography: Editorial Authority

We utilize **Inter** for its mathematical precision in data-heavy environments. The hierarchy is designed to guide the eye from "Macro" (Status) to "Micro" (Data).

- **Display-LG (3.5rem):** Used for "Big Numbers" (e.g., Total Pipeline Value).
- **Headline-SM (1.5rem):** Used for Widget titles. Set with tight letter-spacing (-0.02em) for a premium feel.
- **Title-SM (1rem):** Used for Candidate/Lead names in lists. Semibold weight.
- **Body-MD (0.875rem):** The workhorse for all CRM data. High line-height (1.5) for readability.
- **Label-SM (0.6875rem):** All-caps with 0.05em tracking for secondary metadata (e.g., "LAST CONTACTED").

---

## 4. Elevation & Depth: Tonal Layering

We convey hierarchy through **Tonal Layering** rather than structural lines.

### The Layering Principle
Stack containers to create depth. Place a `surface-container-lowest` card on top of a `surface-container-high` section. The slight color shift creates a "soft lift" that is more sophisticated than a drop shadow.

### Ambient Shadows
Shadows must be "breath-like." 
- **Token:** `0px 4px 20px rgba(19, 27, 46, 0.06)`. 
- Shadows should use a tint of the `on-surface` color (`#131b2e`) rather than pure black to keep the UI looking clean and integrated.

### The "Ghost Border" Fallback
If a border is required for accessibility (e.g., in a high-density table), use the **Ghost Border**: 
- `outline-variant` (`#c3c6d7`) at **15% opacity**. Never use 100% opaque lines.

---

## 5. Components: Stylized Primitives

### Buttons
- **Primary:** Gradient-filled (Action Blue to Primary Container), `8px` rounded corners.
- **Secondary:** Transparent background with a `Ghost Border` and `primary` text.
- **States:** On hover, increase the elevation scale by one tier; do not simply darken the color.

### Data Tables (The "Functional" Grid)
- **Forbid Dividers:** Separate rows using a `4px` (Spacing Scale `2`) vertical gap and a subtle background hover state (`surface-container-highest`).
- **Alignment:** Numbers are always right-aligned; text is left-aligned. Use `body-sm` for secondary column data.

### Dual-Mode Sidebar
- **Sales Mode:** Uses a `surface-container-low` background with `primary` accents.
- **Recruitment Mode:** Uses the same structure but replaces `primary` accents with `tertiary` (`#006243`) to provide a distinct psychological shift between modules.

### Status Chips
Semantic coloring must be used sparingly to avoid "fruit salad" UI:
- **Hired/Success:** `tertiary-container` (`#007d57`) background with `on-tertiary` text.
- **Pending:** `amber` tokens for warmth.
- **Rejected:** `error-container` (`#ffdad6`) with `on-error-container` text.

---

## 6. Do's and Don'ts

### Do
- **Do** use asymmetric widget layouts (e.g., a 70% width "Pipeline" widget next to a 30% width "Recent Activity" widget).
- **Do** use "Negative Space" as a separator. If you feel the need to add a line, add `1.75rem` (Spacing Scale `8`) of whitespace instead.
- **Do** ensure all interactive elements have a minimum touch target of `44px`, even if the visual element is smaller.

### Don't
- **Don't** use 100% black (`#000000`) for text. It creates too much vibration against the white surface. Use `on-surface`.
- **Don't** use standard "Drop Shadows." Only use the Ambient Shadow specification provided in Section 4.
- **Don't** use "Alert Red" for anything other than a destructive action or a "Lost" status. High-tier platforms remain calm under pressure.