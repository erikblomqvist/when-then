import { page } from 'vite-plus/test/browser'
import { describe, expect, it } from 'vite-plus/test'
import { render } from 'vitest-browser-svelte'
import { categoryIcons, type CategoryLook } from '../categories/look'
import CategoryDot from './CategoryDot.svelte'
import CategoryIcon from './CategoryIcon.svelte'
import CategoryLegendItem from './CategoryLegendItem.svelte'

const royals: CategoryLook = { name: 'Royals', icon: 'crown', colour: 'purple' }

describe('category badges render from category data', () => {
    it('draws every icon in the curated set', async () => {
        for (const icon of categoryIcons) {
            const { container, unmount } = render(CategoryIcon, { icon })
            const svg = container.querySelector('svg')
            expect(svg?.classList.contains(`lucide-${icon}`), icon).toBe(true)
            expect(svg?.getAttribute('aria-hidden')).toBe('true')
            unmount()
        }
    })

    it('shows a category dot in its colour, with its icon, named for screen readers', async () => {
        const { container } = render(CategoryDot, { category: royals })

        const dot = page.getByRole('img', { name: 'Royals' })
        await expect.element(dot).toHaveClass('cat-purple')
        expect(container.querySelector('svg.lucide-crown')).not.toBeNull()
    })

    it('labels a legend swatch with the category name, or a given label', async () => {
        render(CategoryLegendItem, { category: royals })
        await expect.element(page.getByText('Royals')).toHaveClass('cat-purple')

        render(CategoryLegendItem, { category: royals, label: 'Kungligheter' })
        await expect.element(page.getByText('Kungligheter')).toHaveClass('cat-purple')
    })
})
