// Finding cards in the list: search, filters and sort run on the server and live in the URL.
// Uses the seeded made-up cards; "Sample" matches only those three, whatever other tests save.

import { expect, test, type Page } from '@playwright/test'
import { signInAs } from '../../../../../lib/testing/e2e-auth'

const sampleby = 'The made-up port of Sampleby lights its first lighthouse'
const balloonist = 'A fictional balloonist crosses the Sample Sea'
const samplebridge = 'The made-up Samplebridge opens to horse carts'

const cardTexts = (page: Page) =>
    page.getByRole('table').getByRole('row').getByRole('link').allTextContents()

const listed = async (page: Page) => (await cardTexts(page)).map((text) => text.trim())

test('search finds a card by its text in another language and survives reload', async ({
    page,
}) => {
    await signInAs(page, 'editor')
    await page.goto('/admin/cards')

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

    await page.reload()
    await expect(search).toHaveValue('fyrtorn')
    await expect.poll(() => listed(page)).toEqual([sampleby])
})

test('a filter and a sort narrow and order the list, and the URL keeps them', async ({ page }) => {
    await signInAs(page, 'editor')
    await page.goto('/admin/cards?q=Sample')

    await page.getByLabel('Sort by').selectOption({ label: 'Date, oldest first' })
    await expect(page).toHaveURL(/\?q=Sample&sort=date$/)
    await expect.poll(() => listed(page)).toEqual([sampleby, balloonist, samplebridge])

    await page.getByLabel('Sort by').selectOption({ label: 'Date, newest first' })
    await expect.poll(() => listed(page)).toEqual([samplebridge, balloonist, sampleby])

    await page.getByLabel('Status').selectOption({ label: 'Published' })
    await expect(page).toHaveURL(/\?q=Sample&status=published&sort=-date$/)
    await expect.poll(() => listed(page)).toEqual([samplebridge, sampleby])
    await expect(page.getByTestId('card-count')).toHaveText('2 cards match')

    await page.reload()
    await expect(page.getByLabel('Status')).toHaveValue('published')
    await expect(page.getByLabel('Sort by')).toHaveValue('-date')
    await expect.poll(() => listed(page)).toEqual([samplebridge, sampleby])

    await page.getByRole('link', { name: 'Clear filters' }).click()
    await expect(page).toHaveURL(/\/admin\/cards\?sort=-date$/)
    await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('')
})

test('no matches says so', async ({ page }) => {
    await signInAs(page, 'editor')
    await page.goto('/admin/cards?q=no-such-made-up-card&verified=yes')
    await expect(page.getByText('No cards match these filters.')).toBeVisible()
    await expect(page.getByLabel('Verified')).toHaveValue('yes')
})
