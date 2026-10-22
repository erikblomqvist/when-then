import { describe, expect, it } from 'vite-plus/test'
import { AiCallError, type AiAuditRecord, type AiDeps, type CreateMessage } from './ai'
import { translateCardText } from './ai-translate'

type Params = Parameters<CreateMessage>[0]
type Message = Awaited<ReturnType<CreateMessage>>

const reply = (text: string): Message =>
    ({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text, citations: null }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
            input_tokens: 400,
            output_tokens: 60,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
            server_tool_use: null,
            iterations: null,
        },
    }) as Message

function fakeDeps(answer: string) {
    const sent: Params[] = []
    const records: AiAuditRecord[] = []
    const deps: AiDeps = {
        createMessage: async (params) => {
            sent.push(params)
            return reply(answer)
        },
        ledger: { callsSince: async () => 0, record: async (record) => void records.push(record) },
    }
    return { deps, sent, records }
}

const card = {
    actorId: 'actor-1',
    cardId: 'card-1',
    english: 'The first made-up bridge opens',
    category: 'Events',
}

describe('translateCardText', () => {
    it('returns the text per locale asked for, trimmed', async () => {
        const { deps } = fakeDeps(
            '{"sv":" Den första påhittade bron öppnas ","nb":"Den første bro åpner"}',
        )
        const texts = await translateCardText(deps, { ...card, locales: ['sv', 'nb'] })
        expect(texts).toEqual({
            sv: 'Den första påhittade bron öppnas',
            nb: 'Den første bro åpner',
        })
    })

    it('sends only the card text, its category and the target locales, asking for JSON per locale', async () => {
        const { deps, sent } = fakeDeps('{"nb":"Den første bro åpner"}')
        await translateCardText(deps, { ...card, locales: ['nb'] })
        expect(sent).toHaveLength(1)
        expect(JSON.parse(sent[0].messages[0].content as string)).toEqual({
            english: 'The first made-up bridge opens',
            category: 'Events',
            locales: { nb: 'Norwegian (Bokmål)' },
        })
        expect(sent[0].output_config?.format).toEqual({
            type: 'json_schema',
            schema: {
                type: 'object',
                properties: { nb: { type: 'string' } },
                required: ['nb'],
                additionalProperties: false,
            },
        })
    })

    it('logs the call against the card as ai_translate with the locales', async () => {
        const { deps, records } = fakeDeps('{"sv":"Bron öppnas"}')
        await translateCardText(deps, { ...card, locales: ['sv'] })
        expect(records).toEqual([
            expect.objectContaining({
                action: 'ai_translate',
                entity: 'card',
                entityId: 'card-1',
                locale: 'sv',
                details: expect.objectContaining({ locales: ['sv'], outcome: 'ok' }),
            }),
        ])
    })

    it('fails clearly when the answer is not the text asked for', async () => {
        const { deps } = fakeDeps('{"sv":""}')
        await expect(translateCardText(deps, { ...card, locales: ['sv'] })).rejects.toBeInstanceOf(
            AiCallError,
        )
        const { deps: garbled } = fakeDeps('not json')
        await expect(
            translateCardText(garbled, { ...card, locales: ['sv'] }),
        ).rejects.toBeInstanceOf(AiCallError)
    })
})
