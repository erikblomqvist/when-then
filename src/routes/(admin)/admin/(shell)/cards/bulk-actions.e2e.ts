// Bulk actions in the card list: select rows (or every card matching the filter) and publish,
// archive or move them in one go. Each test works on its own made-up cards, found by a unique
// word, so parallel tests don't see each other's cards.

import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { parseCsvRecords } from '../../../../../lib/cards/card-csv'
import type { ExportedCard } from '../../../../../lib/cards/card-export'
import type { DateParts } from '../../../../../lib/cards/date-parts'
import { publishCards } from '../../../../../lib/server/card-bulk'
import { getCard, saveCard } from '../../../../../lib/server/cards'
import { listCategories } from '../../../../../lib/server/categories'
import { localServiceClient, signInAs } from '../../../../../lib/testing/e2e-auth'
import { gotoHydrated } from '../../../../../lib/testing/e2e-hydration'

const db = localServiceClient()
const year1969: DateParts = { decade: 1960, year: 1969, month: null, day: null }
const decade1960: DateParts = { decade: 1960, year: null, month: null, day: null }

/** A draft written as `actorId`, straight through the repository. */
async function draft(actorId: string, text: string, date: DateParts = year1969) {
    const [category] = await listCategories(db)
    return saveCard(db, actorId, {
        categoryId: category.id,
        date,
        sourceUrl: null,
        sourceQuote: null,
        translations: { en: { text } },
    })
}

async function auditedActions(cardIds: string[]) {
    const { data } = await db
        .from('audit_log')
        .select('entity_id, action, actor_id')
        .eq('entity', 'card')
        .neq('action', 'create')
        .in('entity_id', cardIds)
        .order('id')
    return (data ?? []).map((row) => [row.entity_id, row.action, row.actor_id])
}

const word = () => `Bulk${randomUUID().slice(0, 8)}`
const pick = (page: Page, text: string) =>
    page.getByRole('checkbox', { name: `Select ${text}` }).check()
const bulkBar = (page: Page) => page.getByRole('region', { name: 'Bulk actions' })

test('an editor publishes picked cards; one the rule blocks is skipped with the reason', async ({
    page,
}) => {
    const { userId } = await signInAs(page, 'editor')
    const unique = word()
    const kite = `A made-up ${unique} kite`
    const raft = `A made-up ${unique} raft`
    const canoe = `A made-up ${unique} canoe`
    const ids = [await draft(userId, kite), await draft(userId, raft)]
    const blocked = await draft(userId, canoe, decade1960)
    await draft(userId, `A made-up ${unique} glider`)

    await gotoHydrated(page, `/admin/cards?q=${unique}`)
    await expect(bulkBar(page)).toBeHidden()
    await pick(page, kite)
    await pick(page, raft)
    await pick(page, canoe)
    await expect(bulkBar(page)).toContainText('3 selected')
    await bulkBar(page).getByRole('button', { name: 'Publish' }).click()

    const report = page.getByRole('status')
    await expect(report).toContainText('Published 2 cards.')
    await expect(report).toContainText('Skipped 1 card')
    await expect(report.getByRole('listitem')).toHaveText(
        `${canoe}: Cards from 1500 onwards need a year.`,
    )
    await expect(report.getByRole('link', { name: canoe })).toHaveAttribute(
        'href',
        `/admin/cards/${blocked}`,
    )
    await expect(page.getByRole('row').filter({ hasText: kite })).toContainText('Published')
    await expect(page.getByRole('row').filter({ hasText: canoe })).toContainText('Draft')
    await expect(bulkBar(page)).toBeHidden()

    expect(await auditedActions([...ids, blocked])).toEqual(
        ids.map((id) => [id, 'publish', userId]),
    )
})

test('select all matching reaches cards on other pages, and archives every one', async ({
    page,
}) => {
    test.setTimeout(60_000)
    const { userId } = await signInAs(page, 'editor')
    const unique = word()
    const ids: string[] = []
    for (let n = 1; n <= 52; n++) ids.push(await draft(userId, `A made-up ${unique} kite ${n}`))
    await publishCards(db, userId, ids)

    await gotoHydrated(page, `/admin/cards?q=${unique}`)
    await page.getByRole('checkbox', { name: 'Select all cards on this page' }).check()
    await expect(bulkBar(page)).toContainText('50 selected')
    await bulkBar(page).getByRole('button', { name: 'Select all 52 matching cards' }).click()
    await expect(bulkBar(page)).toContainText('All 52 matching cards selected')

    // Export selected sends the filter, so it reaches the second page too.
    const exported = await exportSelected(page)
    expect(new Set(parseCsvRecords(exported.text).records.map((record) => record.id))).toEqual(
        new Set(ids),
    )

    await bulkBar(page).getByRole('button', { name: 'Archive' }).click()
    await expect(page.getByRole('status')).toContainText('Archived 52 cards.')

    const statuses = await Promise.all(ids.map(async (id) => (await getCard(db, id))?.status))
    expect(new Set(statuses)).toEqual(new Set(['archived']))
    const archived = (await auditedActions(ids)).filter(([, action]) => action === 'archive')
    expect(archived).toHaveLength(52)
    expect(new Set(archived.map(([id]) => id))).toEqual(new Set(ids))
})

test('an editor moves picked cards to another category', async ({ page }) => {
    const { userId } = await signInAs(page, 'editor')
    const categories = await listCategories(db)
    const target = categories[1]
    const unique = word()
    const kite = `A made-up ${unique} kite`
    const raft = `A made-up ${unique} raft`
    const ids = [await draft(userId, kite), await draft(userId, raft)]

    await gotoHydrated(page, `/admin/cards?q=${unique}`)
    await pick(page, kite)
    await pick(page, raft)
    await bulkBar(page).getByLabel('Move to').selectOption({ label: target.name })
    await bulkBar(page).getByRole('button', { name: 'Move' }).click()

    await expect(page.getByRole('status')).toContainText(`Moved 2 cards to ${target.name}.`)
    await expect(page.getByRole('row').filter({ hasText: kite })).toContainText(target.name)
    for (const id of ids) expect((await getCard(db, id))?.categoryId).toBe(target.id)
    expect(await auditedActions(ids)).toEqual(ids.map((id) => [id, 'update', userId]))
})

async function exportSelected(page: Page) {
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        bulkBar(page).getByRole('button', { name: 'Export selected' }).click(),
    ])
    return {
        name: download.suggestedFilename(),
        text: await readFile(await download.path(), 'utf8'),
    }
}

test('an editor exports the picked cards, or every matching card, from the selection bar', async ({
    page,
}) => {
    const { userId } = await signInAs(page, 'editor')
    const unique = word()
    const kite = `A made-up ${unique} kite`
    const raft = `A made-up ${unique} raft`
    const ids = [await draft(userId, kite), await draft(userId, raft)]
    const glider = await draft(userId, `A made-up ${unique} glider`)

    await gotoHydrated(page, `/admin/cards?q=${unique}`)
    await pick(page, kite)
    await pick(page, raft)
    await bulkBar(page).getByLabel('Export as').selectOption({ label: 'JSON' })
    const picked = await exportSelected(page)
    expect(picked.name).toMatch(/\.json$/)
    const cards = JSON.parse(picked.text) as ExportedCard[]
    expect(cards.map((card) => card.id).sort()).toEqual([...ids].sort())

    // Still on the list, selection intact: select the whole (one-page) list via the header.
    await expect(bulkBar(page)).toContainText('2 selected')
    await page.getByRole('checkbox', { name: 'Select all cards on this page' }).check()
    await bulkBar(page).getByLabel('Export as').selectOption({ label: 'CSV' })
    const all = await exportSelected(page)
    expect(
        parseCsvRecords(all.text)
            .records.map((record) => record.id)
            .sort(),
    ).toEqual([...ids, glider].sort())
})
