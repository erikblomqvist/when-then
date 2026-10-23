import { expect, test, type Page } from '@playwright/test'
import { signInAs } from '../../../lib/testing/e2e-auth'
import { gotoHydrated } from '../../../lib/testing/e2e-hydration'

// `--surface-table` is a game token (tokens.css); `--background` is a shadcn token (admin.css).
const rootVariable = (page: Page, name: string) =>
    page.evaluate(
        (variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(),
        name,
    )

test('admin shows the shell with admin styles and none of the game styles', async ({ page }) => {
    await signInAs(page, 'editor')
    await page.goto('/admin')

    await expect(page.getByRole('banner')).toContainText('When Then? admin')
    await expect(page.getByRole('navigation', { name: 'Admin' })).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()

    expect(await rootVariable(page, '--background')).not.toBe('')
    expect(await rootVariable(page, '--surface-table')).toBe('')
    // Tailwind's own --radius-md, not the game's 12px.
    expect(await rootVariable(page, '--radius-md')).not.toBe('12px')
    // Admin uses the system font, neither Inter nor the game's fonts.
    const fontFamily = await page.evaluate(
        () => getComputedStyle(document.documentElement).fontFamily,
    )
    // The exact system stack differs between Tailwind's theme and browsers, so only check it
    // falls back to sans-serif without naming a web font.
    expect(fontFamily).toContain('sans-serif')
    expect(fontFamily).not.toMatch(/Inter|Bricolage|Fraunces/)
})

test('a game route keeps its own styles and loads no admin styles', async ({ page }) => {
    await page.goto('/')

    expect(await rootVariable(page, '--surface-table')).not.toBe('')
    expect(await rootVariable(page, '--radius-md')).toBe('12px')
    expect(await rootVariable(page, '--background')).toBe('')
})

test('the link from admin to the game reloads the page, leaving admin styles behind', async ({
    page,
}) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin')
    await page.getByRole('link', { name: 'Back to the game' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'When Then?' })).toBeVisible()

    expect(await rootVariable(page, '--background')).toBe('')
    expect(await rootVariable(page, '--surface-table')).not.toBe('')
})

test('every admin page has room under it, and the nav’s line runs to the bottom', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await signInAs(page, 'admin')
    for (const path of ['/admin', '/admin/cards/new', '/admin/audit']) {
        await gotoHydrated(page, path)
        const main = page.getByRole('main')
        expect(await main.evaluate((el) => getComputedStyle(el).paddingBottom)).toBe('160px')
        const [nav, content] = [
            await page.getByRole('navigation', { name: 'Admin' }).boundingBox(),
            await main.boundingBox(),
        ]
        expect((nav?.y ?? 0) + (nav?.height ?? 0)).toBeCloseTo(
            (content?.y ?? 0) + (content?.height ?? 0),
            0,
        )
    }
})
