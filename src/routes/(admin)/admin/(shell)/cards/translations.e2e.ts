// Translating a card by hand: the sv and nb tabs, staleness after an English edit, the list's
// badges and the review queue.

import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { saveCard } from '../../../../../lib/server/cards'
import { listCategories } from '../../../../../lib/server/categories'
import { localServiceClient, signInAs } from '../../../../../lib/testing/e2e-auth'
import { gotoHydrated, reloadHydrated } from '../../../../../lib/testing/e2e-hydration'
import { openCard, saveAndReopen, saveInEditor } from '../../../../../lib/testing/e2e-cards'

const unique = (text: string) => `${text} ${randomUUID().slice(0, 8)}`

const tab = (page: Page, name: 'Swedish' | 'Norwegian') =>
    page.getByRole('tab', { name: new RegExp(name) })
const panel = (page: Page, name: 'Swedish' | 'Norwegian') =>
    page.getByRole('tabpanel', { name: new RegExp(name) })

async function createCard(page: Page, text: string) {
    await gotoHydrated(page, '/admin/cards/new')
    await page.getByLabel('English text').fill(text)
    await page.getByLabel('Year').fill('1895')
    await page.getByLabel('Category').selectOption({ label: 'Events' })
    await saveInEditor(page)
    return openCard(page, text)
}

async function save(page: Page) {
    await saveAndReopen(page)
}

const listRow = async (page: Page, text: string) => {
    await gotoHydrated(page, `/admin/cards?q=${encodeURIComponent(text)}`)
    return page.getByRole('row').filter({ hasText: text })
}

test('an editor translates a card into Swedish, with a note, and it is reviewed', async ({
    page,
}) => {
    await signInAs(page, 'editor')
    const text = unique('A made-up bridge opens')
    await createCard(page, text)

    await expect(tab(page, 'Swedish')).toContainText('Missing')
    await tab(page, 'Swedish').click()
    await panel(page, 'Swedish').getByLabel('Swedish text').fill('En påhittad bro öppnas')
    await panel(page, 'Swedish').getByLabel('Swedish note').fill('Bro, inte brygga')
    await expect(panel(page, 'Swedish')).toContainText('Reviewed when saved')
    await save(page)

    await expect(tab(page, 'Swedish')).toContainText('Reviewed')
    await expect(tab(page, 'Norwegian')).toContainText('Missing')
    await reloadHydrated(page)
    await tab(page, 'Swedish').click()
    await expect(panel(page, 'Swedish').getByLabel('Swedish text')).toHaveValue(
        'En påhittad bro öppnas',
    )
    await expect(panel(page, 'Swedish').getByLabel('Swedish note')).toHaveValue('Bro, inte brygga')
    await expect(page.getByRole('region', { name: 'History' })).toContainText('Card text (Swedish)')

    const row = await listRow(page, text)
    await expect(row.getByTestId('translation-sv')).toHaveText(/Reviewed/)
    await expect(row.getByTestId('translation-nb')).toHaveText(/Missing/)
})

test('editing the English text makes a reviewed translation stale; ticking reviewed clears it', async ({
    page,
}) => {
    await signInAs(page, 'editor')
    const text = unique('A made-up ferry sails')
    const id = await createCard(page, text)
    await tab(page, 'Norwegian').click()
    await panel(page, 'Norwegian').getByLabel('Norwegian text').fill('En oppdiktet ferje seiler')
    await save(page)
    await expect(tab(page, 'Norwegian')).toContainText('Reviewed')

    await page.getByLabel('English text').fill(`${text}, at night`)
    await expect(panel(page, 'Norwegian')).toContainText('Stale when saved')
    await save(page)
    await expect(tab(page, 'Norwegian')).toContainText('Stale')
    await expect(await listRow(page, text)).toContainText('Stale')

    await gotoHydrated(page, `/admin/cards/${id}`)
    await tab(page, 'Norwegian').click()
    await panel(page, 'Norwegian').getByLabel('Reviewed').check()
    await save(page)
    await expect(tab(page, 'Norwegian')).toContainText('Reviewed')
    await expect((await listRow(page, text)).getByTestId('translation-nb')).toHaveText(/Reviewed/)
})

test('the review queue lists machine translations until someone reviews them', async ({ page }) => {
    const { userId } = await signInAs(page, 'editor')
    const db = localServiceClient()
    const [category] = await listCategories(db)
    const text = unique('A made-up kite flies')
    const id = await saveCard(db, userId, {
        categoryId: category.id,
        date: { decade: 1890, year: 1895, month: null, day: null },
        sourceUrl: null,
        sourceQuote: null,
        translations: { en: { text }, sv: { text: 'En påhittad drake flyger', status: 'machine' } },
    })

    await gotoHydrated(page, '/admin/cards')
    await page.getByRole('link', { name: 'Swedish review queue' }).click()
    await expect(page).toHaveURL(/\/admin\/cards\?sv=needs-review$/)
    await expect(page.getByLabel('Swedish', { exact: true })).toHaveValue('needs-review')
    await page.getByRole('searchbox', { name: 'Search' }).fill(text)
    await page.getByRole('searchbox', { name: 'Search' }).press('Enter')
    await expect(page.getByRole('row').filter({ hasText: text })).toContainText('Machine')

    await page.getByRole('link', { name: text }).click()
    await expect(page).toHaveURL(new RegExp(id))
    await tab(page, 'Swedish').click()
    await panel(page, 'Swedish').getByLabel('Reviewed').check()
    await save(page)

    await gotoHydrated(page, `/admin/cards?q=${encodeURIComponent(text)}&sv=needs-review`)
    await expect(page.getByRole('row').filter({ hasText: text })).toHaveCount(0)
    await page.getByLabel('Swedish', { exact: true }).selectOption({ label: 'Reviewed' })
    await expect(page).toHaveURL(/sv=reviewed/)
    await expect(page.getByRole('row').filter({ hasText: text })).toHaveCount(1)
})
