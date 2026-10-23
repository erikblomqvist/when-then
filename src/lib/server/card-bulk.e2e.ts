// Bulk publish, archive, move and delete against the local database (run through with-db.sh / CI's
// stack): each card goes through the same rule as one at a time, refused cards are skipped
// with the reason, and every affected card gets its own audit row.

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { DateParts } from '../cards/date-parts'
import { localServiceClient, newPerson } from '../testing/e2e-auth'
import { archiveCards, deleteDrafts, moveCards, publishCards } from './card-bulk'
import { publishCard } from './card-lifecycle'
import { resolveCardSelection } from './card-selection'
import { getCard, saveCard } from './cards'
import { listCategories } from './categories'

const db = localServiceClient()

const year1969: DateParts = { decade: 1960, year: 1969, month: null, day: null }
const decade1960: DateParts = { decade: 1960, year: null, month: null, day: null }

async function newCard(actor: string, text: string, date: DateParts = year1969, category = 0) {
    const categories = await listCategories(db)
    return saveCard(db, actor, {
        categoryId: categories[category].id,
        date,
        sourceUrl: null,
        sourceQuote: null,
        translations: { en: { text } },
    })
}

async function auditActions(cardIds: string[]) {
    const { data, error } = await db
        .from('audit_log')
        .select('entity_id, action, actor_id')
        .eq('entity', 'card')
        .neq('action', 'create')
        .in('entity_id', cardIds)
        .order('id')
    if (error) throw error
    return data.map((row) => [row.entity_id, row.action, row.actor_id])
}

const status = async (id: string) => (await getCard(db, id))?.status

test('bulk publish publishes what it can and skips the rest with the reason', async () => {
    const actor = (await newPerson()).id
    const first = await newCard(actor, `A made-up kite ${randomUUID()}`)
    const second = await newCard(actor, `A made-up raft ${randomUUID()}`)
    const blockedText = `A made-up canoe ${randomUUID()}`
    const blocked = await newCard(actor, blockedText, decade1960)
    const publishedText = `A made-up glider ${randomUUID()}`
    const published = await newCard(actor, publishedText)
    await publishCard(db, actor, published)
    const before = await auditActions([published])

    const result = await publishCards(db, actor, [first, blocked, second, published])

    expect(result.done).toEqual([first, second])
    expect(result.skipped).toEqual([
        { id: blocked, text: blockedText, reason: 'Cards from 1500 onwards need a year.' },
        { id: published, text: publishedText, reason: 'Only a draft can be published.' },
    ])
    expect(await status(first)).toBe('published')
    expect(await status(blocked)).toBe('draft')
    expect(await auditActions([first, second, blocked])).toEqual([
        [first, 'publish', actor],
        [second, 'publish', actor],
    ])
    expect(await auditActions([published])).toEqual(before)
})

test('bulk archive archives published cards and drafts, and skips archived ones', async () => {
    const actor = (await newPerson()).id
    const published = await newCard(actor, `A made-up kite ${randomUUID()}`)
    await publishCard(db, actor, published)
    const draft = await newCard(actor, `A made-up raft ${randomUUID()}`)
    const archivedText = `A made-up sled ${randomUUID()}`
    const archived = await newCard(actor, archivedText)
    await archiveCards(db, actor, [archived])

    const result = await archiveCards(db, actor, [published, draft, archived])

    expect(result).toEqual({
        done: [published, draft],
        skipped: [{ id: archived, text: archivedText, reason: 'The card is archived already.' }],
    })
    expect(await status(published)).toBe('archived')
    expect(await status(draft)).toBe('archived')
    expect(await auditActions([published, draft])).toEqual([
        [published, 'publish', actor],
        [published, 'archive', actor],
        [draft, 'archive', actor],
    ])
})

test('bulk delete deletes the drafts and skips published and archived cards', async () => {
    const admin = (await newPerson('admin')).id
    const first = await newCard(admin, `A made-up kite ${randomUUID()}`)
    const second = await newCard(admin, `A made-up raft ${randomUUID()}`)
    const publishedText = `A made-up glider ${randomUUID()}`
    const published = await newCard(admin, publishedText)
    await publishCard(db, admin, published)
    const archivedText = `A made-up sled ${randomUUID()}`
    const archived = await newCard(admin, archivedText)
    await archiveCards(db, admin, [archived])

    const result = await deleteDrafts(db, admin, [first, published, second, archived])

    const notDraft = 'Only a never-published draft can be deleted.'
    expect(result).toEqual({
        done: [first, second],
        skipped: [
            { id: published, text: publishedText, reason: notDraft },
            { id: archived, text: archivedText, reason: notDraft },
        ],
    })
    expect(await getCard(db, first)).toBeNull()
    expect(await getCard(db, second)).toBeNull()
    expect(await status(published)).toBe('published')
    expect(await status(archived)).toBe('archived')
    expect(await auditActions([first, second])).toEqual([
        [first, 'delete', admin],
        [second, 'delete', admin],
    ])
})

test('bulk delete by an editor deletes nothing', async () => {
    const editor = (await newPerson()).id
    const text = `A made-up kite ${randomUUID()}`
    const draft = await newCard(editor, text)

    const result = await deleteDrafts(db, editor, [draft])

    expect(result).toEqual({
        done: [],
        skipped: [{ id: draft, text, reason: 'Only admins can delete drafts.' }],
    })
    expect(await status(draft)).toBe('draft')
})

test('bulk move puts cards in another category, one audit row each', async () => {
    const actor = (await newPerson()).id
    const categories = await listCategories(db)
    const target = categories[1].id
    const first = await newCard(actor, `A made-up kite ${randomUUID()}`)
    const second = await newCard(actor, `A made-up raft ${randomUUID()}`)
    await publishCard(db, actor, second)
    const alreadyText = `A made-up canoe ${randomUUID()}`
    const already = await newCard(actor, alreadyText, year1969, 1)

    const result = await moveCards(db, actor, [first, second, already], target)

    expect(result).toEqual({
        done: [first, second],
        skipped: [{ id: already, text: alreadyText, reason: 'Already in that category.' }],
    })
    expect((await getCard(db, first))?.categoryId).toBe(target)
    expect(await getCard(db, second)).toMatchObject({ categoryId: target, status: 'published' })
    expect(await auditActions([first, second, already])).toEqual([
        [second, 'publish', actor],
        [first, 'update', actor],
        [second, 'update', actor],
    ])
})

test('bulk move refuses a category that does not exist', async () => {
    const actor = (await newPerson()).id
    const card = await newCard(actor, `A made-up kite ${randomUUID()}`)
    await expect(moveCards(db, actor, [card], randomUUID())).rejects.toThrow()
    expect((await getCard(db, card))?.categoryId).toBe((await listCategories(db))[0].id)
})

test('a selection resolves to the picked cards or to every card matching the filter', async () => {
    const actor = (await newPerson()).id
    const word = `Bulkword${randomUUID().slice(0, 8)}`
    const first = await newCard(actor, `A made-up ${word} kite`)
    const second = await newCard(actor, `A made-up ${word} raft`)
    await newCard(actor, `A made-up kite ${randomUUID()}`)

    expect(await resolveCardSelection(db, { kind: 'cards', ids: [second] })).toEqual([second])
    expect(
        (await resolveCardSelection(db, { kind: 'matching', filter: { search: word } })).sort(),
    ).toEqual([first, second].sort())
})
