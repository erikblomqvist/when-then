// Bulk machine translation and the AI ledger against the local database (run through
// with-db.sh / CI's stack), with a fake model client: no real API calls.

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { CardInput } from '../cards/card'
import { localServiceClient } from '../testing/e2e-auth'
import type { AiDeps, CreateMessage } from './ai'
import { dbLedger } from './ai-ledger'
import { cardHistory, getCard, saveCard } from './cards'
import { translateMissingCards } from './card-ai-translate'
import { listCategories } from './categories'

const db = localServiceClient()

async function newActor() {
    const { data, error } = await db.auth.admin.createUser({
        email: `editor-${randomUUID()}@example.com`,
        email_confirm: true,
    })
    if (error) throw error
    return data.user.id
}

async function newCard(
    actor: string,
    english: string,
    more: Partial<CardInput['translations']> = {},
) {
    const [category] = await listCategories(db)
    return saveCard(db, actor, {
        categoryId: category.id,
        date: { decade: 1890, year: 1895, month: null, day: null },
        sourceUrl: null,
        sourceQuote: null,
        translations: { en: { text: english }, ...more },
    })
}

type Message = Awaited<ReturnType<CreateMessage>>

/** Answers `<LOCALE>: <english>` per locale asked for; fails for text containing "[fail]". */
const fakeModel: CreateMessage = async (params) => {
    const asked = JSON.parse(params.messages[0].content as string) as {
        english: string
        locales: Record<string, string>
    }
    if (asked.english.includes('[fail]')) throw new Error('Stubbed failure')
    const answer = Object.fromEntries(
        Object.keys(asked.locales).map((locale) => [
            locale,
            `${locale.toUpperCase()}: ${asked.english}`,
        ]),
    )
    return {
        id: 'msg_fake',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5-5',
        content: [{ type: 'text', text: JSON.stringify(answer), citations: null }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
            input_tokens: 500,
            output_tokens: 100,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
            server_tool_use: null,
            iterations: null,
        },
    } as Message
}

const deps = (more: Partial<AiDeps> = {}): AiDeps => ({
    createMessage: fakeModel,
    ledger: dbLedger(db),
    ...more,
})

test('fills the missing locales of each selected card as machine translations', async () => {
    const actor = await newActor()
    const tag = randomUUID().slice(0, 8)
    const blank = await newCard(actor, `A made-up tower opens ${tag}`)
    const halfDone = await newCard(actor, `A made-up canal opens ${tag}`, {
        sv: { text: 'En påhittad kanal öppnas' },
    })

    const result = await translateMissingCards(deps(), db, actor, [blank, halfDone])

    expect(result).toEqual({ done: [blank, halfDone], skipped: [] })
    const first = await getCard(db, blank)
    expect(first?.translations.sv).toEqual({
        text: `SV: A made-up tower opens ${tag}`,
        note: null,
        status: 'machine',
    })
    expect(first?.translations.nb?.status).toBe('machine')
    const second = await getCard(db, halfDone)
    // The Swedish text a person wrote stays as it was.
    expect(second?.translations.sv).toEqual({
        text: 'En påhittad kanal öppnas',
        note: null,
        status: 'reviewed',
    })
    expect(second?.translations.nb?.text).toBe(`NB: A made-up canal opens ${tag}`)
})

test('each call is in the card history as an AI translation with its cost', async () => {
    const actor = await newActor()
    const id = await newCard(actor, `A made-up lighthouse is lit ${randomUUID().slice(0, 8)}`)
    await translateMissingCards(deps(), db, actor, [id])

    const history = await cardHistory(db, id)
    const call = history.find((entry) => entry.action === 'ai_translate')
    expect(call).toMatchObject({
        actorId: actor,
        entity: 'card',
        details: {
            outcome: 'ok',
            model: 'claude-sonnet-5-5',
            input_tokens: 500,
            output_tokens: 100,
            cost_usd: 0.002,
            locales: ['sv', 'nb'],
        },
    })
})

test('reports per card what was skipped and why', async () => {
    const actor = await newActor()
    const tag = randomUUID().slice(0, 8)
    const failing = await newCard(actor, `A made-up dam bursts [fail] ${tag}`)
    const complete = await newCard(actor, `A made-up fair opens ${tag}`, {
        sv: { text: 'En påhittad mässa öppnas' },
        nb: { text: 'En oppdiktet messe åpner' },
    })
    const fine = await newCard(actor, `A made-up mill burns ${tag}`)

    const result = await translateMissingCards(deps(), db, actor, [failing, complete, fine])

    expect(result.done).toEqual([fine])
    expect(result.skipped).toEqual([
        {
            id: failing,
            text: `A made-up dam bursts [fail] ${tag}`,
            reason: 'The AI request failed: Stubbed failure',
        },
        {
            id: complete,
            text: `A made-up fair opens ${tag}`,
            reason: 'It has Swedish and Norwegian text already.',
        },
    ])
    expect((await cardHistory(db, failing)).find((e) => e.action === 'ai_translate')).toMatchObject(
        { details: { outcome: 'failed', cost_usd: 0 } },
    )
})

test('stops calling the model at the rate limit and says so for the rest', async () => {
    const actor = await newActor()
    const tag = randomUUID().slice(0, 8)
    const ids = [
        await newCard(actor, `A made-up road opens ${tag}`),
        await newCard(actor, `A made-up port opens ${tag}`),
        await newCard(actor, `A made-up school opens ${tag}`),
    ]

    const result = await translateMissingCards(
        deps({ rateLimit: { calls: 2, windowMinutes: 10 } }),
        db,
        actor,
        ids,
    )

    expect(result.done).toEqual(ids.slice(0, 2))
    expect(result.skipped).toEqual([
        expect.objectContaining({
            id: ids[2],
            reason: expect.stringContaining('AI limit of 2 requests per 10 minutes'),
        }),
    ])
    expect(await dbLedger(db).callsSince(actor, new Date(Date.now() - 60_000))).toBe(2)
})

test('an unknown card id is skipped, not fatal', async () => {
    const actor = await newActor()
    const missing = randomUUID()
    expect(await translateMissingCards(deps(), db, actor, [missing])).toEqual({
        done: [],
        skipped: [{ id: missing, text: null, reason: 'No such card.' }],
    })
})
