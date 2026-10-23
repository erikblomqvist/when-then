// How the admin's buttons look: less padding on the side with shortcut keycaps, and the card
// editor's actions as one menu of full-width rows (`ContextMenu`) in the right column.

import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { saveCard } from '../../../../../lib/server/cards'
import { listCategories } from '../../../../../lib/server/categories'
import { localServiceClient, signInAs } from '../../../../../lib/testing/e2e-auth'
import { gotoHydrated } from '../../../../../lib/testing/e2e-hydration'

const padding = (element: Element, side: string) =>
    Number.parseFloat(getComputedStyle(element).getPropertyValue(`padding-${side}`))

test('a button with shortcut keys has less padding on the keys’ side', async ({ page }) => {
    await signInAs(page, 'admin')
    await gotoHydrated(page, '/admin/categories/new')
    const save = page.getByRole('button', { name: 'Save', exact: true })
    await expect(save.locator('kbd').first()).toBeVisible()
    expect(await save.evaluate(padding, 'left')).toBeCloseTo(10, 0)
    // Buttons animate their padding, so wait for it to settle.
    await expect.poll(() => save.evaluate(padding, 'right')).toBeCloseTo(7, 0)
})

async function draftPage(page: Page) {
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
    return page
        .getByRole('complementary', { name: 'Card' })
        .getByRole('list', { name: 'Card actions' })
}

for (const [screen, size] of [
    ['a wide screen', { width: 1280, height: 900 }],
    ['a phone', { width: 390, height: 844 }],
] as const) {
    test(`on ${screen}, a draft's actions are one menu of full-width rows`, async ({ page }) => {
        await page.setViewportSize(size)
        const menu = await draftPage(page)
        const rows = menu.getByRole('button')
        await expect(rows).toHaveText([
            /^\s*Save\b/,
            /^\s*Mark date verified\b/,
            /^\s*Publish\b/,
            /^\s*Archive\s*$/,
            /^\s*Delete draft\s*$/,
        ])

        // Each row fills the menu's width, stacked top to bottom.
        const menuBox = await menu.boundingBox()
        let bottom = 0
        for (const row of await rows.all()) {
            const box = await row.boundingBox()
            expect(box?.width).toBeCloseTo((menuBox?.width ?? 0) - 2, 0)
            expect(box?.y ?? 0).toBeGreaterThanOrEqual(bottom)
            bottom = (box?.y ?? 0) + (box?.height ?? 0)
        }

        // Keycaps sit at the row's end.
        const save = menu.getByRole('button', { name: 'Save' })
        const keys = save.locator('kbd').last()
        await expect(keys).toBeVisible()
        const [saveBox, keysBox] = [await save.boundingBox(), await keys.boundingBox()]
        expect(
            (saveBox?.x ?? 0) + (saveBox?.width ?? 0) - (keysBox?.x ?? 0) - (keysBox?.width ?? 0),
        ).toBeLessThan(16)

        // Tones: Publish constructive, Archive caution, Delete draft destructive.
        await expect(menu.getByRole('button', { name: 'Publish' })).toHaveClass(
            /text-tone-constructive/,
        )
        await expect(menu.getByRole('button', { name: 'Archive' })).toHaveClass(/text-tone-caution/)
        await expect(menu.getByRole('button', { name: 'Delete draft' })).toHaveClass(
            /text-tone-destructive/,
        )
    })
}
