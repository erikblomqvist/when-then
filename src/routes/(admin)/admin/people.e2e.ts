import { randomUUID } from 'node:crypto'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { signInAs } from '../../../lib/testing/e2e-auth'

// A second person in their own browser, next to the admin's.
async function otherBrowser(browser: Browser, baseURL: string | undefined) {
    const context = await browser.newContext({ baseURL })
    return context.newPage()
}

const peopleRow = (page: Page, email: string) =>
    page.getByRole('region', { name: 'People with a role' }).getByRole('row', { name: email })
const inviteRow = (page: Page, email: string) =>
    page.getByRole('region', { name: 'Pending invites' }).getByRole('row', { name: email })

test('an editor has no People page', async ({ page }) => {
    await signInAs(page, 'editor')

    await page.goto('/admin')
    await expect(page.getByRole('navigation', { name: 'Admin' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'People' })).toHaveCount(0)

    const response = await page.goto('/admin/people')
    expect(response?.status()).toBe(403)
})

test('an invited email gets its role at the first Google sign-in', async ({
    page,
    browser,
    baseURL,
}) => {
    await signInAs(page, 'admin')
    await page.goto('/admin')
    await page.getByRole('link', { name: 'People' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible()

    const email = `invitee-${randomUUID()}@example.com`
    await page.getByLabel('Email', { exact: true }).fill(email.toUpperCase())
    await page.getByLabel('Role', { exact: true }).selectOption('editor')
    await page.getByRole('button', { name: 'Add person' }).click()

    await expect(page.getByRole('status')).toHaveText(
        `Invited ${email} as editor. The role attaches when they first sign in with Google.`,
    )
    await expect(inviteRow(page, email)).toContainText('editor')

    const invitee = await otherBrowser(browser, baseURL)
    await signInAs(invitee, null, { email })
    await invitee.goto('/admin')
    await expect(invitee.getByTestId('signed-in-as')).toHaveText(`${email} · editor`)

    await page.reload()
    await expect(inviteRow(page, email)).toHaveCount(0)
    await expect(peopleRow(page, email).getByLabel(`Role for ${email}`)).toHaveValue('editor')
})

test('a pending invite can be changed and withdrawn', async ({ page }) => {
    await signInAs(page, 'admin')
    await page.goto('/admin/people')

    const email = `pending-${randomUUID()}@example.com`
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByRole('button', { name: 'Add person' }).click()
    await expect(inviteRow(page, email)).toBeVisible()

    await inviteRow(page, email).getByLabel(`Role for ${email}`).selectOption('admin')
    await inviteRow(page, email).getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText(`${email} will be admin.`)
    await expect(inviteRow(page, email).getByLabel(`Role for ${email}`)).toHaveValue('admin')

    await inviteRow(page, email).getByRole('button', { name: 'Withdraw' }).click()
    await expect(page.getByRole('status')).toHaveText(`Withdrew the invite for ${email}.`)
    await expect(inviteRow(page, email)).toHaveCount(0)
})

test('a role change and a revoke take effect on the next request', async ({
    page,
    browser,
    baseURL,
}) => {
    await signInAs(page, 'admin')
    const editor = await otherBrowser(browser, baseURL)
    const { email } = await signInAs(editor, 'editor')
    await editor.goto('/admin')
    await expect(editor.getByTestId('signed-in-as')).toHaveText(`${email} · editor`)

    await page.goto('/admin/people')
    await peopleRow(page, email).getByLabel(`Role for ${email}`).selectOption('admin')
    await peopleRow(page, email).getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText(`${email} is now admin.`)

    await editor.reload()
    await expect(editor.getByTestId('signed-in-as')).toHaveText(`${email} · admin`)

    await peopleRow(page, email).getByRole('button', { name: 'Revoke' }).click()
    await expect(page.getByRole('status')).toHaveText(`Revoked the role of ${email}.`)
    await expect(peopleRow(page, email)).toHaveCount(0)

    await editor.reload()
    await expect(editor).toHaveURL('/admin/no-access')
})
