// "Add from photo" (#60) on a phone-sized screen, with the model stubbed
// (src/lib/testing/anthropic-stub.ts reads any photo into three made-up cards: one in the
// first category dated from the photo, one needing a new category with an AI-suggested date,
// and one without a date).

import { expect, test } from '@playwright/test'
import { getCard } from '../../../../../lib/server/cards'
import { localServiceClient, signInAs } from '../../../../../lib/testing/e2e-auth'
import { gotoHydrated } from '../../../../../lib/testing/e2e-hydration'

const db = localServiceClient()

// A 1×1 PNG: the stub answers the same whatever the image.
const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
)

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

test('an admin photographs a page on their phone, creates the suggested category and saves the cards as drafts', async ({
    page,
}) => {
    await signInAs(page, 'admin')
    await gotoHydrated(page, '/admin/cards')
    await page.getByRole('link', { name: 'Add from photo' }).click()
    await expect(page.getByRole('heading', { name: 'Add from photo' })).toBeVisible()

    await page.getByLabel('Choose image').setInputFiles({
        name: 'page.png',
        mimeType: 'image/png',
        buffer: pixel,
    })

    const candidates = page.getByTestId('candidate')
    await expect(candidates).toHaveCount(3)
    const [warship, telescope, kingdom] = [candidates.nth(0), candidates.nth(1), candidates.nth(2)]
    await expect(warship).toContainText('A made-up warship sinks')
    await expect(warship).toContainText('1628')
    await expect(telescope).toContainText('AI-suggested date')
    await expect(telescope).toContainText('No matching category')
    await expect(kingdom).toContainText('Date needed')

    // Nothing wider than the phone.
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
    ).toBe(true)

    // Saving waits for the missing category.
    const save = page.getByRole('button', { name: 'Save 3 cards as drafts' })
    await expect(save).toBeDisabled()

    await telescope.getByRole('button', { name: /^Create “Photo finds/ }).click()
    const dialog = page.getByRole('dialog', { name: 'New category' })
    await expect(dialog.getByLabel('English name')).toHaveValue(/^Photo finds/)
    await dialog.getByRole('button', { name: /^Save/ }).click()
    await expect(dialog).toBeHidden()
    await expect(telescope).not.toContainText('No matching category')
    await expect(telescope).toContainText(/Photo finds/)

    await save.click()
    await expect(page).toHaveURL(/\/admin\/cards\?new=/)
    await expect(page.getByText('Added 3 drafts from your photo')).toBeVisible()

    const ids = new URL(page.url()).searchParams.getAll('new')
    const [savedWarship, , savedKingdom] = await Promise.all(ids.map((id) => getCard(db, id)))
    expect(savedWarship).toMatchObject({
        status: 'draft',
        date: { decade: 1620, year: 1628, month: null, day: null },
        sourceQuote: 'The photo says: A made-up warship sinks',
        translations: {
            sv: { text: 'SV: A made-up warship sinks', status: 'reviewed' },
            en: { text: 'A made-up warship sinks', status: 'reviewed' },
            nb: { text: 'NB: A made-up warship sinks', status: 'machine' },
        },
    })
    expect(savedKingdom?.date).toEqual({ decade: null, year: null, month: null, day: null })
})

test('an unticked card is left out', async ({ page }) => {
    await signInAs(page, 'admin')
    await gotoHydrated(page, '/admin/cards/photo')
    await page.getByLabel('Choose image').setInputFiles({
        name: 'page.png',
        mimeType: 'image/png',
        buffer: pixel,
    })
    const candidates = page.getByTestId('candidate')
    await expect(candidates).toHaveCount(3)
    await candidates.nth(1).getByRole('checkbox').uncheck()

    await page.getByRole('button', { name: 'Save 2 cards as drafts' }).click()
    await expect(page.getByText('Added 2 drafts from your photo')).toBeVisible()
    expect(new URL(page.url()).searchParams.getAll('new')).toHaveLength(2)
})

test('an editor has no way in', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards')
    await expect(page.getByRole('link', { name: 'Add from photo' })).toHaveCount(0)
})
