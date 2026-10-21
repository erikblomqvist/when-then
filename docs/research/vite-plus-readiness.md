# Vite+ readiness with SvelteKit, Storybook and oxlint

Research for [#5](https://github.com/erikblomqvist/when-then/issues/5). Checked on **2026-10-20** against official docs, release notes, the npm registry and upstream issue trackers.

**Question:** Can we use Vite+ (with pnpm and oxlint) today for a SvelteKit + Svelte 5 + TypeScript project with Storybook? This covers licensing, SvelteKit compatibility, Storybook, how much of a `.svelte` file oxlint covers, the PWA plugin and the Vercel adapter.

## TL;DR

- **Vite+ is ready.** It is stable (1.0 shipped 2026-09-28, latest is 1.3.0) and MIT-licensed. It works with pnpm, and `vp create svelte` wraps `sv create`.
- **The real constraint is SvelteKit 3, not Vite+.** SvelteKit 3.0 shipped on 2026-10-01 and moves the config into `vite.config.ts`. Stable Storybook (10.6.x) supports only SvelteKit 2; SvelteKit 3 support exists only in Storybook 11 alpha. `@vite-pwa/sveltekit` produces no service worker under SvelteKit 3.
- **oxlint lints only the `<script>` block of `.svelte` files.** Template linting is still unimplemented. `vp check` doesn't type-check `.svelte` templates, so `svelte-check` is still required as a separate task.
- **Recommendation:** Vite+ 1.3 with pnpm, SvelteKit 3, `adapter-vercel` 7 and Storybook 11 prerelease, pinned. Use SvelteKit's native service worker with a hand-written manifest instead of `@vite-pwa/sveltekit`. Add `svelte-check` as a `vp run` task. Skip ESLint for now. The fallback, if Storybook 11 alpha blocks us, is SvelteKit 2.70 with Storybook 10.6.3 (see [Options](#options)).

## 1. Vite+ status and licensing

| Fact | Source |
|---|---|
| Vite+ 1.0.0 was released 2026-09-28 ("first stable release"). The latest is v1.3.0 (16 Oct). Releases ship weekly. | [GitHub releases](https://github.com/voidzero-dev/vite-plus/releases), [1.0 announcement](https://voidzero.dev/posts/announcing-vite-plus-1-0) |
| "Free and open source under the MIT license." | [viteplus.dev](https://viteplus.dev/) |
| VoidZero is joining Cloudflare. The banner on the 1.0 post links to the details. | [1.0 announcement](https://voidzero.dev/posts/announcing-vite-plus-1-0) |
| 1.0 is described as "far from feature-complete". Remote cache, `vp release` and `vp docs` come later. | [1.0 announcement](https://voidzero.dev/posts/announcing-vite-plus-1-0) |
| It bundles Vite 8 (Rolldown), Vitest 5, Oxlint, Oxfmt, tsgolint (TypeScript Go type-aware lint and checks), tsdown and the Vite Task runner. It manages Node and the package manager (pnpm, npm, yarn, bun). | [viteplus.dev](https://viteplus.dev/), [guide](https://viteplus.dev/guide/) |
| `vite-plus@1.3.0` pins `oxlint=1.88.0`, `oxfmt=0.73.0`, `vitest 5.0.5` and `oxlint-tsgolint=7.0.2004`. It aliases `vite` to `npm:@voidzero-dev/vite-plus-core@1.3.0`. | `npm view vite-plus dependencies` |
| `vp migrate` keeps `vite` declarations but points them at the core alias through pnpm overrides (`vite@*`, `vitest@*`). It rewrites `vitest` imports to `vite-plus/test*`. | [Migration rules](https://viteplus.dev/guide/migrate-rules) |
| pnpm-specific fixes ship regularly (pnpm 11 `pm pkg` support, cache misses after reinstall). | [releases v1.2.0 and v1.3.0](https://github.com/voidzero-dev/vite-plus/releases) |

**Implication:** The `vite` alias means every Vite plugin we use (SvelteKit, Storybook's builder, PWA) runs against Vite+'s repackaged Vite 8. That is fine as long as each plugin supports Vite 8, which all of ours do (below).

## 2. SvelteKit compatibility

| Fact | Source |
|---|---|
| `vp create` lists `svelte`, described as "Svelte application (sv create)". | [vite-plus source](https://github.com/voidzero-dev/vite-plus/blob/main/packages/cli/src/create/bin.ts) |
| Svelte rough edges in Vite+ have been fixed: rune globals such as `$props` were flagged `no-undef` ([#1967](https://github.com/voidzero-dev/vite-plus/issues/1967), fixed). A stray `.svelte-kit` folder appeared from the LSP ([#1756](https://github.com/voidzero-dev/vite-plus/issues/1756), fixed). | GitHub issues |
| **SvelteKit 3.0.0 was released on 2026-10-01; 3.1.0 is `latest`.** It requires Vite ≥ 8.0.12, TypeScript ≥ 6, Svelte ≥ 5.57.1, `vite-plugin-svelte` 7 and Node ≥ 22.17. | `npm view @sveltejs/kit time`, [migration guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3) |
| SvelteKit 3 drops `svelte.config.js`; the config goes into the `sveltekit()` plugin in `vite.config.*`. This suits Vite+, where everything lives in one `vite.config.ts`. | [migration guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3) |
| SvelteKit 3 removes `$app/stores` (use `$app/state`) and `$service-worker` (use `$app/env` and `$app/manifest`). It registers the service worker as a module. | [migration guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3) |
| SvelteKit 2.70.3 (the last 2.x) also accepts Vite 8 (`vite: ... ^8.0.0`). | `npm view @sveltejs/kit@2.70.3 peerDependencies` |

## 3. Storybook for Svelte 5 under Vite+

| Fact | Source |
|---|---|
| Stable Storybook is 10.6.3 (released 2026-10-20). `next` is 11.0.0-alpha.7. | `npm view storybook dist-tags`, [releases](https://github.com/storybookjs/storybook/releases) |
| Vite 8 has been supported since Storybook 10.3. `@storybook/sveltekit@10.6.3` peers `vite ^5 to ^8` and `svelte ^5`. | [10.3 release](https://storybook.js.org/releases/10.3), npm |
| `addon-vitest` supports Vitest 5 as of **10.6.3** ([#36671](https://github.com/storybookjs/storybook/pull/36671)). That matters because Vite+ ships Vitest 5. Earlier Vite+ breakages with `@storybook/addon-vitest` imports are fixed ([#963](https://github.com/voidzero-dev/vite-plus/issues/963), [#1086](https://github.com/voidzero-dev/vite-plus/issues/1086)). | release notes, GitHub |
| **SvelteKit 3 support landed only on Storybook's `next` branch (11.x), and it drops SvelteKit 2** ([#36610](https://github.com/storybookjs/storybook/pull/36610), merged 2026-10-07). Storybook pins its own 10.x SvelteKit sandbox to SvelteKit 2 ([#36694](https://github.com/storybookjs/storybook/pull/36694)). | GitHub |
| In 11.x, Svelte CSF indexes stories without the Svelte config. Custom preprocessors don't run at index time, though `<style>` dialects still work through a fallback. | [#36610](https://github.com/storybookjs/storybook/pull/36610) |
| The SvelteKit framework mocks `$app/navigation`, `$app/forms` and `$app/state`, all experimental. `$env/*/private` and `$service-worker` are unsupported. | [Storybook SvelteKit docs (10.6)](https://storybook.js.org/docs/get-started/frameworks/sveltekit) |
| The Vitest addon works with the `sveltekit` framework and needs Playwright for browser mode. | [Vitest addon docs](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon) |

**Implication:** Storybook 10.6.3 with SvelteKit 2 works under Vite+ today. Storybook on SvelteKit 3 means running 11.0 alpha. Storybook is dev-only, so alpha risk never reaches production.

## 4. oxlint coverage of `.svelte` files

| Fact | Source |
|---|---|
| Oxlint lints "framework files (`.vue`, `.svelte`, `.astro`) by linting only their `<script>` blocks". | [Oxlint docs](https://oxc.rs/docs/guide/usage/linter.html) |
| The compatibility page says: "Vue, Svelte, … SvelteKit: No template linting yet." Oxfmt formats Svelte but needs `svelte/compiler` installed. | [oxc compatibility](https://oxc.rs/compatibility) |
| JS plugins (ESLint-compatible) are alpha. Framework file formats were "coming later this year" (as of March 2026). | [JS plugins alpha post](https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha) |
| Language plugins (Svelte and Vue templates) are still an open plan ([oxc#23207](https://github.com/oxc-project/oxc/issues/23207)). `languageOptions.parser` support, which `eslint-plugin-svelte` would need, is still open ([oxc#20373](https://github.com/oxc-project/oxc/issues/20373)). It "has been said to block the Svelte community from migrating to Oxlint". | GitHub |
| `vp check` runs Oxfmt, Oxlint and tsgolint type checks (with `typeAware` and `typeCheck` on). It does not mention `.svelte` type checking. | [vp check guide](https://viteplus.dev/guide/check), [lint guide](https://viteplus.dev/guide/lint) |
| A request to plug `svelte-check` into `vp check` was closed **not planned**. The maintainer suggests a `vp run` task instead. | [vite-plus#1722](https://github.com/voidzero-dev/vite-plus/issues/1722) |
| Svelte-specific false positives in oxlint are being fixed (`prefer-const` [#19470](https://github.com/oxc-project/oxc/issues/19470), `no-unassigned-vars` with `bind:this` [#26038](https://github.com/oxc-project/oxc/issues/26038)). | GitHub |

**What still needs other tools:**

- **Template type checks and Svelte compiler warnings, including a11y:** `svelte-check` (4.7.x). It is required and runs as a `vp run check:svelte` task in CI and pre-push.
- **Template lint rules** (`eslint-plugin-svelte` 3.x, for example `svelte/valid-compile`, `svelte/no-at-html-tags`): these need ESLint today. Most of what matters (compile errors, a11y) is already covered by `svelte-check`. **I recommend skipping ESLint** until oxlint gets language plugins.

## 5. PWA plugin

| Fact | Source |
|---|---|
| `vite-plugin-pwa@2.0.0` peers Vite 3 to 8. | npm |
| `@vite-pwa/sveltekit@1.1.0` peers `@sveltejs/kit ^1.3.1 \|\| ^2.0.1`, so not SvelteKit 3. | npm |
| With SvelteKit 3, `@vite-pwa/sveltekit` 1.1.0 "builds without errors but produces no service worker". The fix PR was closed because a proper fix "requires a lot of work at vite-plugin-pwa". The maintainer points to an in-progress v2 approach. | [vite-pwa/sveltekit#111](https://github.com/vite-pwa/sveltekit/pull/111) |

**Implication:** On SvelteKit 3, skip the plugin. SvelteKit's own `src/service-worker.ts`, now a module importing `$app/manifest`, plus a static `manifest.webmanifest` and icons covers an installable PWA with precaching. PWA specifics are an open item on the map anyway. On SvelteKit 2, `@vite-pwa/sveltekit` 1.1.0 works.

## 6. Vercel adapter

| Fact | Source |
|---|---|
| `@sveltejs/adapter-vercel@7.0.1` (latest) peers `@sveltejs/kit ^3.0.0-next.0`. 6.3.x is the SvelteKit 2 line. | npm |
| On SvelteKit 3, adapter-vercel drops the edge runtime. Skew protection can make passive update detection report false negatives. | [migration guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3) |
| Vite+ lists Vercel as a first-class platform. `vp build` runs the normal Vite build, so the adapter runs as usual. | [viteplus.dev](https://viteplus.dev/) |

The edge runtime matters if we planned to run realtime game logic on Vercel Edge Functions. That belongs to the backend ticket, but note it: on SvelteKit 3, SvelteKit server routes on Vercel run on Node only.

## Options

| | A: SvelteKit 3 (recommended) | B: SvelteKit 2 (fallback) |
|---|---|---|
| Vite+ 1.3 / pnpm | ✅ | ✅ |
| Config | All in `vite.config.ts` | `svelte.config.js` plus `vite.config.ts` |
| Storybook | 11.0 **alpha** (pinned) | 10.6.3 stable |
| PWA | Native SvelteKit service worker plus manual manifest | `@vite-pwa/sveltekit` 1.1 |
| Vercel | adapter-vercel 7 (no edge) | adapter-vercel 6.3 |
| Later cost | Bump Storybook to 11 stable | Full SvelteKit 3 migration (config move, `$app/stores`, service worker, adapter) plus Storybook 11 bump |

**Why A:** We're scaffolding from scratch, so starting on SvelteKit 2 means migrating majors before v1 even ships. The only alpha piece (Storybook) is dev-only, and the PWA plugin is easy to replace for our needs. Choose B if Storybook 11 alpha proves unworkable during scaffolding, for example if the SvelteKit mocks for `$app/state` or `addon-vitest` break.

## Recommended toolchain

- **Runtime and package manager:** Vite+ 1.3.x (`vp env`) pinning Node ≥ 22.17 and pnpm 10 or 11.
- **Framework:** SvelteKit 3.1, Svelte ≥ 5.57.1, TypeScript 6, scaffolded with `vp create svelte` (which runs `sv create`).
- **Dev, build and test:** `vp dev`, `vp build`, `vp test` (Vitest 5).
- **Format and lint:** `vp check` (Oxfmt with `svelte/compiler` installed, Oxlint with `typeAware` and `typeCheck`).
- **Svelte checks:** `vp run check:svelte`, which runs `svelte-kit sync && svelte-check`. It's needed in CI and the pre-push hook because `vp check` can't run it.
- **Storybook:** `@storybook/sveltekit` 11.0.0-alpha (exact pin) with `addon-vitest` and Svelte CSF, plus Playwright for browser tests.
- **PWA:** native `src/service-worker.ts` and `static/manifest.webmanifest`. No `@vite-pwa/sveltekit` for now.
- **Deploy:** `@sveltejs/adapter-vercel` 7 on the Node runtime.

## Gaps and watch items

1. **Storybook 11 is alpha.** Pin it exactly and re-check when it goes stable. Fallback is option B.
2. **No template linting in oxlint** ([oxc#23207](https://github.com/oxc-project/oxc/issues/23207)). Rely on `svelte-check` and revisit when language plugins ship.
3. **`vp check` isn't the whole check.** `svelte-check` is a separate task ([vite-plus#1722](https://github.com/voidzero-dev/vite-plus/issues/1722), not planned), so CI and hooks must call both.
4. **`@vite-pwa/sveltekit` doesn't work on SvelteKit 3** ([#111](https://github.com/vite-pwa/sveltekit/pull/111)). Write the service worker by hand or wait for v2.
5. **adapter-vercel 7 has no edge runtime.** Relevant to the backend and realtime decision.
6. **Vite+ moves fast**, with weekly minors. Its releases warn that new Oxlint and Oxfmt versions can fail `vp check` on code that passed before. Pin `vite-plus` and upgrade on purpose.
