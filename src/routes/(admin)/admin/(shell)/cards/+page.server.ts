import { listCards } from '#lib/server/cards.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { PageServerLoad } from './$types'

const pageSize = 50

export const load: PageServerLoad = async ({ url }) => {
    const page = Math.max(1, Math.floor(Number(url.searchParams.get('page')) || 1))
    const { cards, total } = await listCards(supabaseService(), { page, pageSize })
    return { cards, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
}
