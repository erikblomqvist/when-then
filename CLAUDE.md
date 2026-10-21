## Tooling

Vite+ (`vp`) runs everything; see the README for setup. `vp <name>` is a built-in command and `vp run <name>` (or `vpr <name>`) a `package.json` script, and they can differ: `vp check` is format + lint + type check for `.ts`, while `vpr check` also runs `svelte-check`. Vite+ docs are local in `node_modules/vite-plus/docs`.

- Before handing work back: `vpr check` and `vp test`, plus `vpr test:e2e` for changes a user would see.
- Tests: `*.spec.ts` runs in Node, `*.svelte.spec.ts` in a real browser (Vitest browser mode), `*.e2e.ts` with Playwright.
- Code style is enforced by Oxfmt (`fmt` in `vite.config.ts`). Run `vp fmt`; don't hand-format.
- New dotfiles need a `!` entry in `.gitignore`, which overrides a global `.*` ignore.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for erikblomqvist/when-then, using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
