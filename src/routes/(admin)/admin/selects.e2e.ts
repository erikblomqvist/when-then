// The admin's selects are customizable selects where the browser has them (Chromium here):
// the open list is styled like the admin's popovers, and the value still posts as before.

import { expect, test } from '@playwright/test'
import { signInAs } from '../../../lib/testing/e2e-auth'
import { gotoHydrated } from '../../../lib/testing/e2e-hydration'

test('selects use the customizable appearance and still pick a value', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin/cards/new')
    const month = page.getByLabel('Month')
    expect(await month.evaluate((select) => getComputedStyle(select).appearance)).toBe(
        'base-select',
    )
    await month.selectOption({ label: 'March' })
    await expect(month).toHaveValue('3')
})

test('the people page uses the same selects', async ({ page }) => {
    await signInAs(page, 'admin')
    await gotoHydrated(page, '/admin/people')
    const role = page.getByLabel('Role', { exact: true })
    expect(await role.getAttribute('data-slot')).toBe('native-select')
})
