import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { saveCard } from '../../../../../lib/server/cards'
import { listCategories } from '../../../../../lib/server/categories'
import { localServiceClient, signInAs } from '../../../../../lib/testing/e2e-auth'

const db = localServiceClient()

test("a card's history shows who changed what, field by field", async ({ page }) => {
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

    await page.goto(`/admin/cards/${id}`)
    const history = page.getByRole('region', { name: 'History' })
    await expect(history.getByRole('article')).toHaveCount(2)

    const edited = `${text}, seen twice`
    await page.getByLabel('English text').fill(edited)
    await page.getByLabel('Year').fill('1493')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Saved.')

    // Newest first: the text edit, the date edit, then the two creates.
    const entries = history.getByRole('article')
    await expect(entries).toHaveCount(4)

    const textEdit = entries.nth(0)
    await expect(textEdit.getByRole('heading')).toHaveText('Edited Card text (English)')
    await expect(textEdit).toContainText(email)
    const textRow = textEdit.getByRole('row').filter({ hasText: 'Text' })
    await expect(textRow.getByRole('cell').nth(0)).toHaveText(text)
    await expect(textRow.getByRole('cell').nth(1)).toHaveText(edited)

    const dateEdit = entries.nth(1)
    await expect(dateEdit.getByRole('heading')).toHaveText('Edited Card')
    const yearRow = dateEdit.getByRole('row').filter({ hasText: 'Year' })
    await expect(yearRow.getByRole('cell')).toHaveText(['1492', '1493'])
    // Unchanged fields are left out.
    await expect(dateEdit.getByRole('row').filter({ hasText: 'Decade' })).toHaveCount(0)

    const creation = entries.nth(3)
    await expect(creation.getByRole('heading')).toHaveText('Created Card')
    await expect(creation.getByRole('row').filter({ hasText: 'Category' })).toContainText(
        category.name,
    )
})
