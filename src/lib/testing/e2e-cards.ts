// The card editor in Playwright: Save and Publish go back to the card list, so a test
// that carries on with a card finds it there again.
//
//     import { saveInEditor, openCard } from '#lib/testing/e2e-cards.js'
//     await saveInEditor(page)
//     const id = await openCard(page, text)

import { expect, type Page } from '@playwright/test'
import { gotoHydrated } from './e2e-hydration'

/**
 * The editor's form, without its sidebar: an error shows by its field here, while the
 * sidebar repeats it under Publish ("Before it can be published").
 */
export const editorForm = (page: Page) => page.locator('form#card-editor')

/** Clicks the editor's Save (or `button`) and waits for the card list it goes back to. */
export async function saveInEditor(page: Page, button: 'Save' | 'Publish' = 'Save') {
    await page.getByRole('button', { name: button, exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Cards', level: 1 })).toBeVisible()
}

/** Opens the card with this English text from the list's search; returns its id. */
export async function openCard(page: Page, text: string) {
    await gotoHydrated(page, `/admin/cards?q=${encodeURIComponent(text)}`)
    const link = page.getByRole('row').filter({ hasText: text }).getByRole('link').first()
    const id = (await link.getAttribute('href'))?.split('/').pop() ?? ''
    await gotoHydrated(page, `/admin/cards/${id}`)
    await expect(page.getByRole('heading', { name: 'Edit card' })).toBeVisible()
    return id
}

/** Saves the card open in the editor, then opens it again (for tests that carry on with it). */
export async function saveAndReopen(page: Page) {
    const url = page.url()
    await saveInEditor(page)
    await gotoHydrated(page, url)
    await expect(page.getByRole('heading', { name: 'Edit card' })).toBeVisible()
}
