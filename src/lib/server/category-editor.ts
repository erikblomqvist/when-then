// The categories pages' server side (#44): admin only, the actor for the audit log, and the
// database's refusals as messages.

import { fail, type RequestEvent } from '@sveltejs/kit'
import {
    parseCategoryForm,
    type CategoryFormErrors,
    type CategoryFormValues,
} from '../categories/category-form'
import type { Category } from './categories'
import { CategoryError, saveCategory } from './categories'
import { requireRole } from './guard'
import { supabaseService } from './supabase'

export const categoryFormValues = (category: Category): CategoryFormValues => ({
    icon: category.icon,
    colour: category.colour,
    name_en: category.names.en ?? '',
    name_sv: category.names.sv ?? '',
    name_nb: category.names.nb ?? '',
})

const englishNameRefusals = new Set(['english_name_required', 'category_translations_en_name_key'])

/**
 * Runs an admin's category change with their id as the actor; a `CategoryError` from the
 * database becomes a 409 with its message (and `values`, to show the form again).
 */
export async function asAdmin<T>(
    event: RequestEvent,
    run: (actor: string) => Promise<T>,
    values?: CategoryFormValues,
) {
    const { user } = await requireRole(event, 'admin')
    try {
        return await run(user.id)
    } catch (error) {
        if (error instanceof CategoryError) {
            // A refusal of the English name goes on that field, so the form keeps showing it
            // until the name changes (#52).
            if (englishNameRefusals.has(error.code)) {
                const errors: CategoryFormErrors = { name_en: error.message }
                return fail(409, { error: undefined, errors, values })
            }
            const errors: CategoryFormErrors = {}
            return fail(409, { error: error.message, errors, values })
        }
        throw error
    }
}

/** The save action of the new and edit pages: the saved category's id, or a failure to show. */
export async function saveCategoryAction(event: RequestEvent, id?: string) {
    await requireRole(event, 'admin')
    const parsed = parseCategoryForm(await event.request.formData())
    if ('errors' in parsed) {
        return fail(400, { error: undefined, errors: parsed.errors, values: parsed.values })
    }
    const values = {
        icon: parsed.input.icon,
        colour: parsed.input.colour,
        name_en: parsed.input.names.en,
        name_sv: parsed.input.names.sv ?? '',
        name_nb: parsed.input.names.nb ?? '',
    }
    return asAdmin(
        event,
        (actor) => saveCategory(supabaseService(), actor, parsed.input, id),
        values,
    )
}

/**
 * The card editor's "New category" (#52), on /admin/cards/new and /admin/cards/[id]: the new
 * category's id, so the editor can pick it. A failure comes back under `category`, apart from
 * the card form's own errors.
 */
export async function createCategoryAction(event: RequestEvent) {
    const saved = await saveCategoryAction(event)
    if (typeof saved !== 'string') return fail(saved.status, { category: saved.data })
    return { createdCategory: saved }
}
