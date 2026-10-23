import { describe, expect, it } from 'vite-plus/test'
import { AiAnswerRejectedError, type AiAuditRecord, type CreateMessage } from './ai'
import { readCardsFromPhoto, type NearbyCard, type ReadPhotoDeps } from './ai-read-photo'

type Params = Parameters<CreateMessage>[0]
type Message = Awaited<ReturnType<CreateMessage>>

const reply = (answer: unknown): Message =>
    ({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5-5',
        content: [{ type: 'text', text: JSON.stringify(answer), citations: null }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
            input_tokens: 2000,
            output_tokens: 500,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
            server_tool_use: null,
            iterations: null,
        },
    }) as Message

function fakeDeps(answers: unknown[], nearby: NearbyCard[] = []) {
    const sent: Params[] = []
    const records: AiAuditRecord[] = []
    const askedYears: number[][] = []
    const deps: ReadPhotoDeps = {
        createMessage: async (params) => {
            sent.push(params)
            return reply(answers[sent.length - 1])
        },
        ledger: { callsSince: async () => 0, record: async (record) => void records.push(record) },
        findNearbyCards: async (years) => {
            askedYears.push(years)
            return nearby
        },
    }
    return { deps, sent, records, askedYears }
}

const input = {
    actorId: 'actor-1',
    requestKey: 'photo-1',
    image: { mediaType: 'image/jpeg' as const, base64: 'aGVsbG8=' },
    categories: [
        { id: 'cat-ships', name: 'Ships' },
        { id: 'cat-people', name: 'People' },
    ],
    usedColours: ['blue'],
}

const vasa = {
    source_language: 'sv',
    texts: { en: 'The Vasa sinks', sv: 'Vasa sjunker', nb: 'Vasa synker' },
    source_quote: 'Vasa sjönk 1628',
    date: { decade: null, year: 1628, month: 8, day: 10 },
    date_from_photo: true,
    difficulty: 2,
    country_specific: '',
    category: 'ships',
    new_category: null,
}

const telescope = {
    source_language: 'sv',
    texts: { en: 'Galileo builds a telescope', sv: 'Galileo bygger ett teleskop', nb: '' },
    source_quote: 'Galileo',
    date: { decade: null, year: 1609, month: null, day: null },
    date_from_photo: false,
    difficulty: 7,
    // Upper-cased and trimmed into a country code.
    country_specific: ' it ',
    category: '',
    new_category: {
        names: { en: 'Science', sv: 'Vetenskap', nb: 'Vitenskap' },
        icon: 'atom',
        colour: 'teal',
    },
}

describe('readCardsFromPhoto', () => {
    it('reads candidates, matching categories by name and suggesting a new one otherwise', async () => {
        const { deps, sent, records } = fakeDeps([{ message: '', cards: [vasa, telescope] }])
        const { candidates } = await readCardsFromPhoto(deps, input)

        expect(candidates).toEqual([
            {
                key: 0,
                sourceLocale: 'sv',
                texts: vasa.texts,
                sourceQuote: 'Vasa sjönk 1628',
                date: { decade: 1620, year: 1628, month: 8, day: 10 },
                dateFromPhoto: true,
                difficulty: 2,
                countrySpecific: null,
                categoryId: 'cat-ships',
                newCategory: null,
                duplicateOf: null,
            },
            {
                key: 1,
                sourceLocale: 'sv',
                texts: telescope.texts,
                sourceQuote: 'Galileo',
                date: { decade: 1600, year: 1609, month: null, day: null },
                dateFromPhoto: false,
                difficulty: null,
                countrySpecific: 'IT',
                categoryId: null,
                newCategory: telescope.new_category,
                duplicateOf: null,
            },
        ])
        // The image and the category names go to the model; one call, one audit row.
        const [content] = sent[0].messages[0].content as { type: string }[]
        expect(content.type).toBe('image')
        expect(sent).toHaveLength(1)
        expect(records).toMatchObject([
            { action: 'ai_read_photo', entity: 'photo', entityId: 'photo-1' },
        ])
    })

    it('asks about nearby cards only, and marks the repeats', async () => {
        const nearby = [{ id: 'card-9', text: 'The warship Vasa sinks', year: 1628, decade: 1620 }]
        const { deps, sent, records, askedYears } = fakeDeps(
            [
                { message: '', cards: [vasa, telescope] },
                {
                    duplicates: [
                        { index: 0, card_id: 'card-9' },
                        { index: 1, card_id: 'card-404' },
                    ],
                },
            ],
            nearby,
        )
        const { candidates } = await readCardsFromPhoto(deps, input)

        expect(askedYears).toEqual([[1628, 1609]])
        expect(JSON.parse(sent[1].messages[0].content as string).existing_cards).toEqual([
            { id: 'card-9', text: 'The warship Vasa sinks', year: 1628 },
        ])
        expect(candidates.map((candidate) => candidate.duplicateOf)).toEqual([
            { id: 'card-9', text: 'The warship Vasa sinks' },
            null,
        ])
        expect(records).toHaveLength(1)
        expect(records[0].details).toMatchObject({ calls: 2, candidates: 2, duplicates: 1 })
    })

    it('says why when the photo holds no card', async () => {
        const { deps, records } = fakeDeps([{ message: 'The photo is of a cat.', cards: [] }])
        await expect(readCardsFromPhoto(deps, input)).rejects.toThrow(
            new AiAnswerRejectedError('no_cards', 'The photo is of a cat.'),
        )
        expect(records[0].details).toMatchObject({ outcome: 'no_cards' })
    })
})
