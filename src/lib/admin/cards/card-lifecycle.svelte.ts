// The card page's status actions (archive, unarchive, delete) and date verification, as
// rows for the card editor's `ContextMenu`. Each row submits a small form of its own that `CardLifecycle` renders
// (by id: `lifecycleForm(name)`), posting to an action from `cardLifecycleActions`
// (#lib/server/card-editor.js). They go in the editor's menu: verification after Save, the
// status rows after Publish. The status rows wait while the editor has unsaved changes, so what
// changes status is what was saved. A draft is published from the editor, which saves it first.
//
//     const lifecycle = new CardLifecycleActions(() => ({ card, role, blockers, verifiedByEmail }))
//     <CardEditor menuActions={(state) => lifecycle.menuActions(state)}>
//         {#snippet sidebar({ dirty })}<CardLifecycle {lifecycle} {dirty} … />{/snippet}

import type { SubmitFunction } from '$app/forms'
import ArchiveIcon from '@lucide/svelte/icons/archive'
import ArchiveRestoreIcon from '@lucide/svelte/icons/archive-restore'
import BadgeCheckIcon from '@lucide/svelte/icons/badge-check'
import BadgeXIcon from '@lucide/svelte/icons/badge-x'
import TrashIcon from '@lucide/svelte/icons/trash'
import type { Card } from '#lib/cards/card.js'
import type { AppRole } from '#lib/server/roles.js'
import type { ContextMenuAction } from '../context-menu'

export type LifecycleStep = 'archive' | 'unarchive' | 'deleteCard' | 'verify' | 'unverify'

/** The id of the form a step's row submits. */
export const lifecycleForm = (step: LifecycleStep) => `lifecycle-${step}`

/** The id of the text saying why the status rows wait for the publish rule. */
export const lifecycleWhyId = 'lifecycle-why'

type Props = {
    card: Card
    role: AppRole
    /** Why the saved card can't be published yet (`publishBlockers`); empty when it can. */
    blockers: string[]
    /** Who verified the card's date, as an email to show (`verifierEmail`). */
    verifiedByEmail: string | null
}

export class CardLifecycleActions {
    /** A step's form is posting: every row waits. */
    busy = $state(false)
    #props: () => Props

    constructor(props: () => Props) {
        this.#props = props
    }

    get card() {
        return this.#props().card
    }

    get blockers() {
        return this.#props().blockers
    }

    /** Unarchiving a once-published card publishes it again, so the publish rule applies. */
    get ruleBlocks() {
        const { card, blockers } = this.#props()
        return (
            card.status === 'archived' && card.archivedFrom === 'published' && blockers.length > 0
        )
    }

    /** The steps whose forms the page needs, for the card as it is. */
    get steps(): LifecycleStep[] {
        const { card, role } = this.#props()
        return [
            card.status === 'archived' ? 'unarchive' : 'archive',
            ...(role === 'admin' ? (['deleteCard'] as const) : []),
            card.verifiedAt ? 'unverify' : 'verify',
        ]
    }

    /**
     * The rows for the editor's menu: the date verification after Save, and the status
     * actions, which wait while there are unsaved changes, after Publish.
     */
    menuActions({ dirty, unsavedId }: { dirty: boolean; unsavedId?: string }) {
        return {
            afterSave: [this.#verificationAction()],
            afterPublish: this.#statusActions(dirty, unsavedId),
        }
    }

    #statusActions(dirty: boolean, unsavedId?: string): ContextMenuAction[] {
        const { card, role } = this.#props()
        const waiting = dirty || this.ruleBlocks
        const why = dirty ? unsavedId : this.ruleBlocks ? lifecycleWhyId : undefined
        const actions: ContextMenuAction[] = []
        if (card.status === 'archived') {
            actions.push({
                label: card.archivedFrom === 'draft' ? 'Unarchive as draft' : 'Unarchive',
                icon: ArchiveRestoreIcon,
                tone: 'constructive',
                form: lifecycleForm('unarchive'),
                disabled: this.busy || waiting,
                describedBy: why,
            })
        } else {
            actions.push({
                label: 'Archive',
                icon: ArchiveIcon,
                tone: 'caution',
                form: lifecycleForm('archive'),
                disabled: this.busy || dirty,
                describedBy: why,
            })
        }
        // Any card, whatever its status; admins only.
        if (role === 'admin') {
            actions.push({
                label: 'Delete card',
                icon: TrashIcon,
                tone: 'destructive',
                form: lifecycleForm('deleteCard'),
                disabled: this.busy,
                confirm: {
                    title: 'Delete this card?',
                    message:
                        'The card and its translations are deleted for good. Its history stays in the audit log. This cannot be undone.',
                    confirmLabel: 'Delete card',
                },
            })
        }
        return actions
    }

    /** Mark the date verified, or clear it; its caption says where the card stands. */
    #verificationAction(): ContextMenuAction {
        const { card, verifiedByEmail } = this.#props()
        if (!card.verifiedAt) {
            return {
                label: 'Mark date verified',
                caption: 'Not verified against a source yet.',
                icon: BadgeCheckIcon,
                form: lifecycleForm('verify'),
                disabled: this.busy,
            }
        }
        const on = new Date(card.verifiedAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        })
        return {
            label: 'Clear date verification',
            caption: `Verified by ${verifiedByEmail ?? 'someone no longer here'} on ${on}.`,
            icon: BadgeXIcon,
            form: lifecycleForm('unverify'),
            disabled: this.busy,
        }
    }

    /** `use:enhance` for a step's form: holds the rows while it posts. (Its row asks first.) */
    submit(): SubmitFunction {
        return () => {
            this.busy = true
            return async ({ update }) => {
                await update()
                this.busy = false
            }
        }
    }
}
