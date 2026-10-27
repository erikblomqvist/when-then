import { page, userEvent } from 'vite-plus/test/browser'
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
        pointer('pointermove', window, 1, 120, 120)
        await expect.element(bjorn).toHaveClass('seating-editor__seat--dragging')
        const left = (bjorn.element() as HTMLElement).style.left

        pointer('pointerdown', cecilia.element(), 2, 200, 200)
        pointer('pointermove', window, 2, 300, 300)
        pointer('pointerup', window, 2, 300, 300)
        await expect.element(cecilia).not.toHaveClass('seating-editor__seat--dragging')
        await expect.element(bjorn).toHaveClass('seating-editor__seat--dragging')
        expect((bjorn.element() as HTMLElement).style.left).toBe(left)

        pointer('pointerup', window, 1, 120, 120)
        await expect.element(bjorn).not.toHaveClass('seating-editor__seat--dragging')
    })

    it('only cancels the drag for the finger that started it', async () => {
        render(SeatingEditor, { props: { players, seating, anchor: 'astrid' } })
        const bjorn = page.getByRole('button', { name: 'Bjørn' })

        pointer('pointerdown', bjorn.element(), 1)
        pointer('pointermove', window, 1, 20, 20)
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

    it('swaps two players tapped one after the other', async () => {
        render(SeatingEditor, { props: { players, seating, anchor: 'astrid' } })
        const bjorn = page.getByRole('button', { name: 'Bjørn' })

        // A finger that stays put doesn't lift the name, so the tap lands on it.
        pointer('pointerdown', bjorn.element(), 1, 100, 100)
        await expect.element(bjorn).not.toHaveClass('seating-editor__seat--dragging')
        pointer('pointerup', window, 1, 102, 101)
        await bjorn.click()
        await expect.element(bjorn).toHaveAttribute('aria-pressed', 'true')
        await expect.element(page.getByText('Pick someone to swap with Bjørn.')).toBeVisible()

        await page.getByRole('button', { name: 'Dag' }).click()
        await expect
            .element(page.getByText('Dag is on your left, Bjørn on your right.'))
            .toBeVisible()
        await expect.element(bjorn).toHaveAttribute('aria-pressed', 'false')

        await page.getByRole('button', { name: 'Undo' }).click()
        await expect
            .element(page.getByText('Bjørn is on your left, Dag on your right.'))
            .toBeVisible()
    })

    it('puts a tapped player down when tapped again', async () => {
        render(SeatingEditor, { props: { players, seating, anchor: 'astrid' } })
        const bjorn = page.getByRole('button', { name: 'Bjørn' })

        await bjorn.click()
        await bjorn.click()
        await expect.element(bjorn).toHaveAttribute('aria-pressed', 'false')
        await expect
            .element(page.getByText('Bjørn is on your left, Dag on your right.'))
            .toBeVisible()
    })

    it('seats people with the keyboard alone', async () => {
        render(SeatingEditor, { props: { players, seating, anchor: 'astrid' } })
        const bjorn = page.getByRole('button', { name: 'Bjørn' })

        ;(bjorn.element() as HTMLElement).focus()
        await userEvent.keyboard('{Enter}')
        await expect.element(bjorn).toHaveAttribute('aria-pressed', 'true')
        await userEvent.keyboard('{Escape}')
        await expect.element(bjorn).toHaveAttribute('aria-pressed', 'false')

        await userEvent.keyboard('{Enter}')
        ;(page.getByRole('button', { name: 'Dag' }).element() as HTMLElement).focus()
        await userEvent.keyboard(' ')
        await expect
            .element(page.getByText('Dag is on your left, Bjørn on your right.'))
            .toBeVisible()
    })

    it("doesn't take the end of a drag for a tap", async () => {
        render(SeatingEditor, { props: { players, seating, anchor: 'astrid' } })
        const bjorn = page.getByRole('button', { name: 'Bjørn' })

        pointer('pointerdown', bjorn.element(), 1, 100, 100)
        pointer('pointermove', window, 1, 160, 160)
        pointer('pointerup', window, 1, 160, 160)
        bjorn.element().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
        await expect.element(bjorn).toHaveAttribute('aria-pressed', 'false')
    })

    it('takes a key press for a tap after a drag let go off its name', async () => {
        render(SeatingEditor, { props: { players, seating, anchor: 'astrid' } })
        const bjorn = page.getByRole('button', { name: 'Bjørn' })

        pointer('pointerdown', bjorn.element(), 1, 100, 100)
        pointer('pointermove', window, 1, 400, 400)
        pointer('pointerup', window, 1, 400, 400)
        ;(bjorn.element() as HTMLElement).focus()
        await userEvent.keyboard('{Enter}')
        await expect.element(bjorn).toHaveAttribute('aria-pressed', 'true')
    })

    it('ignores a tap from a second finger while one is dragging', async () => {
        render(SeatingEditor, { props: { players, seating, anchor: 'astrid' } })
        const bjorn = page.getByRole('button', { name: 'Bjørn' })
        const cecilia = page.getByRole('button', { name: 'Cecilia' })

        pointer('pointerdown', bjorn.element(), 1, 100, 100)
        pointer('pointermove', window, 1, 120, 120)
        cecilia.element().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
        await expect.element(cecilia).toHaveAttribute('aria-pressed', 'false')
    })

    it('offers only Reverse with three players', async () => {
        render(SeatingEditor, {
            props: { players: players.slice(0, 3), seating: seating.slice(0, 3), anchor: 'astrid' },
        })

        await expect.element(page.getByRole('button', { name: 'Reverse' })).toBeVisible()
        await expect.element(page.getByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
        await expect.element(page.getByRole('button', { name: 'Bjørn' })).not.toBeInTheDocument()
        await expect.element(page.getByText('Bjørn', { exact: true })).toBeVisible()

        await page.getByRole('button', { name: 'Reverse' }).click()
        await expect
            .element(page.getByText('Cecilia is on your left, Bjørn on your right.'))
            .toBeVisible()
    })
})
