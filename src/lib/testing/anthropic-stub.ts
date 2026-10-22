// A stand-in for the Anthropic Messages API and the Wikidata API, for e2e: Playwright starts it
// next to the app and points ANTHROPIC_BASE_URL and WIKIDATA_API_URL at it
// (playwright.config.ts), so no test reaches the real services.
//
//     node src/lib/testing/anthropic-stub.ts <port>
//
// Translation (`#lib/server/ai-translate`): answers "<LOCALE>: <English text>" per locale.
// English text containing "[fail]" gets a 400 API error instead.
//
// Date suggestion (`#lib/server/ai-suggest-date`), by the card text:
// - default: looks the card text up on (stub) Wikidata, which has a made-up item from 1908, and
//   submits 1908 citing its Wikipedia URL, with 2012 as an alternative;
// - "[web]": stub Wikidata finds nothing, so the web search step submits 1923 from
//   https://example.com/made-up-history (one search);
// - "[unsourced]": submits a source that was never retrieved.
// A translation call uses 500 input and 100 output tokens ($0.002 on Sonnet 5.5), every
// suggestion call 1,000 and 200 ($0.004).

import { createServer, type ServerResponse } from 'node:http'

const port = Number(process.argv[2])

type Asked = { english: string; locales: Record<string, string> }
type Content = string | { type: string; content?: string }[]
type Body = {
    model: string
    tools?: { name: string; type?: string }[]
    messages: { role: string; content: Content }[]
}

const send = (response: ServerResponse, status: number, body: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(body))
}

const message = (
    model: string,
    content: unknown[],
    stop_reason = 'end_turn',
    searches = 0,
    [input_tokens, output_tokens] = [1000, 200],
) => ({
    id: 'msg_stub',
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason,
    stop_sequence: null,
    usage: {
        input_tokens,
        output_tokens,
        ...(searches ? { server_tool_use: { web_search_requests: searches } } : {}),
    },
})

const submit = (input: Record<string, unknown>) => ({
    type: 'tool_use',
    id: 'toolu_submit',
    name: 'submit_year_suggestion',
    input: {
        interpretation: 'The first made-up games.',
        confidence: 'high',
        alternatives: [],
        ...input,
    },
})

function suggestDate(body: Body) {
    const card = (JSON.parse(body.messages[0].content as string) as { card: string }).card
    if (body.tools?.some(({ type }) => type?.startsWith('web_search'))) {
        const url = 'https://example.com/made-up-history'
        return message(
            body.model,
            [
                {
                    type: 'server_tool_use',
                    id: 'srvtoolu_stub',
                    name: 'web_search',
                    input: { query: card },
                },
                {
                    type: 'web_search_tool_result',
                    tool_use_id: 'srvtoolu_stub',
                    content: [
                        {
                            type: 'web_search_result',
                            url,
                            title: 'Made-up history',
                            encrypted_content: 'stub',
                            page_age: null,
                        },
                    ],
                },
                submit({ year: 1923, source_url: url, source_quote: 'It first happened in 1923.' }),
            ],
            'tool_use',
            1,
        )
    }
    const last = body.messages.at(-1)!
    const result = Array.isArray(last.content)
        ? last.content.find(({ type }) => type === 'tool_result')
        : undefined
    if (!result) {
        return message(
            body.model,
            [
                {
                    type: 'tool_use',
                    id: 'toolu_lookup',
                    name: 'lookup_wikidata',
                    input: { subject: card },
                },
            ],
            'tool_use',
        )
    }
    const { items } = JSON.parse(result.content ?? '{}') as {
        items: { wikipediaUrl: string; statements: { year: number; quote: string }[] }[]
    }
    if (!items.length) {
        return message(body.model, [
            { type: 'text', text: 'Wikidata has nothing on this.', citations: null },
        ])
    }
    const [statement] = items[0].statements
    return message(
        body.model,
        [
            submit({
                year: statement.year,
                source_url: card.includes('[unsourced]')
                    ? 'https://example.com/never-retrieved'
                    : items[0].wikipediaUrl,
                source_quote: statement.quote,
                alternatives: [
                    {
                        year: 2012,
                        reason: 'The best-known games.',
                        source_url: '',
                        source_quote: '',
                    },
                ],
            }),
        ],
        'tool_use',
    )
}

function wikidata(url: URL) {
    if (url.searchParams.get('action') === 'wbsearchentities') {
        const search = url.searchParams.get('search') ?? ''
        return { search: search.includes('[web]') ? [] : [{ id: 'Q90001' }] }
    }
    return {
        entities: {
            Q90001: {
                id: 'Q90001',
                labels: { en: { value: 'Made-up games' } },
                descriptions: { en: { value: 'a made-up event' } },
                sitelinks: { enwiki: { url: 'https://en.wikipedia.org/wiki/Made-up_games' } },
                claims: {
                    P585: [
                        {
                            mainsnak: {
                                snaktype: 'value',
                                datavalue: {
                                    type: 'time',
                                    value: { time: '+1908-00-00T00:00:00Z', precision: 9 },
                                },
                            },
                        },
                    ],
                },
            },
        },
    }
}

function translate(body: Body, response: ServerResponse) {
    const asked = JSON.parse(body.messages[0].content as string) as Asked
    if (asked.english.includes('[fail]')) {
        return send(response, 400, {
            type: 'error',
            error: { type: 'invalid_request_error', message: 'Stubbed failure' },
        })
    }
    const answer = Object.fromEntries(
        Object.keys(asked.locales).map((locale) => [
            locale,
            `${locale.toUpperCase()}: ${asked.english}`,
        ]),
    )
    send(
        response,
        200,
        message(
            body.model,
            [{ type: 'text', text: JSON.stringify(answer), citations: null }],
            'end_turn',
            0,
            [500, 100],
        ),
    )
}

createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)
    if (request.method === 'GET') {
        return send(response, 200, url.pathname === '/w/api.php' ? wikidata(url) : { ok: true })
    }
    let raw = ''
    request.on('data', (chunk: Buffer) => (raw += chunk.toString()))
    request.on('end', () => {
        const body = JSON.parse(raw) as Body
        if (body.tools?.some(({ name }) => name === 'submit_year_suggestion')) {
            return send(response, 200, suggestDate(body))
        }
        translate(body, response)
    })
}).listen(port, '127.0.0.1')
