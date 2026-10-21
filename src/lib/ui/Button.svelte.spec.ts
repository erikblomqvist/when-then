import { createRawSnippet } from 'svelte'
import { page } from 'vite-plus/test/browser'
import { describe, expect, it } from 'vite-plus/test'
import { render } from 'vitest-browser-svelte'
import Button from './Button.svelte'

const label = createRawSnippet(() => ({ render: () => '<span>Lock</span>' }))

describe('Button.svelte', () => {
    it('is a plain button by default, so it never submits a form', async () => {
        render(Button, { children: label })

        const button = page.getByRole('button', { name: 'Lock' })
        await expect.element(button).toHaveAttribute('type', 'button')
        await expect.element(button).toHaveClass('ui-button')
    })

    it('adds the variant and size modifiers', async () => {
        render(Button, { children: label, variant: 'ghost', size: 'lg' })

        const button = page.getByRole('button', { name: 'Lock' })
        await expect.element(button).toHaveClass('ui-button--ghost')
        await expect.element(button).toHaveClass('ui-button--lg')
    })
})
