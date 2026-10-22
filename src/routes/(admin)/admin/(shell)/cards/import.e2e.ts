// Importing cards from CSV (#48): an admin uploads a synthetic file, sees every row with its
// errors before anything is written, then confirms; valid rows become drafts, the others are
// reported as skipped. Editors don't get the page.

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { localServiceClient, signInAs } from '../../../../../lib/testing/e2e-auth'
import { gotoHydrated } from '../../../../../lib/testing/e2e-hydration'

const db = localServiceClient()

const header = 'text_en,decade,year,month,day,category,source_url,source_quote,text_sv,text_nb,tags'

const cardsWith = async (text: string) => {
    const { data } = await db.from('card_translations').select('card_id').eq('text', text)
    return data ?? []
}

test('an admin previews a CSV with per-row errors, then imports the valid rows as drafts', async ({
    page,
}) => {
    await signInAs(page, 'admin')
    const tag = `Import${randomUUID().slice(0, 8)}`
    const canal = `A made-up canal opens ${tag}`
    const walls = `Made-up Sampleby walls rise ${tag}`
    const csv = [
        header,
        `${canal},,1822,5,,Events,https://example.com/canal,,En påhittad kanal öppnas,,canals`,
        `,,1822,,,Events,,,,,`,
        `A made-up gadget ${tag},,1822,13,,Gadgets,,,,,`,
        `${walls},-49,,,,places,,,,,`,
    ].join('\r\n')

    await gotoHydrated(page, '/admin/cards')
    await page.getByRole('link', { name: 'Import', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Import cards', level: 1 })).toBeVisible()

    await page.getByLabel('CSV file').setInputFiles({
        name: 'synthetic-cards.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csv),
    })
    await page.getByRole('button', { name: 'Preview' }).click()

    await expect(page.getByTestId('import-summary')).toHaveText(
        'synthetic-cards.csv: 4 rows, 2 ready to import, 2 with errors (skipped). Nothing is saved until you import.',
    )
    await expect(page.getByTestId('import-row-1')).toContainText('Ready')
    await expect(page.getByTestId('import-row-1')).toContainText('May 1822')
    await expect(page.getByTestId('import-row-2')).toContainText(
        'English text: The English text is missing.',
    )
    await expect(page.getByTestId('import-row-3')).toContainText('Month: Month must be 1 to 12.')
    await expect(page.getByTestId('import-row-3')).toContainText(
        'Category: There is no category "Gadgets".',
    )
    await expect(page.getByTestId('import-row-4')).toContainText('40s BC')
    expect(await cardsWith(canal)).toEqual([])

    await page.getByRole('button', { name: 'Import 2 cards as drafts' }).click()

    await expect(page.getByRole('status')).toHaveText(
        'Imported 2 cards as drafts. Skipped 2 rows with errors.',
    )
    const skipped = page.getByRole('region', { name: 'Skipped rows' })
    await expect(skipped).toContainText('Row 2: No English text')
    await expect(skipped).toContainText(`Row 3: A made-up gadget ${tag}`)
    expect(await cardsWith(`A made-up gadget ${tag}`)).toEqual([])

    await page
        .getByRole('region', { name: 'New drafts' })
        .getByRole('link', { name: canal })
        .click()
    await expect(page.getByLabel('English text', { exact: true })).toHaveValue(canal)
    const [created] = await cardsWith(canal)
    const card = await db.from('cards').select('status').eq('id', created!.card_id).single()
    expect(card.data?.status).toBe('draft')
    expect(await cardsWith(walls)).toHaveLength(1)
})

test('a file the import cannot read is reported, with nothing to confirm', async ({ page }) => {
    await signInAs(page, 'admin')
    await gotoHydrated(page, '/admin/cards/import')
    await page.getByLabel('CSV file').setInputFiles({
        name: 'wrong.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('name,year\nSomething,1822\n'),
    })
    await page.getByRole('button', { name: 'Preview' }).click()
    await expect(page.getByRole('alert')).toContainText('text_en and category')
    await expect(page.getByRole('button', { name: /^Import/ })).toHaveCount(0)
})

test('editors see no Import link and cannot open the page', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards')
    await expect(page.getByRole('link', { name: 'New card' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Import', exact: true })).toHaveCount(0)
    const response = await page.goto('/admin/cards/import')
    expect(response?.status()).toBe(403)
})
