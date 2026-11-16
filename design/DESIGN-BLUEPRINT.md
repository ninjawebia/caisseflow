# Design System Blueprint — pos-nf525 (CaisseFlow)

A detailed UI/UX design specification. No reference images were supplied (PRD A9 = A): this blueprint **proposes** the visual direction, adapted to the four surfaces of CaisseFlow. It serves as the visual contract and direct implementation guide for Phase 3 Codegen.

**Mandatory standard:** every value below complies with `UIUX_TECHNICAL_DICTIONARY.md` (20 rules and formulas). Deviations are recorded and justified in §8.

**Surfaces covered:**
| Surface | Device | Density archetype | Dictionary reference |
| --- | --- | --- | --- |
| **A — Tablette caisse (POS)** | Android paysage 1280×800 | POS Comfortable (64px rows, ≥64px targets) | deviation documented §8.1 |
| **B — Terminaux serveurs** | Android paysage 1280×800 | POS Comfortable | deviation documented §8.1 |
| **C — KDS cuisine** | Android paysage 1280×800 | POS Comfortable | deviation documented §8.1 |
| **D — Back-office web (Next.js)** | Browser 360→1920px | Standard / Balanced (44px rows) | dictionary default |

---

## 1. Design Character & Style (UI Style)

- **Primary Style:** Modern Minimalist SaaS (Stripe/Vercel-style) applied to the back-office; POS surfaces are a **field-operational variant** of the same language: solid monochrome surfaces, one accent color, zero ornament, glance-first information.
- **Visual Impression (Aura/Mood):** Professional, calm, fast, trustworthy. The caisse must feel like a professional tool used under pressure: high contrast, oversized targets, permanent status visibility (sync/licence/printer), no decoration that competes with data.
- **Target Users & Context:** Restaurant staff standing up, one-handed, wearing gloves, during rush service (surfaces A/B/C); gérant, expert-comptable, auditeur on desktop browser (surface D).
- **Brand:** CaisseFlow — anchor color **CaisseFlow Blue `#2563EB`** used exclusively for primary CTAs and live state; all neutrals are cool slate (Rule 19: blue accent ↔ `slate-*`).
- **Anti-AI-Slop Guidelines:** Light mode only (no dark mode — PRD 15); no purple-blue gradients; no gradient text; no emoji icons; no native `alert()`; no placeholder-as-label; measured hairline borders; soft dual-layer shadows only.

---

## 2. Color Palette & Tokens (HEX & Tailwind)

### 2.1 Background Colors (3-tier surfaces)
| Role | HEX | Tailwind Class | Notes |
| --- | --- | --- | --- |
| Primary BG (canvas, surface D) | `#F8FAFC` | `bg-slate-50` | Back-office page background (Rule 7: off-white, never raw white full-screen) |
| Surface / Card BG | `#FFFFFF` | `bg-white` | Cards, modals, panels (surfaces A–D) |
| Secondary / Subtle BG | `#F1F5F9` | `bg-slate-100` | Input fills, inactive chips, category tiles (POS) |
| POS passive panel BG | `#0F172A` | `bg-slate-900` | Reserved: POS status bar + split-screen panel borders only — **not a dark theme** (PRD 15) |

### 2.2 Brand & Accent Colors
| Role | HEX | Tailwind Class | Notes |
| --- | --- | --- | --- |
| Primary Accent (brand) | `#2563EB` | `bg-blue-600 text-white` | Single primary CTA per screen (Rule 11): Encaisser, Valider, Créer |
| Primary Accent Hover | `#1D4ED8` | `hover:bg-blue-700` | Hover state |
| Secondary Accent | `#0F172A` | `bg-slate-900 text-white` | Secondary emphasis: active nav item, totals row |
| Accent Subtle | `#EFF6FF` | `bg-blue-50 text-blue-700` | Tinted chips, selected table, selected category |

### 2.3 Typography Colors
| Role | HEX | Tailwind Class | Notes |
| --- | --- | --- | --- |
| Heading / Title | `#0F172A` | `text-slate-900` | Screen titles, KPI values |
| Body Text | `#334155` | `text-slate-700` | Paragraphs, table cells, labels |
| Muted / Placeholder | `#64748B` | `text-slate-500` | Timestamps, helper text |
| On-dark (POS status bar) | `#F8FAFC` | `text-slate-50` | Text on `bg-slate-900` panels (contrast 15.6:1, AA ✓) |

### 2.4 Status & Border Colors (semantic pairings, Rule 20)
| Role | Hex (bg / text / dot) | Tailwind | Usage |
| --- | --- | --- | --- |
| Border / Hairline | `#E2E8F0` | `border-slate-200` | 1px card/input borders (POS: `border-slate-200/80`) |
| Success | `#ECFDF5` / `#065F46` / `#10B981` | `bg-emerald-50 text-emerald-700 border-emerald-200/60` | Encaissé, prêt (KDS), chaînage OK, imprimé |
| Warning | `#FFFBEB` / `#92400E` / `#F59E0B` | `bg-amber-50 text-amber-700 border-amber-200/60` | Offline, N écritures à synchroniser, licence grace1/grace2, file d'impression en attente |
| Danger | `#FEF2F2` / `#991B1B` / `#EF4444` | `bg-rose-50 text-rose-700 border-rose-200/60` | Annulation, rupture de chaînage, blocage licence, échec impression |
| Info | `#F0F9FF` / `#075985` / `#0EA5E9` | `bg-sky-50 text-sky-700 border-sky-200/60` | Info toasts, tips |
| **POS status pills (high-visibility variant)** | solid: `bg-emerald-600 text-white` / `bg-amber-500 text-slate-900` / `bg-rose-600 text-white` | — | Table/service states on the salle grid, seen from 1.5 m (deviation justified §8.1) |

---

## 3. Typography & Text Hierarchy

- **Font Family:** Inter (web) / system Roboto fallback (Android surfaces) — `font-sans`; **JetBrains Mono** for amounts, journal refs, hashes (`font-mono tabular-nums`, Rule 13).
- **Type scale (ratio 1.25, Rule 3):**
  - **Display / KPI (BO):** `text-3xl font-bold tracking-tight text-slate-900` (30px / 36px) — KPI cards only.
  - **H1:** `text-2xl font-bold tracking-tight text-slate-900` (24px / 32px).
  - **H2:** `text-lg font-semibold text-slate-900` (18px / 28px).
  - **H3:** `text-base font-medium text-slate-800` (16px / 24px).
  - **Body (BO):** `text-sm font-normal text-slate-700 leading-relaxed` (14px / 20px).
  - **Caption / Label (BO):** `text-xs font-medium text-slate-500` (12px / 16px). Sentence case; no uppercase eyebrows (dictionary prohibition).
- **POS scale (surfaces A/B/C, ≥64px targets, readable at arm's length):**
  - **POS H1:** 28px / 34px semibold.
  - **POS article name:** 18px semibold `text-slate-900`; **POS category tile:** 20px semibold white-on-accent or `text-slate-700` on `bg-slate-100`.
  - **POS body / ticket line:** 16px / 22px `text-slate-700`.
  - **POS amounts:** 20px `font-mono tabular-nums text-slate-900` (cart total 28px bold).
  - **KDS ticket title:** 22px bold; **KDS timer:** 20px `font-mono tabular-nums`.
  - **No text below 16px on POS surfaces.** KDS displays **never** render prices or monetary values (PRD KDS-3).
- **Measure (BO, Rule 17):** narrative text `max-w-prose` (65ch); tables exempt.
- **Alignment:** labels left; **all amounts right-aligned `font-mono tabular-nums`** (Rule 13) in tables, cart, tickets, reports.

---

## 4. Layout & Navigation Structure

### 4.1 Navigation System
- **Surface D (back-office):**
  - *Desktop ≥1024px:* fixed left sidebar `w-64 border-r border-slate-200 bg-white h-screen fixed` — items: Dashboard, Menu, Utilisateurs, Tables, Rapports, Journal, Exports, Modèle de ticket, Licence, Audit. Active item: `bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-600`.
  - *Tablet 768–1023px:* collapsible sidebar (`w-16` icon rail + toggle).
  - *Mobile <768px:* bottom nav `fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-t border-slate-200 py-2 pb-[max(8px,env(safe-area-inset-bottom))]` — 4 tabs (Dashboard, Menu, Rapports, Exports) + "Plus" sheet; `<main class="pb-24">` mandatory.
- **Surfaces A/B/C (POS, fixed 1280×800 landscape, no scroll):**
  - Permanent **status bar** top: `h-12 bg-slate-900 text-slate-50 px-4 flex items-center gap-4` — post ref (`POSTE-01`), sync pill (online/syncing/N en attente), licence pill, clock, user chip (matricule + nom).
  - Bottom **action bar** `h-20 bg-white border-t border-slate-200 px-4` — primary action right (`Encaisser` 72px tall), secondary left; only ONE primary (Rule 11).
  - In-app navigation via screen stack (no menus): `/login → /salle → /commande → /paiement → /ticket`.
- **Grid & spacing (Rule 1, 8px grid):** token scale 4/8/12/16/24/32/48/64/96px; POS uses 12px–16px gaps between targets; BO gaps 16/24/32px.

### 4.2 Grid structure per surface
- **D (BO):** 12-col desktop / 8-col tablet / 4-col mobile; container `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`; KPI bento `grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6`.
- **A — Caisse / commande:** split: left categories rail `w-56` (scrollable vertical, 64×64 tiles), right article grid `grid grid-cols-4 lg:grid-cols-5 gap-3` (tiles min 96×64px), fixed cart bottom `h-64 bg-white border-t border-slate-200` (lines 44px, qty stepper 44px, total right `tabular-nums`).
- **A — Plan de salle:** tiles `grid grid-cols-6 gap-3`, tile 120×104px, state color (libre `bg-white border-slate-200` / occupée `bg-blue-50 border-blue-300` / à encaisser `bg-emerald-50 border-emerald-300` / impayée-warn `bg-amber-50`), table name 18px + amount 16px `tabular-nums`.
- **A — Paiement:** single-focus screen: total 56px bold center, method tiles 2×2 (carte/espèces/mixte/fractionné) 144×88px, numeric keypad 4×4 (keys 72×64px).
- **B — Terminaux:** same as commande screen minus any payment affordance (absent from binary, PRD TERM-3).
- **C — KDS:** 3 fixed columns (Nouveau / En cours / Prêt) `flex-1 gap-4 px-4`, ticket card 16px radius, header = table + timer, items 18px; aging ≥ 8 min → card border `border-amber-400`, ≥ 15 min → `border-rose-500`.
- **Responsiveness:** 360/390/768/1024/1440/1920px without horizontal root scroll on surface D (Rule: `overflow-x-hidden` root, tables `overflow-x-auto` wrappers); A/B/C fixed-layout.

---

## 5. Detailed Component Breakdown

### 5.1 Header / Top bars
- **BO topbar:** `sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-slate-200/80` — page title H1, global search `h-10 w-96`, sync-state pill, avatar dropdown.
- **POS status bar:** see 4.1 — always visible, never hidden by content; warning/danger variants tint the whole bar (`bg-amber-500 text-slate-900` when offline).

### 5.2 Cards & Containers
- **BO card:** `bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow` (radius 16px; children concentric: inputs/buttons `rounded-lg` 8px inside 16px padding — Rule 4).
- **POS panel:** `bg-white rounded-xl border border-slate-200/80` (12px), no hover shadow (touch, not pointer); elevated overlays (PIN sheet, confirm modal) `rounded-2xl shadow-md`.
- **KDS ticket:** `bg-white rounded-xl border-2 border-slate-200 shadow-sm` — border color encodes age (see 4.2).

### 5.3 Buttons (6 states — Default/Hover/Active/Focus/Disabled/Loading)
- **BO Primary:** `h-10 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-medium rounded-lg transition-[transform,colors] duration-150 inline-flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none` (loading: inline spinner + "Enregistrement…").
- **BO Secondary:** `h-10 px-4 border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-lg transition-colors` (+ same focus/disabled states).
- **BO Destructive:** `h-10 px-4 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg` — reserved for confirm-modal actions only (annulations, désactivation utilisateur).
- **POS Primary:** `min-h-[64px] px-8 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-lg font-semibold rounded-xl` — one per screen.
- **POS Article tile:** `min-h-[64px] min-w-[64px] bg-slate-100 active:bg-blue-50 active:scale-[0.97] rounded-xl border border-slate-200/80 text-left p-3` — two-line: name 18px + price 16px `tabular-nums`.
- **POS Keypad key:** `h-16 w-full bg-white border border-slate-200 active:bg-slate-100 rounded-xl text-xl font-mono tabular-nums`.
- **Inputs (BO):** `h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow` (jitter-free, Rule 14). Label above: `text-xs font-semibold text-slate-700` + required `*`; helper/error area pre-reserved.
- **Status badges (Rule 20 anatomy):** `inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-{color}-50 text-{color}-700 border border-{color}-200/60` + `w-1.5 h-1.5 rounded-full bg-{color}-500` dot (sync, licence, table, impression states).

### 5.4 Data Visualization & Lists
- **BO data table:** rows `h-12 hover:bg-slate-50/80 transition-colors`; text left; amounts/dates right `font-mono tabular-nums`; status pill centered; actions column pinned right `w-20`; wrapper `overflow-x-auto`; journal views show `ref` in mono (`POSTE-01-000042`) + chaînage dot (emerald OK / rose rupture).
- **Reports:** line/bar charts 32px caption font 12px muted; period filter pill row; totals row `bg-slate-50 font-semibold` with `tabular-nums`.
- **POS cart lines:** name truncated (`truncate` + `title=`), qty × price right mono; annulation per line = icon button 44px + PIN/motif flow (never inline destructive without confirm).
- **Journal read views (C-07, S-07):** virtualized list rows 40px (BO) / 48px (POS), mono refs, filter chips.

---

## 6. Visual Detail & Interaction

- **Icons:** Lucide Icons (`data-lucide`), stroke-width 2, sizes: BO 16/18/20px; POS 24/28px (icons inside 64px targets).
- **Motion (Rule 18, GPU-only):** micro-interactions `duration-150 ease-out` on `transform,opacity` only; modal/sheet 200–250ms `cubic-bezier(0.16,1,0.3,1)`; POS haptic feedback on tile press; **no** `transition: all`, no layout-property animation.
- **Elevation (Rule 12):** dual-layer only — cards `shadow-sm`, floating `shadow-md`; no single heavy black shadow.
- **State handling (every screen, PRD 12.4):**
  - *Loading:* skeletons `animate-pulse bg-slate-200/80 rounded-xl` with dimensions identical to final content (CLS = 0, Rule 16); POS tables show 6 skeleton tiles.
  - *Empty:* Lucide icon 48–64px in `bg-slate-100 rounded-full p-6`, title + one-line cause + single action CTA (e.g. "Aucune vente aujourd'hui" → "Ouvrir le plan de salle").
  - *Error:* banner `bg-rose-50 border border-rose-200 text-rose-700 text-sm p-4 rounded-xl` + retry button; POS errors also mirrored in status bar pill.
  - *Offline/queue:* persistent amber banner "N écritures à synchroniser" (dismissible only when count = 0).
- **Feedback:** styled toasts top-right (BO) / top-center (POS), success 3s auto-dismiss, error persists until action; confirmation flows (annulation, remise, Z, sortie kiosque) always use modal + PIN entry — never `window.confirm`.
- **Kiosk mode (C-08 exit):** admin code modal `rounded-2xl shadow-md` with numeric pad.

---

## 7. Design System Blueprint (Ready for WebApp Builder)

```html
<!-- DESIGN SYSTEM CONTRACT & PRIMARY TOKENS -->
<!-- Use these Tailwind classes directly in Phase 3 interface development -->
<div class="theme-tokens hidden"
     data-font="Inter, system-ui, sans-serif"
     data-font-mono="JetBrains Mono, monospace"
     data-bg-canvas="bg-slate-50"
     data-bg-surface="bg-white"
     data-text-main="text-slate-900"
     data-text-body="text-slate-700"
     data-text-muted="text-slate-500"
     data-border="border-slate-200"
     data-accent="bg-blue-600 text-white"
     data-accent-hover="hover:bg-blue-700"
     data-accent-subtle="bg-blue-50 text-blue-700"
     data-status-success="bg-emerald-50 text-emerald-700 border-emerald-200/60"
     data-status-warning="bg-amber-50 text-amber-700 border-amber-200/60"
     data-status-danger="bg-rose-50 text-rose-700 border-rose-200/60"
     data-radius-card="rounded-2xl"
     data-radius-pos-panel="rounded-xl"
     data-radius-btn="rounded-lg"
     data-touch-target-bo="h-10 min-h-[44px]"
     data-touch-target-pos="min-h-[64px] min-w-[64px]">
</div>
```

### Implementation Instructions (Phase 3 contract)
1. Use the HEX palette and tokens above as `:root` CSS variables or Tailwind config; semantic names over appearance (Rule 6).
2. **No dark mode** (PRD 15). POS dark panels (`bg-slate-900`) are component-scoped, never a theme.
3. Surface D responsive 360px→1920px; surfaces A/B/C fixed 1280×800 landscape with internal scroll areas only.
4. Every button carries a real handler (`data-action`) — no dead buttons (anti-slop rule 7).
5. One primary CTA per screen (Rule 11); destructive actions always inside a PIN/confirm modal.
6. All amounts, journal refs, hashes: `font-mono tabular-nums`, right-aligned where tabular (Rule 13).
7. KDS surfaces must never receive price data from the API (KDS-3) — design assumes absence, code enforces it.
8. Every screen implements its 4 states (PRD 12.4) with matched-dimension skeletons (CLS = 0).

---

## 8. Recorded Deviations from the Dictionary

### 8.1 POS touch-target & density (surfaces A/B/C)
- **Dictionary default:** 44×44px targets, 44px table rows.
- **Applied:** 64×64px minimum targets, 18px POS body text, solid high-visibility table pills.
- **Justification:** restaurant service context — standing, one-handed, gloves, screens read from distance; consistent with PRD 10.3 (≥64px POS) and 12.2 ("Comfortable POS"). Dictionary Rule 15 minimum (44px) remains respected — POS exceeds it.
- **Scope:** surfaces A/B/C only; surface D (back-office) follows the dictionary exactly.

### 8.2 Brand accent color
- **Dictionary default / template:** primary accent `#0F172A` (slate-900).
- **Applied:** `#2563EB` (blue-600) as brand CTA accent; slate-900 retained for secondary emphasis and POS status bar.
- **Justification:** CaisseFlow brand identity needs one recognizable operational accent on busy POS surfaces; blue is distinct from all three semantic colors (success/warning/danger), avoiding state confusion on the salle grid.
