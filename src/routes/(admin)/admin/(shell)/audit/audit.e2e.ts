import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { saveCard } from '../../../../../lib/server/cards'
import { listCategories } from '../../../../../lib/server/categories'
import { localServiceClient, signInAs } from '../../../../../lib/testing/e2e-auth'
import { gotoHydrated } from '../../../../../lib/testing/e2e-hydration'

const db = localServiceClient()

// Someone else's work for the log to show: a card created, then its text edited.
async function cardByAnotherEditor() {
    const email = `editor-${randomUUID()}@example.com`
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true })
    if (error) throw error
    const [category] = await listCategories(db)
    const card = (text: string) => ({
        categoryId: category.id,
        date: { decade: 1960, year: 1969, month: null, day: null },
        sourceUrl: null,
        sourceQuote: null,
        translations: { en: { text } },
    })
    const id = await saveCard(db, data.user.id, card('A made-up first flight'))
    await saveCard(db, data.user.id, card('A made-up first flight, edited'), id)
    return { email, cardId: id }
}

test('an admin reads the global log and filters it by person, entity and action', async ({
    page,
}) => {
    await signInAs(page, 'admin')
    const { email, cardId } = await cardByAnotherEditor()

    await gotoHydrated(page, '/admin')
    await page
        .getByRole('navigation', { name: 'Admin' })
        .getByRole('link', { name: 'Audit log' })
        .click()
    await expect(page.getByRole('heading', { name: 'Audit log', level: 1 })).toBeVisible()

    await page.getByLabel('Person').selectOption({ label: email })
    await page.getByRole('button', { name: 'Filter' }).click()
    const entries = page.getByRole('article')
    await expect(entries).toHaveCount(3)
    for (const entry of await entries.all()) await expect(entry).toContainText(email)

    await page.getByLabel('Action').selectOption({ label: 'Edited' })
    await page.getByRole('button', { name: 'Filter' }).click()
    await expect(page).toHaveURL(/action=update/)
    await expect(entries).toHaveCount(1)
    await expect(entries.first().getByRole('heading')).toHaveText('Edited Card text (English)')
    const textRow = entries.first().getByRole('row').filter({ hasText: 'Text' })
    await expect(textRow.getByRole('cell')).toHaveText([
        'A made-up first flight',
        'A made-up first flight, edited',
    ])

    await page.getByLabel('Action').selectOption({ label: 'Any action' })
    await page.getByLabel('Entity').selectOption({ label: 'Card' })
    await page.getByRole('button', { name: 'Filter' }).click()
    await expect(entries).toHaveCount(1)
    await expect(entries.first().getByRole('heading')).toHaveText('Created Card')

    await entries.first().getByRole('link', { name: 'Open card' }).click()
    await expect(page).toHaveURL(`/admin/cards/${cardId}`)
})

test('editors cannot reach the global log', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin')
    await expect(
        page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Audit log' }),
    ).toHaveCount(0)

    const response = await page.goto('/admin/audit')
    expect(response?.status()).toBe(403)
})
