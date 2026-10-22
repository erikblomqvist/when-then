import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { localServiceClient, signInAs } from '../../../../../lib/testing/e2e-auth'
import { gotoHydrated, reloadHydrated } from '../../../../../lib/testing/e2e-hydration'

const unique = (text: string) => `${text} ${randomUUID().slice(0, 8)}`

const cardRow = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text })

// Other tests add cards in parallel (dozens at once), so a fresh card may not be on page 1 of
// the unfiltered list: look it up by its text.
const findCard = (text: string) => `/admin/cards?q=${encodeURIComponent(text)}`

async function createCard(page: Page, text: string) {
    await gotoHydrated(page, '/admin/cards')
    await page.getByRole('link', { name: 'New card' }).click()
    await expect(page.getByRole('heading', { name: 'New card' })).toBeVisible()

    await page.getByLabel('English text').fill(text)
    await page.getByLabel('Year').fill('1492')
    await page.getByLabel('Category').selectOption({ label: 'Inventions' })
    await page.getByLabel('Source URL').fill('https://example.com/made-up')
    await page.getByLabel('Source quote').fill('It was made up in 1492.')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('heading', { name: 'Edit card' })).toBeVisible()
    return page.url().split('/').pop() ?? ''
}

test('an editor creates a draft card and sees it in the list', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin')
    await page
        .getByRole('navigation', { name: 'Admin' })
        .getByRole('link', { name: 'Cards' })
        .click()
    await expect(page.getByRole('heading', { name: 'Cards', level: 1 })).toBeVisible()

    const text = unique('A made-up clock runs on rain')
    await createCard(page, text)
    await expect(page.getByTestId('card-status')).toHaveText('Draft')

    await page
        .getByRole('navigation', { name: 'Admin' })
        .getByRole('link', { name: 'Cards' })
        .click()
    await expect(page.getByRole('heading', { name: 'Cards', level: 1 })).toBeVisible()
    await gotoHydrated(page, findCard(text))
    const row = cardRow(page, text)
    await expect(row).toContainText('1492')
    await expect(row).toContainText('Inventions')
    await expect(row).toContainText('Draft')
})

test('entering a year fills the decade; a decade can be entered alone', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards/new')

    await page.getByLabel('Year').fill('1492')
    await expect(page.getByLabel('Decade')).toHaveValue('1490')
    await expect(page.getByLabel('Decade')).toBeDisabled()

    await page.getByLabel('Year').fill('')
    await expect(page.getByLabel('Decade')).toBeEnabled()
    const text = unique('A made-up harvest race')
    await page.getByLabel('English text').fill(text)
    await page.getByLabel('Era').selectOption('BC')
    await page.getByLabel('Decade').fill('490')
    await page.getByLabel('Category').selectOption({ label: 'Events' })
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { name: 'Edit card' })).toBeVisible()

    await gotoHydrated(page, findCard(text))
    await expect(cardRow(page, text)).toContainText('490s BC')
})

test('the editor shows what is wrong and keeps what was typed', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards/new')

    await page.getByLabel('English text').fill('A made-up moon landing')
    await page.getByLabel('Year').fill('1969')
    await page.getByLabel('Day').fill('20')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('A day needs a month.')).toBeVisible()
    await expect(page.getByText('Pick a category.')).toBeVisible()
    await expect(page.getByLabel('English text')).toHaveValue('A made-up moon landing')
    await expect(page.getByRole('heading', { name: 'New card' })).toBeVisible()
})

test('an editor edits a card, and the change is audited with who did it', async ({ page }) => {
    const { userId } = await signInAs(page, 'editor')
    const text = unique('A made-up comet visits')
    const id = await createCard(page, text)

    const edited = unique('A made-up comet visits twice')
    await page.getByLabel('English text').fill(edited)
    await page.getByLabel('Month').selectOption({ label: 'March' })
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Saved.')

    await reloadHydrated(page)
    await expect(page.getByLabel('English text')).toHaveValue(edited)
    await expect(page.getByLabel('Month')).toHaveValue('3')

    await gotoHydrated(page, findCard(edited))
    await expect(cardRow(page, edited)).toContainText('March 1492')

    const { data } = await localServiceClient()
        .from('audit_log')
        .select('entity, action, actor_id, before, after')
        .eq('entity_id', id)
        .eq('action', 'update')
    expect(data).toHaveLength(2)
    expect(data?.every((row) => row.actor_id === userId)).toBe(true)
    expect(data).toContainEqual(
        expect.objectContaining({
            entity: 'card_translation',
            before: expect.objectContaining({ text }),
            after: expect.objectContaining({ text: edited }),
        }),
    )
})

test('leaving with unsaved changes asks first', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards/new')
    const cards = page
        .getByRole('navigation', { name: 'Admin' })
        .getByRole('link', { name: 'Cards' })

    // No changes: leaves without asking.
    await cards.click()
    await expect(page.getByRole('heading', { name: 'Cards', level: 1 })).toBeVisible()

    await gotoHydrated(page, '/admin/cards/new')
    await page.getByLabel('English text').fill('A made-up unsaved thought')

    const dialogs: string[] = []
    let answer: 'accept' | 'dismiss' = 'dismiss'
    page.on('dialog', (dialog) => {
        dialogs.push(dialog.message())
        void dialog[answer]()
    })
    await cards.click()
    await expect
        .poll(() => dialogs)
        .toEqual(['You have unsaved changes. Leave without saving them?'])
    await expect(page.getByRole('heading', { name: 'New card' })).toBeVisible()
    await expect(page.getByLabel('English text')).toHaveValue('A made-up unsaved thought')

    answer = 'accept'
    await cards.click()
    await expect(page.getByRole('heading', { name: 'Cards', level: 1 })).toBeVisible()
    expect(dialogs).toHaveLength(2)
})

test('an unknown card is a 404', async ({ page }) => {
    await signInAs(page, 'editor')
    const response = await page.goto(`/admin/cards/${randomUUID()}`)
    expect(response?.status()).toBe(404)
})
