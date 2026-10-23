import { describe, expect, it } from 'vite-plus/test'
import { AiAnswerRejectedError, type AiAuditRecord, type CreateMessage } from './ai'
import { isRetrieved, sourcesIn, suggestCardDate, type SuggestDateDeps } from './ai-suggest-date'
import type { WikidataLookup } from './wikidata'

type Params = Parameters<CreateMessage>[0]
type Message = Awaited<ReturnType<CreateMessage>>
type Block = Message['content'][number]

const reply = (content: unknown[], stop_reason: Message['stop_reason'] = 'end_turn'): Message =>
    ({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5-5',
        content: content as Block[],
        stop_reason,
        stop_sequence: null,
        usage: {
            input_tokens: 1000,
            output_tokens: 200,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
            server_tool_use: null,
            iterations: null,
        },
    }) as Message

const text = (value: string, citations: unknown[] | null = null) => ({
    type: 'text',
    text: value,
    citations,
})
const toolUse = (name: string, input: unknown, id = `toolu_${name}`) => ({
    type: 'tool_use',
    id,
    name,
    input,
})
const searchResult = (...urls: string[]) => ({
    type: 'web_search_tool_result',
    tool_use_id: 'srvtoolu_1',
    content: urls.map((url) => ({
        type: 'web_search_result',
        url,
        title: 'A page',
        encrypted_content: 'x',
        page_age: null,
    })),
})

const submission = (overrides: Record<string, unknown> = {}) => ({
    year: 1908,
    source_url: 'https://en.wikipedia.org/wiki/1908_Summer_Olympics',
    source_quote: 'point in time: 1908',
    interpretation: 'The first Olympic Games held in London.',
    confidence: 'high',
    alternatives: [
        { year: 2012, reason: 'The best-known London Games.', source_url: '', source_quote: '' },
    ],
    ...overrides,
})

const olympics: WikidataLookup = {
    items: [
        {
            id: 'Q8111',
            label: '1908 Summer Olympics',
            description: 'Games of the IV Olympiad',
            wikidataUrl: 'https://www.wikidata.org/wiki/Q8111',
            wikipediaUrl: 'https://en.wikipedia.org/wiki/1908_Summer_Olympics',
            statements: [
                {
                    property: 'P585',
                    label: 'point in time',
                    year: 1908,
                    month: null,
                    day: null,
                    precision: 'year',
                    quote: 'point in time: 1908',
                },
            ],
        },
    ],
    urls: [
        'https://www.wikidata.org/wiki/Q8111',
        'https://en.wikipedia.org/wiki/1908_Summer_Olympics',
    ],
}

/** A fake model answering each request in turn, and a fake Wikidata. */
function fakeDeps(answers: Message[], lookup: WikidataLookup = olympics) {
    const sent: Params[] = []
    const looked: string[] = []
    const records: AiAuditRecord[] = []
    const deps: SuggestDateDeps = {
        createMessage: async (params) => {
            sent.push(structuredClone(params))
            const answer = answers.shift()
            if (!answer) throw new Error('No more answers')
            return answer
        },
        ledger: {
            callsSince: async () => 0,
            record: async (record) => {
                records.push(record)
                return 7
            },
        },
        lookupWikidata: async (subject) => {
            looked.push(subject)
            return lookup
        },
    }
    return { deps, sent, looked, records }
}

const card = {
    actorId: 'actor-1',
    entity: 'card' as const,
    entityId: 'card-1',
    english: 'The Summer Olympics is hosted in London for the first time',
    category: 'Events',
}

const toolNames = (params: Params) =>
    (params.tools ?? []).map((tool) => ('name' in tool ? tool.name : ''))

describe('source validation', () => {
    it('collects the web search results and cited pages of a reply', () => {
        const message = reply([
            searchResult('https://example.com/a', 'https://example.com/b'),
            text('London hosted the Games in 1908.', [
                {
                    type: 'web_search_result_location',
                    url: 'https://example.com/c',
                    title: 'C',
                    cited_text: 'London 1908',
                    encrypted_index: 'x',
                },
            ]),
            {
                type: 'web_search_tool_result',
                tool_use_id: 's2',
                content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' },
            },
        ])
        expect(sourcesIn(message)).toEqual([
            'https://example.com/a',
            'https://example.com/b',
            'https://example.com/c',
        ])
    })

    it('accepts a URL that was retrieved, ignoring a trailing slash, fragment and host case', () => {
        const retrieved = ['https://en.wikipedia.org/wiki/London/', 'https://Example.com/page']
        expect(isRetrieved('https://en.wikipedia.org/wiki/London', retrieved)).toBe(true)
        expect(isRetrieved('https://en.wikipedia.org/wiki/London#History', retrieved)).toBe(true)
        expect(isRetrieved('https://example.com/page', retrieved)).toBe(true)
    })

    it('rejects a URL that was not retrieved, or is not a web URL', () => {
        const retrieved = ['https://en.wikipedia.org/wiki/London']
        expect(isRetrieved('https://en.wikipedia.org/wiki/Paris', retrieved)).toBe(false)
        expect(isRetrieved('https://en.wikipedia.org/wiki/London?x=1', retrieved)).toBe(false)
        expect(isRetrieved('not a url', ['not a url'])).toBe(false)
        expect(isRetrieved('javascript:alert(1)', ['javascript:alert(1)'])).toBe(false)
    })
})

describe('suggestCardDate', () => {
    it('tries Wikidata first and returns a suggestion sourced from it, logged once with its cost', async () => {
        const { deps, sent, looked, records } = fakeDeps([
            reply([toolUse('lookup_wikidata', { subject: '1908 Summer Olympics' })], 'tool_use'),
            reply([toolUse('submit_year_suggestion', submission())], 'tool_use'),
        ])

        const { suggestion, requestId } = await suggestCardDate(deps, card)

        expect(suggestion).toEqual({
            year: 1908,
            sourceUrl: 'https://en.wikipedia.org/wiki/1908_Summer_Olympics',
            sourceQuote: 'point in time: 1908',
            interpretation: 'The first Olympic Games held in London.',
            confidence: 'high',
            alternatives: [
                {
                    year: 2012,
                    reason: 'The best-known London Games.',
                    sourceUrl: null,
                    sourceQuote: null,
                },
            ],
            via: 'wikidata',
        })
        expect(requestId).toBe(7)
        expect(looked).toEqual(['1908 Summer Olympics'])
        // No web search while Wikidata is being tried.
        expect(sent.map(toolNames)).toEqual([
            ['lookup_wikidata', 'submit_year_suggestion'],
            ['lookup_wikidata', 'submit_year_suggestion'],
        ])
        expect(sent[0].tools).toContainEqual(
            expect.objectContaining({ name: 'submit_year_suggestion', strict: true }),
        )
        expect(sent[0].tool_choice).toEqual({ type: 'auto' })
        expect(JSON.stringify(sent[0].messages)).toContain(card.english)
        // The lookup went back to the model as the tool result.
        expect(JSON.stringify(sent[1].messages.at(-1))).toContain('Q8111')
        expect(records).toEqual([
            {
                actorId: 'actor-1',
                entity: 'card',
                entityId: 'card-1',
                locale: null,
                action: 'ai_suggest_date',
                details: expect.objectContaining({
                    outcome: 'ok',
                    calls: 2,
                    cost_usd: 0.008,
                    via: 'wikidata',
                    year: 1908,
                    source_url: 'https://en.wikipedia.org/wiki/1908_Summer_Olympics',
                    sources: olympics.urls,
                }),
            },
        ])
    })

    it('falls back to web search when Wikidata has nothing usable', async () => {
        const { deps, sent } = fakeDeps(
            [
                reply([toolUse('lookup_wikidata', { subject: 'made-up thing' })], 'tool_use'),
                reply([text('Wikidata has no dated statement for this.')]),
                reply(
                    [
                        {
                            type: 'server_tool_use',
                            id: 'srvtoolu_1',
                            name: 'web_search',
                            input: { query: 'x' },
                        },
                        searchResult('https://example.com/history'),
                        toolUse(
                            'submit_year_suggestion',
                            submission({
                                year: 1923,
                                source_url: 'https://example.com/history',
                                source_quote: 'It opened in 1923.',
                                alternatives: [],
                            }),
                        ),
                    ],
                    'tool_use',
                ),
            ],
            { items: [], urls: [] },
        )

        const { suggestion } = await suggestCardDate(deps, card)

        expect(suggestion).toMatchObject({
            year: 1923,
            sourceUrl: 'https://example.com/history',
            via: 'web_search',
        })
        expect(sent).toHaveLength(3)
        expect(toolNames(sent[2])).toEqual(['web_search', 'submit_year_suggestion'])
        expect(sent[2].tools).toContainEqual(
            expect.objectContaining({ type: 'web_search_20260209', max_uses: 3 }),
        )
        // The web search conversation is told what Wikidata said.
        expect(JSON.stringify(sent[2].messages)).toContain('Wikidata has no dated statement')
    })

    it('continues a paused web search turn with what the model had so far', async () => {
        const paused = [
            {
                type: 'server_tool_use',
                id: 'srvtoolu_1',
                name: 'web_search',
                input: { query: 'x' },
            },
            searchResult('https://example.com/history'),
        ]
        const { deps, sent } = fakeDeps(
            [
                reply([text('Nothing on Wikidata.')]),
                reply(paused, 'pause_turn'),
                reply(
                    [
                        toolUse(
                            'submit_year_suggestion',
                            submission({ source_url: 'https://example.com/history' }),
                        ),
                    ],
                    'tool_use',
                ),
            ],
            { items: [], urls: [] },
        )

        const { suggestion } = await suggestCardDate(deps, card)

        expect(suggestion.sourceUrl).toBe('https://example.com/history')
        expect(sent[2].messages.at(-1)).toEqual({ role: 'assistant', content: paused })
    })

    it('rejects a suggestion whose source was not retrieved in the request, and logs it', async () => {
        const { deps, records } = fakeDeps([
            reply([toolUse('lookup_wikidata', { subject: 'Olympics' })], 'tool_use'),
            reply(
                [
                    toolUse(
                        'submit_year_suggestion',
                        submission({ source_url: 'https://example.com/made-up' }),
                    ),
                ],
                'tool_use',
            ),
        ])

        const suggesting = suggestCardDate(deps, card)

        await expect(suggesting).rejects.toBeInstanceOf(AiAnswerRejectedError)
        await expect(suggesting).rejects.toThrow('source it did not retrieve')
        expect(records).toEqual([
            expect.objectContaining({
                details: expect.objectContaining({
                    outcome: 'unsourced',
                    cost_usd: 0.008,
                    source_url: 'https://example.com/made-up',
                }),
            }),
        ])
    })

    it('drops an alternative source that was not retrieved, keeping the alternative', async () => {
        const { deps } = fakeDeps([
            reply([toolUse('lookup_wikidata', { subject: 'Olympics' })], 'tool_use'),
            reply(
                [
                    toolUse(
                        'submit_year_suggestion',
                        submission({
                            alternatives: [
                                {
                                    year: 2012,
                                    reason: 'Most recent.',
                                    source_url: 'https://example.com/not-retrieved',
                                    source_quote: 'London 2012',
                                },
                                {
                                    year: 1948,
                                    reason: 'Second London Games.',
                                    source_url: 'https://www.wikidata.org/wiki/Q8111',
                                    source_quote: 'A quote',
                                },
                            ],
                        }),
                    ),
                ],
                'tool_use',
            ),
        ])

        const { suggestion } = await suggestCardDate(deps, card)

        expect(suggestion.alternatives).toEqual([
            { year: 2012, reason: 'Most recent.', sourceUrl: null, sourceQuote: null },
            {
                year: 1948,
                reason: 'Second London Games.',
                sourceUrl: 'https://www.wikidata.org/wiki/Q8111',
                sourceQuote: 'A quote',
            },
        ])
    })

    it('says so when neither Wikidata nor web search gives a sourced year', async () => {
        const { deps, records } = fakeDeps(
            [reply([text('Nothing on Wikidata.')]), reply([text('No source gives a year.')])],
            { items: [], urls: [] },
        )

        await expect(suggestCardDate(deps, card)).rejects.toThrow('No source gives a year.')
        expect(records).toEqual([
            expect.objectContaining({
                details: expect.objectContaining({ outcome: 'no_suggestion' }),
            }),
        ])
    })

    it('rejects a year 0, which does not exist', async () => {
        const { deps } = fakeDeps([
            reply([toolUse('lookup_wikidata', { subject: 'Olympics' })], 'tool_use'),
            reply([toolUse('submit_year_suggestion', submission({ year: 0 }))], 'tool_use'),
        ])
        await expect(suggestCardDate(deps, card)).rejects.toBeInstanceOf(AiAnswerRejectedError)
    })

    it('tells the model when a Wikidata lookup fails, instead of giving up', async () => {
        const { deps, sent } = fakeDeps([
            reply([toolUse('lookup_wikidata', { subject: 'Olympics' })], 'tool_use'),
            reply(
                [
                    toolUse(
                        'submit_year_suggestion',
                        submission({ source_url: 'https://example.com/x' }),
                    ),
                ],
                'tool_use',
            ),
        ])
        deps.lookupWikidata = async () => {
            throw new Error('Wikidata answered HTTP 503.')
        }
        await expect(suggestCardDate(deps, card)).rejects.toBeInstanceOf(AiAnswerRejectedError)
        expect(sent[1].messages.at(-1)).toEqual({
            role: 'user',
            content: [
                {
                    type: 'tool_result',
                    tool_use_id: 'toolu_lookup_wikidata',
                    content: 'Wikidata answered HTTP 503.',
                    is_error: true,
                },
            ],
        })
    })
})
