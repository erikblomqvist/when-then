// The audit log reader against the local database (run through with-db.sh / CI's stack):
// filters, paging and the names the pages show. Other tests write to the log at the same
// time, so every query here is narrowed to a fresh actor.

import { expect, test } from '@playwright/test'
import { localServiceClient, newPerson } from '../testing/e2e-auth'
import { auditActors, auditKinds, auditLog } from './audit'
import { saveCard } from './cards'
import { listCategories } from './categories'

const db = localServiceClient()

async function cardBy(actorId: string, text: string, cardId?: string) {
    const [category] = await listCategories(db)
    return saveCard(
        db,
        actorId,
        {
            categoryId: category.id,
            date: { decade: 1960, year: 1969, month: null, day: null },
            sourceUrl: null,
            sourceQuote: null,
            translations: { en: { text } },
        },
        cardId,
    )
}

test('filters the log by actor, entity and action', async () => {
    const actor = await newPerson()
    const other = await newPerson()
    const id = await cardBy(actor.id, 'A made-up audited card')
    await cardBy(actor.id, 'A made-up audited card, edited', id)
    await cardBy(other.id, 'A made-up card by someone else')

    const mine = await auditLog(db, { actorId: actor.id, pageSize: 50 })
    expect(mine.entries.map(({ entity, action, entityId }) => [entity, action, entityId])).toEqual([
        ['card_translation', 'update', id],
        ['card_translation', 'create', id],
        ['card', 'create', id],
    ])

    const edits = await auditLog(db, { actorId: actor.id, action: 'update', pageSize: 50 })
    expect(edits.entries.map(({ entity }) => entity)).toEqual(['card_translation'])

    const cards = await auditLog(db, { actorId: actor.id, entity: 'card', pageSize: 50 })
    expect(cards.entries.map(({ action }) => action)).toEqual(['create'])
})

test('pages through the log newest first, both ways', async () => {
    const actor = await newPerson()
    const id = await cardBy(actor.id, 'A made-up paged card')
    await cardBy(actor.id, 'A made-up paged card, edited', id)
    const query = { actorId: actor.id, pageSize: 2 }

    const first = await auditLog(db, query)
    expect(first.entries.map(({ action }) => action)).toEqual(['update', 'create'])
    expect(first.newer).toBeNull()
    expect(first.older).not.toBeNull()

    const second = await auditLog(db, { ...query, before: first.older ?? undefined })
    expect(second.entries.map(({ entity, action }) => [entity, action])).toEqual([
        ['card', 'create'],
    ])
    expect(second.older).toBeNull()
    expect(second.newer).not.toBeNull()

    const back = await auditLog(db, { ...query, after: second.newer ?? undefined })
    expect(back.entries.map(({ id: entryId }) => entryId)).toEqual(
        first.entries.map(({ id: entryId }) => entryId),
    )
    expect(back.newer).toBeNull()
})

test('names the actors and lists the kinds of entries for the filters', async () => {
    const actor = await newPerson()
    await cardBy(actor.id, 'A made-up card for the filters')

    expect(await auditActors(db)).toContainEqual({ id: actor.id, email: actor.email })
    const kinds = await auditKinds(db)
    expect(kinds.entities).toEqual(expect.arrayContaining(['card', 'card_translation']))
    expect(kinds.actions).toEqual(expect.arrayContaining(['create', 'update']))
})
