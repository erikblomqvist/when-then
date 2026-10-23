// "Add from photo" (#60) on a phone-sized touch screen, with the model stubbed
// (src/lib/testing/anthropic-stub.ts reads any photo into three made-up cards: one in the
// first category dated from the photo, one needing a new category with an AI-suggested date,
// and one without a date; "Find date" finds 1908 on its made-up Wikidata).

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
const photo = (name = 'page.png') => ({ name, mimeType: 'image/png', buffer: pixel })

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

async function importAudit(cardIds: string[]) {
    const { data } = await db
        .from('audit_log')
        .select('entity_id, details')
        .eq('action', 'import_photo')
        .in('entity_id', cardIds)
    return data ?? []
}

test('an admin photographs a page on their phone, finds a missing date, creates the suggested category and saves the cards as drafts', async ({
    page,
}) => {
    await signInAs(page, 'admin')
    await gotoHydrated(page, '/admin/cards')

    // On a phone "Add from photo" opens the camera itself; the photo page opens with the photo.
    const camera = page.getByLabel('Add from photo')
    await expect(camera).toHaveAttribute('capture', 'environment')
    await camera.setInputFiles(photo())
    await expect(page).toHaveURL('/admin/cards/photo')
    await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible()
    // Only the camera on a phone: no photo library button.
    await expect(page.getByLabel('Add more photos')).toHaveAttribute('capture', 'environment')
    await page.getByRole('button', { name: 'Read 1 photo' }).click()

    const candidates = page.getByTestId('candidate')
    await expect(candidates).toHaveCount(3)
    const [warship, telescope, kingdom] = [candidates.nth(0), candidates.nth(1), candidates.nth(2)]
    await expect(warship).toContainText('A made-up warship sinks')
    await expect(warship).toContainText('1628')
    await expect(telescope).toContainText('AI-suggested date')
    await expect(telescope).toContainText('No matching category')
    await expect(kingdom).toContainText('Date needed')
    // The AI's guess that only someone who grew up in Sweden would know it.
    await expect(kingdom).toContainText('Sweden-specific · AI-suggested')
    await expect(warship.getByText(/^(Sweden|Norway)-specific/)).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'Photo 1' })).toHaveCount(0)

    // A card without a date gets one looked up, with its source; Undo would put it back. A date
    // before 1800 isn't looked up.
    await expect(warship.getByRole('button', { name: 'Find date' })).toHaveCount(0)
    await expect(telescope.getByRole('button', { name: 'Find date' })).toHaveCount(0)
    await kingdom.getByRole('button', { name: 'Find date' }).click()
    await expect(kingdom).toContainText('Date found online')
    await expect(kingdom).toContainText('1908 from en.wikipedia.org')
    await expect(kingdom.getByRole('link', { name: 'en.wikipedia.org' })).toHaveAttribute(
        'href',
        'https://en.wikipedia.org/wiki/Made-up_games',
    )
    // Its source gave the year only; that is as far as it goes.
    await expect(kingdom.getByRole('button', { name: 'Find date' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /exact date/ })).toHaveCount(0)

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
    expect(savedWarship?.countrySpecific).toBeNull()
    expect(savedKingdom).toMatchObject({
        countrySpecific: 'SE',
        date: { decade: 1900, year: 1908, month: null, day: null },
        sourceUrl: 'https://en.wikipedia.org/wiki/Made-up_games',
    })
})

test.describe('on a computer', () => {
    // Photos are chosen from files, several at once.
    test.use({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false })

    test('photos chosen together are read together, and more photos add to the list', async ({
        page,
    }) => {
        await signInAs(page, 'admin')
        await gotoHydrated(page, '/admin/cards/photo')

        await page
            .getByLabel('Choose photos')
            .setInputFiles([photo('a.png'), photo('b.png'), photo('c.png')])
        await expect(
            page.getByRole('list', { name: 'Photos to read' }).getByRole('img'),
        ).toHaveCount(3)
        await page.getByRole('button', { name: 'Remove photo 3' }).click()
        await page.getByRole('button', { name: 'Read 2 photos' }).click()

        const candidates = page.getByTestId('candidate')
        await expect(candidates).toHaveCount(6)
        await expect(page.getByTestId('photo-summary')).toContainText('Found 6 cards in 2 photos')

        // More photos join the list instead of replacing it.
        await page.getByLabel('Add more photos').setInputFiles(photo())
        await page.getByRole('button', { name: 'Read 1 photo' }).click()
        await expect(candidates).toHaveCount(9)
        await expect(page.getByTestId('photo-summary')).toContainText('Found 9 cards in 3 photos')

        // Leave out the ones waiting for a new category, and keep one from each photo.
        for (const index of [1, 4, 7]) await candidates.nth(index).getByRole('checkbox').uncheck()
        for (const index of [0, 3, 6]) await candidates.nth(index).getByRole('checkbox').uncheck()
        await page.getByRole('button', { name: 'Save 3 cards as drafts' }).click()
        await expect(page.getByText('Added 3 drafts from your photo')).toBeVisible()

        // Each card names the AI request (photo) it was read in.
        const ids = new URL(page.url()).searchParams.getAll('new')
        const requests = (await importAudit(ids)).map(
            ({ details }) => (details as { request: number | null }).request,
        )
        expect(requests).toHaveLength(3)
        expect(requests.every((request) => typeof request === 'number')).toBe(true)
        expect(new Set(requests).size).toBe(3)
    })
})

test('ten photos can be read at once, the two sides of five cards', async ({ page }) => {
    await signInAs(page, 'admin')
    await gotoHydrated(page, '/admin/cards/photo')
    const photos = Array.from({ length: 11 }, (_, index) => photo(`side-${index + 1}.png`))
    await page.getByLabel('Take photo').setInputFiles(photos.slice(0, 1))
    for (const one of photos.slice(1)) await page.getByLabel('Add more photos').setInputFiles(one)

    // The eleventh is left out, and the camera can't add more until these are read.
    await expect(page.getByRole('list', { name: 'Photos to read' }).getByRole('img')).toHaveCount(
        10,
    )
    await expect(page.getByText('10 photos is the most at a time.')).toBeVisible()
    await expect(page.getByLabel('Add more photos')).toBeDisabled()

    await page.getByRole('button', { name: 'Read 10 photos' }).click()
    await expect(page.getByTestId('candidate')).toHaveCount(30)
    await expect(page.getByTestId('photo-summary')).toContainText('Found 30 cards in 10 photos')
})

test('an unticked card is left out', async ({ page }) => {
    await signInAs(page, 'admin')
    await gotoHydrated(page, '/admin/cards/photo')
    await page.getByLabel('Take photo').setInputFiles(photo())
    await page.getByRole('button', { name: 'Read 1 photo' }).click()
    const candidates = page.getByTestId('candidate')
    await expect(candidates).toHaveCount(3)

    // Every ticked card worth it is looked up at once.
    await page.getByRole('button', { name: 'Find 1 exact date' }).click()
    await expect(candidates.nth(2)).toContainText('Date found online')
    await candidates.nth(1).getByRole('checkbox').uncheck()

    // While it saves, the button waits with a spinner (the save is held back to see it).
    await page.route('**/admin/cards/photo?/save', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        await route.continue()
    })
    await page.getByRole('button', { name: 'Save 2 cards as drafts' }).click()
    const saving = page.getByRole('button', { name: 'Saving 2 cards…' })
    await expect(saving).toBeDisabled()
    await expect(saving).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByText('Added 2 drafts from your photo')).toBeVisible()
    expect(new URL(page.url()).searchParams.getAll('new')).toHaveLength(2)
})

test('Find date fills in the month and day when its source states them', async ({ page }) => {
    await signInAs(page, 'admin')
    await gotoHydrated(page, '/admin/cards/photo')
    await page.getByLabel('Take photo').setInputFiles(photo())
    await page.getByRole('button', { name: 'Read 1 photo' }).click()
    const candidates = page.getByTestId('candidate')
    await expect(candidates).toHaveCount(3)
    const kingdom = candidates.nth(2)

    // The stub's sources give years only, so this one answers with a full date.
    await page.route('**/admin/cards/photo/suggest-date', (route) =>
        route.fulfill({
            json: {
                suggestion: {
                    year: 1912,
                    month: 4,
                    day: 15,
                    sourceUrl: 'https://example.com/made-up-kingdom',
                    sourceQuote: 'It was founded on 15 April 1912.',
                    interpretation: 'The founding.',
                    confidence: 'high',
                    alternatives: [],
                    via: 'web_search',
                },
            },
        }),
    )
    await kingdom.getByRole('button', { name: 'Find date' }).click()
    await expect(kingdom).toContainText('15 April 1912 from example.com')
    await expect(kingdom.getByRole('button', { name: 'Find date' })).toHaveCount(0)

    for (const index of [0, 1]) await candidates.nth(index).getByRole('checkbox').uncheck()
    await page.getByRole('button', { name: 'Save 1 card as drafts' }).click()
    await expect(page.getByText('Added 1 draft from your photo')).toBeVisible()
    const [id] = new URL(page.url()).searchParams.getAll('new')
    expect(await getCard(db, id)).toMatchObject({
        date: { decade: 1910, year: 1912, month: 4, day: 15 },
        sourceUrl: 'https://example.com/made-up-kingdom',
        sourceQuote: 'It was founded on 15 April 1912.',
    })
})

test('Find date says so when its source has nothing the card has not got', async ({ page }) => {
    await signInAs(page, 'admin')
    await gotoHydrated(page, '/admin/cards/photo')
    await page.getByLabel('Take photo').setInputFiles(photo())
    await page.getByRole('button', { name: 'Read 1 photo' }).click()
    const candidates = page.getByTestId('candidate')
    await expect(candidates).toHaveCount(3)
    const kingdom = candidates.nth(2)

    // Typed in already: 1908, the year the stub's Wikidata gives, with no month or day.
    await kingdom.getByText('Edit').click()
    await kingdom.getByLabel('Year').fill('1908')
    await kingdom.getByRole('button', { name: 'Find date' }).click()

    await expect(kingdom).toContainText('No exact day found online; the date stays 1908.')
    await expect(kingdom).not.toContainText('Date found online')
    // Nothing changed: the photo stays the source, and it isn't looked up again in bulk.
    await expect(kingdom.getByRole('link', { name: 'en.wikipedia.org' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /exact date/ })).toHaveCount(0)

    await kingdom.getByRole('button', { name: 'Try again' }).click()
    await expect(kingdom).toContainText('No exact day found online; the date stays 1908.')
})

test('an editor has no way in', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards')
    await expect(page.getByText('Add from photo')).toHaveCount(0)
})
