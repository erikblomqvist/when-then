// "Suggest date" (#42) in the browser, with the model and Wikidata stubbed
// (src/lib/testing/anthropic-stub.ts): by default stub Wikidata dates the card 1908 with 2012
// as an alternative; "[web]" makes Wikidata find nothing so web search answers 14 June 1923;
// "[unsourced]" cites a page that was never retrieved. Each model call costs $0.004.

import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { markVerified } from '../../../../../lib/server/card-lifecycle'
import { getCard, saveCard } from '../../../../../lib/server/cards'
import { listCategories } from '../../../../../lib/server/categories'
import { localServiceClient, signInAs } from '../../../../../lib/testing/e2e-auth'
import { gotoHydrated } from '../../../../../lib/testing/e2e-hydration'
import { openFullHistory, saveAndReopen } from '../../../../../lib/testing/e2e-cards'

const db = localServiceClient()
const word = () => `Sd${randomUUID().slice(0, 8)}`

async function draft(actorId: string, text: string) {
    const [category] = await listCategories(db)
    return saveCard(db, actorId, {
        categoryId: category.id,
        date: { decade: 1900, year: 1900, month: 5, day: 1 },
        sourceUrl: null,
        sourceQuote: null,
        translations: { en: { text } },
    })
}

const panel = (page: Page) => page.getByRole('region', { name: 'Date suggestion' })

async function auditDetails(cardId: string) {
    const { data } = await db
        .from('audit_log')
        .select('action, details')
        .eq('entity_id', cardId)
        .like('action', '%suggest%')
        .order('id')
    return data ?? []
}

test('an editor gets a Wikidata-sourced suggestion and accepts it into the form, unsaved', async ({
    page,
}) => {
    const { userId } = await signInAs(page, 'editor')
    const id = await draft(userId, `The made-up ${word()} games are held for the first time`)

    await gotoHydrated(page, `/admin/cards/${id}`)
    await page.getByRole('button', { name: 'Suggest date' }).click()

    const suggestion = panel(page)
    await expect(suggestion).toContainText('1908')
    await expect(suggestion).toContainText('The first made-up games.')
    await expect(suggestion).toContainText('High confidence')
    await expect(suggestion).toContainText('point in time: 1908')
    await expect(suggestion).toContainText('Wikidata')
    await expect(suggestion.getByRole('link', { name: /Made-up_games/ })).toHaveAttribute(
        'href',
        'https://en.wikipedia.org/wiki/Made-up_games',
    )
    await expect(suggestion).toContainText('The best-known games.')

    await suggestion.getByRole('button', { name: 'Accept 1908' }).click()
    await expect(panel(page)).toHaveCount(0)
    await expect(page.getByLabel('Year')).toHaveValue('1908')
    await expect(page.getByLabel('Decade')).toHaveValue('1900')
    // A month and day from the old year would not fit the new one.
    await expect(page.getByLabel('Month')).toHaveValue('')
    await expect(page.getByLabel('Day')).toHaveValue('')
    await expect(page.getByLabel('Source URL')).toHaveValue(
        'https://en.wikipedia.org/wiki/Made-up_games',
    )
    await expect(page.getByLabel('Source quote')).toHaveValue('point in time: 1908')
    await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toBeVisible()
    expect((await getCard(db, id))?.date.year).toBe(1900)

    await expect
        .poll(async () => (await auditDetails(id)).map(({ action }) => action))
        .toEqual(['ai_suggest_date', 'accept_date_suggestion'])
    const [requested, accepted] = await auditDetails(id)
    expect(requested.details).toMatchObject({ outcome: 'ok', via: 'wikidata', cost_usd: 0.008 })
    expect(accepted.details).toMatchObject({ year: 1908, cost_usd: 0.008 })

    await saveAndReopen(page)
    expect((await getCard(db, id))?.date).toEqual({
        decade: 1900,
        year: 1908,
        month: null,
        day: null,
    })
    const history = await openFullHistory(page)
    await expect(history).toContainText('Suggested a date with AI')
    await expect(history).toContainText('Accepted the AI date suggestion')
    await expect(history).toContainText('$0.008')
})

test('picking an alternative fills that year; dismissing changes nothing', async ({ page }) => {
    const { userId } = await signInAs(page, 'editor')
    const id = await draft(userId, `The made-up ${word()} games return`)

    await gotoHydrated(page, `/admin/cards/${id}`)
    await page.getByRole('button', { name: 'Suggest date' }).click()
    await panel(page).getByRole('button', { name: 'Use 2012' }).click()
    await expect(page.getByLabel('Year')).toHaveValue('2012')
    // The alternative has no source of its own: the source fields stay as they were.
    await expect(page.getByLabel('Source URL')).toHaveValue('')

    await page.getByRole('button', { name: 'Suggest date' }).click()
    await panel(page).getByRole('button', { name: 'Dismiss' }).click()
    await expect(panel(page)).toHaveCount(0)
    await expect(page.getByLabel('Year')).toHaveValue('2012')

    await expect
        .poll(async () => (await auditDetails(id)).map(({ action }) => action))
        .toEqual([
            'ai_suggest_date',
            'accept_date_suggestion',
            'ai_suggest_date',
            'reject_date_suggestion',
        ])
    expect((await auditDetails(id))[1].details).toMatchObject({ year: 2012 })
})

test('when Wikidata has nothing, the suggestion comes from web search', async ({ page }) => {
    const { userId } = await signInAs(page, 'editor')
    const id = await draft(userId, `A made-up ${word()} parade marches [web]`)

    await gotoHydrated(page, `/admin/cards/${id}`)
    await page.getByRole('button', { name: 'Suggest date' }).click()

    await expect(panel(page)).toContainText('14 June 1923')
    await expect(panel(page)).toContainText('web search')
    await expect(panel(page).getByRole('link', { name: /example\.com/ })).toHaveAttribute(
        'href',
        'https://example.com/made-up-history',
    )
    // Two Wikidata-step calls and one web search call with one search: 3 × $0.004 + $0.01.
    await expect
        .poll(async () => (await auditDetails(id))[0]?.details)
        .toMatchObject({ via: 'web_search', calls: 3, cost_usd: 0.022, month: 6, day: 14 })

    // Accepting fills the whole date, not just the year.
    await panel(page).getByRole('button', { name: 'Accept 14 June 1923' }).click()
    await expect(page.getByLabel('Year')).toHaveValue('1923')
    await expect(page.getByLabel('Month')).toHaveValue('6')
    await expect(page.getByLabel('Day')).toHaveValue('14')
})

test('a suggestion citing a page it never retrieved is rejected and fills nothing', async ({
    page,
}) => {
    const { userId } = await signInAs(page, 'editor')
    const id = await draft(userId, `A made-up ${word()} festival opens [unsourced]`)

    await gotoHydrated(page, `/admin/cards/${id}`)
    await page.getByRole('button', { name: 'Suggest date' }).click()

    await expect(page.getByRole('alert')).toContainText('cited a source it did not retrieve')
    await expect(panel(page)).toHaveCount(0)
    await expect(page.getByLabel('Year')).toHaveValue('1900')
    await expect
        .poll(async () => (await auditDetails(id))[0]?.details)
        .toMatchObject({
            outcome: 'unsourced',
            source_url: 'https://example.com/never-retrieved',
        })
})

test('accepting a new year on a verified card asks to clear the verification on save', async ({
    page,
}) => {
    const { userId } = await signInAs(page, 'editor')
    const id = await draft(userId, `The made-up ${word()} games close`)
    await markVerified(db, userId, id)

    const dialogs: string[] = []
    page.on('dialog', (dialog) => {
        dialogs.push(dialog.message())
        void dialog.accept()
    })
    await gotoHydrated(page, `/admin/cards/${id}`)
    await page.getByRole('button', { name: 'Suggest date' }).click()
    await panel(page).getByRole('button', { name: 'Accept 1908' }).click()
    await saveAndReopen(page)
    expect(dialogs).toEqual([
        'This card’s date was verified, and you changed it. Clear the verification? (Cancel keeps it.)',
    ])
    expect((await getCard(db, id))?.verifiedAt).toBeNull()
})
