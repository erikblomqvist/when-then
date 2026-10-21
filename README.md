# When Then?

A party game played in person, each player on their own phone, where players place historical statements on a growing personal timeline by guessing when they happened. See [`docs/brief.md`](docs/brief.md) for the product brief and [`GLOSSARY.md`](GLOSSARY.md) for the domain language.

## Stack

SvelteKit 3 with Svelte 5 and TypeScript, built with [Vite+](https://viteplus.dev/) (Vite 8, Vitest, Oxlint, Oxfmt) and deployed to Vercel with `@sveltejs/adapter-vercel`. Storybook 11 (prerelease, pinned) is the component workbench. Backend, auth and realtime are Supabase, see [ADR 0002](docs/adr/0002-supabase-with-game-logic-in-sveltekit.md); that part is not wired up yet.

Install [Vite+](https://viteplus.dev/guide/) (`vp`). It reads the Node and pnpm versions pinned in `package.json#devEngines` and downloads them for you, so there is nothing else to install or switch. Change the pins with `vp env pin`.

```sh
vp install
vp dev                    # the app, http://localhost:5173
vpr storybook             # the component library, http://localhost:6006
vp check                  # format, lint and type checks (Oxfmt, Oxlint)
vpr check:svelte          # svelte-check, which vp check can't run
vp test                   # unit (Node) and component (Chromium) tests
vpr test:e2e              # Playwright against a production build
vp build                  # production build
vpr build-storybook       # static Storybook in storybook-static/
```

`vpr check` runs both checks and `vpr test` runs all tests. Browser tests need Chromium once: `vp exec playwright install chromium`. A pre-commit hook runs `vp check --fix` on staged files, then `svelte-check`; it is installed by `vp install`.

### Dependencies

Manage packages through `vp`, not `pnpm` or `npm` directly. `vp` always runs the pinned pnpm, while a plain `pnpm` may be a different version on someone else's machine.

```sh
vp install                # after cloning or pulling
vp add <pkg>              # add a dependency (-D for a dev dependency)
vp remove <pkg>
vp outdated               # what's behind
vp update                 # update within the ranges in package.json
vp dlx <pkg>              # run a package binary without installing it (instead of npx)
vp pm <command>           # anything else, passed straight to pnpm
```

`vite`, `vitest`, `vite-plus` and `@vitest/browser-playwright` are versioned in the `catalog` in [`pnpm-workspace.yaml`](pnpm-workspace.yaml), not in `package.json`, because they move together with Vite+ (`vite` is an alias for Vite+'s own core). Upgrade them by changing the catalog versions and running `vp install`. `vp upgrade` only updates the global `vp` CLI, not the project.

If an upgrade leaves odd type errors around Vite or Vitest, pnpm has probably kept two copies of the same package. Delete `node_modules` and `pnpm-lock.yaml` and run `vp install` again.

## Design system

Design tokens and the basic components live in the repo and are the contract between design and code:

- [`src/lib/styles/tokens.css`](src/lib/styles/tokens.css): all tokens as CSS custom properties.
- [`src/lib/styles/components.css`](src/lib/styles/components.css): the `ui-` component styles.
- [`src/lib/ui/`](src/lib/ui/): Svelte components wrapping those styles, each with stories. [`src/lib/ui/README.md`](src/lib/ui/README.md) explains the token architecture and the component inventory.

The matching Figma library is "When Then? design system"; the game flow is on the "When Then: flowchart" FigJam board. Both are linked from issue #10.

## Working on the repo

Issues are tracked in GitHub Issues. Agent instructions live in `CLAUDE.md` and `docs/agents/`.
