// The actions a `ContextMenu` shows: one row each, with a label, an icon, a tone and optional
// keyboard shortcut keycaps. A row is a button that does one of three things:
//
// - `onclick`: runs in the page.
// - `form` (+ `formaction`): submits that form, like a submit button placed elsewhere, so a
//   form with `use:enhance` (and any confirmation it asks) does the work.
// - `href`: goes to a page.
//
// With `confirm`, the row first asks in a dialog (its own question, consequence and action
// word) and only acts once confirmed. A destructive row must have one.
//
//     const actions: ContextMenuAction[] = [
//         { label: 'Save', icon: SaveIcon, form: 'card-editor', keys: ['mod', 's'] },
//         {
//             label: 'Delete draft',
//             icon: TrashIcon,
//             tone: 'destructive',
//             form: 'delete-draft',
//             confirm: {
//                 title: 'Delete this draft?',
//                 message: 'It is gone for good.',
//                 confirmLabel: 'Delete draft',
//             },
//         },
//     ]

import type { Component } from 'svelte'
import type { ShortcutKey } from './shortcut'

/**
 * How a row reads, in the colour of its label and icon: 'neutral' (the default),
 * 'constructive' (green: publish, restore), 'caution' (ochre: archive, undo) or 'destructive'
 * (red: delete).
 */
export type ContextMenuTone = 'neutral' | 'constructive' | 'caution' | 'destructive'

/**
 * The question a row asks before it acts: what happens, in words fitting the action. Shown in
 * a dialog with the row's tone; nothing happens unless the person confirms.
 */
export type ContextMenuConfirmation = {
    /** The question, e.g. 'Delete this draft?'. */
    title: string
    /** What follows, e.g. 'The card and its translations are gone for good.' */
    message: string
    /** The confirming button, an action word: 'Delete draft'. */
    confirmLabel: string
    /** The button that backs out; 'Cancel' unless given. */
    cancelLabel?: string
}

type ContextMenuRow = {
    label: string
    /** A second, quieter line under the label, e.g. the state the action changes. */
    caption?: string
    /** A Lucide icon component (`@lucide/svelte/icons/<name>`), shown before the label. */
    icon?: Component
    /** A keyboard shortcut to show as keycaps at the row's end (and as `aria-keyshortcuts`). */
    keys?: readonly ShortcutKey[]
    disabled?: boolean
    /** The id of the text explaining the row, e.g. why it is disabled. */
    describedBy?: string
    /** The row's id, e.g. for a shortcut handler to find the button. */
    id?: string
    onclick?: () => void
    /** Submit this form (its id); with `formaction`, to that action instead of the form's. */
    form?: string
    formaction?: string
    href?: string
}

/** A row; a destructive one must say what it destroys and ask first (`confirm`). */
export type ContextMenuAction = ContextMenuRow &
    (
        | { tone: 'destructive'; confirm: ContextMenuConfirmation }
        | { tone?: Exclude<ContextMenuTone, 'destructive'>; confirm?: ContextMenuConfirmation }
    )
