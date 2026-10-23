// Card lifecycle and verification against the local database (run through with-db.sh / CI's
// stack): the status rules, the publish rule on the server, delete draft and the audit trail.

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { CardInput } from '../cards/card'
import { localServiceClient, newPerson } from '../testing/e2e-auth'
import {
    archiveCard,
    clearVerification,
    deleteCard,
    markVerified,
    publishCard,
    unarchiveCard,
} from './card-lifecycle'
import { cardHistory, getCard, saveCard } from './cards'
import { listCategories } from './categories'

const db = localServiceClient()

async function newCard(actor: string, date: CardInput['date'] = moonLanding) {
    const categories = await listCategories(db)
    return saveCard(db, actor, {
        categoryId: categories[0].id,
        date,
        sourceUrl: null,
        sourceQuote: null,
        translations: { en: { text: `A made-up card ${randomUUID()}` } },
    })
}

const moonLanding = { decade: 1960, year: 1969, month: 7, day: 20 }

const statusActions = async (id: string) =>
    (await cardHistory(db, id))
        .filter((entry) => entry.entity === 'card' && entry.action !== 'create')
        .map(({ action, actorId }) => [action, actorId])
        .reverse()

test('a card goes draft → published → archived → published, each step audited', async () => {
    const actor = (await newPerson()).id
    const id = await newCard(actor)

    await publishCard(db, actor, id)
    expect((await getCard(db, id))?.status).toBe('published')
    await archiveCard(db, actor, id)
    expect(await getCard(db, id)).toMatchObject({ status: 'archived' })
    await unarchiveCard(db, actor, id)
    expect((await getCard(db, id))?.status).toBe('published')

    expect(await statusActions(id)).toEqual([
        ['publish', actor],
        ['archive', actor],
        ['unarchive', actor],
    ])
})

test('a draft can be archived and comes back as a draft, without the publish rule', async () => {
    const actor = (await newPerson()).id
    // From 1500 on without a year: a draft that couldn't be published.
    const id = await newCard(actor, { decade: 1960, year: null, month: null, day: null })

    await archiveCard(db, actor, id)
    expect(await getCard(db, id)).toMatchObject({ status: 'archived', archivedFrom: 'draft' })
    await unarchiveCard(db, actor, id)
    expect(await getCard(db, id)).toMatchObject({ status: 'draft', archivedFrom: null })

    expect(await statusActions(id)).toEqual([
        ['archive', actor],
        ['unarchive', actor],
    ])
})

test('the server refuses to publish a card the publish rule blocks', async () => {
    const actor = (await newPerson()).id
    const id = await newCard(actor, { decade: 1960, year: null, month: null, day: null })

    await expect(publishCard(db, actor, id)).rejects.toMatchObject({
        code: 'publish_blocked',
        message: 'Cards from 1500 onwards need a year.',
    })
    expect((await getCard(db, id))?.status).toBe('draft')
})

test('only the listed transitions are allowed', async () => {
    const actor = (await newPerson()).id
    const id = await newCard(actor)

    await expect(unarchiveCard(db, actor, id)).rejects.toMatchObject({
        code: 'invalid_transition',
    })
    await archiveCard(db, actor, id)
    await expect(archiveCard(db, actor, id)).rejects.toMatchObject({ code: 'invalid_transition' })
    await unarchiveCard(db, actor, id)
    await publishCard(db, actor, id)
    await expect(publishCard(db, actor, id)).rejects.toMatchObject({ code: 'invalid_transition' })
    await expect(publishCard(db, actor, randomUUID())).rejects.toMatchObject({
        code: 'not_found',
    })
})

test('an admin deletes a card, and the deletion is audited', async () => {
    const admin = (await newPerson('admin')).id
    const id = await newCard(admin)

    await deleteCard(db, admin, id)

    expect(await getCard(db, id)).toBeNull()
    const history = await cardHistory(db, id)
    const deletions = history.filter((entry) => entry.action === 'delete')
    const deleted = deletions.map(({ entity, actorId }) => [entity, actorId])
    expect(deleted).toHaveLength(2)
    expect(deleted).toContainEqual(['card', admin])
    expect(deleted).toContainEqual(['card_translation', admin])
})

test('editors cannot delete cards; admins delete published and archived ones too', async () => {
    const editor = (await newPerson('editor')).id
    const admin = (await newPerson('admin')).id
    const draft = await newCard(editor)
    await expect(deleteCard(db, editor, draft)).rejects.toMatchObject({ code: 'not_admin' })
    expect(await getCard(db, draft)).not.toBeNull()

    const published = await newCard(editor)
    await publishCard(db, editor, published)
    await deleteCard(db, admin, published)
    expect(await getCard(db, published)).toBeNull()

    const archived = await newCard(editor)
    await publishCard(db, editor, archived)
    await archiveCard(db, editor, archived)
    await deleteCard(db, admin, archived)
    expect(await getCard(db, archived)).toBeNull()
})

test('marking the date verified records who and when; clearing it is audited too', async () => {
    const actor = (await newPerson()).id
    const id = await newCard(actor)

    const created = await getCard(db, id)
    await markVerified(db, actor, id)
    const verified = await getCard(db, id)
    expect(verified?.verifiedBy).toBe(actor)
    // Compare against the database's own clock (the write stamps updated_at in the same
    // transaction), not the host's: a local Docker DB can drift minutes from the host.
    const verifiedAt = Date.parse(verified?.verifiedAt ?? '')
    expect(verifiedAt).toBe(Date.parse(verified?.updatedAt ?? ''))
    expect(verifiedAt).toBeGreaterThan(Date.parse(created?.updatedAt ?? ''))

    await clearVerification(db, actor, id)
    expect(await getCard(db, id)).toMatchObject({ verifiedAt: null, verifiedBy: null })
    expect(await statusActions(id)).toEqual([
        ['verify', actor],
        ['unverify', actor],
    ])
})

test('saving can clear the verification, and keeps it otherwise', async () => {
    const actor = (await newPerson()).id
    const id = await newCard(actor)
    await markVerified(db, actor, id)
    const card = await getCard(db, id)
    if (!card) throw new Error('saved')
    const input: CardInput = {
        ...card,
        date: { ...moonLanding, day: 21 },
        translations: { en: { text: card.translations.en?.text ?? '' } },
    }

    await saveCard(db, actor, input, id)
    expect((await getCard(db, id))?.verifiedBy).toBe(actor)

    await saveCard(db, actor, { ...input, date: moonLanding, clearVerification: true }, id)
    expect(await getCard(db, id)).toMatchObject({ date: moonLanding, verifiedBy: null })
})

test('an edit that would break the publish rule is refused on a published card', async () => {
    const actor = (await newPerson()).id
    const id = await newCard(actor)
    await publishCard(db, actor, id)
    const card = await getCard(db, id)
    if (!card) throw new Error('saved')
    const english = { en: { text: card.translations.en?.text ?? '' } }

    const yearless = { decade: 1960, year: null, month: null, day: null }
    await expect(
        saveCard(db, actor, { ...card, date: yearless, translations: english }, id),
    ).rejects.toThrow(/publish_blocked/)
    expect((await getCard(db, id))?.date).toEqual(moonLanding)
})
