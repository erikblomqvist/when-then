// Translations (sv, nb) through the card repository against the local database (run through
// with-db.sh / CI's stack): the status a save gives them, staleness after an English edit,
// the audit trail, the card's updated time and the per-locale list filter.

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { CardInput } from '../cards/card'
import { localServiceClient } from '../testing/e2e-auth'
import { cardHistory, getCard, matchingCardIds, saveCard } from './cards'
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

// `tag`: a word only this test's cards have, to find them in the list.
async function newCard(
    translations: Partial<CardInput['translations']> = {},
    tag = `Tag${randomUUID().slice(0, 8)}`,
) {
    const actor = await newActor()
    const [category] = await listCategories(db)
    const input = (more: Partial<CardInput['translations']> = {}): CardInput => ({
        categoryId: category.id,
        date: { decade: 1890, year: 1895, month: null, day: null },
        sourceUrl: null,
        sourceQuote: null,
        translations: { en: { text: `A made-up bridge opens ${tag}` }, ...more },
    })
    const id = await saveCard(db, actor, input(translations))
    const save = (more: Partial<CardInput['translations']>) => saveCard(db, actor, input(more), id)
    return { id, actor, tag, input, save }
}

const statuses = async (id: string) => {
    const card = await getCard(db, id)
    return Object.fromEntries(
        Object.entries(card?.translations ?? {}).map(([locale, t]) => [locale, t.status]),
    )
}

test('a translation a person writes is reviewed, with its note', async () => {
    const { id } = await newCard({ sv: { text: 'En påhittad bro öppnas', note: 'Bro' } })

    expect((await getCard(db, id))?.translations.sv).toEqual({
        text: 'En påhittad bro öppnas',
        note: 'Bro',
        status: 'reviewed',
    })
})

test('a machine translation stays machine until edited or ticked reviewed', async () => {
    const { id, save } = await newCard({
        sv: { text: 'Maskinens text', status: 'machine' },
        nb: { text: 'Maskinens tekst', status: 'machine' },
    })
    expect(await statuses(id)).toEqual({ en: 'reviewed', sv: 'machine', nb: 'machine' })

    // Saved again as it is, with only a note added: still machine.
    await save({ sv: { text: 'Maskinens text', note: 'Om bron' }, nb: { text: 'Maskinens tekst' } })
    expect(await statuses(id)).toEqual({ en: 'reviewed', sv: 'machine', nb: 'machine' })

    // Edited text counts as review; so does ticking reviewed.
    await save({
        sv: { text: 'En påhittad bro öppnas' },
        nb: { text: 'Maskinens tekst', status: 'reviewed' },
    })
    expect(await statuses(id)).toEqual({ en: 'reviewed', sv: 'reviewed', nb: 'reviewed' })
})

test('changing the English text turns reviewed translations stale, not machine ones', async () => {
    const { id, actor, input } = await newCard({
        sv: { text: 'En påhittad bro öppnas' },
        nb: { text: 'Maskinens tekst', status: 'machine' },
    })

    // The same English text again changes nothing.
    await saveCard(db, actor, input({ sv: { text: 'En påhittad bro öppnas' } }), id)
    expect(await statuses(id)).toEqual({ en: 'reviewed', sv: 'reviewed', nb: 'machine' })

    const edited = input()
    edited.translations.en = { text: `${edited.translations.en.text}, at last` }
    await saveCard(db, actor, edited, id)
    expect(await statuses(id)).toEqual({ en: 'reviewed', sv: 'stale', nb: 'machine' })

    const history = await cardHistory(db, id)
    expect(history[0]).toMatchObject({
        actorId: actor,
        entity: 'card_translation',
        locale: 'sv',
        action: 'update',
        before: { status: 'reviewed' },
        after: { status: 'stale' },
    })
})

test('a translation edited in the same save as the English stays reviewed', async () => {
    const { id, actor, input } = await newCard({
        sv: { text: 'En påhittad bro öppnas' },
        nb: { text: 'En oppdiktet bro åpner' },
    })
    const edited = input({ sv: { text: 'En påhittad bro öppnas till slut' } })
    edited.translations.en = { text: `${edited.translations.en.text}, at last` }

    await saveCard(db, actor, edited, id)

    expect(await statuses(id)).toEqual({ en: 'reviewed', sv: 'reviewed', nb: 'stale' })
})

test('a translation saved without text is removed, and the removal audited', async () => {
    const { id, actor, save } = await newCard({ sv: { text: 'En påhittad bro öppnas' } })

    await save({ sv: null })

    expect((await getCard(db, id))?.translations.sv).toBeUndefined()
    expect((await cardHistory(db, id))[0]).toMatchObject({
        actorId: actor,
        entity: 'card_translation',
        locale: 'sv',
        action: 'delete',
    })
})

test('saving only a translation moves the card up the recently updated list', async () => {
    const { id, save } = await newCard()
    const before = (await getCard(db, id))?.updatedAt ?? ''

    await save({ nb: { text: 'En oppdiktet bro åpner' } })

    const after = (await getCard(db, id))?.updatedAt ?? ''
    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime())
})

test('the list filters by translation state per locale, and by the review queue', async () => {
    const { id: machine, tag } = await newCard({
        sv: { text: 'Maskinens text', status: 'machine' },
    })
    const { id: reviewed } = await newCard(
        { sv: { text: 'En påhittad bro öppnas' }, nb: { text: 'En oppdiktet bro åpner' } },
        tag,
    )
    const ids = (
        translations: NonNullable<Parameters<typeof matchingCardIds>[1]['translations']>,
    ) => matchingCardIds(db, { search: tag, translations }).then((found) => found.toSorted())

    expect(await ids({})).toEqual([machine, reviewed].toSorted())
    expect(await ids({ sv: 'machine' })).toEqual([machine])
    expect(await ids({ sv: 'reviewed' })).toEqual([reviewed])
    expect(await ids({ nb: 'missing' })).toEqual([machine])
    expect(await ids({ sv: 'needs-review' })).toEqual([machine])
    expect(await ids({ nb: 'needs-review' })).toEqual([])
    expect(await ids({ sv: 'reviewed', nb: 'reviewed' })).toEqual([reviewed])
})
