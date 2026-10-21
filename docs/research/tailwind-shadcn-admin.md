# Tailwind and shadcn-svelte under Vite+ for /admin

Research for [#33](https://github.com/erikblomqvist/when-then/issues/33). Checked on **2026-10-21/22** against the npm registry, official docs, upstream source and the local Vite+ docs (`node_modules/vite-plus/docs`), plus an empirical spike in a throwaway worktree. Only this file is committed, not the spike code.

**Question:** Does shadcn-svelte with Tailwind CSS v4 work in our stack (Vite+ 1.3 via `vp`, SvelteKit 3.1, Svelte 5, Storybook 11 alpha, Oxfmt/oxlint)? And can Tailwind be confined to `/admin`, so the game's `src/lib/styles/tokens.css` and `components.css` stay untouched?

## TL;DR

- **Yes, it works.** `@tailwindcss/vite` 4.3.3 runs unchanged under `vp dev` and `vp build` (Vite 8 on Rolldown). shadcn-svelte 1.7.0 `init` and `add` succeed and accept `#lib/...` aliases. `svelte-check` reports 0 errors, and Storybook still builds.
- **Scoping works per route.** A CSS entry imported only from `src/routes/admin/+layout.svelte` becomes its own chunk, linked only from the admin route nodes. The game's built CSS was **byte-identical** before and after (same file name and md5).
- **Three things must be handled:**
  1. **Variable collisions.** Tailwind's own theme variables (`--radius-md`, `--color-red-500`, `--font-weight-medium`, ...) share names with variables in `tokens.css`. The root layout loads `tokens.css` on every route, so the game values win on `/admin`. Fix: move the game CSS imports from `src/routes/+layout.svelte` into a `(game)` route-group layout, so the admin tree never loads them.
  2. **An oxlint type-aware false positive** on the generated `src/lib/components/ui/button/index.ts` (named exports from `<script module>`). Fix: add `src/lib/components/ui/**` to `lint.ignorePatterns`.
  3. **Formatter churn.** Generated files use tabs, double quotes and semicolons. `vp fmt` rewrites all of them (about 1000 diff lines for 4 components), and will again after each `shadcn-svelte add` or update. Acceptable: run `vp fmt` after each add.
- **Recommendation:** adopt Tailwind v4 + shadcn-svelte for `/admin`. Split out a `(game)` layout, use a scoped `source(none)` CSS entry, and add the lint ignore. The fallback, Bits UI styled with plain CSS, is viable but not needed.

## 1. Versions (npm registry, 2026-10-21)

| Package | Version | Relevant metadata |
|---|---|---|
| `tailwindcss` | 4.3.3 | |
| `@tailwindcss/vite` | 4.3.3 | peer `vite: ^5.2.0 \|\| ^6 \|\| ^7 \|\| ^8` |
| `shadcn-svelte` (CLI) | 1.7.0 | peer `svelte ^5.0.0` |
| `bits-ui` | 2.20.0 | peers `svelte ^5.33.0`, `@internationalized/date ^3.8.1` |
| `tailwind-variants` | 3.3.1 | peers `tailwindcss *`, `tailwind-merge >=3.0.0` |
| `tw-animate-css` | 1.4.0 | |
| `@lucide/svelte` | 1.61.0 | already a dependency |

Installed in the repo:
- `vite-plus` 1.3.0
- `@sveltejs/kit` 3.1.0
- `svelte` 5.57.2
- `@sveltejs/vite-plugin-svelte` 7.3.1

`vite` resolves through the catalog alias to `@voidzero-dev/vite-plus-core@1.3.0`. Its `bundledVersions` lists `vite 8.3.4` and `rolldown 1.2.14`, and it depends on `lightningcss` and `postcss`.

Sources: `npm view <pkg>` and `node_modules/*/package.json`. Run `npm view` outside the repo: inside it, npm fails with `EBADDEVENGINES` because `devEngines` names pnpm.

## 2. `@tailwindcss/vite` under Vite+

- **Plugins run as in plain Vite.** The Vite+ docs say "`vp dev`, `vp build`, and `vp preview` use the standard Vite configuration, including plugins" (`docs/config/build.md`). They also say "`vp build` runs the standard Vite production build ... the build pipeline and configuration model are the same as Vite ... Vite+ uses Vite 8 and Rolldown" (`docs/guide/build.md`). Nothing in the local docs mentions Tailwind or PostCSS.
- **`lazyPlugins` still loads them for real runs.** It skips plugin factories when only metadata is read (lint, fmt, check), but "the plugins still load whenever Vite actually runs, dev, build, test, preview" (`docs/guide/troubleshooting.md`).
- **Setup is the standard one.** Per the [Tailwind SvelteKit guide](https://tailwindcss.com/docs/installation/framework-guides/sveltekit): `import tailwindcss from '@tailwindcss/vite'`, with `tailwindcss()` first in the plugin list. Under `lazyPlugins` this passed `vp lint`. The `vite-plus/prefer-vite-plus-imports` rule doesn't flag it, because plugin packages are exempt (`docs/guide/migrate-rules.md`).

### Does the plugin process all CSS globally?

It *sees* every CSS module, but only *transforms* files that use Tailwind features. From `node_modules/@tailwindcss/vite/dist`:

- **Filter:** `include: [/\.css(?:\?.*)?$/, /&lang\.css/, /[?&]index=\d+\.css$/]`, excluding `/.vite/`, `?worker|sharedworker|raw|url` and `?commonjs-proxy`. Svelte `<style>` blocks (`&lang.css`) are included too.
- **Early return:** the plugin returns early when the compiled file uses none of these: `@apply`, JS plugin compat, `theme()`, utilities (`@import "tailwindcss"` or `@tailwind utilities`), or variants.
  ```js
  if (!(this.compiler.features & (b.AtApply | b.JsPluginCompat | b.ThemeFunction | b.Utilities | b.Variants))) return !1
  ```

So `tokens.css`, `components.css` and plain Svelte `<style>` blocks pass through untouched, which the identical output hashes confirm. A game component that used `@apply`, `theme()` or `@variant` would switch Tailwind on in that file, so keep those out of game code.

## 3. Scoping Tailwind to /admin

### Route-level CSS chunking (verified)

With `src/routes/admin/+layout.svelte` importing `./admin.css`:

- **Production build:** on the server, `nodes/2.js` (the admin layout) lists the Tailwind chunk in `stylesheets`. The root layout and game page nodes don't. On the client, the chunk is a dependency of the admin node only (`__vite__mapDeps`).
- **`vp preview`:** `/admin` links the root CSS and the Tailwind chunk. `/` links the root CSS and the game page CSS only.
- **`vp dev`:** CSS is inlined as `<style data-sveltekit>`. The Tailwind banner appears on `/admin` and not on `/`.
- **Game CSS before and after:** the root layout chunk `0.DOW6Nvld.css` (30587 B) kept the same name and md5. The game page CSS is byte-identical; only its number changed, because the admin layout took a node index.

### Caveat: client-side navigation

Vite's preload helper adds `<link>` tags and never removes them. Say a user visits `/admin` and then navigates client-side to a game route: Tailwind's CSS, preflight included, stays in the document. This is inferred from Vite's behaviour; it wasn't tested in a browser. To avoid it, put `data-sveltekit-reload` ([SvelteKit link options](https://svelte.dev/docs/kit/link-options)) on links between admin and game, or don't link from admin into the game at all. Players never load admin CSS.

### Limiting what Tailwind scans and emits

By default, Tailwind scans the whole project from the Vite root ([detecting classes](https://tailwindcss.com/docs/detecting-classes-in-source-files)). In the spike, it picked up stray words in game code (`flex`, `table`, `shadow`, ...) and emitted theme variables that `tokens.css` references. Scope the scan:

```css
@import "tailwindcss" source(none);
@source "./";
@source "../../lib/components/ui";
```

Tailwind chunk size:

| Setup | Size |
|---|---|
| Test page, whole-repo scan | 9.6 KB |
| Test page, scoped scan | 5.0 KB |
| Test page, scoped scan, no preflight | 0.9 KB |
| shadcn button, card, table and dialog | 32.4 KB (6.8 KB gzip) |

Preflight can be dropped by importing `tailwindcss/theme.css` and `tailwindcss/utilities.css` into layers without `tailwindcss/preflight.css` ([Preflight docs](https://tailwindcss.com/docs/preflight)). Keep it anyway: shadcn components assume preflight, and a separate admin tree has nothing to protect.

`prefix(tw)` is not viable, because shadcn components use unprefixed classes.

### Variable collisions (the real scoping issue)

shadcn's own variables (`--background`, `--primary`, `--border`, `--ring`, `--radius`, `--chart-*`, `--sidebar*`, ...) don't collide with `tokens.css`. **Tailwind's theme variables do.** Tailwind emits them under `:root, :host` in `@layer theme`. `tokens.css` is unlayered, so its values win whenever both load.

- **Whole-repo scan, 21 collisions:** `--color-{red,amber,green,blue}-{500,700}`, `--color-black`, `--color-white`, `--font-weight-{medium,semibold,bold,extrabold,black}` and `--radius-{xs,sm,md,lg,xl,2xl}`.
- **Scoped scan, 4 collisions:** `--color-black`, `--color-red-500`, `--font-weight-medium` and `--radius-md`. For example, the game's `--radius-md` is 12px, while Tailwind's is `calc(var(--radius) * .8)`. The shadcn button's `rounded-[min(var(--radius-md),8px)]` and `font-medium` would pick up the game values.

Today, `src/routes/+layout.svelte` imports `tokens.css` and `components.css`, so they load on `/admin` too.

**Fix:** move those imports into `src/routes/(game)/+layout.svelte`. Keep the admin routes outside that group (for example `src/routes/(admin)/admin/`), and keep CSS out of the root layout. Then neither stylesheet ever loads on the other side, and the collisions don't matter. Renaming the game's variables or overriding them in `@theme` would also work, but both are worse options.

## 4. shadcn-svelte CLI with SvelteKit 3 / Svelte 5

- **Version checks:** the CLI's preconditions check only the `svelte` and `tailwindcss` versions in `package.json`. Tailwind v4 + Svelte 5 is the "supported versions" path, and Tailwind 3 + Svelte 5 is "legacy" ([preconditions.ts](https://github.com/huntabyte/shadcn-svelte/blob/main/packages/cli/src/utils/preconditions.ts)). There is no SvelteKit version check, so SvelteKit 3 (config in `vite.config.ts`, no `svelte.config.js`) is not a blocker.
- **Aliases:** aliases resolve through tsconfig `paths`, and imports starting with `#` resolve through `package.json` `imports` ([resolve-imports.ts](https://github.com/huntabyte/shadcn-svelte/blob/main/packages/cli/src/utils/resolve-imports.ts)). Our `#lib/*` works. The spike used `#lib/components`, `#lib/utils`, `#lib/hooks` and `#lib/components/ui`.
- **`init` needs a human:** it requires a preset, and it asks for confirmation before rewriting the CSS file, even with flags. Piped stdin doesn't answer the prompt; the spike used `expect`. Run it once by hand in a terminal:
  ```
  vp dlx shadcn-svelte@1.7.0 init --base-color neutral --css src/routes/admin/admin.css \
    --lib-alias '#lib' --components-alias '#lib/components' --utils-alias '#lib/utils' \
    --hooks-alias '#lib/hooks' --ui-alias '#lib/components/ui'
  ```
  `add <components> --yes` is non-interactive, so agents can run it.
- **`init` overwrites the CSS file:** the docs warn it "will be overwritten" ([SvelteKit install](https://www.shadcn-svelte.com/docs/installation/sveltekit)). It also drops any `source()`, so re-apply the scoped header afterwards. The file it writes contains:
  - the imports `@import "tailwindcss"; @import "tw-animate-css"; @import "shadcn-svelte/tailwind.css"; @import "@fontsource-variable/inter";`
  - `@custom-variant dark`
  - `:root` and `.dark` variables
  - `@theme inline`
  - a `@layer base` with `body { @apply bg-background text-foreground }`, which is fine as long as only the admin tree loads it.
- **Generated utils:** 1.7.0 generates `src/lib/utils.ts` with `export { cn } from "cn"`. The `cn` package replaces clsx + tailwind-merge.
- **Added packages:** `tailwindcss`, `@tailwindcss/vite`, `shadcn-svelte`, `tailwind-variants`, `tw-animate-css`, `cn`, `@fontsource-variable/inter`, `bits-ui` and `@internationalized/date`.
- **Font weight:** the Inter preset adds about 218 KB of woff2 files, referenced only from the admin CSS. Drop the import if admin can use the system font.
- **Package manager:** use `vp add` / `vp install`, not a global pnpm. A global pnpm 10 rewrote the lockfile and dropped the pinned `@pnpm/exe@12.14.0` entries.

## 5. Formatter, linter, type check, Storybook

| Tool | Result | Action |
|---|---|---|
| Oxfmt (`vp fmt`) | Rewrites every generated file: tabs become 4 spaces, quotes and semicolons change, and `singleAttributePerLine` applies. Tailwind classes are not re-sorted. | Run `vp fmt` after each `add`, and accept diff noise on component updates. |
| oxlint type-aware (`vp check`) | 4 errors in `ui/button/index.ts`: `TS2614: Module '"*.svelte"' has no exported member 'ButtonProps'`, and the same for `ButtonSize`, `ButtonVariant` and `buttonVariants`. These are `<script module>` exports, which svelte-check accepts. Because `vp check` fails first, `vpr check` never reaches svelte-check. | Add `'src/lib/components/ui/**'` to `lint.ignorePatterns`. |
| svelte-check | `0 ERRORS 0 WARNINGS` (5785 files). Forced runes, `experimental.async` and the warning filter cause no problems. | None. |
| `vp test` | Passes. | None. |
| Storybook 11 alpha (`build-storybook`) | Builds in about 8 s. There is no Tailwind output, since no story imports `admin.css`. | Admin stories, if any, import `admin.css` in their decorator. |

With the lint ignore in place, `vpr check`, `vp build`, `vp test` and Storybook were all green. `vpr test:e2e` was not run.

## 6. Fallback: Bits UI with plain CSS

Bits UI is viable but not needed. It describes itself as "the headless components for Svelte" and ships no styling or resets. You style it through any of:
- `class` props
- stable `data-*` attributes, for example `[data-accordion-trigger][data-state="open"]`
- the `child` snippet, for scoped `<style>` blocks

Sources: [intro](https://bits-ui.com/docs/introduction), [styling](https://bits-ui.com/docs/styling). `bits-ui` 2.20.0 peers `svelte ^5.33.0`.

shadcn-svelte is built on Bits UI, so switching between the two later keeps the same behaviour layer. The cost of the fallback is hand-written CSS for every component, with no ready-made table or form styling.

## Recommended setup

1. Run `vp add -D tailwindcss @tailwindcss/vite`, then add `tailwindcss()` first in `lazyPlugins`.
2. Move the `tokens.css` and `components.css` imports from `src/routes/+layout.svelte` to a `(game)` group layout. Keep the admin routes outside that group.
3. Have `src/routes/admin/+layout.svelte` import `./admin.css`. Run `shadcn-svelte init` once by hand (command above), then re-apply the `source(none)` + `@source` header.
4. Add `src/lib/components/ui/**` to `lint.ignorePatterns`, and run `vp fmt` after every `shadcn-svelte add`.
5. Put `data-sveltekit-reload` on any link between admin and game.
