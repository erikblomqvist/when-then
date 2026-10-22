import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { saveCard } from '../../../../../lib/server/cards'
import { listCategories } from '../../../../../lib/server/categories'
import { localServiceClient, signInAs } from '../../../../../lib/testing/e2e-auth'
import { gotoHydrated } from '../../../../../lib/testing/e2e-hydration'
import { saveAndReopen } from '../../../../../lib/testing/e2e-cards'

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

    await gotoHydrated(page, `/admin/cards/${id}`)
    // In the editor's sidebar, below the status actions (#14).
    const history = page
        .getByRole('complementary', { name: 'Card' })
        .getByRole('region', { name: 'History' })
    await expect(history.getByRole('article')).toHaveCount(2)

    const edited = `${text}, seen twice`
    await page.getByLabel('English text').fill(edited)
    await page.getByLabel('Year').fill('1493')
    await saveAndReopen(page)

    // Newest first: the text edit, the date edit, then the two creates.
    const entries = history.getByRole('article')
    await expect(entries).toHaveCount(4)

    const textEdit = entries.nth(0)
    await expect(textEdit.getByRole('heading')).toHaveText('Edited Card text (English)')
    await expect(textEdit).toContainText(email)
    // Each change stacks its field, the old value and the new one, to fit the sidebar.
    const textChange = textEdit.getByRole('listitem').filter({ hasText: 'Text' })
    await expect(textChange.getByRole('deletion')).toHaveText(text)
    await expect(textChange.getByRole('insertion')).toHaveText(edited)

    const dateEdit = entries.nth(1)
    await expect(dateEdit.getByRole('heading')).toHaveText('Edited Card')
    const yearChange = dateEdit.getByRole('listitem').filter({ hasText: 'Year' })
    await expect(yearChange.getByRole('deletion')).toHaveText('1492')
    await expect(yearChange.getByRole('insertion')).toHaveText('1493')
    // Unchanged fields are left out.
    await expect(dateEdit.getByRole('listitem').filter({ hasText: 'Decade' })).toHaveCount(0)

    const creation = entries.nth(3)
    await expect(creation.getByRole('heading')).toHaveText('Created Card')
    await expect(creation.getByRole('listitem').filter({ hasText: 'Category' })).toContainText(
        category.name,
    )
})
