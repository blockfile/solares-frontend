# HELIOS — Solares MIS Design System (v1)
The complete visual contract for the SOLARES frontend redesign. Every CSS file MUST follow this.
Old design ("Ledger Pro": green/gold, Inter/Archivo, soft rounded cards) is DEAD. Do not reproduce it.

## 1. Concept
**"Solar command console."** A two-tone engineering workstation for a solar-energy company:
permanently dark graphite **chrome** (sidebar/nav) + themed **content stage** (warm porcelain in
light mode, deep obsidian in dark mode). Sharp geometry, hairline borders, monospace data,
solar-amber energy accents, technical eyebrows, corner-bracket details. Dense but calm.

## 2. Tokens (already defined in src/index.css — consume, never redefine)
Use ONLY these variables. Never hardcode colors except pure white/black in rare masks.
The authoritative list is live in d:\SOLARES\solares-system\frontend\src\index.css (section 00).
Key names: --bg, --bg-deep, --surface, --surface-soft, --surface-raise, --text, --text-soft,
--text-faint, --border, --border-soft, --border-strong; chrome (same in both themes):
--chrome-bg, --chrome-bg-soft, --chrome-bg-raise, --chrome-border, --chrome-text,
--chrome-text-soft, --chrome-text-faint; solar core: --primary (#f59a23 light / #ffb224 dark,
fills take ink #16181d text), --primary-strong, --primary-deep (text-on-light amber),
--primary-ink, --primary-soft, --glow-primary; --accent (photon cyan) + --accent-soft +
--accent-strong; status: --success/--danger/--warn/--info each with *-soft and --danger-strong;
charts: --chart-1..6 (validated); shadows --shadow-sm/md/lg/xl + --shadow; --ring;
radii: --radius-sm 4 / --radius 6 / --radius-lg 10 / --radius-xl 14;
fonts: --font-body (Manrope), --font-title/--font-display (Space Grotesk), --font-mono
(JetBrains Mono); motion: --ease-out, --ease-spring, --speed 140ms, --speed-slow 260ms;
control heights: --ctrl-h 34 / --ctrl-h-sm 28 / --ctrl-h-lg 40.

## 3. Typography rules
- Body 13.5px / 1.55 Manrope. Weights: 400/500 body, 600/700 emphasis, 800 rare display.
- Headings: Space Grotesk, tight (-0.02em). Page title 21px/700. Card/section title 14px/700.
- **Eyebrow** (the signature label): JetBrains Mono 10.5px, 700, uppercase, letter-spacing .14em,
  color var(--text-faint); `::before` = `"▪ "` in var(--primary).
- ALL numeric data (money, qty, dates in tables, IDs): `font-family: var(--font-mono)`,
  `font-variant-numeric: tabular-nums`. Money right-aligned.
- Never use Inter/Archivo/IBM Plex. Never letter-space body text.

## 4. Shape · depth · borders
- Corners: controls 6px, cards 10px, modals 14px, chips/tags 4px. NOTHING pill-shaped except
  avatars and toggle knobs.
- Depth = borders first. Cards: `border:1px solid var(--border); background:var(--surface);
  box-shadow:var(--shadow-sm)`. Hover-elevate only interactive cards: border-color
  var(--border-strong) + shadow-md + translateY(-1px).
- Popovers/menus: surface-raise + border + shadow-lg. Modals: shadow-xl + **2px top border in
  var(--primary)** (the "energized edge" — modal signature).
- Featured/hero cards MAY use corner brackets (see §8) — use sparingly (1 per page).

## 5. Interaction & motion
- Transition `var(--speed) var(--ease-out)` on color/border/background/shadow/transform.
- Focus visible: `outline: 2px solid var(--primary); outline-offset: 2px;`
- Hover on rows/list items: `color-mix(in srgb, var(--primary) 5%, transparent)` bg, NOT gray.
- Page/panel entry: reuse `hx-rise` / `hx-fade` keyframes from index.css.
- Always include a `@media (prefers-reduced-motion: reduce)` guard for new animations.

## 6. GLOBAL CLASSES — owned by index.css. Module CSS MUST NOT restyle these
(only extend under a module-specific parent selector when unavoidable):
`btn, btn-primary, btn-secondary, btn-ghost, btn-danger, btn-danger-outline, btn-outline, btn-sm,
btn-xs, btn-lg, btn-block, btn-icon, input, select, textarea, field, field label, checkbox, kbd,
chip, chip-success, chip-warn, chip-danger, chip-info, chip-neutral, chip-accent, chip-primary,
badge, mono, num, eyebrow, muted, error-text, success-text, section-note, empty-state-cell,
table-subtext, modal-backdrop, modal-card, modal-copy, modal-actions, ledger-modal,
ledger-modal-head, ledger-modal-body, ledger-modal-actions, page-head, page-head-icon,
page-head-copy, page-head-text, page-head-main, page-head-title, page-head-desc,
page-head-actions, page-toolbar, page-toolbar-actions, tabs-underline, tab-underline,
tab-underline--on, materials-table, materials-table-wrap, materials-table-toolbar,
materials-actions, materials-inline-actions, materials-card, add-item-card, add-item-card-head,
add-item-details-row, add-item-submit, panel, workspace-panel, page-animate, skeleton, spinner,
toast, hx-corners`.
What they look like (so module CSS harmonizes):
- **btn**: h 34px, radius 6, 700 weight 13px. primary = amber fill + ink text + glow hover;
  secondary = surface + border-strong; ghost = transparent → primary-soft hover; danger = red fill.
- **input/select**: h 34px, surface bg, 1px border, radius 6, focus = primary border + --ring.
  Labels: mono 10.5px 700 uppercase letterspaced text-faint.
- **materials-table** (THE shared data table): th mono 10px uppercase letterspaced text-faint on
  surface-soft with border-bottom border-strong; td 13px hairline border-soft rows; row hover
  amber 5% tint; .num cells mono right-aligned.
- **chip**: mono 10px 700 uppercase tag, 4px radius, square 6px dot ::before, tinted bg.
- **page-head**: 40px icon tile (primary-soft bg, primary-deep icon), Space Grotesk 21px title,
  13px soft desc, actions right, hairline bottom border.
- **modal-card**: radius 14, 2px amber top edge, shadow-xl, dark blurred backdrop.

## 7. Module CSS rules (for every styles/*.css)
1. Output = COMPLETE replacement of the assigned file. Header comment:
   `/* HELIOS — <module> module styles. Consumes tokens from index.css only. */`
2. Style EVERY class the JSX inventory contains that is not in the §6 global list. Missing
   classes = broken UI. Dynamic classes (`chip-${status}`, is-*, --on/--warn/--danger suffixes,
   " active", " is-open", template literals) count.
3. Old CSS may be consulted ONLY for a class's STRUCTURAL job (grid vs flex, hidden/open states,
   sticky, scroll containers, z-index layering, breakpoints) — the visual result must be HELIOS.
4. Spacing rhythm: 4/8/12/16/20/24/32. Card padding 16–20px. Section gaps 16–24px.
5. Breakpoints: keep every media query trigger the old file had; commonly 1200/900/640.
6. Dark theme: rely on tokens; `:root[data-theme="dark"]` overrides only where a token can't
   express it.
7. No `!important` unless overriding an inline style or third-party (FullCalendar) rule.
8. Scrollable regions: thin scrollbars come free from index.css — don't restyle.
9. KPI/stat values: Space Grotesk 700 22–26px OR mono 600 — captions = eyebrow style.
10. Status colors ONLY from tokens.

## 8. Signature details (make it unmistakably HELIOS)
- **Corner brackets** on ONE hero element per page: 14px L-corners, 2px var(--primary), at
  top-left (::before) and bottom-right (::after), positioned -1px. (`.hx-corners` exists in
  index.css — either apply that pattern or replicate scoped.)
- **Rail rule**: selected/active list rows get `box-shadow: inset 2px 0 0 var(--primary)`.
- **Readout**: label ▸ value pairs, mono value; dotted leaders
  (`border-bottom:1px dotted var(--border-strong)`) between label and value in summary lists.
- **Section divider**: `1px dashed var(--border)` with mono micro-label.
- Empty states: 1px dashed border-strong box, mono uppercase micro-title, ghost CTA.

## 9. Charts (recharts wrappers)
- Wrapper cards follow §4. Gridlines: var(--border-soft), dashed 3 3, horizontal only.
- Axis text 11px mono text-faint; no axis/tick lines. Series colors --chart-1..6 fixed order.
- Tooltips: surface-raise card, shadow-lg, mono values.

## 10. Hard bans
No gradients on text; no green/gold "ledger" identity; no Inter/Archivo; no pill buttons; no
soft-blur glassmorphism cards; no shadow colors other than black/amber-glow; no borderless
floating white cards; no centered page titles; no skeuomorphism; no emoji as icons.
