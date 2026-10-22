import { parseCardListView } from '#lib/cards/card-list.js'
import { translationLocales, type TranslationLocale } from '#lib/cards/translation.js'
import { countMatchingCards, listCards } from '#lib/server/cards.js'
import { listCategories } from '#lib/server/categories.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { PageServerLoad } from './$types'

const pageSize = 50

export const load: PageServerLoad = async ({ url }) => {
    const db = supabaseService()
    const view = parseCardListView(url.searchParams)
    const [{ cards, total }, categories, ...queueSizes] = await Promise.all([
        listCards(db, { ...view, pageSize }),
        listCategories(db, { includeArchived: true }),
        // The review queues (saved filters): how many cards each holds.
        ...translationLocales.map((locale) =>
            countMatchingCards(db, { translations: { [locale]: 'needs-review' } }),
        ),
    ])
    return {
        view,
        cards,
        total,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
        reviewQueues: Object.fromEntries(
            translationLocales.map((locale, index) => [locale, queueSizes[index]]),
        ) as Record<TranslationLocale, number>,
        categories: categories.map(({ id, name, archived }) => ({ id, name, archived })),
    }
}
