import { parseCardListView } from '#lib/cards/card-list.js'
import { listCards } from '#lib/server/cards.js'
import { listCategories } from '#lib/server/categories.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { PageServerLoad } from './$types'

const pageSize = 50

export const load: PageServerLoad = async ({ url }) => {
    const db = supabaseService()
    const view = parseCardListView(url.searchParams)
    const [{ cards, total }, categories] = await Promise.all([
        listCards(db, { ...view, pageSize }),
        listCategories(db, { includeArchived: true }),
    ])
    return {
        view,
        cards,
        total,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
        categories: categories.map(({ id, name, archived }) => ({ id, name, archived })),
    }
}
