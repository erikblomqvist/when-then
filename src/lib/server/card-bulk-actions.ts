// The card list's bulk actions as form actions, to spread into /admin/cards' `actions`. Each
// posts a `CardSelection` (the fields `BulkActionBar` writes) and gets back a `bulk` report
// for the list to show. A new bulk action (export, machine translation) reads the selection
// with `selectedCardIds` and returns its own result.

import { fail, type RequestEvent } from '@sveltejs/kit'
import { readCardSelection } from '../cards/card-selection'
import {
    archiveCards,
    moveCards,
    publishCards,
    type BulkResult,
    type SkippedCard,
} from './card-bulk'
import { resolveCardSelection } from './card-selection'
import { AiUnavailableError } from './ai'
import { aiDeps } from './ai-client'
import { translateMissingCards } from './card-ai-translate'
import { listCategories } from './categories'
import { requireRole } from './guard'
import { supabaseService } from './supabase'

/** What the list shows after a bulk action: a sentence, and the skipped cards with reasons. */
export type BulkReport = { message: string; skipped: SkippedCard[] }

/**
 * The signed-in editor, the posted form and the ids of the selected cards ("all matching" is
 * resolved now). Fails with 400 when the form selects no card.
 */
export async function selectedCardIds(event: RequestEvent) {
    const { user } = await requireRole(event, 'editor')
    const form = await event.request.formData()
    const selection = readCardSelection(form)
    if (!selection) return { failure: fail(400, { bulkError: 'Select at least one card.' }) }
    const ids = await resolveCardSelection(supabaseService(), selection)
    return { user, form, ids }
}

const cards = (n: number) => (n === 0 ? 'no cards' : n === 1 ? '1 card' : `${n} cards`)

const report = (result: BulkResult, done: (count: string) => string) => ({
    bulk: { message: done(cards(result.done.length)), skipped: result.skipped } as BulkReport,
})

export const cardBulkActions = {
    publish: async (event: RequestEvent) => {
        const selected = await selectedCardIds(event)
        if ('failure' in selected) return selected.failure
        const result = await publishCards(supabaseService(), selected.user.id, selected.ids)
        return report(result, (count) => `Published ${count}.`)
    },
    archive: async (event: RequestEvent) => {
        const selected = await selectedCardIds(event)
        if ('failure' in selected) return selected.failure
        const result = await archiveCards(supabaseService(), selected.user.id, selected.ids)
        return report(result, (count) => `Archived ${count}.`)
    },
    move: async (event: RequestEvent) => {
        const selected = await selectedCardIds(event)
        if ('failure' in selected) return selected.failure
        const db = supabaseService()
        const target = (await listCategories(db)).find(
            (category) => category.id === selected.form.get('move_to'),
        )
        if (!target) return fail(400, { bulkError: 'Choose a category to move the cards to.' })
        const result = await moveCards(db, selected.user.id, selected.ids, target.id)
        return report(result, (count) => `Moved ${count} to ${target.name}.`)
    },
    /** Machine-translates the missing locales (#41); per-card failures are skipped. */
    translate: async (event: RequestEvent) => {
        const selected = await selectedCardIds(event)
        if ('failure' in selected) return selected.failure
        let deps
        try {
            deps = aiDeps()
        } catch (error) {
            if (error instanceof AiUnavailableError) {
                return fail(503, { bulkError: error.message })
            }
            throw error
        }
        const result = await translateMissingCards(
            deps,
            supabaseService(),
            selected.user.id,
            selected.ids,
        )
        return report(result, (count) => `Machine-translated ${count}.`)
    },
}
