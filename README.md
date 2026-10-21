# When Then?

A party game played in person, each player on their own phone, where players place historical statements on a growing personal timeline by guessing when they happened. See [`docs/brief.md`](docs/brief.md) for the product brief and [`GLOSSARY.md`](GLOSSARY.md) for the domain language.

## Stack

SvelteKit 3 with Svelte 5 and TypeScript, built with Vite 8 and deployed to Vercel with `@sveltejs/adapter-vercel`. Storybook 11 (prerelease, pinned) is the component workbench. Backend, auth and realtime are Supabase, see [ADR 0002](docs/adr/0002-supabase-with-game-logic-in-sveltekit.md); that part is not wired up yet.

Node 22.17 or later is required (`.nvmrc` points at 22). Use pnpm.

```sh
pnpm install
pnpm dev              # the app, http://localhost:5173
pnpm storybook        # the component library, http://localhost:6006
pnpm check            # svelte-check
pnpm build            # production build
pnpm build-storybook  # static Storybook in storybook-static/
```

## Design system

Design tokens and the basic components live in the repo and are the contract between design and code:

- [`src/lib/styles/tokens.css`](src/lib/styles/tokens.css): all tokens as CSS custom properties.
- [`src/lib/styles/components.css`](src/lib/styles/components.css): the `ui-` component styles.
- [`src/lib/ui/`](src/lib/ui/): Svelte components wrapping those styles, each with stories. [`src/lib/ui/README.md`](src/lib/ui/README.md) explains the token architecture and the component inventory.

The matching Figma library is "When Then? design system"; the game flow is on the "When Then: flowchart" FigJam board. Both are linked from issue #10.

## Working on the repo

Issues are tracked in GitHub Issues. Agent instructions live in `CLAUDE.md` and `docs/agents/`.
