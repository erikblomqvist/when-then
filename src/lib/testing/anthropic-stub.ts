// A stand-in for the Anthropic Messages API, for e2e: Playwright starts it next to the app and
// points ANTHROPIC_BASE_URL at it (playwright.config.ts), so no test calls the real API.
//
//     node src/lib/testing/anthropic-stub.ts <port>
//
// Answers a translation request (`#lib/server/ai-translate`) with "<LOCALE>: <English text>"
// per locale asked for. English text containing "[fail]" gets a 400 API error instead.

import { createServer } from 'node:http'

const port = Number(process.argv[2])

type Asked = { english: string; locales: Record<string, string> }

const send = (response: import('node:http').ServerResponse, status: number, body: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(body))
}

createServer((request, response) => {
    if (request.method === 'GET') return send(response, 200, { ok: true })
    let raw = ''
    request.on('data', (chunk: Buffer) => (raw += chunk.toString()))
    request.on('end', () => {
        const body = JSON.parse(raw) as { model: string; messages: { content: string }[] }
        const asked = JSON.parse(body.messages[0].content) as Asked
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
        send(response, 200, {
            id: 'msg_stub',
            type: 'message',
            role: 'assistant',
            model: body.model,
            content: [{ type: 'text', text: JSON.stringify(answer) }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 500, output_tokens: 100 },
        })
    })
}).listen(port, '127.0.0.1')
