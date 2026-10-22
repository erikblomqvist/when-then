import { describe, expect, it } from 'vite-plus/test'
import {
    AiCallError,
    AiRateLimitError,
    AiRefusedError,
    callModel,
    costOf,
    type AiAuditRecord,
    type AiLedger,
    type AiRequest,
    type CreateMessage,
} from './ai'

type Message = Awaited<ReturnType<CreateMessage>>

const message = (overrides: Partial<Message> = {}): Message =>
    ({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5-5',
        content: [{ type: 'text', text: '{"sv":"Hej"}', citations: null }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
            input_tokens: 1000,
            output_tokens: 500,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
            server_tool_use: null,
            iterations: null,
        },
        ...overrides,
    }) as Message

function fakeLedger(callsSoFar = 0) {
    const records: AiAuditRecord[] = []
    const asked: { actorId: string; since: Date }[] = []
    const ledger: AiLedger = {
        callsSince: async (actorId, since) => {
            asked.push({ actorId, since })
            return callsSoFar
        },
        record: async (record) => {
            records.push(record)
        },
    }
    return { ledger, records, asked }
}

const request: AiRequest = {
    actorId: 'actor-1',
    action: 'ai_translate',
    entity: 'card',
    entityId: 'card-1',
    params: { max_tokens: 1000, messages: [{ role: 'user', content: 'Hi' }] },
    details: { locales: ['sv'] },
}

describe('costOf', () => {
    it('prices input and output tokens at the model rate, in USD', () => {
        // Sonnet 5.5: $2 / $10 per million tokens.
        expect(costOf(message())).toBeCloseTo(0.002 + 0.005, 10)
    })

    it('prices cache reads and writes and web searches', () => {
        const priced = costOf(
            message({
                model: 'claude-sonnet-5-5',
                usage: {
                    ...message().usage,
                    input_tokens: 0,
                    output_tokens: 0,
                    cache_creation_input_tokens: 1_000_000,
                    cache_read_input_tokens: 1_000_000,
                    server_tool_use: { web_search_requests: 2, web_fetch_requests: 0 },
                } as Message['usage'],
            }),
        )
        // Sonnet 5.5: cache write $2.50, cache read $0.20 per million; search $0.01 each.
        expect(priced).toBeCloseTo(2.5 + 0.2 + 0.02, 10)
    })

    it('adds up every model that ran when a refusal fell back to another model', () => {
        const priced = costOf(
            message({
                usage: {
                    ...message().usage,
                    iterations: [
                        {
                            type: 'message',
                            model: 'claude-sonnet-5-5',
                            input_tokens: 1_000_000,
                            output_tokens: 0,
                            cache_creation_input_tokens: 0,
                            cache_read_input_tokens: 0,
                            cache_creation: null,
                        },
                        {
                            type: 'fallback_message',
                            model: 'claude-opus-4-8',
                            input_tokens: 1_000_000,
                            output_tokens: 0,
                            cache_creation_input_tokens: 0,
                            cache_read_input_tokens: 0,
                            cache_creation: null,
                        },
                    ],
                } as Message['usage'],
            }),
        )
        expect(priced).toBeCloseTo(2 + 5, 10)
    })

    it('is null for a model without a price, rather than a wrong number', () => {
        expect(costOf(message({ model: 'claude-unknown-9' }))).toBeNull()
    })
})

describe('callModel', () => {
    it('sends the pinned model with server-side refusal fallback and returns the reply', async () => {
        const sent: unknown[] = []
        const { ledger } = fakeLedger()
        const reply = await callModel(
            {
                createMessage: async (params) => {
                    sent.push(params)
                    return message()
                },
                ledger,
            },
            request,
        )
        expect(reply.content).toEqual(message().content)
        expect(sent).toEqual([
            expect.objectContaining({
                model: 'claude-sonnet-5-5',
                fallbacks: 'default',
                betas: ['server-side-fallback-2026-07-01'],
                max_tokens: 1000,
            }),
        ])
    })

    it('writes one audit row per call with the model, tokens and cost', async () => {
        const { ledger, records } = fakeLedger()
        await callModel({ createMessage: async () => message(), ledger }, request)
        expect(records).toEqual([
            {
                actorId: 'actor-1',
                entity: 'card',
                entityId: 'card-1',
                locale: null,
                action: 'ai_translate',
                details: {
                    outcome: 'ok',
                    model: 'claude-sonnet-5-5',
                    input_tokens: 1000,
                    output_tokens: 500,
                    cost_usd: 0.007,
                    locales: ['sv'],
                },
            },
        ])
    })

    it('refuses without calling the model once the person used up the window', async () => {
        const { ledger, records, asked } = fakeLedger(30)
        const now = new Date('2026-10-22T12:00:00Z')
        let called = false
        const call = callModel(
            {
                createMessage: async () => {
                    called = true
                    return message()
                },
                ledger,
                now: () => now,
                rateLimit: { calls: 30, windowMinutes: 10 },
            },
            request,
        )
        await expect(call).rejects.toBeInstanceOf(AiRateLimitError)
        expect(called).toBe(false)
        expect(records).toEqual([])
        expect(asked).toEqual([{ actorId: 'actor-1', since: new Date('2026-10-22T11:50:00Z') }])
    })

    it('logs a failed call and throws a clear error', async () => {
        const { ledger, records } = fakeLedger()
        const call = callModel(
            {
                createMessage: async () => {
                    throw new Error('Connection reset')
                },
                ledger,
            },
            request,
        )
        await expect(call).rejects.toBeInstanceOf(AiCallError)
        expect(records).toEqual([
            expect.objectContaining({
                action: 'ai_translate',
                details: expect.objectContaining({
                    outcome: 'failed',
                    error: 'Connection reset',
                    cost_usd: 0,
                }),
            }),
        ])
    })

    it('logs a refusal with its cost and throws', async () => {
        const { ledger, records } = fakeLedger()
        const call = callModel(
            {
                createMessage: async () => message({ stop_reason: 'refusal', content: [] }),
                ledger,
            },
            request,
        )
        await expect(call).rejects.toBeInstanceOf(AiRefusedError)
        expect(records).toEqual([
            expect.objectContaining({
                details: expect.objectContaining({ outcome: 'refused', cost_usd: 0.007 }),
            }),
        ])
    })
})
