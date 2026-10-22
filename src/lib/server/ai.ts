// Claude calls for the admin's AI help (translation #41, date suggestion #42), in one place:
// the pinned model, a per-person rate limit and one audit row per call with its cost.
//
//     const reply = await callModel(deps, {
//         actorId, action: 'ai_translate', entity: 'card', entityId: card.id,
//         params: { max_tokens, system, messages, output_config },
//         details: { locales },
//     })
//
// `deps` is `{ createMessage, ledger }`: the model client (`aiClient()` from `./ai-client`, a
// fake in tests) and where calls are counted and logged (`dbLedger(db)` from `./ai-ledger`).
// Server only: the key never leaves `ai-client.ts`.

import type {
    BetaMessage,
    MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { CardLocale } from '../cards/card'

/**
 * The model for every AI call. Pinned, so a change is a deliberate edit here together with
 * its row in `prices`. Claude Sonnet 5.5, as docs/research/ai-card-authoring.md recommends;
 * `claude-opus-5-5` (2x the token price) is the escalation if an eval shows Sonnet falling short.
 */
export const aiModel = 'claude-sonnet-5-5'

/** Sent with every call so a safety-classifier refusal is retried on another model server-side. */
const fallbackBeta = 'server-side-fallback-2026-07-01'

/** Sends one Messages request. `aiClient()` makes the real one; tests pass a fake. */
export type CreateMessage = (params: MessageCreateParamsNonStreaming) => Promise<BetaMessage>

/** What `callModel` writes to the audit log for each call (app-written row, see #43). */
export type AiAuditRecord = {
    actorId: string
    entity: string
    entityId: string
    locale: CardLocale | null
    action: string
    details: Record<string, unknown>
}

/** Where AI calls are counted (for the rate limit) and logged. `dbLedger` is the real one. */
export type AiLedger = {
    /** How many AI calls this person made since then (any `ai_*` action). */
    callsSince(actorId: string, since: Date): Promise<number>
    record(record: AiAuditRecord): Promise<void>
}

export type RateLimit = { calls: number; windowMinutes: number }

/** Per person, across all AI actions: cheap insurance against a runaway loop or a stuck key. */
export const defaultRateLimit: RateLimit = { calls: 60, windowMinutes: 10 }

export type AiDeps = {
    createMessage: CreateMessage
    ledger: AiLedger
    rateLimit?: RateLimit
    now?: () => Date
}

export type AiRequest = {
    actorId: string
    /** Audit action, `ai_<what>` (e.g. 'ai_translate', 'ai_suggest_date'). */
    action: `ai_${string}`
    entity: string
    entityId: string
    locale?: CardLocale | null
    /** The request without model, betas and fallbacks, which `callModel` sets. */
    params: Omit<MessageCreateParamsNonStreaming, 'model' | 'betas' | 'fallbacks'>
    /** Extra facts for the audit row (e.g. the locales asked for, sources). */
    details?: Record<string, unknown>
}

/** No key configured: AI help is switched off. */
export class AiUnavailableError extends Error {}

/** The person made too many AI calls recently. */
export class AiRateLimitError extends Error {
    constructor(readonly rateLimit: RateLimit) {
        super(
            `You've reached the AI limit of ${rateLimit.calls} requests per ${rateLimit.windowMinutes} minutes. Try again in a few minutes.`,
        )
    }
}

/** The call failed (network, API error, an answer we can't use). Already logged. */
export class AiCallError extends Error {}

/** The model declined (after the server-side fallback). Already logged. */
export class AiRefusedError extends AiCallError {}

type Price = { input: number; output: number; cacheWrite: number; cacheRead: number }

// USD per million tokens, Anthropic first-party rates (claude-api skill, cached 2026-10-06).
// Opus 4.8 is here because `fallbacks: 'default'` may route a refusal to it.
const prices: Record<string, Price> = {
    'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
    'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
    'claude-opus-5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
    'claude-opus-4-8': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
}
const webSearchPrice = 0.01

type TokenCounts = {
    model: string | null
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens: number | null
    cache_read_input_tokens: number | null
}

const priceOf = (counts: TokenCounts, model: string): number | null => {
    const price = prices[counts.model ?? model]
    if (!price) return null
    return (
        (counts.input_tokens * price.input +
            counts.output_tokens * price.output +
            (counts.cache_creation_input_tokens ?? 0) * price.cacheWrite +
            (counts.cache_read_input_tokens ?? 0) * price.cacheRead) /
        1_000_000
    )
}

/**
 * What a reply cost in USD: tokens at each model's rate (every model that ran, when a refusal
 * fell back), plus web searches. Null when a model has no price here.
 */
export function costOf(reply: BetaMessage): number | null {
    const { usage } = reply
    const runs: TokenCounts[] = usage.iterations?.length
        ? usage.iterations.map((run) => ({
              ...run,
              model: 'model' in run ? (run.model ?? null) : null,
          }))
        : [{ ...usage, model: reply.model }]
    let total = (usage.server_tool_use?.web_search_requests ?? 0) * webSearchPrice
    for (const run of runs) {
        const cost = priceOf(run, reply.model)
        if (cost === null) return null
        total += cost
    }
    // Whole micro-dollars: no float noise in the log.
    return Math.round(total * 1_000_000) / 1_000_000
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * How many more AI calls `actorId` may make right now. A bulk action takes this many at most,
 * so calls running side by side can't overshoot the limit.
 */
export async function aiAllowance(deps: AiDeps, actorId: string): Promise<number> {
    const rateLimit = deps.rateLimit ?? defaultRateLimit
    const now = deps.now?.() ?? new Date()
    const since = new Date(now.getTime() - rateLimit.windowMinutes * 60_000)
    return Math.max(0, rateLimit.calls - (await deps.ledger.callsSince(actorId, since)))
}

/**
 * Makes one Claude call for `actorId`: checks the rate limit (throws `AiRateLimitError`
 * without calling), sends the request with the pinned model and refusal fallback, and logs
 * an audit row with model, tokens and cost whatever happens. Returns the reply; throws
 * `AiRefusedError` on a refusal and `AiCallError` on a failure or a cut-off answer.
 */
export async function callModel(deps: AiDeps, request: AiRequest): Promise<BetaMessage> {
    if ((await aiAllowance(deps, request.actorId)) === 0) {
        throw new AiRateLimitError(deps.rateLimit ?? defaultRateLimit)
    }

    const record = (details: Record<string, unknown>) =>
        deps.ledger.record({
            actorId: request.actorId,
            entity: request.entity,
            entityId: request.entityId,
            locale: request.locale ?? null,
            action: request.action,
            details: { ...details, ...request.details },
        })

    let reply: BetaMessage
    try {
        reply = await deps.createMessage({
            ...request.params,
            model: aiModel,
            betas: [fallbackBeta],
            fallbacks: 'default',
        })
    } catch (error) {
        await record({ outcome: 'failed', model: aiModel, cost_usd: 0, error: errorMessage(error) })
        throw new AiCallError(`The AI request failed: ${errorMessage(error)}`, { cause: error })
    }

    const outcome =
        reply.stop_reason === 'refusal'
            ? 'refused'
            : reply.stop_reason === 'max_tokens'
              ? 'cut_off'
              : 'ok'
    await record({
        outcome,
        model: reply.model,
        input_tokens: reply.usage.input_tokens,
        output_tokens: reply.usage.output_tokens,
        cost_usd: costOf(reply),
    })
    if (outcome === 'refused') throw new AiRefusedError('The AI declined this request.')
    if (outcome === 'cut_off') throw new AiCallError('The AI answer was cut off.')
    return reply
}

/** The reply's text (structured output arrives as one text block). */
export const replyText = (reply: BetaMessage) =>
    reply.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('')
        .trim()
