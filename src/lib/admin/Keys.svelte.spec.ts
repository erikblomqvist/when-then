import { describe, expect, it, vi } from 'vite-plus/test'
import { render } from 'vitest-browser-svelte'
import Keys from './Keys.svelte'
// The admin's styles, so the caps are laid out as on the page.
import '../../routes/(admin)/admin/admin.css'

describe('Keys.svelte', () => {
    it('draws Enter as an icon centred in its cap', async () => {
        const { container } = render(Keys, { keys: ['mod', 'enter'] })
        // The caps appear once the platform is known.
        await vi.waitFor(() => expect(container.querySelectorAll('kbd')).toHaveLength(2))

        const enter = container.querySelectorAll('kbd')[1]
        const icon = enter.querySelector('svg')!
        expect(icon).not.toBeNull()
        expect(enter.textContent?.trim()).toBe('')

        const cap = enter.getBoundingClientRect()
        const drawn = icon.getBoundingClientRect()
        const middle = (box: DOMRect) => box.top + box.height / 2
        expect(Math.abs(middle(drawn) - middle(cap))).toBeLessThanOrEqual(0.5)
    })
})
