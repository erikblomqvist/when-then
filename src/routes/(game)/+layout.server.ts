import { findMySeat } from '#lib/server/game-lifecycle.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { LayoutServerLoad } from './$types'

// Find my seat, for every game page: the home page offers "Back to game", and the layout holds
// back the install prompt while the phone has a seat. Only the code reaches the phone.
export const load: LayoutServerLoad = async ({ locals }) => {
    const { user } = await locals.safeGetSession()
    const seat = user && (await findMySeat(supabaseService(), user.id))
    return { seat: seat ? { code: seat.code } : null }
}
