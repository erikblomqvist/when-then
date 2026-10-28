import { expect, test } from '@playwright/test'
import { gotoHydrated } from '../../../../lib/testing/e2e-hydration'

// PROTOTYPE (#100): each mockup renders its moment, so the PR's screenshots can be retaken.
test('the card filters prototype shows each mockup', async ({ page }) => {
    await gotoHydrated(page, '/prototype/card-filters')
    await expect(page.getByRole('heading', { name: 'Card filters' })).toBeVisible()
    await expect(page.getByText('Easy to Medium · from 1900')).toBeVisible()

    // Ella's filters: the difficulty range and insider cards as tiles, kept or filtered out.
    await gotoHydrated(page, '/prototype/card-filters?view=edit')
    await expect(page.getByRole('heading', { name: 'Filters for Ella' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Medium' })).toHaveAttribute(
        'aria-pressed',
        'true',
    )
    await expect(page.getByRole('button', { name: 'Hard' })).toHaveAttribute(
        'aria-pressed',
        'false',
    )
    await expect(page.getByRole('button', { name: 'Norway' })).toHaveAttribute(
        'aria-pressed',
        'false',
    )

    // A veteran leaves out only the easy cards.
    await gotoHydrated(page, '/prototype/card-filters?view=edit&who=astrid')
    await expect(page.getByRole('button', { name: 'Easy' })).toHaveAttribute(
        'aria-pressed',
        'false',
    )
    await expect(page.getByRole('button', { name: 'Obscure' })).toHaveAttribute(
        'aria-pressed',
        'true',
    )

    await gotoHydrated(page, '/prototype/card-filters?view=player')
    await expect(page.getByText('Your card filters')).toBeVisible()

    await gotoHydrated(page, '/prototype/card-filters?view=loosened')
    await expect(page.getByText('Hard cards now match Ella’s filters.')).toBeVisible()

    // Anyone can steal any card; a filtered one says so.
    await gotoHydrated(page, '/prototype/card-filters?view=steal')
    await expect(page.getByText('Filtered out for you')).toBeVisible()
    await expect(page.getByText('trying now')).toBeVisible()
})
