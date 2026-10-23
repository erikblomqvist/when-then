// The card editor's sidebar: Publish (the editor's, which saves too) / Archive / Unarchive,
// Delete card and verification.

import { randomUUID } from 'node:crypto'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { DateParts } from '../../../../../lib/cards/date-parts'
import { saveCard } from '../../../../../lib/server/cards'
import { listCategories } from '../../../../../lib/server/categories'
import { localServiceClient, signInAs } from '../../../../../lib/testing/e2e-auth'
import { gotoHydrated, reloadHydrated } from '../../../../../lib/testing/e2e-hydration'
import { saveAndReopen, saveInEditor } from '../../../../../lib/testing/e2e-cards'

const db = localServiceClient()
const unique = (text: string) => `${text} ${randomUUID().slice(0, 8)}`

/** A draft card written as `actorId`, straight through the repository. */
async function draft(actorId: string, text: string, date: DateParts) {
    const [category] = await listCategories(db)
    return saveCard(db, actorId, {
        categoryId: category.id,
        date,
        sourceUrl: null,
        sourceQuote: null,
        translations: { en: { text } },
    })
}

const year1969 = { decade: 1960, year: 1969, month: null, day: null }
const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Card' })
/** The publish checklist's requirements (the first list; what is worth adding comes after). */
const required = (checklist: Locator) => checklist.getByRole('list').first().getByRole('listitem')

async function auditedActions(cardId: string) {
    const { data } = await db
        .from('audit_log')
        .select('action, actor_id')
        .eq('entity_id', cardId)
        .eq('entity', 'card')
        .order('id')
    return data ?? []
}

test('an editor publishes, archives and unarchives a card from the sidebar', async ({ page }) => {
    const { userId } = await signInAs(page, 'editor')
    const id = await draft(userId, unique('A made-up kite crosses the sea'), year1969)
    await gotoHydrated(page, `/admin/cards/${id}`)
    const status = page.getByTestId('card-status')
    await expect(status).toHaveText('Draft')

    // Publishing goes back to the card list.
    await sidebar(page).getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByRole('heading', { name: 'Cards', level: 1 })).toBeVisible()
    await gotoHydrated(page, `/admin/cards/${id}`)
    await expect(status).toHaveText('Published')
    await sidebar(page).getByRole('button', { name: 'Archive' }).click()
    await expect(status).toHaveText('Archived')
    await sidebar(page).getByRole('button', { name: 'Unarchive' }).click()
    await expect(status).toHaveText('Published')

    expect((await auditedActions(id)).map((row) => [row.action, row.actor_id])).toEqual([
        ['create', userId],
        ['publish', userId],
        ['archive', userId],
        ['unarchive', userId],
    ])
})

test('an editor archives a draft and unarchives it as a draft', async ({ page }) => {
    const { userId } = await signInAs(page, 'editor')
    const id = await draft(userId, unique('A made-up raft drifts ashore'), year1969)
    await gotoHydrated(page, `/admin/cards/${id}`)
    const status = page.getByTestId('card-status')

    await sidebar(page).getByRole('button', { name: 'Archive' }).click()
    await expect(status).toHaveText('Archived')
    await sidebar(page).getByRole('button', { name: 'Unarchive as draft' }).click()
    await expect(status).toHaveText('Draft')
})

test('Publish says what is missing, and the server refuses it too', async ({ page }) => {
    const { userId } = await signInAs(page, 'editor')
    const id = await draft(userId, unique('A made-up train runs late'), {
        decade: 1960,
        year: null,
        month: null,
        day: null,
    })
    await gotoHydrated(page, `/admin/cards/${id}`)

    const publish = sidebar(page).getByRole('button', { name: 'Publish' })
    await expect(publish).toBeDisabled()
    // The checklist under the menu has the year still open, and Publish points at it.
    const checklist = sidebar(page).getByRole('region', { name: 'Required to publish' })
    await expect(required(checklist)).toHaveText([
        /Done:\s*English text/,
        /Done:\s*Category/,
        /Done:\s*Date, at least the decade/,
        /To do:\s*Year, for cards from 1500 on/,
    ])
    await expect(publish).toHaveAccessibleDescription(/Required to publish/)

    const response = await page.request.post(`/admin/cards/${id}?/publish`, {
        form: {},
        headers: { origin: new URL(page.url()).origin },
    })
    expect(await response.json()).toMatchObject({ type: 'failure', status: 400 })
    await reloadHydrated(page)
    await expect(page.getByTestId('card-status')).toHaveText('Draft')
})

test('the publish checklist shows every requirement at once and ticks them off as typed', async ({
    page,
}) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards/new')
    const checklist = sidebar(page).getByRole('region', { name: 'Required to publish' })
    await expect(required(checklist)).toHaveText([
        /To do:\s*English text/,
        /To do:\s*Category/,
        /To do:\s*Date, at least the decade/,
        /To do:\s*Year, for cards from 1500 on/,
    ])

    await page.getByLabel('English text').fill(unique('A made-up comet returns'))
    await page.getByLabel('Category').selectOption({ index: 1 })
    await page.getByLabel('Decade').fill('1490')
    await expect(required(checklist)).toHaveText([
        /Done:\s*English text/,
        /Done:\s*Category/,
        /Done:\s*Date, at least the decade/,
        /Done:\s*Year, for cards from 1500 on/,
    ])
    await expect(checklist.getByRole('listitem').nth(3)).toContainText('Not needed before 1500')
    await expect(sidebar(page).getByRole('button', { name: 'Publish' })).toBeEnabled()

    // Below a line, what is worth having but not required.
    const worth = checklist.getByRole('group', { name: 'Also worth adding' })
    await expect(worth.getByRole('listitem')).toHaveText([
        /Missing:\s*Swedish translation/,
        /Missing:\s*Norwegian translation/,
        /Missing:\s*Source link for the date/,
        /Missing:\s*Date verified/,
    ])
    // Ticked off as they come, not dropped.
    await page.getByRole('tab', { name: /Swedish/ }).click()
    await page.getByLabel('Swedish text').fill('En påhittad komet återvänder')
    await expect(worth.getByRole('listitem')).toHaveText([
        /Done:\s*Swedish translation/,
        /Missing:\s*Norwegian translation/,
        /Missing:\s*Source link for the date/,
        /Missing:\s*Date verified/,
    ])
})

test('Publish on a draft saves what was changed, then publishes', async ({ page }) => {
    const { userId } = await signInAs(page, 'editor')
    const id = await draft(userId, unique('A made-up bell rings'), year1969)
    await gotoHydrated(page, `/admin/cards/${id}`)

    const edited = unique('A made-up bell rings twice')
    await page.getByLabel('English text').fill(edited)
    await saveInEditor(page, 'Publish')
    await gotoHydrated(page, `/admin/cards/${id}`)
    await expect(page.getByLabel('English text')).toHaveValue(edited)
    await expect(page.getByTestId('card-status')).toHaveText('Published')
})

test('an admin deletes a card; editors cannot', async ({ page, browser, baseURL }) => {
    const { userId } = await signInAs(page, 'admin')
    const text = unique('A made-up draft to throw away')
    const id = await draft(userId, text, year1969)

    // An editor sees no Delete card.
    const editorContext = await browser.newContext({ baseURL })
    const editorPage = await editorContext.newPage()
    await signInAs(editorPage, 'editor')
    await gotoHydrated(editorPage, `/admin/cards/${id}`)
    await expect(editorPage.getByTestId('card-status')).toHaveText('Draft')
    await expect(sidebar(editorPage).getByRole('button', { name: 'Delete card' })).toHaveCount(0)
    await editorContext.close()

    await gotoHydrated(page, `/admin/cards/${id}`)
    await sidebar(page).getByRole('button', { name: 'Delete card' }).click()
    // It asks first, saying what goes.
    const confirm = page.getByRole('dialog', { name: 'Delete this card?' })
    await expect(confirm).toContainText('deleted for good')
    await confirm.getByRole('button', { name: 'Delete card' }).click()
    await expect(page.getByRole('heading', { name: 'Cards', level: 1 })).toBeVisible()
    expect((await page.goto(`/admin/cards/${id}`))?.status()).toBe(404)
    expect((await auditedActions(id)).at(-1)).toEqual({ action: 'delete', actor_id: userId })
})

test('an archived card can be deleted, and saving one goes back to the Archived tab', async ({
    page,
}) => {
    const { userId } = await signInAs(page, 'admin')
    const id = await draft(userId, unique('A made-up statue is unveiled'), year1969)
    await gotoHydrated(page, `/admin/cards/${id}`)
    await sidebar(page).getByRole('button', { name: 'Archive' }).click()
    await expect(page.getByTestId('card-status')).toHaveText('Archived')

    await page.getByLabel('English text').fill(unique('A made-up statue is toppled'))
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/cards\?tab=archived$/)

    await gotoHydrated(page, `/admin/cards/${id}`)
    await sidebar(page).getByRole('button', { name: 'Delete card' }).click()
    await page
        .getByRole('dialog', { name: 'Delete this card?' })
        .getByRole('button', { name: 'Delete card' })
        .click()
    await expect(page).toHaveURL(/\/admin\/cards\?tab=archived$/)
    expect((await page.goto(`/admin/cards/${id}`))?.status()).toBe(404)
})

test('marking the date verified, then changing the date asks to clear it', async ({ page }) => {
    const { userId, email } = await signInAs(page, 'editor')
    const id = await draft(userId, unique('A made-up bridge opens'), year1969)
    await gotoHydrated(page, `/admin/cards/${id}`)

    await sidebar(page).getByRole('button', { name: 'Mark date verified' }).click()
    // The row turns into Clear, its caption saying who verified it.
    const clear = sidebar(page).getByRole('button', { name: 'Clear date verification' })
    await expect(clear).toHaveAccessibleDescription(new RegExp(`^Verified by ${email} on `))

    const dialogs: string[] = []
    page.on('dialog', (dialog) => {
        dialogs.push(dialog.message())
        void dialog.accept()
    })
    // Text only: no question asked.
    await page.getByLabel('English text').fill(unique('A made-up bridge opens at last'))
    await saveAndReopen(page)
    expect(dialogs).toEqual([])
    await expect(sidebar(page)).toContainText(`Verified by ${email}`)

    await page.getByLabel('Year').fill('1968')
    await saveAndReopen(page)
    expect(dialogs).toEqual([
        'This card’s date was verified, and you changed it. Clear the verification? (Cancel keeps it.)',
    ])
    await expect(sidebar(page).getByRole('button', { name: 'Mark date verified' })).toBeVisible()
    expect((await auditedActions(id)).map((row) => row.action)).toEqual([
        'create',
        'verify',
        'update',
    ])
})

test('the editor sets a card’s difficulty, kept when the card is opened again', async ({
    page,
}) => {
    const { userId } = await signInAs(page, 'editor')
    const id = await draft(userId, unique('A made-up lighthouse is lit'), year1969)
    await gotoHydrated(page, `/admin/cards/${id}`)
    const difficulty = page.getByLabel('Difficulty (optional)')
    await expect(difficulty).toHaveValue('')
    await difficulty.selectOption({ label: '4 · Obscure' })
    await saveAndReopen(page)
    await expect(difficulty).toHaveValue('4')
})
