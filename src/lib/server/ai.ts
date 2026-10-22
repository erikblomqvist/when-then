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
import type { AiAuditAction } from '../audit/actions'
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
    action: AiAuditAction
    details: Record<string, unknown>
}

/** Where AI calls are counted (for the rate limit) and logged. `dbLedger` is the real one. */
export type AiLedger = {
    /** How many AI calls this person made since then (any `ai_*` action). */
    callsSince(actorId: string, since: Date): Promise<number>
    /** Logs the call; may return the audit row's id (a later decision refers to it). */
    record(record: AiAuditRecord): Promise<number | void>
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
    action: AiAuditAction
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

/**
 * The answer came back but can't be used (e.g. it cites a source it never retrieved). Thrown
 * by a `runModel` step; logged with `outcome` and `details`, then rethrown.
 */
export class AiAnswerRejectedError extends AiCallError {
    constructor(
        readonly outcome: string,
        message: string,
        readonly details: Record<string, unknown> = {},
    ) {
        super(message)
    }
}

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

/** What a `runModel` step decides after each reply: call again, or stop with a result. */
export type AiStep<T> =
    | { next: AiRequest['params'] }
    | { done: T; /** Extra facts for the audit row. */ details?: Record<string, unknown> }

/** Most calls one `runModel` may make (tool rounds, `pause_turn` continuations). */
const maxCalls = 8

const sumCost = (replies: BetaMessage[]): number | null => {
    let total = 0
    for (const reply of replies) {
        const cost = costOf(reply)
        if (cost === null) return null
        total += cost
    }
    return Math.round(total * 1_000_000) / 1_000_000
}

/**
 * Runs a multi-call AI task as ONE audited request: checks the rate limit once (throws
 * `AiRateLimitError` without calling), sends `request.params`, then hands each reply to
 * `step`, which returns the next params (a tool round, a continuation) or the result. Logs a
 * single audit row with the summed tokens and cost whatever happens, and returns the result
 * with that row's id. Throws `AiRefusedError` on a refusal, `AiCallError` on a failure, a
 * cut-off answer or too many calls, and rethrows a step's `AiAnswerRejectedError`.
 */
export async function runModel<T>(
    deps: AiDeps,
    request: AiRequest,
    step: (reply: BetaMessage, round: number) => AiStep<T> | Promise<AiStep<T>>,
): Promise<{ value: T; auditId: number | null }> {
    if ((await aiAllowance(deps, request.actorId)) === 0) {
        throw new AiRateLimitError(deps.rateLimit ?? defaultRateLimit)
    }

    const replies: BetaMessage[] = []
    const record = async (outcome: string, details: Record<string, unknown> = {}) => {
        const id = await deps.ledger.record({
            actorId: request.actorId,
            entity: request.entity,
            entityId: request.entityId,
            locale: request.locale ?? null,
            action: request.action,
            details: {
                outcome,
                model: replies.at(-1)?.model ?? aiModel,
                ...(replies.length > 1 ? { calls: replies.length } : {}),
                ...(replies.length > 0
                    ? {
                          input_tokens: replies.reduce((sum, r) => sum + r.usage.input_tokens, 0),
                          output_tokens: replies.reduce((sum, r) => sum + r.usage.output_tokens, 0),
                      }
                    : {}),
                cost_usd: sumCost(replies),
                ...request.details,
                ...details,
            },
        })
        return typeof id === 'number' ? id : null
    }

    let params = request.params
    for (let round = 1; round <= maxCalls; round++) {
        let reply: BetaMessage
        try {
            reply = await deps.createMessage({
                ...params,
                model: aiModel,
                betas: [fallbackBeta],
                fallbacks: 'default',
            })
        } catch (error) {
            await record('failed', { error: errorMessage(error) })
            throw new AiCallError(`The AI request failed: ${errorMessage(error)}`, { cause: error })
        }
        replies.push(reply)
        if (reply.stop_reason === 'refusal') {
            await record('refused')
            throw new AiRefusedError('The AI declined this request.')
        }
        if (reply.stop_reason === 'max_tokens') {
            await record('cut_off')
            throw new AiCallError('The AI answer was cut off.')
        }

        let decision: AiStep<T>
        try {
            decision = await step(reply, round)
        } catch (error) {
            if (error instanceof AiAnswerRejectedError) {
                await record(error.outcome, { error: error.message, ...error.details })
                throw error
            }
            await record('failed', { error: errorMessage(error) })
            throw new AiCallError(`The AI answer could not be used: ${errorMessage(error)}`, {
                cause: error,
            })
        }
        if ('done' in decision) {
            return { value: decision.done, auditId: await record('ok', decision.details) }
        }
        params = decision.next
    }
    await record('too_many_steps')
    throw new AiCallError('The AI took too many steps to answer.')
}

/**
 * Makes one Claude call for `actorId` (`runModel` with a single call): rate limit, pinned
 * model and refusal fallback, one audit row with model, tokens and cost. Returns the reply;
 * throws `AiRefusedError` on a refusal and `AiCallError` on a failure or a cut-off answer.
 */
export async function callModel(deps: AiDeps, request: AiRequest): Promise<BetaMessage> {
    const { value } = await runModel(deps, request, (reply) => ({ done: reply }))
    return value
}

/** The reply's text (structured output arrives as one text block). */
export const replyText = (reply: BetaMessage) =>
    reply.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('')
        .trim()
