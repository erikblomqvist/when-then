import { page } from 'vite-plus/test/browser'
import { describe, expect, it } from 'vite-plus/test'
import { render } from 'vitest-browser-svelte'
import SeatingEditor from './SeatingEditor.svelte'
// Global styles come in through the game layout; load them for the tap highlight check.
import '../styles/components.css'

const players = ['Astrid', 'Bjørn', 'Cecilia', 'Dag'].map((name) => ({
    id: name.toLowerCase(),
    name,
}))
const seating = players.map((p) => p.id)

function pointer(type: string, target: EventTarget, pointerId: number, x = 0, y = 0) {
    target.dispatchEvent(
        new PointerEvent(type, {
            pointerId,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
        }),
    )
}

describe('SeatingEditor.svelte', () => {
    it('ignores a second finger while one is dragging', async () => {
        render(SeatingEditor, { props: { players, seating, anchor: 'astrid' } })
        const bjorn = page.getByRole('button', { name: 'Bjørn' })
        const cecilia = page.getByRole('button', { name: 'Cecilia' })

        pointer('pointerdown', bjorn.element(), 1, 100, 100)
        await expect.element(bjorn).toHaveClass('seating-editor__seat--dragging')
        const left = (bjorn.element() as HTMLElement).style.left

        pointer('pointerdown', cecilia.element(), 2, 200, 200)
        pointer('pointermove', window, 2, 300, 300)
        pointer('pointerup', window, 2, 300, 300)
        await expect.element(cecilia).not.toHaveClass('seating-editor__seat--dragging')
        await expect.element(bjorn).toHaveClass('seating-editor__seat--dragging')
        expect((bjorn.element() as HTMLElement).style.left).toBe(left)

        pointer('pointerup', window, 1, 100, 100)
        await expect.element(bjorn).not.toHaveClass('seating-editor__seat--dragging')
    })

    it('only cancels the drag for the finger that started it', async () => {
        render(SeatingEditor, { props: { players, seating, anchor: 'astrid' } })
        const bjorn = page.getByRole('button', { name: 'Bjørn' })

        pointer('pointerdown', bjorn.element(), 1)
        pointer('pointercancel', window, 2)
        await expect.element(bjorn).toHaveClass('seating-editor__seat--dragging')

        pointer('pointercancel', window, 1)
        await expect.element(bjorn).not.toHaveClass('seating-editor__seat--dragging')
    })

    it('turns off the iOS tap highlight on seats', async () => {
        render(SeatingEditor, { props: { players, seating, anchor: 'astrid' } })
        const bjorn = page.getByRole('button', { name: 'Bjørn' }).element()

        expect(getComputedStyle(bjorn).getPropertyValue('-webkit-tap-highlight-color')).toBe(
            'rgba(0, 0, 0, 0)',
        )
    })
})
