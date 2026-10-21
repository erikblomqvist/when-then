# When Then?

A party game played in person, each player on their own phone, where players place historical statements on a growing personal timeline by guessing when they happened. See [`docs/brief.md`](docs/brief.md) for the product brief and [`GLOSSARY.md`](GLOSSARY.md) for the domain language.

## Stack

SvelteKit 3 with Svelte 5 and TypeScript, built with [Vite+](https://viteplus.dev/) (Vite 8, Vitest, Oxlint, Oxfmt) and deployed to Vercel with `@sveltejs/adapter-vercel`. Storybook 11 (prerelease, pinned) is the component workbench. Backend, auth and realtime are Supabase, see [ADR 0002](docs/adr/0002-supabase-with-game-logic-in-sveltekit.md). UI strings go through Paraglide JS, and the app is an installable PWA.

Install [Vite+](https://viteplus.dev/guide/) (`vp`). It reads the Node and pnpm versions pinned in `package.json#devEngines` and downloads them for you, so there is nothing else to install or switch. Change the pins with `vp env pin`.

```sh
vp install
vp dev                    # the app, http://localhost:5173
vpr storybook             # the component library, http://localhost:6006
vp check                  # format, lint and type checks (Oxfmt, Oxlint)
vpr check:svelte          # svelte-check, which vp check can't run
vp test                   # unit (Node) and component (Chromium) tests
vpr test:e2e              # Playwright against a production build
vpr test:db               # pgTAP tests in supabase/tests/ against the local stack
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

## Backend: Supabase

One hosted project, `when-then` in `eu-north-1`, serves production and previews; local development runs the Supabase CLI stack in Docker. Game logic lives in SvelteKit server routes, Postgres is storage, and the browser never touches tables directly ([ADR 0002](docs/adr/0002-supabase-with-game-logic-in-sveltekit.md)).

```sh
brew install supabase/tap/supabase   # the CLI, once (CI pins 2.109.1)
vpr db:start                         # local Postgres, Auth, Studio (http://127.0.0.1:54323)
                                     # then put the URL and keys it prints in .env.local
vpr db:reset                         # re-apply supabase/migrations and supabase/seed.sql
vpr db:types                         # regenerate src/lib/database.types.ts after a migration
vpr db:pull                          # copy production cards and categories into the local stack
vpr db:stop
```

- **Schema** is SQL in `supabase/migrations/`, written by hand (`supabase migration new <name>`). The *Migrate database* workflow runs `supabase db push` on every push to `main` that touches a migration. Nothing migrates from a laptop or from Vercel's build.
- **Config** for the local stack is `supabase/config.toml`, which mirrors the hosted project's auth settings (anonymous sign-in, Google provider, redirect allowlist, the access-token hook). After changing it, apply it to the hosted project with `supabase config push`.
- **Auth:** players sign in anonymously; admins sign in with Google and get a row in `user_roles`. The Custom Access Token hook puts that role in the JWT as `user_role`.
- **Clients:** `event.locals.supabase` (set in `src/hooks.server.ts`) acts as the visitor through the auth cookies; `supabaseService()` in `src/lib/server/supabase.ts` uses the secret key for server-side writes.
- **Environment variables:** declared, with descriptions, in [`src/env.ts`](src/env.ts); that is the only list of names. Locally they live in `.env.local`. Production and preview values are set by hand in Vercel's project settings (the Supabase integration could not be connected). Google sign-in on the *local* stack needs `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in `supabase/.env`, which the Supabase CLI reads for `supabase/config.toml`; anonymous sign-in works without them. Repo secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` and the variable `SUPABASE_PROJECT_REF` drive the workflows. The database password is in the owner's password manager.
- **Keep-alive:** the *Keep Supabase awake* workflow runs a query every three days so the Free project is not paused. GitHub disables schedules after 60 days without commits; re-enable it under Actions if that happens.

## Admin sign-in

`/admin` is for editors and admins, who sign in with Google. `src/hooks.server.ts` validates the session, reads the person's role from `user_roles` on each request, and turns away every `/admin` request (pages, form actions and endpoints) without at least `editor`: signed out goes to `/admin/sign-in`, signed in without a role to `/admin/no-access`. Admin-only work calls `requireRole(event, 'admin')` from `src/lib/server/guard.ts`, which answers editors with 403. A role granted, changed or revoked takes effect on the person's next request (the JWT's `user_role` claim lags up to an hour, so the guard does not rely on it). The service worker never caches `/admin`.

Admins manage roles on the People page (`/admin/people`): add an email with a role, and it attaches at that email's first Google sign-in (a trigger on `auth.users` moves the pending invite into `user_roles`; password sign-ups never pick one up). Someone who has already signed in with Google gets the role at once. Roles and invites can be changed or revoked; there is always at least one admin. The SQL functions in `supabase/migrations/20261023004500_people_and_role_invites.sql` enforce this and write every change to `role_audit`.

The admin accepts only sessions that signed in with Google (the JWT's `amr` claim says `oauth`); a password session counts as signed out unless Supabase is the local stack, where e2e signs in that way (`src/lib/server/sign-in-method.ts`). As defence in depth, disable the Email provider in the production Supabase dashboard (Authentication → Sign In / Providers → Email), and don't run `supabase config push` without checking it, since it would push the local `[auth.email]` settings, which keep email sign-up on for e2e.

### Seeding the first admin

Once, after the first admin has signed in with Google (they land on "no access"), run this in the Supabase dashboard's SQL editor; their next request lets them in. Later roles are managed on the People page.

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'first.admin@example.com'
on conflict (user_id) do update set role = excluded.role;
```

### Google OAuth for production (once, by the project owner)

1. **Google Cloud console** → APIs & Services → OAuth consent screen: user type *External*, app name "When Then? admin", support email, and the scopes `openid`, `email`, `profile`. Publish it (In production) so it is not limited to test users.
2. **Credentials** → Create credentials → OAuth client ID → *Web application*. Authorised JavaScript origins: `https://when-then-gamma.vercel.app`. Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback` (Supabase's callback, not the app's). For Google sign-in on the local stack, add `http://127.0.0.1:54321/auth/v1/callback` too.
3. **Supabase dashboard** → Authentication → Sign In / Providers → Google: enable, paste the client ID and secret, save. Locally, put the same pair in `supabase/.env` as `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` and restart the stack.
4. **Supabase dashboard** → Authentication → URL Configuration: Site URL `https://when-then-gamma.vercel.app`; Redirect URLs include `https://when-then-gamma.vercel.app/**` and `https://when-then-*-erikblomqvists-projects.vercel.app/**` (both are in `supabase/config.toml`, so `supabase config push` sets them too).
5. Check that the Custom Access Token hook is enabled (Authentication → Hooks → `public.custom_access_token_hook`), then seed the first admin as above.

### Signing in from tests

There is no test sign-in in the app. Playwright uses `signInAs(page, 'editor' | 'admin' | null, { email? })` from `src/lib/testing/e2e-auth.ts`: it creates a user on the **local** stack that looks like a first Google sign-in (so a pending invite for its email attaches) with the secret key, gives it the role, signs it in through `@supabase/ssr` and puts the auth cookies in the browser. It refuses any Supabase URL that is not `localhost` or `127.0.0.1`. `playwright.config.ts` loads `.env.local`; CI starts the stack and writes that file.

## Translations

UI strings are messages in `messages/<locale>.json` (English is the base; Swedish and Norwegian Bokmål follow), compiled by [Paraglide JS](https://paraglidejs.com/sveltekit) into typed functions under `src/lib/paraglide/` (generated, not committed). Use them as `m.key()` from `#lib/paraglide/messages.js`. The locale is per phone: cookie first, then the browser's languages, then English. It is never in the URL, because every phone opens the same join link. Card content is translated in the database, not here.

## PWA

`static/manifest.webmanifest` and `src/service-worker/` make the app installable and keep the build and static files cached. Install prompts, offline screens and iOS polish are still open on the map.

## Design system

Design tokens and the basic components live in the repo and are the contract between design and code:

- [`src/lib/styles/tokens.css`](src/lib/styles/tokens.css): all tokens as CSS custom properties.
- [`src/lib/styles/components.css`](src/lib/styles/components.css): the `ui-` component styles.
- [`src/lib/ui/`](src/lib/ui/): Svelte components wrapping those styles, each with stories. [`src/lib/ui/README.md`](src/lib/ui/README.md) explains the token architecture and the component inventory.

The matching Figma library is "When Then? design system"; the game flow is on the "When Then: flowchart" FigJam board. Both are linked from issue #10.

## Working on the repo

Issues are tracked in GitHub Issues. Agent instructions live in `CLAUDE.md` and `docs/agents/`.
