# Design tokens and basic components

Extracted from the "När då då?" mobile prototype and adapted to the glossary. A starting point for the design system, not a finished one. Run `vpr storybook` to browse every component and state.

## Files

| File | Purpose |
|---|---|
| `../styles/tokens.css` | All design tokens as CSS custom properties on `:root`, plus category scope classes. |
| `../styles/components.css` | The `ui-` component styles. Depends on `tokens.css`. |
| `*.svelte` | Svelte 5 components that render the `ui-` markup with typed props. |
| `*.stories.svelte` | Storybook stories (Svelte CSF). |

Load order: Google Fonts (in `src/app.html`), then `tokens.css`, then `components.css` (both imported in `src/routes/(game)/+layout.svelte`, never on `/admin`, and `.storybook/preview.ts`).

## Token architecture

Tokens have two layers. Components reference the **semantic** layer (or the category scope variables), never primitives directly, so a theme can remap semantics without touching components. A few component rules still reference primitives for one-off tints; treat those as candidates for new semantic tokens.

1. **Primitives:** `--color-<ramp>-<step>`, `--font-family-*`, `--font-size-<px>`, `--font-weight-*`, `--space-<n>`, `--radius-*`, `--ease-*`, `--duration-*`.
2. **Semantic:** `--surface-*`, `--gradient-*`, `--text-on-<surface>-*`, `--border-*`, `--focus-ring*`, `--type-<role>-*`, `--shadow-*`.
3. **Category scopes:** `.cat-events`, `.cat-people`, `.cat-inventions`, `.cat-places` set `--cat` and `--cat-dark`.

### Colour

All colours are OKLCH. Translucent variants use relative colour syntax, for example `oklch(from var(--color-ink-900) l c h / 0.72)`. Browser baseline is Chrome/Edge 119+, Safari 16.4+ and Firefox 128+.

| Ramp | Use |
|---|---|
| `navy` 400–950 | Game table, deck back, dark buttons |
| `paper` 50–900 | Card faces, sheets, raised tiles, tile edges (800–900) |
| `ink` 600–950 | Text and marks on paper |
| `haze` 100–300 | Cool secondary text on the table |
| `coral-100` | Error text on the table |
| `red`, `blue`, `amber`, `green` (500, 700) | Category lacquer (500) and edge (700) |

There are two contexts: **on table** (dark navy, cream text) and **on paper** (cream, ink text). Text tokens are named for the surface they sit on.

### Typography

- **Fraunces** (variable serif) for display, headings, card text, years, names and codes. It relies on the `SOFT` and `opsz` axes; use the `--font-variation-*` presets (`soft-display`, `soft-text`, `soft-small`, `numeral`).
- **Bricolage Grotesque** for UI text: buttons, labels, captions and category names.
- Roles: `display` (88), `heading-1` (46), `heading-2` (28), `field` (21), `button` (16/19), `body` (16), `label` (14), `caption` (13).
- Years, scores and counts use tabular lining numerals.

## Component inventory

Names follow the glossary: a card shows **card text** (not a question), a correctly placed card this turn is **Unlocked** (not unsecured), a player makes a **Play** (not a guess).

| Component | Glossary term | Notes |
|---|---|---|
| `Card` | Card, Timeline, Locked, Unlocked, Anchor year | Faces: `front` (reader), `sleeve` (everyone else), `timeline` (placed). `state` drives the stamp; `anchor` has none. |
| `CardBack` | Dealt | The deck. |
| `Stamp` | Locked, Unlocked | Solid or dashed rubber stamp. |
| `Timeline`, `TimelineSlot`, `TimelineGap` | Timeline, Play | Static flex layout. Drag, keyboard and centring are up to the game screen. |
| `Button`, `IconButton`, `ActionButton` | Lock in | Action buttons are the two game actions, Place and Lock in. |
| `Input`, `CodeInput` | Host, join | The code input is the play code, entry and read-only display. |
| `Chip`, `Tabs` | Category draw, Card language | Chips show the draw result; tabs pick settings on paper. |
| `CategoryDot`, `CategoryLegendItem`, `CategoryIcon` | Category | Lucide icons: zap, user, lightbulb, map-pin. |
| `Notepad`, `PlayerRow`, `NumberBadge`, `RoleTag` | Host, Reader | The lobby list and seating order. |
| `Surface` | | table, tray, paper, sheet, panel, veil. |
| `Text` | | The type roles. |

## Category mapping

| Class | Source category (Swedish) | Hue |
|---|---|---|
| `.cat-events` | Händelser | red |
| `.cat-people` | Personer | blue |
| `.cat-inventions` | Prylar | amber |
| `.cat-places` | Platser | green |

## Still in flux

- The component CSS is one global stylesheet; moving styles into each `.svelte` file is a later refactor.
- Deal, flip, drop, fall and lock choreography, and the timeline drag logic, are not here. They belong with the game screens.
- The title box-lid screen, QR code, results ranking rows and all game state are not included.
- All ambient animation is disabled under `prefers-reduced-motion: reduce`.
