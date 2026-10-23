import ArchiveIcon from '@lucide/svelte/icons/archive'
import { page, userEvent } from 'vite-plus/test/browser'
import { describe, expect, it, vi } from 'vite-plus/test'
import { render } from 'vitest-browser-svelte'
import ContextMenu from './ContextMenu.svelte'
import ContextMenuPopup from './ContextMenuPopup.svelte'
import type { ContextMenuAction } from './context-menu'

describe('ContextMenu.svelte', () => {
    it('makes each action a full row: label, caption as its description, keys, tone', async () => {
        const archive = vi.fn()
        const actions: ContextMenuAction[] = [
            { label: 'Save', form: 'editor', keys: ['mod', 's'] },
            { label: 'Archive', icon: ArchiveIcon, tone: 'caution', onclick: archive },
            { label: 'Mark date verified', caption: 'Not verified against a source yet.' },
            {
                label: 'Delete draft',
                tone: 'destructive',
                disabled: true,
                confirm: { title: 'Delete?', message: 'Gone.', confirmLabel: 'Delete' },
            },
        ]
        render(ContextMenu, { label: 'Card actions', actions })

        const menu = page.getByRole('list', { name: 'Card actions' })
        await expect.element(menu).toBeVisible()
        expect(menu.getByRole('listitem').all()).toHaveLength(4)

        // A form row submits that form; a plain row is a button that does its own thing.
        const save = page.getByRole('button', { name: 'Save' })
        await expect.element(save).toHaveAttribute('type', 'submit')
        await expect.element(save).toHaveAttribute('form', 'editor')
        await expect.element(save).toHaveAttribute('aria-keyshortcuts', 'Control+S Meta+S')

        const archiveRow = page.getByRole('button', { name: 'Archive' })
        await expect.element(archiveRow).toHaveAttribute('type', 'button')
        await expect.element(archiveRow).toHaveClass(/text-tone-caution/)
        await archiveRow.click()
        expect(archive).toHaveBeenCalledOnce()

        // The caption describes the row; the label alone names it.
        const verify = page.getByRole('button', { name: 'Mark date verified', exact: true })
        await expect
            .element(verify)
            .toHaveAccessibleDescription('Not verified against a source yet.')

        await expect.element(page.getByRole('button', { name: 'Delete draft' })).toBeDisabled()
    })

    it('tells `onaction` which row was picked', async () => {
        const onaction = vi.fn()
        render(ContextMenu, { label: 'Actions', actions: [{ label: 'Open' }], onaction })

        await page.getByRole('button', { name: 'Open' }).click()
        expect(onaction).toHaveBeenCalledWith(expect.objectContaining({ label: 'Open' }))
    })
})

describe('ContextMenu.svelte confirmation', () => {
    const confirm = {
        title: 'Delete this draft?',
        message: 'The card is deleted for good.',
        confirmLabel: 'Delete draft',
        cancelLabel: 'Keep it',
    }

    it('asks first, in the action’s own words, and only acts once confirmed', async () => {
        const remove = vi.fn()
        const onaction = vi.fn()
        render(ContextMenu, {
            label: 'Actions',
            actions: [{ label: 'Delete', tone: 'destructive', onclick: remove, confirm }],
            onaction,
        })

        await page.getByRole('button', { name: 'Delete', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Delete this draft?' })
        await expect.element(dialog).toBeVisible()
        await expect.element(dialog).toHaveAccessibleDescription('The card is deleted for good.')
        expect(remove).not.toHaveBeenCalled()

        // Backing out does nothing.
        await dialog.getByRole('button', { name: 'Keep it' }).click()
        await expect.element(dialog).not.toBeInTheDocument()
        expect(remove).not.toHaveBeenCalled()
        expect(onaction).not.toHaveBeenCalled()

        await page.getByRole('button', { name: 'Delete', exact: true }).click()
        await page.getByRole('button', { name: 'Delete draft' }).click()
        expect(remove).toHaveBeenCalledOnce()
        expect(onaction).toHaveBeenCalledOnce()
    })

    it('submits a form row’s form once confirmed', async () => {
        const form = document.createElement('form')
        form.id = 'delete-form'
        const submitted = vi.fn((event: Event) => event.preventDefault())
        form.addEventListener('submit', submitted)
        document.body.append(form)
        render(ContextMenu, {
            label: 'Actions',
            actions: [{ label: 'Delete', tone: 'destructive', form: 'delete-form', confirm }],
        })

        await page.getByRole('button', { name: 'Delete', exact: true }).click()
        expect(submitted).not.toHaveBeenCalled()
        await page.getByRole('button', { name: 'Delete draft' }).click()
        expect(submitted).toHaveBeenCalledOnce()
        form.remove()
    })
})

describe('ContextMenuPopup.svelte', () => {
    it('opens the menu from its button and closes it once an action is picked', async () => {
        const open = vi.fn()
        render(ContextMenuPopup, {
            label: 'Actions for Moon landing',
            actions: [
                { label: 'Open card', onclick: open },
                { label: 'Archive', tone: 'caution' },
            ],
        })

        const trigger = page.getByRole('button', { name: 'Actions for Moon landing' })
        const menu = page.getByRole('list', { name: 'Actions for Moon landing' })
        await expect.element(menu).not.toBeInTheDocument()

        await trigger.click()
        await expect.element(menu).toBeVisible()
        await page.getByRole('button', { name: 'Open card' }).click()
        expect(open).toHaveBeenCalledOnce()
        await expect.element(menu).not.toBeInTheDocument()

        // Escape closes it too, without picking anything.
        await trigger.click()
        await expect.element(menu).toBeVisible()
        await userEvent.keyboard('{Escape}')
        await expect.element(menu).not.toBeInTheDocument()
    })
})
