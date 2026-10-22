// The categories page (#44). Tests run in parallel against one database, so each makes its own
// categories with unique names and only looks at those rows.

import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { localServiceClient, signInAs } from '../../../lib/testing/e2e-auth'
import { saveCard } from '../../../lib/server/cards'
import { saveCategory } from '../../../lib/server/categories'

const db = localServiceClient()

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

const categoryRow = (page: Page, name: string) =>
    page.getByRole('region', { name: 'Categories' }).getByRole('row').filter({ hasText: name })

// The English names of the listed categories, top to bottom, among `names`.
async function shownOrder(page: Page, names: string[]) {
    const rows = await page
        .getByRole('region', { name: 'Categories' })
        .getByRole('row')
        .allTextContents()
    return rows.flatMap((row) => names.filter((name) => row.includes(name)))
}

const newCategory = (actor: string, name: string) =>
    saveCategory(db, actor, { icon: 'ship', colour: 'teal', names: { en: name } })

test('editors have no categories page', async ({ page }) => {
    await signInAs(page, 'editor')
    await page.goto('/admin')
    await expect(page.getByRole('navigation', { name: 'Admin' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Categories' })).toHaveCount(0)

    expect((await page.goto('/admin/categories'))?.status()).toBe(403)
    expect((await page.goto('/admin/categories/new'))?.status()).toBe(403)
})

test('an admin creates a category with names, icon and colour, then renames it', async ({
    page,
}) => {
    await signInAs(page, 'admin')
    await page.goto('/admin')
    await page
        .getByRole('navigation', { name: 'Admin' })
        .getByRole('link', { name: 'Categories' })
        .click()
    await expect(page.getByRole('heading', { level: 1, name: 'Categories' })).toBeVisible()

    await page.getByRole('link', { name: 'New category' }).click()
    const name = unique('Royals')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Enter an English name.')).toBeVisible()

    await page.getByLabel('English name').fill(name)
    await page.getByLabel('Swedish name').fill('Kungligheter')
    await page.getByRole('radio', { name: 'crown' }).check()
    await page.getByRole('radio', { name: 'purple' }).check()
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Categories' })).toBeVisible()
    const row = categoryRow(page, name)
    await expect(row).toContainText('Kungligheter')
    await expect(row.getByTestId('card-count')).toHaveText('0')
    await expect(row.getByRole('img', { name })).toHaveClass(/cat-purple/)

    await row.getByRole('link', { name }).click()
    await expect(page.getByLabel('English name')).toHaveValue(name)
    await expect(page.getByRole('radio', { name: 'crown' })).toBeChecked()
    await page.getByLabel('Norwegian name').fill('Kongelige')
    await page.getByLabel('Swedish name').fill('')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(categoryRow(page, name)).toContainText('Kongelige')
    await expect(categoryRow(page, name)).not.toContainText('Kungligheter')
})

test('an admin reorders categories by drag and drop', async ({ page }) => {
    const { userId } = await signInAs(page, 'admin')
    const first = unique('Comets')
    const second = unique('Meteors')
    await newCategory(userId, first)
    await newCategory(userId, second)

    await page.goto('/admin/categories')
    expect(await shownOrder(page, [first, second])).toEqual([first, second])

    await categoryRow(page, second)
        .getByRole('button', { name: `Drag ${second}` })
        .dragTo(categoryRow(page, first))

    await expect(page.getByRole('status')).toHaveText('Saved the new order.')
    await page.reload()
    expect(await shownOrder(page, [first, second])).toEqual([second, first])

    await categoryRow(page, second)
        .getByRole('button', { name: `Move ${second} down` })
        .click()
    await expect(page.getByRole('status')).toHaveText('Saved the new order.')
    await page.reload()
    expect(await shownOrder(page, [first, second])).toEqual([first, second])
})

test('an admin archives and unarchives a category', async ({ page }) => {
    const { userId } = await signInAs(page, 'admin')
    const name = unique('Glaciers')
    await newCategory(userId, name)
    await page.goto('/admin/categories')

    await categoryRow(page, name).getByRole('button', { name: 'Archive' }).click()
    await expect(page.getByRole('status')).toHaveText(`Archived ${name}.`)
    await expect(categoryRow(page, name)).toContainText('Archived')
    await expect(categoryRow(page, name).getByTestId('draw-number')).toHaveText('–')

    await categoryRow(page, name).getByRole('button', { name: 'Unarchive' }).click()
    await expect(page.getByRole('status')).toHaveText(`Unarchived ${name}.`)
    await expect(categoryRow(page, name)).toContainText('Active')
    await expect(categoryRow(page, name).getByTestId('draw-number')).toHaveText(/^\d+$/)
})

test('only an empty category can be deleted', async ({ page }) => {
    const { userId } = await signInAs(page, 'admin')
    const full = unique('Volcanoes')
    const empty = unique('Geysers')
    const fullId = await newCategory(userId, full)
    await newCategory(userId, empty)
    await saveCard(db, userId, {
        categoryId: fullId,
        date: { decade: 1960, year: null, month: null, day: null },
        sourceUrl: null,
        sourceQuote: null,
        translations: { en: { text: 'A made-up volcano wakes up' } },
    })
    await page.goto('/admin/categories')

    await expect(categoryRow(page, full).getByTestId('card-count')).toHaveText('1')
    await expect(categoryRow(page, full).getByRole('button', { name: 'Delete' })).toBeDisabled()

    page.on('dialog', (dialog) => dialog.accept())
    await categoryRow(page, empty).getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('status')).toHaveText(`Deleted ${empty}.`)
    await expect(categoryRow(page, empty)).toHaveCount(0)
    await expect(categoryRow(page, full)).toHaveCount(1)
})
