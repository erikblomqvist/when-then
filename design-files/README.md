# Timeline card game: design tokens and basic components

Extracted from the "När då då?" mobile prototype (a turn-based history card game where players place event cards on a timeline). This is a starting point for a design system, not a finished one.

## Files

| File | Purpose |
|---|---|
| `tokens.css` | All design tokens as CSS custom properties on `:root`, plus category scope classes. |
| `components.css` | Basic components. Depends on `tokens.css`. |
| `reference.html` | Visual reference of every component and state. Open it in a browser. |

Load order: Google Fonts, then `tokens.css`, then `components.css`.

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,400..900,0..100,0..1&family=Bricolage+Grotesque:opsz,wght@12..96,400..800&display=swap">
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="components.css">
```

## Token architecture

Tokens have two layers. Components must only reference the **semantic** layer (or category scope variables), never primitives directly, so themes can remap semantics without touching components. A few component rules still reference primitives for one-off tints; treat those as candidates for new semantic tokens.

1. **Primitives:** `--color-<ramp>-<step>`, `--font-family-*`, `--font-size-<px>`, `--font-weight-*`, `--space-<n>`, `--radius-*`, `--ease-*`, `--duration-*`.
2. **Semantic:** `--surface-*`, `--gradient-*`, `--text-on-<surface>-*`, `--border-*`, `--focus-ring*`, `--type-<role>-*`, `--shadow-*`.
3. **Category scopes:** `.cat-events`, `.cat-people`, `.cat-inventions`, `.cat-places` set `--cat` and `--cat-dark`.

### Color

All colors are OKLCH. Translucent variants use relative color syntax, for example `oklch(from var(--color-ink-900) l c h / 0.72)`. Browser baseline is Chrome/Edge 119+, Safari 16.4+ and Firefox 128+.

| Ramp | Use |
|---|---|
| `navy` 400–950 | Game table, deck back, dark buttons |
| `paper` 50–900 | Card faces, sheets, raised tiles, tile edges (800–900) |
| `ink` 600–950 | Text and marks on paper |
| `haze` 100–300 | Cool secondary text on the table |
| `coral-100` | Error text on the table |
| `red`, `blue`, `amber`, `green` (500, 700) | Category lacquer (500) and edge (700) |

The prototype used about 50 near-duplicate creams and navies. These were consolidated into the ramps above, so some surfaces differ from the source by 1–2% lightness.

There are two contexts: **on table** (dark navy, cream text) and **on paper** (cream, ink text). Text tokens are named for the surface they sit on.

### Typography

- **Fraunces** (variable serif) is used for display, headings, card questions, years, names and codes. It relies on the `SOFT` and `opsz` axes. Use the `--font-variation-*` presets: `soft-display`, `soft-text`, `soft-small`, and `numeral` (crisp, for years).
- **Bricolage Grotesque** is used for UI text: buttons, labels, captions and category names.
- Roles: `display` (88), `heading-1` (46), `heading-2` (28), `field` (21), `button` (16/19), `body` (16), `label` (14), `caption` (13). Each role has `-family`, `-size`, `-weight` and, where relevant, `-leading`, `-tracking` and `-variation` tokens.
- Use tabular lining numerals for years, scores and counts.

## Components

All classes use the `ui-` prefix and BEM naming (`ui-block__element--modifier`).

### Card (`.ui-card`)
Sized in `em`, with a base of 8em × 11.125em. Set the size with `.ui-card--sm|md|lg|xl` (11 / 12.5 / 15 / 17 px) or `--card-size`. Add a category class on the card or any ancestor.

The card has three faces, which are mutually exclusive inside `.ui-card__face`:

**Front (reader sees the question):**
```html
<div class="ui-card ui-card--glossy cat-events">
  <div class="ui-card__face">
    <span class="ui-card__symbol"><!-- category icon --></span>
    <div class="ui-card__question">Berlin Wall falls</div>
    <div class="ui-card__category">Events</div>
  </div>
</div>
```
**Hidden (guesser sees a sleeve):** replace the question and category with
```html
<div class="ui-card__sleeve"><div class="ui-card__mark">?</div><div class="ui-card__category">Events</div></div>
```
**Timeline (placed card, year is the hero):**
```html
<div class="ui-card ui-card--matte cat-people">
  <div class="ui-card__face ui-card__face--timeline">
    <div class="ui-stamp">Locked</div>
    <div class="ui-card__year">1492</div>
    <div class="ui-card__caption">Columbus reaches America</div>
  </div>
</div>
```
**Deck back:** `<div class="ui-card-back"><span class="ui-card-back__emblem"><b>?</b></span></div>`

| Modifier | Meaning |
|---|---|
| `--matte` | Locked / at rest. Flat lacquer, short shadow. |
| `--glossy` | Animated light sweep. Used on active and unsecured cards. |
| `--lifted` | Active card in hand. Deep shadow. |
| `--nudged` | Neighbor of the insertion gap, raised slightly. |
| `--unsecured` | Placed correctly but not locked. Cream rim plus wobble. Combine with `--wobble-1…4` (intensity grows with the number of unsecured cards) and `data-lean="left|right"` (alternate between neighbors). |

### Stamp (`.ui-stamp`)
A rubber-stamp label at the top of a timeline face. `.ui-stamp` is solid (Locked). `--dashed` is for Unsecured. `--animate-in` adds a stamp-down animation.

### Timeline (`.ui-timeline`)
A flex row of `.ui-timeline__slot` elements, each holding a card (defaults to md size) with a tick mark underneath. `.ui-timeline__gap` sits between slots as the insertion point and opens with `--selected`. `.ui-timeline__axis` holds the axis line, with `.ui-timeline__axis-label--start` / `--end` for "← Earlier" and "Later →". Wrap the timeline in `.ui-tray` for the inset background.

The prototype positions slots absolutely, with a drag offset and the row centered on the selected gap. This export is a static flex version. The drag, keyboard and centering behavior is JS and is not included.

### Buttons (`.ui-button`)
| Class | Use |
|---|---|
| `.ui-button` | Primary raised cream tile |
| `--ghost` | Secondary on the table (navy). Becomes an outline inside `.ui-sheet` and `.ui-panel`. |
| `--ink` | Dark emphasis. Turns brown inside `.ui-panel`. |
| `--lg` | 64px height, 19px text |
| `--block` | Full width |
| `.ui-icon-button` | 44px round, icon only. Combine with `.ui-button--ghost` and always add an `aria-label`. |
| `.ui-action-button` | 92px round game action (Lock, Place). Holds an icon, a label and an optional `.ui-action-button__count`. Combine with `.ui-button`. |

All buttons have pressed (`:active`), disabled and `:focus-visible` states.

### Inputs
- `.ui-input` is an inset paper text field in serif.
- `.ui-code-input` is a fixed-length code entry. It shows N `.ui-code-input__box` elements over one transparent `.ui-code-input__field`. The JS mirrors the field value into the boxes. Box states are `--empty` and `--next` (the next box gets a focus ring). Set the length with `--code-length` (default 4). `--sm` is the read-only display variant on paper.

### Chip and tabs
- `.ui-chip` is a pill on the table. `--active` gives the paper (selected) look. It also works on a `<button>`.
- `.ui-tabs` with `.ui-tab` is a segmented control on paper. The selected tab uses `aria-selected="true"` or `--selected`.

### Category
- `.ui-category-dot` is a 22px circle containing a category icon.
- `.ui-category-legend-item` is a square swatch with the category name.

### Player list
- `.ui-notepad` is lined paper with a slight tilt. It contains `.ui-notepad__header` and `.ui-player-row` elements.
- A `.ui-player-row` holds `__number`, then either `__name` or `__empty`, then a `.ui-role-tag`. The role tag hides itself when empty.
- `.ui-number-badge` is a round rank or order number. `--empty` is the outline version.

### Surfaces and text
- Surfaces: `.ui-table` (with optional grain), `.ui-tray`, `.ui-paper`, `.ui-sheet`, `.ui-panel`, `.ui-veil`.
- Text: `.ui-display`, `.ui-heading-1`, `.ui-heading-2`, `.ui-body`, `.ui-label`, `.ui-caption`, `.ui-error`.
- Motion helper: `.ui-float` adds a gentle hover bob.

All ambient animation is disabled under `prefers-reduced-motion: reduce`.

## Category mapping

| Class | Source category (Swedish) | Hue |
|---|---|---|
| `.cat-events` | Händelser | red |
| `.cat-people` | Personer | blue |
| `.cat-inventions` | Prylar (literally "gadgets", used for inventions such as the telephone and dynamite) | amber |
| `.cat-places` | Platser | green |

## Icons

Use [Lucide](https://lucide.dev). The components size any child `svg` through CSS, so Lucide icons drop straight in. The small category badges (`.ui-card__symbol` and `.ui-category-dot`) bump the stroke width to 2.75 so the icons stay legible at 12–15px.

Suggested starting set:

| Use | Lucide name |
|---|---|
| Events | `zap` |
| People | `user` |
| Inventions | `lightbulb` |
| Places | `map-pin` |
| Back | `chevron-left` |
| Close | `x` |
| Lock action | `lock` |
| Place action | `arrow-down-to-line` |
| View players' timelines | `users` |

`reference.html` loads the Lucide UMD build (pinned to 0.460.0) and renders `<i data-lucide="…">` placeholders. In an app, use the framework package instead, such as `lucide-react`.

## Table grain texture
Place this as the first child of `.ui-table`. Each instance needs a unique filter id.
```html
<svg class="ui-table__grain" aria-hidden="true"><filter id="ui-grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#ui-grain)"/></svg>
```

## Deviations from the source
- Component markup and copy are translated to English.
- The selected timeline gap indicator (dashed, pulsing) existed in the source CSS but was switched off. It is enabled here as an optional affordance.
- The unsecured wobble is parametrized with `--wobble-tilt` instead of eight separate keyframes.
- `ui-stamp-in` and `ui-breathe` are reconstructed, because their source keyframes were not part of the shared file.

## Not included (game-specific, build later)
- Phone frames and screen layouts.
- The title box-lid screen.
- The QR code.
- Deal, flip, drop, fall and lock choreography.
- Timeline drag and keyboard logic.
- Results ranking rows.
- All game state.
