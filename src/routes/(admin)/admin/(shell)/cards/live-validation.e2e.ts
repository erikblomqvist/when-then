// Live validation (#52): the editor's tab badges and errors follow what is typed, and an admin
// can add a missing category from the card editor without losing the card.

import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { signInAs } from '../../../../../lib/testing/e2e-auth'
import { gotoHydrated } from '../../../../../lib/testing/e2e-hydration'
import { editorForm, openCard, saveInEditor } from '../../../../../lib/testing/e2e-cards'

const unique = (text: string) => `${text} ${randomUUID().slice(0, 8)}`

const tab = (page: Page, name: 'Swedish' | 'Norwegian') =>
    page.getByRole('tab', { name: new RegExp(name) })

test('a tab’s badge shows what typing in it will save, before saving', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards/new')

    await expect(tab(page, 'Swedish')).toContainText('Missing')
    await page.getByLabel('Swedish text').fill('E')
    await expect(tab(page, 'Swedish')).toContainText('Reviewed')
    await expect(tab(page, 'Swedish')).toContainText('(unsaved)')
    await expect(tab(page, 'Norwegian')).toContainText('Missing')

    await page.getByLabel('Swedish text').fill('')
    await expect(tab(page, 'Swedish')).toContainText('Missing')
    await expect(tab(page, 'Swedish')).not.toContainText('(unsaved)')
})

test('errors show after leaving a field or saving, and go away once fixed', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards/new')

    // Passing through an empty field is not an error.
    await page.getByLabel('English text').focus()
    await page.getByLabel('Year').focus()
    await expect(editorForm(page).getByText('Write the card in English.')).toHaveCount(0)

    await page.getByLabel('Source URL').fill('example')
    await page.getByLabel('Source quote').focus()
    await expect(editorForm(page).getByText('Use a full web address')).toBeVisible()
    await page.getByLabel('Source URL').fill('https://example.com/made-up')
    await expect(editorForm(page).getByText('Use a full web address')).toHaveCount(0)

    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(editorForm(page).getByText('Write the card in English.')).toBeVisible()
    await expect(editorForm(page).getByText('Pick a category.')).toBeVisible()
    await page.getByLabel('English text').fill('A made-up harbour opens')
    await expect(editorForm(page).getByText('Write the card in English.')).toHaveCount(0)
    await expect(editorForm(page).getByText('Pick a category.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'New card' })).toBeVisible()
})

test('an admin adds a category from the card editor and keeps the card', async ({ page }) => {
    await signInAs(page, 'admin')
    await gotoHydrated(page, '/admin/cards/new')
    const text = unique('A made-up lighthouse is lit')
    await page.getByLabel('English text').fill(text)
    await page.getByLabel('Year').fill('1888')

    await page.getByLabel('Category').selectOption({ label: 'New category…' })
    const dialog = page.getByRole('dialog', { name: 'New category' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByText('Enter an English name.')).toBeVisible()

    const name = unique('Lighthouses')
    await dialog.getByLabel('English name').fill(name)
    await expect(dialog.getByText('Enter an English name.')).toHaveCount(0)
    await dialog.getByRole('radio', { name: 'ship' }).check()
    await dialog.getByRole('radio', { name: 'teal' }).check()
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect(dialog).toHaveCount(0)
    await expect(page.getByLabel('Category').locator('option:checked')).toHaveText(name)
    await expect(page.getByLabel('English text')).toHaveValue(text)
    await expect(page.getByLabel('Year')).toHaveValue('1888')

    await saveInEditor(page)
    await openCard(page, text)
    await expect(page.getByLabel('Category').locator('option:checked')).toHaveText(name)
})

test('cancelling the new category leaves the card as it was', async ({ page }) => {
    await signInAs(page, 'admin')
    await gotoHydrated(page, '/admin/cards/new')
    await page.getByLabel('English text').fill('A made-up canal is dug')

    await page.getByLabel('Category').selectOption({ label: 'New category…' })
    const dialog = page.getByRole('dialog', { name: 'New category' })
    await dialog.getByLabel('English name').fill('Never saved')
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    await expect(dialog).toHaveCount(0)
    await expect(page.getByLabel('English text')).toHaveValue('A made-up canal is dug')
    // Exact, or the closed "New category" dialog matches too.
    await expect(page.getByLabel('Category', { exact: true })).toHaveValue('')
})

test('an editor is pointed to an admin instead of offered a new category', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards/new')

    await expect(page.getByRole('option', { name: 'New category…' })).toHaveCount(0)
    await expect(page.getByText('Ask an admin to add one.')).toBeVisible()
})

test('the category form’s errors follow what is typed', async ({ page }) => {
    await signInAs(page, 'admin')
    await gotoHydrated(page, '/admin/categories/new')

    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Enter an English name.')).toBeVisible()
    await expect(page.getByText('Pick an icon.')).toBeVisible()

    await page.getByLabel('English name').fill(unique('Harbours'))
    await expect(page.getByText('Enter an English name.')).toHaveCount(0)
    await page.getByRole('radio', { name: 'ship' }).check()
    await expect(page.getByText('Pick an icon.')).toHaveCount(0)
    await expect(page.getByText('Pick a colour.')).toBeVisible()
})

test('fixing one tab’s error keeps that tab open while another still has one', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards/new')
    await page.getByLabel('Swedish note').fill('En anteckning')
    await tab(page, 'Norwegian').click()
    await page.getByLabel('Norwegian note').fill('Et notat')
    await tab(page, 'Swedish').click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(
        editorForm(page).getByText('Write the Swedish text, or clear the note.'),
    ).toBeVisible()

    await page.getByLabel('Swedish text').fill('E')
    await expect(page.getByLabel('Swedish text')).toBeVisible()
    await expect(tab(page, 'Swedish')).toHaveAttribute('aria-selected', 'true')
})

test('a duplicate English name stays on that field until the name changes', async ({ page }) => {
    await signInAs(page, 'admin')
    const name = unique('Duplicates')
    for (const attempt of [1, 2]) {
        await gotoHydrated(page, '/admin/categories/new')
        await page.getByLabel('English name').fill(name)
        await page.getByRole('radio', { name: 'ship' }).check()
        await page.getByRole('radio', { name: 'teal' }).check()
        await page.getByRole('button', { name: 'Save' }).click()
        if (attempt === 1) await expect(page).toHaveURL(/\/admin\/categories$/)
    }
    const refusal = page.getByText('Another category already has that English name.')
    await expect(refusal).toBeVisible()

    await page.getByRole('radio', { name: 'purple' }).check()
    await expect(refusal).toBeVisible()
    await page.getByLabel('English name').fill(`${name} 2`)
    await expect(refusal).toHaveCount(0)
})

test('a decade from 1500 on needs a year, even for a draft', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards/new')
    await page.getByLabel('Decade').fill('1700')
    await page.getByLabel('Year').focus()
    await expect(editorForm(page).getByText('Cards from 1500 onwards need a year.')).toBeVisible()

    await page.getByLabel('Year').fill('1704')
    await expect(editorForm(page).getByText('Cards from 1500 onwards need a year.')).toHaveCount(0)
})

test('Publish on a new card saves and publishes it, and goes back to the list', async ({
    page,
}) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards/new')
    const publish = page.getByRole('button', { name: 'Publish', exact: true })
    await expect(publish).toBeDisabled()
    await expect(page.getByRole('complementary', { name: 'Card' })).toContainText(
        'Write the card in English.',
    )

    const text = unique('A made-up tram departs')
    await page.getByLabel('English text').fill(text)
    await page.getByLabel('Year').fill('1901')
    await page.getByLabel('Category').selectOption({ label: 'Events' })
    await expect(publish).toBeEnabled()
    await saveInEditor(page, 'Publish')

    await gotoHydrated(page, `/admin/cards?q=${encodeURIComponent(text)}`)
    await expect(page.getByRole('row').filter({ hasText: text })).toContainText('Published')
})

test('Cmd/Ctrl + S saves the card', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards/new')
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveAttribute(
        'aria-keyshortcuts',
        'Control+S Meta+S',
    )
    const text = unique('A made-up ferry is launched')
    await page.getByLabel('English text').fill(text)
    await page.getByLabel('Year').fill('1912')
    await page.getByLabel('Category').selectOption({ label: 'Events' })
    await page.getByLabel('Year').press('ControlOrMeta+s')
    await expect(page.getByRole('heading', { name: 'Cards', level: 1 })).toBeVisible()
    await openCard(page, text)
})
