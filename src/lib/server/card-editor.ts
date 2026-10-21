// The card editor's server side, shared by /admin/cards/new and /admin/cards/[id]: what the
// editor loads next to a card, and the save action. Status actions (publish, archive, delete
// draft) and translation saves add their own actions next to `saveCardAction`.

import { fail, type RequestEvent } from '@sveltejs/kit'
import type { Card } from '../cards/card'
import { parseCardForm, readCardFormValues, type CardFormErrors } from '../cards/card-form'
import { saveCard } from './cards'
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
