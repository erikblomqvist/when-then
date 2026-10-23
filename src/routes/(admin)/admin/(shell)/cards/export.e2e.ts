// Exporting cards from the card list: the current filter or everything, as CSV or JSON, and
// a selection of ids posted to the endpoint. Uses the seeded made-up cards ("Sample" matches
// three, one of them archived, so the Cards tab exports two).

import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { parseCsvRecords } from '../../../../../lib/cards/card-csv'
import type { ExportedCard } from '../../../../../lib/cards/card-export'
import { signInAs } from '../../../../../lib/testing/e2e-auth'
import { gotoHydrated } from '../../../../../lib/testing/e2e-hydration'

const sampleby = '00000000-0000-4000-9000-000000000004'
const samplebridge = '00000000-0000-4000-9000-000000000006'

async function exportFile(page: Page) {
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page
            .getByRole('form', { name: 'Export cards' })
            .getByRole('button', { name: 'Export' })
            .click(),
    ])
    const path = await download.path()
    return { name: download.suggestedFilename(), text: await readFile(path, 'utf8') }
}

test('an editor downloads the filtered cards as CSV in the import columns', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards?q=Sample')

    const exportForm = page.getByRole('form', { name: 'Export cards' })
    await expect(exportForm.getByLabel('Export')).toHaveValue('')
    await expect(exportForm.getByLabel('Export')).toContainText('The 2 matching cards')
    const { name, text } = await exportFile(page)

    expect(name).toMatch(/^when-then-cards-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(text.startsWith('﻿')).toBe(true)
    const { columns, records } = parseCsvRecords(text)
    expect(columns).toEqual([
        'text_en',
        'decade',
        'year',
        'month',
        'day',
        'category',
        'source_url',
        'source_quote',
        'text_sv',
        'text_nb',
        'tags',
        'status',
        'id',
    ])
    expect(records.map((record) => record.id)).toEqual([sampleby, samplebridge])
    expect(records[0]).toEqual({
        text_en: 'The made-up port of Sampleby lights its first lighthouse',
        decade: '-49',
        year: '-44',
        month: '',
        day: '',
        category: 'Places',
        source_url: 'https://example.com/sampleby',
        source_quote: 'the lighthouse was lit in 44 BC',
        text_sv: 'Den påhittade hamnen Sampleby tänder sitt första fyrtorn',
        text_nb: 'Den oppdiktede havnen Sampleby tenner sitt første fyrtårn',
        tags: '',
        status: 'published',
        id: sampleby,
    })
})

test('an editor downloads every card as JSON with all translations', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards?q=Sample')

    const exportForm = page.getByRole('form', { name: 'Export cards' })
    await exportForm.getByLabel('Export').selectOption({ label: 'All cards' })
    await exportForm.getByLabel('Format').selectOption({ label: 'JSON' })
    const { name, text } = await exportFile(page)

    expect(name).toMatch(/\.json$/)
    const cards = JSON.parse(text) as ExportedCard[]
    expect(cards.length).toBeGreaterThanOrEqual(6)
    const card = cards.find((item) => item.id === sampleby)
    expect(card?.translations.nb).toEqual({
        text: 'Den oppdiktede havnen Sampleby tenner sitt første fyrtårn',
        note: null,
        status: 'machine',
    })
})

test('without a filter the list offers to export all cards', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards')
    const exportForm = page.getByRole('form', { name: 'Export cards' })
    await expect(exportForm.getByLabel('Export all cards as')).toBeVisible()
    const { text } = await exportFile(page)
    expect(parseCsvRecords(text).records.length).toBeGreaterThanOrEqual(6)
})

test('posting selected ids exports exactly those cards', async ({ page, baseURL }) => {
    await signInAs(page, 'editor')
    const response = await page.request.post('/admin/cards/export', {
        // A form on the list posts from the same origin; SvelteKit refuses cross-site posts.
        headers: { origin: baseURL! },
        form: { format: 'json', id: samplebridge, q: 'ignored when ids are given' },
    })
    expect(response.ok()).toBe(true)
    const cards = (await response.json()) as ExportedCard[]
    expect(cards.map((card) => card.id)).toEqual([samplebridge])

    const both = await page.request.get(
        `/admin/cards/export?format=json&id=${sampleby}&id=${samplebridge}`,
    )
    expect(((await both.json()) as ExportedCard[]).map((card) => card.id)).toEqual([
        sampleby,
        samplebridge,
    ])
})

test('signed-out visitors cannot export', async ({ request }) => {
    const response = await request.get('/admin/cards/export', { maxRedirects: 0 })
    expect(response.status()).toBe(303)
    expect(response.headers().location).toMatch(/^\/admin\/sign-in/)
})
