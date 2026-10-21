# AI assistance for card authoring

Research for [#7](https://github.com/erikblomqvist/when-then/issues/7). Researched 2026-10-20.

**Question:** How should the admin interface's AI assistance work for **suggesting a card's year (with a source link)** and **translating** cards? Covers model and provider, how to ground year suggestions, accuracy pitfalls, cost at a few thousand cards, and where the call runs.

**Scope (from the map's standing constraints, #2):** v1 AI in admin = suggest a year (with source link) + translate. Generating whole cards is later. The admin UI is a generic shadcn-style interface. Year correctness matters more than usual because v1 ships the *exact-year-locks* house rule: a wrong year on a card punishes a player who answered correctly.

## Recommendation (TL;DR)

1. **Provider/model:** Claude via the Anthropic API, using `claude-sonnet-5-5` for year suggestions and translation. `claude-opus-5-5` is the escalation option at 2x the token price. `claude-haiku-5-5` is a candidate for translation only, if an eval shows it holds quality.
2. **Grounding: Wikidata first, web search second.**
   - Step A: our server queries Wikidata (and the Wikipedia summary) for the card's subject. When a matching dated statement exists at year precision or better, that is the primary source.
   - Step B: when Wikidata has nothing usable, or the statement is a "first time X" or "launched in country Y" kind, Claude runs with the Anthropic **web search** server tool (`web_search_20260209`, `max_uses` around 3). The suggestion must cite a URL that Claude actually retrieved.
3. **Output contract:** Claude returns `{year, source_url, source_quote, interpretation, confidence, alternatives[]}` through a strict custom tool. Our server checks that `source_url` came from a Wikidata/Wikipedia lookup or a web search result in the same response. The admin always accepts or edits manually; nothing is auto-applied.
4. **Where it runs:** SvelteKit server endpoints behind admin auth on Vercel. `ANTHROPIC_API_KEY` lives in `$env/static/private`, and the browser never talks to Anthropic or Wikimedia directly.
5. **Cost:** roughly **$0.02–0.07 per year suggestion** and **~$0.003 per translation** on Sonnet 5.5. A 3,000-card library with two translations each comes to roughly **$85–205 one-off**. Bulk backfills via the Batch API halve the token part.

## 1. Model and provider

Current lineup and prices (Anthropic first-party, per million tokens) [pricing][pricing]:

| Model | ID | Input | Output | Batch in/out | Notes |
|---|---|---|---|---|---|
| Claude Opus 5.5 | `claude-opus-5-5` | $4 | $20 | $2 / $10 | Thinking can't be disabled. Default effort `medium` [models][models] |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2 | $10 | $1 / $5 | "Best combination of speed and intelligence" [models][models] |
| Claude Haiku 5.5 | `claude-haiku-5-5` | $0.10 (≤100k prompt) | $0.50 | $0.05 / $0.25 | "High-volume, latency-sensitive tasks such as classification, extraction, and routing" [haiku][haiku] |

All three have a reliable knowledge cutoff of **Jun 2026** [models][models]. That is fine for historical cards, but the model's memory alone is not an acceptable source: the ticket requires a source link.

**Why Sonnet 5.5 for year suggestions.** The work is judgement-heavy. It means interpreting an ambiguous statement, choosing between "first" and "most famous" events, and deciding whether a source actually supports the claim. It also uses web search with dynamic filtering, which needs Opus/Sonnet-class models [web-search][web-search]. Sonnet 5.5 is half Opus 5.5's token price. Opus 5.5 is the fallback if an eval on real cards shows Sonnet misreading statements.

**Haiku 5.5 caveat.** Its model page does not list web search support [haiku][haiku]. The Models API exposes `capabilities.server_tools.web_search.supported` to check this at runtime [models][models], but it was not checked here (no API key in this session). Treat Haiku as **translation-only** until that is checked.

**Model-specific API constraints to respect when implementing** (from the bundled claude-api skill, which tracks the API docs):
- Sonnet 5.5 rejects forced `tool_choice` (`any`/`tool`) with a 400. Use `tool_choice: auto` plus a prompt instruction and `strict: true` on the tool.
- Sonnet 5.5 rejects `thinking: {type: "disabled"}`. Leave adaptive thinking on and tune `output_config.effort` (start at `medium`/`low`).
- Sonnet 5.5 and Opus 5.5 code should send the server-side `fallbacks: "default"` parameter (beta `server-side-fallback-2026-07-01`) so a safety-classifier refusal falls back to another model instead of failing.

## 2. Grounding year suggestions

### 2a. Wikidata/Wikipedia (primary, free, structured)

- **Find the entity:** `action=wbsearchentities` with `search` and `language` (both required), `type` default `item`, `limit` up to 50 [wd-api-help][wd-api-help].
- **Read its dated statements:** `action=wbgetentities&ids=Q…&props=claims|sitelinks/urls`. Up to 50 ids per call, pipe-separated [wd-api-help][wd-api-help].
- **Useful date properties** [wd-dates][wd-dates]: P569 date of birth, P570 date of death, P571 inception, P577 publication date, P580 start time, P585 point in time.
- **Date precision** is explicit: `precision` 9 = year, 10 = month, 11 = day. 8 = decade and 7 = century [wd-dates][wd-dates]. **Only suggest a year when precision ≥ 9.** Below that, flag "source only gives decade/century".
- **Calendar/BCE:** dates before 1583 default to proleptic Julian. In JSON export 1 BCE is `-0001` (no year 0), while RDF/Query Service uses XSD where 1 BCE is year 0 [wd-dates][wd-dates]. Use the JSON API to avoid off-by-one BCE errors.
- Verified live: `wbgetentities&ids=Q937&props=claims` returns P569 `{"time":"+1879-03-14T00:00:00Z","precision":11,"calendarmodel":".../Q1985727"}` (Einstein, born 1879).
- **Wikipedia summary as the human-readable source link:** `GET https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}` returns `description`, `wikibase_item` (the Q-id) and `content_urls.desktop.page` (verified live for `Albert_Einstein` → `Q937`). Good for both the source link shown to the admin and the Wikipedia↔Wikidata bridge. It works for `sv.wikipedia.org` and `no.wikipedia.org` too.
- **Etiquette:** send a descriptive `User-Agent` with contact info (e.g. `WhenThen/1.0 (https://github.com/erikblomqvist/when-then; admin@…)`). Missing or generic agents "will fail with an HTTP 403" [wm-ua][wm-ua]. Make read requests in series, batch ids with `|`, use gzip, and back off on `ratelimited` [api-etiquette][api-etiquette]. A bulk backfill should send `maxlag`, since no user is waiting [api-etiquette][api-etiquette].

**Flow:** Claude (cheap call, or the same call via a custom tool) extracts `{subject, event_kind}` from the card text, for example "Albert Einstein is born" → subject *Albert Einstein*, property P569. Our server runs the Wikidata lookup and passes the dated statements plus the Wikipedia URL back to Claude, which judges whether they match the card's statement. This is ordinary tool use: define `lookup_wikidata` as a custom tool our server executes.

### 2b. Anthropic web search tool (fallback, paid)

- **Tool types:** `web_search_20250305` (basic), `web_search_20260209` (adds dynamic filtering, where Claude filters results in code before they reach context, reducing tokens), and `web_search_20260318` (adds `response_inclusion`) [web-search][web-search].
- **Parameters:** `max_uses`, `allowed_domains` *or* `blocked_domains` (not both), `user_location` [web-search][web-search]. "Simple factual queries typically use 1–3 searches" [web-search][web-search], so set `max_uses: 3`.
- **Citations are always on.** Each `web_search_result_location` carries `url`, `title`, and up to 150 chars of `cited_text`, and these fields don't count toward token usage [web-search][web-search]. This gives the source link and quote for free.
- **Org setting:** web search is on unless an admin disabled it in the Claude Console. If disabled, the request fails with a 400 [web-search][web-search].
- **Price:** **$10 per 1,000 searches** plus tokens, and search results count as input tokens. Failed searches aren't billed [web-search][web-search]. It also works through the Batch API at the same per-search price, but is throttled per org [web-search][web-search].
- **Errors come back as HTTP 200** with a `web_search_tool_result_error` (`max_uses_exceeded`, `too_many_requests`, …). Long turns may return `stop_reason: "pause_turn"`, so re-send to continue [web-search][web-search] [server-tools][server-tools].
- **Domain steering:** optionally `allowed_domains` with high-trust sites (wikipedia.org, britannica.com, ne.se, snl.no, national archives, olympics.com …). An allow-list may miss the best source for niche Nordic pop-culture cards, so start without one and review what gets cited.

### 2c. Getting structured output *and* citations

Structured outputs (`output_config.format`) are **incompatible with citations**. Enabling both returns a 400 [structured][structured]. So don't use `output_config.format` for the year call. Instead define a custom client tool `submit_year_suggestion` with `strict: true`:

```jsonc
{ "year": 1908,                        // integer, negative for BCE
  "source_url": "https://…",          // must appear in this response's search results or our Wikidata/Wikipedia lookup
  "source_quote": "…",                 // ≤ 150 chars
  "interpretation": "Reads 'first time in London' as the first London Games (1908), not 2012.",
  "confidence": "high|medium|low",
  "alternatives": [{ "year": 2012, "reason": "most famous / most recent London Games" }] }
```

Then **validate server-side:** reject or flag the suggestion if `source_url` is not among the URLs actually returned (`web_search_result.url`, citation `url`, or our lookup URLs). This is the main guard against a hallucinated source.

## 3. Accuracy pitfalls

| Pitfall | Example | Mitigation |
|---|---|---|
| **First vs. most famous/recent** | "The Summer Olympics is hosted in London for the first time" → 1908, though many players think of 2012 | Prompt rule: take the statement literally. Always return `alternatives` and show them to the admin, so they can reword the card if it is genuinely ambiguous. |
| **Which milestone?** Invented / patented / announced / released / reached Sweden | "The iPhone is launched" (announced Jan 2007, on sale Jun 2007, Sweden 2008) | `interpretation` field is mandatory. Suggest a card rewording when milestones fall in different years. |
| **Regional events** | "TV broadcasts start" differs per country | Nordic audience: prompt asks Claude to flag country-dependent statements and propose an explicit country in the text. |
| **Ranges and durations** | "World War II" | Flag. A card must name a point event ("WWII ends in Europe"). |
| **Low-precision sources** | Wikidata precision 8 (decade) or 7 (century) | Never suggest a single year. Return `confidence: low` with the reason. |
| **Conflicting sources** | Wikidata says 1950, a web page says 1951 | Show both. Lower confidence. The admin decides. |
| **BCE / calendar** | Ancient events, pre-1583 dates | Use Wikidata JSON (1 BCE = −1). Store year as a signed integer. Display "458 BCE"/"458 f.Kr." [wd-dates][wd-dates] |
| **Model memory without source** | Plausible but unsourced year | Server rejects any suggestion whose `source_url` wasn't retrieved in that request. |
| **Translation drifts the meaning** | Swedish wording implies a different milestone | Translate statement text only (the year is language-independent). Prompt says "keep the same event, tense and specificity". Admin reviews before publish. |

## 4. Translation

- No grounding needed. It is a plain Messages call: the source card text plus category name and a short style guide. Cards are present-tense, short, read aloud ("Albert Einstein is born" → "Albert Einstein föds"). It returns `{text}` per target language. Here `output_config.format` structured output *is* fine, because no citations are involved [structured][structured].
- Translate several languages in one call to save prompt overhead. v1 UI languages are sv and en. The brief adds Norwegian later.
- Store with a `machine_translated` flag and a `reviewed_by`/`reviewed_at` stamp. The data-model shape (one card with per-language texts vs. linked cards) belongs to the multilingual-cards hook on the map, not here. Either shape works with this flow.
- Model: Sonnet 5.5 by default. Haiku 5.5 is ~20x cheaper and worth an eval on 50 real cards. If it holds idiom and tense in sv/nb, switch.

## 5. Where the call runs

- **Server-only:** SvelteKit `+server.ts` endpoints (or form actions) under the admin route group, deployed as Vercel functions. Import the key from `$env/static/private`, so SvelteKit refuses to bundle it into client code. Wikidata/Wikipedia calls also run server-side so we control the User-Agent [wm-ua][wm-ua].
- **Authz:** only authenticated admin roles (map: "one auth service with roles for admins … audit log"). Write each AI suggestion to the audit log: model id, sources, accepted/edited.
- **Data sent to Anthropic:** only card text, category, and target language. No admin or player data. Cards are public historical facts.
- **Latency/UX:** a web-search turn takes several seconds. Use a "Suggest year" button with a spinner, or stream the response. Handle `pause_turn` with a capped continuation loop [server-tools][server-tools].
- **Rate limit** the endpoint per admin (cheap insurance against runaway cost).
- **Bulk backfill** (seeding thousands of cards) goes as a script or server job through the Message Batches API, which gives 50% off tokens [pricing][pricing], keyed by `custom_id` = card id. It is not part of the interactive admin path.

## 6. Cost estimate

Assumptions (estimates, not measured; re-check with real `usage` after the first 50 cards):
- **Wikidata path:** ~3k input, ~1k output (incl. thinking) tokens, 0 searches.
- **Web search path:** ~15k input (search results count as input), ~1.5k output, 2 searches.
- **Translation:** ~500 input, ~200 output per target language.

| Per card | Sonnet 5.5 | Opus 5.5 | Haiku 5.5 |
|---|---|---|---|
| Year, Wikidata path | 3k×$2 + 1k×$10 ≈ **$0.016** | ≈ $0.032 | n/a (judgement) |
| Year, web search path | 15k×$2 + 1.5k×$10 + 2×$0.01 ≈ **$0.065** | ≈ $0.11 | unverified support |
| Translation, per language | ≈ **$0.003** | ≈ $0.006 | ≈ **$0.00015** |

**3,000 cards, sv + en (one translation each), interactive pricing:**
- All via web search: ~$195 + ~$9 translation ≈ **~$205**
- 50/50 Wikidata/web: ~$120 + $9 ≈ **~$130**
- Mostly Wikidata (e.g. 80%): ~$75 + $9 ≈ **~$85**
- Batch API halves the token part (not the $10/1k searches), so a batched backfill lands around **$50–130**.

Net: authoring a few thousand cards costs **tens to low hundreds of USD in total**. Model choice and Wikidata hit rate matter more than per-call tuning.

## 7. Constraints to carry into *Admin interface scope*

1. AI suggestions are **advisory**: never auto-saved. The admin accepts, edits or rejects, and every card stores `source_url` and `source_quote` plus who verified it.
2. A year suggestion **must** carry a source URL that was retrieved in the same request. The server rejects anything else.
3. Show `interpretation`, `confidence` and `alternatives` in the UI. Ambiguity is a prompt to reword the card, not to pick a year silently.
4. Year stored as a signed integer (BCE negative). Precision below a year means no suggestion.
5. All AI and Wikimedia calls are server-side with admin auth, a private env key, a descriptive User-Agent, per-admin rate limiting, and an audit log entry.
6. Translation produces drafts flagged `machine_translated` until reviewed. The year never changes in translation.
7. Pin the model IDs (`claude-sonnet-5-5`) in config and re-check the price and capability table when upgrading.

## Open questions

- Does `claude-haiku-5-5` accept web search? Check `GET /v1/models/claude-haiku-5-5` → `capabilities.server_tools.web_search.supported` [models][models].
- Measure real token usage and Wikidata hit rate on ~50 representative cards (all four categories) before fixing the cost budget.
- Whether to keep a domain allow-list for web search. Decide after reviewing which sources get cited on a sample.

## Sources

- [pricing]: https://platform.claude.com/docs/en/about-claude/pricing (model, batch, web search and web fetch pricing)
- [models]: https://platform.claude.com/docs/en/models/overview (lineup, cutoffs, Models API capabilities)
- [haiku]: https://platform.claude.com/docs/en/models/haiku-5-5/overview
- [web-search]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
- [server-tools]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools (pause_turn, domain filtering, dynamic filtering, batch)
- [structured]: https://platform.claude.com/docs/en/build-with-claude/structured-outputs (feature compatibility: citations incompatible)
- [wd-api-help]: https://www.wikidata.org/w/api.php?action=help&modules=wbsearchentities|wbgetentities
- [wd-dates]: https://www.wikidata.org/wiki/Help:Dates
- [wm-ua]: https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy
- [api-etiquette]: https://www.mediawiki.org/wiki/API:Etiquette
- Live checks (2026-10-20): `https://en.wikipedia.org/api/rest_v1/page/summary/Albert_Einstein` and `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q937&props=claims&format=json`

[pricing]: https://platform.claude.com/docs/en/about-claude/pricing
[models]: https://platform.claude.com/docs/en/models/overview
[haiku]: https://platform.claude.com/docs/en/models/haiku-5-5/overview
[web-search]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
[server-tools]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools
[structured]: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
[wd-api-help]: https://www.wikidata.org/w/api.php?action=help&modules=wbsearchentities|wbgetentities
[wd-dates]: https://www.wikidata.org/wiki/Help:Dates
[wm-ua]: https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy
[api-etiquette]: https://www.mediawiki.org/wiki/API:Etiquette
