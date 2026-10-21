// The card editor's server side, shared by /admin/cards/new and /admin/cards/[id]: what the
// editor loads next to a card, the save action, and the sidebar's lifecycle actions
// (publish, archive, unarchive, delete draft, verification). Translation saves add their own
// actions next to `saveCardAction`.

import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit'
import type { Card } from '../cards/card'
import { parseCardForm, readCardFormValues, type CardFormErrors } from '../cards/card-form'
import { publishBlockers } from '../cards/publish-rule'
import {
    archiveCard,
    CardLifecycleError,
    clearVerification,
    deleteDraft,
    markVerified,
    publishCard,
    unarchiveCard,
} from './card-lifecycle'
import { getCard, saveCard } from './cards'
import { listCategories, type Category } from './categories'
import { requireRole } from './guard'
import { supabaseService } from './supabase'

/**
 * The categories a card can be put in: the active ones, plus the card's own if it was
 * archived since (so it stays selectable on that card).
 */
export async function editorCategories(card?: Card | null): Promise<Category[]> {
    const categories = await listCategories(supabaseService(), { includeArchived: true })
    return categories.filter((category) => !category.archived || category.id === card?.categoryId)
}

/**
 * Validates the posted editor form and saves the card as the signed-in admin. Returns the
 * card's id, or a 400 `fail` with the errors per field and the values as posted, which the
 * action returns as it is:
 *
 *     const saved = await saveCardAction(event, card)
 *     if (typeof saved !== 'string') return saved
 */
export async function saveCardAction(event: RequestEvent, card?: Card | null) {
    const { user } = await requireRole(event, 'editor')
    const form = await event.request.formData()
    const parsed = parseCardForm(form)

    const errors: CardFormErrors = parsed.ok ? {} : { ...parsed.errors }
    if (parsed.ok && card?.status === 'published') {
        // A published card is dealt in new games: an edit may not take it below the rule.
        const blockers = publishBlockers(parsed.card)
        if (blockers.length > 0) errors.year = `${blockers.join(' ')} (The card is published.)`
    }
    if (parsed.ok) {
        const categories = await editorCategories(card)
        if (!categories.some((category) => category.id === parsed.card.categoryId)) {
            errors.category_id = 'Pick a category.'
        }
    }
    if (!parsed.ok || Object.keys(errors).length > 0) {
        return fail(400, { errors, values: readCardFormValues(form) })
    }

    return saveCard(supabaseService(), user.id, parsed.card, card?.id)
}

/** The card the route is about, or a 404. */
export async function loadCard(id: string): Promise<Card> {
    const card = await getCard(supabaseService(), id)
    if (!card) error(404, 'No such card.')
    return card
}

/** Who verified the card's date, as an email to show; null when unverified or unknown. */
export async function verifierEmail(card: Card): Promise<string | null> {
    if (!card.verifiedBy) return null
    const { data } = await supabaseService().auth.admin.getUserById(card.verifiedBy)
    return data.user?.email ?? null
}

type LifecycleStep = (
    db: ReturnType<typeof supabaseService>,
    actorId: string,
    id: string,
) => Promise<void>

/**
 * Runs one sidebar step on the route's card as the signed-in admin. A refusal comes back as a
 * `fail` with `lifecycleError` (the sentence to show); `checkRule` explains a publish the rule
 * blocks before asking the database, which checks it again.
 */
async function lifecycleStep(
    event: RequestEvent,
    run: LifecycleStep,
    { role = 'editor', checkRule = false }: { role?: 'editor' | 'admin'; checkRule?: boolean } = {},
) {
    const { user } = await requireRole(event, role)
    const card = await loadCard(event.params.id ?? '')
    if (checkRule) {
        const blockers = publishBlockers(card)
        if (blockers.length > 0) return fail(400, { lifecycleError: blockers.join(' ') })
    }
    try {
        await run(supabaseService(), user.id, card.id)
    } catch (caught) {
        if (!(caught instanceof CardLifecycleError)) throw caught
        return fail(caught.code === 'not_admin' ? 403 : 400, { lifecycleError: caught.message })
    }
    return null
}

/**
 * The sidebar's form actions for /admin/cards/[id], to spread into the route's `actions`.
 * Delete draft is admin-only (403 for an editor) and goes back to the card list.
 */
export const cardLifecycleActions = {
    publish: (event: RequestEvent) => lifecycleStep(event, publishCard, { checkRule: true }),
    archive: (event: RequestEvent) => lifecycleStep(event, archiveCard),
    unarchive: (event: RequestEvent) => lifecycleStep(event, unarchiveCard, { checkRule: true }),
    verify: (event: RequestEvent) => lifecycleStep(event, markVerified),
    unverify: (event: RequestEvent) => lifecycleStep(event, clearVerification),
    deleteDraft: async (event: RequestEvent) => {
        const failed = await lifecycleStep(event, deleteDraft, { role: 'admin' })
        if (failed) return failed
        redirect(303, '/admin/cards')
    },
}
