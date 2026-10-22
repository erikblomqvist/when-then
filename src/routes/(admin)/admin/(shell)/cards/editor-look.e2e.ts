// The card editor's buttons: less padding on the side with the shortcut keys, and the
// right column's buttons as wide as their label, not the column.

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { saveCard } from '../../../../../lib/server/cards'
import { listCategories } from '../../../../../lib/server/categories'
import { localServiceClient, signInAs } from '../../../../../lib/testing/e2e-auth'
import { gotoHydrated } from '../../../../../lib/testing/e2e-hydration'

const padding = (element: Element, side: string) =>
    Number.parseFloat(getComputedStyle(element).getPropertyValue(`padding-${side}`))

test('a button with shortcut keys has less padding on the keys’ side', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards/new')
    const save = page.getByRole('button', { name: 'Save', exact: true })
    await expect(save.locator('kbd').first()).toBeVisible()
    expect(await save.evaluate(padding, 'left')).toBeCloseTo(10, 0)
    // Buttons animate their padding, so wait for it to settle.
    await expect.poll(() => save.evaluate(padding, 'right')).toBeCloseTo(7, 0)
})

test('the right column’s buttons are not stretched to its width', async ({ page }) => {
    const db = localServiceClient()
    const { userId } = await signInAs(page, 'admin')
    const [category] = await listCategories(db)
    const id = await saveCard(db, userId, {
        categoryId: category.id,
        date: { decade: 1960, year: 1969, month: null, day: null },
        sourceUrl: null,
        sourceQuote: null,
        translations: { en: { text: `A made-up kite rises ${randomUUID().slice(0, 8)}` } },
    })
    await gotoHydrated(page, `/admin/cards/${id}`)
    const sidebar = page.getByRole('complementary', { name: 'Card' })
    const width = (await sidebar.boundingBox())?.width ?? 0
    for (const name of ['Publish', 'Delete draft', 'Mark date verified']) {
        const button = sidebar.getByRole('button', { name, exact: true })
        expect((await button.boundingBox())?.width ?? width).toBeLessThan(width - 1)
    }
})
