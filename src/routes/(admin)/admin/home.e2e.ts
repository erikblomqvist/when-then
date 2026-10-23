// The admin Home: stat tiles that open the card list filtered to what they count, a card per
// section (People and the audit log for admins only) and, for admins, recent activity.

import { expect, test } from '@playwright/test'
import { signInAs } from '../../../lib/testing/e2e-auth'
import { gotoHydrated } from '../../../lib/testing/e2e-hydration'

test('an admin sees the numbers, every section and recent activity', async ({ page }) => {
    await signInAs(page, 'admin')
    await gotoHydrated(page, '/admin')
    await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Add from photo' })).toHaveAttribute(
        'href',
        '/admin/cards/photo',
    )

    const glance = page.getByRole('region', { name: 'At a glance' })
    await expect(glance.getByRole('link', { name: /Published/ })).toHaveAttribute(
        'href',
        '/admin/cards?status=published',
    )
    await expect(glance.getByRole('link', { name: /Unverified dates/ })).toHaveAttribute(
        'href',
        '/admin/cards?verified=no',
    )
    await expect(glance.getByRole('link', { name: /Swedish to review/ })).toHaveAttribute(
        'href',
        '/admin/cards?sv=needs-review&review=sv',
    )

    const sections = page.getByRole('region', { name: 'Sections' })
    for (const [name, href] of [
        ['Cards', '/admin/cards'],
        ['Categories', '/admin/categories'],
        ['People', '/admin/people'],
        ['Audit log', '/admin/audit'],
    ]) {
        await expect(sections.getByRole('link', { name: new RegExp(`^${name}`) })).toHaveAttribute(
            'href',
            href,
        )
    }
    // The Cards card charts the last eight weeks of publishing.
    await expect(
        sections.getByRole('img', { name: /^Cards published per week, the last 8 weeks: / }),
    ).toBeVisible()
    await expect(page.getByRole('region', { name: 'Translations' })).toContainText('Swedish')
    await expect(page.getByRole('region', { name: 'Recent activity' })).toBeVisible()

    await glance.getByRole('link', { name: /Drafts?/ }).click()
    await expect(page).toHaveURL('/admin/cards?status=draft')
})

test('an editor sees the cards side only', async ({ page }) => {
    await signInAs(page, 'editor')
    await gotoHydrated(page, '/admin')
    const sections = page.getByRole('region', { name: 'Sections' })
    await expect(sections.getByRole('link', { name: /^Cards/ })).toBeVisible()
    // Adding from a photo is for admins.
    await expect(page.getByText('Add from photo')).toHaveCount(0)
    // Categories are shown, but only admins manage them.
    await expect(sections).toContainText('An admin manages the categories.')
    await expect(sections.getByRole('link', { name: /^Categories/ })).toHaveCount(0)
    await expect(sections.getByRole('link', { name: /^People/ })).toHaveCount(0)
    await expect(sections.getByRole('link', { name: /^Audit log/ })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Recent activity' })).toHaveCount(0)
})
