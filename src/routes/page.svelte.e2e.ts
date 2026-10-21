import { expect, test } from '@playwright/test'

test('home page shows the game title', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'When Then?' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test.describe('with a Swedish browser', () => {
    test.use({ locale: 'sv-SE' })

    test('home page is in Swedish, from Accept-Language, without a locale in the URL', async ({
        page,
    }) => {
        await page.goto('/')
        await expect(page.getByRole('heading', { level: 1, name: 'När då då?' })).toBeVisible()
        await expect(page.locator('html')).toHaveAttribute('lang', 'sv')
        expect(new URL(page.url()).pathname).toBe('/')
    })
})

test('serves the web app manifest', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest')
    expect(response.ok()).toBe(true)
    expect((await response.json()).name).toBe('When Then?')
})
