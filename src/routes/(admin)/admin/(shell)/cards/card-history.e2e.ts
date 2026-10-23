// A card's history: the sidebar sums up the last three saves, one line each; a dialog shows
// every entry with its field-by-field diff.

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { publishCard } from '../../../../../lib/server/card-lifecycle'
import { saveCard } from '../../../../../lib/server/cards'
import { listCategories } from '../../../../../lib/server/categories'
import { localServiceClient, signInAs } from '../../../../../lib/testing/e2e-auth'
import { gotoHydrated } from '../../../../../lib/testing/e2e-hydration'
import { historyPanel, openFullHistory, saveAndReopen } from '../../../../../lib/testing/e2e-cards'

const db = localServiceClient()

test("a card's history sums up each save, with the diffs in a dialog", async ({ page }) => {
    const { email, userId } = await signInAs(page, 'editor')
    const [category] = await listCategories(db)
    const text = `A made-up eclipse ${randomUUID().slice(0, 8)}`
    const id = await saveCard(db, userId, {
        categoryId: category.id,
        date: { decade: 1490, year: 1492, month: null, day: null },
        sourceUrl: null,
        sourceQuote: null,
        translations: { en: { text } },
    })

    await gotoHydrated(page, `/admin/cards/${id}`)
    // In the editor's sidebar, below the status actions (#14). Creating the card wrote it and
    // its English text: one save, one line.
    const changes = historyPanel(page).getByRole('listitem')
    await expect(changes).toHaveCount(1)
    await expect(changes.first()).toContainText('Created')
    await expect(changes.first()).toContainText(email)
    await expect(changes.first()).toContainText('just now')

    const edited = `${text}, seen twice`
    await page.getByLabel('English text').fill(edited)
    await page.getByLabel('Year').fill('1493')
    await saveAndReopen(page)

    // Newest first; the save changed the text and the year, named without their values.
    await expect(changes).toHaveCount(2)
    await expect(changes.first()).toContainText('Edited English text, Year')
    await expect(historyPanel(page)).not.toContainText('1493')
    await expect(historyPanel(page).getByRole('button', { name: /^Show all/ })).toHaveCount(0)

    // The dialog has every entry: the text edit, the date edit, then the two creates.
    const dialog = await openFullHistory(page)
    const entries = dialog.getByRole('article')
    await expect(entries).toHaveCount(4)

    const textEdit = entries.nth(0)
    await expect(textEdit.getByRole('heading')).toHaveText('Edited Card text (English)')
    await expect(textEdit).toContainText(email)
    const textChange = textEdit.getByRole('row').filter({ hasText: 'Text' })
    await expect(textChange.getByRole('deletion')).toHaveText(text)
    await expect(textChange.getByRole('insertion')).toHaveText(edited)

    const dateEdit = entries.nth(1)
    await expect(dateEdit.getByRole('heading')).toHaveText('Edited Card')
    const yearChange = dateEdit.getByRole('row').filter({ hasText: 'Year' })
    await expect(yearChange.getByRole('deletion')).toHaveText('1492')
    await expect(yearChange.getByRole('insertion')).toHaveText('1493')
    // Unchanged fields are left out.
    await expect(dateEdit.getByRole('row').filter({ hasText: 'Decade' })).toHaveCount(0)

    const creation = entries.nth(3)
    await expect(creation.getByRole('heading')).toHaveText('Created Card')
    await expect(creation.getByRole('row').filter({ hasText: 'Category' })).toContainText(
        category.name,
    )

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeHidden()
})

test('the sidebar shows the last three saves; Show all and each save open the dialog', async ({
    page,
}) => {
    const { userId } = await signInAs(page, 'editor')
    const [category, other] = await listCategories(db)
    const card = {
        categoryId: category.id,
        date: { decade: 1960, year: 1968, month: null, day: null },
        sourceUrl: null,
        sourceQuote: null,
        translations: { en: { text: `A made-up landing ${randomUUID().slice(0, 8)}` } },
    }
    const id = await saveCard(db, userId, card)
    await saveCard(db, userId, { ...card, date: { ...card.date, year: 1969 } }, id)
    await saveCard(
        db,
        userId,
        { ...card, date: { ...card.date, year: 1969 }, categoryId: other.id },
        id,
    )
    await publishCard(db, userId, id)

    await gotoHydrated(page, `/admin/cards/${id}`)
    const changes = historyPanel(page).getByRole('listitem')
    await expect(changes).toHaveCount(3)
    await expect(changes.nth(0)).toContainText('Published')
    await expect(changes.nth(1)).toContainText('Edited Category')
    await expect(changes.nth(2)).toContainText('Edited Year')

    await historyPanel(page).getByRole('button', { name: 'Show all 4 changes' }).click()
    const dialog = page.getByRole('dialog', { name: 'History' })
    await expect(dialog.getByRole('article')).toHaveCount(5)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    // A save in the sidebar opens the dialog at that save's entry, highlighted for a moment.
    await changes.nth(2).getByRole('button').click()
    const focused = dialog.locator('li:focus')
    await expect(focused.getByRole('heading')).toHaveText('Edited Card')
    await expect(focused.getByRole('row').filter({ hasText: 'Year' })).toBeVisible()
    await expect(focused).toBeInViewport()
    // It flashes, then the highlight fades away.
    await expect(focused).toHaveClass(/\bflash\b/)
    await expect(focused).not.toHaveClass(/\bflash\b/)
})
