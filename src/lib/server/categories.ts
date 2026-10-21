// Categories as the admin reads them. Category management (reorder, rename, archive) extends
// this module.

import type { CardLocale } from '../cards/card'
import type { Db } from './supabase'

export type Category = {
    id: string
    /** Draw number: categories are numbered 1..n by position. */
    position: number
    /** Lucide icon name from the curated set. */
    icon: string
    /** Palette colour token. */
    colour: string
    /** English name (English is canonical); empty only if a category lacks one. */
    name: string
    names: Partial<Record<CardLocale, string>>
    archived: boolean
}

type NameRow = { locale: CardLocale; name: string }

export const namesByLocale = (rows: NameRow[]) =>
    Object.fromEntries(rows.map((row) => [row.locale, row.name])) as Partial<
        Record<CardLocale, string>
    >

/** Categories in draw order. Archived ones only with `includeArchived` (cards keep them). */
export async function listCategories(
    db: Db,
    { includeArchived = false } = {},
): Promise<Category[]> {
    let query = db
        .from('categories')
        .select('id, position, icon, colour, archived_at, category_translations(locale, name)')
        .order('position')
    if (!includeArchived) query = query.is('archived_at', null)
    const { data, error } = await query
    if (error) throw new Error(error.message, { cause: error })
    return data.map((row) => {
        const names = namesByLocale(row.category_translations)
        return {
            id: row.id,
            position: row.position,
            icon: row.icon,
            colour: row.colour,
            name: names.en ?? '',
            names,
            archived: row.archived_at !== null,
        }
    })
}
