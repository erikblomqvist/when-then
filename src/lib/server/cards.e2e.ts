// The card repository against the local database (run through with-db.sh / CI's stack): the
// schema's rules, the audit trail and the access rules, through the module the routes use.

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { CardInput } from '../cards/card'
import type { CardFilter } from '../cards/card-list'
import { localServiceClient } from '../testing/e2e-auth'
import { cardHistory, getCard, listCards, matchingCardIds, saveCard } from './cards'
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

async function eventsCategory() {
    const categories = await listCategories(db)
    const events = categories.find((category) => category.name === 'Events')
    if (!events) throw new Error('The seed has an Events category')
    return events
}

const card = (categoryId: string, text: string): CardInput => ({
    categoryId,
    date: { decade: 1960, year: 1969, month: 7, day: 20 },
    sourceUrl: 'https://example.com/source',
    sourceQuote: 'it happened in July 1969',
    translations: { en: { text } },
})

test('lists active categories in draw order with English names', async () => {
    const categories = await listCategories(db)
    // The seed's four come first; other tests (categories.e2e.ts) add theirs after them.
    expect(categories.slice(0, 4).map((category) => category.name)).toEqual([
        'Events',
        'People',
        'Inventions',
        'Places',
    ])
    expect(categories[0]).toMatchObject({ position: 1, icon: 'zap', colour: 'red' })
})

test('a new card is saved as a draft and reads back as written', async () => {
    const actor = await newActor()
    const events = await eventsCategory()
    const text = `A made-up landing ${randomUUID()}`

    const id = await saveCard(db, actor, card(events.id, text))

    expect(await getCard(db, id)).toMatchObject({
        id,
        status: 'draft',
        ...card(events.id, text),
        translations: { en: { text, status: 'reviewed' } },
    })
})

test('creating and editing a card writes audit rows with actor, before and after', async () => {
    const creator = await newActor()
    const editor = await newActor()
    const events = await eventsCategory()
    const id = await saveCard(db, creator, card(events.id, 'A made-up first draft'))

    await saveCard(
        db,
        editor,
        {
            ...card(events.id, 'A made-up second draft'),
            date: { decade: 1960, year: 1969, month: null, day: null },
        },
        id,
    )

    const history = await cardHistory(db, id)
    // Newest first: the edit (card, then English text), then the creation.
    expect(history.map(({ entity, action, actorId }) => [entity, action, actorId])).toEqual([
        ['card_translation', 'update', editor],
        ['card', 'update', editor],
        ['card_translation', 'create', creator],
        ['card', 'create', creator],
    ])
    const [textEdit, dateEdit, , creation] = history
    expect(textEdit).toMatchObject({
        locale: 'en',
        before: { text: 'A made-up first draft' },
        after: { text: 'A made-up second draft' },
    })
    expect(dateEdit).toMatchObject({
        before: { year: 1969, month: 7, day: 20 },
        after: { year: 1969, month: null, day: null },
    })
    expect(creation).toMatchObject({ before: null, after: { id, status: 'draft' } })
})

test('saving without changes writes no audit rows', async () => {
    const actor = await newActor()
    const events = await eventsCategory()
    const input = card(events.id, 'A made-up unchanged card')
    const id = await saveCard(db, actor, input)

    await saveCard(db, actor, input, id)

    expect(await cardHistory(db, id)).toHaveLength(2)
})

test('the database holds the date-part rules', async () => {
    const actor = await newActor()
    const { id: categoryId } = await eventsCategory()
    const rejected = [
        { decade: 1960, year: 1969, month: null, day: 20 }, // day needs month
        { decade: 1960, year: null, month: 7, day: null }, // month needs year
        { decade: 1, year: 0, month: null, day: null }, // no year 0
        { decade: 1480, year: 1492, month: null, day: null }, // decade must contain the year
        { decade: 1495, year: null, month: null, day: null }, // not a decade
        { decade: -490, year: null, month: null, day: null }, // 490s BC is stored as -499
        { decade: 1960, year: 1969, month: 2, day: 29 }, // not a leap year
    ]
    for (const date of rejected) {
        await expect(
            saveCard(db, actor, { ...card(categoryId, 'A made-up date'), date }),
            JSON.stringify(date),
        ).rejects.toThrow(/cards_date_parts_valid/)
    }

    const accepted = [
        { decade: -499, year: null, month: null, day: null },
        { decade: -9, year: null, month: null, day: null },
        { decade: 1, year: null, month: null, day: null },
        { decade: -49, year: -44, month: 3, day: 15 },
        { decade: 2020, year: 2024, month: 2, day: 29 },
    ]
    for (const date of accepted) {
        const id = await saveCard(db, actor, { ...card(categoryId, 'A made-up date'), date })
        expect((await getCard(db, id))?.date).toEqual(date)
    }
})

test('a write without an actor is refused', async () => {
    const { id: categoryId } = await eventsCategory()
    const { error } = await db.from('cards').insert({ category_id: categoryId })
    expect(error?.message).toMatch(/without an actor/)
})

test('the list shows cards newest first with English text, date, category and status', async () => {
    const actor = await newActor()
    const events = await eventsCategory()
    const text = `A made-up listed card ${randomUUID()}`
    const id = await saveCard(db, actor, {
        ...card(events.id, text),
        date: { decade: -499, year: null, month: null, day: null },
    })

    const { cards, total } = await listCards(db, { page: 1, pageSize: 10 })

    // Other tests may save cards meanwhile, so look for this one near the top.
    expect(total).toBeGreaterThanOrEqual(cards.length)
    expect(cards.length).toBeLessThanOrEqual(10)
    expect(cards.find((listed) => listed.id === id)).toMatchObject({
        id,
        text,
        status: 'draft',
        date: { decade: -499, year: null, month: null, day: null },
        category: { id: events.id, name: 'Events' },
    })
})

test('the browser cannot read or write card tables directly', async () => {
    const url = process.env.PUBLIC_SUPABASE_URL ?? ''
    const browser = createClient(url, process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '')
    for (const table of [
        'cards',
        'card_translations',
        'categories',
        'category_translations',
        'audit_log',
    ] as const) {
        const read = await browser.from(table).select('*').limit(1)
        expect(read.error?.code, table).toBe('42501') // permission denied
    }
    const rpc = await browser.rpc('save_card', { actor: randomUUID(), card: {}, translations: {} })
    expect(rpc.error).not.toBeNull()
})

// The list query (search, filters, sort, paging) over cards made here with a unique token, so
// cards other tests save meanwhile never show up, plus the seeded cards for status and
// verified (which only the seed sets so far).

const tokenCard = (
    categoryId: string,
    token: string,
    date: CardInput['date'],
    more: Partial<CardInput> = {},
): CardInput => ({
    categoryId,
    date,
    sourceUrl: null,
    sourceQuote: null,
    translations: { en: { text: `A made-up ${token} card from ${JSON.stringify(date)}` } },
    ...more,
})

const undated = { decade: null, year: null, month: null, day: null }

test('search matches card text in any locale, ignoring case and wildcards', async () => {
    const actor = await newActor()
    const events = await eventsCategory()
    const token = randomUUID().slice(0, 8)
    const id = await saveCard(db, actor, {
        ...tokenCard(events.id, `en${token}`, undated),
        translations: {
            en: { text: `A made-up market en${token}` },
            nb: { text: `Et oppdiktet marked nb${token}` },
        },
    })

    const ids = async (search: string) =>
        (await listCards(db, { page: 1, pageSize: 10, filter: { search } })).cards.map(
            (listed) => listed.id,
        )
    expect(await ids(`NB${token.toUpperCase()}`)).toEqual([id])
    expect(await ids(`market en${token}`)).toEqual([id])
    expect(await ids(`n_${token}`)).toEqual([])
    expect(await ids(`%${token}`)).toEqual([])
})

test('sorting by date puts BC before AD, a decade at its earliest year and undated last', async () => {
    const actor = await newActor()
    const events = await eventsCategory()
    const token = randomUUID().slice(0, 8)
    const dates = {
        undated,
        y1967day: { decade: 1960, year: 1967, month: 4, day: 12 },
        y1: { decade: 1, year: 1, month: null, day: null },
        d1490: { decade: 1490, year: null, month: null, day: null },
        y44bc: { decade: -49, year: -44, month: null, day: null },
        y1967: { decade: 1960, year: 1967, month: null, day: null },
        d0sbc: { decade: -9, year: null, month: null, day: null },
        y1493: { decade: 1490, year: 1493, month: null, day: null },
        d490sbc: { decade: -499, year: null, month: null, day: null },
    }
    const ids: Record<string, string> = {}
    for (const [name, date] of Object.entries(dates)) {
        ids[name] = await saveCard(db, actor, tokenCard(events.id, token, date))
    }
    const order = async (sort: 'date' | '-date') =>
        (await listCards(db, { page: 1, pageSize: 20, filter: { search: token }, sort })).cards.map(
            (listed) => Object.keys(ids).find((name) => ids[name] === listed.id),
        )

    expect(await order('date')).toEqual([
        'd490sbc',
        'y44bc',
        'd0sbc',
        'y1',
        'd1490',
        'y1493',
        'y1967',
        'y1967day',
        'undated',
    ])
    expect(await order('-date')).toEqual([
        'y1967day',
        'y1967',
        'y1493',
        'd1490',
        'y1',
        'd0sbc',
        'y44bc',
        'd490sbc',
        'undated',
    ])
})

test('filters by category, source and before/after 1500, and pages the result', async () => {
    const actor = await newActor()
    const [events, people] = await listCategories(db)
    const token = randomUUID().slice(0, 8)
    const source = { sourceUrl: 'https://example.com/made-up', sourceQuote: null }
    const early = await saveCard(
        db,
        actor,
        tokenCard(events.id, token, { decade: 1490, year: null, month: null, day: null }, source),
    )
    const late = await saveCard(
        db,
        actor,
        tokenCard(people.id, token, { decade: 1500, year: 1500, month: null, day: null }),
    )
    const lateDecade = await saveCard(
        db,
        actor,
        tokenCard(events.id, token, { decade: 1810, year: null, month: null, day: null }),
    )
    const none = await saveCard(db, actor, tokenCard(events.id, token, undated))

    const ids = async (filter: CardFilter) =>
        (await listCards(db, { page: 1, pageSize: 10, filter: { search: token, ...filter } })).cards
            .map((listed) => listed.id)
            .toSorted()
    expect(await ids({ categoryId: people.id })).toEqual([late])
    expect(await ids({ hasSource: true })).toEqual([early])
    expect(await ids({ hasSource: false })).toEqual([late, lateDecade, none].toSorted())
    expect(await ids({ era: 'before-1500' })).toEqual([early])
    expect(await ids({ era: 'from-1500' })).toEqual([late, lateDecade].toSorted())

    const [first, second, third] = await Promise.all(
        [1, 2, 3].map((page) =>
            listCards(db, { page, pageSize: 3, filter: { search: token }, sort: 'date' }),
        ),
    )
    expect([first.total, second.total]).toEqual([4, 4])
    expect(first.cards.map((listed) => listed.id)).toEqual([early, late, lateDecade])
    expect(second.cards.map((listed) => listed.id)).toEqual([none])
    // Past the last page: no cards, still the total.
    expect(third).toEqual({ cards: [], total: 4 })
})

test('filters seeded cards by status and verified', async () => {
    const list = async (filter: CardFilter) =>
        (await listCards(db, { page: 1, pageSize: 50, filter })).cards
    const published = await list({ status: 'published' })
    expect(published.every((listed) => listed.status === 'published')).toBe(true)
    expect(published.map((listed) => listed.text)).toContain(
        'The made-up port of Sampleby lights its first lighthouse',
    )

    const verified = await list({ verified: true, search: 'Sampleb' })
    expect(verified.map((listed) => [listed.text, listed.verified])).toEqual([
        ['The made-up port of Sampleby lights its first lighthouse', true],
    ])
    const unverified = await list({ verified: false, search: 'Sampleb' })
    expect(unverified.map((listed) => [listed.text, listed.verified])).toEqual([
        ['The made-up Samplebridge opens to horse carts', false],
    ])
})

test('the ids of every card matching a filter, beyond one page', async () => {
    const actor = await newActor()
    const events = await eventsCategory()
    const token = randomUUID().slice(0, 8)
    const saved = []
    for (const year of [1901, 1902, 1903]) {
        const date = { decade: 1900, year, month: null, day: null }
        saved.push(await saveCard(db, actor, tokenCard(events.id, token, date)))
    }

    expect((await matchingCardIds(db, { search: token })).toSorted()).toEqual(saved.toSorted())
})
