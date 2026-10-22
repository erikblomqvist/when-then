// Categories as the admin reads and manages them (#44), over the SQL functions in
// `supabase/migrations/20261023004400_manage_categories.sql`. Those check the actor is an
// admin and name it for the audit log; this module passes the actor along and turns their
// refusals into errors the categories page can show.

import type { PostgrestError } from '@supabase/supabase-js'
import type { CardLocale } from '../cards/card'
import { englishNameKey, type CategoryInput } from '../categories/category-form'
import {
    isCategoryColour,
    isCategoryIcon,
    type CategoryColour,
    type CategoryIconName,
} from '../categories/look'
import type { Db } from './supabase'

export type Category = {
    id: string
    /** Order in the category draw, which numbers the active categories 1..n by it. */
    position: number
    /** Lucide icon name from the curated set. */
    icon: CategoryIconName
    /** Palette colour token. */
    colour: CategoryColour
    /** English name (English is canonical); empty only if a category lacks one. */
    name: string
    names: Partial<Record<CardLocale, string>>
    archived: boolean
    /** Cards in the category, whatever their status. Only an empty category can be deleted. */
    cardCount: number
}

export type { CategoryInput }

/** Why the database refused a category change, in words for the categories page. */
export class CategoryError extends Error {}

const refusals: Record<string, string> = {
    not_admin: 'Only admins can manage categories.',
    english_name_required: 'A category needs an English name.',
    category_has_cards: 'This category has cards, so it can only be archived, not deleted.',
    no_category: 'That category no longer exists.',
}

function check(error: PostgrestError | null) {
    if (!error) return
    const refusal = refusals[error.message]
    if (refusal) throw new CategoryError(refusal, { cause: error })
    if (error.code === '23505' && error.message.includes('category_translations_en_name_key')) {
        throw new CategoryError('Another category already has that English name.', {
            cause: error,
        })
    }
    throw new Error(error.message, { cause: error })
}

type NameRow = { locale: CardLocale; name: string }

export const namesByLocale = (rows: NameRow[]) =>
    Object.fromEntries(rows.map((row) => [row.locale, row.name])) as Partial<
        Record<CardLocale, string>
    >

// Saving checks the look, so stored values are always in the sets; the fallbacks only keep
// the types honest.
const iconOf = (icon: string): CategoryIconName => (isCategoryIcon(icon) ? icon : 'flag')
const colourOf = (colour: string): CategoryColour => (isCategoryColour(colour) ? colour : 'blue')

/** Categories in draw order. Archived ones only with `includeArchived` (cards keep them). */
export async function listCategories(
    db: Db,
    { includeArchived = false } = {},
): Promise<Category[]> {
    let query = db
        .from('categories')
        .select(
            'id, position, icon, colour, archived_at, category_translations(locale, name), cards(count)',
        )
        .order('position')
    if (!includeArchived) query = query.is('archived_at', null)
    const { data, error } = await query
    if (error) throw new Error(error.message, { cause: error })
    return data.map((row) => {
        const names = namesByLocale(row.category_translations)
        return {
            id: row.id,
            position: row.position,
            icon: iconOf(row.icon),
            colour: colourOf(row.colour),
            name: names.en ?? '',
            names,
            archived: row.archived_at !== null,
            cardCount: row.cards[0]?.count ?? 0,
        }
    })
}

export { englishNameKey }

/**
 * Categories keyed by `englishNameKey` of their English name, for matching imported rows
 * (#48). English names are unique (ignoring case), so each key has one category.
 */
export async function categoriesByEnglishName(
    db: Db,
    { includeArchived = false } = {},
): Promise<Map<string, Category>> {
    const categories = await listCategories(db, { includeArchived })
    return new Map(categories.map((category) => [englishNameKey(category.name), category]))
}

/** Creates a category (last in the draw), or edits one when `id` is given. Returns its id. */
export async function saveCategory(
    db: Db,
    actor: string,
    input: CategoryInput,
    id?: string,
): Promise<string> {
    if (!isCategoryIcon(input.icon) || !isCategoryColour(input.colour)) {
        throw new CategoryError('Pick an icon and a colour from the lists.')
    }
    const { data, error } = await db.rpc('save_category', {
        actor,
        category: { icon: input.icon, colour: input.colour },
        names: input.names,
        category_id: id,
    })
    check(error)
    return data as string
}

/** Puts these categories in this order, among the positions they hold between them. */
export async function reorderCategories(db: Db, actor: string, ids: string[]): Promise<void> {
    const { error } = await db.rpc('reorder_categories', { actor, ids })
    check(error)
}

/** Archives (out of the category draw, cards stay attached) or unarchives a category. */
export async function setCategoryArchived(
    db: Db,
    actor: string,
    id: string,
    archived: boolean,
): Promise<void> {
    const { error } = await db.rpc('set_category_archived', { actor, category_id: id, archived })
    check(error)
}

/** Deletes a category without cards; one with cards is refused with a `CategoryError`. */
export async function deleteCategory(db: Db, actor: string, id: string): Promise<void> {
    const { error } = await db.rpc('delete_category', { actor, category_id: id })
    check(error)
}
