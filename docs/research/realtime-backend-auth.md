# Realtime backend and auth for server-authoritative play

Research for issue #3. Sources checked on 2026-10-20; prices and limits are taken from each vendor's own pricing or docs page (linked inline). The decision itself is made in *Choose realtime backend and auth provider*.

## What the game needs (from the map's standing constraints)

- **Server-authoritative:** the server holds the deck and the year for every Card, validates placements on each Timeline, and sends each phone only its role's view (the Reader sees card text but not the year; nobody sees the year before placement).
- **Rooms of 2–10 phones**, same physical room, with rejoin-your-own-seat on reconnect.
- **The game is a pure state machine** that a scenario builder drives in Storybook and a `/scenario` route. Wherever the backend runs logic, that logic should be the same TypeScript module.
- **One auth service:** several admin accounts with roles and an audit log now, player accounts for highscores later. No player accounts in v1, so players join anonymously.
- SvelteKit (Svelte 5) on Vercel, friends-first hobby with free-tier costs.

## Short answer

| Rank | Option | Why |
|---|---|---|
| 1 | **Convex** (+ Better Auth through the Convex component) | Game logic runs as transactional TypeScript mutations; reactive queries run per caller, so per-role views fall out naturally; `convex-test` unit-tests the logic; has a first-party Svelte 5 client; free tier is ample. |
| 2 | **Supabase** (Postgres + Auth + Realtime Broadcast; logic in SvelteKit server routes on Vercel) | Most complete auth (roles through a JWT hook, anonymous sign-in, auth audit log) and a relational store for cards and admin. Server-authoritative play is possible but has more moving parts. Free projects pause after a week without activity. |
| 3 | **Cloudflare Durable Objects via PartyServer** (+ a separate auth/DB for admin) | The purest "authoritative room server": one single-threaded object per game holding state in memory and sending each socket its own view. Cheap with hibernation. But it is a second deploy target next to Vercel and has no auth or admin story of its own. |
| — | Firebase, Liveblocks, plain Vercel WebSockets | Not shortlisted (reasons below). |

## Per-candidate findings

### Convex

- **Trusted logic:** queries and mutations are TypeScript functions on the server. The database, query functions and clients are reactive, and "every client subscription gets updated simultaneously to the same snapshot of the database" ([Realtime](https://docs.convex.dev/realtime)). A query reads the caller's identity, so `getMyView(gameId)` can return the Reader's card text without the year and the active player's view without either. The year never leaves the server.
- **Presence and reconnect:** the `@convex-dev/presence` component tracks who's online with heartbeats and removes stale entries ([component page](https://www.convex.dev/components/presence)). Its documented interface is a `usePresence` React hook, so Svelte would need a thin wrapper or our own heartbeat mutation. Seat rejoin is a game-state concern either way.
- **SvelteKit:** `convex-svelte` is "the Convex client library for Svelte 5", lives in the Convex GitHub org, and supports SvelteKit SSR through `convexLoad` ([docs](https://docs.convex.dev/client/svelte)). The Convex backend is hosted by Convex; Vercel only serves the SvelteKit app.
- **Testability:** `convex-test` is a JS mock backend for Vitest, with `t.withIdentity`, `t.run` for seeding, and fake-timer control of scheduled functions. Its limits: error text, ID formats and size/time limits differ from production, and crons aren't run ([docs](https://docs.convex.dev/testing/convex-test)). A pure game state machine called from thin mutations stays testable without Convex at all.
- **Auth:** Convex supports Clerk, WorkOS AuthKit, Auth0, any OIDC provider, and its own Convex Auth. Convex Auth is "currently a beta feature" aimed at React/React Native ([docs](https://docs.convex.dev/auth)). The **Convex + Better Auth** component lists SvelteKit as a supported framework, plus the Anonymous plugin (for players). The admin plugin isn't in its no-schema-change list, so it needs the component's "Local Install" mode ([supported plugins](https://labs.convex.dev/better-auth/supported-plugins)). Better Auth's admin plugin gives roles, custom permissions, ban and impersonation, but **no audit log** ([admin plugin](https://www.better-auth.com/docs/plugins/admin)). We would write an `auditLog` table from admin mutations ourselves, which is simple because every admin write is already a mutation.
- **Cost** ([plans](https://www.convex.dev/pricing), [limits](https://docs.convex.dev/production/state/limits)): the Free/Starter tier gives 1M function calls/month, 0.5 GB DB, 1 GB DB I/O, 20 GB-hours of action compute, 1,000 concurrent sessions, and 1–6 developers. Free has hard caps; Starter is pay-as-you-go above them. Professional is **$25 per developer/month**. The docs don't mention pausing inactive projects.

### Supabase

- **Trusted logic:** Supabase has no room process. The authoritative path would be: a phone calls a SvelteKit server action or Edge Function → it validates against Postgres (deck and years in tables the client can't read) → it pushes views with Broadcast. The server can broadcast through the REST endpoint or with `realtime.send()` from SQL or triggers ([Broadcast](https://supabase.com/docs/guides/realtime/broadcast)). Per-role views mean **per-player private topics**, gated by RLS on `realtime.messages` using `realtime.topic()` and the JWT ([Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)). Policies are cached per connection until the JWT refreshes.
- **Reconnect:** Broadcast replay works only for database-sent messages on private channels: at most 25 messages, retained for about 3 days ([Broadcast](https://supabase.com/docs/guides/realtime/broadcast)). A rejoining phone should refetch its view anyway.
- **Limits** ([Realtime limits](https://supabase.com/docs/guides/realtime/limits)): Free gets 200 concurrent connections, 100 msg/s, 20 presence msg/s and 256 KB payloads. Pro gets 500 connections and 500 msg/s.
- **Auth:** this is the strongest of the options. Roles come from a `user_roles` table and a Custom Access Token hook that adds a `user_role` claim, enforced by an `authorize()` function in RLS ([RBAC guide](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac)). The auth audit log covers **only auth events** (sign-in, password changes, MFA, and so on), optionally copied to `auth.audit_log_entries` ([Audit logs](https://supabase.com/docs/guides/auth/audit-logs)). Admin content edits still need our own trigger-based audit table. Auth audit retention is 1 h on Free and 7 days on Pro ([pricing](https://supabase.com/pricing)).
- **Local dev:** the Supabase CLI runs the full stack in Docker, with an experimental Docker-free `supabase stack` mode ([local dev](https://supabase.com/docs/guides/local-development)). Game logic would live in SvelteKit/TS, but its persistence and authorization would be spread across SQL and RLS.
- **Cost** ([pricing](https://supabase.com/pricing)): Free is $0, with 2 active projects, 50k auth MAU, 2M realtime messages and 500k Edge Function invocations, and **projects pause after 1 week of inactivity**. Pro starts at $25/month and never pauses. Custom dashboard roles are Enterprise-only, but that concerns team access, not app roles.

### Cloudflare Durable Objects / PartyKit → PartyServer

- **PartyKit's hosted platform is shutting down:** "Deploys stop on 16 October and the platform shuts down on 23 October 2026" ([PartyKit docs](https://docs.partykit.io/)). Its successor is **PartyServer**: the same rooms and connections model as a plain Worker + Durable Objects in your own Cloudflare account, deployed with `wrangler`. It has `onBeforeConnect` for token checks, `getConnectionTags` and `getConnections(tag)` for per-role fan-out, and hibernation ([migration guide](https://docs.partykit.io/guides/migrate-to-partyserver/)).
- **Trusted logic:** one object per game is a natural authoritative actor. It holds the state machine and sends each socket its own view. WebSocket hibernation evicts idle objects but keeps clients connected, and per-socket attachments (≤16 KB) survive hibernation. **Code deploys disconnect all WebSockets** ([WebSockets best practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)), so reconnect handling is mandatory.
- **Cost** ([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)): Workers Free includes SQLite-backed DOs at 100k requests/day, 13k GB-s/day and 5 GB storage. Paid starts at $5/month minimum. Incoming WS messages bill at 20:1, and hibernated objects don't bill duration.
- **Gaps:** there is no auth, admin UI data store or audit log. The admin side would need a second service: Better Auth on D1 or Postgres, or Supabase for cards and admin, which makes two backends. It also adds a second platform next to Vercel.

### Not shortlisted

- **Firebase:** server-side logic needs Cloud Functions, which are "Not applicable" on Spark, so Blaze with a card is required from day one. RTDB Spark caps at 100 simultaneous connections ([pricing](https://firebase.google.com/pricing)). Presence via `onDisconnect` and `.info/connected` is excellent ([docs](https://firebase.google.com/docs/database/web/offline-capabilities)), but hiding answers requires splitting data across security-rule paths, and admin RBAC and audit would be custom work.
- **Liveblocks:** its model is client-collaborative storage with room-level permissions (`defaultAccesses` / `groupsAccesses` / `usersAccesses`, [auth docs](https://liveblocks.io/docs/authentication)), not a trusted game server with per-player views. It is capped at **10 connections per room** on Free and Pro ([pricing](https://liveblocks.io/pricing)), exactly our maximum with no headroom for a reconnecting duplicate tab.
- **Vercel Functions WebSockets:** available on all plans (public beta), but connections are pinned to an instance, close at max function duration, and reconnecting clients may land on another instance. Vercel says to keep rooms, presence and pub/sub in external storage such as Redis ([docs](https://vercel.com/docs/functions/websockets)). That means building the realtime layer ourselves.

## Key trade-offs

1. **Where the state machine runs.** Convex and DOs run our TS module next to the state. Supabase runs it in stateless Vercel functions that load and save Postgres rows on every action.
2. **Per-role views.** In Convex this is "query returns a view for the caller". In DOs it is "send per socket". In Supabase it means per-player private channels plus RLS policies.
3. **Auth and audit.** No candidate audits admin content edits out of the box; we write an audit table in every case. Supabase has the most mature roles and anonymous auth. Convex relies on Better Auth (the admin plugin needs Local Install). DOs need a separate auth service.
4. **Ops surface.** Convex means Vercel + Convex. Supabase means Vercel + Supabase, with pausing on Free. DOs mean Vercel + Cloudflare + an auth/DB service.
5. **Maturity risks.** These are the Convex Svelte client and Better Auth component (both young), Supabase Realtime Authorization policy caching, and the PartyKit shutdown (use PartyServer, not hosted PartyKit).

## Open questions for the decision ticket

- Whether to prototype a single turn (deal → place → steal) on Convex with `convex-svelte` to check the Svelte 5 ergonomics before committing.
- Whether admin role management needs anything beyond Better Auth's admin plugin, such as invites and per-category permissions.
