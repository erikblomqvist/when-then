import { adminHome } from '#lib/server/admin-home.js'
import { requireRole } from '#lib/server/guard.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
    const { role } = await requireRole(event, 'editor')
    return { home: await adminHome(supabaseService(), role) }
}
