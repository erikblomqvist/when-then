// Waiting for the admin to hydrate in Playwright. Until Svelte hydrates, the server-rendered
// page looks ready but a click, select or drag can do nothing (or be reset by hydration), which
// flakes under load. The admin layout sets `data-hydrated` on <html> once it has mounted.
//
//     import { gotoHydrated, waitForHydration } from '#lib/testing/e2e-hydration.js'
//     await gotoHydrated(page, '/admin/cards/new')
//     await page.reload()
//     await waitForHydration(page)

import type { Page } from '@playwright/test'

/** Resolves once the admin layout has hydrated (see `src/routes/(admin)/admin/+layout.svelte`). */
export async function waitForHydration(page: Page) {
    await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
}

/** `page.goto(url)`, then waits for hydration. Returns the navigation response. */
export async function gotoHydrated(page: Page, url: string) {
    const response = await page.goto(url)
    await waitForHydration(page)
    return response
}

/** `page.reload()`, then waits for hydration. Returns the navigation response. */
export async function reloadHydrated(page: Page) {
    const response = await page.reload()
    await waitForHydration(page)
    return response
}
