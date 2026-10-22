import { error } from '@sveltejs/kit'
import { refusalMessage } from '#lib/game/refusals.js'
import { GameRefusal, getLobby } from '#lib/server/game-lifecycle.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { PageServerLoad } from './$types'

// The lobby of a game, for players seated in it. Reloading lands here again.
export const load: PageServerLoad = async ({ params, locals, url }) => {
    const { user } = await locals.safeGetSession()
    if (!user) error(403, refusalMessage('no_seat'))

    try {
        const lobby = await getLobby(supabaseService(), user.id, params.code)
        return { lobby, joinUrl: new URL(`/join/${lobby.code}`, url.origin).href }
    } catch (caught) {
        if (caught instanceof GameRefusal) {
            error(caught.code === 'not_found' ? 404 : 403, refusalMessage(caught.code))
        }
        throw caught
    }
}
