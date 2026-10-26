// Suspected duplicates in the admin: the card list's filter for cards sharing their English text
// with another, and the editor's warning while a text another card has is typed.

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { archiveCard } from '../../../../../lib/server/card-lifecycle'
import { saveCard } from '../../../../../lib/server/cards'
import { listCategories } from '../../../../../lib/server/categories'
import { localServiceClient, signInAs } from '../../../../../lib/testing/e2e-auth'
import { gotoHydrated } from '../../../../../lib/testing/e2e-hydration'

const db = localServiceClient()

async function cardMaker(userId: string) {
    const [category] = await listCategories(db)
    return (text: string) =>
        saveCard(db, userId, {
            categoryId: category.id,
            date: { decade: 1940, year: 1945, month: 8, day: 6 },
            sourceUrl: null,
            sourceQuote: null,
            translations: { en: { text } },
        })
}

test('the list filters to suspected duplicates, and the filter stays in the URL', async ({
    page,
}) => {
    const { userId } = await signInAs(page, 'editor')
    const card = await cardMaker(userId)
    const tag = randomUUID().slice(0, 8)
    const bomb = `A made-up bomb is dropped ${tag}`
    await card(bomb)
    await card(`${bomb}.`)
    const retired = `A made-up treaty is signed ${tag}`
    await card(retired)
    await archiveCard(db, userId, await card(retired))
    await card(`A made-up city is rebuilt ${tag}`)

    await gotoHydrated(page, `/admin/cards?q=${tag}`)
    await expect(page.getByTestId('card-count')).toHaveText('4 cards match')
    await page.getByRole('button', { name: 'Add filter' }).click()
    await page.getByRole('menuitem', { name: 'Duplicates' }).click()
    await page.getByLabel('Duplicates', { exact: true }).selectOption({
        label: 'Suspected duplicates',
    })
    await expect(page).toHaveURL(`/admin/cards?q=${tag}&duplicates=yes`)
    // The bomb twice; the treaty's twin is archived, so it no longer counts.
    await expect(page.getByTestId('card-count')).toHaveText('2 cards match')
    await expect(page.getByRole('row').filter({ hasText: bomb })).toHaveCount(2)
})

test('the editor warns while the English text is one another card has', async ({ page }) => {
    const { userId } = await signInAs(page, 'editor')
    const card = await cardMaker(userId)
    const bomb = `A made-up bomb is dropped ${randomUUID().slice(0, 8)}`
    const existing = await card(bomb)

    await gotoHydrated(page, '/admin/cards/new')
    const warning = page.getByRole('status').filter({ hasText: 'the same text' })
    await page.getByLabel('English text').fill(`${bomb.toUpperCase()}!`)
    await expect(warning).toContainText('Another card has the same text:')
    await expect(warning.getByRole('link', { name: bomb })).toHaveAttribute(
        'href',
        `/admin/cards/${existing}`,
    )
    await page.getByLabel('English text').fill(`${bomb}, again`)
    await expect(warning).toHaveCount(0)

    // Its own card doesn't count.
    await gotoHydrated(page, `/admin/cards/${existing}`)
    await expect(page.getByLabel('English text')).toHaveValue(bomb)
    const asked = page.waitForResponse((response) => response.url().includes('/same-text?'))
    await page.getByLabel('English text').fill(`${bomb}.`)
    expect(await (await asked).json()).toEqual({ cards: [] })
    await expect(warning).toHaveCount(0)
})
