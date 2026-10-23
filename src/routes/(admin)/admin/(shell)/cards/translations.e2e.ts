// Translating a card by hand: the sv and nb tabs, staleness after an English edit, the list's
// badges, the review queue, and the list's review mode (read and mark reviewed in bulk).

import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { getCard, saveCard } from '../../../../../lib/server/cards'
import { listCategories } from '../../../../../lib/server/categories'
import { localServiceClient, signInAs } from '../../../../../lib/testing/e2e-auth'
import { gotoHydrated, reloadHydrated } from '../../../../../lib/testing/e2e-hydration'
import {
    historyPanel,
    openCard,
    openFullHistory,
    saveAndReopen,
    saveInEditor,
} from '../../../../../lib/testing/e2e-cards'

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
    await expect(historyPanel(page)).toContainText('Swedish text')
    await expect(await openFullHistory(page)).toContainText('Card text (Swedish)')
    await page.keyboard.press('Escape')

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

    // The reopened card shows the Swedish tab.
    await tab(page, 'Norwegian').click()
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
    // The queue opens in review mode, the Swedish next to the English.
    await expect(page).toHaveURL(/\/admin\/cards\?sv=needs-review&review=sv$/)
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

test('review mode shows a language next to a reference, and marks the selected cards reviewed', async ({
    page,
}) => {
    const { userId } = await signInAs(page, 'editor')
    const db = localServiceClient()
    const [category] = await listCategories(db)
    const tag = randomUUID().slice(0, 8)
    type Translated = { text: string; status: 'machine' | 'reviewed' }
    const card = (en: string, more: { sv?: Translated; nb?: Translated } = {}) =>
        saveCard(db, userId, {
            categoryId: category.id,
            date: { decade: 1890, year: 1895, month: null, day: null },
            sourceUrl: null,
            sourceQuote: null,
            translations: { en: { text: `${en} ${tag}` }, ...more },
        })
    const kite = await card('A made-up kite flies', {
        sv: { text: 'En påhittad drake flyger', status: 'machine' },
        nb: { text: 'En oppdiktet drage flyr', status: 'machine' },
    })
    await card('A made-up raft floats', {
        sv: { text: 'En påhittad flotte flyter', status: 'machine' },
    })
    const untranslated = await card('A made-up canoe sinks')

    await gotoHydrated(page, `/admin/cards?q=${tag}`)
    const switcher = page.getByRole('group', { name: 'Review translations' })
    await expect(switcher.getByRole('link', { name: 'Off' })).toHaveAttribute(
        'aria-current',
        'true',
    )
    await switcher.getByRole('link', { name: 'Swedish' }).click()
    await expect(page).toHaveURL(`/admin/cards?q=${tag}&review=sv`)

    // The English with the Swedish under it, to read through.
    await expect(page.getByRole('columnheader', { name: 'English and Swedish' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Translations' })).toHaveCount(0)
    const row = (text: string) => page.getByRole('row').filter({ hasText: text })
    const kiteRow = row(`A made-up kite flies ${tag}`)
    await expect(kiteRow.getByTestId('reference')).toHaveText(`en A made-up kite flies ${tag}`)
    await expect(kiteRow.getByTestId('translation')).toContainText('En påhittad drake flyger')
    await expect(kiteRow.getByTestId('translation')).toContainText('Machine')
    await expect(row(`A made-up canoe sinks ${tag}`).getByTestId('translation')).toContainText(
        'Missing',
    )

    // Another reference language: Norwegian next to the Swedish; the search stays.
    const reference = page.getByRole('group', { name: 'Next to' })
    await reference.getByRole('link', { name: 'Norwegian' }).click()
    await expect(page).toHaveURL(`/admin/cards?q=${tag}&review=sv&ref=nb`)
    await expect(page.getByRole('columnheader', { name: 'Norwegian and Swedish' })).toBeVisible()
    await expect(row('En påhittad drake flyger').getByTestId('reference')).toHaveText(
        'nb En oppdiktet drage flyr',
    )
    await reference.getByRole('link', { name: 'English' }).click()
    await expect(page).toHaveURL(`/admin/cards?q=${tag}&review=sv`)

    // Select them all and mark the Swedish reviewed; the untranslated one is skipped.
    await page.getByLabel('Select all cards on this page').check()
    const bar = page.getByRole('region', { name: 'Bulk actions' })
    await bar.getByRole('button', { name: 'Mark Swedish reviewed' }).click()
    await expect(page.getByRole('status')).toContainText('Marked Swedish reviewed on 2 cards.')
    await expect(page.getByRole('status')).toContainText('There is no translation to review.')
    await expect(kiteRow.getByTestId('translation')).toContainText('Reviewed')
    await expect(page).toHaveURL(`/admin/cards?q=${tag}&review=sv`)

    const saved = await getCard(db, kite)
    expect(saved?.translations.sv?.status).toBe('reviewed')
    expect(saved?.translations.nb?.status).toBe('machine')
    expect((await getCard(db, untranslated))?.translations.sv).toBeUndefined()

    // Off: the usual columns again.
    await switcher.getByRole('link', { name: 'Off' }).click()
    await expect(page).toHaveURL(`/admin/cards?q=${tag}`)
    await expect(page.getByRole('columnheader', { name: 'Translations' })).toBeVisible()
})
