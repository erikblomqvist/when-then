// AI translation (#41) in the browser, with the model stubbed (src/lib/testing/anthropic-stub.ts
// answers "<LOCALE>: <English text>", and fails for text containing "[fail]"). Each test works
// on its own made-up cards, found by a unique word.

import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { getCard, saveCard } from '../../../../../lib/server/cards'
import { listCategories } from '../../../../../lib/server/categories'
import { localServiceClient, signInAs } from '../../../../../lib/testing/e2e-auth'
import { gotoHydrated } from '../../../../../lib/testing/e2e-hydration'
import { saveAndReopen } from '../../../../../lib/testing/e2e-cards'

const db = localServiceClient()
const word = () => `Ai${randomUUID().slice(0, 8)}`

async function draft(actorId: string, text: string, sv?: string) {
    const [category] = await listCategories(db)
    return saveCard(db, actorId, {
        categoryId: category.id,
        date: { decade: 1890, year: 1895, month: null, day: null },
        sourceUrl: null,
        sourceQuote: null,
        translations: { en: { text }, ...(sv ? { sv: { text: sv } } : {}) },
    })
}

const tab = (page: Page, name: 'Swedish' | 'Norwegian') =>
    page.getByRole('tab', { name: new RegExp(name) })
const panel = (page: Page, name: 'Swedish' | 'Norwegian') =>
    page.getByRole('tabpanel', { name: new RegExp(name) })

test('an editor translates a tab from English: filled, unsaved, saved as machine, logged with its cost', async ({
    page,
}) => {
    const { userId } = await signInAs(page, 'editor')
    const english = `A made-up ${word()} bridge opens`
    const id = await draft(userId, english)

    await gotoHydrated(page, `/admin/cards/${id}`)
    await tab(page, 'Norwegian').click()
    await expect(tab(page, 'Norwegian')).toHaveAttribute('aria-selected', 'true')
    await panel(page, 'Norwegian').getByRole('button', { name: 'Translate from English' }).click()

    await expect(panel(page, 'Norwegian').getByLabel('Norwegian text')).toHaveValue(
        `NB: ${english}`,
    )
    await expect(panel(page, 'Norwegian')).toContainText('Machine when saved')
    // Not saved until the editor saves.
    expect((await getCard(db, id))?.translations.nb).toBeUndefined()

    await saveAndReopen(page)
    expect((await getCard(db, id))?.translations.nb).toEqual({
        text: `NB: ${english}`,
        note: null,
        status: 'machine',
    })

    const history = page.getByRole('region', { name: 'History' })
    await expect(history).toContainText('Machine translated with AI')
    await expect(history).toContainText('$0.002')
})

test('a failed translation says so and leaves the tab as it was', async ({ page }) => {
    const { userId } = await signInAs(page, 'editor')
    const id = await draft(userId, `A made-up ${word()} dam bursts [fail]`)

    await gotoHydrated(page, `/admin/cards/${id}`)
    await panel(page, 'Swedish').getByRole('button', { name: 'Translate from English' }).click()

    await expect(panel(page, 'Swedish').getByRole('alert')).toContainText('The AI request failed')
    await expect(panel(page, 'Swedish').getByLabel('Swedish text')).toHaveValue('')
})

test('bulk translate fills the missing locales of the selected cards and reports failures', async ({
    page,
}) => {
    const { userId } = await signInAs(page, 'editor')
    const unique = word()
    const tower = `A made-up ${unique} tower opens`
    const canal = `A made-up ${unique} canal opens`
    const dam = `A made-up ${unique} dam bursts [fail]`
    const towerId = await draft(userId, tower)
    const canalId = await draft(userId, canal, 'En påhittad kanal öppnas')
    await draft(userId, dam)

    await gotoHydrated(page, `/admin/cards?q=${unique}`)
    for (const text of [tower, canal, dam]) {
        await page.getByRole('checkbox', { name: `Select ${text}` }).check()
    }
    const bar = page.getByRole('region', { name: 'Bulk actions' })
    await expect(bar).toContainText('3 selected')
    await bar.getByRole('button', { name: 'Machine-translate missing' }).click()

    const report = page.getByRole('status')
    await expect(report).toContainText('Machine-translated 2 cards.')
    await expect(report).toContainText('Skipped 1 card')
    await expect(report).toContainText(`${dam}: The AI request failed`)

    expect((await getCard(db, towerId))?.translations).toMatchObject({
        sv: { text: `SV: ${tower}`, status: 'machine' },
        nb: { text: `NB: ${tower}`, status: 'machine' },
    })
    expect((await getCard(db, canalId))?.translations).toMatchObject({
        sv: { text: 'En påhittad kanal öppnas', status: 'reviewed' },
        nb: { text: `NB: ${canal}`, status: 'machine' },
    })
    // The action's redirect drops `?q=`, and other tests' fresh cards can push this one off
    // page 1 of the unfiltered list, so search for it again.
    await gotoHydrated(page, `/admin/cards?q=${unique}`)
    await expect(
        page.getByRole('row').filter({ hasText: tower }).getByTestId('translation-sv'),
    ).toContainText('Machine')
})
