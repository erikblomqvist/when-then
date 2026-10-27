// Categories as the admin reads and manages them (#44), over the SQL functions in
// `supabase/migrations/20261023004400_manage_categories.sql`. Those check the actor is an
// admin and name it for the audit log; this module passes the actor along and turns their
// refusals into errors the categories page can show. `categoryLooks` is how a game shows them.

import type { CardLocale } from '../cards/card'
import { englishNameKey, type CategoryInput } from '../categories/category-form'
import {
    isCategoryColour,
    isCategoryIcon,
    type CategoryColour,
    type CategoryIconName,
    type CategoryLook,
} from '../categories/look'
import { checkRpc, RpcRefusal, type Refusals } from './rpc-refusal'
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
export class CategoryError extends RpcRefusal {}

const refusals: Refusals = {
    not_admin: 'Only admins can manage categories.',
    english_name_required: 'A category needs an English name.',
    category_has_cards: 'This category has cards, so it can only be archived, not deleted.',
    no_category: 'That category no longer exists.',
    category_translations_en_name_key: 'Another category already has that English name.',
}

const check = (error: Parameters<typeof checkRpc>[0]) => checkRpc(error, refusals, CategoryError)

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
 * How the game shows each category in `ids`, archived ones too, named in `locale` (English
 * when it has no name there), keyed by id.
 */
export async function categoryLooks(
    db: Db,
    ids: readonly string[],
    locale: CardLocale,
): Promise<Record<string, CategoryLook>> {
    const wanted = [...new Set(ids)]
    if (wanted.length === 0) return {}
    const { data, error } = await db
        .from('categories')
        .select('id, icon, colour, category_translations(locale, name)')
        .in('id', wanted)
    if (error) throw new Error(error.message, { cause: error })
    return Object.fromEntries(
        data.map((row) => {
            const names = namesByLocale(row.category_translations)
            const look = {
                name: names[locale] ?? names.en ?? '',
                icon: iconOf(row.icon),
                colour: colourOf(row.colour),
            }
            return [row.id, look]
        }),
    )
}

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
        throw new CategoryError('invalid_look', 'Pick an icon and a colour from the lists.')
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
