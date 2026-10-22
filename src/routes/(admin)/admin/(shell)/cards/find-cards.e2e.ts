// Finding cards in the list: search, filters and sort run on the server and live in the URL.
// Uses the seeded made-up cards; "Sample" matches only those three, whatever other tests save.

import { expect, test, type Page } from '@playwright/test'
import { signInAs } from '../../../../../lib/testing/e2e-auth'
import { gotoHydrated, reloadHydrated } from '../../../../../lib/testing/e2e-hydration'

const sampleby = 'The made-up port of Sampleby lights its first lighthouse'
const balloonist = 'A fictional balloonist crosses the Sample Sea'
const samplebridge = 'The made-up Samplebridge opens to horse carts'

// The body rows only: the header row's sort links are links too.
const cardTexts = (page: Page) =>
    page.getByRole('table').locator('tbody').getByRole('row').getByRole('link').allTextContents()

const listed = async (page: Page) => (await cardTexts(page)).map((text) => text.trim())

test('search finds a card by its text in another language and survives reload', async ({
    page,
}) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards')

    const search = page.getByRole('searchbox', { name: 'Search' })
    await search.fill('fyrtorn')
    await search.press('Enter')

    await expect(page).toHaveURL(/\/admin\/cards\?q=fyrtorn$/)
    await expect.poll(() => listed(page)).toEqual([sampleby])
    const row = page.getByRole('row').filter({ hasText: sampleby })
    await expect(row).toContainText('44 BC')
    await expect(row).toContainText('Places')
    await expect(row).toContainText('Published')
    await expect(row).toContainText('Verified')

    await reloadHydrated(page)
    await expect(search).toHaveValue('fyrtorn')
    await expect.poll(() => listed(page)).toEqual([sampleby])
})

test('a filter and a sort narrow and order the list, and the URL keeps them', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards?q=Sample')

    // Exact, or "Updated" matches too.
    const dateHeader = page.getByRole('columnheader', { name: 'Date', exact: true })
    await dateHeader.getByRole('link').click()
    await expect(page).toHaveURL(/\?q=Sample&sort=date$/)
    await expect(dateHeader).toHaveAttribute('aria-sort', 'ascending')
    await expect.poll(() => listed(page)).toEqual([sampleby, balloonist, samplebridge])

    await dateHeader.getByRole('link').click()
    await expect(page).toHaveURL(/\?q=Sample&sort=-date$/)
    await expect.poll(() => listed(page)).toEqual([samplebridge, balloonist, sampleby])

    // Filters show only once added.
    await expect(page.getByLabel('Status', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Add filter' }).click()
    await page.getByRole('menuitem', { name: 'Status' }).click()
    await page.getByLabel('Status', { exact: true }).selectOption({ label: 'Published' })
    await expect(page).toHaveURL(/\?q=Sample&status=published&sort=-date$/)
    await expect.poll(() => listed(page)).toEqual([samplebridge, sampleby])
    await expect(page.getByTestId('card-count')).toHaveText('2 cards match')

    await reloadHydrated(page)
    await expect(page.getByLabel('Status', { exact: true })).toHaveValue('published')
    await expect(dateHeader).toHaveAttribute('aria-sort', 'descending')
    await expect.poll(() => listed(page)).toEqual([samplebridge, sampleby])

    await page.getByRole('link', { name: 'Remove Status filter' }).click()
    await expect(page).toHaveURL(/\?q=Sample&sort=-date$/)
    await expect(page.getByLabel('Status', { exact: true })).toHaveCount(0)

    await page.getByRole('link', { name: 'Clear filters' }).click()
    await expect(page).toHaveURL(/\/admin\/cards\?sort=-date$/)
    await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('')
})

test('no matches says so', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards?q=no-such-made-up-card&verified=yes')
    await expect(page.getByText('No cards match these filters.')).toBeVisible()
    await expect(page.getByLabel('Verified', { exact: true })).toHaveValue('yes')
})
