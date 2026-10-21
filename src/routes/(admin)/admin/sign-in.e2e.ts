import { expect, test } from '@playwright/test'
import { signInAs } from '../../../lib/testing/e2e-auth'

test('signed out, the admin sends you to sign in and back to where you were going', async ({
    page,
}) => {
    await page.goto('/admin?tab=drafts')

    await expect(page).toHaveURL('/admin/sign-in?redirectTo=%2Fadmin%3Ftab%3Ddrafts')
    await expect(page.getByRole('heading', { name: 'Sign in to the admin' })).toBeVisible()
})

test('a form post to the admin is turned away too, not only page loads', async ({
    request,
    baseURL,
}) => {
    const response = await request.post('/admin', {
        form: { anything: 'at all' },
        // As a browser posts a form without JavaScript.
        headers: { origin: baseURL ?? '', accept: 'text/html' },
        maxRedirects: 0,
    })

    expect(response.status()).toBe(303)
    expect(response.headers()['location']).toMatch(/^\/admin\/sign-in\?/)
})

test('"Sign in with Google" hands over to Google through Supabase', async ({ page }) => {
    // Stop at Supabase's authorize endpoint: the local stack has no real Google client.
    const authorizeUrl = /\/auth\/v1\/authorize\?/
    const authorize = page.waitForRequest(authorizeUrl)
    await page.route(authorizeUrl, (route) =>
        route.fulfill({ body: 'Google would take over here' }),
    )

    await page.goto('/admin/sign-in?redirectTo=%2Fadmin%2Fcards')
    await page.getByRole('button', { name: 'Sign in with Google' }).click()

    const url = new URL((await authorize).url())
    expect(url.searchParams.get('provider')).toBe('google')
    const callback = new URL(url.searchParams.get('redirect_to') ?? '')
    expect(callback.pathname).toBe('/admin/auth/callback')
    expect(callback.searchParams.get('next')).toBe('/admin/cards')
})

test('a failed return from Google lands back on sign-in with a message', async ({ page }) => {
    await page.goto('/admin/auth/callback?code=not-a-real-code&next=%2Fadmin%2Fcards')

    await expect(page).toHaveURL('/admin/sign-in?error=google&redirectTo=%2Fadmin%2Fcards')
    await expect(page.getByRole('alert')).toHaveText(
        'Google sign-in did not complete. Please try again.',
    )
})

test('signed in without a role,you see the no-access page and can sign out', async ({ page }) => {
    const { email } = await signInAs(page, null)

    await page.goto('/admin')

    await expect(page).toHaveURL('/admin/no-access')
    await expect(page.getByRole('heading', { name: "You don't have access yet" })).toBeVisible()
    await expect(page.getByRole('main')).toContainText(email)

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL('/admin/sign-in')
})

for (const role of ['editor', 'admin'] as const) {
    test(`an ${role} reaches the admin shell and can sign out`, async ({ page }) => {
        const { email } = await signInAs(page, role)

        await page.goto('/admin')

        await expect(page.getByRole('heading', { level: 1, name: 'Admin' })).toBeVisible()
        await expect(page.getByTestId('signed-in-as')).toHaveText(`${email} · ${role}`)

        await page.getByRole('button', { name: 'Sign out' }).click()
        await expect(page).toHaveURL('/admin/sign-in')
        await page.goto('/admin')
        await expect(page).toHaveURL(/\/admin\/sign-in\?/)
    })
}

test('signed in with a role, the sign-in page sends you on into the admin', async ({ page }) => {
    await signInAs(page, 'editor')

    await page.goto('/admin/sign-in?redirectTo=%2Fadmin')

    await expect(page).toHaveURL('/admin')
})
